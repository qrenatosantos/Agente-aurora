/**
 * Leituras do banco usadas por várias telas. `cache()` = uma consulta por requisição
 * (o layout e a página compartilham o mesmo resultado).
 */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { lerConfig } from "@/lib/banco/config.ts";
import { lerOperacao } from "@/lib/banco/operacao.ts";
import { atorAtual, banco } from "@/lib/servidor";
import type { AgenteConfig, OperacaoLinha } from "@/lib/tipos";

export const obterConfigAgente = cache(async (): Promise<{ config: AgenteConfig | null; erro?: string }> => {
  try {
    return { config: await lerConfig(await banco(), await atorAtual()) };
  } catch (e) {
    unstable_rethrow(e); // erros internos do Next (página dinâmica, redirecionamento) seguem adiante
    console.error("[agente_config]", e);
    return { config: null, erro: e instanceof Error ? e.message : String(e) };
  }
});

export const obterOperacao = cache(async (): Promise<OperacaoLinha | null> => {
  try {
    return await lerOperacao(await banco(), await atorAtual());
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
});
