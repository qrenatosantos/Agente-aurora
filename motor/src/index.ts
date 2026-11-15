/**
 * MOTOR DO AGENTE (Cloudflare Worker).
 *
 * Rotas (fase 1):
 *  POST /interno/turno   { conversa, ...EntradaConversa } → ResultadoTurno   (simulador do painel e bateria)
 *  POST /interno/apagar  { conversa }                     → apaga a conversa
 *  POST /interno/ler     { conversa }                     → estado e histórico
 * Todas exigem "Authorization: Bearer <SEGREDO_INTERNO>".
 *
 * De propósito NÃO usa routeAgentRequest: as conversas não ficam abertas para a internet
 * (nada de WebSocket público). Só as rotas acima falam com elas.
 */
import { getAgentByName } from "agents";
import { Conversa, type EntradaConversa } from "./conversa.ts";
import type { Env } from "./env.ts";

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Motor do agente: ok");
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
