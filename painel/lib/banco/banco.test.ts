/**
 * TESTES DAS REGRAS DO BANCO DO PAINEL (D1/SQLite), sem internet:
 *   npm run test:banco   (na raiz)
 *
 * Carrega as migrações de painel/banco/migracoes/ (uma vez, como o D1) e clientes/aurora/dados-iniciais.sql DUAS vezes
 * (prova de que os dados iniciais podem rodar de novo sem estragar nada) e exercita cada regra como o dono da plataforma,
 * o gestor, a atendente, uma pessoa desativada e um visitante (sem login) fariam.
 *
 * MULTI-CLIENTE (Fase 1 da plataforma): além da Aurora, um 2º cliente ("teste") com equipe própria. A seção
 * "isolamento entre clientes" prova, operação por operação, que a equipe de um cliente não lê nem altera nada do outro,
 * e que ninguém da equipe de um cliente alcança as operações do Estúdio (só o dono).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  conversaDoNegocioInterno,
  guardarAvisoInterno,
  lerAvisoInterno,
  ligarConversaInterno,
  listarAvisos,
  listarConversasWhatsApp,
  marcarAvisoProcessadoInterno,
  zerarConversaWhatsApp,
} from "./avisos.ts";
import type { Ator } from "./base.ts";
import { decifrarCom } from "./cifra.ts";
import {
  alterarCliente,
  clienteDaConversaInterno,
  conversaEhDoCliente,
  criarCliente,
  listarClientes,
  meuCliente,
  mudarSituacaoCliente,
  nomeConversaWhatsApp,
} from "./clientes.ts";
import { lerConfig, lerConfigInterno, listarVersoes, restaurarVersao, salvarConfig } from "./config.ts";
import { alertasTexto, alterarConhecimento, conhecimentoDoAgente, excluirConhecimento, incluirConhecimento, listarConhecimento } from "./conhecimento.ts";
import {
  clienteDoWhatsAppInterno,
  clientesComSegredoInterno,
  enderecoCrm,
  gravarTesteIntegracao,
  lerIntegracoes,
  salvarIntegracoes,
  salvarSegredo,
  segredoCifrado,
  segredoCifradoInterno,
  situacaoSegredos,
} from "./integracoes.ts";
import {
  apagarSimulacao,
  atualizarSimulacao,
  criarSimulacao,
  gastoMes,
  gastoMesInterno,
  inicioDoMesBrasilia,
  lerOperacao,
  lerOperacaoInterno,
  lerSimulacao,
  listarRegistro,
  listarSimulacoes,
  pausarAgente,
  registrarUsoAgente,
  registrarUsoIA,
  retomarAgente,
} from "./operacao.ts";
import {
  alterarPessoa,
  ativarDuasEtapas,
  atorDaSessao,
  clientesDoAtor,
  confirmarDuasEtapas,
  definirSenhaComLink,
  entrar,
  faltaDuasEtapas,
  gerarLinkSenha,
  iniciarDuasEtapas,
  incluirPessoa,
  instalar,
  listarEquipe,
  precisaInstalar,
  removerPessoa,
  sair,
  sessaoEsperandoCodigo,
  trocarMinhaSenha,
} from "./pessoas.ts";
import { bancoDeTeste } from "./sqlite-teste.ts";
import { codigoDoPasso, conferirCodigoTotp, deBase32, enderecoOtpauth, paraBase32, passoAtual } from "./totp.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRACOES = join(raiz, "painel/banco/migracoes");
const ARQUIVOS = [...readdirSync(MIGRACOES).filter((f) => f.endsWith(".sql")).sort().map((f) => join(MIGRACOES, f)), join(raiz, "clientes/aurora/dados-iniciais.sql")];
// migrações rodam uma vez (o D1 controla quais já foram aplicadas); os dados iniciais, duas (não duplicam)
const db = bancoDeTeste([...ARQUIVOS, join(raiz, "clientes/aurora/dados-iniciais.sql")]);

const CODIGO = "codigo-de-instalacao-123";
const SENHA = "senha-forte-123";
const CHAVE = btoa(String.fromCharCode(...new Uint8Array(32).fill(7))); // CHAVE_MESTRA de teste
const CIFRADO = "v1:AAAAAAAAAAAAAAAA:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";
const CIFRADO_B = "v1:BBBBBBBBBBBBBBBB:QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=";

let codigoDono = ""; // sessão do Renato (dono), já com as duas etapas
let dono: Ator; // Renato, trabalhando na Aurora
let donoNoTeste: Ator; // Renato, trabalhando no cliente "teste"
let andre: Ator; // gestor da Aurora
let codigoAndre = "";
let bruna: Ator; // atendente da Aurora
let carla: Ator; // 2º gestor da Aurora
let zelia: Ator; // gestora do cliente "teste"
let yuri: Ator; // atendente do cliente "teste"
const visitante: Ator = null;
const desativado: Ator = { id: "x", nome: "Fulano", papel: "gestor", ativo: false, cliente: "aurora", dono: false };

const recusa = (p: Promise<unknown>, trecho: RegExp) => assert.rejects(p, trecho);
const qtd = (sql: string) => (db.sqlite.prepare(sql).get() as { n: number }).n;
const sessao = async (email: string, cliente?: string) => atorDaSessao(db, (await entrar(db, { email, senha: SENHA, ip: null })).codigo, cliente);

/** Código que o aplicativo mostraria agora (deslocado em `passos` × 30 s). */
async function codigoDoApp(pessoaId: string, passos = 0) {
  const r = db.sqlite.prepare("select totp_cifrado c from pessoas where id = ?").get(pessoaId) as { c: string };
  return codigoDoPasso(await decifrarCom(CHAVE, r.c, `totp:${pessoaId}`), passoAtual() + passos);
}

/** Inclui uma pessoa no cliente do gestor, define a senha pelo link e entra. Devolve o ator. */
async function cadastrarEEntrar(gestor: Ator, email: string, nome: string, papel: "gestor" | "atendente") {
  const { codigoLink } = await incluirPessoa(db, gestor, { email, nome, papel });
  await definirSenhaComLink(db, codigoLink, SENHA);
  return atorDaSessao(db, (await entrar(db, { email, senha: SENHA, ip: "10.0.0.1" })).codigo);
}

before(async () => {
  assert.equal(await precisaInstalar(db), true);
  await instalar(db, { codigo: CODIGO, codigoCerto: CODIGO, nome: "Renato", email: "Renato@Plataforma.test", senha: SENHA });
  // dono sem as duas etapas: só consegue ligá-las
  const provisorio = await atorDaSessao(db, (await entrar(db, { email: "renato@plataforma.test", senha: SENHA, ip: null })).codigo, "aurora");
  assert.equal(provisorio?.cliente, null);
  assert.equal(provisorio?.dono, false);
  assert.equal(await faltaDuasEtapas(db, provisorio), true);
  await iniciarDuasEtapas(db, provisorio, CHAVE);
  await ativarDuasEtapas(db, provisorio, await codigoDoApp(provisorio!.id), CHAVE);
  const login = await entrar(db, { email: "renato@plataforma.test", senha: SENHA, ip: null });
  assert.equal(login.duasEtapas, true);
  await confirmarDuasEtapas(db, login.codigo, await codigoDoApp(provisorio!.id, 1), CHAVE);
  codigoDono = login.codigo;
  dono = await atorDaSessao(db, codigoDono, "aurora");
  andre = await cadastrarEEntrar(dono, "andre@aurora.test", "André", "gestor");
  codigoAndre = (await entrar(db, { email: "andre@aurora.test", senha: SENHA, ip: null })).codigo;
  andre = await atorDaSessao(db, codigoAndre);
  bruna = await cadastrarEEntrar(andre, "bruna@aurora.test", "Bruna", "atendente");
  // 2º cliente, com equipe própria
  await criarCliente(db, dono, { id: "teste", nome: "Cliente Teste", plano_nome: "Básico", plano_valor_brl: 300, limite_mensal_usd: 10 });
  donoNoTeste = await atorDaSessao(db, codigoDono, "teste");
  zelia = await cadastrarEEntrar(donoNoTeste, "zelia@teste.test", "Zélia", "gestor");
  yuri = await cadastrarEEntrar(zelia, "yuri@teste.test", "Yuri", "atendente");
});

describe("instalação, login e duas etapas", () => {
  test("a 1ª pessoa nasce dona da plataforma, só com o código de instalação, e uma vez só", async () => {
    assert.equal(dono?.dono, true);
    assert.equal(dono?.cliente, "aurora");
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

  test("no banco ficam só hashes e cifrados: nem a senha, nem o código da sessão, nem o segredo do aplicativo aparecem", async () => {
    const { codigo } = await entrar(db, { email: "bruna@aurora.test", senha: SENHA, ip: null });
    const tudo = JSON.stringify([db.sqlite.prepare("select * from pessoas").all(), db.sqlite.prepare("select * from sessoes").all()]);
    assert.ok(!tudo.includes(SENHA) && !tudo.includes(codigo));
    const segredo = await decifrarCom(CHAVE, (db.sqlite.prepare("select totp_cifrado c from pessoas where dono = 1").get() as { c: string }).c, `totp:${dono!.id}`);
    assert.ok(!tudo.includes(segredo));
    await sair(db, codigo);
    assert.equal(await atorDaSessao(db, codigo), null);
  });

  test("duas etapas: a sessão só vale depois do código certo; código errado, repetido ou atrasado é recusado", async () => {
    const login = await entrar(db, { email: "renato@plataforma.test", senha: SENHA, ip: null });
    assert.equal(login.duasEtapas, true);
    assert.equal(await atorDaSessao(db, login.codigo, "aurora"), null); // sem o código, não entra
    assert.equal((await sessaoEsperandoCodigo(db, login.codigo))?.nome, "Renato");
    await recusa(confirmarDuasEtapas(db, login.codigo, "000000", CHAVE), /Código incorreto/);
    await recusa(confirmarDuasEtapas(db, login.codigo, await codigoDoApp(dono!.id, 1), CHAVE), /Código incorreto/); // o mesmo código não vale duas vezes
    await recusa(confirmarDuasEtapas(db, login.codigo, await codigoDoApp(dono!.id, -1), CHAVE), /Código incorreto/); // nem um anterior
    await recusa(confirmarDuasEtapas(db, "sessao-que-nao-existe-123456", "123456", CHAVE), /tempo para digitar/);
    await recusa(confirmarDuasEtapas(db, codigoAndre, "123456", CHAVE), /tempo para digitar/); // sessão já confirmada não serve
    await sair(db, login.codigo);
  });

  test("duas etapas: 5 códigos errados bloqueiam por um tempo; quem não ligou entra só com a senha", async () => {
    db.sqlite.prepare("delete from tentativas_login where chave like 'totp:%'").run();
    const login = await entrar(db, { email: "renato@plataforma.test", senha: SENHA, ip: null });
    for (let i = 0; i < 5; i++) await recusa(confirmarDuasEtapas(db, login.codigo, "111111", CHAVE), /Código incorreto/);
    await recusa(confirmarDuasEtapas(db, login.codigo, "111111", CHAVE), /Muitos códigos errados/);
    db.sqlite.prepare("delete from tentativas_login where chave like 'totp:%'").run();
    assert.equal((await entrar(db, { email: "bruna@aurora.test", senha: SENHA, ip: null })).duasEtapas, false);
    await recusa(iniciarDuasEtapas(db, dono, CHAVE), /já estão ligadas/);
    await recusa(iniciarDuasEtapas(db, visitante, CHAVE), /Sem permissão/);
  });

  test("o link de senha vale uma vez só; um link novo cancela o anterior", async () => {
    const id = (await listarEquipe(db, andre)).find((p) => p.email === "bruna@aurora.test")!.id;
    const l1 = await gerarLinkSenha(db, andre, id);
    const l2 = await gerarLinkSenha(db, andre, id);
    await recusa(definirSenhaComLink(db, l1, "outra-senha-123"), /não vale mais/);
    await definirSenhaComLink(db, l2, SENHA);
    await recusa(definirSenhaComLink(db, l2, SENHA), /não vale mais/);
    await recusa(gerarLinkSenha(db, bruna, id), /Só o gestor/);
    bruna = await sessao("bruna@aurora.test"); // o link derrubou as sessões
  });

  test("trocar a própria senha exige a senha atual", async () => {
    await recusa(trocarMinhaSenha(db, bruna, "errada-123456", "nova-senha-456"), /atual está incorreta/);
    await trocarMinhaSenha(db, bruna, SENHA, "nova-senha-456");
    await trocarMinhaSenha(db, bruna, "nova-senha-456", SENHA);
  });
});

describe("código do aplicativo (TOTP, RFC 6238)", () => {
  test("bate com os valores oficiais do RFC 6238 (SHA-1)", async () => {
    const segredo = paraBase32(new TextEncoder().encode("12345678901234567890"));
    assert.equal(segredo, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    assert.equal(await codigoDoPasso(segredo, Math.floor(59 / 30), 8), "94287082");
    assert.equal(await codigoDoPasso(segredo, Math.floor(1111111109 / 30), 8), "07081804");
    assert.equal(await codigoDoPasso(segredo, Math.floor(1234567890 / 30), 8), "89005924");
    assert.equal(await codigoDoPasso(segredo, Math.floor(2000000000 / 30), 8), "69279037");
    assert.deepEqual([...deBase32(segredo)], [...new TextEncoder().encode("12345678901234567890")]);
  });

  test("aceita o passo anterior e o seguinte; recusa mais longe, letras e tamanho errado", async () => {
    const s = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const t = 1_700_000_000_000;
    const p = passoAtual(t);
    assert.equal(await conferirCodigoTotp(s, await codigoDoPasso(s, p - 1), t), p - 1);
    assert.equal(await conferirCodigoTotp(s, await codigoDoPasso(s, p + 1), t), p + 1);
    assert.equal(await conferirCodigoTotp(s, await codigoDoPasso(s, p + 3), t), null);
    assert.equal(await conferirCodigoTotp(s, "12a456", t), null);
    assert.equal(await conferirCodigoTotp(s, "1234567", t), null);
    assert.match(enderecoOtpauth(s, "renato@x.test", "Estúdio"), /^otpauth:\/\/totp\/Est%C3%BAdio%3Arenato%40x\.test\?secret=GEZD.*&period=30$/);
  });
});

describe("pessoas e papéis", () => {
  test("gestor cadastra a atendente; ela entra com a senha que definiu", async () => {
    assert.equal(bruna?.papel, "atendente");
    assert.equal(bruna?.cliente, "aurora");
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
    assert.equal(qtd("select count(*) n from membros where cliente_id = 'aurora' and papel = 'gestor' and ativo = 1"), 1);
  });

  test("e-mail repetido é recusado (mesmo vindo de outro cliente)", async () => {
    await recusa(incluirPessoa(db, andre, { email: "BRUNA@aurora.test", nome: "Bruna 2", papel: "atendente" }), /Já existe/);
    await recusa(incluirPessoa(db, andre, { email: "zelia@teste.test", nome: "Zélia", papel: "atendente" }), /Já existe/);
  });

  test("com um 2º gestor, o 1º pode ser alterado por ele; quem é desativado perde o acesso na hora", async () => {
    carla = await cadastrarEEntrar(andre, "carla@aurora.test", "Carla", "gestor");
    await alterarPessoa(db, carla, andre!.id, { papel: "atendente" });
    assert.equal(await atorDaSessao(db, codigoAndre), null); // mudou o papel: a sessão antiga do André caiu
    await alterarPessoa(db, carla, andre!.id, { papel: "gestor" });
    andre = await sessao("andre@aurora.test");
    assert.equal(andre?.papel, "gestor");
    // desativar derruba as sessões e impede o login
    const c = (await entrar(db, { email: "carla@aurora.test", senha: SENHA, ip: null })).codigo;
    await alterarPessoa(db, andre, carla!.id, { ativo: false });
    assert.equal(await atorDaSessao(db, c), null);
    await recusa(entrar(db, { email: "carla@aurora.test", senha: SENHA, ip: null }), /desativado/);
    await alterarPessoa(db, andre, carla!.id, { ativo: true });
    carla = await sessao("carla@aurora.test");
  });

  test("o dono (no Estúdio) pode deixar um cliente sem gestor; o gestor do cliente, não", async () => {
    const t = await incluirPessoa(db, donoNoTeste, { email: "temp@teste.test", nome: "Temporário", papel: "gestor" });
    await alterarPessoa(db, donoNoTeste, t.id, { papel: "atendente" });
    await removerPessoa(db, donoNoTeste, t.id);
    assert.equal(qtd("select count(*) n from pessoas where email = 'temp@teste.test'"), 0); // só era deste cliente: cadastro apagado
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
    assert.ok(c.gatilhos_palavras.includes("falar com uma pessoa"));
    assert.ok(!c.gatilhos_palavras.includes("desconto")); // desconto: a Cecília oferece as formas de economizar antes
  });

  test("conhecimento inicial entra sem duplicar e SEM alertas de preço", async () => {
    const k = await listarConhecimento(db, andre);
    assert.equal(k.length, 15);
    for (const item of k) assert.deepEqual(alertasTexto(`${item.pergunta ?? ""}\n${item.titulo}\n${item.conteudo}`), [], item.titulo);
  });

  test("a Aurora é o cliente nº 1, com a marca dela", async () => {
    const c = await meuCliente(db, andre);
    assert.equal(c?.nome, "Aurora Bartenders");
    assert.equal(c?.marca.principal, "#021938");
    assert.equal(c?.conversas_sem_prefixo, false); // banco novo: conversas já com o cliente no nome
  });
});

describe("configuração do agente e versões", () => {
  test("existe uma linha de configuração por cliente, já com versão", async () => {
    assert.equal(qtd("select count(*) n from agentes"), 2);
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
    await registrarUsoAgente(db, "aurora", { modelo: "gpt-6-luna", entrada: 10, cache: 0, saida: 1, custo: 0.25 });
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

describe("avisos do CRM", () => {
  test("o mesmo aviso (mesmo id) entra uma vez só; só o gestor lê", async () => {
    const aviso = { id: 42, tipo: "proposta.aprovada", negocio_id: "n1", proposta_id: "p1", dados: { numero: "PROP-1" } };
    assert.equal(await guardarAvisoInterno(db, "aurora", aviso), true);
    assert.equal(await guardarAvisoInterno(db, "aurora", aviso), false);
    const lista = await listarAvisos(db, andre);
    assert.equal(lista.filter((a) => a.id === 42).length, 1);
    assert.equal(lista[0].dados.numero, "PROP-1");
    await recusa(listarAvisos(db, bruna), /Só o gestor/);
    await assert.rejects(guardarAvisoInterno(db, "aurora", { id: 0, tipo: "" }), /sem id/);
    await assert.rejects(guardarAvisoInterno(db, "nome inválido!", aviso), /Cliente inválido/);
  });
});

describe("pedido ligado à conversa do WhatsApp", () => {
  test("liga, atualiza sem perder a última mensagem do cliente e marca o aviso como tratado", async () => {
    await ligarConversaInterno(db, "aurora", { negocioId: "neg-1", conversa: "aurora:wa-5534988887777", telefone: "5534988887777", ultimaDoCliente: "2026-11-15T20:00:00.000Z" });
    await ligarConversaInterno(db, "aurora", { negocioId: "neg-1", conversa: "aurora:wa-5534988887777", telefone: "5534988887777", ultimaDoCliente: null });
    const c = await conversaDoNegocioInterno(db, "aurora", "neg-1");
    assert.equal(c?.conversa, "aurora:wa-5534988887777");
    assert.equal(c?.ultima_do_cliente, "2026-11-15T20:00:00.000Z");
    assert.equal(await conversaDoNegocioInterno(db, "aurora", "nao-existe"), null);
    await marcarAvisoProcessadoInterno(db, "aurora", 42, "link enviado");
    const a = (await listarAvisos(db, andre)).find((x) => x.id === 42)!;
    assert.ok(a.processado_em);
    assert.equal(a.dados._resultado, "link enviado");
    assert.equal((await lerAvisoInterno(db, "aurora", 42))?.tipo, "proposta.aprovada");
  });

  test("zerar conversa (testes): só o gestor; desliga todos os pedidos daquele telefone e fica no registro", async () => {
    await ligarConversaInterno(db, "aurora", { negocioId: "neg-2", conversa: "aurora:wa-5534988887777", telefone: "5534988887777", ultimaDoCliente: null });
    const lista = await listarConversasWhatsApp(db, carla);
    assert.equal(lista.find((c) => c.conversa === "aurora:wa-5534988887777")?.pedidos, 2);
    await recusa(listarConversasWhatsApp(db, bruna), /Só o gestor/);
    await recusa(zerarConversaWhatsApp(db, bruna, "aurora:wa-5534988887777"), /Só o gestor/);
    await recusa(zerarConversaWhatsApp(db, carla, "sim-123"), /Conversa inválida/);
    await recusa(zerarConversaWhatsApp(db, carla, "wa-5534988887777"), /Conversa inválida/); // nome antigo: não é desta Aurora (banco novo)
    assert.equal(await zerarConversaWhatsApp(db, carla, "aurora:wa-5534988887777"), 2);
    assert.equal(await conversaDoNegocioInterno(db, "aurora", "neg-1"), null);
    assert.equal(qtd("select count(*) n from registro where acao = 'whatsapp.zerou'"), 1);
  });
});

// =====================================================================
// MULTI-CLIENTE
// =====================================================================
describe("Estúdio: clientes (só o dono)", () => {
  test("o dono vê todos os clientes, com plano, limite e gasto do mês; a equipe vê só os seus", async () => {
    const lista = await listarClientes(db, dono);
    assert.deepEqual(lista.map((c) => c.id), ["aurora", "teste"]);
    const t = lista.find((c) => c.id === "teste")!;
    assert.equal(t.plano_nome, "Básico");
    assert.equal(t.plano_valor_brl, 300);
    assert.equal(t.limite_mensal_usd, 10);
    assert.equal(t.equipe, 2);
    assert.deepEqual((await clientesDoAtor(db, dono)).map((c) => c.id), ["aurora", "teste"]);
    assert.deepEqual((await clientesDoAtor(db, andre)).map((c) => c.id), ["aurora"]);
    assert.deepEqual((await clientesDoAtor(db, zelia)).map((c) => c.id), ["teste"]);
  });

  test("cliente novo nasce com agente padrão, integrações vazias e botão de emergência, e fica no registro dele", async () => {
    assert.equal((await lerConfigInterno(db, "teste")).nome_agente, "Atendimento");
    assert.equal((await lerOperacaoInterno(db, "teste")).pausado, false);
    assert.deepEqual(await conhecimentoDoAgente(db, "teste"), []);
    assert.equal((await listarRegistro(db, zelia, { acao: "cliente.criou" }))[0]?.alvo, "Cliente Teste");
  });

  test("apelido repetido ou inválido é recusado", async () => {
    await recusa(criarCliente(db, dono, { id: "teste", nome: "Outro" }), /Já existe um cliente/);
    await recusa(criarCliente(db, dono, { id: "Com Espaço", nome: "Outro" }), /Apelido inválido/);
    await recusa(criarCliente(db, dono, { id: "-x", nome: "Outro" }), /Apelido inválido/);
    await recusa(criarCliente(db, dono, { id: "novo", nome: " " }), /nome do cliente/);
  });

  test("alterar o plano e o limite: o limite vira versão nova do agente do cliente certo", async () => {
    const auroraAntes = (await lerConfigInterno(db, "aurora")).limite_mensal_usd;
    await alterarCliente(db, dono, "teste", { plano_valor_brl: 450, limite_mensal_usd: 15, marca: { principal: "#123abc", logo: "javascript:alert(1)" } });
    const t = (await listarClientes(db, dono)).find((c) => c.id === "teste")!;
    assert.equal(t.plano_valor_brl, 450);
    assert.equal(t.limite_mensal_usd, 15);
    assert.deepEqual(t.marca, { principal: "#123ABC" }); // logo perigosa descartada
    assert.equal((await lerConfigInterno(db, "aurora")).limite_mensal_usd, auroraAntes);
    assert.match((await listarVersoes(db, zelia))[0].descricao ?? "", /Estúdio/);
  });

  test("ninguém da equipe de um cliente alcança as operações do Estúdio", async () => {
    for (const a of [andre, bruna, zelia, yuri, visitante, desativado]) {
      await recusa(listarClientes(db, a), /Só o dono/);
      await recusa(criarCliente(db, a, { id: "invasor", nome: "Invasor" }), /Só o dono/);
      await recusa(alterarCliente(db, a, "aurora", { plano_valor_brl: 0 }), /Só o dono/);
      await recusa(mudarSituacaoCliente(db, a, "teste", "pausado"), /Só o dono/);
    }
  });

  test("cliente pausado: o agente dele fica pausado (o outro não); encerrado: a equipe perde o acesso", async () => {
    await mudarSituacaoCliente(db, dono, "teste", "pausado");
    assert.equal((await lerOperacaoInterno(db, "teste")).pausado, true);
    assert.equal((await lerOperacaoInterno(db, "teste")).cliente_pausado, true);
    assert.equal((await lerOperacaoInterno(db, "aurora")).pausado, false);
    assert.equal((await sessao("zelia@teste.test"))?.cliente, "teste"); // pausado: a equipe ainda entra
    await mudarSituacaoCliente(db, dono, "teste", "encerrado");
    await recusa(entrar(db, { email: "yuri@teste.test", senha: SENHA, ip: null }), /desativado/);
    assert.equal(await atorDaSessao(db, (await entrar(db, { email: "andre@aurora.test", senha: SENHA, ip: null })).codigo, "teste").then((a) => a?.cliente), "aurora");
    await mudarSituacaoCliente(db, dono, "teste", "ativo");
    zelia = await sessao("zelia@teste.test");
    yuri = await sessao("yuri@teste.test");
    await recusa(mudarSituacaoCliente(db, dono, "teste", "apagado" as "ativo"), /Situação inválida/);
  });
});

describe("isolamento entre clientes (a equipe de um não alcança o outro)", () => {
  test("a sessão só abre clientes de que a pessoa é membro (o cliente pedido pelo navegador não vale)", async () => {
    const z = await atorDaSessao(db, (await entrar(db, { email: "zelia@teste.test", senha: SENHA, ip: null })).codigo, "aurora");
    assert.equal(z?.cliente, "teste");
    const a = await atorDaSessao(db, (await entrar(db, { email: "andre@aurora.test", senha: SENHA, ip: null })).codigo, "teste");
    assert.equal(a?.cliente, "aurora");
    assert.equal((await atorDaSessao(db, codigoDono, "teste"))?.cliente, "teste"); // o dono abre qualquer um
    assert.equal((await atorDaSessao(db, codigoDono, "nao-existe"))?.cliente, "aurora");
  });

  test("configuração e versões: cada um lê e altera só a sua", async () => {
    await salvarConfig(db, zelia, { nome_agente: "Assistente Teste" });
    assert.equal((await lerConfig(db, zelia)).nome_agente, "Assistente Teste");
    assert.equal((await lerConfig(db, andre)).nome_agente, "Cecília");
    assert.ok((await listarVersoes(db, zelia)).every((v) => (v.dados as { nome_agente?: string }).nome_agente !== "Cecília"));
    // "voltar para a versão N" é a versão N DO PRÓPRIO cliente: a Zélia não alcança uma versão que só a Aurora tem
    const daAurora = (await listarVersoes(db, andre))[0].numero;
    assert.ok(daAurora > (await listarVersoes(db, zelia))[0].numero);
    await recusa(restaurarVersao(db, zelia, daAurora), new RegExp(`Versão ${daAurora} não encontrada`));
    assert.equal((await lerConfig(db, andre)).nome_agente, "Cecília");
  });

  test("conhecimento: não lista, não altera e não exclui o do outro cliente", async () => {
    const { id } = await incluirConhecimento(db, zelia, { tipo: "texto", titulo: "Segredo do teste", conteudo: "Só do cliente teste." });
    assert.ok(!(await listarConhecimento(db, andre)).some((k) => k.id === id));
    assert.ok(!(await conhecimentoDoAgente(db, "aurora")).some((k) => k.titulo === "Segredo do teste"));
    await recusa(alterarConhecimento(db, andre, id, { conteudo: "Invadido." }), /não encontrado/);
    await excluirConhecimento(db, andre, id); // não acha: não faz nada
    assert.equal(qtd(`select count(*) n from conhecimento where id = '${id}'`), 1);
    const daAurora = (await listarConhecimento(db, andre))[0].id;
    await recusa(alterarConhecimento(db, zelia, daAurora, { ativo: false }), /não encontrado/);
    await excluirConhecimento(db, zelia, daAurora);
    assert.equal(qtd(`select count(*) n from conhecimento where id = '${daAurora}'`), 1);
  });

  test("segredos: cada cliente tem os seus; a situação e o cifrado nunca vazam para o outro", async () => {
    await salvarSegredo(db, zelia, "openai_chave", CIFRADO_B, "sk-bbbb");
    assert.equal(await segredoCifrado(db, zelia, "openai_chave"), CIFRADO_B);
    assert.equal(await segredoCifrado(db, andre, "openai_chave"), CIFRADO);
    assert.equal(await segredoCifradoInterno(db, "teste", "whatsapp_token"), null); // o token da Aurora não aparece no teste
    assert.deepEqual((await situacaoSegredos(db, zelia)).map((s) => s.nome), ["openai_chave"]);
    assert.ok(!JSON.stringify(await situacaoSegredos(db, andre)).includes("bbbb"));
  });

  test("integrações: cada cliente tem as suas; um número de WhatsApp é de um cliente só", async () => {
    await salvarIntegracoes(db, andre, { whatsapp_phone_number_id: "111111111111" });
    await salvarIntegracoes(db, zelia, { crm_url: "https://crm.teste.test", whatsapp_phone_number_id: "222222222222" });
    assert.equal((await lerIntegracoes(db, andre)).crm_url, "https://crm.aurora.test");
    assert.equal(await enderecoCrm(db, yuri), "https://crm.teste.test");
    await recusa(salvarIntegracoes(db, zelia, { whatsapp_phone_number_id: "111111111111" }), /outro cliente/);
    assert.equal(await clienteDoWhatsAppInterno(db, "111111111111"), "aurora");
    assert.equal(await clienteDoWhatsAppInterno(db, "222222222222"), "teste");
    assert.equal(await clienteDoWhatsAppInterno(db, "999999999999"), null);
    assert.equal(await clienteDoWhatsAppInterno(db, "1 or 1=1"), null);
    await gravarTesteIntegracao(db, zelia, "openai", { ok: false, mensagem: "x" });
    assert.equal((await lerIntegracoes(db, andre)).teste_openai, null);
  });

  test("cliente encerrado não recebe mensagens pelo número dele", async () => {
    await mudarSituacaoCliente(db, dono, "teste", "encerrado");
    assert.equal(await clienteDoWhatsAppInterno(db, "222222222222"), null);
    await mudarSituacaoCliente(db, dono, "teste", "ativo");
    assert.equal(await clienteDoWhatsAppInterno(db, "222222222222"), "teste");
  });

  test("botão de emergência: pausar um cliente não pausa o outro", async () => {
    await pausarAgente(db, yuri, "teste de isolamento");
    assert.equal((await lerOperacao(db, zelia)).pausado, true);
    assert.equal((await lerOperacao(db, andre)).pausado, false);
    await recusa(retomarAgente(db, yuri), /Só o gestor/);
    await retomarAgente(db, andre); // o gestor da Aurora não religa o teste
    assert.equal((await lerOperacao(db, zelia)).pausado, true);
    await retomarAgente(db, zelia);
    assert.equal((await lerOperacao(db, zelia)).pausado, false);
  });

  test("simulações: não lista, não lê, não altera e não apaga a do outro cliente", async () => {
    const id = await criarSimulacao(db, yuri, { modelo: "gpt-6-luna", titulo: "Do teste" });
    assert.ok(!(await listarSimulacoes(db, andre)).some((s) => s.id === id));
    assert.equal(await lerSimulacao(db, andre, id), null);
    await recusa(atualizarSimulacao(db, andre, id, { titulo: "Invadida" }), /não encontrada/);
    await recusa(apagarSimulacao(db, andre, id), /não encontrada/);
    assert.equal((await lerSimulacao(db, yuri, id))?.titulo, "Do teste");
  });

  test("gasto da IA: cada cliente soma só o seu", async () => {
    const antes = await gastoMes(db, andre);
    await registrarUsoIA(db, yuri, { origem: "simulador", modelo: "gpt-6-luna", entrada: 1, cache: 0, saida: 1, custo: 2 });
    await registrarUsoAgente(db, "teste", { modelo: "gpt-6-luna", entrada: 1, cache: 0, saida: 1, custo: 1 });
    assert.equal(await gastoMes(db, andre), antes);
    assert.equal(await gastoMes(db, zelia), 3);
    assert.equal(await gastoMesInterno(db, "teste"), 3);
    assert.equal((await listarClientes(db, dono)).find((c) => c.id === "teste")?.gasto_mes_usd, 3);
  });

  test("registro: cada gestor lê só o do seu cliente", async () => {
    assert.ok(!(await listarRegistro(db, andre)).some((r) => r.acao === "agente.pausou" && r.ator_nome === "Yuri"));
    assert.ok((await listarRegistro(db, zelia)).some((r) => r.acao === "agente.pausou" && r.ator_nome === "Yuri"));
    assert.ok(!(await listarRegistro(db, zelia)).some((r) => r.ator_nome === "Bruna"));
  });

  test("equipe: lista só a sua e não altera, não remove nem gera link para gente do outro cliente", async () => {
    const daAurora = (await listarEquipe(db, andre)).map((p) => p.email);
    assert.ok(!daAurora.includes("zelia@teste.test") && !daAurora.includes("renato@plataforma.test"));
    assert.deepEqual((await listarEquipe(db, zelia)).map((p) => p.email).sort(), ["yuri@teste.test", "zelia@teste.test"]);
    await recusa(alterarPessoa(db, andre, yuri!.id, { nome: "Invadido", ativo: false }), /não encontrada/);
    await removerPessoa(db, andre, yuri!.id); // não acha: não faz nada
    assert.equal(qtd(`select count(*) n from membros where pessoa_id = '${yuri!.id}'`), 1);
    await recusa(gerarLinkSenha(db, andre, yuri!.id), /não encontrada/);
    await recusa(gerarLinkSenha(db, andre, dono!.id), /não encontrada/); // nem do dono
    await recusa(alterarPessoa(db, zelia, dono!.id, { ativo: false }), /não encontrada/);
  });

  test("quem atende dois clientes: o gestor de um não troca a senha dela (só o dono)", async () => {
    // o dono coloca a Bruna também no cliente teste
    db.sqlite.prepare("insert into membros (cliente_id, pessoa_id, papel) values ('teste', ?, 'atendente')").run(bruna!.id);
    assert.deepEqual((await clientesDoAtor(db, bruna)).map((c) => c.id), ["aurora", "teste"]);
    assert.equal((await atorDaSessao(db, (await entrar(db, { email: "bruna@aurora.test", senha: SENHA, ip: null })).codigo, "teste"))?.cliente, "teste");
    await recusa(gerarLinkSenha(db, andre, bruna!.id), /outro cliente/);
    await recusa(gerarLinkSenha(db, zelia, bruna!.id), /outro cliente/);
    assert.ok(await gerarLinkSenha(db, dono, bruna!.id));
    // tirar da equipe de um cliente não apaga o cadastro (ela continua no outro)
    await removerPessoa(db, zelia, bruna!.id);
    assert.equal(qtd(`select count(*) n from pessoas where id = '${bruna!.id}'`), 1);
    bruna = await sessao("bruna@aurora.test");
  });

  test("avisos do CRM e conversas do WhatsApp: o mesmo id em dois clientes são avisos diferentes", async () => {
    assert.equal(await guardarAvisoInterno(db, "teste", { id: 42, tipo: "proposta.aceita", dados: { de: "teste" } }), true);
    assert.equal((await listarAvisos(db, zelia)).find((a) => a.id === 42)?.tipo, "proposta.aceita");
    assert.equal((await listarAvisos(db, andre)).find((a) => a.id === 42)?.tipo, "proposta.aprovada");
    await marcarAvisoProcessadoInterno(db, "teste", 42, "só no teste");
    assert.notEqual((await listarAvisos(db, andre)).find((a) => a.id === 42)?.dados._resultado, "só no teste");
    await ligarConversaInterno(db, "teste", { negocioId: "neg-9", conversa: "teste:wa-5511999990000", telefone: "5511999990000", ultimaDoCliente: null });
    assert.equal(await conversaDoNegocioInterno(db, "aurora", "neg-9"), null);
    assert.ok(!(await listarConversasWhatsApp(db, andre)).some((c) => c.conversa === "teste:wa-5511999990000"));
    await recusa(zerarConversaWhatsApp(db, andre, "teste:wa-5511999990000"), /Conversa inválida/);
    assert.equal((await conversaDoNegocioInterno(db, "teste", "neg-9"))?.telefone, "5511999990000");
  });

  test("nomes das conversas: o cliente vai no nome; o convertido da instalação antiga mantém o nome antigo", async () => {
    assert.equal(nomeConversaWhatsApp({ id: "teste", conversas_sem_prefixo: false }, "5511999990000"), "teste:wa-5511999990000");
    assert.equal(nomeConversaWhatsApp({ id: "aurora", conversas_sem_prefixo: true }, "5534988887777"), "wa-5534988887777");
    assert.equal(conversaEhDoCliente({ id: "teste", conversas_sem_prefixo: false }, "aurora:wa-5534988887777"), false);
    assert.equal(conversaEhDoCliente({ id: "aurora", conversas_sem_prefixo: true }, "wa-5534988887777"), true);
    assert.equal(conversaEhDoCliente({ id: "aurora", conversas_sem_prefixo: true }, "teste:wa-5534988887777"), false);
    assert.equal(await clienteDaConversaInterno(db, "teste:wa-5511999990000"), "teste");
    assert.equal(await clienteDaConversaInterno(db, "wa-5511999990000"), null); // neste banco ninguém usa o nome antigo
    assert.equal(await clienteDaConversaInterno(db, "outro:wa-5511999990000"), null);
    assert.equal(await clienteDaConversaInterno(db, "sim-abc"), null);
  });

  test("clientes com o segredo dos avisos: só quem cadastrou", async () => {
    await salvarSegredo(db, zelia, "crm_segredo_avisos", CIFRADO_B, "aaaa");
    assert.deepEqual(await clientesComSegredoInterno(db, "crm_segredo_avisos"), ["teste"]);
  });

  test("funções internas recusam cliente inválido (nada de 'todos os clientes' por engano)", async () => {
    for (const ruim of ["", "AURORA", "a' or '1'='1", "x"]) {
      await assert.rejects(lerConfigInterno(db, ruim), /Cliente inválido/);
      await assert.rejects(conhecimentoDoAgente(db, ruim), /Cliente inválido/);
      await assert.rejects(segredoCifradoInterno(db, ruim, "openai_chave"), /Cliente inválido/);
      await assert.rejects(gastoMesInterno(db, ruim), /Cliente inválido/);
    }
  });
});

describe("migração 0005: conversão de uma instalação que já existia", () => {
  test("os dados antigos viram do cliente aurora; a 1ª gestora vira dona; as outras pessoas, membros", async () => {
    const antigas = readdirSync(MIGRACOES).filter((f) => f.endsWith(".sql") && f < "0005").sort().map((f) => join(MIGRACOES, f));
    const velho = bancoDeTeste(antigas);
    velho.sqlite.exec(`
      insert into pessoas (id, email, nome, papel, created_at) values ('p1', 'renato@x.test', 'Renato', 'gestor', '2026-01-01T00:00:00Z');
      insert into pessoas (id, email, nome, papel, created_at) values ('p2', 'andre@x.test', 'André', 'gestor', '2026-02-01T00:00:00Z');
      insert into pessoas (id, email, nome, papel, ativo, created_at) values ('p3', 'ana@x.test', 'Ana', 'atendente', 0, '2026-03-01T00:00:00Z');
      update agente_config set nome_agente = 'Cecília', instrucoes = 'antigas', versao = 2 where id = 1;
      insert into config_versoes (numero, dados, autor_nome) values (1, '{}', 'Sistema'), (2, '{}', 'Renato');
      update integracoes set crm_url = 'https://crm.x.test', whatsapp_phone_number_id = '123456789' where id = 1;
      insert into segredos (nome, cifrado) values ('openai_chave', 'v1:a:b');
      insert into conhecimento (id, tipo, titulo, conteudo) values ('k1', 'texto', 'Título', 'Conteúdo');
      insert into registro (ator_nome, acao) values ('Renato', 'config.alterou');
      insert into uso_ia (origem, modelo, custo_usd) values ('agente', 'm', 0.5);
      insert into avisos_crm (id, tipo) values (7, 'proposta.aprovada');
      insert into conversas_whatsapp (negocio_id, conversa, telefone) values ('n1', 'wa-5534999999999', '5534999999999');
      update operacao set pausado = 1 where id = 1;
    `);
    velho.sqlite.exec(require0005());
    const um = (sql: string) => velho.sqlite.prepare(sql).get() as Record<string, unknown>;
    assert.deepEqual({ ...um("select id, conversas_sem_prefixo from clientes") }, { id: "aurora", conversas_sem_prefixo: 1 });
    assert.equal(um("select id from pessoas where dono = 1").id, "p1");
    assert.deepEqual(velho.sqlite.prepare("select pessoa_id, papel, ativo from membros order by pessoa_id").all().map((x) => ({ ...x })), [
      { pessoa_id: "p2", papel: "gestor", ativo: 1 },
      { pessoa_id: "p3", papel: "atendente", ativo: 0 },
    ]);
    assert.deepEqual({ ...um("select cliente_id, nome_agente, instrucoes, versao from agentes") }, { cliente_id: "aurora", nome_agente: "Cecília", instrucoes: "antigas", versao: 2 });
    for (const [t, n] of [["agente_versoes", 2], ["segredos", 1], ["conhecimento", 1], ["registro", 1], ["uso_ia", 1], ["avisos_crm", 1], ["conversas_whatsapp", 1], ["integracoes", 1], ["operacao", 1]] as const) {
      assert.equal(um(`select count(*) n from ${t} where cliente_id = 'aurora'`).n, n, t);
    }
    assert.equal(um("select pausado from operacao").pausado, 1);
    assert.equal(um("select whatsapp_phone_number_id w from integracoes").w, "123456789");
    assert.equal(await clienteDaConversaInterno(velho, "wa-5534999999999"), "aurora"); // conversas antigas continuam da Aurora
    assert.equal(await clienteDoWhatsAppInterno(velho, "123456789"), "aurora");
    // a dona ainda sem as duas etapas: entra só para ligá-las
    assert.equal(await faltaDuasEtapas(velho, { id: "p1", nome: "Renato", papel: "gestor", ativo: true, cliente: null, dono: false }), true);
    for (const t of ["agente_config", "config_versoes"]) assert.equal(um(`select count(*) n from sqlite_master where name = '${t}'`).n, 0, t);
  });

  test("banco novo (vazio): a migração não inventa cliente nem dona", () => {
    const novo = bancoDeTeste(readdirSync(MIGRACOES).filter((f) => f.endsWith(".sql")).sort().map((f) => join(MIGRACOES, f)));
    assert.equal((novo.sqlite.prepare("select count(*) n from clientes").get() as { n: number }).n, 0);
    assert.equal((novo.sqlite.prepare("select count(*) n from agentes").get() as { n: number }).n, 0);
  });
});

function require0005() {
  return readFileSync(join(MIGRACOES, readdirSync(MIGRACOES).find((x) => x.startsWith("0005"))!), "utf8");
}
