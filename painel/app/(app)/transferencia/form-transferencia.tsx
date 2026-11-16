"use client";

import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/controles";
import { useAcao } from "@/lib/use-acao";
import type { AgenteConfig } from "@/lib/tipos";
import { salvarTransferencia } from "./actions";
import { DIAS, MENSAGENS } from "./textos";

export function FormTransferencia({ config, podeEditar }: { config: AgenteConfig; podeEditar: boolean }) {
  const { onSubmit, erros, pendente } = useAcao(salvarTransferencia);
  const [vinteQuatro, setVinteQuatro] = useState(config.agente_24h);
  const [abertos, setAbertos] = useState<Record<string, boolean>>(
    Object.fromEntries(DIAS.map((d) => [d.id, Boolean(config.horario_equipe?.[d.id])])),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={!podeEditar} className="space-y-6">
        <Cartao className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-texto">Gatilhos de transferência</h2>
            <p className="text-sm text-texto-2">
              Além das situações das regras fixas (pedido de desconto, reclamação, data lotada…), o agente passa para uma pessoa
              quando acontecer algo daqui.
            </p>
          </div>
          <Campo
            rotulo="Palavras ou frases (uma por linha)"
            nome="gatilhos_palavras"
            erro={erros.gatilhos_palavras}
            ajuda="Se a mensagem do cliente tiver uma delas (sem diferenciar maiúsculas ou acentos), transfere na hora, sem passar pela IA."
          >
            {(p) => <AreaTexto {...p} defaultValue={config.gatilhos_palavras.join("\n")} rows={6} />}
          </Campo>
          <Campo
            rotulo="Temas (um por linha)"
            nome="gatilhos_temas"
            erro={erros.gatilhos_temas}
            ajuda="Assuntos descritos com suas palavras. A IA avalia se a conversa entrou num deles."
          >
            {(p) => <AreaTexto {...p} defaultValue={config.gatilhos_temas.join("\n")} rows={5} />}
          </Campo>
          <Campo
            rotulo="Mensagens do cliente sem avanço"
            nome="max_msgs_sem_avanco"
            erro={erros.max_msgs_sem_avanco}
            ajuda="Se a conversa passar deste número de mensagens do cliente sem nenhum dado novo da festa, transfere. Sugestão: 8."
          >
            {(p) => <Entrada {...p} type="number" inputMode="numeric" min={3} max={50} defaultValue={config.max_msgs_sem_avanco} className="max-w-32" />}
          </Campo>
        </Cartao>

        <Cartao className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-texto">Lembretes da proposta</h2>
            <p className="text-sm text-texto-2">
              Depois que o link da proposta é enviado, a Cecília pergunta o que o cliente achou, uma vez só. Só entre 8h e 21h, e só
              enquanto a conversa ainda é gratuita (até 24 h depois da última mensagem do cliente). Se o cliente responder, aceitar ou
              for passado para uma pessoa, o lembrete é cancelado.
            </p>
          </div>
          <Campo rotulo="Abriu a proposta e não respondeu: esperar (minutos)" nome="retomada_aberta_min" erro={erros.retomada_aberta_min} ajuda="Sugestão: 30.">
            {(p) => <Entrada {...p} type="number" inputMode="numeric" min={10} max={720} defaultValue={config.retomada_aberta_min ?? 30} className="max-w-32" />}
          </Campo>
          <Campo rotulo="Ainda não abriu a proposta: esperar (minutos)" nome="retomada_nao_aberta_min" erro={erros.retomada_nao_aberta_min} ajuda="Sugestão: 120 (2 horas).">
            {(p) => <Entrada {...p} type="number" inputMode="numeric" min={30} max={1200} defaultValue={config.retomada_nao_aberta_min ?? 120} className="max-w-32" />}
          </Campo>
        </Cartao>

        <Cartao className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-texto">Horário da equipe</h2>
            <p className="text-sm text-texto-2">
              Quando uma pessoa da Aurora responde. Fora deste horário, o cliente transferido recebe a mensagem “fora do horário”.
            </p>
          </div>
          <input type="hidden" name="agente_24h" value={vinteQuatro ? "sim" : "nao"} />
          <Interruptor
            ligado={vinteQuatro}
            onClick={() => setVinteQuatro((v) => !v)}
            rotulo={
              <span>
                O agente atende 24 horas
                <span className="block text-sm font-normal text-texto-2">
                  Desligado: fora do horário da equipe o agente só envia a mensagem “fora do horário”.
                </span>
              </span>
            }
          />
          <ul className="divide-y divide-borda rounded-xl border border-borda">
            {DIAS.map((d) => {
              const h = config.horario_equipe?.[d.id];
              const aberto = abertos[d.id];
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 p-3">
                  <input type="hidden" name={`dia-${d.id}-aberto`} value={aberto ? "sim" : "nao"} />
                  <Interruptor
                    ligado={aberto}
                    onClick={() => setAbertos((a) => ({ ...a, [d.id]: !a[d.id] }))}
                    rotulo={<span className="w-20">{d.nome}</span>}
                    aria-label={`${d.nome}: equipe atende`}
                  />
                  {aberto ? (
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`dia-${d.id}-inicio`}>
                        {d.nome}: início
                      </label>
                      <Entrada id={`dia-${d.id}-inicio`} name={`dia-${d.id}-inicio`} type="time" defaultValue={h?.inicio ?? "09:00"} className="w-32" />
                      <span className="text-texto-2">às</span>
                      <label className="sr-only" htmlFor={`dia-${d.id}-fim`}>
                        {d.nome}: fim
                      </label>
                      <Entrada id={`dia-${d.id}-fim`} name={`dia-${d.id}-fim`} type="time" defaultValue={h?.fim ?? "18:00"} className="w-32" />
                    </div>
                  ) : (
                    <span className="text-sm text-texto-2">Fechado</span>
                  )}
                  {erros[`dia-${d.id}`] && (
                    <p role="alert" className="w-full text-sm text-perigo">
                      {erros[`dia-${d.id}`]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>

        <Cartao className="space-y-4">
          <h2 className="text-lg font-semibold text-texto">Mensagens padrão</h2>
          {MENSAGENS.map((m) => (
            <Campo key={m.id} rotulo={m.titulo} nome={`msg-${m.id}`} erro={erros[`msg-${m.id}`]} ajuda={m.ajuda}>
              {(p) => <AreaTexto {...p} defaultValue={config.mensagens?.[m.id] ?? ""} maxLength={1000} rows={3} />}
            </Campo>
          ))}
        </Cartao>
      </fieldset>

      {podeEditar && (
        <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
          <Botao type="submit" carregando={pendente} className="shadow-lg">
            Salvar (cria uma nova versão)
          </Botao>
        </div>
      )}
    </form>
  );
}
