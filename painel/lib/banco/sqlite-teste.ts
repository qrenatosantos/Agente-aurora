/**
 * Banco D1 "de mentira" para os testes: SQLite embutido do Node (node:sqlite), com a mesma
 * interface do D1 que o painel usa (prepare/bind/first/all/run e batch = tudo ou nada).
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Banco, Instrucao } from "./base.ts";

type Valor = null | number | bigint | string | Uint8Array;

export function bancoDeTeste(arquivosSql: string[]): Banco & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("pragma foreign_keys = on;");
  for (const f of arquivosSql) sqlite.exec(readFileSync(f, "utf8"));

  const criar = (sql: string, valores: Valor[] = []): Instrucao & { executar(): unknown } => {
    const conferir = () => {
      for (const v of valores) if (v === undefined || typeof v === "boolean") throw new Error(`valor inválido para o SQLite: ${String(v)} em ${sql}`);
      return sqlite.prepare(sql);
    };
    return {
      bind: (...v: unknown[]) => criar(sql, v as Valor[]),
      first: async <T>() => ((conferir().get(...valores) as T) ?? null),
      all: async <T>() => ({ results: conferir().all(...valores) as T[] }),
      run: async () => ({ meta: { changes: Number(conferir().run(...valores).changes) } }),
      executar: () => conferir().run(...valores),
    };
  };

  return {
    sqlite,
    prepare: (sql: string) => criar(sql),
    batch: async (instrucoes: Instrucao[]) => {
      sqlite.exec("begin");
      try {
        const r = instrucoes.map((i) => (i as unknown as { executar(): unknown }).executar());
        sqlite.exec("commit");
        return r;
      } catch (e) {
        sqlite.exec("rollback");
        throw e;
      }
    },
  };
}
