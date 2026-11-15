"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAcao, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { exigirGestor } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";

export async function restaurarVersao(numero: number): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha(g.erro);
  if (!Number.isInteger(numero) || numero < 1) return falha("Versão inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurar_versao", { p_numero: numero });
  if (error) return falha(mensagemErroBanco(error));
  revalidatePath("/", "layout");
  return sucesso(`Pronto: a configuração voltou a ser igual à versão ${numero} (salva como versão ${data}).`);
}
