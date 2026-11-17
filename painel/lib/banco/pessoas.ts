/**
 * PESSOAS, LOGIN, SESSÕES E EQUIPE DE CADA CLIENTE.
 *
 * - Instalação: a 1ª pessoa é criada com o CÓDIGO DE INSTALAÇÃO (segredo do Worker), só enquanto não existir
 *   ninguém, e nasce DONA DA PLATAFORMA (vê e administra todos os clientes, no Estúdio).
 * - Pessoa × cliente: o login (e-mail e senha) é da pessoa; o acesso é por cliente (tabela membros: gestor ou
 *   atendente daquele cliente). A pessoa só enxerga os clientes de que é membro ativo. O dono enxerga todos.
 * - Equipe: só o gestor DO CLIENTE inclui, altera e remove, e só gente do próprio cliente. Ninguém muda o próprio
 *   papel nem se desativa. O cliente nunca fica sem gestor ativo (exceto pelo dono, no Estúdio).
 * - Senha: definida pela própria pessoa, por um LINK gerado pelo gestor (vale 48 h, uma vez só).
 * - Login: e-mail + senha, com limite de tentativas erradas (por e-mail e por endereço de rede). Quem ligou as duas
 *   etapas (obrigatório para o dono) só entra depois do código do aplicativo autenticador (totp.ts).
 */
import { decifrarCom, cifrarCom } from "./cifra.ts";
import { agora, type Ator, type Banco, ErroRegra, exigirGestor, novoId, type Papel, registrar, traduzirErro } from "./base.ts";
import { codigoAleatorio, conferirSenha, gerarHashSenha, hashCodigo, iguaisSeguro, problemaSenha } from "./senha.ts";
import { conferirCodigoTotp, novoSegredoTotp } from "./totp.ts";

export const DURACAO_SESSAO_DIAS = 14;
export const VALIDADE_LINK_HORAS = 48;
/** Sessão aberta com a senha, esperando o código das duas etapas. */
const VALIDADE_PENDENTE_MIN = 10;
const JANELA_TENTATIVAS_MIN = 15;
const MAX_ERROS_EMAIL = 5;
const MAX_ERROS_IP = 20;
const MAX_ERROS_CODIGO = 5;

/** Pessoa vista DENTRO de um cliente: papel e ativo são os do vínculo com ele (membros). */
export type Pessoa = {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  tem_senha: boolean;
  ultimo_acesso: string | null;
  created_at: string;
  /** Dono da plataforma (só aparece no próprio cadastro). */
  dono?: boolean;
  /** Duas etapas ligadas (só aparece no próprio cadastro). */
  duas_etapas?: boolean;
};

const somarHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const normalizarEmail = (e: string) => e.trim().toLowerCase();
const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;
const linhaPessoa = (r: Record<string, unknown>): Pessoa => ({
  id: String(r.id),
  email: String(r.email),
  nome: String(r.nome),
  papel: r.papel as Papel,
  ativo: Boolean(r.ativo),
  tem_senha: Boolean(r.senha_hash),
  ultimo_acesso: (r.ultimo_acesso as string) ?? null,
  created_at: String(r.created_at),
});
const nomeCifraTotp = (pessoaId: string) => `totp:${pessoaId}`;

export async function precisaInstalar(db: Banco) {
  const r = await db.prepare("select count(*) as n from pessoas").first<{ n: number }>();
  return (r?.n ?? 0) === 0;
}

/** Cria a 1ª pessoa, DONA DA PLATAFORMA. Só funciona com o código de instalação certo e enquanto não houver ninguém. */
export async function instalar(db: Banco, d: { codigo: string; codigoCerto: string | undefined; nome: string; email: string; senha: string }) {
  if (!d.codigoCerto || d.codigoCerto.length < 12) throw new ErroRegra("O código de instalação não foi configurado no servidor.");
  if (!(await iguaisSeguro(d.codigo.trim(), d.codigoCerto))) throw new ErroRegra("Código de instalação incorreto.");
  if (!(await precisaInstalar(db))) throw new ErroRegra("O painel já foi instalado. Entre com seu e-mail e senha.");
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new ErroRegra("E-mail inválido.");
  const p = problemaSenha(d.senha);
  if (p) throw new ErroRegra(p);
  const id = novoId();
  const hash = await gerarHashSenha(d.senha);
  const ator: Ator = { id, nome: d.nome.trim(), papel: "gestor", ativo: true, cliente: null, dono: true };
  try {
    // "where not exists": dois cadastros ao mesmo tempo não criam dois donos
    const r = await db
      .prepare(
        `insert into pessoas (id, email, nome, papel, ativo, dono, senha_hash, senha_em)
         select ?, ?, ?, 'gestor', 1, 1, ?, ? where not exists (select 1 from pessoas)`,
      )
      .bind(id, email, d.nome.trim(), hash, agora())
      .run();
    if (r.meta.changes !== 1) throw new ErroRegra("O painel já foi instalado. Entre com seu e-mail e senha.");
    await registrar(db, ator, "equipe.instalou", d.nome.trim(), { email }, null).run();
  } catch (e) {
    traduzirErro(e);
  }
  return id;
}

// ------------------------------------------------------------------ login
async function errosRecentes(db: Banco, chave: string) {
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MIN * 60_000).toISOString();
  const r = await db.prepare("select count(*) as n from tentativas_login where chave = ? and em >= ?").bind(chave, desde).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Tem acesso a algum cliente? (dono sempre tem) */
async function temAcesso(db: Banco, pessoaId: string, dono: boolean) {
  if (dono) return true;
  const r = await db
    .prepare("select 1 from membros m join clientes c on c.id = m.cliente_id where m.pessoa_id = ? and m.ativo = 1 and c.situacao <> 'encerrado' limit 1")
    .bind(pessoaId)
    .first();
  return Boolean(r);
}

/**
 * Confere e-mail e senha. Devolve o código da sessão (vai para o cookie) e se falta o código das duas etapas
 * (duasEtapas = true: a sessão só vale depois de confirmarDuasEtapas).
 */
export async function entrar(db: Banco, d: { email: string; senha: string; ip: string | null }): Promise<{ codigo: string; duasEtapas: boolean }> {
  const email = normalizarEmail(d.email);
  const chaveEmail = `email:${email}`;
  const chaveIp = d.ip ? `ip:${d.ip}` : null;
  if ((await errosRecentes(db, chaveEmail)) >= MAX_ERROS_EMAIL || (chaveIp && (await errosRecentes(db, chaveIp)) >= MAX_ERROS_IP)) {
    throw new ErroRegra(`Muitas tentativas erradas. Espere ${JANELA_TENTATIVAS_MIN} minutos e tente de novo.`);
  }
  const p = await db
    .prepare("select id, nome, ativo, dono, totp_ativo, senha_hash from pessoas where email = ?")
    .bind(email)
    .first<{ id: string; nome: string; ativo: number; dono: number; totp_ativo: number; senha_hash: string | null }>();
  const ok = await conferirSenha(d.senha, p?.senha_hash ?? null); // sempre roda (mesmo tempo com ou sem cadastro)
  if (!p || !ok) {
    const falhas = [db.prepare("insert into tentativas_login (chave) values (?)").bind(chaveEmail)];
    if (chaveIp) falhas.push(db.prepare("insert into tentativas_login (chave) values (?)").bind(chaveIp));
    await db.batch(falhas);
    throw new ErroRegra("E-mail ou senha incorretos.");
  }
  if (!p.ativo || !(await temAcesso(db, p.id, Boolean(p.dono)))) throw new ErroRegra("Seu acesso está desativado. Fale com o gestor.");
  const codigo = codigoAleatorio();
  const duasEtapas = Boolean(p.totp_ativo);
  const limite = new Date(Date.now() - 24 * 3600_000).toISOString();
  await db.batch([
    db
      .prepare("insert into sessoes (token_hash, pessoa_id, expira_em, ip, confirmada) values (?, ?, ?, ?, ?)")
      .bind(await hashCodigo(codigo), p.id, duasEtapas ? somarHoras(VALIDADE_PENDENTE_MIN / 60) : somarHoras(DURACAO_SESSAO_DIAS * 24), d.ip, duasEtapas ? 0 : 1),
    ...(duasEtapas ? [] : [db.prepare("update pessoas set ultimo_acesso = ? where id = ?").bind(agora(), p.id)]),
    db.prepare("delete from tentativas_login where chave = ?").bind(chaveEmail),
    // limpeza: sessões vencidas e tentativas antigas
    db.prepare("delete from sessoes where expira_em < ?").bind(agora()),
    db.prepare("delete from tentativas_login where em < ?").bind(limite),
  ]);
  return { codigo, duasEtapas };
}

/** Sessão aberta com a senha que espera o código das duas etapas (null = não há). */
export async function sessaoEsperandoCodigo(db: Banco, codigo: string | null | undefined) {
  if (!codigo || codigo.length < 20 || codigo.length > 100) return null;
  return db
    .prepare(
      `select p.id, p.nome from sessoes s join pessoas p on p.id = s.pessoa_id
        where s.token_hash = ? and s.expira_em > ? and s.confirmada = 0 and p.ativo = 1`,
    )
    .bind(await hashCodigo(codigo), agora())
    .first<{ id: string; nome: string }>();
}

/** Confere o código do aplicativo e libera a sessão (que passa a valer os 14 dias). */
export async function confirmarDuasEtapas(db: Banco, codigoSessao: string | null | undefined, codigoApp: string, chaveMestra: string | undefined) {
  const p = await sessaoEsperandoCodigo(db, codigoSessao);
  if (!p) throw new ErroRegra("O tempo para digitar o código acabou. Entre de novo com seu e-mail e senha.");
  const chave = `totp:${p.id}`;
  if ((await errosRecentes(db, chave)) >= MAX_ERROS_CODIGO) throw new ErroRegra(`Muitos códigos errados. Espere ${JANELA_TENTATIVAS_MIN} minutos e tente de novo.`);
  const t = await db.prepare("select totp_cifrado, totp_ultimo_passo from pessoas where id = ? and totp_ativo = 1").bind(p.id).first<{ totp_cifrado: string; totp_ultimo_passo: number | null }>();
  if (!t) throw new ErroRegra("As duas etapas não estão ligadas para esta conta.");
  const segredo = await decifrarCom(chaveMestra, t.totp_cifrado, nomeCifraTotp(p.id));
  const passo = await conferirCodigoTotp(segredo, codigoApp);
  if (passo === null || (t.totp_ultimo_passo !== null && passo <= t.totp_ultimo_passo)) {
    await db.prepare("insert into tentativas_login (chave) values (?)").bind(chave).run();
    throw new ErroRegra("Código incorreto. Confira no aplicativo e digite o número que aparece agora.");
  }
  const h = await hashCodigo(codigoSessao!);
  await db.batch([
    db.prepare("update sessoes set confirmada = 1, expira_em = ? where token_hash = ?").bind(somarHoras(DURACAO_SESSAO_DIAS * 24), h),
    db.prepare("update pessoas set ultimo_acesso = ?, totp_ultimo_passo = ? where id = ?").bind(agora(), passo, p.id),
    db.prepare("delete from tentativas_login where chave = ?").bind(chave),
  ]);
}

type LinhaSessao = { id: string; nome: string; ativo: number; dono: number; totp_ativo: number };

/** Clientes que a pessoa pode abrir (dono: todos, menos os encerrados ficam no fim). */
async function clientesDaPessoa(db: Banco, pessoaId: string, dono: boolean) {
  if (dono) {
    const r = await db.prepare("select id, nome, situacao, 'gestor' as papel from clientes order by situacao = 'encerrado', nome").all<{ id: string; nome: string; situacao: string; papel: Papel }>();
    return r.results;
  }
  const r = await db
    .prepare(
      `select c.id, c.nome, c.situacao, m.papel from membros m join clientes c on c.id = m.cliente_id
        where m.pessoa_id = ? and m.ativo = 1 and c.situacao <> 'encerrado' order by c.nome`,
    )
    .bind(pessoaId)
    .all<{ id: string; nome: string; situacao: string; papel: Papel }>();
  return r.results;
}

/**
 * Quem é o dono deste código de sessão, trabalhando em qual cliente (só sessão confirmada de pessoa ativa).
 * clientePreferido vem do navegador (o cliente escolhido no topo) e NÃO é confiável: só vale se a pessoa tem acesso a ele;
 * se não tiver, fica o primeiro cliente dela. Sem nenhum cliente acessível (e sem ser dono) = null.
 */
export async function atorDaSessao(db: Banco, codigo: string | null | undefined, clientePreferido?: string | null): Promise<Ator> {
  if (!codigo || codigo.length < 20 || codigo.length > 100) return null;
  const r = await db
    .prepare(
      `select p.id, p.nome, p.ativo, p.dono, p.totp_ativo from sessoes s join pessoas p on p.id = s.pessoa_id
        where s.token_hash = ? and s.expira_em > ? and s.confirmada = 1`,
    )
    .bind(await hashCodigo(codigo), agora())
    .first<LinhaSessao>();
  if (!r || !r.ativo) return null;
  // Dono sem as duas etapas ligadas: só pode ligá-las (e trocar a senha). Nenhum cliente, nada do Estúdio.
  if (r.dono && !r.totp_ativo) return { id: r.id, nome: r.nome, papel: "atendente", ativo: true, cliente: null, dono: false };
  const dono = Boolean(r.dono);
  const lista = await clientesDaPessoa(db, r.id, dono);
  const escolhido = lista.find((c) => c.id === clientePreferido) ?? lista.find((c) => c.situacao !== "encerrado") ?? (dono ? null : lista[0]);
  if (!escolhido && !dono) return null;
  return { id: r.id, nome: r.nome, papel: escolhido?.papel ?? "gestor", ativo: true, cliente: escolhido?.id ?? null, dono };
}

/** Clientes que a pessoa logada pode abrir (para a troca de cliente no topo). */
export async function clientesDoAtor(db: Banco, ator: Ator) {
  if (!ator?.ativo) return [];
  return clientesDaPessoa(db, ator.id, ator.dono);
}

export async function sair(db: Banco, codigo: string | null | undefined) {
  if (codigo) await db.prepare("delete from sessoes where token_hash = ?").bind(await hashCodigo(codigo)).run();
}

// ------------------------------------------------------------------ duas etapas (cadastro do aplicativo)
/** O dono ainda não ligou as duas etapas? (o Estúdio exige; a tela manda ligar antes de qualquer coisa) */
export async function faltaDuasEtapas(db: Banco, ator: Ator) {
  if (!ator?.ativo) return false;
  const r = await db.prepare("select dono, totp_ativo from pessoas where id = ?").bind(ator.id).first<{ dono: number; totp_ativo: number }>();
  return Boolean(r?.dono && !r.totp_ativo);
}

/** Gera um segredo novo (ainda desligado) e devolve para mostrar no QR code. Só a própria pessoa. */
export async function iniciarDuasEtapas(db: Banco, ator: Ator, chaveMestra: string | undefined): Promise<string> {
  if (!ator?.ativo) throw new ErroRegra("Sem permissão.");
  const atual = await db.prepare("select totp_ativo from pessoas where id = ?").bind(ator.id).first<{ totp_ativo: number }>();
  if (atual?.totp_ativo) throw new ErroRegra("As duas etapas já estão ligadas.");
  const segredo = novoSegredoTotp();
  const cifrado = await cifrarCom(chaveMestra, segredo, nomeCifraTotp(ator.id));
  await db.prepare("update pessoas set totp_cifrado = ?, totp_ativo = 0, totp_ultimo_passo = null, updated_at = ? where id = ?").bind(cifrado, agora(), ator.id).run();
  return segredo;
}

/** Liga as duas etapas depois de conferir o 1º código do aplicativo. */
export async function ativarDuasEtapas(db: Banco, ator: Ator, codigoApp: string, chaveMestra: string | undefined) {
  if (!ator?.ativo) throw new ErroRegra("Sem permissão.");
  const t = await db.prepare("select totp_cifrado, totp_ativo from pessoas where id = ?").bind(ator.id).first<{ totp_cifrado: string | null; totp_ativo: number }>();
  if (t?.totp_ativo) return;
  if (!t?.totp_cifrado) throw new ErroRegra("Comece de novo: gere o QR code.");
  const passo = await conferirCodigoTotp(await decifrarCom(chaveMestra, t.totp_cifrado, nomeCifraTotp(ator.id)), codigoApp);
  if (passo === null) throw new ErroRegra("Código incorreto. Confira se escaneou o QR code e digite o número que aparece agora.");
  await db.batch([
    db.prepare("update pessoas set totp_ativo = 1, totp_ultimo_passo = ?, updated_at = ? where id = ?").bind(passo, agora(), ator.id),
    registrar(db, ator, "equipe.ligou_duas_etapas", ator.nome, {}, ator.cliente),
  ]);
}

// ------------------------------------------------------------------ equipe (do cliente do ator)
const SELECAO_MEMBRO = `select p.id, p.email, p.nome, p.senha_hash, p.ultimo_acesso, p.created_at, m.papel, m.ativo
  from membros m join pessoas p on p.id = m.pessoa_id`;

export async function meuCadastro(db: Banco, ator: Ator): Promise<Pessoa | null> {
  if (!ator) return null;
  const r = await db.prepare("select * from pessoas where id = ?").bind(ator.id).first();
  if (!r) return null;
  return { ...linhaPessoa(r), papel: ator.papel, ativo: ator.ativo, dono: Boolean(r.dono), duas_etapas: Boolean(r.totp_ativo) };
}

export async function listarEquipe(db: Banco, ator: Ator): Promise<Pessoa[]> {
  if (!ator?.ativo || !ator.cliente) throw new ErroRegra("Sem permissão.");
  const r = await db.prepare(`${SELECAO_MEMBRO} where m.cliente_id = ? order by m.papel desc, p.nome`).bind(ator.cliente).all();
  return r.results.map(linhaPessoa);
}

async function membroDoCliente(db: Banco, cliente: string, pessoaId: string) {
  const r = await db.prepare(`${SELECAO_MEMBRO} where m.cliente_id = ? and m.pessoa_id = ?`).bind(cliente, pessoaId).first();
  return r ? linhaPessoa(r) : null;
}

async function criarLink(db: Banco, ator: NonNullable<Ator>, pessoaId: string) {
  const codigo = codigoAleatorio();
  return {
    codigo,
    instrucoes: [
      db.prepare("update links_senha set usado_em = ? where pessoa_id = ? and usado_em is null").bind(agora(), pessoaId), // só o link mais novo vale
      db.prepare("insert into links_senha (token_hash, pessoa_id, criado_por, expira_em) values (?, ?, ?, ?)").bind(await hashCodigo(codigo), pessoaId, ator.nome, somarHoras(VALIDADE_LINK_HORAS)),
    ],
  };
}

/** Inclui uma pessoa NOVA na equipe do cliente. Devolve o código do link para ela definir a senha. */
export async function incluirPessoa(db: Banco, ator: Ator, d: { email: string; nome: string; papel: Papel }) {
  exigirGestor(ator, "Só o gestor cadastra pessoas.");
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new ErroRegra("E-mail inválido.");
  if (!["gestor", "atendente"].includes(d.papel)) throw new ErroRegra("Papel inválido.");
  const id = novoId();
  const link = await criarLink(db, ator, id);
  try {
    await db.batch([
      db.prepare("insert into pessoas (id, email, nome, papel, ativo) values (?, ?, ?, ?, 1)").bind(id, email, d.nome.trim(), d.papel),
      db.prepare("insert into membros (cliente_id, pessoa_id, papel, ativo) values (?, ?, ?, 1)").bind(ator.cliente, id, d.papel),
      ...link.instrucoes,
      registrar(db, ator, "equipe.incluiu", d.nome.trim(), { email, papel: d.papel, ativo: true }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return { id, codigoLink: link.codigo };
}

async function gestoresAtivosAlemDe(db: Banco, cliente: string, id: string) {
  const r = await db.prepare("select count(*) as n from membros where cliente_id = ? and papel = 'gestor' and ativo = 1 and pessoa_id <> ?").bind(cliente, id).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function alterarPessoa(db: Banco, ator: Ator, id: string, d: { nome?: string; papel?: Papel; ativo?: boolean }) {
  exigirGestor(ator, "Só o gestor altera a equipe.");
  const a = await membroDoCliente(db, ator.cliente, id);
  if (!a) throw new ErroRegra("Pessoa não encontrada.");
  const depois = { nome: d.nome?.trim() ?? a.nome, papel: d.papel ?? a.papel, ativo: d.ativo ?? a.ativo };
  if (!["gestor", "atendente"].includes(depois.papel)) throw new ErroRegra("Papel inválido.");
  if (id === ator.id && (depois.papel !== a.papel || depois.ativo !== a.ativo)) {
    throw new ErroRegra("Você não pode mudar o seu próprio papel nem se desativar. Peça a outro gestor.");
  }
  if (!ator.dono && a.papel === "gestor" && a.ativo && (depois.papel !== "gestor" || !depois.ativo) && (await gestoresAtivosAlemDe(db, ator.cliente, id)) === 0) {
    throw new ErroRegra("É preciso ter pelo menos um gestor ativo.");
  }
  if (depois.nome === a.nome && depois.papel === a.papel && depois.ativo === a.ativo) return;
  const lote = [
    db.prepare("update pessoas set nome = ?, updated_at = ? where id = ?").bind(depois.nome, agora(), id),
    db.prepare("update membros set papel = ?, ativo = ?, updated_at = ? where cliente_id = ? and pessoa_id = ?").bind(depois.papel, depois.ativo ? 1 : 0, agora(), ator.cliente, id),
    registrar(db, ator, "equipe.alterou", depois.nome, { antes: { nome: a.nome, papel: a.papel, ativo: a.ativo }, depois }),
  ];
  // desativou ou mudou o papel: derruba as sessões abertas (o acesso muda na hora)
  if (!depois.ativo || depois.papel !== a.papel) lote.push(db.prepare("delete from sessoes where pessoa_id = ?").bind(id));
  try {
    await db.batch(lote);
  } catch (e) {
    traduzirErro(e);
  }
}

/** Tira a pessoa da equipe do cliente. Se ela não fizer parte de nenhum outro cliente (e não for a dona), o cadastro some. */
export async function removerPessoa(db: Banco, ator: Ator, id: string) {
  exigirGestor(ator, "Só o gestor altera a equipe.");
  if (id === ator.id) throw new ErroRegra("Você não pode remover o seu próprio cadastro. Peça a outro gestor.");
  const a = await membroDoCliente(db, ator.cliente, id);
  if (!a) return;
  if (!ator.dono && a.papel === "gestor" && a.ativo && (await gestoresAtivosAlemDe(db, ator.cliente, id)) === 0) throw new ErroRegra("É preciso ter pelo menos um gestor ativo.");
  const outros = await db.prepare("select count(*) n from membros where pessoa_id = ? and cliente_id <> ?").bind(id, ator.cliente).first<{ n: number }>();
  const dono = await db.prepare("select dono from pessoas where id = ?").bind(id).first<{ dono: number }>();
  const apagarCadastro = !(outros?.n ?? 0) && !dono?.dono;
  await db.batch([
    db.prepare("delete from membros where cliente_id = ? and pessoa_id = ?").bind(ator.cliente, id),
    ...(apagarCadastro
      ? [db.prepare("delete from sessoes where pessoa_id = ?").bind(id), db.prepare("delete from links_senha where pessoa_id = ?").bind(id), db.prepare("delete from pessoas where id = ?").bind(id)]
      : []),
    registrar(db, ator, "equipe.removeu", a.nome, { email: a.email }),
  ]);
}

/**
 * Novo link para a pessoa (re)definir a senha. O anterior deixa de valer.
 * A senha vale para todos os clientes da pessoa: por isso o gestor de um cliente só gera link para quem é SÓ do
 * cliente dele (quem também atende outro cliente, ou o dono, só pelo dono da plataforma).
 */
export async function gerarLinkSenha(db: Banco, ator: Ator, pessoaId: string) {
  exigirGestor(ator, "Só o gestor gera links de senha.");
  const p = await membroDoCliente(db, ator.cliente, pessoaId);
  if (!p) throw new ErroRegra("Pessoa não encontrada.");
  if (!ator.dono) {
    const fora = await db
      .prepare("select (select count(*) from membros where pessoa_id = ? and cliente_id <> ?) + (select dono from pessoas where id = ?) as n")
      .bind(pessoaId, ator.cliente, pessoaId)
      .first<{ n: number }>();
    if ((fora?.n ?? 0) > 0) throw new ErroRegra("Esta pessoa também acessa outro cliente. Peça o link ao dono da plataforma.");
  }
  const link = await criarLink(db, ator, pessoaId);
  await db.batch([...link.instrucoes, registrar(db, ator, "equipe.link_senha", p.nome, {})]);
  return link.codigo;
}

/** A pessoa define a senha pelo link. Derruba as sessões antigas. */
export async function definirSenhaComLink(db: Banco, codigo: string, senha: string) {
  const prob = problemaSenha(senha);
  if (prob) throw new ErroRegra(prob);
  const h = await hashCodigo(codigo);
  const l = await db
    .prepare("select l.pessoa_id, p.nome, p.email from links_senha l join pessoas p on p.id = l.pessoa_id where l.token_hash = ? and l.usado_em is null and l.expira_em > ?")
    .bind(h, agora())
    .first<{ pessoa_id: string; nome: string; email: string }>();
  if (!l) throw new ErroRegra("Este link não vale mais. Peça um novo ao gestor.");
  const ator: Ator = { id: l.pessoa_id, nome: l.nome, papel: "atendente", ativo: true, cliente: null, dono: false };
  await db.batch([
    db.prepare("update pessoas set senha_hash = ?, senha_em = ?, updated_at = ? where id = ?").bind(await gerarHashSenha(senha), agora(), agora(), l.pessoa_id),
    db.prepare("update links_senha set usado_em = ? where token_hash = ?").bind(agora(), h),
    db.prepare("delete from sessoes where pessoa_id = ?").bind(l.pessoa_id),
    registrar(db, ator, "equipe.definiu_senha", l.nome, {}, null),
  ]);
  return l.email;
}

/** Troca a própria senha (pede a atual). */
export async function trocarMinhaSenha(db: Banco, ator: Ator, atual: string, nova: string) {
  if (!ator?.ativo) throw new ErroRegra("Sem permissão.");
  const r = await db.prepare("select senha_hash from pessoas where id = ?").bind(ator.id).first<{ senha_hash: string | null }>();
  if (!(await conferirSenha(atual, r?.senha_hash ?? null))) throw new ErroRegra("A senha atual está incorreta.");
  const prob = problemaSenha(nova);
  if (prob) throw new ErroRegra(prob);
  await db.batch([
    db.prepare("update pessoas set senha_hash = ?, senha_em = ?, updated_at = ? where id = ?").bind(await gerarHashSenha(nova), agora(), agora(), ator.id),
    registrar(db, ator, "equipe.trocou_senha", ator.nome, {}),
  ]);
}
