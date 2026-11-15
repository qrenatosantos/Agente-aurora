import type { Metadata } from "next";
import { connection } from "next/server";
import { TelaAuth } from "@/components/tela-auth";
import { FormSenha } from "./form-senha";

export const metadata: Metadata = { title: "Criar senha" };

/** Link gerado pelo gestor em Equipe: a pessoa cria (ou troca) a própria senha. Vale 48 h e uma vez só. */
export default async function PaginaSenha({ params }: { params: Promise<{ codigo: string }> }) {
  await connection(); // sempre na hora (lê o banco), nunca uma página pronta do build
  const { codigo } = await params;
  return (
    <TelaAuth>
      <h1 className="text-lg font-semibold text-texto">Criar sua senha</h1>
      <p className="mt-1 text-sm text-texto-2">Escolha uma senha para entrar no painel. Se o link não valer mais, peça um novo ao gestor.</p>
      <FormSenha codigo={codigo} />
    </TelaAuth>
  );
}
