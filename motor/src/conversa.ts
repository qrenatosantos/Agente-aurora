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
import { juntarEtapas } from "../../painel/lib/nucleo/util.ts";
import { MAX_HISTORICO, motorOpenAI, type MotorIA, type PedidoIA, type UsoIA } from "../../painel/lib/nucleo/motor-ia.ts";
import { ErroIA } from "../../painel/lib/nucleo/openai.ts";
import { estadoInicial, type ConfigAgente, type EstadoConversa, type ItemConhecimento, type MensagemConversa, type ResultadoTurno } from "../../painel/lib/nucleo/tipos.ts";
import { ligarConversaInterno } from "../../painel/lib/banco/avisos.ts";
import { registrarUsoAgente } from "../../painel/lib/banco/operacao.ts";
import { carregarAmbiente } from "./ambiente.ts";
import type { Env } from "./env.ts";
import { quandoMandar } from "./lembretes.ts";
import { ClienteWhatsApp, type MensagemRecebida, transcrever } from "./whatsapp.ts";

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
  /** Estado de partida, usado só se a conversa ainda não existir (ex.: simulação de um pedido do CRM). */
  estadoInicial?: Partial<EstadoConversa>;
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
  private textosEtapas: string[] = [];
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
      maxOutputTokens: 500,
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
    // a resposta é o texto de todos os passos: a IA às vezes escreve, consulta o sistema e continua
    // (repetição entre os passos é cortada depois, em dividirMensagens)
    const t = (s.text ?? "").trim();
    if (t) this.textosEtapas.push(t);
    this.textoFinal = juntarEtapas(this.textosEtapas);
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
        this.textosEtapas = [];
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
  private lerEstado(partida?: Partial<EstadoConversa>): EstadoConversa {
    this.sql`create table if not exists aurora_estado (id integer primary key, json text not null)`;
    const linha = this.sql<{ json: string }>`select json from aurora_estado where id = 1`[0];
    return linha ? (JSON.parse(linha.json) as EstadoConversa) : estadoInicial(partida ?? {});
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
    const estado = this.lerEstado(e.estadoInicial);
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

  // ------------------------------------------------------------------ WhatsApp
  private tabelasWhatsApp() {
    this.sql`create table if not exists aurora_recebidas (wamid text primary key, em text not null)`;
    this.sql`create table if not exists aurora_pendentes (wamid text primary key, tipo text not null, texto text, midia text, em text not null)`;
    this.sql`create table if not exists aurora_canal (id integer primary key, telefone text not null, nome text, ultima_em text not null)`;
    this.sql`create table if not exists aurora_propostas (proposta_id text primary key, enviada_em text not null, aberta_em text, encerrada integer not null default 0, lembrete_nao_aberta_em text, lembrete_aberta_em text)`;
  }

  /** Primeiro nome do cliente para as mensagens prontas (", Juliana"), ou vazio se não souber. */
  private nomeParaMensagem(estado: EstadoConversa) {
    const n = (estado.contato.nome ?? "").trim();
    return n && !/^cliente( do whatsapp)?$/i.test(n) ? `, ${n.split(/\s+/)[0]}` : "";
  }

  private whatsapp(amb: Awaited<ReturnType<typeof carregarAmbiente>>) {
    const w = amb.whatsapp;
    return w ? new ClienteWhatsApp(w.token, w.phoneNumberId, w.versao, this.env.GRAPH_BASE_URL || undefined) : null;
  }

  /**
   * Chegou uma mensagem do cliente pelo WhatsApp. Guarda e espera alguns segundos (configurável no painel)
   * para juntar as mensagens que chegam seguidas; então responde tudo de uma vez (responderPendentes).
   * A mesma mensagem (mesmo wamid) nunca é processada duas vezes, mesmo que a Meta reenvie o aviso.
   */
  async receberWhatsApp(m: MensagemRecebida): Promise<{ nova: boolean }> {
    this.tabelasWhatsApp();
    if (this.sql`select 1 from aurora_recebidas where wamid = ${m.wamid}`.length) return { nova: false };
    const agora = new Date().toISOString();
    this.sql`insert into aurora_recebidas (wamid, em) values (${m.wamid}, ${agora})`;
    this.sql`insert into aurora_pendentes (wamid, tipo, texto, midia, em) values (${m.wamid}, ${m.tipo}, ${m.texto}, ${m.midiaId}, ${m.em})`;
    this.sql`insert into aurora_canal (id, telefone, nome, ultima_em) values (1, ${m.de}, ${m.nome}, ${agora})
             on conflict(id) do update set telefone = excluded.telefone, nome = coalesce(excluded.nome, aurora_canal.nome), ultima_em = excluded.ultima_em`;
    await this.schedule(await this.esperaSegundos(), "responderPendentes");
    // "digitando…" em segundo plano (a Meta recebe a confirmação sem esperar por isto).
    // Só quando o agente vai mesmo responder: não com a conversa com uma pessoa nem com quem pediu para parar.
    const estado = this.lerEstado();
    if (estado.atendimento !== "agente" || estado.optout) return { nova: true };
    this.ctx.waitUntil(
      (async () => {
        const amb = await carregarAmbiente(this.env);
        if (!amb.pausado) await this.whatsapp(amb)?.digitando(m.wamid);
      })().catch((e) => console.error("[digitando]", e)),
    );
    return { nova: true };
  }

  private async esperaSegundos() {
    const r = await this.env.DB.prepare("select espera_segundos from agente_config where id = 1").first<{ espera_segundos: number }>();
    return Math.min(Math.max(Number(r?.espera_segundos ?? 8), 2), 30);
  }

  /** Responde as mensagens guardadas (chamado pelo agendamento). */
  async responderPendentes() {
    this.tabelasWhatsApp();
    const canal = this.sql<{ telefone: string; nome: string | null; ultima_em: string }>`select telefone, nome, ultima_em from aurora_canal where id = 1`[0];
    if (!canal) return;
    // ainda chegando mensagem? espera completar o tempo desde a ÚLTIMA
    const espera = await this.esperaSegundos();
    const falta = new Date(canal.ultima_em).getTime() + espera * 1000 - Date.now();
    if (falta > 500) {
      await this.schedule(Math.ceil(falta / 1000), "responderPendentes");
      return;
    }
    const pendentes = this.sql<{ wamid: string; tipo: string; texto: string | null; midia: string | null }>`select wamid, tipo, texto, midia from aurora_pendentes order by em`;
    if (!pendentes.length) return;
    for (const p of pendentes) this.sql`delete from aurora_pendentes where wamid = ${p.wamid}`;

    const amb = await carregarAmbiente(this.env);
    const wa = this.whatsapp(amb);
    if (!wa) return console.error("[whatsapp] sem token ou número configurado no painel");

    // textos (áudio vira texto, se a transcrição estiver ligada)
    const novas: string[] = [];
    let soMidia = false;
    for (const p of pendentes) {
      if ((p.tipo === "texto" || p.tipo === "botao") && p.texto?.trim()) novas.push(p.texto.trim());
      else if (p.tipo === "audio" && p.midia && amb.transcreverAudio && amb.chaveIA) {
        try {
          const t = await transcrever(await wa.baixarMidia(p.midia), amb.chaveIA, this.env.OPENAI_BASE_URL || undefined);
          if (t) novas.push(t);
          else soMidia = true;
        } catch (e) {
          console.error("[audio]", e);
          soMidia = true;
        }
      } else soMidia = true;
    }

    const estado = this.lerEstado();
    const podeFalar = !amb.pausado && !estado.optout && estado.atendimento === "agente";
    if (!novas.length) {
      // só imagem, vídeo, figurinha…: avisa (com as palavras do painel) e não chama a IA
      if (soMidia && podeFalar && amb.cfg.mensagens.midia) await wa.enviarTexto(canal.telefone, amb.cfg.mensagens.midia);
      return;
    }

    const noLimite = amb.limite.pararNoLimite && amb.limite.gastoMes >= amb.limite.valor;
    if (noLimite) console.warn("[limite] gasto do mês atingido: o agente não responde até o gestor aumentar o limite");
    if (!amb.crm || !amb.chaveIA) {
      // Integração incompleta no painel: o cliente não fica sem resposta. Avisa com a mensagem de erro do painel.
      // (Não marca a conversa como "com uma pessoa": assim, quando o gestor completar o painel, o agente segue.)
      console.error("[whatsapp] CRM ou chave da OpenAI não configurados no painel");
      if (podeFalar) {
        await wa.enviarTexto(canal.telefone, amb.cfg.mensagens.erro ?? "Tive um probleminha aqui. Já chamei alguém da equipe.");
        await this.addMessages([msg("user", novas.join("\n")), msg("assistant", amb.cfg.mensagens.erro ?? "")], { broadcast: false });
      }
      return;
    }

    const r = await this.turno({
      novas,
      modo: "real",
      cfg: amb.cfg,
      conhecimento: amb.conhecimento,
      crm: amb.crm,
      chaveIA: amb.chaveIA,
      telefone: canal.telefone,
      pausado: amb.pausado || noLimite,
    });
    for (const t of r.respostas) {
      try {
        await wa.enviarTexto(canal.telefone, t);
      } catch (e) {
        // ex.: número de teste da Meta só entrega para os destinatários cadastrados (erro 131030)
        console.error(`[whatsapp] a Meta recusou a entrega para ${canal.telefone.slice(0, 4)}…: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    // guarda qual conversa atende este pedido (para os avisos do CRM, como "proposta aprovada")
    if (r.estado.negocio_id) {
      await ligarConversaInterno(this.env.DB, { negocioId: r.estado.negocio_id, conversa: this.name, telefone: canal.telefone, ultimaDoCliente: canal.ultima_em }).catch((e) =>
        console.error("[ligar conversa]", e),
      );
    }
    if (r.uso.chamadas) {
      await registrarUsoAgente(this.env.DB, { modelo: r.uso.modelo, entrada: r.uso.entrada, cache: r.uso.cache, saida: r.uso.saida, custo: Number((r.uso.custo_usd ?? 0).toFixed(6)) });
    }
  }

  /**
   * Aviso do CRM: o gestor APROVOU a proposta. Pede o link ao CRM (marca como enviada) e manda ao cliente, na mesma
   * conversa. Só dentro da janela de 24 h desde a última mensagem do cliente (fora dela, a Meta cobra e exige modelo
   * aprovado: fica para a equipe). Devolve o que aconteceu, para o registro do aviso.
   */
  async enviarPropostaAprovada(d: { propostaId: string; negocioId: string }): Promise<string> {
    this.tabelasWhatsApp();
    const estado = this.lerEstado();
    if (estado.negocio_id !== d.negocioId) return "esta conversa não é deste pedido";
    if (estado.optout) return "cliente pediu para não receber mensagens";
    const canal = this.sql<{ telefone: string; ultima_em: string }>`select telefone, ultima_em from aurora_canal where id = 1`[0];
    if (!canal) return "conversa sem telefone";
    const horas = (Date.now() - new Date(canal.ultima_em).getTime()) / 3600_000;
    if (horas > 23.5) return `fora da janela de 24 h (última mensagem do cliente há ${Math.round(horas)} h): a equipe envia`;
    const amb = await carregarAmbiente(this.env);
    const wa = this.whatsapp(amb);
    if (!wa || !amb.crm) return "WhatsApp ou CRM não configurados";
    const crm = new ClienteCrm(amb.crm.endereco, amb.crm.chave);
    if (this.sql`select 1 from aurora_propostas where proposta_id = ${d.propostaId}`.length) return "link já enviado antes por esta conversa";
    // aprovada: a Cecília marca como enviada e pega o link. Se o gestor já usou "Aprovar e enviar" (ou a conversa está
    // com uma pessoa, e o CRM não deixa o agente alterar), o link é só lido da proposta.
    let r = await crm.post<{ link?: string | null; numero?: string }>(`/propostas/${d.propostaId}/enviar`);
    if (!r.dados?.link) {
      const lida = await crm.get<{ link?: string | null; numero?: string }>(`/propostas/${d.propostaId}`);
      if (lida.dados?.link) r = lida;
    }
    if (!r.dados?.link) return `o CRM não liberou o link: ${r.erro?.mensagem ?? "sem link"}`;
    const link = r.dados.link.startsWith("/") ? `${amb.crm.endereco.replace(/\/+$/, "")}${r.dados.link}` : r.dados.link;
    const nome = this.nomeParaMensagem(estado);
    const modelo = amb.cfg.mensagens.proposta_aprovada ?? "Sua proposta está pronta{nome}! 🥂\n\nÉ só abrir o link para ver todos os detalhes e, se estiver tudo certo, aceitar por lá mesmo:\n{link}\n\nQualquer dúvida, é só me chamar por aqui.";
    const texto = modelo.replaceAll("{nome}", nome).replaceAll("{link}", link);
    await wa.enviarTexto(canal.telefone, texto);
    await this.addMessages([msg("assistant", texto)], { broadcast: false });
    this.gravarEstado({ ...estado, proposta: estado.proposta ? { ...estado.proposta, status: "enviada" } : estado.proposta });
    this.sql`insert into aurora_propostas (proposta_id, enviada_em) values (${d.propostaId}, ${new Date().toISOString()}) on conflict(proposta_id) do nothing`;
    await this.schedule(amb.lembretes.naoAbertaMin * 60, "lembreteProposta", { propostaId: d.propostaId, tipo: "nao_aberta" });
    return `link enviado ao cliente (${r.dados.numero ?? "proposta"}); lembrete em ${amb.lembretes.naoAbertaMin} min se não abrir`;
  }

  /** Aviso do CRM: o cliente ABRIU a proposta. Agenda o "o que achou?" (se ele não falar nada até lá). */
  async propostaAberta(propostaId: string): Promise<string> {
    this.tabelasWhatsApp();
    const linha = this.sql<{ aberta_em: string | null }>`select aberta_em from aurora_propostas where proposta_id = ${propostaId}`[0];
    if (!linha) return "proposta não foi enviada por esta conversa";
    if (linha.aberta_em) return "já tinha sido aberta";
    this.sql`update aurora_propostas set aberta_em = ${new Date().toISOString()} where proposta_id = ${propostaId}`;
    const amb = await carregarAmbiente(this.env);
    await this.schedule(amb.lembretes.abertaMin * 60, "lembreteProposta", { propostaId, tipo: "aberta" });
    return `cliente abriu; lembrete em ${amb.lembretes.abertaMin} min se não responder`;
  }

  /** Aviso do CRM: proposta aceita ou recusada. Cancela os lembretes. */
  async propostaEncerrada(propostaId: string): Promise<string> {
    this.tabelasWhatsApp();
    this.sql`update aurora_propostas set encerrada = 1 where proposta_id = ${propostaId}`;
    return "lembretes cancelados";
  }

  /**
   * Lembrete da proposta (agendado). Manda UMA vez cada tipo, só se: a conversa está com a Cecília, o cliente não
   * respondeu desde o envio (ou desde que abriu), a proposta não foi aceita/recusada, entre 8h e 21h e dentro da janela
   * de 24 h (grátis). Fora do horário, reagenda para as 8h; fora da janela, desiste.
   */
  async lembreteProposta(p: { propostaId: string; tipo: "aberta" | "nao_aberta" }) {
    this.tabelasWhatsApp();
    const pr = this.sql<{ enviada_em: string; aberta_em: string | null; encerrada: number; lembrete_nao_aberta_em: string | null; lembrete_aberta_em: string | null }>`
      select enviada_em, aberta_em, encerrada, lembrete_nao_aberta_em, lembrete_aberta_em from aurora_propostas where proposta_id = ${p.propostaId}`[0];
    const canal = this.sql<{ telefone: string; ultima_em: string }>`select telefone, ultima_em from aurora_canal where id = 1`[0];
    const estado = this.lerEstado();
    const motivo = (m: string) => console.log(`[lembrete ${p.tipo}] não mandado: ${m}`);
    if (!pr || !canal) return motivo("sem proposta ou conversa");
    if (pr.encerrada) return motivo("proposta aceita ou recusada");
    if (p.tipo === "nao_aberta" && pr.aberta_em) return motivo("o cliente já abriu");
    if ((p.tipo === "aberta" ? pr.lembrete_aberta_em : pr.lembrete_nao_aberta_em)) return motivo("já mandado");
    if (estado.atendimento !== "agente" || estado.optout) return motivo("conversa com uma pessoa ou cliente pediu para parar");
    const referencia = p.tipo === "aberta" ? pr.aberta_em! : pr.enviada_em;
    if (new Date(canal.ultima_em) > new Date(referencia)) return motivo("o cliente já respondeu");
    const decisao = quandoMandar(new Date(), new Date(canal.ultima_em));
    if (decisao.acao === "desistir") return motivo(decisao.motivo);
    if (decisao.acao === "reagendar") {
      await this.schedule(decisao.em, "lembreteProposta", p);
      return console.log(`[lembrete ${p.tipo}] reagendado para ${decisao.em.toISOString()} (fora do horário)`);
    }
    const amb = await carregarAmbiente(this.env);
    const wa = this.whatsapp(amb);
    if (!wa || amb.pausado) return motivo("WhatsApp não configurado ou agente pausado");
    const nome = this.nomeParaMensagem(estado);
    const padrao =
      p.tipo === "aberta"
        ? "E aí{nome}, o que achou da proposta? Ficou alguma dúvida? Estou por aqui pra te ajudar 🙂"
        : "Oi{nome}! Conseguiu dar uma olhada na proposta que te mandei? Se ficou alguma dúvida, é só me chamar por aqui.";
    const texto = (amb.cfg.mensagens[p.tipo === "aberta" ? "retomada_aberta" : "retomada_nao_aberta"] ?? padrao).replaceAll("{nome}", nome);
    await wa.enviarTexto(canal.telefone, texto);
    await this.addMessages([msg("assistant", texto)], { broadcast: false });
    if (p.tipo === "aberta") this.sql`update aurora_propostas set lembrete_aberta_em = ${new Date().toISOString()} where proposta_id = ${p.propostaId}`;
    else this.sql`update aurora_propostas set lembrete_nao_aberta_em = ${new Date().toISOString()} where proposta_id = ${p.propostaId}`;
    console.log(`[lembrete ${p.tipo}] mandado`);
  }

  /** Apaga tudo desta conversa (LGPD, ou "recomeçar" no simulador). */
  async apagarTudo() {
    await this.clearMessages();
    this.sql`drop table if exists aurora_estado`;
    this.sql`drop table if exists aurora_pendentes`;
    this.sql`drop table if exists aurora_canal`;
    this.sql`drop table if exists aurora_propostas`;
    // aurora_recebidas fica (só ids da Meta, sem conteúdo): impede reprocessar um aviso antigo reenviado
  }

  /**
   * Aviso do CRM: a equipe devolveu a conversa para a Cecília. Se o cliente escreveu enquanto estava com uma pessoa
   * e ninguém respondeu, a Cecília responde agora (só dentro da janela grátis de 24 h).
   */
  async retomarAtendimento(): Promise<string> {
    this.tabelasWhatsApp();
    const canal = this.sql<{ ultima_em: string }>`select ultima_em from aurora_canal where id = 1`[0];
    if (!canal) return "conversa sem WhatsApp";
    if (Date.now() - new Date(canal.ultima_em).getTime() > 23.5 * 3600 * 1000) return "cliente sem responder há mais de 24 h: não escreve";
    const ultimas: typeof this.messages = [];
    for (const m of [...this.messages].reverse()) {
      if (m.role === "assistant" && textoDe(m)) break;
      if (m.role === "user") ultimas.unshift(m);
    }
    const textos = ultimas.map((m) => textoDe(m)).filter((t): t is string => Boolean(t?.trim()));
    if (!textos.length) return "nada pendente do cliente";
    // as mensagens voltam para a fila e são respondidas como se tivessem acabado de chegar
    await this.session.deleteMessages(ultimas.map((m) => m.id));
    for (const [i, t] of textos.entries()) {
      this.sql`insert or replace into aurora_pendentes (wamid, tipo, texto, midia, em) values (${`retomada-${Date.now()}-${i}`}, 'texto', ${t}, ${null}, ${new Date().toISOString()})`;
    }
    await this.schedule(1, "responderPendentes");
    return `respondendo ${textos.length} mensagem(ns) que ficaram sem resposta`;
  }

  async ler() {
    return { estado: this.lerEstado(), historico: this.historico() };
  }
}
