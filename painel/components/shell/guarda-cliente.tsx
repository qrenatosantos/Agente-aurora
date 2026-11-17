"use client";

/**
 * GUARDA DE CLIENTE: o cliente escolhido vale para o navegador inteiro (cookie). Se a pessoa trocar de cliente em outra
 * aba e voltar para esta, a página é recarregada ANTES de qualquer clique, para nunca salvar algo no cliente errado.
 */
import { useEffect } from "react";
import { COOKIE_CLIENTE } from "@/lib/sessao-cookie";

function clienteDoCookie() {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CLIENTE}=`));
  return par ? decodeURIComponent(par.slice(COOKIE_CLIENTE.length + 1)) : null;
}

export function GuardaCliente({ cliente }: { cliente: string | null }) {
  useEffect(() => {
    const conferir = () => {
      const noCookie = clienteDoCookie();
      if (document.visibilityState === "visible" && noCookie && cliente && noCookie !== cliente) window.location.reload();
    };
    window.addEventListener("focus", conferir);
    document.addEventListener("visibilitychange", conferir);
    return () => {
      window.removeEventListener("focus", conferir);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, [cliente]);
  return null;
}
