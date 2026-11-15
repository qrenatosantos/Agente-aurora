/**
 * Modelos da OpenAI oferecidos no painel, com o preço oficial por 1 milhão de tokens.
 * Fonte: https://developers.openai.com/api/docs/pricing (consultada em 11/2026).
 * O gestor também pode digitar outro modelo. Preços mudam: o gasto REAL vem das respostas
 * da própria OpenAI (fase 5); estes números servem só para estimar.
 */
export type ModeloOpenAI = { id: string; nome: string; entrada: number; cache: number | null; saida: number; nota: string };

export const MODELOS: ModeloOpenAI[] = [
  { id: "gpt-6.1-terra", nome: "GPT-6.1 Terra (recomendado)", entrada: 1, cache: 0.05, saida: 5, nota: "Escrita natural e bom uso de ferramentas. ~US$ 0,15 por conversa." },
  { id: "gpt-6-luna", nome: "GPT-6 Luna (mais barato)", entrada: 0.1, cache: null, saida: 0.5, nota: "~10× mais barato. Será comparado nos testes da fase 2." },
  { id: "gpt-6.1-sol", nome: "GPT-6.1 Sol", entrada: 2, cache: null, saida: 10, nota: "Mais caro; para casos complexos." },
];

export const MODELO_PADRAO = MODELOS[0].id;
