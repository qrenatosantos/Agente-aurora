"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, sucesso } from "@/lib/acoes";
import { exigirGestor } from "@/lib/perfil";
import { salvarConfig } from "@/lib/banco/config.ts";
import { atorAtual, banco, mensagemDeErro } from "@/lib/servidor";

const texto = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/\r\n/g, "\n").trim())
    .refine((v) => v.length <= max, `Máximo de ${max} caracteres.`);

const exemplo = z.object({
  situacao: z.string().trim().max(200, "Situação: máximo de 200 caracteres."),
  cliente: z.string().trim().min(1, "Escreva a mensagem do cliente.").max(1500, "Cliente: máximo de 1.500 caracteres."),
  agente: z.string().trim().min(1, "Escreva a resposta ideal do agente.").max(1500, "Agente: máximo de 1.500 caracteres."),
});

const esquema = z.object({
  nome_agente: z.string().trim().min(2, "Dê um nome ao agente.").max(60, "Máximo de 60 caracteres."),
  apresentacao: texto(1000),
  tom: texto(1000),
  saudacao: texto(1000),
  instrucoes: texto(20000).refine((v) => v.length >= 50, "Escreva as instruções do agente (pelo menos algumas linhas)."),
  espera_segundos: z.coerce.number("Informe os segundos.").int().min(2, "Mínimo de 2 segundos.").max(30, "Máximo de 30 segundos."),
  transcrever_audio: z.enum(["sim", "nao"]).transform((v) => v === "sim"),
  exemplos: z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v || "[]") as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Exemplos em formato inválido." });
        return z.NEVER;
      }
    })
    .pipe(z.array(exemplo).max(50, "Máximo de 50 exemplos.")),
});

export async function salvarAgente(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);

  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return falha("Confira os campos destacados.", errosDoZod(dados.error));

  let versao: number;
  try {
    versao = await salvarConfig(await banco(), await atorAtual(), dados.data);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }

  revalidatePath("/agente");
  revalidatePath("/registro");
  return sucesso(`Salvo. Esta é a versão ${versao} da configuração.`);
}
