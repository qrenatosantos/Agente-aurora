/**
 * Modelos da OpenAI oferecidos no painel. O preço (US$ por 1 milhão de tokens) vem da tabela do
 * núcleo (lib/nucleo/openai.ts), a mesma usada para calcular o gasto.
 * O gestor também pode digitar outro modelo. Padrão: o barato que melhor seguiu as regras na
 * bateria com IA de verdade (avaliacao/RESULTADO.md).
 */
import { PRECOS } from "./nucleo/openai.ts";

export type ModeloOpenAI = { id: string; nome: string; entrada: number; saida: number; nota: string };

const com = (id: string, nome: string, nota: string): ModeloOpenAI => ({ id, nome, entrada: PRECOS[id].entrada, saida: PRECOS[id].saida, nota });

export const MODELOS: ModeloOpenAI[] = [
  com("gpt-6-luna", "GPT-6 Luna (recomendado: 45/45 nos testes)", "O mais barato da tabela da OpenAI e o que melhor seguiu as regras nos testes (docs/TESTES.md)."),
  com("gpt-4o-mini", "GPT-4o mini (barato; 40/45 nos testes)", "Barato, mas nos testes nem sempre passou a conversa para a equipe quando devia."),
  com("gpt-6.1-terra", "GPT-6.1 Terra (escrita melhor, ~10× mais caro)", "Para comparar: escreve melhor, custa bem mais."),
];

export const MODELO_PADRAO = MODELOS[0].id;
