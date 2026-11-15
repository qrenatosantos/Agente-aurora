"use client";

/**
 * Mostrado se uma página logada der erro inesperado (em vez da tela branca).
 * "Tentar de novo" RECARREGA a página inteira: o erro mais comum é a tela ter ficado aberta durante uma
 * atualização do painel (o navegador ainda usa a versão antiga), e só recarregar resolve.
 */
import { AlertTriangle } from "lucide-react";
import { Botao } from "@/components/ui/botao";

export default function ErroPagina({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-borda bg-superficie px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-perigo-suave text-perigo">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-texto">Algo deu errado</h1>
      <p className="mt-1 max-w-sm text-sm text-texto-2">
        O painel pode ter sido atualizado enquanto esta tela estava aberta. Clique em “Recarregar” e tente de novo. Se o erro
        continuar, avise quem cuida do painel{error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <Botao className="mt-5" onClick={() => window.location.reload()}>
        Recarregar
      </Botao>
    </div>
  );
}
