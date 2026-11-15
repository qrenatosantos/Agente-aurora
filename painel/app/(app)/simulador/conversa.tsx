"use client";

import { AlertTriangle, BookOpen, ChevronDown, Database, Eye, Filter, PencilLine, SendHorizonal, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { useConfirmar } from "@/components/ui/confirmar";
import { useToast } from "@/components/ui/toast";
import type { PassoRastro } from "@/lib/nucleo/tipos.ts";
import type { MensagemSimulacao, SimulacaoLinha } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { apagarSimulacao, enviarMensagem } from "./actions";

const NOMES_CAMPOS: Record<string, string> = {
  tipo: "Evento",
  nome: "Nome",
  data: "Data",
  mes_previsto: "Mês previsto",
  hora_inicio: "Início",
  duracao_horas: "Horas",
  cidade: "Cidade",
  local: "Local",
  convidados: "Convidados",
  pacote: "Pacote",
  linha: "Linha",
  preferencias: "Preferências",
  observacoes: "Observações",
  quer_ajuda_pacote: "Quer ajuda com o pacote",
};

const EFEITOS: Record<string, { rotulo: string; icone: typeof Eye; cor: "info" | "ok" | "alerta" | "neutro" }> = {
  leitura: { rotulo: "leu o CRM", icone: Eye, cor: "info" },
  simulada: { rotulo: "gravaria no CRM (simulado)", icone: PencilLine, cor: "alerta" },
  gravacao: { rotulo: "gravou no CRM", icone: Database, cor: "ok" },
  nenhum: { rotulo: "sem efeito", icone: Eye, cor: "neutro" },
};

const TIPOS_EVENTO: Record<string, string> = { casamento: "Casamento", "15_anos": "15 anos", aniversario: "Aniversário", formatura: "Formatura", empresa: "Evento de empresa", outro: "Outro" };

function valorCampo(v: unknown, campo?: string) {
  if (campo === "tipo" && typeof v === "string") return TIPOS_EVENTO[v] ?? v;
  if (campo === "data" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  if (campo === "mes_previsto" && typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  if (campo === "duracao_horas") return `${v} h`;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function Rastro({ passos, uso }: { passos: PassoRastro[]; uso?: MensagemSimulacao["uso"] }) {
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-borda bg-fundo p-3 text-left text-xs text-texto">
      {passos.length === 0 && <p className="text-texto-2">Respondeu só com as instruções e o conhecimento, sem consultar o CRM.</p>}
      {passos.map((p, i) => {
        const ef = p.efeito ? EFEITOS[p.efeito] : null;
        const Icone = p.tipo === "regra" ? ShieldCheck : p.tipo === "filtro" ? Filter : p.tipo === "aviso" ? AlertTriangle : (ef?.icone ?? Eye);
        return (
          <details key={i} className="rounded-lg bg-superficie p-2">
            <summary className="flex cursor-pointer list-none items-start gap-2">
              <Icone className="mt-0.5 size-4 shrink-0 text-texto-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <b>{p.nome.replaceAll("_", " ")}</b>
                {ef && (
                  <Selo className="ml-2" cor={ef.cor}>
                    {ef.rotulo}
                  </Selo>
                )}
                {p.detalhe && <span className="block text-texto-2">{p.detalhe}</span>}
                {p.erro && <span className="block text-perigo">Erro: {p.erro}</span>}
              </span>
              <ChevronDown className="size-4 shrink-0 text-texto-2" aria-hidden />
            </summary>
            {(p.argumentos !== undefined || p.resultado !== undefined) && (
              <pre className="mt-2 max-h-56 overflow-auto rounded bg-superficie-2 p-2 text-[11px] whitespace-pre-wrap">
                {p.argumentos !== undefined && `Pedido: ${JSON.stringify(p.argumentos, null, 2)}\n`}
                {p.resultado !== undefined && `Resposta: ${JSON.stringify(p.resultado, null, 2)}`}
              </pre>
            )}
          </details>
        );
      })}
      {uso && uso.chamadas > 0 && (
        <p className="text-texto-2">
          IA: {uso.chamadas} chamada(s) ao {uso.modelo} · {uso.entrada.toLocaleString("pt-BR")} tokens lidos ({uso.cache.toLocaleString("pt-BR")} em cache) ·{" "}
          {uso.saida.toLocaleString("pt-BR")} escritos · {uso.custo_usd === null ? "custo desconhecido" : `US$ ${uso.custo_usd.toFixed(5)}`}
        </p>
      )}
    </div>
  );
}

function Balao({ m }: { m: MensagemSimulacao }) {
  const [aberto, setAberto] = useState(false);
  const temRastro = Boolean(m.rastro);
  if (m.papel === "sistema") {
    return (
      <li className="mx-auto max-w-md text-center">
        <p className="inline-block rounded-xl bg-superficie-2 px-3 py-2 text-xs text-texto-2">{m.texto}</p>
        {temRastro && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="mt-1 block w-full text-xs font-semibold text-marca-forte">
            {aberto ? "Esconder detalhes" : "Ver detalhes"}
          </button>
        )}
        {aberto && <Rastro passos={m.rastro ?? []} uso={m.uso} />}
      </li>
    );
  }
  const cliente = m.papel === "cliente";
  return (
    <li className={cn("flex", cliente ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] sm:max-w-[75%]", cliente && "text-right")}>
        <p className="mb-0.5 text-[11px] text-texto-2">{cliente ? "Cliente (você)" : "Agente"}</p>
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm whitespace-pre-wrap",
            cliente ? "rounded-br-sm bg-marca text-marca-texto" : "rounded-bl-sm border border-borda bg-superficie text-texto",
          )}
        >
          {m.texto}
        </div>
        {temRastro && (
          <>
            <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="mt-1 block text-xs font-semibold text-marca-forte">
              {aberto ? "Esconder" : "Por que respondeu assim?"}
            </button>
            {aberto && <Rastro passos={m.rastro ?? []} uso={m.uso} />}
          </>
        )}
      </div>
    </li>
  );
}

export function Conversa({ simulacao, perguntaInicial }: { simulacao: SimulacaoLinha; perguntaInicial: string }) {
  const [texto, setTexto] = useState(perguntaInicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const confirmar = useConfirmar();
  const router = useRouter();
  const e = simulacao.estado;
  const festa = Object.entries(e?.evento ?? {}).filter(([k, v]) => k in NOMES_CAMPOS && v !== null && v !== "" && !(Array.isArray(v) && !v.length));

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [simulacao.mensagens.length, enviando]);

  function enviar() {
    const t = texto.trim();
    if (!t || pendente) return;
    setEnviando(t);
    setTexto("");
    iniciar(async () => {
      const r = await enviarMensagem(simulacao.id, t);
      if (!r.ok) {
        toast.erro(r.mensagem ?? "Não foi possível enviar.");
        setTexto(t);
      }
      setEnviando(null);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
      <Cartao className="flex min-h-[28rem] flex-col p-0 sm:p-0">
        <div className="flex items-center justify-between gap-2 border-b border-borda px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-texto">{simulacao.titulo}</h2>
          <Botao
            variante="fantasma"
            className="min-h-10 px-2 text-perigo"
            aria-label="Apagar esta simulação"
            onClick={async () => {
              if (await confirmar({ titulo: "Apagar esta simulação?", perigo: true, textoConfirmar: "Apagar" })) {
                const r = await apagarSimulacao(simulacao.id);
                if (r.ok) router.push("/simulador");
                else toast.erro(r.mensagem ?? "");
              }
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Botao>
        </div>
        <ol className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {simulacao.mensagens.length === 0 && !enviando && (
            <li className="text-center text-sm text-texto-2">Escreva como se fosse um cliente chegando pelo WhatsApp. Ex.: “Oi! Queria um orçamento para o meu casamento.”</li>
          )}
          {simulacao.mensagens.map((m, i) => (
            <Balao key={i} m={m} />
          ))}
          {enviando && (
            <>
              <Balao m={{ papel: "cliente", texto: enviando, em: "" }} />
              <li className="text-sm text-texto-2">
                <span className="inline-flex items-center gap-2 rounded-2xl border border-borda bg-superficie px-3 py-2">digitando…</span>
              </li>
            </>
          )}
          <div ref={fim} />
        </ol>
        <form
          className="flex items-end gap-2 border-t border-borda p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            enviar();
          }}
        >
          <label htmlFor="msg-cliente" className="sr-only">
            Mensagem do cliente
          </label>
          <AreaTexto
            id="msg-cliente"
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                enviar();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Escreva como o cliente… (Enter envia, Shift+Enter pula linha)"
            className="min-h-11 resize-none"
          />
          <Botao type="submit" carregando={pendente} aria-label="Enviar" className="shrink-0">
            <SendHorizonal className="size-4" aria-hidden />
          </Botao>
        </form>
      </Cartao>

      <Cartao className="space-y-4 text-sm">
        <div>
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-texto">
            <UserRound className="size-4" aria-hidden /> Atendimento
          </h3>
          {e?.optout ? (
            <Selo cor="perigo">Cliente pediu para parar</Selo>
          ) : e?.atendimento === "humano" ? (
            <>
              <Selo cor="alerta">Com a equipe</Selo>
              {e.transferido_motivo && <p className="mt-1 text-xs text-texto-2">Motivo: {e.transferido_motivo}</p>}
            </>
          ) : (
            <Selo cor="ok">Com o agente</Selo>
          )}
          {e?.codigo && <p className="mt-1 text-xs text-texto-2">Pedido no CRM: {e.codigo}</p>}
        </div>
        <div>
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-texto">
            <BookOpen className="size-4" aria-hidden /> Festa {simulacao.gravar_crm ? "(no CRM)" : "(o que seria gravado)"}
          </h3>
          {festa.length ? (
            <dl className="space-y-1">
              {festa.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-texto-2">{NOMES_CAMPOS[k]}</dt>
                  <dd className="min-w-0 break-words text-texto">{valorCampo(v, k)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-texto-2">Nada ainda.</p>
          )}
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-texto">Proposta</h3>
          {e?.proposta ? (
            <p className="text-texto">
              {e.proposta.numero} · {e.proposta.status === "aguardando_aprovacao" ? "aguardando aprovação do André" : e.proposta.status}
              {e.proposta.preco_pendente && <span className="block text-xs text-texto-2">Preço a definir pela equipe.</span>}
            </p>
          ) : (
            <p className="text-texto-2">Nenhuma ainda.</p>
          )}
        </div>
      </Cartao>
    </div>
  );
}
