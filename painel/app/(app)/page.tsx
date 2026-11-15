import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Clock, DollarSign, FileText, MessagesSquare, PhoneForwarded, UserPlus } from "lucide-react";
import { CabecalhoPagina, Cartao, Selo } from "@/components/ui/cartao";
import { obterConfigAgente, obterOperacao } from "@/lib/dados";
import { formatarMoeda } from "@/lib/formatar";
import { PROXIMAS_TELAS } from "@/lib/navegacao";
import { ehGestor, obterPerfil } from "@/lib/perfil";
import { listarVersoes } from "@/lib/banco/config.ts";
import { listarConhecimento } from "@/lib/banco/conhecimento.ts";
import { lerIntegracoes } from "@/lib/banco/integracoes.ts";
import { gastoMes } from "@/lib/banco/operacao.ts";
import { listarEquipe } from "@/lib/banco/pessoas.ts";
import { atorAtual, banco } from "@/lib/servidor";

export const metadata: Metadata = { title: "Visão geral" };

type Passo = { feito: boolean | null; titulo: string; detalhe: string; href?: string };

export default async function PaginaInicio() {
  const { perfil } = await obterPerfil();
  const db = await banco();
  const ator = await atorAtual();
  // leituras só do gestor (versões, integrações, equipe) voltam vazias para a atendente
  const [{ config }, operacao, conhecimento, versoes, t, pessoas, gasto] = await Promise.all([
    obterConfigAgente(),
    obterOperacao(),
    listarConhecimento(db, ator).catch(() => []),
    listarVersoes(db, ator, 500).catch(() => []),
    lerIntegracoes(db, ator).catch(() => null),
    listarEquipe(db, ator).catch(() => []),
    gastoMes(db, ator).catch(() => 0),
  ]);
  const versoesHumanas = versoes.filter((v) => v.autor_nome !== "Sistema").length;
  const limite = Number(config?.limite_mensal_usd ?? 0);
  const pct = limite > 0 ? Math.min(100, (gasto / limite) * 100) : 0;
  const gestor = ehGestor(perfil);
  const itens = conhecimento;
  const ativos = itens.filter((i) => i.ativo).length;
  const comAlerta = itens.filter((i) => i.ativo && i.alertas.length).length;

  const passos: Passo[] = [
    {
      feito: versoesHumanas > 0,
      titulo: "Revisar as instruções do agente",
      detalhe: "A versão inicial foi escrita a partir do site e das regras combinadas. O André deve ler e ajustar.",
      href: "/agente",
    },
    {
      feito: ativos > 0 && comAlerta === 0,
      titulo: "Conferir o conhecimento",
      detalhe: comAlerta ? `${ativos} itens em uso, ${comAlerta} com alerta de preço ou condição para revisar.` : `${ativos} itens em uso.`,
      href: "/conhecimento",
    },
    { feito: null, titulo: "Ajustar o horário da equipe e as mensagens padrão", detalhe: "Usados quando o agente passa a conversa para uma pessoa.", href: "/transferencia" },
    ...(gestor
      ? [
          { feito: Boolean(t?.teste_crm?.ok), titulo: "Conectar o CRM", detalhe: t?.teste_crm?.mensagem ?? "Criar a chave do agente no CRM e testar aqui.", href: "/integracoes" },
          { feito: Boolean(t?.teste_openai?.ok), titulo: "Conectar a OpenAI", detalhe: t?.teste_openai?.mensagem ?? "Necessária a partir da fase 2 (simulador).", href: "/integracoes" },
          { feito: Boolean(t?.teste_whatsapp?.ok), titulo: "Conectar o WhatsApp", detalhe: t?.teste_whatsapp?.mensagem ?? "Necessário a partir da fase 3 (número de teste da Meta).", href: "/integracoes" },
          { feito: pessoas.length > 1 ? true : null, titulo: "Cadastrar a equipe", detalhe: "Opcional: quem mais vai acompanhar as conversas.", href: "/equipe" },
        ]
      : []),
  ];

  const indicadores = [
    { titulo: "Conversas hoje", icone: MessagesSquare },
    { titulo: "Pedidos criados", icone: UserPlus },
    { titulo: "Propostas submetidas / enviadas", icone: FileText },
    { titulo: "Passadas para a equipe", icone: PhoneForwarded },
    { titulo: "Tempo médio de resposta", icone: Clock },
  ];

  return (
    <>
      <CabecalhoPagina titulo={`Olá${perfil?.nome ? `, ${perfil.nome.split(" ")[0]}` : ""}!`} descricao="Painel do atendimento automático da Aurora Bartenders." />

      <Cartao className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-texto-2">Situação do agente</p>
          <p className="text-lg font-semibold text-texto">
            {operacao?.pausado ? "Pausado pelo botão de emergência" : "Em preparação: ainda não atende clientes"}
          </p>
          <p className="text-sm text-texto-2">
            Ele passa a responder no WhatsApp a partir da fase 3 (número de teste) e só atende clientes reais no piloto (fase 6).
          </p>
        </div>
        <Selo cor={operacao?.pausado ? "perigo" : "info"} className="self-start sm:self-center">
          {operacao?.pausado ? "Pausado" : "Fase 1"}
        </Selo>
      </Cartao>

      <h2 className="mb-3 text-lg font-semibold text-texto">Preparação</h2>
      <Cartao className="mb-6 p-0 sm:p-0">
        <ul className="divide-y divide-borda">
          {passos.map((p) => {
            const Icone = p.feito ? CheckCircle2 : p.feito === false && p.detalhe.includes("alerta") ? AlertTriangle : Circle;
            const conteudo = (
              <div className="flex items-start gap-3 p-4">
                <Icone className={`mt-0.5 size-5 shrink-0 ${p.feito ? "text-ok" : "text-texto-2"}`} aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-texto">
                    {p.titulo}
                    <span className="sr-only">{p.feito ? " (feito)" : " (pendente)"}</span>
                  </p>
                  <p className="text-sm text-texto-2">{p.detalhe}</p>
                </div>
              </div>
            );
            return (
              <li key={p.titulo}>
                {p.href ? (
                  <Link href={p.href} className="block hover:bg-superficie-2">
                    {conteudo}
                  </Link>
                ) : (
                  conteudo
                )}
              </li>
            );
          })}
        </ul>
      </Cartao>

      <h2 className="mb-3 text-lg font-semibold text-texto">Atendimento</h2>
      <div className="mb-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {indicadores.map(({ titulo, icone: Icone }) => (
          <Cartao key={titulo}>
            <div className="flex items-center gap-2 text-sm text-texto-2">
              <Icone className="size-4" aria-hidden /> {titulo}
            </div>
            <p className="mt-2 text-2xl font-bold text-texto-2">—</p>
          </Cartao>
        ))}
        <Cartao>
          <div className="flex items-center gap-2 text-sm text-texto-2">
            <DollarSign className="size-4" aria-hidden /> Gasto com a OpenAI no mês
          </div>
          <p className="mt-2 text-2xl font-bold text-texto">US$ {gasto.toFixed(gasto > 0 && gasto < 1 ? 4 : 2).replace(".", ",")}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-superficie-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Gasto em relação ao limite">
            <div className={`h-full ${pct >= (config?.alerta_pct ?? 80) ? "bg-perigo" : "bg-ok"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-texto-2">
            Limite: US$ {config ? formatarMoeda(config.limite_mensal_usd).replace("R$", "").trim() : "—"} · alerta em {config?.alerta_pct ?? "—"}%
          </p>
        </Cartao>
      </div>
      <p className="mb-6 text-sm text-texto-2">
        Os números do atendimento aparecem quando o agente começar a atender no WhatsApp (fases 4 e 5). O gasto já inclui o uso do
        Simulador.
      </p>

      <h2 className="mb-3 text-lg font-semibold text-texto">Próximas telas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROXIMAS_TELAS.map(({ titulo, icone: Icone, fase, descricao }) => (
          <Cartao key={titulo} className="flex gap-3">
            <Icone className="mt-0.5 size-5 shrink-0 text-texto-2" aria-hidden />
            <div>
              <p className="font-medium text-texto">
                {titulo} <Selo className="ml-1">fase {fase}</Selo>
              </p>
              <p className="text-sm text-texto-2">{descricao}</p>
            </div>
          </Cartao>
        ))}
      </div>
    </>
  );
}
