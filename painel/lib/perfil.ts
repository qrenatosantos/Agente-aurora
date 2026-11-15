/**
 * Perfil da pessoa LOGADA. As permissões de verdade ficam em lib/banco/ (cada operação confere);
 * estas funções só escondem botões e dão mensagens claras antes de tentar gravar.
 */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { cadastroAtual } from "@/lib/servidor";
import type { Perfil } from "@/lib/tipos";

export const obterPerfil = cache(async (): Promise<{ perfil: Perfil | null; erro?: string }> => {
  try {
    return { perfil: await cadastroAtual() };
  } catch (e) {
    unstable_rethrow(e); // erros internos do Next (página dinâmica, redirecionamento) seguem adiante
    console.error("[perfil]", e);
    return { perfil: null, erro: "Não foi possível ler o banco do painel." };
  }
});

export async function exigirPerfil(): Promise<{ perfil: Perfil } | { erro: string }> {
  const { perfil } = await obterPerfil();
  if (!perfil) return { erro: "Sua sessão terminou. Faça login novamente." };
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
