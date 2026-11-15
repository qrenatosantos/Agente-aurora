/**
 * Prepara tudo o que o agente precisa, no SERVIDOR do painel: configuração, conhecimento em uso,
 * pausa, endereço e chave do CRM e chave da OpenAI (decifradas só aqui), e o gasto do mês.
 * E conversa com o MOTOR (Worker do agente, Cloudflare Think) pela ligação interna MOTOR.
 */
import "server-only";
import { lerConfig } from "@/lib/banco/config.ts";
import { conhecimentoDoAgente } from "@/lib/banco/conhecimento.ts";
import { enderecoCrm, segredoCifrado } from "@/lib/banco/integracoes.ts";
import { gastoMes, lerOperacao } from "@/lib/banco/operacao.ts";
import { decifrar } from "@/lib/cripto";
import { ClienteCrm } from "@/lib/nucleo/crm.ts";
import type { ConfigAgente, EstadoConversa, ItemConhecimento, ResultadoTurno } from "@/lib/nucleo/tipos.ts";
import { atorAtual, banco, envPainel } from "@/lib/servidor";

export type AmbienteAgente = {
  cfg: ConfigAgente;
  conhecimento: ItemConhecimento[];
  pausado: boolean;
  crm: ClienteCrm;
  crmUrl: string;
  chaveCrm: string;
  chaveIA: string;
  gastoMes: number;
  limite: { valor: number; pararNoLimite: boolean };
};

export async function carregarAmbienteAgente(): Promise<{ ok: true; amb: AmbienteAgente } | { ok: false; mensagem: string }> {
  const db = await banco();
  const ator = await atorAtual();
  let dados;
  try {
    dados = await Promise.all([
      lerConfig(db, ator),
      conhecimentoDoAgente(db),
      lerOperacao(db, ator),
      enderecoCrm(db, ator),
      segredoCifrado(db, ator, "openai_chave"),
      segredoCifrado(db, ator, "crm_chave"),
      gastoMes(db, ator),
    ]);
  } catch {
    return { ok: false, mensagem: "Sua sessão terminou ou não há permissão. Faça login novamente." };
  }
  const [cfg, conhecimento, op, url, chaveIaC, chaveCrmC, gasto] = dados;
  if (!url || !chaveCrmC) return { ok: false, mensagem: "O CRM ainda não está conectado. O gestor precisa preencher em Integrações." };
  if (!chaveIaC) return { ok: false, mensagem: "A chave da OpenAI ainda não foi cadastrada. O gestor precisa preencher em Integrações." };

  let chaveIA: string;
  let chaveCrm: string;
  try {
    [chaveIA, chaveCrm] = await Promise.all([decifrar(chaveIaC, "openai_chave"), decifrar(chaveCrmC, "crm_chave")]);
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
      conhecimento,
      pausado: op.pausado,
      crm: new ClienteCrm(url, chaveCrm),
      crmUrl: url,
      chaveCrm,
      chaveIA,
      gastoMes: gasto,
      limite: { valor: Number(cfg.limite_mensal_usd), pararNoLimite: cfg.parar_no_limite },
    },
  };
}

/** Uma chamada às rotas internas do motor (/interno/*). null = o motor não está ligado a este painel. */
export async function chamarMotor<T>(rota: "turno" | "apagar" | "ler", corpo: Record<string, unknown>): Promise<T | null> {
  const env = await envPainel();
  if (!env.MOTOR || !env.SEGREDO_INTERNO) return null;
  const r = await env.MOTOR.fetch(`https://motor/interno/${rota}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SEGREDO_INTERNO}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`O motor do agente respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export type TurnoMotor = ResultadoTurno;
export type EstadoMotor = { estado: EstadoConversa };
