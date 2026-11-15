"use client";

import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { definirSenha } from "@/lib/auth/acoes";
import { useAcao } from "@/lib/use-acao";

export function FormSenha({ codigo }: { codigo: string }) {
  const { estado, onSubmit, pendente } = useAcao(definirSenha, { toast: false });
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      <input type="hidden" name="codigo" value={codigo} />
      <Campo rotulo="Nova senha" nome="senha" erro={estado.erros?.senha} ajuda="Pelo menos 10 caracteres, com letras e números.">
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" required minLength={10} />}
      </Campo>
      <Campo rotulo="Repita a senha" nome="confirmacao" erro={estado.erros?.confirmacao}>
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" required />}
      </Campo>
      {estado.mensagem && !estado.erros && (
        <p role="alert" className="rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" carregando={pendente} className="w-full">
        Salvar senha e entrar
      </Botao>
    </form>
  );
}
