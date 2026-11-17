"use client";

import { Bot, Check, CircleAlert, Copy, KeyRound, MessageCircle, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campo";
import { Cartao, Selo } from "@/components/ui/cartao";
import { useConfirmar } from "@/components/ui/confirmar";
import { Interruptor } from "@/components/ui/controles";
import { useToast } from "@/components/ui/toast";
import { formatarDataHora } from "@/lib/formatar";
import { MODELOS } from "@/lib/modelos";
import type { AgenteConfig, IntegracoesLinha, NomeSegredo, ResultadoTeste, SituacaoSegredo } from "@/lib/tipos";
import { useAcao } from "@/lib/use-acao";
import { apagarChave, gerarTokenVerificacao, salvarCrm, salvarOpenAI, salvarWhatsApp, testarConexao } from "./actions";

type Chaves = Partial<Record<NomeSegredo, SituacaoSegredo>>;

function Titulo({ icone: Icone, titulo, teste }: { icone: typeof Bot; titulo: string; teste: ResultadoTeste | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="grid size-10 place-items-center rounded-xl bg-marca-suave text-marca-forte">
          <Icone className="size-5" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-texto">{titulo}</h2>
      </div>
      {teste ? <Selo cor={teste.ok ? "ok" : "perigo"}>{teste.ok ? "Conectado" : "Com problema"}</Selo> : <Selo>Não testado</Selo>}
    </div>
  );
}

function ResultadoDoTeste({ teste }: { teste: ResultadoTeste | null }) {
  if (!teste) return null;
  return (
    <div role="status" className={`mt-3 flex gap-2 rounded-xl p-3 text-sm ${teste.ok ? "bg-ok-suave text-ok" : "bg-perigo-suave text-perigo"}`}>
      {teste.ok ? <Check className="size-4 shrink-0" aria-hidden /> : <CircleAlert className="size-4 shrink-0" aria-hidden />}
      <p>
        {teste.mensagem}
        {teste.em && <span className="block text-xs opacity-80">Último teste: {formatarDataHora(teste.em)}</span>}
      </p>
    </div>
  );
}

function BotaoTestar({ servico }: { servico: "crm" | "openai" | "whatsapp" }) {
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  return (
    <Botao
      variante="secundario"
      carregando={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await testarConexao(servico);
          (r.ok ? toast.sucesso : toast.erro)(r.mensagem ?? "");
        })
      }
    >
      <PlugZap className="size-4" aria-hidden /> Testar conexão
    </Botao>
  );
}

/** Campo de chave: nunca mostra o valor salvo, só o final. Vazio = manter a atual. */
function CampoChave({
  nome,
  rotulo,
  ajuda,
  chaves,
  erro,
  placeholder,
}: {
  nome: NomeSegredo;
  rotulo: string;
  ajuda?: string;
  chaves: Chaves;
  erro?: string;
  placeholder?: string;
}) {
  const salva = chaves[nome];
  const [pendente, iniciar] = useTransition();
  const confirmar = useConfirmar();
  const toast = useToast();
  return (
    <Campo
      rotulo={rotulo}
      nome={nome}
      erro={erro}
      ajuda={
        salva
          ? `Salva (termina em …${salva.final ?? "????"}), por ${salva.atualizado_por ?? "?"} em ${formatarDataHora(salva.atualizado_em)}. Deixe em branco para manter.`
          : ajuda
      }
    >
      {(p) => (
        <div className="flex gap-2">
          <Entrada {...p} type="password" autoComplete="off" spellCheck={false} placeholder={salva ? "•••••••• (manter a atual)" : placeholder} />
          {salva && (
            <Botao
              variante="fantasma"
              className="text-perigo"
              carregando={pendente}
              aria-label={`Apagar ${rotulo}`}
              onClick={async () => {
                if (await confirmar({ titulo: `Apagar ${rotulo.toLowerCase()}?`, mensagem: "O agente deixa de conseguir usar este serviço até uma nova chave ser salva.", perigo: true, textoConfirmar: "Apagar" })) {
                  iniciar(async () => {
                    const r = await apagarChave(nome);
                    (r.ok ? toast.sucesso : toast.erro)(r.mensagem ?? "");
                  });
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Botao>
          )}
        </div>
      )}
    </Campo>
  );
}

export function CartaoCrm({ integ, chaves }: { integ: IntegracoesLinha; chaves: Chaves }) {
  const { onSubmit, erros, pendente } = useAcao(salvarCrm, { aoSucesso: (_e, f) => f?.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = "")) });
  return (
    <Cartao>
      <Titulo icone={KeyRound} titulo="CRM do cliente" teste={integ.teste_crm} />
      <p className="mb-4 text-sm text-texto-2">
        No CRM, abra <b>Integrações ▸ Nova chave</b>, dê o nome “Agente SDR” e marque todas as permissões. A chave aparece uma
        única vez: copie e cole aqui.
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Campo rotulo="Endereço do CRM" nome="crm_url" erro={erros.crm_url} ajuda="Só o começo do endereço, sem /api.">
          {(p) => <Entrada {...p} type="url" inputMode="url" defaultValue={integ.crm_url ?? ""} placeholder="https://crm.aurorabartendersaraxa.com.br" />}
        </Campo>
        <CampoChave nome="crm_chave" rotulo="Chave do agente (aur_…)" chaves={chaves} erro={erros.crm_chave} placeholder="aur_…" />
        <CampoChave
          nome="crm_segredo_avisos"
          rotulo="Segredo dos avisos (webhook)"
          chaves={chaves}
          erro={erros.crm_segredo_avisos}
          ajuda="Aparece no CRM em Integrações ▸ Avisos, depois de cadastrar o endereço do agente (fase 4)."
        />
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" carregando={pendente}>
            Salvar
          </Botao>
          <BotaoTestar servico="crm" />
        </div>
      </form>
      <ResultadoDoTeste teste={integ.teste_crm} />
    </Cartao>
  );
}

export function CartaoOpenAI({ config, teste, chaves }: { config: AgenteConfig; teste: ResultadoTeste | null; chaves: Chaves }) {
  const { onSubmit, erros, pendente } = useAcao(salvarOpenAI, { aoSucesso: (_e, f) => f?.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = "")) });
  const conhecido = MODELOS.some((m) => m.id === config.modelo);
  const [escolha, setEscolha] = useState(conhecido ? config.modelo : "outro");
  const [parar, setParar] = useState(config.parar_no_limite);
  const info = MODELOS.find((m) => m.id === escolha);
  return (
    <Cartao>
      <Titulo icone={Bot} titulo="OpenAI (inteligência do agente)" teste={teste} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <CampoChave nome="openai_chave" rotulo="Chave da API (sk-…)" chaves={chaves} erro={erros.openai_chave} placeholder="sk-…" ajuda="platform.openai.com ▸ API keys ▸ Create new secret key." />
        <Campo rotulo="Modelo" nome="modelo-escolha" ajuda={info ? `${info.nota} Preço por 1 milhão de tokens: US$ ${info.entrada} entrada / US$ ${info.saida} saída.` : "Digite o nome exato do modelo, como aparece na documentação da OpenAI."}>
          {(p) => (
            <Selecao {...p} value={escolha} onChange={(e) => setEscolha(e.target.value)}>
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
              <option value="outro">Outro modelo…</option>
            </Selecao>
          )}
        </Campo>
        {escolha === "outro" ? (
          <Campo rotulo="Nome do modelo" nome="modelo" erro={erros.modelo}>
            {(p) => <Entrada {...p} defaultValue={conhecido ? "" : config.modelo} placeholder="ex.: gpt-6.1-terra" />}
          </Campo>
        ) : (
          <input type="hidden" name="modelo" value={escolha} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Limite de gasto por mês (US$)" nome="limite_mensal_usd" erro={erros.limite_mensal_usd} ajuda="Sugestão para o piloto: 30.">
            {(p) => <Entrada {...p} type="number" inputMode="decimal" min={1} max={10000} step="0.01" defaultValue={config.limite_mensal_usd} />}
          </Campo>
          <Campo rotulo="Avisar ao chegar em (%)" nome="alerta_pct" erro={erros.alerta_pct}>
            {(p) => <Entrada {...p} type="number" inputMode="numeric" min={10} max={100} defaultValue={config.alerta_pct} />}
          </Campo>
        </div>
        <input type="hidden" name="parar_no_limite" value={parar ? "sim" : "nao"} />
        <Interruptor
          ligado={parar}
          onClick={() => setParar((v) => !v)}
          rotulo={
            <span>
              Parar o agente ao atingir o limite
              <span className="block text-sm font-normal text-texto-2">As conversas novas passam para a equipe até o mês virar ou o limite subir.</span>
            </span>
          }
        />
        <p className="text-xs text-texto-2">
          Dica: defina também um limite no próprio painel da OpenAI (Settings ▸ Limits), como segunda trava. O gasto do mês aparece
          na Visão geral quando o agente estiver ligado.
        </p>
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" carregando={pendente}>
            Salvar
          </Botao>
          <BotaoTestar servico="openai" />
        </div>
      </form>
      <ResultadoDoTeste teste={teste} />
    </Cartao>
  );
}

export function CartaoWhatsApp({ integ, chaves }: { integ: IntegracoesLinha; chaves: Chaves }) {
  const { onSubmit, erros, pendente } = useAcao(salvarWhatsApp, { aoSucesso: (_e, f) => f?.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = "")) });
  const [token, setToken] = useState<string | null>(null);
  const [gerando, iniciar] = useTransition();
  const toast = useToast();
  const confirmar = useConfirmar();
  const verificacao = chaves.whatsapp_verify_token;

  return (
    <Cartao>
      <Titulo icone={MessageCircle} titulo="WhatsApp (Meta Cloud API)" teste={integ.teste_whatsapp} />
      <p className="mb-4 text-sm text-texto-2">
        Os dados ficam em developers.facebook.com ▸ seu app ▸ WhatsApp ▸ <b>Configuração da API</b>. Na fase 3 usamos o
        número de teste grátis da Meta.
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Identificação do número (Phone number ID)" nome="whatsapp_phone_number_id" erro={erros.whatsapp_phone_number_id}>
            {(p) => <Entrada {...p} inputMode="numeric" defaultValue={integ.whatsapp_phone_number_id ?? ""} />}
          </Campo>
          <Campo rotulo="Identificação da conta (WABA ID)" nome="whatsapp_waba_id" erro={erros.whatsapp_waba_id}>
            {(p) => <Entrada {...p} inputMode="numeric" defaultValue={integ.whatsapp_waba_id ?? ""} />}
          </Campo>
          <Campo rotulo="Número (como aparece para o cliente)" nome="whatsapp_numero" erro={erros.whatsapp_numero}>
            {(p) => <Entrada {...p} defaultValue={integ.whatsapp_numero ?? ""} placeholder="+55 34 9…" />}
          </Campo>
          <Campo rotulo="Versão da API da Meta" nome="whatsapp_graph_versao" erro={erros.whatsapp_graph_versao} ajuda="Só mude se a Meta pedir.">
            {(p) => <Entrada {...p} defaultValue={integ.whatsapp_graph_versao} />}
          </Campo>
        </div>
        <CampoChave nome="whatsapp_token" rotulo="Token de acesso (permanente)" chaves={chaves} erro={erros.whatsapp_token} ajuda="Token de “usuário do sistema” no Gerenciador de Negócios (não use o token temporário de 24 h)." />
        <CampoChave nome="whatsapp_app_secret" rotulo="Segredo do app (App Secret)" chaves={chaves} erro={erros.whatsapp_app_secret} ajuda="Configurações do app ▸ Básico. Serve para conferir que os avisos vêm mesmo da Meta." />
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" carregando={pendente}>
            Salvar
          </Botao>
          <BotaoTestar servico="whatsapp" />
        </div>
      </form>
      <ResultadoDoTeste teste={integ.teste_whatsapp} />

      <div className="mt-5 space-y-2 border-t border-borda pt-4">
        <h3 className="font-semibold text-texto">Token de verificação do webhook</h3>
        <p className="text-sm text-texto-2">
          A Meta pede um “token de verificação” ao cadastrar o endereço dos avisos (fase 3). Gere aqui, copie e cole lá. Ele
          aparece uma única vez.
          {verificacao && ` Já existe um (termina em …${verificacao.final ?? "????"}).`}
        </p>
        {token ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ok-suave p-3">
            <code className="min-w-0 flex-1 text-sm break-all text-ok">{token}</code>
            <Botao
              variante="secundario"
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                toast.sucesso("Copiado.");
              }}
            >
              <Copy className="size-4" aria-hidden /> Copiar
            </Botao>
          </div>
        ) : (
          <Botao
            variante="secundario"
            carregando={gerando}
            onClick={async () => {
              if (verificacao && !(await confirmar({ titulo: "Gerar um token novo?", mensagem: "O antigo deixa de valer: será preciso colar o novo na Meta." }))) return;
              iniciar(async () => {
                const r = await gerarTokenVerificacao();
                if (r.ok) setToken(r.token);
                else toast.erro(r.mensagem);
              });
            }}
          >
            <RefreshCw className="size-4" aria-hidden /> {verificacao ? "Gerar outro" : "Gerar token"}
          </Botao>
        )}
        <p className="text-xs text-texto-2">Endereço dos avisos (webhook): disponível quando o motor do agente for publicado (fase 3).</p>
      </div>
    </Cartao>
  );
}
