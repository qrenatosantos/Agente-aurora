/**
 * AVALIAÇÃO DE QUALIDADE DO ATENDIMENTO — conversas inteiras, com um cliente simulado e um avaliador.
 *
 * A bateria (avaliar.ts) confere REGRAS ("citou preço?", "transferiu?"). Esta mede BOM SENSO:
 * entendeu o cliente? conduziu bem? resolveu sem passar para a equipe à toa? escreveu como gente?
 *
 * Como funciona, para cada cenário e cada variante de modelo:
 *  1. Um CLIENTE SIMULADO (IA com persona e objetivo) conversa com a Cecília.
 *  2. A Cecília responde pelo núcleo de verdade (processarTurno), em modo SIMULAÇÃO: lê o CRM publicado,
 *     não grava nada. Usa a configuração que está NO AR (arquivo exportado do D1).
 *  3. Um AVALIADOR (modelo mais forte) lê a conversa inteira e dá notas de 1 a 5 por critério,
 *     lista os erros graves e comenta. Checagens objetivas (código) completam a nota.
 *
 *   CFG_JSON=... CONH_JSON=... CRM_URL=... CRM_CHAVE=... OPENAI_CHAVE=... \
 *   node avaliacao/qualidade.ts gpt-6-luna gpt-6-luna@low gpt-6.1-terra [--rodadas 2] [--so id1,id2]
 *
 * "modelo@esforço" liga o raciocínio (API Responses). Relatório: avaliacao/RESULTADO-QUALIDADE.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { processarTurno } from "../painel/lib/nucleo/agente.ts";
import { ClienteCrm } from "../painel/lib/nucleo/crm.ts";
import { chamarModelo, custoUsd, type Esforco } from "../painel/lib/nucleo/openai.ts";
import { estadoInicial, type ConfigAgente, type EstadoConversa, type ItemConhecimento } from "../painel/lib/nucleo/tipos.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENTE = "gpt-6.1-terra";
const AVALIADOR = "gpt-6.1-sol";
const AGORA = new Date("2026-11-17T15:00:00Z"); // terça, 12h em Brasília (fixo: respostas comparáveis)

// ------------------------------------------------------------ configuração NO AR
function carregar(): { cfg: ConfigAgente; conhecimento: ItemConhecimento[] } {
  const c = JSON.parse(readFileSync(process.env.CFG_JSON!, "utf8"))[0].results[0];
  const k = JSON.parse(readFileSync(process.env.CONH_JSON!, "utf8"))[0].results as ItemConhecimento[];
  const j = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  const cfg: ConfigAgente = {
    nome_agente: c.nome_agente,
    apresentacao: c.apresentacao,
    tom: c.tom,
    saudacao: c.saudacao,
    instrucoes: process.env.INSTRUCOES ? readFileSync(process.env.INSTRUCOES, "utf8") : c.instrucoes,
    exemplos: process.env.EXEMPLOS ? JSON.parse(readFileSync(process.env.EXEMPLOS, "utf8")) : j(c.exemplos),
    gatilhos_palavras: j(c.gatilhos_palavras),
    gatilhos_temas: j(c.gatilhos_temas),
    max_msgs_sem_avanco: c.max_msgs_sem_avanco,
    horario_equipe: j(c.horario_equipe),
    agente_24h: Boolean(c.agente_24h),
    mensagens: j(c.mensagens),
    modelo: c.modelo,
  };
  return { cfg, conhecimento: k };
}

// ------------------------------------------------------------ cenários (tirados de conversas reais e dos riscos do negócio)
type Conversa = { falas: { quem: "cliente" | "cecilia"; texto: string }[]; estado: EstadoConversa; ferramentas: { nome: string; args: unknown; resultado?: unknown }[]; custo: number; respostas: number; ms: number };
type Cenario = {
  id: string;
  titulo: string;
  /** Para o cliente simulado: quem é, o que quer, o que sabe e como se comporta. */
  persona: string;
  abertura: string;
  estado?: Partial<EstadoConversa>;
  maxFalas?: number;
  /** O que um bom atendimento faz aqui (para o avaliador). */
  esperado: string[];
  /** Checagens objetivas: devolve as falhas. */
  conferir?: (c: Conversa) => (string | false | null | undefined)[];
};

const propostaArgs = (c: Conversa) => c.ferramentas.filter((f) => f.nome === "preparar_proposta").map((f) => JSON.stringify(f.args ?? {}));
const transferiu = (c: Conversa) => c.estado.atendimento === "humano";
const PACOTES = ["Essencial", "Signature", "Reserve", "Exclusive"];
/** Pacotes apresentados todos numa mensagem só (o cliente pediu um por mensagem). */
const pacotesEmBloco = (c: Conversa) =>
  c.falas.some((f) => f.quem === "cecilia" && f.texto.split("\n\n").some((balao) => PACOTES.filter((p) => balao.includes(`*${p}*`)).length >= 3));

const CENARIOS: Cenario[] = [
  {
    id: "drinks-soltos",
    titulo: "Pede drinks soltos em vez de pacote (caso Poliana)",
    persona:
      "Você é Poliana. Casamento em 31/01/2027, Araxá, no Via Verde, 50 convidados, bar das 19h por 5 horas. Quando falarem de pacotes, diga que quer caipirinha, Aperol, Moscow Mule e um drink sem álcool, e só isso: não quer pagar por drink que não pediu. Se oferecerem uma proposta só com esses drinks, aceite; o sem álcool pode ser o que sugerirem. Escreve curto e informal.",
    abertura: "Boa noite",
    esperado: [
      "Não escolhe o pacote pela cliente.",
      "Explica que o pacote que tem tudo isso traz drinks a mais e oferece proposta personalizada só com os drinks pedidos.",
      "Confirma o resumo antes de preparar a proposta.",
      "Prepara a proposta com os drinks escolhidos.",
    ],
    conferir: (c) => [
      transferiu(c) && "passou para a equipe",
      !c.estado.proposta && "não preparou a proposta",
      c.estado.proposta && !propostaArgs(c).some((a) => /moscow/i.test(a) && /aperol/i.test(a)) && "proposta sem os drinks pedidos",
    ],
  },
  {
    id: "decidida",
    titulo: "Cliente decidida que manda quase tudo de uma vez",
    persona:
      "Você é Carla. Aniversário de 40 anos do marido, 20/03/2027, Araxá, salão Villa Real, umas 80 pessoas, bar das 20h por 4 horas, quer o pacote Signature. Mande quase tudo na primeira mensagem; responda o que perguntarem. Quer resolver rápido.",
    abertura: "Oi! Quero orçamento de bar pro aniversário de 40 anos do meu marido, dia 20/03/2027 em Araxá, no Villa Real, umas 80 pessoas, pacote Signature",
    esperado: ["Não pergunta de novo o que já foi dito.", "Pergunta só o que falta (nome, horário/horas).", "Confirma e prepara a proposta com o Signature.", "Conversa curta e objetiva."],
    conferir: (c) => [transferiu(c) && "passou para a equipe", !c.estado.proposta && "não preparou a proposta", c.estado.proposta && !propostaArgs(c).length && "sem proposta"],
  },
  {
    id: "indeciso",
    titulo: "Não sabe qual pacote e pede recomendação",
    persona:
      "Você é Marcos. Formatura de medicina da sua filha, 12/12/2027, em Uberaba, salão Pinheiros, cerca de 150 convidados, bar das 22h por 6 horas. Não entende de drinks; pergunta 'qual vocês indicam pra formatura?'. Gosta de uma recomendação clara. Depois de recomendarem, aceite a sugestão.",
    abertura: "Boa tarde, gostaria de um orçamento para formatura",
    esperado: ["Recomenda um pacote com um motivo ligado à festa (público jovem, festa longa…), sem 'depende'.", "Não empurra o mais caro sem motivo.", "Confirma e prepara a proposta."],
    conferir: (c) => [transferiu(c) && "passou para a equipe", !c.estado.proposta && "não preparou a proposta"],
  },
  {
    id: "prazo",
    titulo: "Pergunta quanto tempo demora a proposta",
    persona:
      "Você é Renata. Aniversário de 15 anos da filha, 05/06/2027, Araxá, chácara da família, 120 convidados, bar das 20h por 5 horas, pacote Reserve. Responda o que perguntarem. Depois que disserem que a proposta foi preparada, pergunte 'e demora quanto tempo mais ou menos?'. Depois da resposta, agradeça e encerre.",
    abertura: "Olá, quero um orçamento",
    esperado: ["Prepara a proposta.", "Sobre o prazo: diz que manda o link aqui até o final do dia (são 12h).", "NÃO passa para a equipe por causa da pergunta de prazo."],
    conferir: (c) => [transferiu(c) && "passou para a equipe na pergunta de prazo", !c.falas.some((f) => f.quem === "cecilia" && /final do dia|fim do dia/i.test(f.texto)) && "não disse 'até o final do dia'"],
  },
  {
    id: "caro",
    titulo: "Acha caro e pede desconto",
    persona:
      "Você é Juliana. Casamento em 10/04/2027, Araxá, Fazenda Boa Vista, 100 convidados, bar das 19h por 6 horas, pacote Exclusive. Pergunte o valor. Ao saber o valor (ou se disserem que vem na proposta), diga 'nossa, achei caro, não tem um desconto?'. Se explicarem o valor do serviço e oferecerem formas de economizar, aceite diminuir para 5 horas.",
    abertura: "Oi, quanto fica o bar pra um casamento?",
    esperado: ["Não inventa valor.", "Diante do 'caro', mostra o valor da entrega com empatia e oferece formas de economizar (menos horas ou copos descartáveis).", "Não passa para a equipe de cara.", "Registra a escolha da cliente (5 horas)."],
    conferir: (c) => [
      c.falas.findIndex((f) => /desconto/i.test(f.texto)) >= 0 && transferiu(c) && !c.falas.some((f) => f.quem === "cecilia" && /hora|descart/i.test(f.texto)) && "transferiu sem oferecer as formas de economizar",
    ],
  },
  {
    id: "pede-andre",
    titulo: "Pede para falar com o André",
    persona: "Você é Paulo. Já conhece o André e quer falar direto com ele sobre um evento da empresa. Se perguntarem algo, diga que prefere tratar com o André.",
    abertura: "Bom dia, consegue me passar pro André? quero falar com ele sobre um evento da minha empresa",
    maxFalas: 3,
    esperado: ["Passa para a equipe sem resistir nem fazer interrogatório.", "Mensagem cordial."],
    conferir: (c) => [!transferiu(c) && "não passou para a equipe"],
  },
  {
    id: "fora-do-tema",
    titulo: "Pergunta fora do assunto no meio do orçamento",
    persona:
      "Você é Bruno. Aniversário de 30 anos, 15/08/2027, Araxá, em casa, 40 pessoas, bar das 21h por 4 horas, pacote Essencial. No meio da conversa, pergunte 'aliás, você sabe quem ganhou o jogo do Cruzeiro ontem?'. Depois volte ao orçamento normalmente.",
    abertura: "Opa, queria ver bar pro meu aniversário",
    esperado: ["Recusa com gentileza o assunto fora do tema, sem sermão, e volta para a festa.", "Segue o orçamento até a proposta."],
    conferir: (c) => [transferiu(c) && "passou para a equipe", c.falas.some((f) => f.quem === "cecilia" && /\b\d+\s*x\s*\d+\b/.test(f.texto)) && "respondeu o placar"],
  },
  {
    id: "digita-errado",
    titulo: "Cliente escreve com erros e abreviações",
    persona:
      "Você é Dona Cida. Escreve com muitos erros e abreviações ('kero', 'orsamento', 'p/', 'convidado'). Festa de 15 anos da neta, 10/05/2027, Araxá, no clube, uns 100 convidado, das 20h por 5 horas, quer caipirinha e 'aquele drink de vodka com gengibre'. Se explicarem os pacotes, escolha o que tiver esse drink.",
    abertura: "boa tarde kero orsamento p/ 15 anos da minha neta",
    esperado: ["Entende tudo sem pedir para repetir.", "Identifica o 'drink de vodka com gengibre' como Moscow Mule e diz em que pacote ele está.", "Linguagem simples e acolhedora."],
    conferir: (c) => [transferiu(c) && "passou para a equipe", !c.falas.some((f) => f.quem === "cecilia" && /moscow/i.test(f.texto)) && "não reconheceu o Moscow Mule"],
  },
  {
    id: "mudar-recusada",
    titulo: "Proposta anterior recusada: quer trocar os drinks",
    persona:
      "Você é Fernanda. Já recebeu uma proposta (pacote Essencial) que a equipe recusou para refazer. Quer trocar: tirar o gin tônica e colocar Aperol Spritz no lugar. Quantidade, data e horas continuam iguais. Confirme quando perguntarem.",
    abertura: "Oi, quero alterar os drinks da minha proposta",
    estado: {
      contato: { nome: "Fernanda", cidade: "Araxá" },
      evento: { tipo: "casamento", data: "2027-02-20", cidade: "Araxá", local: "Espaço Garden", convidados: 70, hora_inicio: "19:00", duracao_horas: 5, pacote: "Essencial" },
      proposta: { id: "antiga", numero: "PROP-2026-0099", status: "recusada", simulada: false, total: 2500, preco_pendente: false },
    },
    esperado: ["Pergunta o que mudar (não passa para a equipe).", "Monta uma nova proposta com caipirinha, caipiroska e Aperol Spritz (sem gin tônica), depois de confirmar."],
    conferir: (c) => [
      transferiu(c) && "passou para a equipe",
      !c.estado.proposta || c.estado.proposta.numero === "PROP-2026-0099" ? "não montou a nova proposta" : null,
      propostaArgs(c).length && !propostaArgs(c).some((a) => /aperol/i.test(a) && !/gin/i.test(a)) && "nova proposta sem a troca pedida",
    ],
  },
  {
    id: "chope",
    titulo: "Pede só chope (serviço fora dos pacotes)",
    persona: "Você é Rodrigo. Quer só open bar de chope para um churrasco de 60 pessoas em Araxá, 18/09/2027. Não quer drinks.",
    abertura: "Vcs fazem open bar de chope? é pra um churrasco",
    maxFalas: 4,
    esperado: ["Não afirma que a Aurora faz nem que não faz chope.", "Passa para a equipe com cordialidade."],
    conferir: (c) => [!transferiu(c) && "não passou para a equipe"],
  },
  {
    id: "duvidas",
    titulo: "Dúvidas sobre o serviço antes de passar os dados",
    persona:
      "Você é Larissa. Antes de passar os dados, quer saber: 'o gelo está incluído?', 'vocês levam os copos?' e 'atendem em Patos de Minas?'. Depois passe: casamento 22/05/2027, Patos de Minas, 90 convidados, bar das 19h por 5 horas, pacote Reserve.",
    abertura: "Oi! Antes de tudo, umas dúvidas: o gelo tá incluso?",
    esperado: ["Responde as dúvidas com o conhecimento cadastrado, sem inventar e sem passar para a equipe.", "Depois conduz para o orçamento."],
    conferir: (c) => [transferiu(c) && "passou para a equipe"],
  },
  {
    id: "seco",
    titulo: "Cliente de poucas palavras",
    persona:
      "Você é Diego. Responde com o mínimo possível: 'sim', '60', 'sábado 12/06/27', 'Araxá', '4h', 'umas 20h'. É uma festa de noivado. Nome: Diego. Não sabe pacote: se mostrarem, escolhe o Signature.",
    abertura: "orçamento",
    esperado: ["Conduz a conversa com perguntas claras, uma ou duas por vez.", "Não se perde nem repete perguntas.", "Chega à proposta."],
    conferir: (c) => [transferiu(c) && "passou para a equipe", !c.estado.proposta && "não preparou a proposta"],
  },
];

// ------------------------------------------------------------ peças
type Variante = { rotulo: string; modelo: string; esforco: Esforco };
const variante = (s: string): Variante => {
  const [modelo, esforco] = s.split("@");
  return { rotulo: s, modelo, esforco: (esforco as Esforco) ?? "none" };
};

const chave = process.env.OPENAI_CHAVE ?? "sk-sem-chave";

/** Limite de uso da OpenAI (429) ou falha passageira: espera e tenta de novo (até 5 vezes). */
const chamarComCalma: typeof chamarModelo = async (o) => {
  for (let i = 0; ; i++) {
    try {
      return await chamarModelo(o);
    } catch (e) {
      const st = (e as { status?: number }).status ?? 0;
      if (i >= 5 || !(st === 429 || st === 0 || st >= 500)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
};
let custoApoio = 0; // cliente simulado + avaliador

async function falaDoCliente(cen: Cenario, conv: Conversa): Promise<string | null> {
  const r = await chamarComCalma({
    chave,
    modelo: CLIENTE,
    maxTokens: 200,
    mensagens: [
      {
        role: "system",
        content: `Você simula um CLIENTE conversando no WhatsApp com a Cecília, atendente da Aurora Bartenders (bar de drinks para festas). ${cen.persona}
Regras: escreva só a PRÓXIMA mensagem do cliente, curta, natural, em português do Brasil, como no WhatsApp. Não invente dados além da persona; se perguntarem algo que a persona não diz, responda de forma plausível e simples. Responda exatamente FIM (só isso) quando: a Cecília disser que passou para a equipe, seu objetivo terminar (proposta preparada e dúvidas respondidas), ou a conversa não tiver mais o que fazer.`,
      },
      ...conv.falas.map((f) => ({ role: f.quem === "cliente" ? ("assistant" as const) : ("user" as const), content: f.texto })),
    ],
  });
  custoApoio += custoUsd(CLIENTE, r.uso) ?? 0;
  const t = (r.mensagem.content ?? "").trim();
  return !t || /^FIM\.?$/i.test(t) ? null : t;
}

async function conversar(cen: Cenario, v: Variante, base: { cfg: ConfigAgente; conhecimento: ItemConhecimento[]; crm: ClienteCrm }): Promise<Conversa> {
  const conv: Conversa = { falas: [], estado: estadoInicial(structuredClone(cen.estado ?? {})), ferramentas: [], custo: 0, respostas: 0, ms: 0 };
  let fala: string | null = cen.abertura;
  for (let i = 0; i < (cen.maxFalas ?? 9) && fala; i++) {
    conv.falas.push({ quem: "cliente", texto: fala });
    const historico = conv.falas.map((f) => ({ papel: f.quem === "cliente" ? ("cliente" as const) : ("agente" as const), texto: f.texto, em: AGORA.toISOString() }));
    const t0 = Date.now();
    const r = await processarTurno({
      cfg: { ...base.cfg, modelo: v.modelo },
      conhecimento: base.conhecimento,
      estado: conv.estado,
      historico,
      novas: [fala],
      crm: base.crm,
      chaveIA: chave,
      modelo: v.modelo,
      modo: "simulacao",
      agora: AGORA,
      chamar: (o) => chamarComCalma({ ...o, esforco: v.esforco }),
    });
    conv.ms += Date.now() - t0;
    conv.estado = r.estado;
    conv.custo += r.uso.custo_usd ?? 0;
    for (const p of r.rastro) if (p.tipo === "ferramenta" && p.argumentos !== undefined) conv.ferramentas.push({ nome: p.nome, args: p.argumentos, resultado: p.resultado });
    if (r.respostas.length) {
      conv.respostas += 1;
      // cada balão do WhatsApp separado por linha em branco (o avaliador vê como chegou)
      conv.falas.push({ quem: "cecilia", texto: r.respostas.join("\n\n") });
    }
    if (r.estado.atendimento === "humano" || !r.respostas.length) break;
    fala = await falaDoCliente(cen, conv);
  }
  return conv;
}

type Avaliacao = { notas: Record<string, number>; erros_graves: string[]; comentario: string };
const CRITERIOS = ["compreensao", "conducao", "resolucao", "naturalidade", "fidelidade"];

async function avaliar(cen: Cenario, conv: Conversa, cfg: ConfigAgente): Promise<Avaliacao> {
  const transcricao = conv.falas.map((f) => `${f.quem === "cliente" ? "CLIENTE" : "CECÍLIA"}: ${f.texto}`).join("\n\n");
  const acoes = conv.ferramentas.map((f) => `- ${f.nome} ${JSON.stringify(f.args)} → ${JSON.stringify(f.resultado ?? null).slice(0, 300)}`).join("\n") || "(nenhuma)";
  const r = await chamarComCalma({
    chave,
    modelo: AVALIADOR,
    esforco: "low",
    maxTokens: 900,
    mensagens: [
      {
        role: "system",
        content: `Você é gerente comercial de uma empresa de bar para festas e avalia o atendimento da Cecília (agente de WhatsApp da Aurora Bartenders) com rigor e justiça.
Como o sistema funciona: gravar a data (registrar_dados_da_festa) já consulta a agenda e devolve a disponibilidade; o modo é de teste, então as gravações aparecem como simuladas.
Regras da empresa que ela deve seguir: não inventar preço, data ou condição (só o que o sistema informa); não oferecer falar com uma pessoa por conta própria (só se o cliente pedir ou nos casos de transferência); mensagens curtas de WhatsApp, pacotes um por mensagem; pedir nome do cliente e horas de bar antes da proposta; confirmar o resumo antes de preparar a proposta; nunca escolher o pacote pelo cliente; responder dúvidas com o conhecimento; só falar da Aurora; passar para a equipe quando o cliente pede uma pessoa, serviço fora dos pacotes, ou insiste em desconto depois de ouvir as formas de economizar.
Instruções do gestor (resumo do que está configurado): ${cfg.instrucoes.slice(0, 2500)}

Dê notas de 1 (péssimo) a 5 (excelente):
- compreensao: entendeu o que o cliente quis, inclusive nas entrelinhas;
- conducao: conduziu a conversa com boas perguntas, na ordem certa, sem repetir nem enrolar;
- resolucao: resolveu o que dava para resolver sem passar para a equipe à toa (ou passou quando devia);
- naturalidade: soou como uma atendente humana, simpática e objetiva, no estilo WhatsApp;
- fidelidade: seguiu as regras e não inventou nada.
erros_graves: lista curta só com erros que um cliente real perceberia ou que causam prejuízo (vazia se não houver).
Responda SÓ com JSON: {"notas":{"compreensao":n,"conducao":n,"resolucao":n,"naturalidade":n,"fidelidade":n},"erros_graves":["..."],"comentario":"uma ou duas frases"}`,
      },
      {
        role: "user",
        content: `CENÁRIO: ${cen.titulo}\nO QUE UM BOM ATENDIMENTO FAZ AQUI:\n${cen.esperado.map((e) => `- ${e}`).join("\n")}\n\nCONVERSA:\n${transcricao}\n\nAÇÕES NO SISTEMA (ferramentas):\n${acoes}\n\nSITUAÇÃO FINAL: atendimento=${conv.estado.atendimento}${conv.estado.transferido_motivo ? ` (motivo: ${conv.estado.transferido_motivo})` : ""}; proposta=${conv.estado.proposta ? conv.estado.proposta.status : "nenhuma"}`,
      },
    ],
  });
  custoApoio += custoUsd(AVALIADOR, r.uso) ?? 0;
  const t = (r.mensagem.content ?? "").replace(/^```(json)?|```$/g, "").trim();
  try {
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Avaliacao;
    return { notas: j.notas ?? {}, erros_graves: j.erros_graves ?? [], comentario: j.comentario ?? "" };
  } catch {
    return { notas: {}, erros_graves: ["(avaliação ilegível)"], comentario: t.slice(0, 200) };
  }
}

// ------------------------------------------------------------ execução
async function main() {
  const args = process.argv.slice(2);
  const op = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const valores = new Set(["--rodadas", "--so"].map((o) => args.indexOf(o) + 1).filter((i) => i > 0));
  const variantes = args.filter((a, i) => !a.startsWith("--") && !valores.has(i)).map(variante);
  const rodadas = Number(op("--rodadas") ?? 1);
  const so = op("--so")?.split(",");
  if (!variantes.length || !process.env.CFG_JSON || !process.env.CRM_URL || !process.env.CRM_CHAVE) {
    console.error("Uso: CFG_JSON=... CONH_JSON=... CRM_URL=... CRM_CHAVE=... node avaliacao/qualidade.ts modelo[@esforço] ... [--rodadas N] [--so id,...]");
    process.exit(1);
  }
  const { cfg, conhecimento } = carregar();
  const base = { cfg, conhecimento, crm: new ClienteCrm(process.env.CRM_URL, process.env.CRM_CHAVE) };
  const cenarios = CENARIOS.filter((c) => !so || so.includes(c.id));

  type Linha = { cen: Cenario; v: Variante; rodada: number; conv?: Conversa; av?: Avaliacao; objetivas: string[]; erro?: string };
  const linhas: Linha[] = [];
  // variantes em paralelo (cada uma é independente); cenários e rodadas em sequência
  await Promise.all(
    variantes.map(async (v) => {
      for (const cen of cenarios)
        for (let k = 1; k <= rodadas; k++) {
          const l: Linha = { cen, v, rodada: k, objetivas: [] };
          try {
            l.conv = await conversar(cen, v, base);
            l.objetivas = [...(cen.conferir?.(l.conv) ?? []), pacotesEmBloco(l.conv) && "pacotes num bloco só"].filter((x): x is string => Boolean(x));
            l.av = await avaliar(cen, l.conv, cfg);
          } catch (e) {
            l.erro = e instanceof Error ? e.message : String(e);
          }
          const media = l.av ? CRITERIOS.reduce((s, c) => s + (l.av!.notas[c] ?? 0), 0) / CRITERIOS.length : 0;
          console.log(`${l.erro ? "!" : l.objetivas.length || l.av?.erros_graves.length ? "✘" : "✔"} ${cen.id} · ${v.rotulo} · nota ${media.toFixed(1)}${l.objetivas.length ? ` — ${l.objetivas.join("; ")}` : ""}${l.conv?.estado.transferido_motivo ? ` [motivo: ${l.conv.estado.transferido_motivo.slice(0, 160)}]` : ""}${l.erro ? ` — erro: ${l.erro}` : ""}`);
          linhas.push(l);
        }
    }),
  );

  // ---------------- relatório
  const media = (l: Linha) => (l.av ? CRITERIOS.reduce((s, c) => s + (l.av!.notas[c] ?? 0), 0) / CRITERIOS.length : 0);
  const aprovada = (l: Linha) => !l.erro && !l.objetivas.length && !(l.av?.erros_graves.length) && media(l) >= 4;
  const resumo = variantes.map((v) => {
    const ls = linhas.filter((l) => l.v.rotulo === v.rotulo);
    const ok = ls.filter((l) => l.conv);
    const respostas = ok.reduce((s, l) => s + l.conv!.respostas, 0) || 1;
    const custo = ok.reduce((s, l) => s + l.conv!.custo, 0);
    const porCriterio = CRITERIOS.map((c) => (ok.reduce((s, l) => s + (l.av?.notas[c] ?? 0), 0) / (ok.length || 1)).toFixed(1));
    return {
      v,
      nota: ok.reduce((s, l) => s + media(l), 0) / (ok.length || 1),
      aprovadas: `${ls.filter(aprovada).length}/${ls.length}`,
      porCriterio,
      porResposta: custo / respostas,
      mes100: (custo / respostas) * 1500,
      tempo: ok.reduce((s, l) => s + l.conv!.ms, 0) / respostas / 1000,
    };
  });
  const md = [
    `# Qualidade do atendimento — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Configuração NO AR (versão ${JSON.parse(readFileSync(process.env.CFG_JSON!, "utf8"))[0].results[0].versao}${process.env.INSTRUCOES ? `, instruções de ${process.env.INSTRUCOES}` : ""}). ${cenarios.length} cenários × ${rodadas} rodada(s). Cliente simulado: ${CLIENTE}. Avaliador: ${AVALIADOR} (raciocínio low).`,
    "Aprovada = sem erro grave, sem falha objetiva e nota média ≥ 4. Custo/mês = 100 clientes × ~15 respostas (1.500 respostas).",
    "",
    `| Variante | Nota média (1–5) | Aprovadas | ${CRITERIOS.join(" | ")} | US$/resposta | US$/mês (100 clientes) | s/resposta |`,
    `|---|---|---|${CRITERIOS.map(() => "---").join("|")}|---|---|---|`,
    ...resumo.map((r) => `| ${r.v.rotulo} | ${r.nota.toFixed(2)} | ${r.aprovadas} | ${r.porCriterio.join(" | ")} | ${r.porResposta.toFixed(5)} | ${r.mes100.toFixed(2)} | ${r.tempo.toFixed(1)} |`),
    "",
    `Custo de apoio (cliente simulado + avaliador): US$ ${custoApoio.toFixed(3)}.`,
    "",
    "## Por cenário",
    "",
    `| Cenário | ${variantes.map((v) => v.rotulo).join(" | ")} |`,
    `|---|${variantes.map(() => "---").join("|")}|`,
    ...cenarios.map((c) => `| ${c.titulo} | ${variantes.map((v) => linhas.filter((l) => l.cen.id === c.id && l.v.rotulo === v.rotulo).map((l) => `${aprovada(l) ? "✔" : "✘"} ${media(l).toFixed(1)}`).join(" · ")).join(" | ")} |`),
    "",
    "## Conversas",
    "",
    ...linhas
      .sort((a, b) => a.cen.id.localeCompare(b.cen.id) || a.v.rotulo.localeCompare(b.v.rotulo) || a.rodada - b.rodada)
      .map((l) =>
        [
          `### ${l.cen.titulo} · ${l.v.rotulo} · rodada ${l.rodada}: ${aprovada(l) ? "✔" : "✘"} nota ${media(l).toFixed(1)}`,
          l.erro ? `Erro: ${l.erro}` : "",
          l.objetivas.length ? `Falhas objetivas: ${l.objetivas.join("; ")}` : "",
          l.av?.erros_graves.length ? `Erros graves (avaliador): ${l.av.erros_graves.join("; ")}` : "",
          l.av ? `Avaliador: ${l.av.comentario} (${CRITERIOS.map((c) => `${c} ${l.av!.notas[c] ?? "?"}`).join(", ")})` : "",
          "",
          ...(l.conv?.falas ?? []).map((f) => `- ${f.quem === "cliente" ? "👤" : "🤖"} ${f.texto.replace(/\n+/g, " ⏎ ")}`),
          "",
        ]
          .filter((x, i) => x !== "" || i > 4)
          .join("\n"),
      ),
  ].join("\n");
  writeFileSync(join(raiz, "avaliacao/RESULTADO-QUALIDADE.md"), md);
  console.log("\n" + md.split("## Por cenário")[0]);
  console.log("Relatório: avaliacao/RESULTADO-QUALIDADE.md");
}

await main();
