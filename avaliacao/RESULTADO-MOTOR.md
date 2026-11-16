# Bateria de regras com a IA de verdade

Gerado em 16/11/2026, 02:08:50 por `node avaliacao/avaliar.ts`. Onde rodou: **MOTOR (Cloudflare Worker, laço do Think)**.
Instruções e conhecimento: os iniciais (clientes/aurora/dados-iniciais.sql). CRM: cópia local, sem regra de preço aprovada,
com 12/06/2027 bloqueado. Modo simulação (lê o CRM, não grava). 3 rodada(s) por situação.

## Resumo

| Modelo | Passou | Custo médio por resposta | Tempo médio por resposta | Custo total do teste |
|---|---|---|---|---|
| gpt-6-luna | 8/9 | US$ 0.00123 | 3.1 s | US$ 0.0147 |

## Por situação

| Situação | gpt-6-luna |
|---|---|
| Insiste em saber o preço antes da proposta | ✔<br>✔<br>✘ não passou para a equipe |
| Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara | ✔ 3/3 |
| "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara | ✔ 3/3 |

## Conversas

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 1: ✔ passou
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 O valor do pacote Reserve para 100 pessoas e 5 horas será definido pela equipe na proposta. Para eu preparar o orçamento, me conta: qual é o tipo de festa e para quando está prevista?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Vou passar sua conversa para alguém da nossa equipe. Agora estamos fora do horário de atendimento, então a resposta chega a partir de hoje às 09:00. Já deixei tudo anotado!

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 2: ✔ passou
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 O valor do pacote Reserve para 100 pessoas e 5 horas será informado na proposta, preparada conforme os detalhes da festa. Qual é o tipo de evento, a data e a cidade?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Vou passar sua conversa para alguém da nossa equipe. Agora estamos fora do horário de atendimento, então a resposta chega a partir de hoje às 09:00. Já deixei tudo anotado!

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 3: ✘ não passou para a equipe
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 O valor do Reserve depende também da data e da cidade da festa; ele vem certinho na proposta, que a equipe prepara para você. Qual é o tipo de evento, a data e a cidade?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Entendo, mas não tenho um valor aprovado para te passar agora, nem mesmo aproximado; o preço vem na proposta. Para eu preparar a proposta do Reserve, me conta a data, a cidade e o tipo de evento.

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 1: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo 😊 Temos duas formas de deixar a proposta mais em conta: diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 2: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo 😊 Para deixar o orçamento mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 3: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo! 😊 Dá para deixar a proposta mais em conta diminuindo as horas de bar ou usando copos descartáveis no lugar da nossa vidraria. Quer que eu considere alguma dessas opções?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 1: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Para deixar a proposta mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Alguma dessas opções funciona para você?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 2: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Podemos tentar deixar a proposta mais em conta diminuindo as horas de bar ou usando copos descartáveis no lugar da nossa vidraria. Alguma dessas opções funciona para você?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 3: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Para deixar a proposta mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste com alguma dessas opções?
