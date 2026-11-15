/**
 * PESSOAS, LOGIN E SESSÕES.
 *
 * - Instalação: o 1º gestor é criado com o CÓDIGO DE INSTALAÇÃO (segredo do Worker), só enquanto não
 *   existir nenhuma pessoa. Ninguém de fora "pega" o painel antes.
 * - Equipe: só o gestor inclui, altera e remove. Ninguém muda o próprio papel nem se desativa.
 *   Nunca fica sem gestor ativo.
 * - Senha: definida pela própria pessoa, por um LINK gerado pelo gestor (vale 48 h, uma vez só).
 * - Login: e-mail + senha, com limite de tentativas erradas (por e-mail e por endereço de rede).
 */
import { agora, type Ator, type Banco, ErroRegra, exigirGestor, novoId, registrar, traduzirErro } from "./base.ts";
import { codigoAleatorio, conferirSenha, gerarHashSenha, hashCodigo, iguaisSeguro, problemaSenha } from "./senha.ts";

export const DURACAO_SESSAO_DIAS = 14;
export const VALIDADE_LINK_HORAS = 48;
const JANELA_TENTATIVAS_MIN = 15;
const MAX_ERROS_EMAIL = 5;
const MAX_ERROS_IP = 20;

export type Pessoa = { id: string; email: string; nome: string; papel: "gestor" | "atendente"; ativo: boolean; tem_senha: boolean; ultimo_acesso: string | null; created_at: string };

const somarHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const normalizarEmail = (e: string) => e.trim().toLowerCase();
const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;
const linhaPessoa = (r: Record<string, unknown>): Pessoa => ({
  id: String(r.id),
  email: String(r.email),
  nome: String(r.nome),
  papel: r.papel as Pessoa["papel"],
  ativo: Boolean(r.ativo),
  tem_senha: Boolean(r.senha_hash),
  ultimo_acesso: (r.ultimo_acesso as string) ?? null,
  created_at: String(r.created_at),
});

export async function precisaInstalar(db: Banco) {
  const r = await db.prepare("select count(*) as n from pessoas").first<{ n: number }>();
  return (r?.n ?? 0) === 0;
}

/** Cria o 1º gestor. Só funciona com o código de instalação certo e enquanto não houver ninguém. */
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
  const ator: Ator = { id, nome: d.nome.trim(), papel: "gestor", ativo: true };
  try {
    // "where not exists": dois cadastros ao mesmo tempo não criam dois primeiros gestores
    const r = await db
      .prepare(
        `insert into pessoas (id, email, nome, papel, ativo, senha_hash, senha_em)
         select ?, ?, ?, 'gestor', 1, ?, ? where not exists (select 1 from pessoas)`,
      )
      .bind(id, email, d.nome.trim(), hash, agora())
      .run();
    if (r.meta.changes !== 1) throw new ErroRegra("O painel já foi instalado. Entre com seu e-mail e senha.");
    await registrar(db, ator, "equipe.instalou", d.nome.trim(), { email }).run();
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

/** Confere e-mail e senha. Devolve o código da sessão (vai para o cookie). */
export async function entrar(db: Banco, d: { email: string; senha: string; ip: string | null }) {
  const email = normalizarEmail(d.email);
  const chaveEmail = `email:${email}`;
  const chaveIp = d.ip ? `ip:${d.ip}` : null;
  if ((await errosRecentes(db, chaveEmail)) >= MAX_ERROS_EMAIL || (chaveIp && (await errosRecentes(db, chaveIp)) >= MAX_ERROS_IP)) {
    throw new ErroRegra(`Muitas tentativas erradas. Espere ${JANELA_TENTATIVAS_MIN} minutos e tente de novo.`);
  }
  const p = await db.prepare("select id, nome, ativo, senha_hash from pessoas where email = ?").bind(email).first<{ id: string; nome: string; ativo: number; senha_hash: string | null }>();
  const ok = await conferirSenha(d.senha, p?.senha_hash ?? null); // sempre roda (mesmo tempo com ou sem cadastro)
  if (!p || !ok) {
    const falhas = [db.prepare("insert into tentativas_login (chave) values (?)").bind(chaveEmail)];
    if (chaveIp) falhas.push(db.prepare("insert into tentativas_login (chave) values (?)").bind(chaveIp));
    await db.batch(falhas);
    throw new ErroRegra("E-mail ou senha incorretos.");
  }
  if (!p.ativo) throw new ErroRegra("Seu acesso está desativado. Fale com o gestor.");
  const codigo = codigoAleatorio();
  const limite = new Date(Date.now() - 24 * 3600_000).toISOString();
  await db.batch([
    db.prepare("insert into sessoes (token_hash, pessoa_id, expira_em, ip) values (?, ?, ?, ?)").bind(await hashCodigo(codigo), p.id, somarHoras(DURACAO_SESSAO_DIAS * 24), d.ip),
    db.prepare("update pessoas set ultimo_acesso = ? where id = ?").bind(agora(), p.id),
    db.prepare("delete from tentativas_login where chave = ?").bind(chaveEmail),
    // limpeza: sessões vencidas e tentativas antigas
    db.prepare("delete from sessoes where expira_em < ?").bind(agora()),
    db.prepare("delete from tentativas_login where em < ?").bind(limite),
  ]);
  return codigo;
}

/** Quem é o dono deste código de sessão (só sessão válida de pessoa ativa). */
export async function atorDaSessao(db: Banco, codigo: string | null | undefined): Promise<Ator> {
  if (!codigo || codigo.length < 20 || codigo.length > 100) return null;
  const r = await db
    .prepare(
      `select p.id, p.nome, p.papel, p.ativo from sessoes s join pessoas p on p.id = s.pessoa_id
        where s.token_hash = ? and s.expira_em > ?`,
    )
    .bind(await hashCodigo(codigo), agora())
    .first<{ id: string; nome: string; papel: "gestor" | "atendente"; ativo: number }>();
  if (!r || !r.ativo) return null;
  return { id: r.id, nome: r.nome, papel: r.papel, ativo: true };
}

export async function sair(db: Banco, codigo: string | null | undefined) {
  if (codigo) await db.prepare("delete from sessoes where token_hash = ?").bind(await hashCodigo(codigo)).run();
}

// ------------------------------------------------------------------ equipe
export async function meuCadastro(db: Banco, ator: Ator): Promise<Pessoa | null> {
  if (!ator) return null;
  const r = await db.prepare("select * from pessoas where id = ?").bind(ator.id).first();
  return r ? linhaPessoa(r) : null;
}

export async function listarEquipe(db: Banco, ator: Ator): Promise<Pessoa[]> {
  if (!ator?.ativo) throw new ErroRegra("Sem permissão.");
  const r = await db.prepare("select * from pessoas order by papel desc, nome").all();
  return r.results.map(linhaPessoa);
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

/** Inclui uma pessoa. Devolve o código do link para ela definir a senha. */
export async function incluirPessoa(db: Banco, ator: Ator, d: { email: string; nome: string; papel: "gestor" | "atendente" }) {
  exigirGestor(ator, "Só o gestor cadastra pessoas.");
  const email = normalizarEmail(d.email);
  if (!emailValido(email)) throw new ErroRegra("E-mail inválido.");
  if (!["gestor", "atendente"].includes(d.papel)) throw new ErroRegra("Papel inválido.");
  const id = novoId();
  const link = await criarLink(db, ator, id);
  try {
    await db.batch([
      db.prepare("insert into pessoas (id, email, nome, papel, ativo) values (?, ?, ?, ?, 1)").bind(id, email, d.nome.trim(), d.papel),
      ...link.instrucoes,
      registrar(db, ator, "equipe.incluiu", d.nome.trim(), { email, papel: d.papel, ativo: true }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return { id, codigoLink: link.codigo };
}

async function gestoresAtivosAlemDe(db: Banco, id: string) {
  const r = await db.prepare("select count(*) as n from pessoas where papel = 'gestor' and ativo = 1 and id <> ?").bind(id).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function alterarPessoa(db: Banco, ator: Ator, id: string, d: { nome?: string; papel?: "gestor" | "atendente"; ativo?: boolean }) {
  exigirGestor(ator, "Só o gestor altera a equipe.");
  const antes = await db.prepare("select * from pessoas where id = ?").bind(id).first();
  if (!antes) throw new ErroRegra("Pessoa não encontrada.");
  const a = linhaPessoa(antes);
  const depois = { nome: d.nome?.trim() ?? a.nome, papel: d.papel ?? a.papel, ativo: d.ativo ?? a.ativo };
  if (!["gestor", "atendente"].includes(depois.papel)) throw new ErroRegra("Papel inválido.");
  if (id === ator.id && (depois.papel !== a.papel || depois.ativo !== a.ativo)) {
    throw new ErroRegra("Você não pode mudar o seu próprio papel nem se desativar. Peça a outro gestor.");
  }
  if (a.papel === "gestor" && a.ativo && (depois.papel !== "gestor" || !depois.ativo) && (await gestoresAtivosAlemDe(db, id)) === 0) {
    throw new ErroRegra("É preciso ter pelo menos um gestor ativo.");
  }
  if (depois.nome === a.nome && depois.papel === a.papel && depois.ativo === a.ativo) return;
  const lote = [
    db.prepare("update pessoas set nome = ?, papel = ?, ativo = ?, updated_at = ? where id = ?").bind(depois.nome, depois.papel, depois.ativo ? 1 : 0, agora(), id),
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

export async function removerPessoa(db: Banco, ator: Ator, id: string) {
  exigirGestor(ator, "Só o gestor altera a equipe.");
  if (id === ator.id) throw new ErroRegra("Você não pode remover o seu próprio cadastro. Peça a outro gestor.");
  const antes = await db.prepare("select * from pessoas where id = ?").bind(id).first();
  if (!antes) return;
  const a = linhaPessoa(antes);
  if (a.papel === "gestor" && a.ativo && (await gestoresAtivosAlemDe(db, id)) === 0) throw new ErroRegra("É preciso ter pelo menos um gestor ativo.");
  await db.batch([
    db.prepare("delete from sessoes where pessoa_id = ?").bind(id),
    db.prepare("delete from links_senha where pessoa_id = ?").bind(id),
    db.prepare("delete from pessoas where id = ?").bind(id),
    registrar(db, ator, "equipe.removeu", a.nome, { email: a.email }),
  ]);
}

/** Novo link para a pessoa (re)definir a senha. O anterior deixa de valer. */
export async function gerarLinkSenha(db: Banco, ator: Ator, pessoaId: string) {
  exigirGestor(ator, "Só o gestor gera links de senha.");
  const p = await db.prepare("select nome from pessoas where id = ?").bind(pessoaId).first<{ nome: string }>();
  if (!p) throw new ErroRegra("Pessoa não encontrada.");
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
  const ator: Ator = { id: l.pessoa_id, nome: l.nome, papel: "atendente", ativo: true };
  await db.batch([
    db.prepare("update pessoas set senha_hash = ?, senha_em = ?, updated_at = ? where id = ?").bind(await gerarHashSenha(senha), agora(), agora(), l.pessoa_id),
    db.prepare("update links_senha set usado_em = ? where token_hash = ?").bind(agora(), h),
    db.prepare("delete from sessoes where pessoa_id = ?").bind(l.pessoa_id),
    registrar(db, ator, "equipe.definiu_senha", l.nome, {}),
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
