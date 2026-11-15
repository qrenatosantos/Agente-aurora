import type { Metadata } from "next";
import { AvisoSoGestor } from "@/components/aviso-so-gestor";
import { CabecalhoPagina, Cartao } from "@/components/ui/cartao";
import { obterConfigAgente } from "@/lib/dados";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { FormTransferencia } from "./form-transferencia";

export const metadata: Metadata = { title: "Transferência e horários" };

export default async function PaginaTransferencia() {
  const [{ config, erro }, { perfil }] = await Promise.all([obterConfigAgente(), obterPerfil()]);
  const gestor = ehGestor(perfil);
  return (
    <>
      <CabecalhoPagina
        titulo="Transferência e horários"
        descricao="Quando o agente passa a conversa para uma pessoa, o horário da equipe e as mensagens padrão."
      />
      {!gestor && <AvisoSoGestor />}
      {erro || !config ? (
        <Cartao role="alert" className="text-sm text-perigo">
          Não foi possível ler a configuração do agente.
        </Cartao>
      ) : (
        <FormTransferencia config={config} podeEditar={gestor} />
      )}
    </>
  );
}
