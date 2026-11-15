"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Interruptor, Segmentado } from "@/components/ui/controles";
import { MODELOS } from "@/lib/modelos";
import { useAcao } from "@/lib/use-acao";
import { novaSimulacao } from "./actions";

export function NovaSimulacao({ gestor, modeloPadrao, pergunta }: { gestor: boolean; modeloPadrao: string; pergunta: string }) {
  const { onSubmit, erros, pendente } = useAcao(novaSimulacao);
  const [cenario, setCenario] = useState<"novo" | "pedido">("novo");
  const [gravar, setGravar] = useState(false);
  const conhecido = MODELOS.some((m) => m.id === modeloPadrao);

  return (
    <Cartao>
      <div className="mb-4 flex items-center gap-2">
        <FlaskConical className="size-5 text-marca-forte" aria-hidden />
        <h2 className="text-lg font-semibold text-texto">Nova simulação</h2>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <input type="hidden" name="pergunta" value={pergunta} />
        <Segmentado
          rotulo="Quem é o cliente"
          valor={cenario}
          aoMudar={setCenario}
          opcoes={[
            { valor: "novo", rotulo: "Cliente novo" },
            { valor: "pedido", rotulo: "Pedido que já está no CRM" },
          ]}
        />
        {cenario === "pedido" && (
          <Campo rotulo="Código do pedido" nome="codigo" erro={erros.codigo} ajuda="O código que aparece no CRM e na mensagem do site (Ref. XK4A).">
            {(p) => <Entrada {...p} placeholder="XK4A" maxLength={10} className="max-w-40 uppercase" autoComplete="off" />}
          </Campo>
        )}
        <Campo rotulo="Modelo da IA" nome="modelo" ajuda="Para comparar modelos. O padrão é o escolhido em Integrações.">
          {(p) => (
            <Selecao {...p} defaultValue={modeloPadrao}>
              {!conhecido && <option value={modeloPadrao}>{modeloPadrao} (padrão)</option>}
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                  {m.id === modeloPadrao ? " (padrão)" : ""}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        {gestor && (
          <>
            <input type="hidden" name="gravar_crm" value={gravar ? "sim" : "nao"} />
            <Interruptor
              ligado={gravar}
              onClick={() => setGravar((v) => !v)}
              rotulo={
                <span>
                  Gravar no CRM de verdade
                  <span className="block text-sm font-normal text-texto-2">
                    Desligado (recomendado): só lê o CRM. Ligado: cria um pedido de teste e grava tudo, como o agente real.
                  </span>
                </span>
              }
            />
          </>
        )}
        {pergunta && (
          <p className="rounded-xl bg-info-suave p-3 text-sm text-info">
            A pergunta “{pergunta}” vai aparecer pronta para enviar.
          </p>
        )}
        <Botao type="submit" carregando={pendente}>
          Começar
        </Botao>
      </form>
    </Cartao>
  );
}
