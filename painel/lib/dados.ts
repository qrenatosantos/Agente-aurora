/**
 * Leituras do banco usadas por várias telas. `cache()` = uma consulta por requisição
 * (o layout e a página compartilham o mesmo resultado).
 *
 * Toda leitura espera o perfil primeiro: no 1º acesso, meu_perfil() liga o login ao cadastro
 * e só então o banco libera os dados (RLS). Sem isso, a 1ª tela poderia vir vazia.
 */
import "server-only";
import { cache } from "react";
import { obterPerfil } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import type { AgenteConfig, OperacaoLinha } from "@/lib/tipos";

export const obterConfigAgente = cache(async (): Promise<{ config: AgenteConfig | null; erro?: string }> => {
  await obterPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.from("agente_config").select("*").limit(1).maybeSingle();
  if (error) {
    console.error("[agente_config]", error.message);
    return { config: null, erro: error.message };
  }
  return { config: data };
});

export const obterOperacao = cache(async (): Promise<OperacaoLinha | null> => {
  await obterPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.from("operacao").select("*").limit(1).maybeSingle();
  if (error) console.error("[operacao]", error.message);
  return data ?? null;
});
