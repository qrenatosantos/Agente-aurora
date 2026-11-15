/**
 * TESTES DAS REGRAS DO BANCO DO AGENTE — rodam num Postgres embutido (PGlite), sem Supabase.
 *
 *   npm run test:banco
 *
 * Carrega supabase/schema.sql e supabase/dados-iniciais.sql DUAS vezes (prova de que podem
 * rodar de novo sem estragar nada) e exercita as regras como cada papel faria:
 * visitante (anon), gestor e atendente (authenticated).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const pasta = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (nome) => readFileSync(join(pasta, nome), "utf8");

const ANDRE = "11111111-1111-4111-8111-111111111111"; // 1º login = gestor
const BRUNA = "22222222-2222-4222-8222-222222222222"; // cadastrada antes pelo gestor = atendente
const ESTRANHO = "33333333-3333-4333-8333-333333333333"; // entrou sem cadastro = desativado
const RENATO = "44444444-4444-4444-8444-444444444444"; // vira 2º gestor

const db = new PGlite({ extensions: { pgcrypto } });

/** Executa como um papel do Supabase. Erro = desfaz tudo e propaga. */
async function como(papel, uid, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    if (papel) await tx.exec(`set local role ${papel}`);
    return fn(tx);
  });
}
const gestor = (fn) => como("authenticated", ANDRE, fn);
const atendente = (fn) => como("authenticated", BRUNA, fn);
const estranho = (fn) => como("authenticated", ESTRANHO, fn);
const visitante = (fn) => como("anon", null, fn);
const banco = (fn) => como(null, null, fn);

const um = async (tx, sql, params = []) => (await tx.query(sql, params)).rows[0];
const valor = async (tx, sql, params = []) => Object.values((await um(tx, sql, params)) ?? {})[0];
const CIFRADO = "v1:AAAAAAAAAAAAAAAA:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";

before(async () => {
  // Imitação mínima do Supabase: auth, papéis e as permissões padrão que ele dá.
  await db.exec(`
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    insert into auth.users values
      ('${ANDRE}', 'Andre@Aurora.test'), ('${BRUNA}', 'bruna@aurora.test'),
      ('${ESTRANHO}', 'estranho@x.test'), ('${RENATO}', 'renato@aurora.test');
  `);
  for (let i = 0; i < 2; i++) {
    await db.exec(ler("schema.sql"));
    if (existsSync(join(pasta, "dados-iniciais.sql"))) await db.exec(ler("dados-iniciais.sql"));
  }
});

describe("pessoas e papéis", () => {
  test("o primeiro login vira gestor ativo (e-mail em minúsculas)", async () => {
    const p = await gestor((tx) => valor(tx, "select public.meu_perfil()"));
    assert.equal(p.papel, "gestor");
    assert.equal(p.ativo, true);
    assert.equal(p.email, "andre@aurora.test");
  });

  test("quem entra sem cadastro fica desativado e não vê nada", async () => {
    const p = await estranho((tx) => valor(tx, "select public.meu_perfil()"));
    assert.equal(p.papel, "atendente");
    assert.equal(p.ativo, false);
    const n = await estranho((tx) => valor(tx, "select count(*)::int from public.agente_config"));
    assert.equal(n, 0);
  });

  test("gestor cadastra a atendente; no 1º login ela é ligada ao cadastro", async () => {
    await gestor((tx) => tx.query("insert into public.perfis (email, nome, papel) values ('bruna@aurora.test', 'Bruna', 'atendente')"));
    const p = await atendente((tx) => valor(tx, "select public.meu_perfil()"));
    assert.equal(p.nome, "Bruna");
    assert.equal(p.papel, "atendente");
    assert.equal(p.ativo, true);
  });

  test("atendente não cadastra pessoas nem muda papéis", async () => {
    await assert.rejects(atendente((tx) => tx.query("insert into public.perfis (email, nome) values ('x@y.test', 'Xis')")));
    const r = await atendente((tx) => tx.query("update public.perfis set papel = 'gestor' where email = 'bruna@aurora.test'"));
    assert.equal(r.affectedRows, 0);
  });

  test("não dá para ficar sem gestor nem mudar o próprio papel", async () => {
    await assert.rejects(
      gestor((tx) => tx.query("update public.perfis set papel = 'atendente' where email = 'andre@aurora.test'")),
      /próprio papel/,
    );
    await assert.rejects(
      banco((tx) => tx.query("update public.perfis set ativo = false where email = 'andre@aurora.test'")),
      /pelo menos um gestor/,
    );
  });

  test("com um 2º gestor, o 1º pode ser alterado por ele", async () => {
    await gestor((tx) => tx.query("insert into public.perfis (email, nome, papel) values ('renato@aurora.test', 'Renato', 'gestor')"));
    await como("authenticated", RENATO, (tx) => tx.query("select public.meu_perfil()"));
    await como("authenticated", RENATO, (tx) => tx.query("update public.perfis set nome = 'André Procácio' where email = 'andre@aurora.test'"));
    const nome = await gestor((tx) => valor(tx, "select nome from public.perfis where email = 'andre@aurora.test'"));
    assert.equal(nome, "André Procácio");
  });
});

describe("dados iniciais", () => {
  test("instruções sugeridas entram uma vez, como versão do sistema", async () => {
    const c = await banco((tx) => um(tx, "select instrucoes, jsonb_array_length(exemplos) as ex, versao from public.agente_config"));
    assert.ok(c.instrucoes.length > 500);
    assert.ok(c.ex >= 3);
    const v = await banco((tx) => um(tx, "select autor_id, autor_nome, descricao from public.config_versoes where numero = $1", [c.versao]));
    assert.equal(v.autor_id, null);
    assert.equal(v.autor_nome, "Sistema");
    assert.match(v.descricao, /Versão inicial sugerida/);
    assert.equal(c.versao, 1);
    assert.equal(await banco((tx) => valor(tx, "select count(*)::int from public.config_versoes")), 1, "rodar 2 vezes não pode criar versões extras");
  });

  test("conhecimento inicial entra sem duplicar e SEM alertas de preço", async () => {
    const r = await banco((tx) => tx.query("select titulo, alertas from public.conhecimento"));
    assert.ok(r.rows.length >= 15);
    for (const l of r.rows) assert.deepEqual(l.alertas, [], `“${l.titulo}” ficou com alerta ${l.alertas}`);
  });
});

describe("configuração do agente e versões", () => {
  test("existe uma única linha de configuração, já com versão", async () => {
    const r = await gestor((tx) => um(tx, "select count(*)::int as n, max(versao) as v from public.agente_config"));
    assert.equal(r.n, 1);
    assert.ok(r.v >= 1);
  });

  test("atendente lê, mas não altera a configuração", async () => {
    const n = await atendente((tx) => valor(tx, "select count(*)::int from public.agente_config"));
    assert.equal(n, 1);
    const r = await atendente((tx) => tx.query("update public.agente_config set tom = 'x' where unica"));
    assert.equal(r.affectedRows, 0);
  });

  test("alterar cria versão nova com a lista do que mudou; salvar igual não cria", async () => {
    const antes = await gestor((tx) => valor(tx, "select versao from public.agente_config"));
    await gestor((tx) => tx.query("update public.agente_config set tom = 'Bem descontraído', espera_segundos = 10 where unica"));
    const v = await gestor((tx) => um(tx, "select numero, campos, autor_nome from public.config_versoes order by numero desc limit 1"));
    assert.equal(v.numero, antes + 1);
    assert.deepEqual(v.campos, ["espera_segundos", "tom"]);
    assert.equal(v.autor_nome, "André Procácio");
    await gestor((tx) => tx.query("update public.agente_config set tom = 'Bem descontraído' where unica"));
    const depois = await gestor((tx) => valor(tx, "select versao from public.agente_config"));
    assert.equal(depois, antes + 1);
  });

  test("voltar a uma versão gera uma versão nova igual à escolhida", async () => {
    const atual = await gestor((tx) => valor(tx, "select versao from public.agente_config"));
    const anterior = atual - 1;
    const tomAnterior = await gestor((tx) => valor(tx, "select dados ->> 'tom' from public.config_versoes where numero = $1", [anterior]));
    const nova = await gestor((tx) => valor(tx, "select public.restaurar_versao($1)", [anterior]));
    assert.equal(nova, atual + 1);
    const c = await gestor((tx) => um(tx, "select tom, espera_segundos from public.agente_config"));
    assert.equal(c.tom, tomAnterior);
    const desc = await gestor((tx) => valor(tx, "select descricao from public.config_versoes where numero = $1", [nova]));
    assert.match(desc, /Voltou para a versão/);
  });

  test("atendente não volta versão nem lê o histórico", async () => {
    await assert.rejects(atendente((tx) => tx.query("select public.restaurar_versao(1)")), /Só o gestor/);
    const n = await atendente((tx) => valor(tx, "select count(*)::int from public.config_versoes"));
    assert.equal(n, 0);
  });

  test("limites de valores são respeitados", async () => {
    await assert.rejects(gestor((tx) => tx.query("update public.agente_config set espera_segundos = 99 where unica")));
    await assert.rejects(gestor((tx) => tx.query("update public.agente_config set modelo = 'Modelo Com Espaço' where unica")));
  });
});

describe("conhecimento e alertas de preço", () => {
  test("texto com preço e condição recebe alertas; texto comum não", async () => {
    const com = await gestor((tx) =>
      valor(tx, "insert into public.conhecimento (tipo, titulo, conteudo) values ('texto', 'Valores', 'A partir de R$ 45,00 por convidado, entrada de 30% no PIX e desconto à vista.') returning alertas"),
    );
    for (const a of ["valor em reais", "percentual", "menção a preço", "desconto ou cortesia", "forma de pagamento"]) {
      assert.ok(com.includes(a), `faltou o alerta "${a}" em ${com}`);
    }
    const sem = await gestor((tx) =>
      valor(tx, "insert into public.conhecimento (tipo, titulo, pergunta, conteudo) values ('pergunta', 'Gelo', 'Vocês levam o gelo?', 'Sim: gelo, frutas frescas e xaropes artesanais estão incluídos em todos os pacotes.') returning alertas"),
    );
    assert.deepEqual(sem, []);
  });

  test("alerta reaparece se o texto for editado", async () => {
    const id = await gestor((tx) => valor(tx, "select id from public.conhecimento where titulo = 'Gelo'"));
    const a = await gestor((tx) => valor(tx, "update public.conhecimento set conteudo = conteudo || ' Cancelamento com multa.' where id = $1 returning alertas", [id]));
    assert.ok(a.includes("cancelamento ou multa"));
  });

  test("pergunta exige o texto da pergunta; site exige endereço", async () => {
    await assert.rejects(gestor((tx) => tx.query("insert into public.conhecimento (tipo, titulo, conteudo) values ('pergunta', 'Sem pergunta', 'resposta')")));
    await assert.rejects(gestor((tx) => tx.query("insert into public.conhecimento (tipo, titulo, conteudo, fonte) values ('site', 'Página', 'texto', 'nao-e-url')")));
  });

  test("atendente lê, mas não altera o conhecimento", async () => {
    const n = await atendente((tx) => valor(tx, "select count(*)::int from public.conhecimento"));
    assert.ok(n >= 2);
    await assert.rejects(atendente((tx) => tx.query("insert into public.conhecimento (tipo, titulo, conteudo) values ('texto', 'X', 'Teste')")));
    const r = await atendente((tx) => tx.query("delete from public.conhecimento"));
    assert.equal(r.affectedRows, 0);
  });

  test("excluir guarda o texto anterior no registro", async () => {
    const id = await gestor((tx) => valor(tx, "select id from public.conhecimento where titulo = 'Valores'"));
    await gestor((tx) => tx.query("delete from public.conhecimento where id = $1", [id]));
    const det = await gestor((tx) => valor(tx, "select detalhes from public.registro where acao = 'conhecimento.excluiu' order by id desc limit 1"));
    assert.match(det.antes.conteudo, /R\$ 45,00/);
  });
});

describe("segredos das integrações", () => {
  test("só o gestor salva; ninguém lê a tabela diretamente", async () => {
    await assert.rejects(atendente((tx) => tx.query("select public.salvar_segredo('openai_chave', $1, 'abcd')", [CIFRADO])), /Só o gestor/);
    await gestor((tx) => tx.query("select public.salvar_segredo('openai_chave', $1, 'sk-proj-xyz1234')", [CIFRADO]));
    await assert.rejects(gestor((tx) => tx.query("select * from public.segredos")), /permission denied/);
    await assert.rejects(visitante((tx) => tx.query("select * from public.segredos")), /permission denied/);
  });

  test("a situação mostra só os 4 últimos caracteres", async () => {
    const s = await gestor((tx) => um(tx, "select * from public.situacao_segredos() where nome = 'openai_chave'"));
    assert.equal(s.final, "1234");
    assert.equal(s.cifrado, undefined);
    const n = await atendente((tx) => valor(tx, "select count(*)::int from public.situacao_segredos()"));
    assert.equal(n, 0);
  });

  test("o texto cifrado só sai para o gestor e nunca vai para o registro", async () => {
    assert.equal(await gestor((tx) => valor(tx, "select public.segredo_cifrado('openai_chave')")), CIFRADO);
    assert.equal(await atendente((tx) => valor(tx, "select public.segredo_cifrado('openai_chave')")), null);
    const tudo = await gestor((tx) => valor(tx, "select string_agg(detalhes::text, ' ') from public.registro"));
    assert.ok(!tudo.includes(CIFRADO));
  });

  test("nome de chave desconhecido ou formato errado é recusado", async () => {
    await assert.rejects(gestor((tx) => tx.query("select public.salvar_segredo('outra', $1, null)", [CIFRADO])));
    await assert.rejects(gestor((tx) => tx.query("select public.salvar_segredo('openai_chave', 'sk-em-texto-puro', null)")));
  });

  test("teste de conexão fica gravado; integrações só para o gestor", async () => {
    await gestor((tx) => tx.query(`select public.gravar_teste_integracao('crm', '{"ok": true, "mensagem": "Chave aceita"}')`));
    const t = await gestor((tx) => valor(tx, "select teste_crm from public.integracoes"));
    assert.equal(t.ok, true);
    assert.ok(t.em);
    const n = await atendente((tx) => valor(tx, "select count(*)::int from public.integracoes"));
    assert.equal(n, 0);
    await assert.rejects(gestor((tx) => tx.query("update public.integracoes set crm_url = 'ftp://x' where unica")));
    await gestor((tx) => tx.query("update public.integracoes set crm_url = 'https://crm.aurora.test' where unica"));
  });
});

describe("botão de emergência", () => {
  test("atendente pausa; só o gestor religa", async () => {
    await atendente((tx) => tx.query("select public.pausar_agente('Resposta estranha')"));
    const o = await gestor((tx) => um(tx, "select pausado, pausado_por, motivo from public.operacao"));
    assert.equal(o.pausado, true);
    assert.equal(o.pausado_por, "Bruna");
    await assert.rejects(atendente((tx) => tx.query("select public.retomar_agente()")), /Só o gestor/);
    await gestor((tx) => tx.query("select public.retomar_agente()"));
    assert.equal(await gestor((tx) => valor(tx, "select pausado from public.operacao")), false);
  });

  test("ninguém altera a operação direto na tabela", async () => {
    const r = await gestor((tx) => tx.query("update public.operacao set pausado = true"));
    assert.equal(r.affectedRows, 0);
  });
});

describe("registro e visitante", () => {
  test("registro guarda quem fez; só o gestor lê", async () => {
    const acoes = await gestor((tx) => tx.query("select distinct acao from public.registro"));
    const lista = acoes.rows.map((r) => r.acao);
    for (const a of ["equipe.incluiu", "config.alterou", "conhecimento.incluiu", "segredo.alterou", "agente.pausou", "agente.retomou", "integracoes.testou"]) {
      assert.ok(lista.includes(a), `faltou "${a}"`);
    }
    assert.equal(await atendente((tx) => valor(tx, "select count(*)::int from public.registro")), 0);
    await assert.rejects(gestor((tx) => tx.query("insert into public.registro (ator_nome, acao) values ('x', 'y')")));
  });

  test("visitante não lê nenhuma tabela", async () => {
    for (const t of ["perfis", "agente_config", "config_versoes", "conhecimento", "integracoes", "operacao", "registro"]) {
      const n = await visitante((tx) => valor(tx, `select count(*)::int from public.${t}`));
      assert.equal(n, 0, `visitante leu ${t}`);
    }
    await assert.rejects(visitante((tx) => tx.query("select public.meu_perfil()")));
  });
});
