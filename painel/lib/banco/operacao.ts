/**
 * OPERAÇÃO (botão de emergência), SIMULAÇÕES, USO DA IA e REGISTRO — tudo por cliente (cliente_id).
 * - Qualquer pessoa ativa PAUSA o agente (segurança primeiro); só o gestor RETOMA.
 * - Simulação: a dona é quem criou; "gravar no CRM" só o gestor, e o modo não muda depois.
 * - Uso da IA: o painel grava só "simulador" e "teste"; "agente" é gravado pelo motor.
 * - Registro: só o gestor lê.
 */
import { agora, type Ator, type Banco, converter, ehGestor, ErroRegra, exigirAtivo, exigirCliente, exigirGestor, novoId, registrar, traduzirErro } from "./base.ts";

// ------------------------------------------------------------------ operação
export type Operacao = { pausado: boolean; pausado_em: string | null; pausado_por: string | null; motivo: string | null; updated_at: string };

/**
 * Pausa do agente de UM cliente. O cliente pausado no Estúdio (situação "pausado" ou "encerrado") também conta como
 * pausado: o agente não responde ninguém daquele cliente.
 */
export async function lerOperacaoInterno(db: Banco, cliente: string): Promise<Operacao & { cliente_pausado: boolean }> {
  exigirCliente(cliente);
  const r = await db
    .prepare("select o.*, c.situacao from operacao o join clientes c on c.id = o.cliente_id where o.cliente_id = ?")
    .bind(cliente)
    .first<Record<string, unknown>>();
  if (!r) throw new Error(`Operação do cliente ${cliente} não encontrada.`);
  const op = converter<Operacao>(r, ["pausado"], [])!;
  const clientePausado = r.situacao !== "ativo";
  return { ...op, pausado: op.pausado || clientePausado, cliente_pausado: clientePausado };
}
export async function lerOperacao(db: Banco, ator: Ator) {
  exigirAtivo(ator);
  return lerOperacaoInterno(db, ator.cliente);
}

export async function pausarAgente(db: Banco, ator: Ator, motivo?: string | null) {
  exigirAtivo(ator);
  const m = (motivo ?? "").trim().slice(0, 300) || null;
  const r = await db.prepare("update operacao set pausado = 1, pausado_em = ?, pausado_por = ?, motivo = ?, updated_at = ? where cliente_id = ? and pausado = 0").bind(agora(), ator.nome, m, agora(), ator.cliente).run();
  if (r.meta.changes) await registrar(db, ator, "agente.pausou", "Agente inteiro", { motivo: m }).run();
}

export async function retomarAgente(db: Banco, ator: Ator) {
  exigirGestor(ator, "Só o gestor pode religar o agente.");
  const r = await db.prepare("update operacao set pausado = 0, pausado_em = null, pausado_por = null, motivo = null, updated_at = ? where cliente_id = ? and pausado = 1").bind(agora(), ator.cliente).run();
  if (r.meta.changes) await registrar(db, ator, "agente.retomou", "Agente inteiro", {}).run();
}

// ------------------------------------------------------------------ simulações
export type Simulacao = {
  id: string;
  criado_por: string | null;
  criado_por_nome: string;
  titulo: string;
  modelo: string;
  gravar_crm: boolean;
  mensagens: unknown[];
  estado: Record<string, unknown>;
  custo_usd: number;
  tokens: number;
  created_at: string;
  updated_at: string;
};
const simulacao = (r: Record<string, unknown> | null) => converter<Simulacao>(r, ["gravar_crm"], ["mensagens", "estado"]);

export async function listarSimulacoes(db: Banco, ator: Ator, limite = 30): Promise<Simulacao[]> {
  exigirAtivo(ator);
  const r = await db.prepare("select * from simulacoes where cliente_id = ? order by updated_at desc limit ?").bind(ator.cliente, limite).all();
  return r.results.map((x) => simulacao(x)!);
}

export async function lerSimulacao(db: Banco, ator: Ator, id: string): Promise<Simulacao | null> {
  exigirAtivo(ator);
  return simulacao(await db.prepare("select * from simulacoes where id = ? and cliente_id = ?").bind(id, ator.cliente).first());
}

export async function criarSimulacao(db: Banco, ator: Ator, d: { titulo?: string; modelo: string; gravar_crm?: boolean }) {
  exigirAtivo(ator);
  if (d.gravar_crm && !ehGestor(ator)) throw new ErroRegra("Só o gestor pode fazer simulações que gravam no CRM.");
  const id = novoId();
  try {
    await db
      .prepare("insert into simulacoes (id, cliente_id, criado_por, criado_por_nome, titulo, modelo, gravar_crm) values (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ator.cliente, ator.id, ator.nome, (d.titulo ?? "Simulação").slice(0, 120) || "Simulação", d.modelo, d.gravar_crm ? 1 : 0)
      .run();
  } catch (e) {
    traduzirErro(e);
  }
  return id;
}

async function exigirDonaOuGestor(db: Banco, ator: Ator, id: string) {
  exigirAtivo(ator);
  const s = await db.prepare("select criado_por from simulacoes where id = ? and cliente_id = ?").bind(id, ator.cliente).first<{ criado_por: string | null }>();
  if (!s) throw new ErroRegra("Simulação não encontrada.");
  if (s.criado_por !== ator.id && !ehGestor(ator)) throw new ErroRegra("Só quem criou a simulação (ou o gestor) pode alterá-la.");
}

/** Atualiza conversa, estado e custos. O modo (gravar no CRM) e a dona NÃO mudam. */
export async function atualizarSimulacao(db: Banco, ator: Ator, id: string, d: { titulo?: string; mensagens?: unknown[]; estado?: Record<string, unknown>; custo_usd?: number; tokens?: number }) {
  await exigirDonaOuGestor(db, ator, id);
  exigirAtivo(ator);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const campos: [string, unknown][] = [
    ["titulo", d.titulo?.slice(0, 120)],
    ["mensagens", d.mensagens === undefined ? undefined : JSON.stringify(d.mensagens)],
    ["estado", d.estado === undefined ? undefined : JSON.stringify(d.estado)],
    ["custo_usd", d.custo_usd],
    ["tokens", d.tokens],
  ];
  for (const [campo, valor] of campos) {
    if (valor === undefined) continue;
    sets.push(`${campo} = ?`);
    vals.push(valor);
  }
  if (!sets.length) return;
  try {
    await db.prepare(`update simulacoes set ${sets.join(", ")}, updated_at = ? where id = ? and cliente_id = ?`).bind(...vals, agora(), id, ator.cliente).run();
  } catch (e) {
    traduzirErro(e);
  }
}

export async function apagarSimulacao(db: Banco, ator: Ator, id: string) {
  await exigirDonaOuGestor(db, ator, id);
  exigirAtivo(ator);
  await db.prepare("delete from simulacoes where id = ? and cliente_id = ?").bind(id, ator.cliente).run();
}

// ------------------------------------------------------------------ uso da IA
export async function registrarUsoIA(
  db: Banco,
  ator: Ator,
  d: { origem: "simulador" | "teste"; modelo: string; entrada: number; cache: number; saida: number; custo: number; simulacao?: string | null },
) {
  exigirAtivo(ator);
  if (!["simulador", "teste"].includes(d.origem)) throw new ErroRegra("Origem inválida.");
  const n = [d.entrada, d.cache, d.saida];
  if (n.some((x) => !Number.isFinite(x) || x < 0 || x > 5_000_000) || !(d.custo >= 0 && d.custo <= 100)) throw new ErroRegra("Uso fora do esperado.");
  await db
    .prepare("insert into uso_ia (cliente_id, origem, modelo, entrada, cache, saida, custo_usd, simulacao_id, ator_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(ator.cliente, d.origem, d.modelo.slice(0, 80), d.entrada, d.cache, d.saida, d.custo, d.simulacao ?? null, ator.id)
    .run();
}

/** Uso gravado pelo MOTOR (atendimento no WhatsApp), sem pessoa logada. */
export async function registrarUsoAgente(db: Banco, cliente: string, d: { modelo: string; entrada: number; cache: number; saida: number; custo: number }) {
  exigirCliente(cliente);
  await db
    .prepare("insert into uso_ia (cliente_id, origem, modelo, entrada, cache, saida, custo_usd) values (?, 'agente', ?, ?, ?, ?, ?)")
    .bind(cliente, d.modelo.slice(0, 80), d.entrada, d.cache, d.saida, d.custo)
    .run();
}

/** Início do mês corrente no horário de Brasília (UTC-3, sem horário de verão desde 2019), em ISO UTC. */
export function inicioDoMesBrasilia(agoraData = new Date()) {
  const br = new Date(agoraData.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0)).toISOString();
}

export async function gastoMesInterno(db: Banco, cliente: string): Promise<number> {
  exigirCliente(cliente);
  const r = await db
    .prepare("select coalesce(sum(custo_usd), 0) as total from uso_ia where cliente_id = ? and created_at >= ?")
    .bind(cliente, inicioDoMesBrasilia())
    .first<{ total: number }>();
  return Number(r?.total ?? 0);
}
export async function gastoMes(db: Banco, ator: Ator) {
  exigirAtivo(ator);
  return gastoMesInterno(db, ator.cliente);
}

// ------------------------------------------------------------------ registro
export type LinhaRegistro = { id: number; created_at: string; ator_tipo: string; ator_id: string | null; ator_nome: string; acao: string; alvo: string | null; detalhes: Record<string, unknown> };

export async function listarRegistro(db: Banco, ator: Ator, filtro: { acao?: string; limite?: number } = {}): Promise<LinhaRegistro[]> {
  exigirGestor(ator, "Só o gestor vê o registro.");
  const limite = Math.min(Math.max(filtro.limite ?? 100, 1), 500);
  const r = filtro.acao
    ? await db.prepare("select * from registro where cliente_id = ? and acao like ? order by id desc limit ?").bind(ator.cliente, `${filtro.acao}%`, limite).all()
    : await db.prepare("select * from registro where cliente_id = ? order by id desc limit ?").bind(ator.cliente, limite).all();
  return r.results.map((x) => converter<LinhaRegistro>(x, [], ["detalhes"])!);
}

export { novoId };
