/**
 * Integrações (servidor): ler uma chave guardada e TESTAR a conexão com CRM, OpenAI e WhatsApp.
 * As chaves só são decifradas aqui, no servidor, no momento do teste. Nunca vão para o navegador.
 */
import "server-only";
import { decifrar } from "@/lib/cripto";
import { createClient } from "@/lib/supabase/server";
import type { NomeSegredo, ResultadoTeste } from "@/lib/tipos";

/** Permissões que a chave do agente precisa ter no CRM (docs/API-DO-AGENTE.md do CRM, seção 3). */
export const ESCOPOS_DO_AGENTE = [
  "contatos.ler",
  "contatos.gravar",
  "negocios.ler",
  "negocios.gravar",
  "agenda.ler",
  "catalogo.ler",
  "precos.calcular",
  "propostas.ler",
  "propostas.gravar",
  "propostas.enviar",
  "mensagens.ler",
  "mensagens.gravar",
  "atendimento.transferir",
  "eventos.ler",
] as const;

export async function lerSegredo(nome: NomeSegredo): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("segredo_cifrado", { p_nome: nome });
  if (error || !data) return null;
  return decifrar(data, nome);
}

const TEMPO = 10000;

function erroDeRede(e: unknown, servico: string): ResultadoTeste {
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|aborted/i.test(msg)) return { ok: false, mensagem: `${servico} demorou demais para responder.` };
  return { ok: false, mensagem: `Não foi possível falar com ${servico}. Confira o endereço e a internet do servidor.` };
}

export async function testarCrm(url: string, chave: string): Promise<ResultadoTeste> {
  try {
    const r = await fetch(`${url.replace(/\/+$/, "")}/api/v1/ping`, {
      headers: { Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(TEMPO),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => ({}))) as {
      dados?: { chave?: { nome?: string; escopos?: string[]; limite_por_minuto?: number }; empresa?: string };
      erro?: { mensagem?: string };
    };
    if (r.status === 401) return { ok: false, mensagem: "O CRM recusou a chave (ausente, errada ou revogada). Crie outra em Integrações no CRM." };
    if (!r.ok) return { ok: false, mensagem: json.erro?.mensagem ?? `O CRM respondeu com erro ${r.status}.` };
    const escopos = json.dados?.chave?.escopos ?? [];
    const faltam = ESCOPOS_DO_AGENTE.filter((e) => !escopos.includes(e));
    return {
      ok: faltam.length === 0,
      mensagem:
        faltam.length === 0
          ? `Conectado a ${json.dados?.empresa ?? "CRM"} com a chave “${json.dados?.chave?.nome ?? "?"}”.`
          : `Conectado, mas a chave não tem estas permissões: ${faltam.join(", ")}. Crie uma chave com todas no CRM.`,
      detalhes: { empresa: json.dados?.empresa ?? null, chave: json.dados?.chave?.nome ?? null, escopos, faltam, limite_por_minuto: json.dados?.chave?.limite_por_minuto ?? null },
    };
  } catch (e) {
    return erroDeRede(e, "o CRM");
  }
}

export async function testarOpenAI(chave: string, modelo: string): Promise<ResultadoTeste> {
  try {
    const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(modelo)}`, {
      headers: { Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(TEMPO),
      cache: "no-store",
    });
    if (r.status === 401) return { ok: false, mensagem: "A OpenAI recusou a chave. Confira se copiou inteira e se ela não foi apagada." };
    if (r.status === 404) return { ok: false, mensagem: `A chave funciona, mas o modelo “${modelo}” não está disponível para ela.` };
    if (r.status === 429) return { ok: false, mensagem: "A OpenAI recusou por limite ou falta de crédito. Confira o saldo em platform.openai.com." };
    if (!r.ok) return { ok: false, mensagem: `A OpenAI respondeu com erro ${r.status}.` };
    return { ok: true, mensagem: `Chave aceita e modelo “${modelo}” disponível.` };
  } catch (e) {
    return erroDeRede(e, "a OpenAI");
  }
}

export async function testarWhatsApp(versao: string, phoneNumberId: string, token: string): Promise<ResultadoTeste> {
  try {
    const campos = "display_phone_number,verified_name,quality_rating,name_status";
    const r = await fetch(`https://graph.facebook.com/${versao}/${phoneNumberId}?fields=${campos}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TEMPO),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      name_status?: string;
      error?: { message?: string; code?: number };
    };
    if (!r.ok) {
      const m = json.error?.message ?? `erro ${r.status}`;
      if (r.status === 401 || json.error?.code === 190) return { ok: false, mensagem: "A Meta recusou o token (expirado ou sem permissão). Gere um token permanente de usuário do sistema." };
      return { ok: false, mensagem: `A Meta respondeu: ${m}` };
    }
    return {
      ok: true,
      mensagem: `Número ${json.display_phone_number ?? "?"} (${json.verified_name ?? "sem nome aprovado"}) conectado.`,
      detalhes: { numero: json.display_phone_number ?? null, nome: json.verified_name ?? null, qualidade: json.quality_rating ?? null, situacao_nome: json.name_status ?? null },
    };
  } catch (e) {
    return erroDeRede(e, "a Meta");
  }
}
