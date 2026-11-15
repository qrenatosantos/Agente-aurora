/**
 * Proxy do Next.js 16 (o antigo middleware.ts). Roda antes de cada página.
 * Primeira barreira, rápida: sem o cookie de sessão, rota protegida → /login.
 * A conferência de verdade (sessão válida, pessoa ativa, papel) acontece no servidor, em
 * lib/servidor.ts e em cada operação de lib/banco/.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ehRotaPublica, ROTA_INICIAL } from "@/lib/rotas";
import { COOKIE_SESSAO } from "@/lib/sessao-cookie";

export function proxy(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  if (!request.cookies.get(COOKIE_SESSAO)?.value && !ehRotaPublica(caminho)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    if (caminho !== ROTA_INICIAL) destino.searchParams.set("next", caminho + request.nextUrl.search);
    return NextResponse.redirect(destino);
  }
  return NextResponse.next();
}

export const config = {
  // Roda em tudo, exceto arquivos estáticos e imagens.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|mjs)$).*)",
  ],
};
