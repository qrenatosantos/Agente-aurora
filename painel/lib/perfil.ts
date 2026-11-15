/**
 * Perfil da pessoa LOGADA (tabela perfis).
 *
 * A função `meu_perfil()` do banco garante o cadastro no 1º acesso: liga pelo e-mail a um
 * cadastro feito pelo gestor em Equipe ou cria um novo (o 1º login vira gestor; os demais
 * ficam desativados até o gestor liberar). `cache()` = uma chamada por requisição.
 *
 * As permissões de verdade ficam no banco (RLS). Estas funções só escondem botões e dão
 * mensagens claras antes de tentar gravar.
 */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/tipos";

export const obterPerfil = cache(async (): Promise<{ perfil: Perfil | null; erro?: string }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meu_perfil");
  if (error) {
    console.error("[meu_perfil]", error.message);
    return { perfil: null, erro: error.message };
  }
  return { perfil: (data as unknown as Perfil | null) ?? null };
});

export async function exigirPerfil(): Promise<{ perfil: Perfil } | { erro: string }> {
  const { perfil } = await obterPerfil();
  if (!perfil) return { erro: "Não foi possível identificar seu cadastro. Faça login novamente." };
  if (!perfil.ativo) return { erro: "Seu acesso está desativado. Fale com o gestor." };
  return { perfil };
}

export async function exigirGestor(): Promise<{ perfil: Perfil } | { erro: string }> {
  const r = await exigirPerfil();
  if ("erro" in r) return r;
  if (r.perfil.papel !== "gestor") return { erro: "Só o gestor pode fazer isso." };
  return r;
}

export const ehGestor = (perfil: Perfil | null | undefined) => perfil?.papel === "gestor" && perfil.ativo;
