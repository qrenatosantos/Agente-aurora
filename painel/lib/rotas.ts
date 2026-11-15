/**
 * ROTAS PÚBLICAS — o ÚNICO lugar para liberar páginas sem login.
 *
 * Todas as outras rotas exigem pessoa logada (o proxy.ts redireciona para /login).
 * A comparação é por prefixo: "/senha" libera também "/senha/qualquer-coisa".
 */
export const ROTAS_PUBLICAS: string[] = [
  "/login",
  "/instalar", // cria o 1º gestor (exige o código de instalação; só funciona com o painel vazio)
  "/senha", // /senha/<código>: definir a senha pelo link gerado pelo gestor
  "/icone", // ícone da aba (favicon)
];

/** Para onde a pessoa vai depois de entrar. */
export const ROTA_INICIAL = "/";

function casa(caminho: string, rota: string) {
  return caminho === rota || caminho.startsWith(rota.endsWith("/") ? rota : rota + "/");
}

export function ehRotaPublica(caminho: string) {
  return ROTAS_PUBLICAS.some((rota) => casa(caminho, rota));
}

/** Aceita só caminhos internos ("/algo") para evitar redirecionamento para outro site. */
export function destinoSeguro(valor: unknown, padrao = ROTA_INICIAL) {
  if (typeof valor !== "string") return padrao;
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return padrao;
  return valor;
}
