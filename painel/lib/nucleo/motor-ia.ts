/**
 * O "MOTOR DE IA": só o laço chamar o modelo → executar ferramentas → repetir.
 *
 * As REGRAS (antes e depois da IA) ficam em agente.ts e não dependem de qual motor é usado.
 * Existem duas implementações:
 *  - motorOpenAI (este arquivo): o laço próprio, com fetch (o que fez 45/45 na bateria);
 *  - o motor do Cloudflare Think (motor/src/conversa.ts), que usa o laço do Think.
 * Se o Think mudar ou quebrar, basta voltar para o motorOpenAI: regras, ferramentas e testes não mudam.
 */
import { DEFINICOES } from "./ferramentas.ts";
import { chamarModelo, type MensagemIA } from "./openai.ts";
import type { MensagemConversa } from "./tipos.ts";

export type UsoIA = { entrada: number; cache: number; saida: number; chamadas: number };

export type PedidoIA = {
  /** Instruções fixas (regras, conhecimento): vêm primeiro, para aproveitar o cache. */
  sistemaFixo: string;
  /** Situação atual do CRM: muda a cada mensagem, vem por último. */
  sistemaAtual: string;
  /** Conversa até agora, já com as mensagens novas do cliente no fim. */
  historico: MensagemConversa[];
  /** Só as mensagens novas do cliente. */
  novas: string[];
  /** Executa uma ferramenta e devolve o que a IA vai ler. */
  executar: (nome: string, argumentos: string) => Promise<unknown>;
  /** true = parar o laço (transferiu ou o cliente pediu para parar). */
  deveParar: () => boolean;
  maxRodadas: number;
};

export type PedidoReescrita = {
  sistemaFixo: string;
  sistemaAtual: string;
  historico: MensagemConversa[];
  rascunho: string;
  instrucao: string;
};

export interface MotorIA {
  responder(p: PedidoIA): Promise<{ texto: string; uso: UsoIA }>;
  /** Pede para a IA reescrever a última resposta (sem ferramentas). */
  reescrever(p: PedidoReescrita): Promise<{ texto: string; uso: UsoIA }>;
}

export const MAX_HISTORICO = 30;

export function mensagensIA(sistemaFixo: string, sistemaAtual: string, historico: MensagemConversa[]): MensagemIA[] {
  return [
    { role: "system", content: sistemaFixo },
    { role: "system", content: sistemaAtual },
    ...historico
      .filter((m) => m.papel !== "sistema")
      .slice(-MAX_HISTORICO)
      .map((m): MensagemIA => (m.papel === "cliente" ? { role: "user", content: m.texto } : { role: "assistant", content: m.texto })),
  ];
}

/** O laço próprio, com a API Chat Completions da OpenAI. */
export function motorOpenAI(op: { chave: string; modelo: string; chamar?: typeof chamarModelo; endereco?: string }): MotorIA {
  const chamar = op.chamar ?? chamarModelo;
  const novoUso = (): UsoIA => ({ entrada: 0, cache: 0, saida: 0, chamadas: 0 });
  const somar = (u: UsoIA, r: { entrada: number; cache: number; saida: number }) => {
    u.entrada += r.entrada;
    u.cache += r.cache;
    u.saida += r.saida;
    u.chamadas += 1;
  };
  return {
    async responder(p) {
      const uso = novoUso();
      const mensagens = mensagensIA(p.sistemaFixo, p.sistemaAtual, p.historico);
      // texto de todos os passos: a IA às vezes escreve, consulta o sistema e continua
      const textos: string[] = [];
      const juntar = () => textos.filter(Boolean).join("\n\n");
      for (let rodada = 0; rodada < p.maxRodadas; rodada++) {
        const ultima = rodada === p.maxRodadas - 1;
        const r = await chamar({ chave: op.chave, modelo: op.modelo, mensagens, ferramentas: ultima ? undefined : DEFINICOES, endereco: op.endereco });
        somar(uso, r.uso);
        const chamadas = r.mensagem.tool_calls ?? [];
        textos.push((r.mensagem.content ?? "").trim());
        if (!chamadas.length) return { texto: juntar(), uso };
        mensagens.push({ role: "assistant", content: r.mensagem.content ?? null, tool_calls: chamadas });
        for (const c of chamadas) {
          const saida = await p.executar(c.function.name, c.function.arguments);
          mensagens.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(saida).slice(0, 12000) });
        }
        if (p.deveParar()) break;
      }
      return { texto: p.deveParar() ? "" : juntar(), uso };
    },
    async reescrever(p) {
      const uso = novoUso();
      const mensagens = mensagensIA(p.sistemaFixo, p.sistemaAtual, p.historico);
      mensagens.push({ role: "assistant", content: p.rascunho });
      mensagens.push({ role: "system", content: p.instrucao });
      const r = await chamar({ chave: op.chave, modelo: op.modelo, mensagens, endereco: op.endereco });
      somar(uso, r.uso);
      return { texto: (r.mensagem.content ?? "").trim(), uso };
    },
  };
}
