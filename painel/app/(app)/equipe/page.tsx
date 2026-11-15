import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { createClient } from "@/lib/supabase/server";
import { ListaEquipe } from "./lista-equipe";

export const metadata: Metadata = { title: "Equipe" };

export default async function PaginaEquipe() {
  const { perfil } = await obterPerfil();
  if (!ehGestor(perfil)) redirect("/");
  const supabase = await createClient();
  const { data, error } = await supabase.from("perfis").select("*").order("ativo", { ascending: false }).order("nome");
  return (
    <>
      <CabecalhoPagina titulo="Equipe" descricao="Quem acessa o painel. Gestor: tudo. Atendente: consulta as telas e, nas próximas fases, atende as conversas." />
      <Cartao className="mb-4 text-sm text-texto-2">
        <b className="text-texto">Como dar acesso a alguém:</b> 1) cadastre a pessoa aqui; 2) no Supabase do agente, abra
        Authentication ▸ Users ▸ Add user e crie o login com o <b>mesmo e-mail</b> (marque “Auto Confirm User”). No primeiro
        acesso o painel liga os dois sozinho. Quem entrar sem estar cadastrado aqui fica bloqueado.
      </Cartao>
      {error ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler a equipe.
        </Cartao>
      ) : (
        <ListaEquipe pessoas={data ?? []} meuId={perfil?.id ?? ""} />
      )}
    </>
  );
}
