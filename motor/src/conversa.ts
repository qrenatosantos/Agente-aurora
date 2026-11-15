/**
 * CONVERSA = um agente Think por conversa (um telefone, ou uma simulação do painel).
 *
 * O Durable Object garante a ordem: uma resposta por vez em cada conversa.
 * Quem decide o que responder continua sendo o núcleo (processarTurno), com as regras ANTES e DEPOIS
 * da IA feitas por código. O Think entra só como o laço da IA (MotorIA): modelo + ferramentas + memória.
 *
 * Memória: o Think guarda a conversa no SQLite do Durable Object. Ao fim de cada turno, o que fica
 * guardado é exatamente o texto ENVIADO ao cliente (sem os passos intermediários das ferramentas e já
 * com as correções das regras), igual ao laço antigo.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { Think, type StepContext, type TurnConfig, type TurnContext } from "@cloudflare/think";
import { jsonSchema, tool, type ToolSet, type UIMessage } from "ai";
import { processarTurno } from "../../painel/lib/nucleo/agente.ts";
import { ClienteCrm } from "../../painel/lib/nucleo/crm.ts";
import { DEFINICOES } from "../../painel/lib/nucleo/ferramentas.ts";
import { MAX_HISTORICO, motorOpenAI, type MotorIA, type PedidoIA, type UsoIA } from "../../painel/lib/nucleo/motor-ia.ts";
import { ErroIA } from "../../painel/lib/nucleo/openai.ts";
import { estadoInicial, type ConfigAgente, type EstadoConversa, type ItemConhecimento, type MensagemConversa, type ResultadoTurno } from "../../painel/lib/nucleo/tipos.ts";
import type { Env } from "./env.ts";

/** O que chega para cada turno (do WhatsApp ou do simulador do painel). */
export type EntradaConversa = {
  novas: string[];
  modo: "real" | "simulacao";
  cfg: ConfigAgente;
  conhecimento: ItemConhecimento[];
  crm: { endereco: string; chave: string };
  chaveIA: string;
  modelo?: string;
  telefone?: string | null;
  pausado?: boolean;
  /** ISO; para testes. */
  agora?: string;
  tituloNovoPedido?: string;
  /** "think" (padrão) ou "proprio" (o laço antigo, plano B). */
  laco?: "think" | "proprio";
};

const novoUso = (): UsoIA => ({ entrada: 0, cache: 0, saida: 0, chamadas: 0 });

/** Texto de uma mensagem guardada (só as partes de texto). */
function textoDe(m: UIMessage) {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

function msg(role: "user" | "assistant", texto: string): UIMessage {
  return { id: crypto.randomUUID(), role, parts: [{ type: "text", text: texto }] };
}

export class Conversa extends Think<Env> {
  /** Turno em andamento (preenchido só durante responderThink). */
  private pedido: PedidoIA | null = null;
  private turnoIA: { chave: string; modelo: string } | null = null;
  private usoTurno: UsoIA = novoUso();
  private textoFinal = "";
  /** Fila: uma resposta por vez, mesmo se duas chamadas chegarem juntas. */
  private fila: Promise<unknown> = Promise.resolve();

  // ------------------------------------------------------------------ modelo
  private openai(chave: string) {
    const base = this.env.OPENAI_BASE_URL?.replace(/\/+$/, "");
    return createOpenAI({ apiKey: chave, baseURL: base ? `${base}/v1` : undefined });
  }

  getModel() {
    const t = this.turnoIA;
    return this.openai(t?.chave ?? "sem-chave").chat(t?.modelo ?? "gpt-6-luna");
  }

  getSystemPrompt() {
    return this.pedido?.sistemaFixo ?? "";
  }

  /** As mesmas ferramentas do núcleo (nomes, descrições e esquemas), executadas pelo núcleo. */
  getTools(): ToolSet {
    const ferramentas: ToolSet = {};
    for (const d of DEFINICOES) {
      const nome = d.function.name;
      ferramentas[nome] = tool({
        description: d.function.description,
        inputSchema: jsonSchema(d.function.parameters as Parameters<typeof jsonSchema>[0]),
        execute: async (args: unknown) => {
          if (!this.pedido) return { erro: "Fora de um atendimento." };
          return this.pedido.executar(nome, JSON.stringify(args ?? {}));
        },
      });
    }
    return ferramentas;
  }

  beforeTurn(ctx: TurnContext): TurnConfig | void {
    const p = this.pedido;
    const t = this.turnoIA;
    if (!p || !t) return;
    const antigo = t.modelo.startsWith("gpt-4");
    // histórico: as últimas mensagens (começando por uma do cliente)
    let mensagens = ctx.messages.slice(-MAX_HISTORICO);
    while (mensagens.length > 1 && mensagens[0].role !== "user") mensagens = mensagens.slice(1);
    return {
      // parte fixa primeiro (cache da OpenAI), situação atual do CRM por último
      system: `${p.sistemaFixo}\n\n${p.sistemaAtual}`,
      messages: mensagens,
      model: this.openai(t.chave).chat(t.modelo),
      maxSteps: p.maxRodadas,
      stopWhen: () => p.deveParar(),
      maxOutputTokens: 700,
      ...(antigo ? { temperature: 0.4 } : {}),
      providerOptions: {
        openai: { store: false, parallelToolCalls: false, ...(antigo ? {} : { reasoningEffort: "none" }) },
      },
    };
  }

  /** Na última rodada, a IA só pode escrever (sem ferramentas), como no laço antigo. */
  beforeStep(ctx: { stepNumber: number }) {
    const p = this.pedido;
    if (p && ctx.stepNumber >= p.maxRodadas - 1) return { toolChoice: "none" as const };
  }

  onStepFinish(s: StepContext) {
    this.usoTurno.entrada += s.usage?.inputTokens ?? 0;
    this.usoTurno.cache += s.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
    this.usoTurno.saida += s.usage?.outputTokens ?? 0;
    this.usoTurno.chamadas += 1;
    // a resposta é o texto do passo que NÃO chamou ferramenta (igual ao laço antigo)
    if (!s.toolCalls?.length) this.textoFinal = s.text ?? "";
  }

  // ------------------------------------------------------------------ laço da IA pelo Think
  private motorThink(chave: string, modelo: string): MotorIA {
    const proprio = motorOpenAI({ chave, modelo, endereco: this.env.OPENAI_BASE_URL || undefined });
    return {
      responder: async (p) => {
        this.pedido = p;
        this.turnoIA = { chave, modelo };
        this.usoTurno = novoUso();
        this.textoFinal = "";
        try {
          const r = await this.saveMessages([msg("user", p.novas.join("\n"))]);
          if (r.status !== "completed") {
            const detalhe = (r as { error?: string }).error ?? r.status;
            throw new ErroIA(/401|incorrect api key/i.test(detalhe) ? "A OpenAI recusou a chave." : `A IA não respondeu (${detalhe}).`, 0);
          }
          return { texto: p.deveParar() ? "" : this.textoFinal, uso: this.usoTurno };
        } finally {
          this.pedido = null;
          this.turnoIA = null;
        }
      },
      // reescrever é uma chamada simples, sem ferramentas e sem mexer na memória
      reescrever: (p) => proprio.reescrever(p),
    };
  }

  // ------------------------------------------------------------------ estado da conversa
  private lerEstado(): EstadoConversa {
    this.sql`create table if not exists aurora_estado (id integer primary key, json text not null)`;
    const linha = this.sql<{ json: string }>`select json from aurora_estado where id = 1`[0];
    return linha ? (JSON.parse(linha.json) as EstadoConversa) : estadoInicial();
  }

  private gravarEstado(e: EstadoConversa) {
    this.sql`insert into aurora_estado (id, json) values (1, ${JSON.stringify(e)})
             on conflict(id) do update set json = excluded.json`;
  }

  /** Conversa até agora, no formato do núcleo. */
  historico(): MensagemConversa[] {
    return this.messages
      .map((m): MensagemConversa | null => {
        const texto = textoDe(m);
        if (!texto || (m.role !== "user" && m.role !== "assistant")) return null;
        return { papel: m.role === "user" ? "cliente" : "agente", texto, em: "" };
      })
      .filter((m): m is MensagemConversa => m !== null);
  }

  // ------------------------------------------------------------------ entrada pública (RPC)
  /** Processa as mensagens novas do cliente e devolve o que enviar. Uma por vez. */
  async turno(e: EntradaConversa): Promise<ResultadoTurno> {
    const vez = this.fila.then(() => this.turnoAgora(e));
    this.fila = vez.catch(() => undefined);
    return vez;
  }

  private async turnoAgora(e: EntradaConversa): Promise<ResultadoTurno> {
    const estado = this.lerEstado();
    const antes = this.messages.map((m) => m.id);
    const historico = [...this.historico(), ...e.novas.map((t) => ({ papel: "cliente" as const, texto: t, em: new Date().toISOString() }))];
    const modelo = e.modelo ?? e.cfg.modelo;
    const ia = e.laco === "proprio" ? motorOpenAI({ chave: e.chaveIA, modelo, endereco: this.env.OPENAI_BASE_URL || undefined }) : this.motorThink(e.chaveIA, modelo);

    const r = await processarTurno({
      cfg: e.cfg,
      conhecimento: e.conhecimento,
      estado,
      historico,
      novas: e.novas,
      crm: new ClienteCrm(e.crm.endereco, e.crm.chave),
      chaveIA: e.chaveIA,
      modelo,
      modo: e.modo,
      pausado: e.pausado,
      agora: e.agora ? new Date(e.agora) : undefined,
      telefone: e.telefone,
      tituloNovoPedido: e.tituloNovoPedido,
      ia,
    });

    // A memória fica com o que de fato aconteceu: a mensagem do cliente e o texto ENVIADO.
    const criadas = this.messages.filter((m) => !antes.includes(m.id)).map((m) => m.id);
    if (criadas.length) await this.session.deleteMessages(criadas);
    const guardar = [msg("user", e.novas.join("\n"))];
    if (r.respostas.length) guardar.push(msg("assistant", r.respostas.join("\n\n")));
    await this.addMessages(guardar, { broadcast: false });

    this.gravarEstado(r.estado);
    return r;
  }

  /** Apaga tudo desta conversa (LGPD, ou "recomeçar" no simulador). */
  async apagarTudo() {
    await this.clearMessages();
    this.sql`drop table if exists aurora_estado`;
  }

  async ler() {
    return { estado: this.lerEstado(), historico: this.historico() };
  }
}
