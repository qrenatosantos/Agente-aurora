/**
 * TESTE DE SAÚDE do motor (Fase 0 da plataforma).
 *
 * Só o VIGIA chama (vigia/, a cada 5 minutos), por uma ligação interna da Cloudflare ("entrypoint" Saude):
 * não existe endereço na internet para isto. Confere, sem mandar mensagem a ninguém:
 *  - banco D1 (lê a lista de clientes ativos);
 * e, para CADA cliente ativo:
 *  - OpenAI (lista os modelos com a chave do painel: não gasta crédito);
 *  - WhatsApp (lê o número na Meta com o token do painel: token vencido ou número desligado aparecem aqui);
 *  - CRM (uma busca que não acha nada: confere se o CRM está no ar e se a chave vale).
 * Devolve uma lista; quem decide o que é alerta é o vigia.
 */
import { ClienteCrm } from "../../painel/lib/nucleo/crm.ts";
import { carregarAmbiente } from "./ambiente.ts";
import type { Env } from "./env.ts";

export type ItemSaude = { item: string; ok: boolean; detalhe: string; exigivel?: boolean };

const TEMPO_MS = 8000;

async function medir(item: string, f: () => Promise<string>): Promise<ItemSaude> {
  try {
    return { item, ok: true, detalhe: await f() };
  } catch (e) {
    return { item, ok: false, detalhe: e instanceof Error ? e.message : String(e) };
  }
}

/** O que cada resposta HTTP quer dizer para o teste (função pura, testada em saude.test.ts). */
export function lerStatus(servico: string, status: number): string {
  if (status === 0) throw new Error(`${servico} não respondeu`);
  if (status === 401 || status === 403) throw new Error(`${servico} recusou a chave (HTTP ${status})`);
  if (status >= 500) throw new Error(`${servico} com problema (HTTP ${status})`);
  if (status >= 400) throw new Error(`${servico} respondeu HTTP ${status}`);
  return `HTTP ${status}`;
}

/**
 * Um item por serviço e por cliente ativo (o detalhe começa com "[cliente]"). "exigivel" = o cliente já está no ar
 * (tem número de WhatsApp cadastrado): só nele algo "não cadastrado" pode virar alerta. Cliente recém-criado, ainda
 * sendo configurado, não dispara alerta por falta de chave.
 */
export async function conferirSaude(env: Env): Promise<ItemSaude[]> {
  let clientes: { id: string; whatsapp: string | null }[] = [];
  const banco = await medir("banco", async () => {
    const r = await env.DB.prepare(
      "select c.id, i.whatsapp_phone_number_id as whatsapp from clientes c join agentes a on a.cliente_id = c.id left join integracoes i on i.cliente_id = c.id where c.situacao = 'ativo' order by c.id",
    ).all<{ id: string; whatsapp: string | null }>();
    clientes = r.results;
    return `configuração lida (${clientes.length} cliente(s) ativo(s))`;
  });
  if (!banco.ok) return [banco];
  const porCliente = await Promise.all(clientes.map((c) => conferirCliente(env, c.id, Boolean(c.whatsapp))));
  return [banco, ...porCliente.flat()];
}

async function conferirCliente(env: Env, cliente: string, noAr: boolean): Promise<ItemSaude[]> {
  const comCliente = (i: ItemSaude): ItemSaude => ({ ...i, detalhe: `[${cliente}] ${i.detalhe}`, exigivel: noAr });
  let amb: Awaited<ReturnType<typeof carregarAmbiente>>;
  try {
    amb = await carregarAmbiente(env, cliente);
  } catch (e) {
    return [comCliente({ item: "banco", ok: false, detalhe: `não leu o ambiente: ${e instanceof Error ? e.message : String(e)}` })];
  }
  const itens = await Promise.all([
    medir("openai", async () => {
      if (!amb.chaveIA) throw new Error("chave da OpenAI não cadastrada no painel");
      const base = (env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
      const r = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${amb.chaveIA}` }, signal: AbortSignal.timeout(TEMPO_MS) }).catch(() => null);
      return lerStatus("OpenAI", r?.status ?? 0);
    }),
    medir("whatsapp", async () => {
      if (!amb.whatsapp) throw new Error("token ou número do WhatsApp não cadastrados no painel");
      const base = (env.GRAPH_BASE_URL || "https://graph.facebook.com").replace(/\/+$/, "");
      const w = amb.whatsapp;
      const r = await fetch(`${base}/${w.versao}/${w.phoneNumberId}?fields=id`, { headers: { Authorization: `Bearer ${w.token}` }, signal: AbortSignal.timeout(TEMPO_MS) }).catch(() => null);
      // a Meta responde 400 (código 190) quando o token venceu: trata como chave recusada
      if (r?.status === 400) {
        const j = (await r.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
        if (j.error?.code === 190) throw new Error("a Meta recusou o token (vencido ou revogado)");
        throw new Error(`a Meta respondeu HTTP 400: ${j.error?.message ?? "sem detalhe"}`);
      }
      return lerStatus("Meta (WhatsApp)", r?.status ?? 0);
    }),
    medir("crm", async () => {
      if (!amb.crm) throw new Error("endereço ou chave do CRM não cadastrados no painel");
      const r = await new ClienteCrm(amb.crm.endereco, amb.crm.chave, TEMPO_MS).get("/negocios?codigo=SAUDE-0000");
      // 404 = "não achei esse pedido": o CRM está no ar e aceitou a chave
      return lerStatus("CRM", r.status === 404 ? 200 : r.status);
    }),
  ]);
  return itens.map(comCliente);
}
