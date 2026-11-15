"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { textoDaPagina } from "@/lib/texto-pagina";
import { exigirGestor } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { ehUuid } from "@/lib/validacao";

const esquema = z
  .object({
    id: z.string().optional(),
    tipo: z.enum(["pergunta", "texto", "arquivo", "site"], "Escolha o tipo."),
    titulo: z.string().trim().min(2, "Dê um título (ex.: “Levam gelo?”).").max(200, "Máximo de 200 caracteres."),
    pergunta: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .refine((v) => v.length <= 1000, "Máximo de 1.000 caracteres."),
    conteudo: z
      .string()
      .transform((v) => v.replace(/\r\n/g, "\n").trim())
      .refine((v) => v.length >= 2, "Escreva o conteúdo.")
      .refine((v) => v.length <= 60000, "Texto grande demais (máximo de 60.000 caracteres). Divida em partes."),
    fonte: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .refine((v) => v.length <= 500, "Máximo de 500 caracteres."),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "pergunta" && !d.pergunta) ctx.addIssue({ code: "custom", path: ["pergunta"], message: "Escreva a pergunta do cliente." });
    if (d.tipo === "site" && !/^https?:\/\//.test(d.fonte)) ctx.addIssue({ code: "custom", path: ["fonte"], message: "Informe o endereço da página (https://…)." });
  });

export async function salvarConhecimento(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));

  const { id, ...resto } = dados.data;
  const linha = { ...resto, pergunta: resto.tipo === "pergunta" ? resto.pergunta : null, fonte: resto.fonte || null };
  const supabase = await createClient();
  const consulta = id && ehUuid(id)
    ? supabase.from("conhecimento").update(linha).eq("id", id).select("alertas").maybeSingle()
    : supabase.from("conhecimento").insert(linha).select("alertas").maybeSingle();
  const { data, error } = await consulta;
  if (error) return falha(mensagemErroBanco(error));
  if (!data) return falha("Item não encontrado ou sem permissão.");

  revalidatePath("/conhecimento");
  if (data.alertas.length) {
    return sucesso(`Salvo, com alerta: ${data.alertas.join(", ")}. Preço e condições só podem vir do CRM: revise o texto.`);
  }
  return sucesso("Salvo.");
}

export async function alternarAtivo(id: string, ativo: boolean): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  if (!ehUuid(id)) return falha("Item inválido.");
  const supabase = await createClient();
  const { error } = await supabase.from("conhecimento").update({ ativo }).eq("id", id);
  if (error) return falha(mensagemErroBanco(error));
  revalidatePath("/conhecimento");
  return sucesso(ativo ? "O agente volta a usar este item." : "O agente deixa de usar este item.");
}

export async function excluirConhecimento(id: string): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  if (!ehUuid(id)) return falha("Item inválido.");
  const supabase = await createClient();
  const { error, count } = await supabase.from("conhecimento").delete({ count: "exact" }).eq("id", id);
  if (error) return falha(mensagemErroBanco(error));
  if (!count) return falha("Item não encontrado ou sem permissão.");
  revalidatePath("/conhecimento");
  return sucesso("Excluído. O texto anterior fica guardado no Registro.");
}

/** Lê uma página do site e devolve o texto para o gestor revisar ANTES de salvar. */
export async function buscarPagina(endereco: string): Promise<{ ok: true; titulo: string; texto: string } | { ok: false; mensagem: string }> {
  const g = await exigirGestor();
  if ("erro" in g) return { ok: false, mensagem: g.erro };
  return textoDaPagina(endereco);
}
