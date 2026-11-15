"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, sucesso } from "@/lib/acoes";
import * as pessoas from "@/lib/banco/pessoas.ts";
import { atorAtual, banco, mensagemDeErro } from "@/lib/servidor";
import { ehUuid } from "@/lib/validacao";

const esquema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(2, "Informe o nome.").max(80, "Máximo de 80 caracteres."),
  email: z.email("Informe um e-mail válido.").transform((v) => v.trim().toLowerCase()),
  papel: z.enum(["gestor", "atendente"], "Escolha o papel."),
  ativo: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
});

/** Endereço completo do link de senha (o código só existe aqui; no banco fica o hash). */
async function linkDeSenha(codigo: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}/senha/${codigo}`;
}

export async function salvarPessoa(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const d = esquema.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  const { id, ...dados } = d.data;
  try {
    const db = await banco();
    const ator = await atorAtual();
    if (id && ehUuid(id)) {
      // o e-mail não muda depois do cadastro
      await pessoas.alterarPessoa(db, ator, id, { nome: dados.nome, papel: dados.papel, ativo: dados.ativo });
    } else {
      const nova = await pessoas.incluirPessoa(db, ator, { email: dados.email, nome: dados.nome, papel: dados.papel });
      revalidatePath("/equipe");
      return sucesso("Pessoa cadastrada. Envie a ela o link abaixo para criar a senha.", { link: await linkDeSenha(nova.codigoLink), nome: dados.nome });
    }
  } catch (e) {
    const msg = mensagemDeErro(e);
    return falha(msg, /e-mail/i.test(msg) ? { email: msg } : undefined);
  }
  revalidatePath("/equipe");
  return sucesso("Alterações salvas.");
}

export async function gerarLink(id: string): Promise<EstadoAcao> {
  if (!ehUuid(id)) return falha("Pessoa inválida.");
  try {
    const codigo = await pessoas.gerarLinkSenha(await banco(), await atorAtual(), id);
    revalidatePath("/equipe");
    return sucesso("Link gerado. Ele vale por 48 horas e uma vez só; o anterior deixou de valer.", { link: await linkDeSenha(codigo) });
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
}

export async function removerPessoa(id: string): Promise<EstadoAcao> {
  if (!ehUuid(id)) return falha("Pessoa inválida.");
  try {
    await pessoas.removerPessoa(await banco(), await atorAtual(), id);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/equipe");
  return sucesso("Pessoa removida do painel.");
}
