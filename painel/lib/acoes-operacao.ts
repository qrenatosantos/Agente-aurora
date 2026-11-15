"use server";

/** Botão de emergência: pausar (qualquer pessoa ativa) e religar (só gestor). A regra está em lib/banco/operacao.ts. */
import { revalidatePath } from "next/cache";
import { type EstadoAcao, falha, sucesso } from "@/lib/acoes";
import * as op from "@/lib/banco/operacao.ts";
import { atorAtual, banco, mensagemDeErro } from "@/lib/servidor";

export async function pausarAgente(motivo: string): Promise<EstadoAcao> {
  try {
    await op.pausarAgente(await banco(), await atorAtual(), motivo.trim().slice(0, 300) || null);
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  return sucesso("Agente pausado. As mensagens continuam sendo registradas, mas ele não responde ninguém.");
}

export async function retomarAgente(): Promise<EstadoAcao> {
  try {
    await op.retomarAgente(await banco(), await atorAtual());
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/", "layout");
  return sucesso("Agente religado.");
}
