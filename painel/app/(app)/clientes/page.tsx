import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { listarClientes } from "@/lib/banco/clientes.ts";
import { atorAtual, banco } from "@/lib/servidor";
import { ListaClientes } from "./lista-clientes";

export const metadata: Metadata = { title: "Clientes" };

/** ESTÚDIO ▸ CLIENTES: só o dono da plataforma (lib/banco/clientes.ts confere). */
export default async function PaginaClientes() {
  const ator = await atorAtual();
  if (!ator?.dono) redirect("/");
  const lista = await listarClientes(await banco(), ator).catch(() => null);
  return (
    <>
      <CabecalhoPagina titulo="Clientes" descricao="Estúdio: as empresas atendidas, o plano contratado e o limite de gasto com a IA de cada uma." />
      {lista === null ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler os clientes.
        </Cartao>
      ) : (
        <ListaClientes clientes={lista} atual={ator.cliente} />
      )}
    </>
  );
}
