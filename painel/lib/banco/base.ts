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

/**
 * Quem está agindo, DENTRO de um cliente (multi-cliente, Fase 1 da plataforma).
 * - cliente: o cliente em que a pessoa está trabalhando agora. Toda operação de dados usa SÓ este cliente.
 *   É montado no servidor (atorDaSessao), a partir da sessão e da lista de membros: nunca vem do navegador.
 * - papel: o papel da pessoa NESTE cliente. O dono da plataforma é "gestor" em todos.
 * - dono: o dono da plataforma (Estúdio: clientes, planos). cliente = null só para o dono sem cliente escolhido.
 * null = ninguém logado.
 */
export type Ator = { id: string; nome: string; papel: Papel; ativo: boolean; cliente: string | null; dono: boolean } | null;
export type AtorNoCliente = NonNullable<Ator> & { cliente: string };

export class ErroRegra extends Error {}

export const agora = () => new Date().toISOString();
export const novoId = () => crypto.randomUUID();

export function exigirAtivo(ator: Ator, mensagem = "Sem permissão."): asserts ator is AtorNoCliente {
  if (!ator || !ator.ativo || !ator.cliente) throw new ErroRegra(mensagem);
}
export function exigirGestor(ator: Ator, mensagem = "Só o gestor pode fazer isso."): asserts ator is AtorNoCliente {
  if (!ator || !ator.ativo || !ator.cliente || ator.papel !== "gestor") throw new ErroRegra(mensagem);
}
/** Operações do Estúdio (todos os clientes): só o dono da plataforma. */
export function exigirDono(ator: Ator, mensagem = "Só o dono da plataforma pode fazer isso."): asserts ator is NonNullable<Ator> {
  if (!ator || !ator.ativo || !ator.dono) throw new ErroRegra(mensagem);
}
export const ehGestor = (ator: Ator) => Boolean(ator && ator.ativo && ator.cliente && ator.papel === "gestor");

/** Cliente válido para as funções "interno" (motor, vigia), que rodam sem pessoa logada. */
export function exigirCliente(cliente: unknown): asserts cliente is string {
  if (typeof cliente !== "string" || !/^[a-z0-9-]{2,30}$/.test(cliente)) throw new Error("Cliente inválido.");
}

/**
 * Instrução que grava uma linha no registro (para entrar num batch). Fica no registro do cliente do ator
 * (ou de `cliente`, quando informado: ex.: o dono criando um cliente novo).
 */
export function registrar(db: Banco, ator: Ator, acao: string, alvo: string | null, detalhes: Record<string, unknown> = {}, cliente?: string | null) {
  return db
    .prepare("insert into registro (cliente_id, ator_tipo, ator_id, ator_nome, acao, alvo, detalhes) values (?, ?, ?, ?, ?, ?, ?)")
    .bind(cliente !== undefined ? cliente : (ator?.cliente ?? null), ator ? "humano" : "sistema", ator?.id ?? null, ator?.nome ?? "Sistema", acao, alvo ? alvo.slice(0, 200) : null, JSON.stringify(detalhes));
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
  if (/UNIQUE constraint failed: clientes\.id/i.test(msg)) throw new ErroRegra("Já existe um cliente com esse apelido.");
  if (/UNIQUE constraint failed: integracoes\.whatsapp_phone_number_id/i.test(msg)) throw new ErroRegra("Este número de WhatsApp já está ligado a outro cliente.");
  throw e;
}
