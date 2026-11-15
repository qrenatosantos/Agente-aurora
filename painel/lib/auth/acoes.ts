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
import { apagarCookieSessao, atorAtual, banco, envPainel, gravarCookieSessao, ipDoPedido, lerCookieSessao, mensagemDeErro } from "@/lib/servidor";

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
  try {
    const codigo = await pessoas.entrar(await banco(), { ...dados.data, ip: await ipDoPedido() });
    await gravarCookieSessao(codigo);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect(destinoSeguro(formData.get("next")));
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
    await gravarCookieSessao(await pessoas.entrar(db, { email: dados.data.email, senha: dados.data.senha, ip: await ipDoPedido() }));
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect("/?instalado=1");
}

/** Definir (ou redefinir) a senha pelo link que o gestor gerou em Equipe. */
export async function definirSenha(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const dados = z
    .object({ codigo: z.string().min(20), senha: senhaNova, confirmacao: z.string() })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem.", path: ["confirmacao"] })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));
  try {
    const db = await banco();
    const emailDaPessoa = await pessoas.definirSenhaComLink(db, dados.data.codigo, dados.data.senha);
    await gravarCookieSessao(await pessoas.entrar(db, { email: emailDaPessoa, senha: dados.data.senha, ip: await ipDoPedido() }));
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  redirect("/?senha=definida");
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
