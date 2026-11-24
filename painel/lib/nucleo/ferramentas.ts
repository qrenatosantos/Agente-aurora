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
        "Grava no sistema os dados da festa assim que o cliente informar (só os campos que ele disse). Quando houver data, devolve também a disponibilidade da agenda (com o horário, se já souber).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tipo: { type: "string", enum: TIPOS, description: "Tipo de evento." },
          nome: { type: "string", description: "Nome do evento ou do homenageado (ex.: 'Aniversário de 1 ano do José')." },
          data: { type: "string", description: "Data da festa no formato AAAA-MM-DD." },
          mes_previsto: { type: "string", description: "Mês previsto (AAAA-MM), quando ainda não há data." },
          hora_inicio: { type: "string", description: "Horário de início do bar, HH:MM." },
          duracao_horas: { type: "number", description: "Horas de bar. NÃO pergunte: o serviço tem duração padrão. Só grave se o cliente pedir outra duração ou para baratear." },
          cidade: { type: "string" },
          uf: { type: "string", description: "Sigla do estado (ex.: MG)." },
          local: { type: "string", description: "Salão, chácara, residência…" },
          convidados: { type: "integer", description: "Número aproximado de convidados." },
          pacote: { type: "string", description: "Nome do pacote, exatamente como no catálogo. SÓ quando o CLIENTE escolheu esse pacote. NÃO grave quando ele pediu drinks soltos, está comparando ou quer proposta personalizada." },
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
      description:
        "Consulta se a equipe está livre numa data e horário (a conta já inclui a folga da equipe antes e depois de cada festa). A agenda do sistema é a ÚNICA fonte de disponibilidade. Use para conferir outra data ou horário que o cliente sugerir.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["data"],
        properties: { data: { type: "string", description: "AAAA-MM-DD" }, hora_inicio: { type: "string", description: "HH:MM. Sem horário, usa o da festa registrada." }, duracao_horas: { type: "number", description: "Só se não for a duração padrão." } },
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
        required: ["convidados"],
        properties: {
          pacote: { type: "string", description: "Nome do pacote. Ou use drinks para uma proposta personalizada." },
          drinks: { type: "array", items: { type: "string" }, description: "Proposta personalizada: nomes dos drinks escolhidos (do catálogo), no lugar do pacote." },
          convidados: { type: "integer" },
          duracao_horas: { type: "number", description: "Só se não for a duração padrão." },
          sem_vidraria: { type: "boolean", description: "true = copos descartáveis no lugar da vidraria." },
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
        "Monta a proposta com os dados registrados e envia para a APROVAÇÃO da equipe. Use quando souber: nome do cliente, tipo, data (ou mês), cidade, convidados e o que vai no bar: um pacote que o CLIENTE escolheu, ou os drinks que ele escolheu (proposta personalizada, em drinks). Se faltar algo, PERGUNTE ao cliente antes. Nunca escolha o pacote pelo cliente. O cliente só recebe o link depois que a equipe aprovar. Se a proposta anterior já foi aprovada, enviada ou recusada e o cliente quer mudar algo (grave antes os dados novos), esta ferramenta cria uma NOVA VERSÃO, que volta para a equipe aprovar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["recado_para_equipe"],
        properties: {
          recado_para_equipe: { type: "string", description: "Resumo curto para o André: o que o cliente quer, dúvidas, preferências." },
          titulo_capa: { type: "string", description: "Frase da capa, ex.: 'Um brinde ao primeiro ano do José Miguel.'" },
          drinks: {
            type: "array",
            items: { type: "string" },
            description: "SÓ para proposta personalizada que o cliente CONFIRMOU: os nomes exatos dos drinks do catálogo que ele escolheu. Vazio = usa os drinks do pacote registrado.",
          },
          sem_vidraria: { type: "boolean", description: "true = o cliente escolheu copos descartáveis no lugar da vidraria." },
          dias: {
            type: "array",
            description: "SÓ para festa em MAIS DE UM DIA (mesma proposta): cada dia com a data e as pessoas daquele dia. O sistema soma os convidados, confere a agenda de todos os dias e escreve Dia 1, Dia 2… na proposta.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["data", "convidados"],
              properties: { data: { type: "string", description: "AAAA-MM-DD" }, convidados: { type: "integer" }, hora_inicio: { type: "string", description: "HH:MM, se for diferente do horário da festa" } },
            },
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "transferir_para_pessoa",
      description:
        "Passa a conversa para uma pessoa da equipe e você PARA de responder. Use: cliente pediu uma pessoa; cliente INSISTE em desconto ou negociação DEPOIS de VOCÊ já ter oferecido, nesta conversa, as formas de economizar das instruções e ele recusar (se você ainda não ofereceu as opções, NÃO transfira: ofereça agora, mesmo que a conversa já tenha passado pela equipe antes); reclamação; pedido que nem os pacotes nem uma proposta personalizada com drinks do catálogo atendem; data lotada ou bloqueada SÓ depois de oferecer outra data ou horário e o cliente dizer que não tem outra opção (motivo: 'Limite de capacidade em <data> às <hora>'); cliente pede outra condição de pagamento (outra entrada, parcelar, outro prazo: não negocie, diga que vai verificar com a equipe e ponha o pedido no motivo); cliente insiste em saber preço ou condição que o sistema ainda não tem; você não sabe responder; tema de transferência. NÃO use só porque o preço não está cadastrado: nesse caso siga e monte a proposta. NÃO use quando o cliente quer MUDAR a proposta (drinks, horas, convidados, vidraria): pergunte o que muda, grave, confirme e use preparar_proposta (se a proposta foi aprovada, enviada ou recusada, ela cria uma nova versão para a equipe aprovar). Só transfira MUDANÇA PEDIDA pelo cliente se a proposta ainda estiver aguardando aprovação (com a mudança no motivo) ou se já foi aceita. NUNCA transfira por PERGUNTA sobre a proposta (quanto tempo demora, quando chega o link, o que está incluído): responda você mesma (prazo: a regra das instruções).",
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

const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Proposta personalizada: troca nomes de drinks pelos ids do catálogo. Devolve o erro se algum não existir. */
async function drinksPorNome(ctx: ContextoFerramentas, nomes: unknown): Promise<{ ids: string[]; nomes: string[] } | { erro: string } | null> {
  if (!Array.isArray(nomes) || !nomes.length) return null;
  const r = await ctx.crm.get<{ drinks: { id: string; nome: string }[] }>("/catalogo/drinks");
  const catalogo = r.dados?.drinks ?? [];
  if (!catalogo.length) return { erro: r.erro?.mensagem ?? "Catálogo de drinks indisponível." };
  const achados: { id: string; nome: string }[] = [];
  const faltam: string[] = [];
  for (const n of nomes.map((x) => normal(String(x)))) {
    const d = catalogo.find((c) => normal(c.nome) === n) ?? catalogo.find((c) => normal(c.nome).includes(n) || n.includes(normal(c.nome)));
    if (d) achados.some((a) => a.id === d.id) || achados.push(d);
    else faltam.push(String(n));
  }
  if (faltam.length) return { erro: `Não estão no catálogo: ${faltam.join(", ")}. Drinks do catálogo: ${catalogo.map((c) => c.nome).join(", ")}. Confirme com o cliente.` };
  return { ids: achados.map((a) => a.id), nomes: achados.map((a) => a.nome) };
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

type Disponibilidade = { data?: string; hora_inicio?: string | null; hora_fim?: string | null; situacao?: string; motivo_bloqueio?: string | null; vagas?: number };

/** O que a IA lê da agenda: a situação e o que fazer (sem detalhes das outras festas nem número de vagas). */
export function orientarAgenda(d: Disponibilidade | null | undefined, estado: EstadoConversa): unknown {
  if (!d?.situacao) return d ?? undefined;
  const base = { data: d.data, hora_inicio: d.hora_inicio ?? null, hora_fim: d.hora_fim ?? null };
  const proximo = "Só se o cliente não tiver outra opção, transfira para a equipe com o motivo 'Limite de capacidade em <data> às <hora>'.";
  if (d.situacao === "bloqueada") {
    estado.agenda_cheia = String(d.data);
    return { ...base, situacao: "indisponivel", orientacao: `A equipe não está disponível nessa data. NÃO ofereça a data e não transfira agora: diga com delicadeza que essa data já está comprometida e pergunte se há outra data possível (consulte de novo). ${proximo}` };
  }
  if (d.situacao === "lotada") {
    if (!d.hora_inicio) return { ...base, situacao: "depende_do_horario", orientacao: "Sem o horário não dá para saber se cabe. Pergunte o horário de início da festa e consulte de novo. NÃO diga que a data está cheia." };
    estado.agenda_cheia = `${d.data} ${d.hora_inicio}`;
    return { ...base, situacao: "indisponivel", orientacao: `Nesse dia e horário a equipe já está comprometida (a conta inclui deslocamento e montagem). NÃO ofereça esse horário e não transfira agora: diga que nesse horário a agenda já está comprometida e pergunte se dá para outro horário ou outra data (consulte de novo). ${proximo}` };
  }
  return { ...base, situacao: "tem_vaga", orientacao: "Tem vaga. Siga, sem prometer nem garantir a data e sem dizer quantas vagas restam." };
}

function consultaAgenda(ctx: ContextoFerramentas, data: unknown, hora?: unknown, duracao?: unknown) {
  const q = new URLSearchParams({ data: String(data) });
  if (hora) q.set("hora_inicio", String(hora));
  if (duracao) q.set("duracao_horas", String(duracao));
  if (ctx.estado.negocio_id) q.set("negocio_id", ctx.estado.negocio_id);
  return ctx.crm.get<Disponibilidade>(`/agenda/disponibilidade?${q}`);
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Festa em mais de um dia: lista em ordem, total de convidados e os textos "Dia 1 (18/12): 120 pessoas · Dia 2…". */
export function festaEmDias(bruto: unknown, hoje: string): { lista: { data: string; convidados: number; hora_inicio?: string }[]; total: number; texto: string; recado: string } | { erro: string } | null {
  if (!Array.isArray(bruto) || bruto.length < 2) return null;
  const lista = bruto.map((d) => ({ data: String(d?.data ?? ""), convidados: Number(d?.convidados), hora_inicio: d?.hora_inicio ? String(d.hora_inicio) : undefined }));
  for (const d of lista) {
    const erro = dataValida(d.data, hoje);
    if (erro) return { erro: `Dia ${d.data}: ${erro}` };
    if (!Number.isInteger(d.convidados) || d.convidados <= 0) return { erro: `Falta o número de pessoas do dia ${d.data}. Pergunte ao cliente.` };
  }
  lista.sort((a, b) => a.data.localeCompare(b.data));
  if (new Set(lista.map((d) => d.data)).size !== lista.length) return { erro: "Há dias repetidos. Confirme as datas com o cliente." };
  const total = lista.reduce((t, d) => t + d.convidados, 0);
  const texto = lista.map((d, i) => `Dia ${i + 1} (${ddmm(d.data)}${d.hora_inicio ? `, ${d.hora_inicio}` : ""}): ${d.convidados} pessoas`).join(" · ");
  const recado = `FESTA EM ${lista.length} DIAS, uma proposta só. ${texto}. Total: ${total} pessoas (o preço saiu calculado com o total: confira).`;
  return { lista, total, texto, recado };
}

/** Quais dados mínimos faltam para montar a proposta. */
export function faltamParaProposta(evento: Record<string, unknown>, contato: { nome?: string | null } = {}, personalizada = false) {
  const f: string[] = [];
  const nome = (contato.nome ?? "").trim();
  if (!nome || /^cliente( do whatsapp)?$/i.test(nome)) f.push("o nome do cliente (a proposta vai com o nome dele)");
  if (!evento.tipo) f.push("tipo de evento");
  if (!evento.data && !evento.mes_previsto) f.push("data ou mês previsto");
  if (!evento.cidade) f.push("cidade");
  if (!evento.convidados) f.push("número de convidados");
  if (!personalizada && !evento.pacote && !evento.pacote_id && !evento.quer_ajuda_pacote) f.push("pacote (ou o pedido de ajuda para escolher)");
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
        const ev = ctx.estado.evento;
        const mesmaData = args.data === ev.data;
        const hora = args.hora_inicio ?? (mesmaData ? ev.hora_inicio : undefined);
        const r = await consultaAgenda(ctx, args.data, hora, args.duracao_horas ?? ev.duracao_horas);
        return fim(r.dados ? orientarAgenda(r.dados, ctx.estado) : { erro: r.erro?.mensagem }, "leitura");
      }

      case "ver_drinks": {
        const r = await ctx.crm.get<{ drinks: Record<string, unknown>[] }>("/catalogo/drinks");
        const drinks = (r.dados?.drinks ?? []).map((d) => ({ nome: d.nome, descricao: d.descricao, alcoolico: d.alcoolico, em_algum_pacote: d.em_pacote, categoria: d.categoria }));
        return fim(r.dados ? { drinks } : { erro: r.erro?.mensagem }, "leitura");
      }

      case "calcular_preco": {
        const escolhidos = await drinksPorNome(ctx, args.drinks);
        if (escolhidos && "erro" in escolhidos) return fim({ erro: escolhidos.erro }, "nenhum");
        const p = escolhidos ? null : pacotePorNome(ctx.pacotes, args.pacote);
        if (!escolhidos && !p) return fim({ erro: `Pacote "${String(args.pacote ?? "")}" não existe. Pacotes: ${ctx.pacotes.map((x) => x.nome).join(", ")}.` }, "nenhum");
        const corpo = { ...(escolhidos ? { drinks: escolhidos.ids } : { pacote_id: p!.id }), convidados: args.convidados, duracao_horas: args.duracao_horas ?? ctx.estado.evento.duracao_horas, sem_vidraria: args.sem_vidraria, linha: args.linha, outra_cidade: args.outra_cidade };
        const r = await ctx.crm.post<Record<string, unknown>>("/precos/calcular", corpo);
        const d = r.dados;
        // A IA recebe só o necessário: os "motivos" internos da calculadora não vão para o cliente.
        const saida = !d
          ? { erro: r.erro?.mensagem }
          : d.disponivel
            ? { disponivel: true, pacote: p?.nome ?? "personalizada", drinks: escolhidos?.nomes, preco: d.preco, observacao: "Valor calculado pelas regras aprovadas. Pode informar." }
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
          const ev = ctx.estado.evento;
          if (ev.data && (dados.data || dados.hora_inicio || dados.duracao_horas)) disponibilidade = orientarAgenda((await consultaAgenda(ctx, ev.data, ev.hora_inicio, ev.duracao_horas)).dados, ctx.estado);
          return fim({ gravado: true, evento: ctx.estado.evento, disponibilidade }, "simulada", { avancou: novo });
        }
        const id = await garantirNegocio(ctx);
        const r = await ctx.crm.put<{ evento: Record<string, unknown>; disponibilidade?: unknown }>(`/negocios/${id}/evento`, dados);
        if (!r.dados) return fim({ erro: r.erro?.mensagem }, "gravacao");
        ctx.estado.evento = r.dados.evento ?? { ...ctx.estado.evento, ...dados };
        const disponibilidade = dados.data || dados.hora_inicio || dados.duracao_horas ? orientarAgenda(r.dados.disponibilidade as Disponibilidade | undefined, ctx.estado) : undefined;
        return fim({ gravado: true, evento: r.dados.evento, disponibilidade }, "gravacao", { avancou: novo });
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
        const anterior = ctx.estado.proposta;
        if (anterior && ["aguardando_aprovacao", "ajustes_solicitados"].includes(anterior.status)) {
          return fim(
            {
              erro: `A proposta ${anterior.numero ?? ""} JÁ FOI PREPARADA e está com a equipe para aprovar. Se o cliente só confirmou de novo ou perguntou dela, diga que já está pronta e com a equipe e que você manda o link por aqui: NÃO transfira. Só se ele pedir uma MUDANÇA (drinks, data, pessoas…): pergunte o que muda, confirme e transfira com a mudança no motivo.`,
            },
            "nenhum",
          );
        }
        if (anterior?.status === "aceita") return fim({ erro: "A proposta já foi aceita: mudanças agora são com a equipe. Transfira com a mudança no motivo." }, "nenhum");
        const novaVersao = Boolean(anterior && ["aprovada", "enviada", "recusada"].includes(anterior.status));
        const escolhidos = await drinksPorNome(ctx, args.drinks);
        if (escolhidos && "erro" in escolhidos) return fim({ erro: escolhidos.erro }, "nenhum");
        // Festa em mais de um dia (uma proposta só): soma os convidados, 1º dia = data do pedido, agenda de cada dia
        const dias = festaEmDias(args.dias, ctx.hoje);
        if (dias && "erro" in dias) return fim({ erro: dias.erro }, "nenhum");
        if (dias) {
          Object.assign(ctx.estado.evento, { data: dias.lista[0].data, convidados: dias.total });
          for (const d of dias.lista) {
            const ag = orientarAgenda((await consultaAgenda(ctx, d.data, d.hora_inicio ?? ctx.estado.evento.hora_inicio, ctx.estado.evento.duracao_horas)).dados, ctx.estado) as { situacao?: string; orientacao?: string } | undefined;
            if (ag?.situacao === "indisponivel" || ag?.situacao === "depende_do_horario") return fim({ ok: false, dia: d.data, agenda: ag, orientacao: `Não prepare a proposta ainda: o dia ${d.data} não está livre. ${ag.orientacao}` }, "leitura");
          }
          if (!sim && ctx.estado.negocio_id) {
            const r = await ctx.crm.put(`/negocios/${ctx.estado.negocio_id}/evento`, { data: dias.lista[0].data, convidados: dias.total });
            ctx.rastro.push({ tipo: "ferramenta", nome: "gravar 1º dia e total de convidados (festa em vários dias)", efeito: "gravacao", resultado: r.dados ? { ok: true } : r.erro });
          }
        }
        const recado = [dias ? dias.recado : "", String(args.recado_para_equipe ?? "")].filter(Boolean).join(" ");
        const faltam = faltamParaProposta(ctx.estado.evento, ctx.estado.contato, Boolean(escolhidos));
        if (faltam.length) return fim({ ok: false, faltam, orientacao: "Pergunte ao cliente o que falta antes de preparar a proposta." }, "nenhum");
        const ev = ctx.estado.evento;
        if (ev.data) {
          const ag = orientarAgenda((await consultaAgenda(ctx, ev.data, ev.hora_inicio, ev.duracao_horas)).dados, ctx.estado) as { situacao?: string; orientacao?: string } | undefined;
          if (ag?.situacao === "indisponivel" || ag?.situacao === "depende_do_horario") return fim({ ok: false, agenda: ag, orientacao: `Não prepare a proposta ainda. ${ag.orientacao}` }, "leitura");
        }
        const semVidraria = args.sem_vidraria === true ? true : undefined;
        // Proposta personalizada: o pacote que a IA tenha anotado antes não fica no cadastro (o cliente escolheu drinks)
        if (escolhidos && (ev.pacote || ev.pacote_id)) {
          delete ev.pacote;
          delete ev.pacote_id;
          if (!sim && ctx.estado.negocio_id) {
            const r = await ctx.crm.put(`/negocios/${ctx.estado.negocio_id}/evento`, { pacote: null, pacote_id: null });
            ctx.rastro.push({ tipo: "ferramenta", nome: "tirar o pacote do cadastro (proposta personalizada)", efeito: "gravacao", resultado: r.dados ? { ok: true } : r.erro });
          }
        }
        if (novaVersao) {
          const pac = escolhidos ? null : pacotePorNome(ctx.pacotes, ev.pacote);
          const drinks = escolhidos?.ids ?? pac?.drinks.map((d) => d.id);
          const nota = [escolhidos ? `Drinks escolhidos: ${escolhidos.nomes.join(", ")}.` : "", recado].filter(Boolean).join(" ");
          if (sim || !anterior!.id) {
            ctx.estado.proposta = { ...anterior!, status: "aguardando_aprovacao", simulada: true };
            return fim({ ok: true, nova_versao: true, numero: anterior!.numero, status: "aguardando_aprovacao", orientacao: "Avise o cliente que a nova versão foi para a equipe revisar e que você manda o link novo assim que for aprovada." }, "simulada", { avancou: true });
          }
          const r = await ctx.crm.post<{ id: string; numero: string; versao?: number; status?: string; total: number | null; preco_pendente: boolean | null }>(`/propostas/${anterior!.id}/nova-versao`, { drinks, sem_vidraria: semVidraria, nota });
          if (!r.dados) return fim({ erro: r.erro?.mensagem }, "gravacao");
          ctx.estado.proposta = { id: r.dados.id, numero: r.dados.numero, status: r.dados.status ?? "aguardando_aprovacao", simulada: false, total: r.dados.total, preco_pendente: r.dados.preco_pendente };
          return fim({ ok: true, nova_versao: true, numero: r.dados.numero, versao: r.dados.versao, status: ctx.estado.proposta.status, orientacao: "Avise o cliente que a nova versão foi para a equipe revisar e que você manda o link novo assim que for aprovada." }, "gravacao", { avancou: true });
        }
        if (sim) {
          const p = pacotePorNome(ctx.pacotes, ctx.estado.evento.pacote);
          let preco: { disponivel: boolean; preco?: number } = { disponivel: false };
          if ((p || escolhidos) && ctx.estado.evento.convidados) {
            const r = await ctx.crm.post<{ disponivel: boolean; preco?: number }>("/precos/calcular", { ...(escolhidos ? { drinks: escolhidos.ids } : { pacote_id: p!.id }), convidados: ctx.estado.evento.convidados, duracao_horas: ctx.estado.evento.duracao_horas, sem_vidraria: semVidraria });
            preco = r.dados ?? preco;
          }
          ctx.estado.proposta = { id: null, numero: "(simulação)", status: "aguardando_aprovacao", simulada: true, total: preco.disponivel ? (preco.preco ?? null) : null, preco_pendente: !preco.disponivel };
          return fim({ ok: true, numero: "(simulação)", status: "aguardando_aprovacao", preco_pendente: !preco.disponivel, orientacao: "Avise o cliente que a equipe vai revisar e que você manda o link assim que for aprovada. Se perguntarem quanto tempo demora, responda com a regra de prazo das instruções (não transfira)." }, "simulada", { avancou: true });
        }
        const id = await garantirNegocio(ctx);
        const criada = await ctx.crm.post<{ id: string; numero: string; total: number; preco_pendente: boolean }>(`/negocios/${id}/propostas`, {
          nota: escolhidos ? `PROPOSTA PERSONALIZADA (drinks escolhidos: ${escolhidos.nomes.join(", ")}). ${recado}` : recado,
          capa_titulo: args.titulo_capa,
          ...(dias ? { capa_subtitulo: dias.texto } : {}),
          ...(escolhidos ? { drinks: escolhidos.ids } : {}),
        });
        if (!criada.dados) return fim({ erro: criada.erro?.mensagem }, "gravacao");
        if (semVidraria) await ctx.crm.patch(`/propostas/${criada.dados.id}`, { sem_vidraria: true });
        const sub = await ctx.crm.post<{ status: string }>(`/propostas/${criada.dados.id}/submeter`, { nota: recado });
        ctx.estado.proposta = { id: criada.dados.id, numero: criada.dados.numero, status: sub.dados?.status ?? "rascunho", simulada: false, total: criada.dados.total, preco_pendente: criada.dados.preco_pendente };
        return fim(
          { ok: Boolean(sub.dados), numero: criada.dados.numero, status: ctx.estado.proposta.status, preco_pendente: criada.dados.preco_pendente, erro: sub.erro?.mensagem, orientacao: "Avise o cliente que a equipe vai revisar e que você manda o link assim que for aprovada. Se perguntarem quanto tempo demora, responda com a regra de prazo das instruções (não transfira)." },
          "gravacao",
          { avancou: true },
        );
      }

      case "transferir_para_pessoa": {
        const motivo = String(args.motivo ?? "").trim() || "O agente pediu atendimento humano.";
        // Mudança na proposta: a Cecília resolve ou, pelo menos, entende a mudança antes de passar (regra por código)
        // Pergunta de prazo ("demora quanto?", "quando chega?") se responde com a regra das instruções: nunca transfere
        if (/\b(prazo|demora|quanto tempo|quando (chega|sai|recebo|vem|fica)|revis)/i.test(motivo) && !/\b(pagament|parcel|entrada|desconto|reclama|alter|mud|troc|drinks?|horas|convidados|vidraria|pessoa|humano|atendente|andr[eé])/i.test(motivo)) {
          return fim({ erro: "Não transfira por pergunta de prazo. Responda você mesma com a regra de prazo das instruções (quando você manda o link por aqui) e siga a conversa." }, "nenhum");
        }
        const prop = ctx.estado.proposta;
        const pagamento = /\b(pagament|parcel|entrada|prazo de pag|condi[cç])/i.test(motivo);
        if (prop && !pagamento && /\b(alter|mud|troc|ajust|refa[zç]|drinks?\b|vidraria|descart)/i.test(motivo)) {
          if (["aprovada", "enviada", "recusada"].includes(prop.status)) {
            return fim({ erro: "Não transfira: você mesma faz essa mudança. Pergunte o que o cliente quer mudar, grave, confirme o resumo e use preparar_proposta: ela cria uma nova versão que volta para a equipe aprovar." }, "nenhum");
          }
          if (prop.status !== "aceita" && ctx.estado.mudanca_perguntada !== prop.id) {
            ctx.estado.mudanca_perguntada = prop.id;
            return fim({ erro: "Ainda não transfira. Pergunte ao cliente exatamente o que ele quer mudar (drinks, horas, convidados…) e confirme. Depois disso, transfira com a mudança no motivo." }, "nenhum");
          }
        }
        // Agenda cheia: primeiro oferece outra data ou horário; só transfere se o cliente não tiver outra opção
        const cheia = ctx.estado.agenda_cheia;
        if (cheia && /\b(lotad|bloquead|cheia|capacidade|agenda|indispon|vaga)/i.test(motivo) && ctx.estado.alternativa_perguntada !== cheia) {
          ctx.estado.alternativa_perguntada = cheia;
          return fim({ erro: "Ainda não transfira. Diga ao cliente que nesse dia/horário a agenda já está comprometida e pergunte se dá para outro horário ou outra data. Se ele disser que não tem outra opção, aí transfira com o motivo 'Limite de capacidade em <data> às <hora>'." }, "nenhum");
        }
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
