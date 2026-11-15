/**
 * Tipos usados pelas telas. Os formatos vêm das funções do banco (lib/banco/), que já
 * convertem 0/1 em sim/não e JSON em objetos.
 */
import type { Config, Versao } from "./banco/config.ts";
import type { Conhecimento as ConhecimentoBanco, TipoConhecimento as TipoBanco } from "./banco/conhecimento.ts";
import type { Integracoes, NomeSegredo as NomeBanco, ResultadoTeste as ResultadoBanco, SituacaoSegredo as SituacaoBanco } from "./banco/integracoes.ts";
import type { LinhaRegistro, Operacao, Simulacao } from "./banco/operacao.ts";
import type { Pessoa } from "./banco/pessoas.ts";
import type { EstadoConversa, PassoRastro, UsoModelo } from "./nucleo/tipos.ts";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Exemplo = { situacao: string; cliente: string; agente: string };

/** Horário da equipe: chave = dia da semana (0 = domingo … 6 = sábado). */
export type HorarioEquipe = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { inicio: string; fim: string } | null>>;

export type MensagensPadrao = Partial<Record<"aviso_automatico" | "fora_horario" | "transferencia" | "erro" | "midia" | "sair_confirmacao" | "proposta_aprovada", string>>;

export type Perfil = Pessoa;
export type AgenteConfig = Omit<Config, "exemplos" | "horario_equipe" | "mensagens"> & { exemplos: Exemplo[]; horario_equipe: HorarioEquipe; mensagens: MensagensPadrao };
export type ConfigVersaoLinha = Versao;
export type TipoConhecimento = TipoBanco;
export type Conhecimento = ConhecimentoBanco;
export type ResultadoTeste = ResultadoBanco;
export type IntegracoesLinha = Integracoes;
export type NomeSegredo = NomeBanco;
export type SituacaoSegredo = SituacaoBanco;
export type OperacaoLinha = Operacao;
export type RegistroLinha = LinhaRegistro;

export type MensagemSimulacao = {
  papel: "cliente" | "agente" | "sistema";
  texto: string;
  em: string;
  rastro?: PassoRastro[];
  uso?: UsoModelo;
};

export type SimulacaoLinha = Omit<Simulacao, "mensagens" | "estado"> & { mensagens: MensagemSimulacao[]; estado: EstadoConversa };
