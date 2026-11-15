/**
 * BASE DO BANCO (Cloudflare D1 = SQLite).
 *
 * Regras deste pasta (lib/banco):
 *  - TypeScript puro, imports relativos com .ts (roda no painel, no motor e nos testes do Node).
 *  - TODA operação recebe QUEM está agindo (Ator) e confere a permissão antes de ler ou gravar.
 *    Isto substitui o RLS do Supabase: não existe outro caminho do navegador até o banco.
 *  - Operações com mais de uma gravação usam db.batch() (tudo ou nada).
 *  - Erro de regra = ErroRegra, com a mensagem pronta para mostrar na tela.
 */

/** O pedaço do D1 que usamos (o D1 de verdade e o SQLite dos testes atendem). */
export interface Instrucao {
  bind(...valores: unknown[]): Instrucao;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Banco {
  prepare(sql: string): Instrucao;
  batch(instrucoes: Instrucao[]): Promise<unknown[]>;
}

export type Papel = "gestor" | "atendente";

/** Quem está agindo. null = ninguém logado. "sistema" = o próprio painel/motor (sem pessoa). */
export type Ator = { id: string; nome: string; papel: Papel; ativo: boolean } | null;

export class ErroRegra extends Error {}

export const agora = () => new Date().toISOString();
export const novoId = () => crypto.randomUUID();

export function exigirAtivo(ator: Ator, mensagem = "Sem permissão."): asserts ator is NonNullable<Ator> {
  if (!ator || !ator.ativo) throw new ErroRegra(mensagem);
}
export function exigirGestor(ator: Ator, mensagem = "Só o gestor pode fazer isso."): asserts ator is NonNullable<Ator> {
  if (!ator || !ator.ativo || ator.papel !== "gestor") throw new ErroRegra(mensagem);
}
export const ehGestor = (ator: Ator) => Boolean(ator && ator.ativo && ator.papel === "gestor");

/** Instrução que grava uma linha no registro (para entrar num batch). */
export function registrar(db: Banco, ator: Ator, acao: string, alvo: string | null, detalhes: Record<string, unknown> = {}) {
  return db
    .prepare("insert into registro (ator_tipo, ator_id, ator_nome, acao, alvo, detalhes) values (?, ?, ?, ?, ?, ?)")
    .bind(ator ? "humano" : "sistema", ator?.id ?? null, ator?.nome ?? "Sistema", acao, alvo ? alvo.slice(0, 200) : null, JSON.stringify(detalhes));
}

/** Converte 0/1 do SQLite em booleano e texto JSON em objeto, nos campos indicados. */
export function converter<T>(linha: Record<string, unknown> | null, booleanos: string[], jsons: string[]): T | null {
  if (!linha) return null;
  const r: Record<string, unknown> = { ...linha };
  for (const b of booleanos) if (b in r) r[b] = Boolean(r[b]);
  for (const j of jsons) if (typeof r[j] === "string") r[j] = JSON.parse(r[j] as string);
  return r as T;
}

/** Erro de CHECK do SQLite vira mensagem amigável. */
export function traduzirErro(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ErroRegra) throw e;
  if (/CHECK constraint failed/i.test(msg)) throw new ErroRegra("Algum valor está fora do permitido. Confira os campos.");
  if (/UNIQUE constraint failed: pessoas\.email/i.test(msg)) throw new ErroRegra("Já existe uma pessoa com esse e-mail.");
  throw e;
}
