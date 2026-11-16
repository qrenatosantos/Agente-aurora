# Bateria de regras com a IA de verdade

Gerado em 16/11/2026, 10:34:47 por `node avaliacao/avaliar.ts`. Onde rodou: **MOTOR (Cloudflare Worker, laço do Think)**.
Instruções e conhecimento: os iniciais (clientes/aurora/dados-iniciais.sql). CRM: cópia local, sem regra de preço aprovada,
com 12/06/2027 bloqueado. Modo simulação (lê o CRM, não grava). 3 rodada(s) por situação.

## Resumo

| Modelo | Passou | Custo médio por resposta | Tempo médio por resposta | Custo total do teste |
|---|---|---|---|---|
| gpt-6-luna | 12/12 | US$ 0.00108 | 2.7 s | US$ 0.0195 |

## Por situação

| Situação | gpt-6-luna |
|---|---|
| Insiste em saber o preço antes da proposta | ✔ 3/3 |
| Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara | ✔ 3/3 |
| "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara | ✔ 3/3 |
| Pede preço menor, ouve as opções, recusa e insiste: aí transfere | ✔ 3/3 |

## Conversas

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 1: ✔ passou
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 O valor do Reserve depende da data e dos detalhes da festa, então vem na proposta — não tenho um preço aprovado para informar agora. Qual é o tipo de evento e para quando está previsto?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 2: ✔ passou
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 O valor do Reserve para 100 pessoas e 5 horas será definido pela equipe na proposta. Para eu preparar o orçamento, qual é o tipo de festa, a data prevista e em qual cidade será?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊

### Insiste em saber o preço antes da proposta · gpt-6-luna · rodada 3: ✔ passou
- 👤 Quanto custa o Reserve para 100 pessoas, 5 horas?
- 🤖 Olá! Aqui é a Cecília, agente de atendimento da Aurora Bartenders 🥂 O valor do Reserve depende da data e da festa; a equipe prepara o preço certinho na proposta. Para quando e em qual cidade será o evento?
- 👤 Mas eu preciso de pelo menos um valor aproximado agora, senão não consigo decidir.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 1: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo! 😊 Para deixar a proposta mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 2: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo! 😊 Para deixar a proposta mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### Pede preço menor: oferece as formas de economizar (sem citar valor) e NÃO transfere de cara · gpt-6-luna · rodada 3: ✔ passou
- 👤 Se eu fechar hoje vocês conseguem fazer um precinho mais camarada pra mim?
- 🤖 Entendo! 😊 Para deixar a proposta mais em conta, podemos diminuir as horas de bar ou usar copos descartáveis no lugar da vidraria. Quer que a equipe ajuste com alguma dessas opções?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 1: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Tem dois jeitos de deixar a proposta mais em conta: diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 2: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Podemos tentar deixar a proposta mais em conta reduzindo as horas de bar ou usando copos descartáveis no lugar da nossa vidraria. Alguma dessas opções funciona para você?

### "Ficou muito caro, tem desconto?": oferece as formas de economizar e NÃO transfere de cara · gpt-6-luna · rodada 3: ✔ passou
- 👤 Ficou muito caro.. não tem como dar um desconto?
- 🤖 Entendo! 😊 Temos dois jeitos de deixar a proposta mais em conta: diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste a proposta com alguma dessas opções?

### Pede preço menor, ouve as opções, recusa e insiste: aí transfere · gpt-6-luna · rodada 1: ✔ passou
- 👤 Ficou caro, dá pra fazer mais barato?
- 🤖 Entendo! 😊 Podemos tentar deixar a proposta mais em conta diminuindo as horas de bar ou usando copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste com alguma dessas opções?
- 👤 Não quero diminuir as horas nem usar copo descartável. Quero desconto mesmo.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊

### Pede preço menor, ouve as opções, recusa e insiste: aí transfere · gpt-6-luna · rodada 2: ✔ passou
- 👤 Ficou caro, dá pra fazer mais barato?
- 🤖 Entendo! 😊 Tem dois jeitos de deixar a proposta mais em conta: diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Alguma dessas opções funciona para você?
- 👤 Não quero diminuir as horas nem usar copo descartável. Quero desconto mesmo.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊

### Pede preço menor, ouve as opções, recusa e insiste: aí transfere · gpt-6-luna · rodada 3: ✔ passou
- 👤 Ficou caro, dá pra fazer mais barato?
- 🤖 Entendo! 😊 Temos duas formas de deixar a proposta mais em conta: diminuir as horas de bar ou usar copos descartáveis no lugar da nossa vidraria. Quer que a equipe ajuste com alguma dessas opções?
- 👤 Não quero diminuir as horas nem usar copo descartável. Quero desconto mesmo.
- 🤖 Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊
