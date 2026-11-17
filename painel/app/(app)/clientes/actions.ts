"use server";

/**
 * ESTÚDIO ▸ CLIENTES (só o dono da plataforma). As regras de verdade ficam em lib/banco/clientes.ts
 * (cada operação confere se quem pede é o dono).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAcao, errosDoZod, falha, sucesso } from "@/lib/acoes";
import * as clientes from "@/lib/banco/clientes.ts";
import { lerMoeda } from "@/lib/formatar";
import { atorAtual, banco, gravarCookieCliente, mensagemDeErro } from "@/lib/servidor";

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => v || null);
const cor = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || /^#[0-9a-fA-F]{6}$/.test(v), "Use o formato #RRGGBB.");

const esquema = z.object({
  editar: z.string().optional(),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/, "De 2 a 30 letras minúsculas, números ou hífen (ex.: clinica-sorriso)."),
  nome: z.string().trim().min(2, "Informe o nome do cliente.").max(80, "Máximo de 80 caracteres."),
  plano_nome: opcional(60),
  plano_valor_brl: z
    .string()
    .trim()
    .transform((v) => (v ? lerMoeda(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 1_000_000), "Valor inválido."),
  limite_mensal_usd: z.coerce.number("Informe o limite.").min(1, "Mínimo de US$ 1.").max(10000, "Máximo de US$ 10.000."),
  dia_fechamento: z.coerce.number().int().min(1, "Entre 1 e 28.").max(28, "Entre 1 e 28."),
  responsavel_nome: opcional(80),
  responsavel_email: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase() || null)
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido."),
  responsavel_telefone: opcional(30),
  observacoes: opcional(2000),
  cor_principal: cor,
  cor_destaque: cor,
  logo: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || (/^(https?:\/\/\S{3,480}|\/[a-zA-Z0-9/_.-]{1,200})$/.test(v) && !v.startsWith("//")), "Use um endereço https://… ou /caminho."),
});

export async function salvarCliente(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const d = esquema.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha("Confira os campos destacados.", errosDoZod(d.error));
  const { editar, id, cor_principal, cor_destaque, logo, ...dados } = d.data;
  const marca = { principal: cor_principal, destaque: cor_destaque, logo };
  try {
    const db = await banco();
    const ator = await atorAtual();
    if (editar) {
      await clientes.alterarCliente(db, ator, id, { ...dados, marca });
    } else {
      await clientes.criarCliente(db, ator, { id, ...dados, marca });
    }
  } catch (e) {
    const msg = mensagemDeErro(e);
    return falha(msg, /apelido/i.test(msg) ? { id: msg } : undefined);
  }
  revalidatePath("/", "layout");
  return sucesso(editar ? "Cliente atualizado." : "Cliente criado. Abra o cliente no topo para configurar o agente e a equipe.");
}

export async function mudarSituacao(id: string, situacao: clientes.Situacao): Promise<EstadoAcao> {
  try {
    await clientes.mudarSituacaoCliente(await banco(), await atorAtual(), id, situacao);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  const textos = { ativo: "Cliente reativado.", pausado: "Cliente pausado: o agente dele não responde ninguém.", encerrado: "Cliente encerrado: a equipe dele perdeu o acesso." };
  return sucesso(textos[situacao]);
}

/** Abre o cliente (passa a trabalhar nele no painel). */
export async function abrirCliente(id: string): Promise<EstadoAcao> {
  try {
    const lista = await clientes.listarClientes(await banco(), await atorAtual());
    if (!lista.some((c) => c.id === id)) return falha("Cliente não encontrado.");
    await gravarCookieCliente(id);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  return sucesso("Cliente aberto.");
}
