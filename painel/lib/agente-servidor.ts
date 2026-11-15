/**
 * Prepara tudo o que o núcleo do agente precisa, no SERVIDOR do painel:
 * configuração, conhecimento em uso, pausa, cliente do CRM e chave da OpenAI (decifrada só aqui).
 */
import "server-only";
import { decifrar } from "@/lib/cripto";
import { ClienteCrm } from "@/lib/nucleo/crm.ts";
import type { ConfigAgente, ItemConhecimento } from "@/lib/nucleo/tipos.ts";
import { createClient } from "@/lib/supabase/server";

export type AmbienteAgente = {
  cfg: ConfigAgente;
  conhecimento: ItemConhecimento[];
  pausado: boolean;
  crm: ClienteCrm;
  crmUrl: string;
  chaveIA: string;
  gastoMes: number;
  limite: { valor: number; pararNoLimite: boolean };
};

export async function carregarAmbienteAgente(): Promise<{ ok: true; amb: AmbienteAgente } | { ok: false; mensagem: string }> {
  const supabase = await createClient();
  const [cfgR, conhR, opR, urlR, chaveIaR, chaveCrmR, gastoR] = await Promise.all([
    supabase.from("agente_config").select("*").eq("unica", true).maybeSingle(),
    supabase.from("conhecimento").select("titulo, pergunta, conteudo").eq("ativo", true).order("tipo").order("titulo"),
    supabase.from("operacao").select("pausado").eq("unica", true).maybeSingle(),
    supabase.rpc("endereco_crm"),
    supabase.rpc("segredo_cifrado", { p_nome: "openai_chave" }),
    supabase.rpc("segredo_cifrado", { p_nome: "crm_chave" }),
    supabase.rpc("gasto_mes_usd"),
  ]);
  const cfg = cfgR.data;
  if (!cfg) return { ok: false, mensagem: "Não foi possível ler a configuração do agente." };
  if (!urlR.data || !chaveCrmR.data) return { ok: false, mensagem: "O CRM ainda não está conectado. O gestor precisa preencher em Integrações." };
  if (!chaveIaR.data) return { ok: false, mensagem: "A chave da OpenAI ainda não foi cadastrada. O gestor precisa preencher em Integrações." };

  let chaveIA: string;
  let chaveCrm: string;
  try {
    [chaveIA, chaveCrm] = await Promise.all([decifrar(chaveIaR.data, "openai_chave"), decifrar(chaveCrmR.data, "crm_chave")]);
  } catch {
    return { ok: false, mensagem: "Não foi possível abrir as chaves guardadas (a CHAVE_MESTRA do servidor mudou?). O gestor precisa digitá-las de novo em Integrações." };
  }

  return {
    ok: true,
    amb: {
      cfg: {
        nome_agente: cfg.nome_agente,
        apresentacao: cfg.apresentacao,
        tom: cfg.tom,
        saudacao: cfg.saudacao,
        instrucoes: cfg.instrucoes,
        exemplos: cfg.exemplos ?? [],
        gatilhos_palavras: cfg.gatilhos_palavras ?? [],
        gatilhos_temas: cfg.gatilhos_temas ?? [],
        max_msgs_sem_avanco: cfg.max_msgs_sem_avanco,
        horario_equipe: cfg.horario_equipe ?? {},
        agente_24h: cfg.agente_24h,
        mensagens: cfg.mensagens ?? {},
        modelo: cfg.modelo,
      },
      conhecimento: conhR.data ?? [],
      pausado: Boolean(opR.data?.pausado),
      crm: new ClienteCrm(urlR.data, chaveCrm),
      crmUrl: urlR.data,
      chaveIA,
      gastoMes: Number(gastoR.data ?? 0),
      limite: { valor: Number(cfg.limite_mensal_usd), pararNoLimite: cfg.parar_no_limite },
    },
  };
}
