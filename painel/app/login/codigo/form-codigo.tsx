"use client";

import { Smartphone } from "lucide-react";
import Link from "next/link";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { confirmarCodigo } from "@/lib/auth/acoes";
import { useAcao } from "@/lib/use-acao";

export function FormCodigo({ nome, next }: { nome: string; next: string }) {
  const { estado, onSubmit, pendente } = useAcao(confirmarCodigo, { toast: false });
  return (
    <div>
      <h1 className="text-lg font-semibold text-texto">Olá, {nome.split(" ")[0]}!</h1>
      <p className="mt-1 flex gap-2 text-sm text-texto-2">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        Abra o aplicativo autenticador do seu celular e digite o código de 6 números.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next} />
        <Campo rotulo="Código" nome="codigo" erro={estado.erros?.codigo}>
          {(p) => <Entrada {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" autoFocus className="text-center font-mono text-lg tracking-widest" />}
        </Campo>
        {estado.mensagem && !estado.erros && (
          <p role="alert" className="rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
            {estado.mensagem}
          </p>
        )}
        <Botao type="submit" carregando={pendente} className="w-full">
          Confirmar
        </Botao>
      </form>
      <Link href="/login" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-marca-forte hover:underline">
        Voltar e entrar de novo
      </Link>
    </div>
  );
}
