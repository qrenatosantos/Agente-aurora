/**
 * MOTOR DO AGENTE (Cloudflare Worker).
 *
 * Rotas do WhatsApp (Meta), públicas mas conferidas:
 *  GET  /whatsapp/webhook   verificação da Meta (hub.verify_token = o token gerado no painel)
 *  POST /whatsapp/webhook   mensagens recebidas; só aceita com a assinatura X-Hub-Signature-256 certa
 *
 * Avisos do CRM (públicos mas conferidos):
 *  POST /crm/avisos         só aceita com X-Aurora-Assinatura certa (segredo dos avisos, cadastrado no painel);
 *                           guarda o aviso (sem duplicar) e responde 200 na hora. O processamento vem depois.
 *
 * Rotas internas:
 *  POST /interno/turno   { conversa, ...EntradaConversa } → ResultadoTurno   (simulador do painel e bateria)
 *  POST /interno/apagar  { conversa }                     → apaga a conversa
 *  POST /interno/ler     { conversa }                     → estado e histórico
 * Todas exigem "Authorization: Bearer <SEGREDO_INTERNO>".
 *
 * De propósito NÃO usa routeAgentRequest: as conversas não ficam abertas para a internet
 * (nada de WebSocket público). Só as rotas acima falam com elas.
 */
import { getAgentByName } from "agents";
import { conversaDoNegocioInterno, guardarAvisoInterno, marcarAvisoProcessadoInterno } from "../../painel/lib/banco/avisos.ts";
import { ClienteCrm, variantesTelefone } from "../../painel/lib/nucleo/crm.ts";
import { carregarAmbiente } from "./ambiente.ts";
import { segredoDosAvisos, segredosDoWebhook } from "./ambiente.ts";
import { avisoVerdadeiro } from "./crm-avisos.ts";
import { Conversa, type EntradaConversa } from "./conversa.ts";
import type { Env } from "./env.ts";
import { assinaturaValida, lerMensagens } from "./whatsapp.ts";

export { Conversa };

async function autorizado(req: Request, env: Env) {
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.SEGREDO_INTERNO || env.SEGREDO_INTERNO.length < 16) return false;
  const [a, b] = await Promise.all(
    [recebido, env.SEGREDO_INTERNO].map(async (t) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))),
  );
  return crypto.subtle.timingSafeEqual(a, b);
}

const nomeValido = (n: unknown): n is string => typeof n === "string" && /^[a-z0-9:_-]{3,80}$/i.test(n);

/** Avisos da Meta. Responde rápido (a Meta reenvia se demorar); a resposta ao cliente sai depois, pela conversa. */
async function webhookWhatsApp(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const s = await segredosDoWebhook(env);
  if (req.method === "GET") {
    const token = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && s.verifyToken && token.length >= 16 && (await iguaisSeguro(token, s.verifyToken))) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Token de verificação inválido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const corpo = await req.text();
  if (!(await assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), s.appSecret))) return new Response("Assinatura inválida", { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return new Response("ok"); // nada a fazer
  }
  const mensagens = lerMensagens(json).filter((m) => m.phoneNumberId === s.phoneNumberId && /^\d{8,15}$/.test(m.de));
  await Promise.all(mensagens.map(async (m) => (await getAgentByName(env.Conversa, `wa-${m.de}`)).receberWhatsApp(m)));
  return new Response("ok");
}

/** Acha a conversa do WhatsApp de um pedido: pela ligação guardada ou, se não houver, pelo telefone do contato no CRM. */
async function conversaDoPedido(env: Env, negocioId: string) {
  const ligada = await conversaDoNegocioInterno(env.DB, negocioId);
  if (ligada) return getAgentByName(env.Conversa, ligada.conversa);
  const amb = await carregarAmbiente(env);
  if (!amb.crm) return null;
  const n = await new ClienteCrm(amb.crm.endereco, amb.crm.chave).get<{ contato?: { telefone?: string | null } }>(`/negocios/${negocioId}`);
  const tel = n.dados?.contato?.telefone;
  if (!tel) return null;
  for (const v of variantesTelefone(tel)) {
    const c = await getAgentByName(env.Conversa, `wa-55${v}`);
    const lido = (await c.ler()) as unknown as { estado: { negocio_id: string | null } };
    if (lido.estado.negocio_id === negocioId) return c;
  }
  return null;
}

/** O que a Cecília faz com cada aviso. (Por enquanto: proposta aprovada → link para o cliente.) */
async function processarAviso(env: Env, aviso: { id: number; tipo: string; negocio_id?: string | null; proposta_id?: string | null }) {
  let resultado = "guardado";
  try {
    if (aviso.tipo === "proposta.aprovada" && aviso.negocio_id && aviso.proposta_id) {
      const c = await conversaDoPedido(env, aviso.negocio_id);
      resultado = c ? await c.enviarPropostaAprovada({ propostaId: aviso.proposta_id, negocioId: aviso.negocio_id }) : "pedido sem conversa no WhatsApp";
    }
  } catch (e) {
    resultado = `erro: ${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`[aviso ${aviso.id} ${aviso.tipo}] ${resultado}`);
  await marcarAvisoProcessadoInterno(env.DB, aviso.id, resultado);
}

/** Avisos do CRM: confere a assinatura, guarda e responde rápido (o CRM espera até 8 s); o trabalho segue depois. */
async function avisoDoCrm(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const corpo = await req.text();
  if (!(await avisoVerdadeiro(corpo, req.headers.get("x-aurora-assinatura"), await segredoDosAvisos(env)))) return new Response("Assinatura inválida", { status: 401 });
  let aviso: { id?: unknown; tipo?: unknown };
  try {
    aviso = JSON.parse(corpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  if (!Number.isInteger(aviso.id) || typeof aviso.tipo !== "string") return new Response("Aviso sem id ou tipo", { status: 400 });
  const novo = await guardarAvisoInterno(env.DB, aviso as Parameters<typeof guardarAvisoInterno>[1]);
  if (novo) ctx.waitUntil(processarAviso(env, aviso as Parameters<typeof processarAviso>[1]));
  return new Response("ok");
}

async function iguaisSeguro(a: string, b: string) {
  const [x, y] = await Promise.all([a, b].map(async (t) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))));
  return crypto.subtle.timingSafeEqual(x, y);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Motor do agente: ok");
    if (url.pathname === "/whatsapp/webhook") return webhookWhatsApp(req, env);
    if (url.pathname === "/crm/avisos") return avisoDoCrm(req, env, ctx);
    if (!url.pathname.startsWith("/interno/")) return new Response("Não encontrado", { status: 404 });
    if (req.method !== "POST") return new Response("Use POST", { status: 405 });
    if (!(await autorizado(req, env))) return new Response("Não autorizado", { status: 401 });

    const corpo = (await req.json().catch(() => null)) as ({ conversa?: unknown } & Partial<EntradaConversa>) | null;
    if (!corpo || !nomeValido(corpo.conversa)) return Response.json({ erro: "Informe a conversa." }, { status: 400 });
    const conversa = await getAgentByName(env.Conversa, corpo.conversa);

    switch (url.pathname) {
      case "/interno/turno": {
        const { conversa: _, ...entrada } = corpo;
        if (!Array.isArray(entrada.novas) || !entrada.cfg || !entrada.crm || !entrada.chaveIA) return Response.json({ erro: "Dados do turno incompletos." }, { status: 400 });
        return Response.json(await conversa.turno(entrada as EntradaConversa));
      }
      case "/interno/apagar":
        await conversa.apagarTudo();
        return Response.json({ ok: true });
      case "/interno/ler":
        return Response.json(await conversa.ler());
      default:
        return new Response("Não encontrado", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
