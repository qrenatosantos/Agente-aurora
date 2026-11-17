/**
 * CÓPIA DO BANCO (D1) em SQL puro: um arquivo que, rodado num banco com as mesmas migrações, deixa os dados
 * iguais aos da hora da cópia. Feita pelo próprio vigia (sem chave da Cloudflare), guardada no R2 toda semana.
 *
 * Restaurar (roteiro completo em docs/OPERACAO.md):
 *   npx wrangler d1 execute <banco> --remote --file copia.sql
 * O arquivo apaga os dados de cada tabela e grava os da cópia, com as chaves estrangeiras conferidas só no fim.
 * Não copia a tabela de migrações (d1_migrations) nem as internas (sqlite_*, _cf_*): o banco de destino
 * precisa já ter as mesmas migrações aplicadas.
 */
import type { Banco } from "../../painel/lib/banco/base.ts";

const INTERNAS = /^(sqlite_|_cf_|d1_migrations$)/;

/** Um valor do SQLite como texto SQL. */
export function valorSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`número inválido na cópia: ${v}`);
    return String(v);
  }
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const b = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return `X'${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}'`;
  }
  if (Array.isArray(v)) return valorSql(Uint8Array.from(v as number[])); // D1 devolve BLOB como lista de números
  return `'${String(v).replaceAll("'", "''")}'`;
}

const nome = (n: string) => `"${n.replaceAll('"', '""')}"`;

export type ResumoCopia = { sql: string; tabelas: Record<string, number> };

export async function gerarCopia(db: Banco, quando = new Date()): Promise<ResumoCopia> {
  const tabelas = (
    await db.prepare("select name from sqlite_master where type = 'table' order by name").all<{ name: string }>()
  ).results
    .map((t) => t.name)
    .filter((t) => !INTERNAS.test(t));

  const linhas = [`-- Cópia do banco do agente, ${quando.toISOString()}. Restaurar: docs/OPERACAO.md`, "PRAGMA defer_foreign_keys = true;"];
  const contagem: Record<string, number> = {};
  for (const t of tabelas) {
    const colunas = (await db.prepare(`pragma table_info(${nome(t)})`).all<{ name: string }>()).results.map((c) => c.name);
    const dados = (await db.prepare(`select * from ${nome(t)}`).all<Record<string, unknown>>()).results;
    contagem[t] = dados.length;
    linhas.push(`DELETE FROM ${nome(t)};`);
    const cols = colunas.map(nome).join(", ");
    for (const d of dados) linhas.push(`INSERT INTO ${nome(t)} (${cols}) VALUES (${colunas.map((c) => valorSql(d[c])).join(", ")});`);
  }
  linhas.push(`-- Fim. Linhas por tabela: ${JSON.stringify(contagem)}`);
  return { sql: linhas.join("\n") + "\n", tabelas: contagem };
}

/** Nome do arquivo no R2: <banco>/AAAA-MM-DD.sql (um por dia; a do mesmo dia é trocada). */
export const nomeDaCopia = (banco: string, quando = new Date()) => `${banco}/${quando.toISOString().slice(0, 10)}.sql`;
