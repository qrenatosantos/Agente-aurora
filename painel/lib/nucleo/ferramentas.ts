/**
 * FERRAMENTAS do agente = endereços da API do CRM, com nomes e descrições que a IA entende.
 *
 * Modos:
 *  - "real": lê e grava no CRM.
 *  - "simulacao": LÊ o CRM de verdade (agenda, catálogo, preço), mas NÃO grava nada.
 *    As gravações são só registradas no rastro e aplicadas no estado da conversa
 *    (para a conversa seguir como se tivessem sido feitas).
 *
 * Toda chamada entra no rastro (tela "por que respondeu assim").
 */
import { variantesTelefone, type ClienteCrm, type PacoteCrm } from "./crm.ts";
import type { EstadoConversa, PassoRastro } from "./tipos.ts";
import { valoresMonetarios } from "./util.ts";

export type Modo = "real" | "simulacao";

export type ContextoFerramentas = {
  crm: ClienteCrm;
  modo: Modo;
  estado: EstadoConversa;
  pacotes: PacoteCrm[];
  rastro: PassoRastro[];
  hoje: string; // AAAA-MM-DD
  /** Telefone usado ao criar o pedido no modo real (no motor: o número do WhatsApp). */
  telefone: string | null;
  /** Título do pedido criado no modo real (no simulador: marca de teste). */
  tituloNovoPedido?: string;
  origem?: string;
};

const TIPOS = ["casamento", "15_anos", "aniversario", "formatura", "empresa", "outro"];
const CAMPOS_EVENTO = ["tipo", "nome", "data", "mes_previsto", "hora_inicio", "duracao_horas", "cidade", "uf", "local", "convidados", "convidados_faixa", "pacote", "linha", "preferencias", "observacoes"] as const;

export const DEFINICOES = [
  {
    type: "function" as const,
    function: {
      name: "registrar_dados_da_festa",
      description:
        "Grava no sistema os dados da festa assim que o cliente informar (só os campos que ele disse). Se informar a data, devolve também a disponibilidade da agenda nesse dia.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tipo: { type: "string", enum: TIPOS, description: "Tipo de evento." },
          nome: { type: "string", description: "Nome do evento ou do homenageado (ex.: 'Aniversário de 1 ano do José')." },
          data: { type: "string", description: "Data da festa no formato AAAA-MM-DD." },
          mes_previsto: { type: "string", description: "Mês previsto (AAAA-MM), quando ainda não há data." },
          hora_inicio: { type: "string", description: "Horário de início do bar, HH:MM." },
          duracao_horas: { type: "number", description: "Quantas horas de bar." },
          cidade: { type: "string" },
          uf: { type: "string", description: "Sigla do estado (ex.: MG)." },
          local: { type: "string", description: "Salão, chácara, residência…" },
          convidados: { type: "integer", description: "Número aproximado de convidados." },
          pacote: { type: "string", description: "Nome do pacote de interesse, exatamente como no catálogo." },
          linha: { type: "string", enum: ["tradicional", "premium"], description: "premium = quer drinks premium." },
          preferencias: { type: "array", items: { type: "string" }, description: "Ex.: 'opções sem álcool', 'drink personalizado com a cor da festa'." },
          observacoes: { type: "string", description: "Outros detalhes importantes para a equipe." },
          quer_ajuda_pacote: { type: "boolean", description: "true se o cliente não sabe qual pacote e quer que a equipe ajude a escolher." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_dados_do_cliente",
      description: "Grava o nome, e-mail ou cidade do cliente quando ele informar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { nome: { type: "string" }, email: { type: "string" }, cidade: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_agenda",
      description: "Consulta se uma data está livre, com vagas, lotada ou bloqueada. A agenda do sistema é a ÚNICA fonte de disponibilidade.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["data"],
        properties: { data: { type: "string", description: "AAAA-MM-DD" }, hora_inicio: { type: "string", description: "HH:MM" }, duracao_horas: { type: "number" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ver_drinks",
      description: "Lista todos os drinks do catálogo (inclusive premium e sem álcool), com descrição.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calcular_preco",
      description:
        "Calcula o preço pelas regras APROVADAS no sistema. Se a resposta vier com disponivel=false, NÃO informe valor: diga que a equipe envia na proposta.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["pacote", "convidados", "duracao_horas"],
        properties: {
          pacote: { type: "string", description: "Nome do pacote." },
          convidados: { type: "integer" },
          duracao_horas: { type: "number" },
          linha: { type: "string", enum: ["tradicional", "premium"] },
          outra_cidade: { type: "boolean", description: "true se a festa não for em Araxá." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "preparar_proposta",
      description:
        "Monta a proposta com os dados registrados e envia para a APROVAÇÃO da equipe. Use quando souber: tipo, data (ou mês), cidade, convidados e pacote (ou que o cliente quer ajuda para escolher). O cliente só recebe o link depois que a equipe aprovar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["recado_para_equipe"],
        properties: {
          recado_para_equipe: { type: "string", description: "Resumo curto para o André: o que o cliente quer, dúvidas, preferências." },
          titulo_capa: { type: "string", description: "Frase da capa, ex.: 'Um brinde ao primeiro ano do José Miguel.'" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "transferir_para_pessoa",
      description:
        "Passa a conversa para uma pessoa da equipe e você PARA de responder. Use: cliente pediu uma pessoa; desconto ou negociação de valor; reclamação; pedido fora dos pacotes; data lotada ou bloqueada; cliente insiste em saber preço ou condição que o sistema ainda não tem; você não sabe responder; tema de transferência. NÃO use só porque o preço não está cadastrado: nesse caso siga e monte a proposta.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["motivo"],
        properties: { motivo: { type: "string", description: "Motivo claro, para a equipe entender sem ler tudo." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_pedido_para_parar",
      description: "Use quando o cliente pedir para não receber mais mensagens. Depois disso você não escreve mais.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
];

export type NomeFerramenta = (typeof DEFINICOES)[number]["function"]["name"];

function limpar(args: Record<string, unknown>, campos: readonly string[]) {
  const r: Record<string, unknown> = {};
  for (const c of campos) {
    const v = args[c];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    r[c] = typeof v === "string" ? v.trim() : v;
  }
  return r;
}

function pacotePorNome(pacotes: PacoteCrm[], nome: unknown) {
  if (typeof nome !== "string") return null;
  const n = nome.trim().toLowerCase();
  return pacotes.find((p) => p.nome.toLowerCase() === n) ?? pacotes.find((p) => n.includes(p.nome.toLowerCase())) ?? null;
}

/** Garante que existe um pedido no CRM (só no modo real). */
async function garantirNegocio(ctx: ContextoFerramentas): Promise<string> {
  if (ctx.estado.negocio_id) return ctx.estado.negocio_id;
  const tel = ctx.telefone ?? ctx.estado.telefone;
  // nunca criar duplicado: procura pelo telefone (com e sem o 9) antes de criar
  if (tel) {
    for (const v of variantesTelefone(tel)) {
      const r = await ctx.crm.get<{ negocios: { id: string; codigo: string; contato?: { id: string } }[] }>(`/negocios?telefone=${v}`);
      const n = r.dados?.negocios?.[0];
      if (n) {
        ctx.estado.negocio_id = n.id;
        ctx.estado.codigo = n.codigo;
        ctx.estado.contato_id = n.contato?.id ?? null;
        ctx.rastro.push({ tipo: "ferramenta", nome: "buscar pedido pelo telefone", efeito: "leitura", argumentos: { telefone: v }, resultado: { codigo: n.codigo } });
        return n.id;
      }
    }
  }
  const corpo = {
    titulo: ctx.tituloNovoPedido,
    contato: { nome: ctx.estado.contato.nome || "Cliente do WhatsApp", telefone: tel ?? undefined, email: ctx.estado.contato.email ?? undefined, cidade: ctx.estado.contato.cidade ?? undefined },
    evento: limpar(ctx.estado.evento, CAMPOS_EVENTO),
    origem: ctx.origem ?? "WhatsApp",
  };
  const r = await ctx.crm.post<{ id: string; codigo: string; contato: { id: string } }>("/negocios", corpo);
  ctx.rastro.push({ tipo: "ferramenta", nome: "criar pedido no CRM", efeito: "gravacao", argumentos: corpo, resultado: r.dados ? { codigo: r.dados.codigo } : r.erro });
  if (!r.dados) throw new Error(r.erro?.mensagem ?? "Não foi possível criar o pedido no CRM.");
  ctx.estado.negocio_id = r.dados.id;
  ctx.estado.codigo = r.dados.codigo;
  ctx.estado.contato_id = r.dados.contato?.id ?? null;
  return r.dados.id;
}

function dataValida(v: unknown, hoje: string) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + "T12:00:00Z"))) return "Data em formato inválido (use AAAA-MM-DD).";
  if (v < hoje) return "Essa data já passou. Confirme a data com o cliente.";
  return null;
}

/** Quais dados mínimos faltam para montar a proposta. */
export function faltamParaProposta(evento: Record<string, unknown>) {
  const f: string[] = [];
  if (!evento.tipo) f.push("tipo de evento");
  if (!evento.data && !evento.mes_previsto) f.push("data ou mês previsto");
  if (!evento.cidade) f.push("cidade");
  if (!evento.convidados) f.push("número de convidados");
  if (!evento.pacote && !evento.pacote_id && !evento.quer_ajuda_pacote) f.push("pacote (ou o pedido de ajuda para escolher)");
  return f;
}

export type Efeito = { transferir?: string; parar?: boolean; avancou?: boolean };

/** Executa uma ferramenta. Devolve o que a IA vai ler (JSON) e os efeitos no turno. */
export async function executarFerramenta(nome: string, argsBrutos: string, ctx: ContextoFerramentas): Promise<{ saida: unknown; efeito: Efeito }> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsBrutos || "{}");
  } catch {
    return { saida: { erro: "Argumentos inválidos." }, efeito: {} };
  }
  const passo: PassoRastro = { tipo: "ferramenta", nome, argumentos: args };
  ctx.rastro.push(passo);
  const sim = ctx.modo === "simulacao";
  const fim = (saida: unknown, efeito: PassoRastro["efeito"], ef: Efeito = {}) => {
    passo.efeito = efeito;
    passo.resultado = saida;
    for (const v of valoresMonetarios(saida)) if (!ctx.estado.valores_do_crm.includes(v)) ctx.estado.valores_do_crm.push(v);
    return { saida, efeito: ef };
  };

  try {
    switch (nome) {
      case "consultar_agenda": {
        const erro = dataValida(args.data, ctx.hoje);
        if (erro) return fim({ erro }, "nenhum");
        const q = new URLSearchParams({ data: String(args.data) });
        if (args.hora_inicio) q.set("hora_inicio", String(args.hora_inicio));
        if (args.duracao_horas) q.set("duracao_horas", String(args.duracao_horas));
        if (ctx.estado.negocio_id) q.set("negocio_id", ctx.estado.negocio_id);
        const r = await ctx.crm.get(`/agenda/disponibilidade?${q}`);
        return fim(r.dados ?? { erro: r.erro?.mensagem }, "leitura");
      }

      case "ver_drinks": {
        const r = await ctx.crm.get<{ drinks: Record<string, unknown>[] }>("/catalogo/drinks");
        const drinks = (r.dados?.drinks ?? []).map((d) => ({ nome: d.nome, descricao: d.descricao, alcoolico: d.alcoolico, em_algum_pacote: d.em_pacote, categoria: d.categoria }));
        return fim(r.dados ? { drinks } : { erro: r.erro?.mensagem }, "leitura");
      }

      case "calcular_preco": {
        const p = pacotePorNome(ctx.pacotes, args.pacote);
        if (!p) return fim({ erro: `Pacote "${String(args.pacote)}" não existe. Pacotes: ${ctx.pacotes.map((x) => x.nome).join(", ")}.` }, "nenhum");
        const corpo = { pacote_id: p.id, convidados: args.convidados, duracao_horas: args.duracao_horas, linha: args.linha, outra_cidade: args.outra_cidade };
        const r = await ctx.crm.post<Record<string, unknown>>("/precos/calcular", corpo);
        const d = r.dados;
        // A IA recebe só o necessário: os "motivos" internos da calculadora não vão para o cliente.
        const saida = !d
          ? { erro: r.erro?.mensagem }
          : d.disponivel
            ? { disponivel: true, pacote: p.nome, preco: d.preco, observacao: "Valor calculado pelas regras aprovadas. Pode informar." }
            : { disponivel: false, orientacao: "Preço ainda não definido no sistema. NÃO informe valor; diga que a equipe envia na proposta." };
        return fim(saida, "leitura");
      }

      case "registrar_dados_da_festa": {
        const dados = limpar(args, CAMPOS_EVENTO);
        if (dados.tipo && !TIPOS.includes(String(dados.tipo))) delete dados.tipo;
        if (dados.data) {
          const erro = dataValida(dados.data, ctx.hoje);
          if (erro) return fim({ erro }, "nenhum");
        }
        if (dados.pacote) {
          const p = pacotePorNome(ctx.pacotes, dados.pacote);
          if (!p) return fim({ erro: `Pacote "${String(dados.pacote)}" não existe. Pacotes: ${ctx.pacotes.map((x) => x.nome).join(", ")}.` }, "nenhum");
          dados.pacote = p.nome;
        }
        if (args.quer_ajuda_pacote === true) ctx.estado.evento.quer_ajuda_pacote = true; // fica no estado; o CRM recebe pela observação
        if (args.quer_ajuda_pacote === true && !dados.pacote) dados.observacoes = [dados.observacoes, "Cliente quer ajuda para escolher o pacote."].filter(Boolean).join(" ");
        const novo = Object.entries(dados).some(([k, v]) => JSON.stringify(ctx.estado.evento[k]) !== JSON.stringify(v));
        if (sim) {
          Object.assign(ctx.estado.evento, dados);
          let disponibilidade: unknown = undefined;
          if (dados.data) disponibilidade = (await ctx.crm.get(`/agenda/disponibilidade?data=${dados.data}`)).dados;
          return fim({ gravado: true, evento: ctx.estado.evento, disponibilidade }, "simulada", { avancou: novo });
        }
        const id = await garantirNegocio(ctx);
        const r = await ctx.crm.put<{ evento: Record<string, unknown>; disponibilidade?: unknown }>(`/negocios/${id}/evento`, dados);
        if (!r.dados) return fim({ erro: r.erro?.mensagem }, "gravacao");
        ctx.estado.evento = r.dados.evento ?? { ...ctx.estado.evento, ...dados };
        return fim({ gravado: true, evento: r.dados.evento, disponibilidade: r.dados.disponibilidade }, "gravacao", { avancou: novo });
      }

      case "registrar_dados_do_cliente": {
        const dados = limpar(args, ["nome", "email", "cidade"]);
        const novo = Object.entries(dados).some(([k, v]) => (ctx.estado.contato as Record<string, unknown>)[k] !== v);
        Object.assign(ctx.estado.contato, dados);
        if (sim) return fim({ gravado: true, contato: ctx.estado.contato }, "simulada", { avancou: novo });
        await garantirNegocio(ctx);
        if (!ctx.estado.contato_id) return fim({ erro: "Contato não encontrado." }, "nenhum");
        const r = await ctx.crm.patch(`/contatos/${ctx.estado.contato_id}`, dados);
        return fim(r.dados ? { gravado: true } : { erro: r.erro?.mensagem }, "gravacao", { avancou: novo });
      }

      case "preparar_proposta": {
        if (ctx.estado.proposta && ["aguardando_aprovacao", "aprovada", "enviada"].includes(ctx.estado.proposta.status)) {
          return fim({ erro: `Já existe a proposta ${ctx.estado.proposta.numero ?? ""} (${ctx.estado.proposta.status}). Aguarde a equipe.` }, "nenhum");
        }
        const faltam = faltamParaProposta(ctx.estado.evento);
        if (faltam.length) return fim({ ok: false, faltam, orientacao: "Pergunte ao cliente o que falta antes de preparar a proposta." }, "nenhum");
        if (sim) {
          const p = pacotePorNome(ctx.pacotes, ctx.estado.evento.pacote);
          let preco: { disponivel: boolean; preco?: number } = { disponivel: false };
          if (p && ctx.estado.evento.convidados && ctx.estado.evento.duracao_horas) {
            const r = await ctx.crm.post<{ disponivel: boolean; preco?: number }>("/precos/calcular", { pacote_id: p.id, convidados: ctx.estado.evento.convidados, duracao_horas: ctx.estado.evento.duracao_horas });
            preco = r.dados ?? preco;
          }
          ctx.estado.proposta = { id: null, numero: "(simulação)", status: "aguardando_aprovacao", simulada: true, total: preco.disponivel ? (preco.preco ?? null) : null, preco_pendente: !preco.disponivel };
          return fim({ ok: true, numero: "(simulação)", status: "aguardando_aprovacao", preco_pendente: !preco.disponivel, orientacao: "Avise o cliente que a equipe vai revisar e que você manda o link assim que for aprovada." }, "simulada", { avancou: true });
        }
        const id = await garantirNegocio(ctx);
        const criada = await ctx.crm.post<{ id: string; numero: string; total: number; preco_pendente: boolean }>(`/negocios/${id}/propostas`, { nota: args.recado_para_equipe, capa_titulo: args.titulo_capa });
        if (!criada.dados) return fim({ erro: criada.erro?.mensagem }, "gravacao");
        const sub = await ctx.crm.post<{ status: string }>(`/propostas/${criada.dados.id}/submeter`, { nota: args.recado_para_equipe });
        ctx.estado.proposta = { id: criada.dados.id, numero: criada.dados.numero, status: sub.dados?.status ?? "rascunho", simulada: false, total: criada.dados.total, preco_pendente: criada.dados.preco_pendente };
        return fim(
          { ok: Boolean(sub.dados), numero: criada.dados.numero, status: ctx.estado.proposta.status, preco_pendente: criada.dados.preco_pendente, erro: sub.erro?.mensagem, orientacao: "Avise o cliente que a equipe vai revisar e que você manda o link assim que for aprovada." },
          "gravacao",
          { avancou: true },
        );
      }

      case "transferir_para_pessoa": {
        const motivo = String(args.motivo ?? "").trim() || "O agente pediu atendimento humano.";
        if (!sim && ctx.estado.negocio_id) {
          const r = await ctx.crm.post(`/negocios/${ctx.estado.negocio_id}/transferir-humano`, { motivo });
          return fim(r.dados ? { transferido: true } : { erro: r.erro?.mensagem }, "gravacao", { transferir: motivo });
        }
        return fim({ transferido: true }, sim ? "simulada" : "nenhum", { transferir: motivo });
      }

      case "registrar_pedido_para_parar":
        return fim({ registrado: true }, sim ? "simulada" : "nenhum", { parar: true });

      default:
        return fim({ erro: `Ferramenta desconhecida: ${nome}` }, "nenhum");
    }
  } catch (e) {
    passo.erro = e instanceof Error ? e.message : String(e);
    return { saida: { erro: passo.erro }, efeito: {} };
  }
}
