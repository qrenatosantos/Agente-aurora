"use client";

import { ArrowLeft, KeyRound } from "lucide-react";
import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { entrar } from "@/lib/auth/acoes";
import { useAcao } from "@/lib/use-acao";

export function FormLogin({ next }: { next: string }) {
  const [esqueci, setEsqueci] = useState(false);
  const { estado, onSubmit, pendente } = useAcao(entrar, { toast: false });

  if (esqueci) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-texto">Esqueci minha senha</h1>
        <div className="mt-4 flex gap-3 rounded-xl bg-marca-suave p-4 text-sm text-texto">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-marca-forte" aria-hidden />
          <p>
            Peça ao gestor do painel um <strong>link para criar uma nova senha</strong> (tela Equipe ▸ sua linha ▸ “Gerar link de
            senha”). O link vale por 48 horas.
          </p>
        </div>
        <button type="button" onClick={() => setEsqueci(false)} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca-forte hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Voltar para o login
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-texto">Entrar</h1>
      <p className="mt-1 text-sm text-texto-2">Use o seu e-mail e a senha que você criou.</p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Campo rotulo="E-mail" nome="email" erro={estado.erros?.email}>
          {(p) => <Entrada {...p} type="email" autoComplete="email" inputMode="email" required />}
        </Campo>
        <Campo rotulo="Senha" nome="senha" erro={estado.erros?.senha}>
          {(p) => <Entrada {...p} type="password" autoComplete="current-password" required />}
        </Campo>
        {estado.mensagem && !estado.erros && (
          <p role="alert" className="rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
            {estado.mensagem}
          </p>
        )}
        <Botao type="submit" carregando={pendente} className="w-full">
          {pendente ? "Entrando..." : "Entrar"}
        </Botao>
      </form>
      <button type="button" onClick={() => setEsqueci(true)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-marca-forte hover:underline">
        Esqueci minha senha
      </button>
    </div>
  );
}
