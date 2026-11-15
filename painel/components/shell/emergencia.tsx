"use client";

/**
 * BOTÃO DE EMERGÊNCIA (no topo de todas as telas) e a faixa vermelha de "agente pausado".
 * Qualquer pessoa ativa pausa; só o gestor religa (regra no banco).
 */
import { OctagonPause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { pausarAgente, retomarAgente } from "@/lib/acoes-operacao";
import { formatarDataHora } from "@/lib/formatar";
import type { OperacaoLinha } from "@/lib/tipos";

export function BotaoEmergencia({ pausado, gestor }: { pausado: boolean; gestor: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();
  const toast = useToast();

  if (pausado) {
    if (!gestor) return null;
    return (
      <Botao
        variante="secundario"
        className="min-h-10 px-3"
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await retomarAgente();
            if (r.ok) toast.sucesso(r.mensagem ?? "Agente religado.");
            else toast.erro(r.mensagem ?? "Não foi possível religar.");
          })
        }
      >
        <Play className="size-4" aria-hidden />
        <span className="hidden sm:inline">Religar agente</span>
      </Botao>
    );
  }

  return (
    <>
      <Botao variante="perigo" className="min-h-10 px-3" onClick={() => setAberto(true)} aria-label="Pausar o agente (emergência)">
        <OctagonPause className="size-4" aria-hidden />
        <span className="hidden sm:inline">Pausar agente</span>
      </Botao>
      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Pausar o agente inteiro?"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await pausarAgente(motivo);
                  if (r.ok) {
                    toast.sucesso(r.mensagem ?? "Agente pausado.");
                    setAberto(false);
                    setMotivo("");
                  } else toast.erro(r.mensagem ?? "Não foi possível pausar.");
                })
              }
            >
              <OctagonPause className="size-4" aria-hidden /> Pausar agora
            </Botao>
          </>
        }
      >
        <p className="text-sm text-texto-2">
          O agente para de responder <b>todos</b> os clientes na hora. As mensagens continuam sendo registradas no CRM e a
          equipe atende pelo WhatsApp. {gestor ? "Você" : "Só o gestor"} pode religar depois.
        </p>
        <Campo rotulo="Motivo (opcional)" nome="motivo" className="mt-4">
          {(p) => (
            <AreaTexto {...p} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: respondeu um preço errado" />
          )}
        </Campo>
      </Modal>
    </>
  );
}

export function FaixaPausado({ operacao, gestor }: { operacao: OperacaoLinha; gestor: boolean }) {
  return (
    <div role="alert" className="border-b border-perigo/30 bg-perigo-suave px-4 py-3 text-sm text-perigo sm:px-6">
      <p className="font-semibold">
        <OctagonPause className="mr-1 inline size-4 align-[-3px]" aria-hidden /> Agente PAUSADO: ninguém está recebendo respostas
        automáticas.
      </p>
      <p className="mt-0.5">
        Pausado por {operacao.pausado_por ?? "alguém da equipe"}
        {operacao.pausado_em ? ` em ${formatarDataHora(operacao.pausado_em)}` : ""}
        {operacao.motivo ? ` · Motivo: ${operacao.motivo}` : ""}.{" "}
        {gestor ? "Use o botão “Religar agente” no topo quando estiver tudo certo." : "Só o gestor pode religar."}
      </p>
    </div>
  );
}
