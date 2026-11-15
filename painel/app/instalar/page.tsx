import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TelaAuth } from "@/components/tela-auth";
import { precisaInstalar } from "@/lib/banco/pessoas.ts";
import { banco } from "@/lib/servidor";
import { FormInstalar } from "./form-instalar";

export const metadata: Metadata = { title: "Instalar o painel" };

/** Primeiro acesso: cria o gestor. Só aparece enquanto o painel não tem nenhuma pessoa. */
export default async function PaginaInstalar() {
  await connection(); // sempre na hora (lê o banco), nunca uma página pronta do build
  if (!(await precisaInstalar(await banco()))) redirect("/login");
  return (
    <TelaAuth>
      <h1 className="text-lg font-semibold text-texto">Primeiro acesso</h1>
      <p className="mt-1 text-sm text-texto-2">
        Crie o login do <strong>gestor</strong>. Você vai precisar do <strong>código de instalação</strong> que veio com o painel.
      </p>
      <FormInstalar />
    </TelaAuth>
  );
}
