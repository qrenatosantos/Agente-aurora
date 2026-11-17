/**
 * VIGIA DO AGENTE (Cloudflare Worker, só com horários; sem página na internet além de "/").
 *
 *  - A cada 5 minutos (teste: 30): TESTE DE SAÚDE. Painel e motor no ar? Banco, OpenAI, WhatsApp e CRM respondendo
 *    (o motor confere estes pela ligação interna "Saude", com as chaves do painel)?
 *  - Toda segunda, 03h17 de Brasília: CÓPIA do banco D1 no R2 (aurora-copias), guardada por 90 dias.
 *
 * Problema encontrado = console.error("[alerta] ..."). A Cloudflare transforma isso num "Issue" e a regra de aviso
 * (Notificações ▸ "Agente: erro nos programas") manda e-mail ao Renato. Roteiro: docs/OPERACAO.md.
 *
 * Rotas com Authorization: Bearer <VIGIA_SEGREDO> (para conferir à mão; o segredo é só da Cloudflare):
 *  POST /saude          roda o teste de saúde agora
 *  POST /copiar         faz a cópia agora
 *  POST /provocar-erro  gera um alerta de propósito (para ver o e-mail chegar)
 */
import { type ResumoCopia, gerarCopia, nomeDaCopia } from "./copia.ts";
import { type Achado, avaliarSaude } from "./saude.ts";
import type { Banco } from "../../painel/lib/banco/base.ts";

type ItemSaude = { item: string; ok: boolean; detalhe: string; exigivel?: boolean };

export type Env = {
  DB: Banco;
  COPIAS?: R2Bucket;
  MOTOR: Fetcher & { conferir(): Promise<ItemSaude[]> };
  NOME_BANCO: string;
  PAINEL_URL: string;
  MOTOR_URL: string;
  /** Itens que PRECISAM estar configurados (produção: todos). No teste, só o que existe é conferido. */
  EXIGIR: string;
  VIGIA_SEGREDO?: string;
};

async function noAr(nome: string, url: string): Promise<ItemSaude> {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    return { item: nome, ok: r.status < 500, detalhe: `HTTP ${r.status}` };
  } catch (e) {
    return { item: nome, ok: false, detalhe: `não respondeu (${e instanceof Error ? e.message : String(e)})` };
  }
}

export async function saude(env: Env): Promise<Achado[]> {
  const [painel, motor, internos] = await Promise.all([
    noAr("painel", env.PAINEL_URL),
    noAr("motor", env.MOTOR_URL),
    env.MOTOR.conferir().catch((e: unknown) => [{ item: "motor (ligação interna)", ok: false, detalhe: e instanceof Error ? e.message : String(e) }]),
  ]);
  const achados = avaliarSaude([painel, motor, ...internos], env.EXIGIR.split(",").map((s) => s.trim()).filter(Boolean));
  for (const a of achados) {
    if (a.alerta) console.error(`[alerta] ${a.item}: ${a.detalhe}`);
    else console.log(`[saude] ${a.item}: ${a.detalhe}`);
  }
  return achados;
}

export async function copiar(env: Env, quando = new Date()): Promise<ResumoCopia & { arquivo: string }> {
  if (!env.COPIAS) throw new Error("sem o R2 (COPIAS) ligado ao vigia");
  const copia = await gerarCopia(env.DB, quando);
  const arquivo = nomeDaCopia(env.NOME_BANCO, quando);
  await env.COPIAS.put(arquivo, copia.sql, { httpMetadata: { contentType: "application/sql; charset=utf-8" }, customMetadata: { tabelas: JSON.stringify(copia.tabelas) } });
  console.log(`[copia] ${arquivo}: ${(copia.sql.length / 1024).toFixed(0)} KB, ${JSON.stringify(copia.tabelas)}`);
  return { ...copia, arquivo };
}

async function autorizado(req: Request, env: Env) {
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.VIGIA_SEGREDO || env.VIGIA_SEGREDO.length < 16) return false;
  const [a, b] = await Promise.all([recebido, env.VIGIA_SEGREDO].map(async (t) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))));
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async scheduled(evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (evento.cron.startsWith("17 ")) {
      ctx.waitUntil(
        copiar(env).catch((e: unknown) => {
          console.error(`[alerta] cópia semanal do banco falhou: ${e instanceof Error ? e.message : String(e)}`);
        }),
      );
    } else ctx.waitUntil(saude(env).then(() => undefined));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Vigia do agente: ok");
    if (req.method !== "POST") return new Response("Não encontrado", { status: 404 });
    if (!(await autorizado(req, env))) return new Response("Não autorizado", { status: 401 });
    switch (url.pathname) {
      case "/saude":
        return Response.json(await saude(env));
      case "/copiar": {
        const c = await copiar(env);
        return Response.json({ arquivo: c.arquivo, kb: Math.round(c.sql.length / 1024), tabelas: c.tabelas });
      }
      case "/provocar-erro":
        console.error("[alerta] teste de alerta: erro provocado de propósito pelo Renato/Claude (pode ignorar)");
        return Response.json({ ok: true, aviso: "Erro registrado. O e-mail da Cloudflare chega em alguns minutos." });
      default:
        return new Response("Não encontrado", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
