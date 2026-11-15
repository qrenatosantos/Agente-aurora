"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/controles";
import { useAcao } from "@/lib/use-acao";
import type { AgenteConfig, Exemplo } from "@/lib/tipos";
import { salvarAgente } from "./actions";

export function FormAgente({ config, podeEditar }: { config: AgenteConfig; podeEditar: boolean }) {
  const { onSubmit, erros, pendente } = useAcao(salvarAgente);
  const [exemplos, setExemplos] = useState<Exemplo[]>(config.exemplos ?? []);
  const [audio, setAudio] = useState(config.transcrever_audio);

  const mudarExemplo = (i: number, campo: keyof Exemplo, valor: string) =>
    setExemplos((lista) => lista.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={!podeEditar} className="space-y-6">
        <Cartao className="space-y-4">
          <h2 className="text-lg font-semibold text-texto">Identidade</h2>
          <Campo rotulo="Nome do agente" nome="nome_agente" erro={erros.nome_agente} ajuda="Como ele se apresenta ao cliente.">
            {(p) => <Entrada {...p} defaultValue={config.nome_agente} maxLength={60} required />}
          </Campo>
          <Campo
            rotulo="Apresentação"
            nome="apresentacao"
            erro={erros.apresentacao}
            ajuda="Quem é a Aurora e o que o agente faz. Usado para ele entender o próprio papel."
          >
            {(p) => <AreaTexto {...p} defaultValue={config.apresentacao} maxLength={1000} rows={4} />}
          </Campo>
          <Campo rotulo="Tom de voz" nome="tom" erro={erros.tom} ajuda="Como ele escreve (ex.: elegante e acolhedor, mensagens curtas).">
            {(p) => <AreaTexto {...p} defaultValue={config.tom} maxLength={1000} rows={3} />}
          </Campo>
          <Campo
            rotulo="Saudação"
            nome="saudacao"
            erro={erros.saudacao}
            ajuda="Base para a primeira resposta. O aviso de atendimento automático é incluído sempre."
          >
            {(p) => <AreaTexto {...p} defaultValue={config.saudacao} maxLength={1000} rows={3} />}
          </Campo>
        </Cartao>

        <Cartao className="space-y-4">
          <h2 className="text-lg font-semibold text-texto">Instruções</h2>
          <Campo
            rotulo="O que o agente deve fazer"
            nome="instrucoes"
            erro={erros.instrucoes}
            ajuda="Escreva como se estivesse orientando um atendente novo. As regras fixas (no fim da página) valem acima disto."
          >
            {(p) => <AreaTexto {...p} defaultValue={config.instrucoes} maxLength={20000} rows={18} className="font-mono text-sm leading-relaxed" />}
          </Campo>
        </Cartao>

        <Cartao className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-texto">Exemplos de boas conversas</h2>
            <p className="text-sm text-texto-2">O agente imita o jeito destas respostas (não copia palavra por palavra).</p>
          </div>
          {erros.exemplos && (
            <p role="alert" className="text-sm text-perigo">
              {erros.exemplos}
            </p>
          )}
          <input type="hidden" name="exemplos" value={JSON.stringify(exemplos)} />
          {exemplos.length === 0 && <p className="text-sm text-texto-2">Nenhum exemplo ainda.</p>}
          <ol className="space-y-4">
            {exemplos.map((e, i) => (
              <li key={i} className="space-y-3 rounded-xl border border-borda p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-texto">Exemplo {i + 1}</p>
                  {podeEditar && (
                    <Botao
                      variante="fantasma"
                      className="min-h-10 px-2 text-perigo"
                      onClick={() => setExemplos((l) => l.filter((_, j) => j !== i))}
                      aria-label={`Remover exemplo ${i + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Botao>
                  )}
                </div>
                <Campo rotulo="Situação" nome={`ex-${i}-situacao`}>
                  {(p) => <Entrada {...p} value={e.situacao} maxLength={200} onChange={(ev) => mudarExemplo(i, "situacao", ev.target.value)} placeholder="Ex.: cliente pergunta o preço logo de cara" />}
                </Campo>
                <div className="grid gap-3 md:grid-cols-2">
                  <Campo rotulo="Cliente escreve" nome={`ex-${i}-cliente`}>
                    {(p) => <AreaTexto {...p} value={e.cliente} maxLength={1500} rows={3} onChange={(ev) => mudarExemplo(i, "cliente", ev.target.value)} />}
                  </Campo>
                  <Campo rotulo="Agente responde" nome={`ex-${i}-agente`}>
                    {(p) => <AreaTexto {...p} value={e.agente} maxLength={1500} rows={3} onChange={(ev) => mudarExemplo(i, "agente", ev.target.value)} />}
                  </Campo>
                </div>
              </li>
            ))}
          </ol>
          {podeEditar && exemplos.length < 50 && (
            <Botao variante="secundario" onClick={() => setExemplos((l) => [...l, { situacao: "", cliente: "", agente: "" }])}>
              <Plus className="size-4" aria-hidden /> Adicionar exemplo
            </Botao>
          )}
        </Cartao>

        <Cartao className="space-y-4">
          <h2 className="text-lg font-semibold text-texto">Comportamento</h2>
          <Campo
            rotulo="Esperar antes de responder (segundos)"
            nome="espera_segundos"
            erro={erros.espera_segundos}
            ajuda="Junta as mensagens que o cliente manda em sequência antes de responder. Sugestão: 8."
          >
            {(p) => <Entrada {...p} type="number" inputMode="numeric" min={2} max={30} defaultValue={config.espera_segundos} className="max-w-32" />}
          </Campo>
          <input type="hidden" name="transcrever_audio" value={audio ? "sim" : "nao"} />
          <Interruptor
            ligado={audio}
            onClick={() => setAudio((v) => !v)}
            rotulo={
              <span>
                Ouvir áudios
                <span className="block text-sm font-normal text-texto-2">Transcreve o áudio do cliente e responde em texto. O arquivo não fica guardado.</span>
              </span>
            }
          />
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
