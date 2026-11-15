"use client";

import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { instalar } from "@/lib/auth/acoes";
import { useAcao } from "@/lib/use-acao";

export function FormInstalar() {
  const { estado, onSubmit, pendente } = useAcao(instalar, { toast: false });
  const e = estado.erros ?? {};
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      <Campo rotulo="Código de instalação" nome="codigo" erro={e.codigo}>
        {(p) => <Entrada {...p} autoComplete="off" required />}
      </Campo>
      <Campo rotulo="Seu nome" nome="nome" erro={e.nome}>
        {(p) => <Entrada {...p} autoComplete="name" required />}
      </Campo>
      <Campo rotulo="E-mail" nome="email" erro={e.email}>
        {(p) => <Entrada {...p} type="email" autoComplete="email" inputMode="email" required />}
      </Campo>
      <Campo rotulo="Senha" nome="senha" erro={e.senha} ajuda="Pelo menos 10 caracteres, com letras e números.">
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" required minLength={10} />}
      </Campo>
      <Campo rotulo="Repita a senha" nome="confirmacao" erro={e.confirmacao}>
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" required />}
      </Campo>
      {estado.mensagem && !estado.erros && (
        <p role="alert" className="rounded-xl bg-perigo-suave p-3 text-sm text-perigo">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" carregando={pendente} className="w-full">
        Criar o gestor e entrar
      </Botao>
    </form>
  );
}
