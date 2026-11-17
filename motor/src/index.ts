/**
 * MOTOR DO AGENTE (Cloudflare Worker).
 *
 * MULTI-CLIENTE: um motor só para todos os clientes. O cliente de cada mensagem é descoberto pelo NÚMERO do WhatsApp
 * que a recebeu (phone_number_id, cadastrado no painel de cada cliente); a conversa leva o cliente no nome
 * ("<cliente>:wa-<telefone>"; o cliente convertido da instalação antiga mantém "wa-<telefone>").
 *
 * Rotas do WhatsApp (Meta), públicas mas conferidas:
 *  GET  /whatsapp/webhook   verificação da Meta (hub.verify_token = o token gerado no painel de algum cliente)
 *  POST /whatsapp/webhook   mensagens recebidas; cada mensagem só é aceita se a assinatura X-Hub-Signature-256 bater
 *                           com o app secret DO CLIENTE dono do número que a recebeu
 *
 * Avisos do CRM (públicos mas conferidos):
 *  POST /crm/avisos/<cliente>  só aceita com X-Aurora-Assinatura certa (segredo dos avisos daquele cliente);
 *  POST /crm/avisos            sem o cliente no endereço: vale o cliente cujo segredo confere a assinatura.
 *                              Guarda o aviso (sem duplicar) e responde 200 na hora. O processamento vem depois.
 *
 * Rotas internas:
 *  POST /interno/turno   { conversa, ...EntradaConversa } → ResultadoTurno   (simulador do painel e bateria)
 *  POST /interno/apagar  { conversa }                     → apaga a conversa
 *  POST /interno/ler     { conversa }                     → estado e histórico
 *  POST /interno/aviso   { conversa: "avisos", cliente, id } → processa de novo um aviso do CRM já guardado
 * Todas exigem "Authorization: Bearer <SEGREDO_INTERNO>".
 *
 * De propósito NÃO usa routeAgentRequest: as conversas não ficam abertas para a internet
 * (nada de WebSocket público). Só as rotas acima falam com elas.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { conversaDoNegocioInterno, guardarAvisoInterno, lerAvisoInterno, marcarAvisoProcessadoInterno } from "../../painel/lib/banco/avisos.ts";
import { lerClienteInterno, nomeConversaWhatsApp } from "../../painel/lib/banco/clientes.ts";
import { clienteDoWhatsAppInterno, clientesComSegredoInterno } from "../../painel/lib/banco/integracoes.ts";
import { ClienteCrm, variantesTelefone } from "../../painel/lib/nucleo/crm.ts";
import { carregarAmbiente } from "./ambiente.ts";
import { segredoDosAvisos, segredosDoWebhook, tokenDeVerificacao } from "./ambiente.ts";
import { avisoVerdadeiro } from "./crm-avisos.ts";
import { Conversa, type EntradaConversa } from "./conversa.ts";
import type { Env } from "./env.ts";
import { conferirSaude, type ItemSaude } from "./saude.ts";
import { assinaturaValida, lerMensagens } from "./whatsapp.ts";

export { Conversa };

/** Teste de saúde (saude.ts). Ligação interna com entrypoint "Saude": só o vigia alcança; não tem endereço na internet. */
export class Saude extends WorkerEntrypoint<Env> {
  async conferir(): Promise<ItemSaude[]> {
    return conferirSaude(this.env);
  }
}

async function autorizado(req: Request, env: Env) {
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.SEGREDO_INTERNO || env.SEGREDO_INTERNO.length < 16) return false;
  const [a, b] = await Promise.all(
    [recebido, env.SEGREDO_INTERNO].map(async (t) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))),
  );
  return crypto.subtle.timingSafeEqual(a, b);
}

const nomeValido = (n: unknown): n is string => typeof n === "string" && /^[a-z0-9:_-]{3,80}$/i.test(n);

/**
 * Avisos da Meta. Responde rápido (a Meta reenvia se demorar); a resposta ao cliente sai depois, pela conversa.
 * O corpo é lido ANTES da assinatura só para saber de qual número (e portanto de qual cliente) é cada mensagem;
 * nada é processado sem a assinatura conferir com o app secret desse cliente.
 */
async function webhookWhatsApp(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const token = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && token.length >= 16) {
      for (const cliente of await clientesComSegredoInterno(env.DB, "whatsapp_verify_token")) {
        const certo = await tokenDeVerificacao(env, cliente);
        if (certo && (await iguaisSeguro(token, certo))) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
      }
    }
    return new Response("Token de verificação inválido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const corpo = await req.text();
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return new Response("Assinatura inválida", { status: 401 }); // corpo que nem é JSON: não veio da Meta
  }
  const todas = lerMensagens(json).filter((m) => /^\d{8,15}$/.test(m.de));
  const porNumero = new Map<string, typeof todas>();
  for (const m of todas) porNumero.set(m.phoneNumberId, [...(porNumero.get(m.phoneNumberId) ?? []), m]);
  let recusado = false;
  for (const [numero, mensagens] of porNumero) {
    const cliente = await clienteDoWhatsAppInterno(env.DB, numero);
    if (!cliente) {
      console.warn(`[whatsapp] mensagem para um número sem cliente (${numero.slice(0, 4)}…): ignorada`);
      continue;
    }
    const s = await segredosDoWebhook(env, cliente);
    if (!(await assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), s.appSecret))) {
      recusado = true;
      continue;
    }
    const dono = { id: cliente, conversas_sem_prefixo: s.conversasSemPrefixo };
    await Promise.all(mensagens.map(async (m) => (await getAgentByName(env.Conversa, nomeConversaWhatsApp(dono, m.de))).receberWhatsApp(m)));
  }
  // Avisos sem mensagem (ex.: "entregue", "lida") e de número sem cliente: aceitos sem efeito (como antes).
  // Mensagem para o número de um cliente com a assinatura errada: recusada.
  if (recusado) return new Response("Assinatura inválida", { status: 401 });
  return new Response("ok");
}

/** Acha a conversa do WhatsApp de um pedido: pela ligação guardada ou, se não houver, pelo telefone do contato no CRM. */
async function conversaDoPedido(env: Env, cliente: string, negocioId: string) {
  const ligada = await conversaDoNegocioInterno(env.DB, cliente, negocioId);
  if (ligada) return getAgentByName(env.Conversa, ligada.conversa);
  const amb = await carregarAmbiente(env, cliente);
  if (!amb.crm) return null;
  const n = await new ClienteCrm(amb.crm.endereco, amb.crm.chave).get<{ contato?: { telefone?: string | null } }>(`/negocios/${negocioId}`);
  const tel = n.dados?.contato?.telefone;
  if (!tel) {
    console.log(`[aviso] pedido ${negocioId.slice(0, 8)}: contato sem telefone no CRM (status ${n.status}, erro ${n.erro?.mensagem ?? "-"}, chaves ${Object.keys((n.dados ?? {}) as object).join(",")}, contato ${JSON.stringify(Object.keys(n.dados?.contato ?? {}))})`);
    return null;
  }
  const c = await lerClienteInterno(env.DB, cliente);
  if (!c) return null;
  for (const v of variantesTelefone(tel)) {
    const conversa = await getAgentByName(env.Conversa, nomeConversaWhatsApp(c, `55${v}`));
    const lido = (await conversa.ler()) as unknown as { estado: { negocio_id: string | null } };
    if (lido.estado.negocio_id === negocioId) return conversa;
  }
  return null;
}

/** O que o agente faz com cada aviso: aprovada → link; aberta → lembrete "o que achou?"; aceita/recusada → cancela lembretes. */
async function processarAviso(env: Env, cliente: string, aviso: { id: number; tipo: string; negocio_id?: string | null; proposta_id?: string | null }) {
  let resultado = "guardado";
  try {
    const tipos = ["proposta.aprovada", "proposta.enviada", "proposta.visualizada", "proposta.aceita", "proposta.recusada"];
    if (tipos.includes(aviso.tipo) && aviso.negocio_id && aviso.proposta_id) {
      const c = await conversaDoPedido(env, cliente, aviso.negocio_id);
      if (!c) resultado = "pedido sem conversa no WhatsApp";
      else if (aviso.tipo === "proposta.aprovada" || aviso.tipo === "proposta.enviada") resultado = await c.enviarPropostaAprovada({ propostaId: aviso.proposta_id, negocioId: aviso.negocio_id });
      else if (aviso.tipo === "proposta.visualizada") resultado = await c.propostaAberta(aviso.proposta_id);
      else resultado = await c.propostaEncerrada(aviso.proposta_id);
    } else if (aviso.tipo === "atendimento.encaminhado_agente" && aviso.negocio_id) {
      const c = await conversaDoPedido(env, cliente, aviso.negocio_id);
      resultado = c ? await c.retomarAtendimento() : "pedido sem conversa no WhatsApp";
    }
  } catch (e) {
    resultado = `erro: ${e instanceof Error ? e.message : String(e)}`;
  }
  console.log(`[aviso ${cliente} ${aviso.id} ${aviso.tipo}] ${resultado}`);
  await marcarAvisoProcessadoInterno(env.DB, cliente, aviso.id, resultado);
  return resultado;
}

/** De qual cliente é o aviso: o do endereço (/crm/avisos/<cliente>) ou, sem ele, o cliente cujo segredo confere a assinatura. */
async function clienteDoAviso(env: Env, caminho: string, corpo: string, assinatura: string | null): Promise<string | null> {
  const doEndereco = /^\/crm\/avisos\/([a-z0-9-]{2,30})$/.exec(caminho)?.[1];
  const candidatos = doEndereco ? [doEndereco] : await clientesComSegredoInterno(env.DB, "crm_segredo_avisos");
  for (const cliente of candidatos) {
    const segredo = await segredoDosAvisos(env, cliente).catch(() => null);
    if (segredo && (await avisoVerdadeiro(corpo, assinatura, segredo))) return cliente;
  }
  return null;
}

/** Avisos do CRM: confere a assinatura, guarda e responde rápido (o CRM espera até 8 s); o trabalho segue depois. */
async function avisoDoCrm(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const corpo = await req.text();
  const cliente = await clienteDoAviso(env, new URL(req.url).pathname, corpo, req.headers.get("x-aurora-assinatura"));
  if (!cliente) return new Response("Assinatura inválida", { status: 401 });
  let aviso: { id?: unknown; tipo?: unknown };
  try {
    aviso = JSON.parse(corpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  if (!Number.isInteger(aviso.id) || typeof aviso.tipo !== "string") return new Response("Aviso sem id ou tipo", { status: 400 });
  const novo = await guardarAvisoInterno(env.DB, cliente, aviso as Parameters<typeof guardarAvisoInterno>[2]);
  if (novo) ctx.waitUntil(processarAviso(env, cliente, aviso as Parameters<typeof processarAviso>[2]));
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
    if (url.pathname === "/crm/avisos" || url.pathname.startsWith("/crm/avisos/")) return avisoDoCrm(req, env, ctx);
    if (!url.pathname.startsWith("/interno/")) return new Response("Não encontrado", { status: 404 });
    if (req.method !== "POST") return new Response("Use POST", { status: 405 });
    if (!(await autorizado(req, env))) return new Response("Não autorizado", { status: 401 });

    const corpo = (await req.json().catch(() => null)) as ({ conversa?: unknown; id?: unknown; cliente?: unknown } & Partial<EntradaConversa>) | null;
    if (url.pathname === "/interno/aviso") {
      const cliente = typeof corpo?.cliente === "string" && /^[a-z0-9-]{2,30}$/.test(corpo.cliente) ? corpo.cliente : null;
      if (!cliente) return Response.json({ erro: "Informe o cliente." }, { status: 400 });
      const a = await lerAvisoInterno(env.DB, cliente, Number(corpo?.id));
      if (!a) return Response.json({ erro: "Aviso não encontrado." }, { status: 404 });
      return Response.json({ resultado: await processarAviso(env, cliente, a) });
    }
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
