"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAcao, falha, sucesso } from "@/lib/acoes";
import * as cfg from "@/lib/banco/config.ts";
import { atorAtual, banco, mensagemDeErro } from "@/lib/servidor";

export async function restaurarVersao(numero: number): Promise<EstadoAcao> {
  if (!Number.isInteger(numero) || numero < 1) return falha("Versão inválida.");
  let data: number;
  try {
    data = await cfg.restaurarVersao(await banco(), await atorAtual(), numero);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  return sucesso(`Pronto: a configuração voltou a ser igual à versão ${numero} (salva como versão ${data}).`);
}
