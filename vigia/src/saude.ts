/** Decide o que vira alerta no teste de saúde (função pura, testada em saude.test.ts). */
export type Achado = { item: string; detalhe: string; alerta: boolean };

/** Frase de "não configurado" que o motor devolve (motor/src/saude.ts). */
const NAO_CADASTRADO = /não cadastrad/;

/**
 * Falhou = alerta. Exceção: algo ainda não configurado (ex.: o ambiente de testes sem WhatsApp) só é alerta
 * quando está na lista EXIGIR e o cliente já está no ar (exigivel; multi-cliente).
 */
export function avaliarSaude(itens: { item: string; ok: boolean; detalhe: string; exigivel?: boolean }[], exigir: string[]): Achado[] {
  return itens.map((i) => {
    if (i.ok) return { item: i.item, detalhe: i.detalhe, alerta: false };
    // exigivel = false: cliente ainda sendo configurado (sem WhatsApp no ar): falta de chave não é alerta
    if (NAO_CADASTRADO.test(i.detalhe) && (!exigir.includes(i.item) || i.exigivel === false)) return { item: i.item, detalhe: `${i.detalhe} (não exigido aqui)`, alerta: false };
    return { item: i.item, detalhe: i.detalhe, alerta: true };
  });
}
