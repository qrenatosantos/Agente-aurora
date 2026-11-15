/**
 * O AGENTE: processa as mensagens novas do cliente e decide a resposta.
 *
 * Ordem (as regras garantidas por CÓDIGO vêm antes da IA):
 *  1. agente pausado / cliente pediu para parar / conversa com uma pessoa → não responde;
 *  2. pedido para não receber mensagens → confirma e para;
 *  3. gatilho de palavras do painel → transfere sem passar pela IA;
 *  4. muitas mensagens sem avanço → transfere;
 *  5. IA com ferramentas (até 6 rodadas);
 *  6. filtro: valor em R$ que não veio do CRM → reescreve; se insistir, transfere;
 *  7. aviso de atendimento automático na primeira resposta.
 * Erro técnico (IA ou CRM fora do ar) → mensagem de erro e transferência.
 */
import type { ClienteCrm, CondicoesCrm, NegocioCrm, PacoteCrm } from "./crm.ts";
import { executarFerramenta, type ContextoFerramentas, type Modo } from "./ferramentas.ts";
import { mensagemTransferencia } from "./horario.ts";
import { motorOpenAI, type MotorIA, type UsoIA } from "./motor-ia.ts";
import { chamarModelo, custoUsd, ErroIA } from "./openai.ts";
import { parteAtual, parteFixa } from "./prompt.ts";
import type { ConfigAgente, EstadoConversa, ItemConhecimento, MensagemConversa, PassoRastro, ResultadoTurno, UsoModelo } from "./tipos.ts";
import { contemAlguma, dataISO, dividirMensagens, pediuParaParar, removerRepeticao, valoresSemBase } from "./util.ts";

const MAX_RODADAS = 6;

export type EntradaTurno = {
  cfg: ConfigAgente;
  conhecimento: ItemConhecimento[];
  estado: EstadoConversa;
  /** Conversa até agora, JÁ com as mensagens novas do cliente no fim. */
  historico: MensagemConversa[];
  /** Só as mensagens novas do cliente (as que chegaram juntas). */
  novas: string[];
  crm: ClienteCrm;
  chaveIA: string;
  modelo?: string;
  modo: Modo;
  pausado?: boolean;
  agora?: Date;
  telefone?: string | null;
  tituloNovoPedido?: string;
  /** Para testes: troca a chamada à OpenAI (só vale para o motor próprio). */
  chamar?: typeof chamarModelo;
  /** Qual laço de IA usar. Padrão: o laço próprio com a OpenAI (motorOpenAI). */
  ia?: MotorIA;
};

/** Lê do CRM o que o agente precisa saber antes de responder. */
async function lerContexto(crm: ClienteCrm, estado: EstadoConversa, modo: Modo, rastro: PassoRastro[]) {
  const [pac, cond] = await Promise.all([crm.get<{ pacotes: PacoteCrm[] }>("/catalogo/pacotes"), crm.get<CondicoesCrm>("/catalogo/condicoes")]);
  if (!pac.dados || !cond.dados) throw new Error(pac.erro?.mensagem ?? cond.erro?.mensagem ?? "O CRM não respondeu.");
  rastro.push({ tipo: "ferramenta", nome: "ler catálogo e condições", efeito: "leitura", resultado: { pacotes: pac.dados.pacotes.map((p) => p.nome), precos_aprovados: cond.dados.precos_aprovados } });
  let etapa: string | null = null;
  if (estado.negocio_id) {
    const n = await crm.get<NegocioCrm>(`/negocios/${estado.negocio_id}`);
    if (n.dados) {
      etapa = n.dados.etapa?.nome ?? null;
      estado.atendimento = n.dados.atendimento;
      estado.codigo = n.dados.codigo;
      estado.contato_id = n.dados.contato?.id ?? estado.contato_id;
      if (modo === "real" || Object.keys(estado.evento).length === 0) {
        // no modo real o CRM é a verdade; no simulador, o que já foi "gravado" na simulação prevalece
        estado.evento = { ...(n.dados.evento ?? {}), ...(modo === "real" ? {} : estado.evento) };
        if (n.dados.contato?.nome && !estado.contato.nome) estado.contato.nome = n.dados.contato.nome;
      }
      if (n.dados.status !== "aberto") estado.atendimento = "humano";
      rastro.push({ tipo: "ferramenta", nome: "ler pedido no CRM", efeito: "leitura", resultado: { codigo: n.dados.codigo, etapa, atendimento: n.dados.atendimento, status: n.dados.status } });
    }
  }
  return { pacotes: pac.dados.pacotes, condicoes: cond.dados, etapa };
}

/** A IA disse que ia passar para a equipe? (então passa de verdade, mesmo que ela não tenha chamado a ferramenta) */
export function prometeuTransferir(texto: string) {
  return /\b(vou|irei|vamos|já vou)\s+(te\s+)?(passar|transferir|encaminhar)\b|\bvou chamar algu[eé]m\b|\bpass(ar|ando|ei) (a |sua |essa |esta )?conversa\b|algu[eé]m da (nossa )?equipe (vai|ir[aá]|já vai) (te )?(responder|atender|chamar|falar|entrar em contato)/i.test(texto);
}

/** Alguma consulta deste turno mostrou a data da festa lotada ou bloqueada? */
function dataSemVaga(rastro: PassoRastro[]): string | null {
  for (const p of rastro) {
    const r = p.resultado as { situacao?: string; data?: string; disponibilidade?: { situacao?: string; data?: string } } | undefined;
    const sit = r?.situacao ?? r?.disponibilidade?.situacao;
    if (sit === "lotada" || sit === "bloqueada") return r?.data ?? r?.disponibilidade?.data ?? "";
  }
  return null;
}

export async function processarTurno(e: EntradaTurno): Promise<ResultadoTurno> {
  const agora = e.agora ?? new Date();
  const estado: EstadoConversa = structuredClone(e.estado);
  const rastro: PassoRastro[] = [];
  const modelo = e.modelo ?? e.cfg.modelo;
  const uso: UsoModelo = { modelo, entrada: 0, cache: 0, saida: 0, custo_usd: 0, chamadas: 0 };
  const ia = e.ia ?? motorOpenAI({ chave: e.chaveIA, modelo, chamar: e.chamar });
  const texto = e.novas.join("\n").trim();
  const sair = (silencio: string): ResultadoTurno => ({ respostas: [], estado, rastro, uso, silencio });

  // 1. quando o agente NÃO responde
  if (e.pausado) return sair("O agente está pausado (botão de emergência). A mensagem fica registrada para a equipe.");
  if (estado.optout) return sair("Este cliente pediu para não receber mensagens.");

  let transferir: string | null = null;
  let respostasPrefixo = "";
  const respostas: string[] = [];

  const transferirAgora = async (motivo: string, ctx: ContextoFerramentas | null) => {
    transferir = motivo;
    if (ctx) await executarFerramenta("transferir_para_pessoa", JSON.stringify({ motivo }), ctx);
  };

  let ctx: ContextoFerramentas | null = null;
  try {
    const { pacotes, condicoes, etapa } = await lerContexto(e.crm, estado, e.modo, rastro);
    if (estado.atendimento === "humano") return sair("A conversa está com uma pessoa da equipe: o agente só registra as mensagens.");

    ctx = { crm: e.crm, modo: e.modo, estado, pacotes, rastro, hoje: dataISO(agora), telefone: e.telefone ?? estado.telefone, tituloNovoPedido: e.tituloNovoPedido };

    // 2. pediu para parar (conferido por código)
    if (pediuParaParar(texto)) {
      rastro.push({ tipo: "regra", nome: "Pedido para não receber mensagens", detalhe: "Conferido pelo sistema, antes da IA." });
      await executarFerramenta("registrar_pedido_para_parar", "{}", ctx);
      estado.optout = true;
      return { respostas: [e.cfg.mensagens.sair_confirmacao ?? "Tudo certo, não vou mais enviar mensagens."], estado, rastro, uso };
    }

    // 3. gatilho de palavras
    const gatilho = contemAlguma(texto, e.cfg.gatilhos_palavras);
    if (gatilho) {
      rastro.push({ tipo: "regra", nome: "Gatilho de transferência", detalhe: `O cliente escreveu “${gatilho}”. Transferido sem passar pela IA.` });
      await transferirAgora(`O cliente escreveu “${gatilho}”.`, ctx);
    }

    // 4. conversa sem avanço
    if (!transferir) {
      estado.msgs_sem_avanco += 1;
      if (estado.msgs_sem_avanco > e.cfg.max_msgs_sem_avanco) {
        rastro.push({ tipo: "regra", nome: "Conversa sem avanço", detalhe: `${estado.msgs_sem_avanco - 1} mensagens do cliente sem nenhum dado novo da festa.` });
        await transferirAgora("A conversa não avançou depois de várias mensagens.", ctx);
      }
    }

    // 5. IA com ferramentas
    if (!transferir) {
      const sistemaFixo = parteFixa(e.cfg, e.conhecimento);
      const sistemaAtual = parteAtual({ cfg: e.cfg, estado, pacotes, condicoes, agora, etapa });
      let parar = false;
      const contexto = ctx;
      const r = await ia.responder({
        sistemaFixo,
        sistemaAtual,
        historico: e.historico,
        novas: e.novas,
        maxRodadas: MAX_RODADAS,
        deveParar: () => Boolean(transferir) || parar,
        executar: async (nome, argumentos) => {
          const { saida, efeito } = await executarFerramenta(nome, argumentos, contexto);
          if (efeito.avancou) estado.msgs_sem_avanco = 0;
          if (efeito.transferir) transferir = efeito.transferir;
          if (efeito.parar) parar = true;
          return saida;
        },
      });
      somar(uso, r.uso, modelo);
      let final = transferir || parar ? "" : removerRepeticao(r.texto);

      if (parar) {
        estado.optout = true;
        return { respostas: [e.cfg.mensagens.sair_confirmacao ?? "Tudo certo, não vou mais enviar mensagens."], estado, rastro, uso };
      }

      // 6. filtro de valores: só pode citar R$ que veio do CRM nesta conversa
      if (!transferir && final) {
        let semBase = valoresSemBase(final, estado.valores_do_crm);
        if (semBase.length) {
          rastro.push({ tipo: "filtro", nome: "Valor sem base no CRM", detalhe: `A resposta citava ${semBase.map((v) => `R$ ${v.toFixed(2)}`).join(", ")}, que não veio do sistema. Pedido para reescrever.`, resultado: final });
          const r2 = await ia.reescrever({
            sistemaFixo,
            sistemaAtual,
            historico: e.historico,
            rascunho: final,
            instrucao: "ATENÇÃO: sua resposta citou valores em reais que NÃO vieram do sistema. Reescreva a mesma resposta SEM citar nenhum valor em dinheiro.",
          });
          somar(uso, r2.uso, modelo);
          final = r2.texto.trim();
          semBase = valoresSemBase(final, estado.valores_do_crm);
          if (semBase.length) {
            rastro.push({ tipo: "filtro", nome: "Valor sem base no CRM (de novo)", detalhe: "A IA insistiu em citar valor. A resposta foi bloqueada e a conversa passou para a equipe." });
            await transferirAgora("O agente tentou informar um valor que não está no sistema.", ctx);
          }
        }
      }
      // Rede de segurança 1: data lotada/bloqueada → passa para a equipe (que pode ver alternativas).
      let prefixo = "";
      const semVaga = !transferir ? dataSemVaga(rastro) : null;
      if (semVaga !== null) {
        rastro.push({ tipo: "regra", nome: "Data sem vaga na agenda", detalhe: "A agenda do CRM mostrou a data lotada ou bloqueada: a conversa passou para a equipe." });
        await transferirAgora(`Data ${semVaga} lotada ou bloqueada na agenda.`, ctx);
        prefixo = "Infelizmente a nossa agenda já está cheia nessa data. ";
      }
      // Rede de segurança 2: a IA disse que ia passar para a equipe, mas não passou.
      if (!transferir && final && prometeuTransferir(final)) {
        rastro.push({ tipo: "regra", nome: "Promessa de transferência", detalhe: "A IA disse que ia passar a conversa, mas não chamou a ferramenta. O sistema transferiu de verdade." });
        await transferirAgora("O agente disse ao cliente que passaria para a equipe.", ctx);
      }
      if (prefixo) respostasPrefixo = prefixo;
      if (!transferir && !final) {
        rastro.push({ tipo: "aviso", nome: "Resposta vazia", detalhe: "A IA não produziu texto. Conversa passada para a equipe." });
        await transferirAgora("O agente não conseguiu responder.", ctx);
      }
      // a IA pode separar a resposta em várias mensagens (linha "---"): cada uma vira um balão no WhatsApp
      if (!transferir && final) respostas.push(...dividirMensagens(final));
    }
  } catch (erro) {
    const msg = erro instanceof ErroIA || erro instanceof Error ? erro.message : String(erro);
    rastro.push({ tipo: "aviso", nome: "Erro técnico", detalhe: msg });
    if (!transferir) await transferirAgora(`Erro técnico: ${msg}`, ctx).catch(() => undefined);
    estado.atendimento = "humano";
    estado.transferido_motivo = transferir;
    return { respostas: [e.cfg.mensagens.erro ?? "Tive um probleminha aqui. Já chamei alguém da equipe."], estado, rastro, uso };
  }

  if (transferir) {
    estado.atendimento = "humano";
    estado.transferido_motivo = transferir;
    respostas.push(respostasPrefixo + mensagemTransferencia(e.cfg, agora));
  }

  // 7. aviso de atendimento automático na primeira resposta (exceto quando já transferiu)
  if (!estado.avisou_automatico && respostas.length && !transferir) {
    const aviso = e.cfg.mensagens.aviso_automatico;
    // se a própria IA já disse que é automático, não repete (evita aviso duplicado)
    const jaDisse = /autom[aá]tic/i.test(respostas[0]);
    if (aviso && !jaDisse) {
      respostas[0] = `${respostas[0]}\n\n${aviso}`;
      rastro.push({ tipo: "regra", nome: "Aviso de atendimento automático", detalhe: "Incluído pelo sistema na primeira resposta." });
    }
    estado.avisou_automatico = true;
  }

  return { respostas, estado, rastro, uso };
}

function somar(uso: UsoModelo, u: UsoIA, modelo: string) {
  uso.entrada += u.entrada;
  uso.cache += u.cache;
  uso.saida += u.saida;
  uso.chamadas += u.chamadas;
  const c = custoUsd(modelo, uso);
  uso.custo_usd = c;
}
