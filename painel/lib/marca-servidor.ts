/**
 * MARCA do painel: a do CLIENTE em que a pessoa está trabalhando (nome, cores, fonte e logo, em clientes.marca).
 * Sem pessoa logada (login) ou sem cliente: a marca da plataforma (MARCA_PADRAO). Qualquer erro do banco também
 * cai na marca da plataforma, para a tela nunca deixar de abrir.
 */
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { meuCliente } from "@/lib/banco/clientes.ts";
import { MARCA_PADRAO, normalizarMarca, type Marca } from "@/lib/marca";
import { DESCRICAO_APP } from "@/lib/navegacao";
import { atorAtual, banco } from "@/lib/servidor";

const PLATAFORMA: Marca = { ...MARCA_PADRAO, subtitulo: DESCRICAO_APP };

export const obterMarca = cache(async (): Promise<Marca> => {
  try {
    const c = await meuCliente(await banco(), await atorAtual());
    if (!c) return PLATAFORMA;
    return {
      ...normalizarMarca({ nome_exibicao: c.nome, logo_url: c.marca.logo, cor_primaria: c.marca.principal, cor_destaque: c.marca.destaque, fonte: c.marca.fonte, raio: "reto" }),
      subtitulo: DESCRICAO_APP,
    };
  } catch (e) {
    unstable_rethrow(e);
    return PLATAFORMA;
  }
});
