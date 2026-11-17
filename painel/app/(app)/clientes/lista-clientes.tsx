"use client";

import { Building2, ExternalLink, Pause, Pencil, Play, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { EntradaMoeda, valorCampo } from "@/components/ui/controles";
import { useConfirmar } from "@/components/ui/confirmar";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ResumoCliente, Situacao } from "@/lib/banco/clientes.ts";
import { formatarMoeda } from "@/lib/formatar";
import { useAcao } from "@/lib/use-acao";
import { abrirCliente, mudarSituacao, salvarCliente } from "./actions";

const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;

export function ListaClientes({ clientes, atual }: { clientes: ResumoCliente[]; atual: string | null }) {
  const [editando, setEditando] = useState<ResumoCliente | "novo" | null>(null);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const confirmar = useConfirmar();
  const router = useRouter();

  const abrir = (c: ResumoCliente) =>
    iniciar(async () => {
      const r = await abrirCliente(c.id);
      if (r.ok) {
        router.push("/");
        router.refresh();
      }
      else toast.erro(r.mensagem ?? "Não foi possível abrir.");
    });

  const situacao = async (c: ResumoCliente, nova: Situacao) => {
    const perguntas: Record<Situacao, { titulo: string; mensagem: string; texto: string; perigo?: boolean }> = {
      ativo: { titulo: `Reativar ${c.nome}?`, mensagem: "O agente volta a responder (se o botão de emergência dele estiver desligado) e a equipe volta a entrar.", texto: "Reativar" },
      pausado: { titulo: `Pausar ${c.nome}?`, mensagem: "O agente deste cliente para de responder todo mundo. A equipe continua entrando no painel.", texto: "Pausar", perigo: true },
      encerrado: { titulo: `Encerrar ${c.nome}?`, mensagem: "O agente para e a equipe do cliente perde o acesso. Nada é apagado: dá para reativar depois.", texto: "Encerrar", perigo: true },
    };
    const p = perguntas[nova];
    if (!(await confirmar({ titulo: p.titulo, mensagem: p.mensagem, textoConfirmar: p.texto, perigo: p.perigo }))) return;
    iniciar(async () => {
      const r = await mudarSituacao(c.id, nova);
      if (r.ok) toast.sucesso(r.mensagem ?? "Feito.");
      else toast.erro(r.mensagem ?? "Não foi possível.");
    });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Botao onClick={() => setEditando("novo")}>
          <Plus className="size-4" aria-hidden /> Novo cliente
        </Botao>
      </div>
      {clientes.length === 0 ? (
        <EstadoVazio icone={Building2} titulo="Nenhum cliente ainda" descricao="Crie o primeiro cliente para configurar o agente dele." />
      ) : (
        <ul className="space-y-3">
          {clientes.map((c) => {
            const pct = c.limite_mensal_usd > 0 ? Math.min(100, (c.gasto_mes_usd / c.limite_mensal_usd) * 100) : 0;
            return (
              <li key={c.id}>
                <Cartao className="space-y-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                      style={{ background: c.marca.principal ?? "#1D4E89" }}
                      aria-hidden
                    >
                      {c.nome.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-texto">
                        {c.nome} <span className="text-sm font-normal text-texto-2">({c.id})</span>
                      </p>
                      <p className="text-sm text-texto-2">
                        Agente: {c.agente || "—"} · Equipe: {c.equipe} {c.equipe === 1 ? "pessoa" : "pessoas"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.situacao === "ativo" && <Selo cor="ok">Ativo</Selo>}
                      {c.situacao === "pausado" && <Selo cor="alerta">Pausado</Selo>}
                      {c.situacao === "encerrado" && <Selo cor="perigo">Encerrado</Selo>}
                      {c.pausado_agente && c.situacao === "ativo" && <Selo cor="alerta">Botão de emergência ligado</Selo>}
                      {c.id === atual && <Selo cor="marca">Aberto agora</Selo>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-texto-2">Plano</dt>
                      <dd className="font-medium text-texto">{c.plano_nome ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-texto-2">Valor por mês</dt>
                      <dd className="font-medium text-texto num">{c.plano_valor_brl !== null ? formatarMoeda(c.plano_valor_brl) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-texto-2">Gasto da IA no mês</dt>
                      <dd className="font-medium text-texto num">
                        {usd(c.gasto_mes_usd)} de {usd(c.limite_mensal_usd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-texto-2">Fechamento</dt>
                      <dd className="font-medium text-texto">dia {c.dia_fechamento}</dd>
                    </div>
                  </dl>
                  <div className="h-2 overflow-hidden rounded-full bg-superficie-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto do mês">
                    <div className={pct >= 80 ? "h-full bg-alerta" : "h-full bg-marca"} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.id !== atual && c.situacao !== "encerrado" && (
                      <Botao variante="secundario" onClick={() => abrir(c)} disabled={pendente}>
                        <ExternalLink className="size-4" aria-hidden /> Abrir
                      </Botao>
                    )}
                    <Botao variante="fantasma" onClick={() => setEditando(c)}>
                      <Pencil className="size-4" aria-hidden /> Editar
                    </Botao>
                    {c.situacao === "ativo" && (
                      <Botao variante="fantasma" onClick={() => situacao(c, "pausado")} disabled={pendente}>
                        <Pause className="size-4" aria-hidden /> Pausar
                      </Botao>
                    )}
                    {c.situacao !== "ativo" && (
                      <Botao variante="fantasma" onClick={() => situacao(c, "ativo")} disabled={pendente}>
                        <Play className="size-4" aria-hidden /> Reativar
                      </Botao>
                    )}
                    {c.situacao !== "encerrado" && (
                      <Botao variante="fantasma" onClick={() => situacao(c, "encerrado")} disabled={pendente}>
                        <Power className="size-4" aria-hidden /> Encerrar
                      </Botao>
                    )}
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
      {editando && <EditorCliente cliente={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function EditorCliente({ cliente, aoFechar }: { cliente: ResumoCliente | null; aoFechar: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const { onSubmit, erros, pendente } = useAcao(salvarCliente, { aoSucesso: aoFechar });
  const [apelido, setApelido] = useState(cliente?.id ?? "");
  const [apelidoMexido, setApelidoMexido] = useState(Boolean(cliente));
  const sugerir = (nome: string) =>
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30)
      .replace(/-+$/g, "");

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={cliente ? `Editar ${cliente.nome}` : "Novo cliente"}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao carregando={pendente} onClick={() => form.current?.requestSubmit()}>
            Salvar
          </Botao>
        </>
      }
    >
      <form ref={form} onSubmit={onSubmit} noValidate className="space-y-4">
        {cliente && <input type="hidden" name="editar" value="1" />}
        <Campo rotulo="Nome da empresa" nome="nome" erro={erros.nome}>
          {(p) => <Entrada {...p} defaultValue={cliente?.nome ?? ""} maxLength={80} onChange={(e) => !apelidoMexido && setApelido(sugerir(e.target.value))} />}
        </Campo>
        <Campo rotulo="Apelido (curto, não muda depois)" nome="id" erro={erros.id} ajuda="Letras minúsculas, números e hífen. Ex.: clinica-sorriso.">
          {(p) => (
            <Entrada
              {...p}
              value={apelido}
              readOnly={Boolean(cliente)}
              maxLength={30}
              onChange={(e) => {
                setApelidoMexido(true);
                setApelido(e.target.value.toLowerCase());
              }}
            />
          )}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Plano contratado" nome="plano_nome" erro={erros.plano_nome}>
            {(p) => <Entrada {...p} defaultValue={cliente?.plano_nome ?? ""} maxLength={60} placeholder="Ex.: Básico" />}
          </Campo>
          <Campo rotulo="Valor por mês" nome="plano_valor_brl" erro={erros.plano_valor_brl}>
            {(p) => <EntradaMoeda {...p} defaultValue={valorCampo(cliente?.plano_valor_brl)} />}
          </Campo>
          <Campo rotulo="Limite de gasto da IA por mês (US$)" nome="limite_mensal_usd" erro={erros.limite_mensal_usd} ajuda="Ao chegar nele, o agente para (pode mudar depois).">
            {(p) => <Entrada {...p} type="number" min={1} max={10000} step="1" inputMode="decimal" defaultValue={cliente?.limite_mensal_usd ?? 30} />}
          </Campo>
          <Campo rotulo="Dia de fechamento" nome="dia_fechamento" erro={erros.dia_fechamento}>
            {(p) => <Entrada {...p} type="number" min={1} max={28} inputMode="numeric" defaultValue={cliente?.dia_fechamento ?? 1} />}
          </Campo>
        </div>
        <fieldset className="space-y-4 rounded-xl border border-borda p-4">
          <legend className="px-1 text-sm font-semibold text-texto">Responsável no cliente</legend>
          <Campo rotulo="Nome" nome="responsavel_nome" erro={erros.responsavel_nome}>
            {(p) => <Entrada {...p} defaultValue={cliente?.responsavel_nome ?? ""} maxLength={80} />}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="E-mail" nome="responsavel_email" erro={erros.responsavel_email}>
              {(p) => <Entrada {...p} type="email" inputMode="email" defaultValue={cliente?.responsavel_email ?? ""} />}
            </Campo>
            <Campo rotulo="Telefone" nome="responsavel_telefone" erro={erros.responsavel_telefone}>
              {(p) => <Entrada {...p} type="tel" inputMode="tel" defaultValue={cliente?.responsavel_telefone ?? ""} maxLength={30} />}
            </Campo>
          </div>
        </fieldset>
        <fieldset className="space-y-4 rounded-xl border border-borda p-4">
          <legend className="px-1 text-sm font-semibold text-texto">Marca (cores e logo do painel deste cliente)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Cor principal" nome="cor_principal" erro={erros.cor_principal} ajuda="Ex.: #021938">
              {(p) => <Entrada {...p} defaultValue={cliente?.marca.principal ?? ""} placeholder="#1D4E89" maxLength={7} />}
            </Campo>
            <Campo rotulo="Cor de destaque" nome="cor_destaque" erro={erros.cor_destaque} ajuda="Ex.: #C6A86A">
              {(p) => <Entrada {...p} defaultValue={cliente?.marca.destaque ?? ""} placeholder="#F4A259" maxLength={7} />}
            </Campo>
          </div>
          <Campo rotulo="Logo (endereço da imagem)" nome="logo" erro={erros.logo} ajuda="Opcional. Sem logo, aparecem as iniciais do nome.">
            {(p) => <Entrada {...p} defaultValue={cliente?.marca.logo ?? ""} placeholder="https://…" />}
          </Campo>
        </fieldset>
        <Campo rotulo="Observações" nome="observacoes" erro={erros.observacoes}>
          {(p) => <AreaTexto {...p} defaultValue={cliente?.observacoes ?? ""} rows={3} maxLength={2000} />}
        </Campo>
      </form>
    </Modal>
  );
}
