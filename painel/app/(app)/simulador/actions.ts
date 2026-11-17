"use server";

/**
 * SIMULADOR: conversar com o agente como se fosse um cliente.
 * Padrão: LÊ o CRM de verdade (agenda, catálogo, preço) e NÃO grava nada.
 * Com "gravar no CRM" (só gestor): cria um pedido de teste e grava tudo, como o agente real faria.
 *
 * Quem responde é o MOTOR (o mesmo Worker que atende no WhatsApp), numa conversa só desta simulação
 * ("sim-<id>"). Se o motor não estiver ligado a este painel (ex.: no computador sem o motor rodando),
 * o núcleo roda aqui mesmo, com as mesmas regras, e a tela avisa.
 */
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { falha, sucesso, type EstadoAcao } from "@/lib/acoes";
import { carregarAmbienteAgente, chamarMotor } from "@/lib/agente-servidor";
import * as op2 from "@/lib/banco/avisos.ts";
import * as op from "@/lib/banco/operacao.ts";
import { processarTurno } from "@/lib/nucleo/agente.ts";
import type { NegocioCrm } from "@/lib/nucleo/crm.ts";
import { estadoInicial, type EstadoConversa, type ResultadoTurno } from "@/lib/nucleo/tipos.ts";
import { exigirGestor, exigirPerfil } from "@/lib/perfil";
import { atorAtual, banco, mensagemDeErro } from "@/lib/servidor";
import type { MensagemSimulacao, SimulacaoLinha } from "@/lib/tipos";
import { ehUuid } from "@/lib/validacao";

const esquemaNova = z.object({
  modelo: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._:-]{1,79}$/, "Modelo inválido.").optional().or(z.literal("")),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[A-Z0-9]{4,10}$/.test(v), "Código de pedido inválido."),
  gravar_crm: z.enum(["sim", "nao"]).default("nao").transform((v) => v === "sim"),
  pergunta: z.string().trim().max(1000).optional(),
});

export async function novaSimulacao(_a: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const p = await exigirPerfil();
  if ("erro" in p) return falha(p.erro);
  const d = esquemaNova.safeParse(Object.fromEntries(formData));
  if (!d.success) return falha(d.error.issues[0]?.message ?? "Confira os campos.");
  if (d.data.gravar_crm) {
    const g = await exigirGestor();
    if ("erro" in g) return falha("Só o gestor pode fazer simulações que gravam no CRM.");
  }

  const ambR = await carregarAmbienteAgente();
  if (!ambR.ok) return falha(ambR.mensagem);
  const { amb } = ambR;
  let estado: EstadoConversa = estadoInicial();
  let titulo = "Cliente novo pelo WhatsApp";

  if (d.data.codigo) {
    const r = await amb.crm.get<NegocioCrm>(`/negocios?codigo=${d.data.codigo}`);
    const n = (r.dados as unknown as { negocios?: NegocioCrm[] } | NegocioCrm | undefined) ?? null;
    const negocio = n && "negocios" in n ? n.negocios?.[0] : (n as NegocioCrm | null);
    if (!negocio?.id) return falha(r.erro?.mensagem ?? `Pedido ${d.data.codigo} não encontrado no CRM.`);
    estado = estadoInicial({ negocio_id: negocio.id, codigo: negocio.codigo, contato_id: negocio.contato?.id ?? null, contato: { nome: negocio.contato?.nome ?? null } });
    titulo = `Pedido ${negocio.codigo}${negocio.contato?.nome ? ` · ${negocio.contato.nome}` : ""}`;
  }
  if (d.data.gravar_crm && !d.data.codigo) {
    // telefone fictício (DDD 34 + 9 + 8 dígitos começando em 0000) para o pedido de teste
    estado.telefone = `3490000${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  }

  let id: string;
  try {
    const db = await banco();
    const ator = await atorAtual();
    id = await op.criarSimulacao(db, ator, { titulo: (d.data.gravar_crm ? "[grava no CRM] " : "") + titulo, modelo: d.data.modelo || amb.cfg.modelo, gravar_crm: d.data.gravar_crm });
    await op.atualizarSimulacao(db, ator, id, { estado: estado as unknown as Record<string, unknown> });
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/simulador");
  redirect(`/simulador?id=${id}${d.data.pergunta ? `&pergunta=${encodeURIComponent(d.data.pergunta)}` : ""}`);
}

export type ResultadoEnvio = { ok: boolean; mensagem?: string };

export async function enviarMensagem(simulacaoId: string, texto: string): Promise<ResultadoEnvio> {
  const p = await exigirPerfil();
  if ("erro" in p) return { ok: false, mensagem: p.erro };
  if (!ehUuid(simulacaoId)) return { ok: false, mensagem: "Simulação inválida." };
  const limpo = texto.replace(/\r\n/g, "\n").trim().slice(0, 2000);
  if (!limpo) return { ok: false, mensagem: "Escreva uma mensagem." };

  const db = await banco();
  const ator = await atorAtual();
  const sim = (await op.lerSimulacao(db, ator, simulacaoId).catch(() => null)) as SimulacaoLinha | null;
  if (!sim) return { ok: false, mensagem: "Simulação não encontrada." };
  if (sim.mensagens.length >= 380) return { ok: false, mensagem: "Esta simulação ficou longa demais. Comece uma nova." };

  const ambR = await carregarAmbienteAgente();
  if (!ambR.ok) return { ok: false, mensagem: ambR.mensagem };
  const { amb } = ambR;
  if (amb.limite.pararNoLimite && amb.gastoMes >= amb.limite.valor) {
    return { ok: false, mensagem: `O limite de gasto do mês com a OpenAI (US$ ${amb.limite.valor.toFixed(2)}) foi atingido. O gestor pode aumentar em Integrações.` };
  }

  const agora = new Date();
  const msgCliente: MensagemSimulacao = { papel: "cliente", texto: limpo, em: agora.toISOString() };
  const historico = [...sim.mensagens, msgCliente].filter((m) => m.papel !== "sistema").map((m) => ({ papel: m.papel, texto: m.texto, em: m.em }));

  const comum = {
    cfg: amb.cfg,
    conhecimento: amb.conhecimento,
    novas: [limpo],
    chaveIA: amb.chaveIA,
    modelo: sim.modelo,
    modo: (sim.gravar_crm ? "real" : "simulacao") as "real" | "simulacao",
    pausado: amb.pausado,
    telefone: sim.estado?.telefone ?? null,
    tituloNovoPedido: "SIMULADOR · teste (pode excluir)",
  };
  let r: ResultadoTurno;
  let noMotor = true;
  try {
    const peloMotor = await chamarMotor<ResultadoTurno>("turno", {
      ...comum,
      conversa: `sim-${sim.id}`,
      crm: { endereco: amb.crmUrl, chave: amb.chaveCrm },
      agora: agora.toISOString(),
      estadoInicial: sim.estado,
    });
    if (peloMotor) r = peloMotor;
    else {
      noMotor = false;
      r = await processarTurno({ ...comum, estado: { ...estadoInicial(), ...sim.estado }, historico, crm: amb.crm, agora });
    }
  } catch (e) {
    return { ok: false, mensagem: mensagemDeErro(e) };
  }
  if (!noMotor) r.rastro.push({ tipo: "aviso", nome: "Rodou no painel", detalhe: "O motor do agente não está ligado a este painel: a resposta foi calculada aqui, com as mesmas regras." });

  const novas: MensagemSimulacao[] = [msgCliente];
  const em = new Date().toISOString();
  if (r.respostas.length) {
    r.respostas.forEach((t, i) => novas.push({ papel: "agente", texto: t, em, ...(i === 0 ? { rastro: r.rastro, uso: r.uso } : {}) }));
  } else {
    novas.push({ papel: "sistema", texto: r.silencio ?? "O agente não respondeu.", em, rastro: r.rastro, uso: r.uso });
  }

  // No modo "grava no CRM", a conversa também fica registrada no pedido (como o agente real faz).
  if (sim.gravar_crm && r.estado.negocio_id) {
    const base = sim.mensagens.length;
    const paraCrm = novas
      .filter((m) => m.papel !== "sistema")
      .map((m, i) => ({ direcao: m.papel === "cliente" ? "entrada" : "saida", texto: m.texto, enviada_em: m.em, canal: "whatsapp", id_externo: `sim-${sim.id}-${base + i}` }));
    if (paraCrm.length) await amb.crm.post(`/negocios/${r.estado.negocio_id}/mensagens`, { mensagens: paraCrm });
  }

  const custo = r.uso.custo_usd ?? 0;
  try {
    await op.atualizarSimulacao(db, ator, sim.id, {
      mensagens: [...sim.mensagens, ...novas],
      estado: r.estado as unknown as Record<string, unknown>,
      custo_usd: Number(sim.custo_usd) + custo,
      tokens: sim.tokens + r.uso.entrada + r.uso.saida,
    });
    if (r.uso.chamadas) {
      await op.registrarUsoIA(db, ator, { origem: "simulador", modelo: r.uso.modelo, entrada: r.uso.entrada, cache: r.uso.cache, saida: r.uso.saida, custo: Number(custo.toFixed(6)), simulacao: sim.id });
    }
  } catch (e) {
    return { ok: false, mensagem: mensagemDeErro(e) };
  }
  revalidatePath("/simulador");
  return { ok: true };
}

export async function apagarSimulacao(id: string): Promise<EstadoAcao> {
  const p = await exigirPerfil();
  if ("erro" in p) return falha(p.erro);
  if (!ehUuid(id)) return falha("Simulação inválida.");
  try {
    await op.apagarSimulacao(await banco(), await atorAtual(), id);
    await chamarMotor("apagar", { conversa: `sim-${id}` }).catch(() => undefined); // a memória da conversa no motor também
  } catch (e) {
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/simulador");
  return sucesso("Simulação apagada.");
}

/** Zera uma conversa do WhatsApp para testar de novo do zero (memória no motor + ligação com os pedidos). Só gestor. */
export async function zerarConversaWhatsApp(conversa: string): Promise<EstadoAcao> {
  const g = await exigirGestor();
  if ("erro" in g) return falha("Só o gestor zera conversas do WhatsApp.");
  if (!/^wa-\d{8,15}$/.test(conversa)) return falha("Conversa inválida.");
  try {
    const r = await chamarMotor("apagar", { conversa });
    if (r === null) return falha("O motor do agente não está ligado a este painel.");
    await op2.zerarConversaWhatsApp(await banco(), await atorAtual(), conversa);
  } catch (e) {
    unstable_rethrow(e);
    return falha(mensagemDeErro(e));
  }
  revalidatePath("/simulador");
  return sucesso("Conversa zerada. A próxima mensagem desse número começa do zero.");
}
