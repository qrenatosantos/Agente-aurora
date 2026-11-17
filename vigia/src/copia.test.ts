import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bancoDeTeste } from "../../painel/lib/banco/sqlite-teste.ts";
import { gerarCopia, nomeDaCopia, valorSql } from "./copia.ts";

const pasta = join(import.meta.dirname, "../../painel/banco/migracoes");
const migracoes = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort().map((f) => join(pasta, f));
const iniciais = join(import.meta.dirname, "../../clientes/aurora/dados-iniciais.sql");

test("cópia: valores viram SQL seguro (aspas, nulo, números, binário)", () => {
  assert.equal(valorSql(null), "NULL");
  assert.equal(valorSql(12.5), "12.5");
  assert.equal(valorSql("d'água; DROP TABLE x;--"), "'d''água; DROP TABLE x;--'");
  assert.equal(valorSql(new Uint8Array([0, 255])), "X'00ff'");
  assert.equal(valorSql([1, 2]), "X'0102'");
  assert.throws(() => valorSql(Number.NaN));
});

test("cópia: restaurar num banco com as mesmas migrações deixa todas as linhas iguais", async () => {
  const origem = bancoDeTeste([...migracoes, iniciais]);
  origem.sqlite.exec("insert into registro (ator_nome, acao, detalhes) values ('Renato', 'teste', json_object('t', 'texto com ''aspas'' e' || char(10) || 'quebra'))");
  const { sql, tabelas } = await gerarCopia(origem);
  assert.ok(Object.keys(tabelas).includes("agente_config"));
  assert.ok(!Object.keys(tabelas).includes("d1_migrations"));

  // destino já tem dados diferentes: a cópia apaga e regrava
  const destino = bancoDeTeste(migracoes);
  destino.sqlite.exec("insert into registro (ator_nome, acao) values ('lixo', 'x')");
  destino.sqlite.exec(sql.replace("PRAGMA defer_foreign_keys = true;", "PRAGMA foreign_keys = off;"));
  for (const t of Object.keys(tabelas)) {
    const a = origem.sqlite.prepare(`select * from "${t}" order by rowid`).all();
    const b = destino.sqlite.prepare(`select * from "${t}" order by rowid`).all();
    assert.deepEqual(b, a, `tabela ${t}`);
  }
});

test("cópia: nome do arquivo por banco e dia", () => {
  assert.equal(nomeDaCopia("aurora-agente", new Date("2026-11-17T06:17:00Z")), "aurora-agente/2026-11-17.sql");
});
