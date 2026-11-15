"use server";

/** Botão de emergência: pausar (qualquer pessoa ativa) e religar (só gestor). A regra está no banco. */
import { revalidatePath } from "next/cache";
import { type EstadoAcao, falha, mensagemErroBanco, sucesso } from "@/lib/acoes";
import { exigirPerfil } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";

export async function pausarAgente(motivo: string): Promise<EstadoAcao> {
  const r = await exigirPerfil();
  if ("erro" in r) return falha(r.erro);
  const supabase = await createClient();
  const { error } = await supabase.rpc("pausar_agente", { p_motivo: motivo.trim().slice(0, 300) || null });
  if (error) return falha(mensagemErroBanco(error));
  revalidatePath("/", "layout");
  return sucesso("Agente pausado. As mensagens continuam sendo registradas, mas ele não responde ninguém.");
}

export async function retomarAgente(): Promise<EstadoAcao> {
  const r = await exigirPerfil();
  if ("erro" in r) return falha(r.erro);
  const supabase = await createClient();
  const { error } = await supabase.rpc("retomar_agente");
  if (error) return falha(mensagemErroBanco(error));
  revalidatePath("/", "layout");
  return sucesso("Agente religado.");
}
