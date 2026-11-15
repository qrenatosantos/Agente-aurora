/**
 * SERVIDOR DO PAINEL: acesso ao banco (Cloudflare D1) e a quem está logado.
 *
 * - banco(): o D1 do Worker (binding "DB" no wrangler.jsonc). No computador, o `next dev` usa um D1
 *   local (initOpenNextCloudflareForDev em next.config.ts).
 * - atorAtual(): lê o cookie de sessão e devolve a pessoa logada (ou null). Uma consulta por requisição.
 * As REGRAS de acesso ficam em lib/banco/ (cada operação recebe o ator e confere).
 */
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Ator, Banco } from "@/lib/banco/base.ts";
import { ErroRegra } from "@/lib/banco/base.ts";
import { atorDaSessao, DURACAO_SESSAO_DIAS, meuCadastro } from "@/lib/banco/pessoas.ts";

import { COOKIE_SESSAO } from "@/lib/sessao-cookie";
export { COOKIE_SESSAO };

type EnvPainel = { DB?: Banco; MOTOR?: { fetch: typeof fetch }; CODIGO_INSTALACAO?: string; SEGREDO_INTERNO?: string };

export async function envPainel(): Promise<EnvPainel> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as EnvPainel;
}

export async function banco(): Promise<Banco> {
  const env = await envPainel();
  if (!env.DB) throw new Error("Banco D1 não configurado (binding DB no wrangler.jsonc).");
  return env.DB;
}

export async function lerCookieSessao() {
  return (await cookies()).get(COOKIE_SESSAO)?.value ?? null;
}

export async function gravarCookieSessao(codigo: string) {
  (await cookies()).set(COOKIE_SESSAO, codigo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_DIAS * 24 * 3600,
  });
}

export async function apagarCookieSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

/** A pessoa logada nesta requisição (null = ninguém ou sessão vencida). */
export const atorAtual = cache(async (): Promise<Ator> => atorDaSessao(await banco(), await lerCookieSessao()));

/** Cadastro completo (com e-mail) da pessoa logada. */
export const cadastroAtual = cache(async () => {
  const ator = await atorAtual();
  return ator ? meuCadastro(await banco(), ator) : null;
});

/** Endereço de rede de quem fez o pedido (para o limite de tentativas de login). */
export async function ipDoPedido() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Mensagem de erro para a tela: regra do banco (já em português) ou genérica. */
export function mensagemDeErro(e: unknown) {
  if (e instanceof ErroRegra) return e.message;
  console.error("[painel]", e);
  return "Não foi possível concluir agora. Tente novamente.";
}
