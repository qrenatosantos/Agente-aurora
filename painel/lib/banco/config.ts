/**
 * CONFIGURAÇÃO DO AGENTE (linha única) COM VERSÕES.
 * Toda alteração de verdade vira uma versão nova, com a lista do que mudou. Salvar igual não cria versão.
 * Todos leem; só o gestor altera, vê o histórico e volta a uma versão.
 */
import { agora, type Ator, type Banco, converter, ErroRegra, exigirAtivo, exigirGestor, registrar, traduzirErro } from "./base.ts";

/** Campos que fazem parte da versão (tudo menos controle interno). */
export const CAMPOS_CONFIG = {
  nome_agente: "texto",
  apresentacao: "texto",
  tom: "texto",
  saudacao: "texto",
  instrucoes: "texto",
  exemplos: "json",
  gatilhos_palavras: "json",
  gatilhos_temas: "json",
  max_msgs_sem_avanco: "numero",
  horario_equipe: "json",
  agente_24h: "booleano",
  mensagens: "json",
  espera_segundos: "numero",
  transcrever_audio: "booleano",
  modelo: "texto",
  limite_mensal_usd: "numero",
  alerta_pct: "numero",
  parar_no_limite: "booleano",
  retomada_aberta_min: "numero",
  retomada_nao_aberta_min: "numero",
} as const;
export type CampoConfig = keyof typeof CAMPOS_CONFIG;

const BOOLEANOS = Object.entries(CAMPOS_CONFIG).filter(([, t]) => t === "booleano").map(([k]) => k);
const JSONS = Object.entries(CAMPOS_CONFIG).filter(([, t]) => t === "json").map(([k]) => k);

export type Config = {
  nome_agente: string;
  apresentacao: string;
  tom: string;
  saudacao: string;
  instrucoes: string;
  exemplos: { situacao: string; cliente: string; agente: string }[];
  gatilhos_palavras: string[];
  gatilhos_temas: string[];
  max_msgs_sem_avanco: number;
  horario_equipe: Record<string, { inicio: string; fim: string } | null>;
  agente_24h: boolean;
  mensagens: Record<string, string>;
  espera_segundos: number;
  transcrever_audio: boolean;
  modelo: string;
  limite_mensal_usd: number;
  alerta_pct: number;
  parar_no_limite: boolean;
  /** Minutos depois que o cliente ABRIU a proposta sem responder, para a Cecília perguntar o que achou. */
  retomada_aberta_min: number;
  /** Minutos depois do envio do link, se o cliente NÃO abriu, para a Cecília perguntar se conseguiu ver. */
  retomada_nao_aberta_min: number;
  versao: number;
  updated_at: string;
};

export type Versao = { numero: number; dados: Partial<Config>; campos: string[]; descricao: string | null; autor_nome: string; created_at: string };

/** Leitura sem conferir quem é (uso interno do servidor: motor e simulador). */
export async function lerConfigInterno(db: Banco): Promise<Config> {
  const r = await db.prepare("select * from agente_config where id = 1").first();
  return converter<Config>(r, BOOLEANOS, JSONS)!;
}

export async function lerConfig(db: Banco, ator: Ator): Promise<Config> {
  exigirAtivo(ator);
  return lerConfigInterno(db);
}

function dadosVersao(c: Config) {
  const d: Record<string, unknown> = {};
  for (const k of Object.keys(CAMPOS_CONFIG)) d[k] = c[k as CampoConfig];
  return d;
}

/** Altera campos da configuração. Devolve o número da versão (nova, ou a mesma se nada mudou). */
export async function salvarConfig(db: Banco, ator: Ator, mudancas: Partial<Omit<Config, "versao" | "updated_at">>, descricao: string | null = null): Promise<number> {
  exigirGestor(ator, "Só o gestor altera a configuração do agente.");
  const atual = await lerConfigInterno(db);
  const novo = { ...atual };
  const campos: string[] = [];
  for (const [k, v] of Object.entries(mudancas)) {
    if (!(k in CAMPOS_CONFIG) || v === undefined) continue;
    if (JSON.stringify(atual[k as CampoConfig]) !== JSON.stringify(v)) {
      (novo as Record<string, unknown>)[k] = v;
      campos.push(k);
    }
  }
  campos.sort();
  if (!campos.length) return atual.versao;

  const ultima = await db.prepare("select coalesce(max(numero), 0) as n from config_versoes").first<{ n: number }>();
  const versao = (ultima?.n ?? 0) + 1;
  const sets = campos.map((k) => `${k} = ?`).join(", ");
  const valores = campos.map((k) => {
    const v = (novo as Record<string, unknown>)[k];
    const tipo = CAMPOS_CONFIG[k as CampoConfig];
    return tipo === "json" ? JSON.stringify(v) : tipo === "booleano" ? (v ? 1 : 0) : v;
  });
  try {
    await db.batch([
      db.prepare(`update agente_config set ${sets}, versao = ?, updated_at = ? where id = 1`).bind(...valores, versao, agora()),
      db
        .prepare("insert into config_versoes (numero, dados, campos, descricao, autor_id, autor_nome) values (?, ?, ?, ?, ?, ?)")
        .bind(versao, JSON.stringify(dadosVersao(novo)), JSON.stringify(campos), descricao, ator.id, ator.nome),
      registrar(db, ator, "config.alterou", `Versão ${versao}`, { versao, campos, descricao }),
    ]);
  } catch (e) {
    traduzirErro(e);
  }
  return versao;
}

export async function listarVersoes(db: Banco, ator: Ator, limite = 50): Promise<Versao[]> {
  exigirGestor(ator, "Só o gestor vê o histórico de versões.");
  const r = await db.prepare("select * from config_versoes order by numero desc limit ?").bind(limite).all();
  return r.results.map((l) => converter<Versao>(l, [], ["dados", "campos"])!);
}

/** Volta para uma versão anterior: gera uma versão NOVA igual à escolhida. */
export async function restaurarVersao(db: Banco, ator: Ator, numero: number): Promise<number> {
  exigirGestor(ator, "Só o gestor pode voltar a uma versão anterior.");
  const v = await db.prepare("select dados from config_versoes where numero = ?").bind(numero).first<{ dados: string }>();
  if (!v) throw new ErroRegra(`Versão ${numero} não encontrada.`);
  return salvarConfig(db, ator, JSON.parse(v.dados), `Voltou para a versão ${numero}`);
}
