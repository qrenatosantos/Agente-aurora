"use server";

/**
 * Server Actions de autenticação: instalar (1º gestor), entrar, sair, definir senha pelo link
 * e trocar a própria senha. Não existe cadastro público: o gestor inclui as pessoas em Equipe e
 * envia a elas o link para criar a senha.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, sucesso } from "@/lib/acoes";
import * as pessoas from "@/lib/banco/pessoas.ts";
import { destinoSeguro } from "@/lib/rotas";
import { apagarCookieSessao, atorAtual, banco, envPainel, gravarCookieCliente, gravarCookieSessao, ipDoPedido, lerCookieSessao, mensagemDeErro } from "@/lib/servidor";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { enderecoOtpauth } from "@/lib/banco/totp.ts";

const email = z.email("Informe um e-mail válido.");
const senhaNova = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(200, "Senha longa demais.")
  .refine((s) => /[a-zA-Z]/.test(s) && /[0-9]/.test(s), "Use letras e números na senha.");

export async function entrar(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z.object({ email, senha: z.string().min(1, "Informe a senha.") }).safeParse({
    email: String(formData.get("email") ?? "").trim(),
    senha: String(formData.get("senha") ?? ""),
  });
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));
  let duasEtapas = false;
  try {
    const r = await pessoas.entrar(await banco(), { ...dados.data, ip: await ipDoPedido() });
    await gravarCookieSessao(r.codigo);
    duasEtapas = r.duasEtapas;
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  const destino = destinoSeguro(formData.get("next"));
  redirect(duasEtapas ? `/login/codigo?next=${encodeURIComponent(destino)}` : destino);
}

/** 2º passo do login (duas etapas): o código de 6 números do aplicativo autenticador. */
export async function confirmarCodigo(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z
    .object({ codigo: z.string().trim().regex(/^\d{3} ?\d{3}$/, "Digite os 6 números que aparecem no aplicativo.") })
    .safeParse({ codigo: String(formData.get("codigo") ?? "") });
  if (!dados.success) return falha("Confira o código.", errosDoZod(dados.error));
  try {
    await pessoas.confirmarDuasEtapas(await banco(), await lerCookieSessao(), dados.data.codigo, (await envPainel()).CHAVE_MESTRA ?? process.env.CHAVE_MESTRA);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect(destinoSeguro(formData.get("next")));
}

/** Gera o QR code para ligar as duas etapas (o segredo fica cifrado no banco; ainda desligado até confirmar). */
export async function gerarQrDuasEtapas(): Promise<EstadoAcao> {
  try {
    const ator = await atorAtual();
    const segredo = await pessoas.iniciarDuasEtapas(await banco(), ator, (await envPainel()).CHAVE_MESTRA ?? process.env.CHAVE_MESTRA);
    const cadastro = await pessoas.meuCadastro(await banco(), ator);
    return sucesso("QR code pronto.", { segredo, otpauth: enderecoOtpauth(segredo, cadastro?.email ?? "conta", "Estúdio de agentes") });
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
}

/** Liga as duas etapas com o 1º código do aplicativo. */
export async function ativarDuasEtapas(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!/^\d{3} ?\d{3}$/.test(codigo)) return falha("Digite os 6 números que aparecem no aplicativo.", { codigo: "Digite os 6 números." });
  try {
    await pessoas.ativarDuasEtapas(await banco(), await atorAtual(), codigo, (await envPainel()).CHAVE_MESTRA ?? process.env.CHAVE_MESTRA);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  redirect("/?duas-etapas=ligadas");
}

/** Troca o cliente em que a pessoa está trabalhando (topo do painel). O servidor só aceita clientes dela. */
export async function trocarCliente(cliente: string): Promise<EstadoAcao> {
  try {
    const db = await banco();
    const ator = await atorAtual();
    const lista = await pessoas.clientesDoAtor(db, ator);
    if (!lista.some((c) => c.id === cliente)) return falha("Você não tem acesso a este cliente.");
    await gravarCookieCliente(cliente);
  } catch (e) {
    unstable_rethrow(e);
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  return sucesso("Cliente trocado.");
}

export async function sair() {
  try {
    await pessoas.sair(await banco(), await lerCookieSessao());
  } finally {
    await apagarCookieSessao();
  }
  redirect("/login");
}

export async function instalar(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z
    .object({
      codigo: z.string().trim().min(1, "Informe o código de instalação."),
      nome: z.string().trim().min(2, "Informe o seu nome.").max(80),
      email,
      senha: senhaNova,
      confirmacao: z.string(),
    })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));
  try {
    const db = await banco();
    const env = await envPainel();
    await pessoas.instalar(db, { ...dados.data, codigoCerto: env.CODIGO_INSTALACAO });
    await gravarCookieSessao((await pessoas.entrar(db, { email: dados.data.email, senha: dados.data.senha, ip: await ipDoPedido() })).codigo);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect("/seguranca"); // a dona da plataforma liga as duas etapas antes de qualquer coisa
}

/** Definir (ou redefinir) a senha pelo link que o gestor gerou em Equipe. */
export async function definirSenha(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z
    .object({ codigo: z.string().min(20), senha: senhaNova, confirmacao: z.string() })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));
  let duasEtapas = false;
  try {
    const db = await banco();
    const emailDaPessoa = await pessoas.definirSenhaComLink(db, dados.data.codigo, dados.data.senha);
    const r = await pessoas.entrar(db, { email: emailDaPessoa, senha: dados.data.senha, ip: await ipDoPedido() });
    await gravarCookieSessao(r.codigo);
    duasEtapas = r.duasEtapas;
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect(duasEtapas ? "/login/codigo" : "/?senha=definida");
}

export async function trocarSenha(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z
    .object({ atual: z.string().min(1, "Informe a senha atual."), senha: senhaNova, confirmacao: z.string() })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));
  try {
    await pessoas.trocarMinhaSenha(await banco(), await atorAtual(), dados.data.atual, dados.data.senha);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  return sucesso("Senha alterada.");
}
