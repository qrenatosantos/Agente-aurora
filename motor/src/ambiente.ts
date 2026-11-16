/**
 * AMBIENTE DO ATENDIMENTO REAL: lê do banco do painel (D1) o que o gestor configurou — instruções,
 * conhecimento, pausa, limite de gasto, CRM, OpenAI e WhatsApp — e abre as chaves com a CHAVE_MESTRA.
 * Sem pessoa logada: usa só as leituras "internas" de painel/lib/banco (feitas para o motor).
 */
import { decifrarCom } from "../../painel/lib/banco/cifra.ts";
import { lerConfigInterno } from "../../painel/lib/banco/config.ts";
import { conhecimentoDoAgente } from "../../painel/lib/banco/conhecimento.ts";
import { lerIntegracoesInterno, type NomeSegredo, segredoCifradoInterno } from "../../painel/lib/banco/integracoes.ts";
import { gastoMesInterno, lerOperacaoInterno } from "../../painel/lib/banco/operacao.ts";
import type { ConfigAgente, ItemConhecimento } from "../../painel/lib/nucleo/tipos.ts";
import type { Env } from "./env.ts";

export type Ambiente = {
  cfg: ConfigAgente;
  conhecimento: ItemConhecimento[];
  pausado: boolean;
  esperaSegundos: number;
  transcreverAudio: boolean;
  limite: { valor: number; pararNoLimite: boolean; gastoMes: number };
  /** Minutos para os lembretes da proposta (abriu e não respondeu / não abriu). */
  lembretes: { abertaMin: number; naoAbertaMin: number };
  crm: { endereco: string; chave: string } | null;
  chaveIA: string | null;
  whatsapp: { token: string; phoneNumberId: string; versao: string; appSecret: string | null } | null;
};

async function segredo(env: Env, nome: NomeSegredo) {
  const c = await segredoCifradoInterno(env.DB, nome);
  if (!c) return null;
  return decifrarCom(env.CHAVE_MESTRA, c, nome);
}

/** Só o que é preciso para conferir os avisos da Meta (rápido: não lê a configuração inteira). */
export async function segredosDoWebhook(env: Env) {
  const [appSecret, verifyToken, integ] = await Promise.all([segredo(env, "whatsapp_app_secret"), segredo(env, "whatsapp_verify_token"), lerIntegracoesInterno(env.DB)]);
  return { appSecret, verifyToken, phoneNumberId: integ.whatsapp_phone_number_id };
}

/** Segredo dos avisos do CRM (cadastrado no painel, em Integrações ▸ CRM). */
export const segredoDosAvisos = (env: Env) => segredo(env, "crm_segredo_avisos");

export async function carregarAmbiente(env: Env): Promise<Ambiente> {
  const db = env.DB;
  const [c, conhecimento, op, integ, gasto, chaveCrm, chaveIA, token, appSecret] = await Promise.all([
    lerConfigInterno(db),
    conhecimentoDoAgente(db),
    lerOperacaoInterno(db),
    lerIntegracoesInterno(db),
    gastoMesInterno(db),
    segredo(env, "crm_chave"),
    segredo(env, "openai_chave"),
    segredo(env, "whatsapp_token"),
    segredo(env, "whatsapp_app_secret"),
  ]);
  return {
    cfg: {
      nome_agente: c.nome_agente,
      apresentacao: c.apresentacao,
      tom: c.tom,
      saudacao: c.saudacao,
      instrucoes: c.instrucoes,
      exemplos: c.exemplos,
      gatilhos_palavras: c.gatilhos_palavras,
      gatilhos_temas: c.gatilhos_temas,
      max_msgs_sem_avanco: c.max_msgs_sem_avanco,
      horario_equipe: c.horario_equipe,
      agente_24h: c.agente_24h,
      mensagens: c.mensagens,
      modelo: c.modelo,
    },
    conhecimento,
    pausado: op.pausado,
    esperaSegundos: c.espera_segundos,
    transcreverAudio: c.transcrever_audio,
    limite: { valor: Number(c.limite_mensal_usd), pararNoLimite: c.parar_no_limite, gastoMes: gasto },
    lembretes: { abertaMin: Number(c.retomada_aberta_min ?? 30), naoAbertaMin: Number(c.retomada_nao_aberta_min ?? 120) },
    crm: integ.crm_url && chaveCrm ? { endereco: integ.crm_url, chave: chaveCrm } : null,
    chaveIA,
    whatsapp: token && integ.whatsapp_phone_number_id ? { token, phoneNumberId: integ.whatsapp_phone_number_id, versao: integ.whatsapp_graph_versao, appSecret } : null,
  };
}
