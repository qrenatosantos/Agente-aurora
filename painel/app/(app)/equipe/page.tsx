import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { listarEquipe } from "@/lib/banco/pessoas.ts";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { atorAtual, banco } from "@/lib/servidor";
import { ListaEquipe } from "./lista-equipe";

export const metadata: Metadata = { title: "Equipe" };

export default async function PaginaEquipe() {
  const { perfil } = await obterPerfil();
  if (!ehGestor(perfil)) redirect("/");
  const data = await listarEquipe(await banco(), await atorAtual()).catch(() => null);
  return (
    <>
      <CabecalhoPagina titulo="Equipe" descricao="Quem acessa o painel. Gestor: tudo. Atendente: consulta as telas e atende as conversas." />
      <Cartao className="mb-4 text-sm text-texto-2">
        <b className="text-texto">Como dar acesso a alguém:</b> 1) clique em “Nova pessoa” e cadastre o nome e o e-mail; 2) envie à
        pessoa o <b>link</b> que aparece (por WhatsApp, por exemplo). Ela cria a própria senha por ele. Esqueceu a senha? Use
        “Gerar link de senha” na linha da pessoa.
      </Cartao>
      {data === null ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler a equipe.
        </Cartao>
      ) : (
        <ListaEquipe pessoas={data} meuId={perfil?.id ?? ""} />
      )}
    </>
  );
}
