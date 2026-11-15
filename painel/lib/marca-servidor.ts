/**
 * MARCA do painel: identidade fixa da Aurora Bartenders (azul-marinho #021938, dourado #C6A86A,
 * Cormorant Garamond + DM Sans e a logo do site). Não depende do banco, então funciona até
 * na tela de login e quando o banco está fora do ar.
 */
import "server-only";
import { cache } from "react";
import { MARCA_PADRAO, type Marca } from "@/lib/marca";
import { DESCRICAO_APP } from "@/lib/navegacao";


export const obterMarca = cache(async (): Promise<Marca> => ({
  ...MARCA_PADRAO,
  subtitulo: DESCRICAO_APP,
  logoUrl: null, // sem logo enviada: LogoNegocio usa o emblema da Aurora (public/aurora/favicon.svg)
}));
