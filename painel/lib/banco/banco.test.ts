/**
 * TESTES DAS REGRAS DO BANCO DO PAINEL (D1/SQLite), sem internet:
 *   npm run test:banco   (na raiz)
 *
 * Carrega painel/banco/schema.sql e clientes/aurora/dados-iniciais.sql DUAS vezes (prova de que podem
 * rodar de novo sem estragar nada) e exercita cada regra como o gestor, a atendente, uma pessoa
 * desativada e um visitante (sem login) fariam. São os mesmos casos do banco antigo (Supabase),
 * mais os do login com e-mail e senha.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Ator } from "./base.ts";
import { lerConfig, listarVersoes, restaurarVersao, salvarConfig } from "./config.ts";
import { alertasTexto, alterarConhecimento, excluirConhecimento, incluirConhecimento, listarConhecimento } from "./conhecimento.ts";
import { enderecoCrm, gravarTesteIntegracao, lerIntegracoes, salvarIntegracoes, salvarSegredo, segredoCifrado, situacaoSegredos } from "./integracoes.ts";
import { apagarSimulacao, atualizarSimulacao, criarSimulacao, gastoMes, inicioDoMesBrasilia, lerOperacao, listarRegistro, pausarAgente, registrarUsoAgente, registrarUsoIA, retomarAgente } from "./operacao.ts";
import { alterarPessoa, atorDaSessao, definirSenhaComLink, entrar, gerarLinkSenha, incluirPessoa, instalar, listarEquipe, precisaInstalar, removerPessoa, sair, trocarMinhaSenha } from "./pessoas.ts";
import { bancoDeTeste } from "./sqlite-teste.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const ARQUIVOS = [join(raiz, "painel/banco/schema.sql"), join(raiz, "clientes/aurora/dados-iniciais.sql")];
const db = bancoDeTeste([...ARQUIVOS, ...ARQUIVOS]);

const CODIGO = "codigo-de-instalacao-123";
const SENHA = "senha-forte-123";
const CIFRADO = "v1:AAAAAAAAAAAAAAAA:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";
let andre: Ator; // 1º gestor
let codigoAndre = "";
let bruna: Ator; // atendente
let renato: Ator; // 2º gestor
const visitante: Ator = null;
const desativado: Ator = { id: "x", nome: "Fulano", papel: "gestor", ativo: false };

const recusa = (p: Promise<unknown>, trecho: RegExp) => assert.rejects(p, trecho);
const qtd = (sql: string) => (db.sqlite.prepare(sql).get() as { n: number }).n;

/** Inclui uma pessoa, define a senha pelo link e entra. Devolve o ator. */
async function cadastrarEEntrar(gestor: Ator, email: string, nome: string, papel: "gestor" | "atendente") {
  const { codigoLink } = await incluirPessoa(db, gestor, { email, nome, papel });
  await definirSenhaComLink(db, codigoLink, SENHA);
  return atorDaSessao(db, await entrar(db, { email, senha: SENHA, ip: "10.0.0.1" }));
}

before(async () => {
  assert.equal(await precisaInstalar(db), true);
  await instalar(db, { codigo: CODIGO, codigoCerto: CODIGO, nome: "André", email: "Andre@Aurora.test", senha: SENHA });
  codigoAndre = await entrar(db, { email: "andre@aurora.test", senha: SENHA, ip: "10.0.0.1" });
  andre = await atorDaSessao(db, codigoAndre);
  bruna = await cadastrarEEntrar(andre, "bruna@aurora.test", "Bruna", "atendente");
});

describe("instalação e login", () => {
  test("o 1º gestor só nasce com o código de instalação, e uma vez só", async () => {
    assert.equal(andre?.papel, "gestor");
    assert.equal(await precisaInstalar(db), false);
    await recusa(instalar(db, { codigo: CODIGO, codigoCerto: CODIGO, nome: "Intruso", email: "x@x.test", senha: SENHA }), /já foi instalado/);
    const outro = bancoDeTeste(ARQUIVOS);
    await recusa(instalar(outro, { codigo: "errado-errado-errado", codigoCerto: CODIGO, nome: "Intruso", email: "x@x.test", senha: SENHA }), /incorreto/);
    await recusa(instalar(outro, { codigo: CODIGO, codigoCerto: undefined, nome: "Intruso", email: "x@x.test", senha: SENHA }), /não foi configurado/);
    await recusa(instalar(outro, { codigo: CODIGO, codigoCerto: CODIGO, nome: "Fraca", email: "f@x.test", senha: "123" }), /pelo menos 10/);
  });

  test("senha errada é recusada; depois de 5 erros o e-mail fica bloqueado por um tempo", async () => {
    await recusa(entrar(db, { email: "bruna@aurora.test", senha: "errada-123456", ip: "10.0.0.2" }), /incorretos/);
    await recusa(entrar(db, { email: "ninguem@aurora.test", senha: SENHA, ip: "10.0.0.2" }), /incorretos/);
    const t = await incluirPessoa(db, andre, { email: "tiago@aurora.test", nome: "Tiago", papel: "atendente" });
    await definirSenhaComLink(db, t.codigoLink, SENHA);
    for (let i = 0; i < 5; i++) await recusa(entrar(db, { email: "tiago@aurora.test", senha: "errada-123456", ip: "10.0.0.3" }), /incorretos/);
    await recusa(entrar(db, { email: "tiago@aurora.test", senha: SENHA, ip: "10.0.0.3" }), /Muitas tentativas/);
    await removerPessoa(db, andre, t.id);
  });

  test("no banco ficam só hashes: nem a senha nem o código da sessão aparecem", async () => {
    const codigo = await entrar(db, { email: "bruna@aurora.test", senha: SENHA, ip: null });
    const tudo = JSON.stringify([db.sqlite.prepare("select * from pessoas").all(), db.sqlite.prepare("select * from sessoes").all()]);
    assert.ok(!tudo.includes(SENHA) && !tudo.includes(codigo));
    await sair(db, codigo);
    assert.equal(await atorDaSessao(db, codigo), null);
  });

  test("o link de senha vale uma vez só; um link novo cancela o anterior", async () => {
    const id = (await listarEquipe(db, andre)).find((p) => p.email === "bruna@aurora.test")!.id;
    const l1 = await gerarLinkSenha(db, andre, id);
    const l2 = await gerarLinkSenha(db, andre, id);
    await recusa(definirSenhaComLink(db, l1, "outra-senha-123"), /não vale mais/);
    await definirSenhaComLink(db, l2, SENHA);
    await recusa(definirSenhaComLink(db, l2, SENHA), /não vale mais/);
    await recusa(gerarLinkSenha(db, bruna, id), /Só o gestor/);
    bruna = await atorDaSessao(db, await entrar(db, { email: "bruna@aurora.test", senha: SENHA, ip: null })); // o link derrubou as sessões
  });

  test("trocar a própria senha exige a senha atual", async () => {
    await recusa(trocarMinhaSenha(db, bruna, "errada-123456", "nova-senha-456"), /atual está incorreta/);
    await trocarMinhaSenha(db, bruna, SENHA, "nova-senha-456");
    await trocarMinhaSenha(db, bruna, "nova-senha-456", SENHA);
  });
});

describe("pessoas e papéis", () => {
  test("gestor cadastra a atendente; ela entra com a senha que definiu", async () => {
    assert.equal(bruna?.papel, "atendente");
    assert.equal(bruna?.ativo, true);
    const equipe = await listarEquipe(db, bruna);
    assert.ok(equipe.some((p) => p.email === "andre@aurora.test"));
  });

  test("atendente não cadastra pessoas nem muda papéis; visitante não vê a equipe", async () => {
    await recusa(incluirPessoa(db, bruna, { email: "c@x.test", nome: "Carla", papel: "atendente" }), /Só o gestor/);
    await recusa(alterarPessoa(db, bruna, bruna!.id, { papel: "gestor" }), /Só o gestor/);
    await recusa(listarEquipe(db, visitante), /Sem permissão/);
    await recusa(listarEquipe(db, desativado), /Sem permissão/);
  });

  test("não dá para ficar sem gestor nem mudar o próprio papel", async () => {
    await recusa(alterarPessoa(db, andre, andre!.id, { papel: "atendente" }), /próprio papel/);
    await recusa(alterarPessoa(db, andre, andre!.id, { ativo: false }), /próprio papel/);
    await recusa(removerPessoa(db, andre, andre!.id), /próprio cadastro/);
    assert.equal(qtd("select count(*) n from pessoas where papel = 'gestor' and ativo = 1"), 1);
  });

  test("e-mail repetido é recusado", async () => {
    await recusa(incluirPessoa(db, andre, { email: "BRUNA@aurora.test", nome: "Bruna 2", papel: "atendente" }), /Já existe/);
  });

  test("com um 2º gestor, o 1º pode ser alterado por ele; quem é desativado perde o acesso na hora", async () => {
    renato = await cadastrarEEntrar(andre, "renato@aurora.test", "Renato", "gestor");
    await alterarPessoa(db, renato, andre!.id, { papel: "atendente" });
    assert.equal(await atorDaSessao(db, codigoAndre), null); // mudou o papel: a sessão antiga do André caiu
    await alterarPessoa(db, renato, andre!.id, { papel: "gestor" });
    andre = await atorDaSessao(db, await entrar(db, { email: "andre@aurora.test", senha: SENHA, ip: null }));
    assert.equal(andre?.papel, "gestor");
    // desativar derruba as sessões
    const c = await entrar(db, { email: "renato@aurora.test", senha: SENHA, ip: null });
    await alterarPessoa(db, andre, renato!.id, { ativo: false });
    assert.equal(await atorDaSessao(db, c), null);
    await recusa(entrar(db, { email: "renato@aurora.test", senha: SENHA, ip: null }), /desativado/);
    await alterarPessoa(db, andre, renato!.id, { ativo: true });
    renato = await atorDaSessao(db, await entrar(db, { email: "renato@aurora.test", senha: SENHA, ip: null }));
  });
});

describe("dados iniciais", () => {
  test("instruções sugeridas entram uma vez, como versão do sistema", async () => {
    const versoes = await listarVersoes(db, andre);
    const v1 = versoes.find((v) => v.numero === 1)!;
    assert.equal(v1.autor_nome, "Sistema");
    assert.match(v1.descricao ?? "", /inicial/);
    assert.equal(versoes.filter((v) => v.numero === 1).length, 1);
    const c = await lerConfig(db, andre);
    assert.ok(c.instrucoes.length > 500);
    assert.ok(c.gatilhos_palavras.includes("desconto"));
  });

  test("conhecimento inicial entra sem duplicar e SEM alertas de preço", async () => {
    const k = await listarConhecimento(db, andre);
    assert.equal(k.length, 15);
    for (const item of k) assert.deepEqual(alertasTexto(`${item.pergunta ?? ""}\n${item.titulo}\n${item.conteudo}`), [], item.titulo);
  });
});

describe("configuração do agente e versões", () => {
  test("existe uma única linha de configuração, já com versão", async () => {
    assert.equal(qtd("select count(*) n from agente_config"), 1);
    assert.ok((await lerConfig(db, bruna)).versao >= 1);
  });

  test("atendente lê, mas não altera a configuração; visitante não lê", async () => {
    assert.ok((await lerConfig(db, bruna)).nome_agente);
    await recusa(salvarConfig(db, bruna, { tom: "x" }), /Só o gestor/);
    await recusa(lerConfig(db, visitante), /Sem permissão/);
  });

  test("alterar cria versão nova com a lista do que mudou; salvar igual não cria", async () => {
    const antes = (await lerConfig(db, andre)).versao;
    const v = await salvarConfig(db, andre, { tom: "Bem simpático.", espera_segundos: 10 });
    assert.equal(v, antes + 1);
    const ultima = (await listarVersoes(db, andre))[0];
    assert.deepEqual(ultima.campos, ["espera_segundos", "tom"]);
    assert.equal(ultima.autor_nome, "André");
    assert.equal(await salvarConfig(db, andre, { tom: "Bem simpático." }), v);
  });

  test("voltar a uma versão gera uma versão nova igual à escolhida", async () => {
    const atual = (await lerConfig(db, andre)).versao;
    const n = await restaurarVersao(db, andre, 1);
    assert.equal(n, atual + 1);
    const c = await lerConfig(db, andre);
    assert.equal(c.espera_segundos, 8);
    assert.match((await listarVersoes(db, andre))[0].descricao ?? "", /Voltou para a versão 1/);
  });

  test("atendente não volta versão nem lê o histórico", async () => {
    await recusa(restaurarVersao(db, bruna, 1), /Só o gestor/);
    await recusa(listarVersoes(db, bruna), /Só o gestor/);
  });

  test("limites de valores são respeitados", async () => {
    await recusa(salvarConfig(db, andre, { max_msgs_sem_avanco: 1 }), /fora do permitido/);
    await recusa(salvarConfig(db, andre, { limite_mensal_usd: 0 }), /fora do permitido/);
    await recusa(salvarConfig(db, andre, { modelo: "Modelo Inválido!" }), /fora do permitido/);
  });
});

describe("conhecimento e alertas de preço", () => {
  test("texto com preço e condição recebe alertas; texto comum não", async () => {
    const a = await incluirConhecimento(db, andre, { tipo: "texto", titulo: "Pagamento", conteudo: "Entrada de 30% e saldo em PIX. O pacote custa R$ 1.500,00." });
    assert.ok(a.alertas.includes("valor em reais") && a.alertas.includes("percentual") && a.alertas.includes("forma de pagamento") && a.alertas.includes("menção a preço"));
    const b = await incluirConhecimento(db, andre, { tipo: "texto", titulo: "Gelo", conteudo: "Levamos o gelo e as frutas." });
    assert.deepEqual(b.alertas, []);
  });

  test("alerta reaparece se o texto for editado", async () => {
    const { id } = await incluirConhecimento(db, andre, { tipo: "texto", titulo: "Agenda", conteudo: "Atendemos aos sábados." });
    const r = await alterarConhecimento(db, andre, id, { conteudo: "Temos poucas vagas, a data fica lotada rápido." });
    assert.ok(r.alertas.includes("disponibilidade de data"));
  });

  test("pergunta exige o texto da pergunta; site exige endereço", async () => {
    await recusa(incluirConhecimento(db, andre, { tipo: "pergunta", titulo: "Sem pergunta", conteudo: "Resposta." }), /Escreva a pergunta/);
    await recusa(incluirConhecimento(db, andre, { tipo: "site", titulo: "Site", conteudo: "Texto do site.", fonte: "aurora.com" }), /endereço/);
  });

  test("atendente lê, mas não altera o conhecimento", async () => {
    assert.ok((await listarConhecimento(db, bruna)).length > 0);
    await recusa(incluirConhecimento(db, bruna, { tipo: "texto", titulo: "X", conteudo: "Teste." }), /Só o gestor/);
    const id = (await listarConhecimento(db, bruna))[0].id;
    await recusa(excluirConhecimento(db, bruna, id), /Só o gestor/);
  });

  test("excluir guarda o texto anterior no registro", async () => {
    const { id } = await incluirConhecimento(db, andre, { tipo: "texto", titulo: "Para apagar", conteudo: "Texto que vai sumir." });
    await excluirConhecimento(db, andre, id);
    const r = (await listarRegistro(db, andre, { acao: "conhecimento.excluiu" }))[0];
    assert.equal((r.detalhes.antes as { conteudo: string }).conteudo, "Texto que vai sumir.");
  });
});

describe("segredos das integrações", () => {
  test("só o gestor salva", async () => {
    await salvarSegredo(db, andre, "openai_chave", CIFRADO, "sk-abc1234");
    await recusa(salvarSegredo(db, bruna, "openai_chave", CIFRADO, "x"), /Só o gestor/);
  });

  test("a situação mostra só os 4 últimos caracteres", async () => {
    const s = await situacaoSegredos(db, andre);
    assert.deepEqual(s.map((x) => [x.nome, x.final]), [["openai_chave", "1234"]]);
    assert.ok(!JSON.stringify(s).includes(CIFRADO));
    await recusa(situacaoSegredos(db, bruna), /Só o gestor/);
  });

  test("o texto cifrado só sai pelo servidor e nunca vai para o registro", async () => {
    await salvarSegredo(db, andre, "whatsapp_token", CIFRADO, "EAAG9999");
    assert.equal(await segredoCifrado(db, andre, "whatsapp_token"), CIFRADO);
    assert.equal(await segredoCifrado(db, bruna, "openai_chave"), CIFRADO); // o simulador usa
    await recusa(segredoCifrado(db, bruna, "whatsapp_token"), /Sem permissão/);
    await recusa(segredoCifrado(db, visitante, "openai_chave"), /Sem permissão/);
    assert.ok(!JSON.stringify(db.sqlite.prepare("select * from registro").all()).includes(CIFRADO));
  });

  test("nome de chave desconhecido ou formato errado é recusado", async () => {
    await recusa(salvarSegredo(db, andre, "senha_do_banco", CIFRADO, null), /desconhecida/);
    await recusa(salvarSegredo(db, andre, "crm_chave", "texto-puro", null), /Formato/);
  });

  test("teste de conexão fica gravado; integrações só para o gestor", async () => {
    await salvarIntegracoes(db, andre, { crm_url: "https://crm.aurora.test" });
    await gravarTesteIntegracao(db, andre, "crm", { ok: true, mensagem: "Conectado." });
    const i = await lerIntegracoes(db, andre);
    assert.equal(i.teste_crm?.ok, true);
    assert.ok(i.teste_crm?.em);
    await recusa(lerIntegracoes(db, bruna), /Só o gestor/);
    await recusa(salvarIntegracoes(db, bruna, { crm_url: "https://mal.test" }), /Só o gestor/);
    await recusa(salvarIntegracoes(db, andre, { crm_url: "crm sem http" }), /fora do permitido/);
    assert.equal(await enderecoCrm(db, bruna), "https://crm.aurora.test");
  });
});

describe("botão de emergência", () => {
  test("atendente pausa; só o gestor religa", async () => {
    await pausarAgente(db, bruna, "Resposta estranha");
    const op = await lerOperacao(db, andre);
    assert.equal(op.pausado, true);
    assert.equal(op.pausado_por, "Bruna");
    await recusa(retomarAgente(db, bruna), /Só o gestor/);
    await retomarAgente(db, andre);
    assert.equal((await lerOperacao(db, bruna)).pausado, false);
  });

  test("visitante não pausa nem lê a operação", async () => {
    await recusa(pausarAgente(db, visitante), /Sem permissão/);
    await recusa(lerOperacao(db, visitante), /Sem permissão/);
  });
});

describe("simulador e gasto com a IA", () => {
  test("atendente cria simulação (dona automática), mas não a que grava no CRM", async () => {
    const id = await criarSimulacao(db, bruna, { modelo: "gpt-6-luna" });
    assert.equal((db.sqlite.prepare("select criado_por_nome n from simulacoes where id = ?").get(id) as { n: string }).n, "Bruna");
    await recusa(criarSimulacao(db, bruna, { modelo: "gpt-6-luna", gravar_crm: true }), /Só o gestor/);
  });

  test("atendente não altera nem apaga simulação do gestor; o modo não muda depois", async () => {
    const id = await criarSimulacao(db, andre, { modelo: "gpt-6-luna", gravar_crm: true });
    await recusa(atualizarSimulacao(db, bruna, id, { titulo: "Minha" }), /Só quem criou/);
    await recusa(apagarSimulacao(db, bruna, id), /Só quem criou/);
    await atualizarSimulacao(db, andre, id, { mensagens: [{ papel: "cliente", texto: "Oi" }] });
    assert.equal((db.sqlite.prepare("select gravar_crm g from simulacoes where id = ?").get(id) as { g: number }).g, 1);
    await apagarSimulacao(db, andre, id);
  });

  test("uso da IA soma no gasto do mês; origem 'agente' não pode ser gravada pelo painel", async () => {
    await registrarUsoIA(db, bruna, { origem: "simulador", modelo: "gpt-6-luna", entrada: 1000, cache: 0, saida: 100, custo: 0.5 });
    await registrarUsoAgente(db, { modelo: "gpt-6-luna", entrada: 10, cache: 0, saida: 1, custo: 0.25 });
    assert.equal(await gastoMes(db, bruna), 0.75);
    await recusa(registrarUsoIA(db, bruna, { origem: "agente" as "simulador", modelo: "x", entrada: 1, cache: 0, saida: 1, custo: 0 }), /Origem inválida/);
    await recusa(registrarUsoIA(db, bruna, { origem: "simulador", modelo: "x", entrada: -1, cache: 0, saida: 1, custo: 0 }), /fora do esperado/);
    await recusa(gastoMes(db, visitante), /Sem permissão/);
  });

  test("o mês começa à meia-noite de Brasília", () => {
    assert.equal(inicioDoMesBrasilia(new Date("2026-12-01T02:59:00Z")), "2026-11-01T03:00:00.000Z");
    assert.equal(inicioDoMesBrasilia(new Date("2026-12-01T03:00:00Z")), "2026-12-01T03:00:00.000Z");
  });
});

describe("registro e visitante", () => {
  test("registro guarda quem fez; só o gestor lê", async () => {
    const r = await listarRegistro(db, andre, { acao: "agente.pausou" });
    assert.equal(r[0].ator_nome, "Bruna");
    assert.equal(r[0].ator_tipo, "humano");
    await recusa(listarRegistro(db, bruna), /Só o gestor/);
  });

  test("visitante (sem login) não lê nada", async () => {
    await recusa(listarConhecimento(db, visitante), /Sem permissão/);
    await recusa(lerConfig(db, visitante), /Sem permissão/);
    await recusa(listarRegistro(db, visitante), /Só o gestor/);
    assert.equal(await atorDaSessao(db, "codigo-inventado-que-nao-existe-123"), null);
  });
});
