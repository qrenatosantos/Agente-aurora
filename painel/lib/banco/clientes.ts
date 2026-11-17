/**
 * CLIENTES DA PLATAFORMA (o "CRM do Renato", tela Clientes do Estúdio).
 *
 * - Só o DONO da plataforma lista, cria e altera clientes (plano contratado, limite de gasto, situação).
 *   Gestor e atendente de um cliente não alcançam nada daqui (nem a lista de clientes).
 * - Criar um cliente cria junto o agente (configuração padrão), as integrações vazias e o botão de emergência.
 * - Situação: ativo | pausado (o agente não responde ninguém do cliente) | encerrado (a equipe perde o acesso).
 *   Cliente nunca é apagado: o histórico (registro, uso da IA) fica.
 * - Nome das conversas do WhatsApp no motor: "<cliente>:wa-<telefone>". O cliente convertido da instalação antiga
 *   (conversas_sem_prefixo = 1) mantém "wa-<telefone>", para não perder a memória das conversas.
 */
import { agora, type Ator, type Banco, converter, ErroRegra, exigirCliente, exigirDono, registrar, traduzirErro } from "./base.ts";
import { salvarConfig } from "./config.ts";
import { inicioDoMesBrasilia } from "./operacao.ts";

export const SITUACOES = ["ativo", "pausado", "encerrado"] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Marca do cliente (cores #RRGGBB, fonte da lista do painel, logo http(s) ou caminho local "/..."). */
export type MarcaCliente = { principal?: string; destaque?: string; fonte?: string; logo?: string };

export type Cliente = {
  id: string;
  nome: string;
  situacao: Situacao;
  marca: MarcaCliente;
  fuso: string;
  plano_nome: string | null;
  plano_valor_brl: number | null;
  dia_fechamento: number;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  responsavel_telefone: string | null;
  observacoes: string | null;
  conversas_sem_prefixo: boolean;
  created_at: string;
  updated_at: string;
};

export type ResumoCliente = Cliente & { limite_mensal_usd: number; gasto_mes_usd: number; equipe: number; agente: string; pausado_agente: boolean };

const linha = (r: Record<string, unknown> | null) => converter<Cliente>(r, ["conversas_sem_prefixo"], ["marca"]);

// ------------------------------------------------------------------ nomes das conversas (motor e painel)
/** Nome da conversa do WhatsApp (Durable Object) de um telefone, dentro de um cliente. */
export function nomeConversaWhatsApp(c: { id: string; conversas_sem_prefixo: boolean }, telefone: string) {
  return c.conversas_sem_prefixo ? `wa-${telefone}` : `${c.id}:wa-${telefone}`;
}

/** A conversa pertence a este cliente? (impede apagar ou ler a conversa de outro cliente pelo nome) */
export function conversaEhDoCliente(c: { id: string; conversas_sem_prefixo: boolean }, conversa: string) {
  const m = /^(?:([a-z0-9-]{2,30}):)?wa-(\d{8,15})$/.exec(conversa);
  if (!m) return false;
  return c.conversas_sem_prefixo ? m[1] === undefined : m[1] === c.id;
}

/** De qual cliente é esta conversa do WhatsApp (pelo nome). null = nome inválido ou cliente inexistente. */
export async function clienteDaConversaInterno(db: Banco, conversa: string): Promise<string | null> {
  const m = /^(?:([a-z0-9-]{2,30}):)?wa-\d{8,15}$/.exec(conversa);
  if (!m) return null;
  const r = m[1]
    ? await db.prepare("select id from clientes where id = ? and conversas_sem_prefixo = 0").bind(m[1]).first<{ id: string }>()
    : await db.prepare("select id from clientes where conversas_sem_prefixo = 1").first<{ id: string }>();
  return r?.id ?? null;
}

export async function lerClienteInterno(db: Banco, id: string): Promise<Cliente | null> {
  exigirCliente(id);
  return linha(await db.prepare("select * from clientes where id = ?").bind(id).first());
}

/** O cliente em que a pessoa está trabalhando (nome e marca, para o topo do painel). */
export async function meuCliente(db: Banco, ator: Ator): Promise<Cliente | null> {
  if (!ator?.ativo || !ator.cliente) return null;
  return lerClienteInterno(db, ator.cliente);
}

// ------------------------------------------------------------------ Estúdio (só o dono)
export async function listarClientes(db: Banco, ator: Ator): Promise<ResumoCliente[]> {
  exigirDono(ator, "Só o dono da plataforma vê a lista de clientes.");
  const r = await db
    .prepare(
      `select c.*, a.limite_mensal_usd, a.nome_agente as agente, o.pausado as pausado_agente,
              (select count(*) from membros m where m.cliente_id = c.id and m.ativo = 1) as equipe,
              (select coalesce(sum(u.custo_usd), 0) from uso_ia u where u.cliente_id = c.id and u.created_at >= ?) as gasto_mes_usd
         from clientes c left join agentes a on a.cliente_id = c.id left join operacao o on o.cliente_id = c.id
        order by c.situacao = 'encerrado', c.nome`,
    )
    .bind(inicioDoMesBrasilia())
    .all();
  return r.results.map((x) => ({ ...linha(x)!, limite_mensal_usd: Number(x.limite_mensal_usd ?? 0), gasto_mes_usd: Number(x.gasto_mes_usd ?? 0), equipe: Number(x.equipe ?? 0), agente: String(x.agente ?? ""), pausado_agente: Boolean(x.pausado_agente) }));
}

export type DadosCliente = {
  nome: string;
  plano_nome?: string | null;
  plano_valor_brl?: number | null;
  dia_fechamento?: number;
  responsavel_nome?: string | null;
  responsavel_email?: string | null;
  responsavel_telefone?: string | null;
  observacoes?: string | null;
  marca?: MarcaCliente;
};

const CAMPOS = ["nome", "plano_nome", "plano_valor_brl", "dia_fechamento", "responsavel_nome", "responsavel_email", "responsavel_telefone", "observacoes"] as const;

function limparMarca(m: MarcaCliente | undefined): MarcaCliente {
  const r: MarcaCliente = {};
  if (!m) return r;
  if (m.principal && /^#[0-9a-fA-F]{6}$/.test(m.principal)) r.principal = m.principal.toUpperCase();
  if (m.destaque && /^#[0-9a-fA-F]{6}$/.test(m.destaque)) r.destaque = m.destaque.toUpperCase();
  if (m.fonte && /^[a-z]{2,20}$/.test(m.fonte)) r.fonte = m.fonte;
  if (m.logo && (/^https?:\/\/\S{3,480}$/.test(m.logo) || /^\/[a-zA-Z0-9/_.-]{1,200}$/.test(m.logo)) && !m.logo.startsWith("//")) r.logo = m.logo;
  return r;
}

const apelidoValido = (id: string) => /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/.test(id);

/** Cria um cliente (com agente padrão, integrações vazias e botão de emergência). Devolve o id. */
export async function criarCliente(db: Banco, ator: Ator, d: DadosCliente & { id: string; limite_mensal_usd?: number }) {
  exigirDono(ator, "Só o dono da plataforma cria clientes.");
  const id = d.id.trim().toLowerCase();
  if (!apelidoValido(id)) throw new ErroRegra("Apelido inválido: use de 2 a 30 letras minúsculas, números ou hífen (ex.: clinica-sorriso).");
  if (!d.nome?.trim()) throw new ErroRegra("Informe o nome do cliente.");
  const limite = d.limite_mensal_usd ?? 30;
  try {
    await db.batch([
      db
        .prepare(
          `insert into clientes (id, nome, marca, plano_nome, plano_valor_brl, dia_fechamento, responsavel_nome, responsavel_email, responsavel_telefone, observacoes)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          d.nome.trim(),
          JSON.stringify(limparMarca(d.marca)),
          d.plano_nome?.trim() || null,
          d.plano_valor_brl ?? null,
          d.dia_fechamento ?? 1,
          d.responsavel_nome?.trim() || null,
          d.responsavel_email?.trim().toLowerCase() || null,
          d.responsavel_telefone?.trim() || null,
          d.observacoes?.trim() || null,
        ),
      db.prepare("insert into agentes (cliente_id, limite_mensal_usd) values (?, ?)").bind(id, limite),
      db.prepare("insert into integracoes (cliente_id) values (?)").bind(id),
      db.prepare("insert into operacao (cliente_id) values (?)").bind(id),
      registrar(db, ator, "cliente.criou", d.nome.trim(), { id, plano: d.plano_nome ?? null, limite_mensal_usd: limite }, id),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return id;
}

/** Altera os dados do cliente, o plano e o limite de gasto (o limite fica no agente e vira uma versão nova dele). */
export async function alterarCliente(db: Banco, ator: Ator, id: string, d: Partial<DadosCliente> & { limite_mensal_usd?: number }) {
  exigirDono(ator, "Só o dono da plataforma altera clientes.");
  const antes = await lerClienteInterno(db, id);
  if (!antes) throw new ErroRegra("Cliente não encontrado.");
  const novo: Record<string, unknown> = {};
  for (const k of CAMPOS) {
    const v = d[k];
    if (v === undefined) continue;
    const limpo = typeof v === "string" ? v.trim() || null : v;
    if (k === "nome" && !limpo) throw new ErroRegra("Informe o nome do cliente.");
    if (limpo !== antes[k]) novo[k] = k === "responsavel_email" && typeof limpo === "string" ? limpo.toLowerCase() : limpo;
  }
  if (d.marca !== undefined) {
    const m = limparMarca(d.marca);
    if (JSON.stringify(m) !== JSON.stringify(antes.marca)) novo.marca = JSON.stringify(m);
  }
  const campos = Object.keys(novo);
  if (campos.length) {
    try {
      await db.batch([
        db.prepare(`update clientes set ${campos.map((k) => `${k} = ?`).join(", ")}, updated_at = ? where id = ?`).bind(...campos.map((k) => novo[k]), agora(), id),
        registrar(db, ator, "cliente.alterou", (novo.nome as string) ?? antes.nome, { campos }, id),
      ]);
    } catch (e) {
      traduzirErro(e);
    }
  }
  if (d.limite_mensal_usd !== undefined) {
    await salvarConfig(db, { ...ator, cliente: id, papel: "gestor" }, { limite_mensal_usd: d.limite_mensal_usd }, "Limite de gasto alterado no Estúdio");
  }
}

/** Ativa, pausa ou encerra o cliente. Pausado = o agente dele não responde ninguém; encerrado = a equipe perde o acesso. */
export async function mudarSituacaoCliente(db: Banco, ator: Ator, id: string, situacao: Situacao) {
  exigirDono(ator, "Só o dono da plataforma pausa ou encerra clientes.");
  if (!SITUACOES.includes(situacao)) throw new ErroRegra("Situação inválida.");
  const antes = await lerClienteInterno(db, id);
  if (!antes) throw new ErroRegra("Cliente não encontrado.");
  if (antes.situacao === situacao) return;
  await db.batch([
    db.prepare("update clientes set situacao = ?, updated_at = ? where id = ?").bind(situacao, agora(), id),
    registrar(db, ator, "cliente.situacao", antes.nome, { antes: antes.situacao, depois: situacao }, id),
  ]);
}
