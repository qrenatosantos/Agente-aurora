# Agente SDR da Aurora: diagnóstico e plano

Versão 1, de 14/11/2026. **Ainda não tem código.** Este plano espera a aprovação do Renato.

---

## 0. Resumo em um minuto

- **O que vamos construir:** um projeto **separado do CRM** com duas partes.
  1. O **motor do agente**: recebe as mensagens do WhatsApp, pensa com a OpenAI, consulta e grava
     no CRM **só pela API** e responde ao cliente.
  2. O **painel**: o André configura, treina, testa e acompanha o agente, sem mexer em código.
- **O CRM já tem quase tudo** o que o agente precisa. Faltam **3 ajustes pequenos**, listados
  como "pedidos de mudança" na seção 1.3. Nenhum deles impede começar.
- **Custo mensal estimado** (detalhes na seção 6), com o modelo recomendado:

| Volume | OpenAI | WhatsApp (Meta) | Cloudflare | Supabase | **Total** |
|---|---|---|---|---|---|
| 100 conversas | ~US$ 15 | ~R$ 20 | US$ 0 a 5 | R$ 0 | **~R$ 105 a 130** |
| 500 conversas | ~US$ 75 | ~R$ 240 | US$ 5 | R$ 0 | **~R$ 680** |
| 2.000 conversas | ~US$ 300 | ~R$ 1.070 | US$ 5 | R$ 0 a US$ 25 | **~R$ 2.750 a 2.890** |

  Na conversão usei US$ 1 = R$ 5,50 só para estimar. Confira a cotação do dia.
- **A decisão mais importante que é sua:** qual número de WhatsApp o agente vai usar (seção 7).
- **Atenção a uma mudança recente da Meta:** desde **1º/10/2026** as respostas dentro da janela
  de 24 horas **deixaram de ser grátis**. Cada número tem 1.000 grátis por mês, e depois disso
  cada resposta custa o mesmo que uma mensagem "utilidade": cerca de R$ 0,035 no Brasil.

---

## 1. Diagnóstico

### 1.1 O que li

- O **CRM** inteiro (zip `aurora-sistema-codigo`), com atenção especial a:
  - `docs/API-DO-AGENTE.md`;
  - `lib/api/rotas-agente.ts`;
  - a função `api_agente` e as regras do `supabase/schema.sql` (seções A2 e A5 a A14);
  - `scripts/agente-de-teste.mjs`;
  - `integracao-site/politica-de-privacidade.md`.
- O **site** (zip v4): pacotes, drinks, perguntas frequentes e o formulário, que gera a referência
  `Ref. XXXX` na mensagem do WhatsApp.
- O **PDF** de proposta (11 páginas): usado só como material de treinamento.

### 1.2 O que a API do CRM já resolve (e o agente só precisa usar)

| Necessidade do agente | Já existe no CRM |
|---|---|
| Achar o pedido do site pelo `Ref.` | `GET /negocios?codigo=` |
| Achar o cliente pelo telefone | `GET /negocios?telefone=` (o CRM ignora o `55` do começo) |
| Criar pedido sem duplicar o contato | `POST /negocios` (reaproveita o contato pelo telefone) |
| Gravar o telefone do lead do site | `PATCH /contatos/:id` (funciona mesmo com o atendimento com uma pessoa) |
| Saber quem atende (agente ou pessoa) | campo `atendimento` + avisos `encaminhado_agente` e `assumido_humano` |
| Registrar a conversa sem duplicar | `POST /negocios/:id/mensagens` com `id_externo` e `autor: humano` |
| Dados da festa e agenda | `PUT /negocios/:id/evento` (já devolve a disponibilidade) e `GET /agenda/disponibilidade` |
| Catálogo, condições e preço | `/catalogo/*` e `POST /precos/calcular` (com `disponivel: false` quando não há regra aprovada) |
| Proposta com aprovação | criar, ajustar, submeter, enviar (o envio dá erro `409` se não estiver aprovada) |
| Passar para uma pessoa | `POST /negocios/:id/transferir-humano` (o CRM cria uma tarefa para o André) |
| Avisos | webhook assinado (HMAC-SHA256) + fila `GET /eventos?depois=` |
| LGPD | aviso `contato.dados_apagados` |

**Conclusão:** o agente pode ser construído **sem mudar o CRM**. As regras críticas já estão
garantidas pelo CRM: nada de preço inventado, nada de envio sem aprovação, nada de alterar um
atendimento que está com uma pessoa.

### 1.3 Pedidos de mudança no CRM (para você levar à sessão do CRM)

| # | Pedido | Por quê | Sem ele, o que acontece | Prioridade |
|---|---|---|---|---|
| **C1** | Rota `POST /negocios/:id/encaminhar-agente` com uma permissão nova, `atendimento.devolver` | Botão "Passar para o agente" **no painel**. A permissão fica numa **segunda chave, só do painel**, que a IA nunca usa, para o agente não conseguir "pegar" conversas sozinho. | O André devolve pelo botão que já existe no CRM. Funciona, mas obriga a abrir o CRM. | Média |
| **C2** | O CRM tratar como **o mesmo número** o celular com e sem o 9 extra (ex.: `34 98893-5223` e `34 8893-5223`) | O WhatsApp às vezes entrega números brasileiros antigos **sem o 9**. Aí a busca por telefone falha e nasce um pedido duplicado. | O agente busca as duas versões do número. Resolve no agente, mas o próprio CRM continua sujeito ao problema. | Média |
| **C3** | Campo "**não quer receber mensagens**" (e consentimento para retomadas) no **contato**, gravável pela API | O André precisa ver no CRM quem pediu para não ser procurado, e esse dado deve valer para todos. | O agente guarda isso só no banco dele e põe uma etiqueta no negócio. O CRM não fica sabendo de forma oficial. | Baixa |
| C4 *(opcional)* | Incluir `foto_url` em `GET /catalogo/drinks` | Para o agente mandar a foto do drink quando o cliente pedir. | O agente não manda fotos de drinks. | Baixa |
| **S1** *(site/política)* | Completar o item "Atendimento automatizado" da política com: **OpenAI (EUA)** e **Meta/WhatsApp** como operadores, transferência internacional de dados e o pedido para sair das mensagens | A LGPD pede que o titular saiba quem trata os dados e se os dados vão para fora do país. | A política fica incompleta. | **Antes do piloto** |

Vou confirmar cada pedido com você antes de considerá-lo definitivo.

---

## 2. Arquitetura (em linguagem simples)

```
  CLIENTE (WhatsApp)                                   ANDRÉ / EQUIPE
        │                                                (celular ou PC)
        ▼                                                     │
 ┌──────────────┐  aviso assinado   ┌──────────────────────────────────────┐
 │  Meta        │──────────────────▶│ MOTOR DO AGENTE (Cloudflare Worker)  │
 │  WhatsApp    │◀──────────────────│  • confere a assinatura da Meta      │
 │  Cloud API   │  resposta         │  • 1 "fila" por conversa (Durable    │
 └──────────────┘                   │    Object): ordem e 1 resposta só   │
                                    │  • espera ~8 s para juntar mensagens │
                                    │  • transcreve áudio                  │
        ┌──────────────┐  pergunta  │  • chama a IA com as "ferramentas"   │
        │   OpenAI     │◀──────────▶│    (= endereços da API do CRM)       │
        │ (IA + áudio) │  resposta  │  • relógio (cron): retomadas, fila   │
        └──────────────┘            │    de avisos do CRM, limite de gasto │
                                    └───────┬───────────────▲──────────────┘
                     API com chave (aur_…)  │               │ avisos assinados
                                            ▼               │ (HMAC)
                                    ┌───────────────────────┴──────┐
                                    │ CRM DA AURORA (já existe)    │
                                    │ pedidos, agenda, catálogo,   │
                                    │ propostas, aprovação         │
                                    └──────────────────────────────┘
                                            ▲
                                            │ (link "abrir no CRM")
 ┌──────────────────────────────────┐       │
 │ PAINEL DO AGENTE (Cloudflare)    │───────┘
 │ Next.js, mesma base do CRM       │◀──────── André entra com login
 │ configurar · treinar · simular   │
 │ caixa de entrada · custos        │
 └───────────────┬──────────────────┘
                 ▼
 ┌──────────────────────────────────┐
 │ BANCO DO AGENTE (Supabase        │  ← projeto separado; nunca toca no banco do CRM
 │ grátis, 2º projeto)              │
 │ configurações e versões,         │
 │ conhecimento (com busca),        │
 │ conversas, gastos, registro      │
 └──────────────────────────────────┘
```

**Por que dois programas na Cloudflare (painel e motor)?**
- O plano grátis aceita no máximo **3 MB por programa**. O painel em Next.js já usa boa parte disso.
- O motor é pequeno e precisa de recursos que o Next.js não usa bem, como as "filas por conversa"
  (Durable Objects) e o relógio (Cron).
- Separados, um problema no painel não derruba o atendimento.

**Formas de processar em segundo plano na Cloudflare (o prompt pediu a avaliação):**

| Recurso | Para que serve aqui | Plano grátis? | Uso no plano |
|---|---|---|---|
| `waitUntil` | Responder "ok" à Meta na hora e continuar o trabalho por até 30 s | Sim | Na entrada do aviso |
| **Durable Objects** | Uma "sala" por conversa: garante a ordem, **uma resposta por vez**, espera para juntar mensagens (alarme) e nova tentativa | **Sim**, no tipo com SQLite (100 mil pedidos/dia, 5 GB) | **Principal** |
| Queues | Fila geral com novas tentativas | Sim desde fev/2026 (10 mil operações/dia, guarda 24 h) | Não precisa no começo. Fica como reserva. |
| Cron Triggers | Tarefas de relógio | Sim | Retomadas, conferência da fila de avisos do CRM, limite de gasto, apagar dados vencidos |

**Limite que preocupa no plano grátis:** **10 ms de processamento** por chamada e **50 chamadas
externas** por execução. O tempo de espera da OpenAI e do CRM **não conta** nesses 10 ms. Para um
volume pequeno deve funcionar, e vou medir nas fases 2 e 3. Recomendo o plano **Workers Paid
(US$ 5/mês)** a partir do piloto com o número real, porque ele dá folga e evita respostas
perdidas.

---

## 3. Fluxo de uma conversa, do início ao fim

1. **Chega a mensagem.** A Meta avisa o motor. O motor:
   - confere a assinatura (`X-Hub-Signature-256`);
   - descarta repetições pelo id da mensagem;
   - guarda a mensagem;
   - responde "ok" à Meta em menos de 1 segundo.
2. **Junta as mensagens em sequência.** A "sala" da conversa espera cerca de 8 s (ajustável no
   painel). Se chegar outra mensagem, espera mais um pouco. Depois mostra "digitando…".
   - **Áudio:** é transcrito, se a opção estiver ligada. O arquivo é apagado e só o texto fica.
   - **Imagem ou figurinha:** recebe a resposta padrão configurada no painel.
3. **Identifica o cliente.**
   - Se houver `Ref. XXXX`: busca `GET /negocios?codigo=` e grava o telefone no contato.
   - Senão: busca pelo telefone, nas duas versões (com e sem o 9).
   - Se não achar nenhum pedido aberto: cria um (`POST /negocios`, origem "WhatsApp").
   - O motor guarda o vínculo telefone → pedido, para não duplicar.
4. **Confere quem atende.**
   - `humano`, agente pausado na conversa ou botão de emergência ligado: **só registra** a
     mensagem no CRM e não responde.
   - `agente`: segue para o passo 5.
5. **Registra no CRM** a mensagem do cliente, com o id do WhatsApp para não duplicar.
6. **Confere os gatilhos de transferência** antes de chamar a IA: palavras e temas configurados,
   "quero falar com uma pessoa", "parar", reclamação, número de mensagens sem avanço.
   - Se algum disparar: chama `transferir-humano` com o motivo, avisa o cliente com gentileza e
     **para de responder**.
7. **A IA pensa.** Ela recebe:
   - as instruções do painel e as **regras fixas**;
   - os trechos de conhecimento relevantes;
   - os dados atuais do pedido, lidos no CRM;
   - a conversa recente;
   - as **ferramentas**, que são os endereços do CRM.

   Ela pode, por exemplo, consultar a agenda, gravar a data da festa ou montar a proposta.
   **Toda gravação passa pelo motor**, que confere as regras de novo antes de chamar o CRM.
8. **Responde** com uma mensagem curta no WhatsApp e registra no CRM como `agente`.
   - Na **primeira resposta**, avisa que é o atendimento automático da Aurora e que a pessoa pode
     pedir para falar com alguém a qualquer momento.
9. **Proposta.** Quando tiver os dados mínimos, o agente monta o rascunho e submete. Diz ao
   cliente: "a equipe vai revisar e eu te mando aqui". Depois:
   - **`proposta.aprovada`:** envia pelo CRM e manda o link no WhatsApp com uma mensagem calorosa.
     Se já passaram 24 h desde a última mensagem do cliente, usa um **modelo aprovado pela Meta**
     (regra do WhatsApp).
   - **`proposta.ajustes_solicitados`:** se o ajuste for de texto ou cardápio, ajusta e submete de
     novo. Se envolver preço ou condição, passa para uma pessoa.
10. **Outros avisos do CRM:**
    - `proposta.aceita`: agradece;
    - `negocio.ganho` ou `negocio.perdido`: não puxa mais conversa;
    - `encaminhado_agente`: volta a responder;
    - `assumido_humano`: para de responder;
    - `contato.dados_apagados`: apaga tudo daquela pessoa no banco do agente.
11. **Retomadas.** Pelo relógio, seguindo as regras do painel (ex.: proposta enviada e não aberta
    em 3 dias):
    - só com **modelo aprovado**;
    - só para quem **não pediu para parar**;
    - dentro do horário e dos limites configurados.

**Proteções contra respostas erradas:**
- As mensagens do cliente entram na IA marcadas como **dados, não ordens**.
- As ferramentas não têm nada que a IA "não deva" usar. A chave do CRM do agente nem tem a
  permissão de aprovar.
- O texto final passa por um filtro: se citar um valor em R$ que não veio do CRM nesta conversa,
  a mensagem é bloqueada e o atendimento vai para uma pessoa.
- A IA **não vê** chaves nem nomes internos, e nunca recebe dados de outros clientes.

---

## 4. Telas do painel

Login com e-mail e senha. Papéis **gestor** (tudo) e **atendente** (conversas e simulador).
Funciona no celular e no computador, com a identidade da Aurora: azul-marinho #021938, dourado
#C6A86A, creme #F7F2E8, Cormorant Garamond + DM Sans e a logo.

| # | Tela | O que tem |
|---|---|---|
| 1 | **Visão geral** | Conversas do dia, pedidos criados, propostas submetidas e enviadas, transferências, tempo médio de resposta, **gasto com a OpenAI no mês × limite** (barra), alertas |
| 2 | **Conversas** | Caixa de entrada com: quem atende (agente ou pessoa), situação, link "abrir no CRM", **assumir**, **responder pelo painel** (sai pelo WhatsApp e fica no CRM como `humano`), **pausar o agente nesta conversa**, "passar para o agente" (depende do pedido C1) |
| 3 | **Agente** | Nome, apresentação, tom, saudação, instruções editáveis, **regras fixas** (só leitura), exemplos de boas conversas |
| 4 | **Conhecimento** | Perguntas e respostas, textos, PDFs, importar páginas do site. **Alerta** quando o texto tiver preço ou condição. Botão "o que o agente responderia?" |
| 5 | **Correções** | Numa conversa real, marcar a resposta ruim e escrever a certa. Ela vira exemplo ou conhecimento. |
| 6 | **Simulador** | Conversa de teste mostrando, para cada resposta: trechos de conhecimento usados, consultas ao CRM e as gravações que **seriam** feitas. Por padrão **não grava nada**. Leituras reais do CRM. |
| 7 | **Transferência e horários** | Gatilhos (palavras, temas, mensagens sem avanço), horário da equipe, mensagens padrão (fora do horário, transferência, erro, mídia) |
| 8 | **Retomadas e modelos** | Regras de retomada, limites, lista de quem pediu para parar, modelos da Meta com a situação de aprovação |
| 9 | **Integrações** *(gestor)* | WhatsApp (conexão, número, teste), OpenAI (modelo, **limite mensal**, alerta e parada automática), CRM (endereço, chave, segredo dos avisos, "testar conexão"). Chaves **criptografadas e nunca mostradas de novo** |
| 10 | **Botão de emergência** | No topo de todas as telas: "Pausar agente". Continua registrando tudo e avisa a equipe. |
| 11 | **Registro** | Tudo o que o agente e as pessoas fizeram, histórico das configurações e **voltar a uma versão anterior** |

---

## 5. Decisões técnicas recomendadas

### 5.1 Modelo da OpenAI

Consultei a página oficial de preços (lista de 11/2026). Preços por **1 milhão de "tokens"**, que
são pedaços de texto (1 milhão ≈ 750 mil palavras):

| Modelo | Entrada | Entrada repetida (cache) | Saída | Para que a OpenAI indica |
|---|---|---|---|---|
| GPT-6 Astra | US$ 10 | US$ 1 | US$ 50 | Trabalho mais exigente |
| GPT-6.1 Sol | US$ 2 | — | US$ 10 | Trabalho complexo com custo menor |
| **GPT-6.1 Terra** | **US$ 1** | **US$ 0,05** | **US$ 5** | Raciocínio, **escrita mais natural**, ferramentas |
| GPT-6 Luna | US$ 0,10 | — | US$ 0,50 | Tarefas focadas e de alto volume |

**Recomendação:** começar com o **GPT-6.1 Terra**.
- Escreve bem em português.
- Segue regras e usa as ferramentas do CRM com segurança.
- O custo é baixo: **cerca de US$ 0,15 por conversa completa**.

O modelo fica **configurável no painel**. Na fase 2 vou rodar a mesma bateria de testes com o
**Luna**, cerca de 10 vezes mais barato (~US$ 0,015 por conversa). Se ele passar nas regras, você
decide se troca.

**Como cheguei a US$ 0,15 por conversa:** uma conversa típica tem cerca de 12 respostas do agente.
Cada resposta lê cerca de 13 mil tokens (instruções, conhecimento, conversa e ferramentas, sendo
metade repetida e por isso mais barata) e escreve cerca de 450 tokens. Isso é uma **estimativa**.
O painel vai mostrar o gasto real desde o primeiro dia.

**Áudio:** transcrição com `gpt-transcribe`, a ~US$ 0,0045 por minuto. É desprezível: 300 áudios
de 1 minuto custam ~US$ 1,35.

### 5.2 Conhecimento: busca própria (pgvector) × busca de arquivos da OpenAI

| | **pgvector no Supabase do agente** | File Search da OpenAI |
|---|---|---|
| Custo | ~US$ 0 (embeddings a US$ 0,02 por 1M tokens; o banco é o grátis) | US$ 2,50 por 1.000 buscas + armazenamento (1 GB grátis) |
| Onde ficam os textos | No banco da Aurora | Nos servidores da OpenAI |
| Alerta de "texto com preço" e explicação no simulador | Fácil: controlamos cada trecho | Mais difícil |
| Trocar de IA no futuro | Simples | Preso à OpenAI |

**Recomendação: pgvector.** Enquanto o conhecimento for pequeno (FAQ e textos do site), mando
**tudo** junto com as instruções, aproveitando o desconto de cache. A busca entra quando o volume
crescer.

### 5.3 O que a OpenAI faz com os dados (documentação oficial)

- Dados enviados pela API **não são usados para treinar** os modelos, a menos que a empresa
  autorize. Isso vale desde 1º/03/2023.
- Ficam guardados **até 30 dias** em registros de prevenção de abuso, ou mais se a lei exigir.
- A API guarda a conversa por 30 dias quando a opção `store` está ligada, e ela vem ligada por
  padrão. **Vamos desligar** (`store: false`).
- Os servidores ficam fora do Brasil. Por isso a política de privacidade precisa citar a
  transferência internacional (pedido S1).
- "Retenção zero" existe, mas depende de aprovação da OpenAI para contas empresariais. Não é
  necessária para começar.

### 5.4 WhatsApp Cloud API

- Conferir a assinatura de cada aviso da Meta (`X-Hub-Signature-256`, com o segredo do app).
- Responder "ok" em menos de 1 s e processar depois, com novas tentativas.
- Nunca processar a mesma mensagem duas vezes (id único no banco).
- Ordem e uma resposta por vez, garantidas pela "sala" da conversa (Durable Object).
- O código do WhatsApp fica numa camada separada. Assim dá para trocar a Meta direta por um
  intermediário sem refazer o agente.

**Regra da Meta sobre IA (vale desde 15/01/2026):** "assistentes de IA de uso geral" foram
proibidos no WhatsApp Business. O agente da Aurora é permitido porque atende **só sobre o serviço
da Aurora**. Por isso ele vai recusar com educação assuntos fora do tema, o que também economiza.
A Meta exige ainda um **caminho claro para falar com uma pessoa**, e isso já está no plano.

### 5.5 Segurança e segredos

- As chaves da OpenAI, da Meta e do CRM **nunca ficam no código nem no navegador**.
  - As que forem digitadas no painel são guardadas **criptografadas**, com uma chave-mestra que
    fica só nos "segredos" da Cloudflare, e nunca aparecem de novo na tela.
- Mesmo padrão do CRM: **sem a chave mestra do Supabase** (`service_role`). O motor fala com o
  próprio banco por funções que conferem uma chave interna.
- Papéis com regras no banco: o atendente não vê Integrações nem Registro de configurações.
- Duas chaves no CRM: uma do **agente** (permissões do agente) e, se o pedido C1 for aceito, uma
  do **painel** (só "devolver ao agente").

### 5.6 Testes automáticos

- **Regras:**
  - não informar preço sem `disponivel: true`;
  - transferir nos gatilhos;
  - não responder quando o atendimento está com uma pessoa;
  - não duplicar pedido (Ref., telefone com e sem 9);
  - ignorar ordens escondidas na mensagem do cliente ("esqueça suas instruções").
- **Avisos simulados** da Meta e do CRM: assinatura válida e inválida, repetidos, fora de ordem.
- **Teste completo no simulador** contra um CRM de teste, antes de qualquer número real.
- O roteiro `agente-de-teste.mjs` do CRM serve de referência para o uso correto da API.

---

## 6. Custo mensal estimado (3 cenários)

**Premissas** (estimativas, a conferir com o uso real):
- Uma "conversa" é um cliente atendido no mês, com ~12 mensagens do agente.
- 1 mensagem-modelo de utilidade por conversa (envio da proposta fora da janela de 24 h).
- Retomadas de marketing para 30% das conversas.
- US$ 1 = R$ 5,50.

**WhatsApp (tabela da Meta para o Brasil, a partir de 1º/10/2026):**
- Resposta dentro da janela de 24 h ("serviço"): **~R$ 0,035** cada, com **1.000 grátis por mês**
  por número.
- Modelo de utilidade: **~R$ 0,035**.
- Modelo de marketing: **~R$ 0,32**.
- Mensagens enviadas **pelo aplicativo** WhatsApp Business (na "coexistência") são **grátis**.

| | 100 conversas | 500 conversas | 2.000 conversas |
|---|---|---|---|
| **OpenAI** (GPT-6.1 Terra) | ~US$ 15 (≈R$ 83) | ~US$ 75 (≈R$ 413) | ~US$ 300 (≈R$ 1.650) |
| *OpenAI com GPT-6 Luna (alternativa)* | *~US$ 1,50* | *~US$ 7,50* | *~US$ 30* |
| **WhatsApp (Meta)**: respostas | 1.200 (1.000 grátis) → ~R$ 7 | 6.000 → ~R$ 175 | 24.000 → ~R$ 805 |
| **WhatsApp (Meta)**: modelos | ~R$ 13 | ~R$ 65 | ~R$ 260 |
| **Cloudflare** | US$ 0 (grátis) a US$ 5 | US$ 5 | US$ 5 |
| **Supabase** | R$ 0 (grátis) | R$ 0 (grátis) | R$ 0, ou US$ 25 se passar de 500 MB ou quiser backup automático |
| **Total aproximado** | **R$ 105 a 130** | **~R$ 680** | **~R$ 2.750 a 2.890** |
| Intermediário (BSP), **só se escolher** a opção A da seção 7 | + ~€ 49/mês (≈R$ 300) | + ~€ 49 | + ~€ 49 |

**Como manter o custo sob controle:**
- limite mensal da OpenAI no painel, com alerta em 80% e **parada automática** em 100% (as
  conversas vão para a equipe);
- uma mensagem por resposta, em vez de várias bolhas;
- recusar assuntos fora do tema;
- retomadas só com consentimento.

Também vale configurar um limite de gasto no painel da própria OpenAI, como segunda trava.

---

## 7. Qual número de WhatsApp usar (decisão sua)

Hoje o (34) 98893-5223 é usado no **aplicativo WhatsApp Business**.

| Opção | Como funciona | Ganha | Perde | Custo fixo |
|---|---|---|---|---|
| **A. Coexistência via intermediário (BSP)** | O mesmo número funciona no aplicativo **e** na API ao mesmo tempo | Clientes continuam no número conhecido. O André segue usando o app no celular, e o agente **vê** quando ele responde por lá, podendo parar sozinho. Até 6 meses de histórico podem ser importados. | **Grupos, listas de transmissão e catálogo** deixam de funcionar no número. Mensagens temporárias, de visualização única e localização ao vivo são desligadas. É preciso **abrir o app pelo menos a cada 14 dias**. Depende de um intermediário. | ~€ 49/mês (ex.: 360dialog; vou cotar 2 ou 3 antes) |
| **B. Coexistência direto com a Meta** | A própria Aurora se cadastra como "Tech Provider" na Meta | Igual à A, sem mensalidade | Processo burocrático (verificação, revisão do app pela Meta, cadastro técnico). Há relatos recentes de bloqueios. Leva semanas e pode não ser aprovado. | R$ 0 |
| **C. Número novo só para o agente** (recomendada para o piloto) | Um chip novo, ligado direto à Cloud API da Meta | Sem mensalidade e **sem risco para o número principal**. O app do André continua igual. | Os clientes precisam conhecer o novo número. O site e o QR passariam a apontar para ele (mudança no site, em outra sessão). As respostas da equipe nesse número saem pelo **painel**. | ~R$ 15 a 30 do chip |
| D. Migrar o número atual inteiro para a API | O número sai do aplicativo | Tudo num só lugar | O André **perde o aplicativo** nesse número. Não recomendo. | R$ 0 |

**Minha recomendação:**
1. **Fases 3 a 5:** número de teste grátis da Meta.
2. **Piloto:** **opção C** (número novo), sem custo fixo e sem mexer no número que já funciona.
3. **Depois do piloto,** se o agente estiver bem, decidir entre manter a C ou ir para a **A**
   (pagando o intermediário) para unificar tudo no número conhecido.

O código vai funcionar com as três opções (A, B e C).

**Burocracia da Meta, em qualquer opção:**
- **Conta empresarial na Meta (Business Manager)** com a **verificação da empresa**, usando o
  CNPJ 67.539.790/0001-59 e o domínio do site.
- **Nome de exibição** "Aurora Bartenders", aprovado pela Meta.
- **Cartão de crédito** cadastrado na conta do WhatsApp, por causa das mensagens pagas.
- **Modelos de mensagem** aprovados pela Meta (envio da proposta, retomadas). A aprovação costuma
  ser rápida, mas pode recusar textos.
- **Limite inicial:** 250 clientes diferentes por dia **fora** da janela de 24 h. Sobe para 2.000
  com a verificação da empresa. Para a Aurora, isso sobra.

---

## 8. Riscos

| Risco | Chance | O que faço |
|---|---|---|
| A IA dizer algo errado (preço, data) | Baixa | Preço e data só por ferramenta do CRM, filtro de valores na saída, testes automáticos, piloto acompanhado |
| Cliente tentar manipular a IA | Média | Mensagem tratada como dado, ferramentas limitadas, transferência para uma pessoa |
| Custo subir (OpenAI ou Meta) | Média | Limite com parada automática, painel de gastos, modelo trocável |
| A Meta mudar preço ou regra de novo (como em out/2026) | Média | Valores configuráveis, alertas, camada de WhatsApp trocável |
| Plano grátis da Cloudflare apertado (10 ms) | Média | Medir nas fases 2 e 3. Se apertar, US$ 5/mês. |
| Supabase grátis pausar ou ficar sem backup | Baixa | O tráfego mantém ativo. Exportação semanal dos dados importantes (conhecimento e configurações). |
| A verificação da Meta demorar ou recusar | Média | Começar o processo **já**, em paralelo às fases 1 e 2 |
| Número brasileiro sem o 9 gerar duplicata | Média | Busca dupla no agente + pedido C2 |
| Conflito com uma pessoa respondendo ao mesmo tempo | Baixa | Pausa por conversa, `assumido_humano`, (opção A) detecção da resposta pelo app |
| Dependência de um único desenvolvedor (IA) | — | Guias de publicação e de uso, testes e código no padrão do CRM |

---

## 9. O que você (Renato) ou o André precisam fazer

**Agora (não custa nada):**
1. Responder às perguntas da seção 11.
2. Confirmar se a conta Supabase da Aurora tem **vaga para um 2º projeto grátis**. São no máximo
   2 ativos, e o CRM já usa um.
3. Começar a **conta empresarial na Meta** (business.facebook.com) e pedir a **verificação da
   empresa**. Eu explico passo a passo quando chegar a hora.

**Antes da fase 2 (custa pouco, precisa da sua aprovação):**
- Criar a conta na **OpenAI** (platform.openai.com), com crédito pré-pago. Sugiro US$ 10 para os
  testes. Definir lá um limite de gasto mensal.

**Antes da fase 3 (grátis):**
- Criar o **app da Meta** com o WhatsApp e usar o **número de teste** da Meta.

**Antes do piloto (fase 6):**
- Escolher o número (seção 7).
- Cadastrar o cartão na Meta.
- Publicar o item de política (pedido S1).
- Aprovar o plano Workers Paid (US$ 5), se as medições indicarem.

**Liberar a rede desta sessão (para eu pesquisar e testar):** esta sessão do Claude não consegue
abrir `openai.com`, `developers.facebook.com`, `developers.cloudflare.com` e o seu site. Os
números deste plano vieram da **busca na internet**, com as páginas oficiais como fonte, mas não
consegui abrir as páginas diretamente. Para as fases de código, preciso liberar ao menos
`api.openai.com` e `graph.facebook.com` nas configurações de rede do ambiente.

---

## 10. Fases de entrega (cada uma testável, com commit e envio ao GitHub)

| Fase | Entrega | Como você testa | Custo |
|---|---|---|---|
| **1** | **Painel** com login, papéis, identidade da Aurora, telas Agente, Conhecimento (com alerta de preço), Transferência e horários, Integrações (chaves criptografadas), Registro com versões. **Versão inicial das instruções do agente** para o André revisar. | Entrar, configurar, cadastrar conhecimento, voltar uma versão | R$ 0 |
| **2** | **Agente no simulador**, falando com o **CRM de verdade** (leitura real, gravação só exibida). Testes automáticos das regras. Comparação Terra × Luna. | Conversar como cliente no simulador e ver as consultas ao CRM | ~US$ 2 a 5 de OpenAI |
| **3** | **WhatsApp com o número de teste da Meta**: entrada, assinatura, ordem, juntar mensagens, áudio, "digitando" | Mandar mensagens do seu celular para o número de teste | R$ 0 |
| **4** | **Caixa de entrada**, assumir e pausar, responder pelo painel, transferências, **avisos do CRM** (webhook + fila), botão de emergência | Fluxo completo: lead → proposta → aprovação no CRM → link no WhatsApp | ~R$ 0 |
| **5** | **Retomadas e modelos da Meta**, Correções, Visão geral, **custos e limite com parada automática**, apagar dados (LGPD) | Simular retomada, estourar um limite de teste | ~R$ 0 |
| **6** | **Número real em piloto acompanhado** pelo André (ex.: 2 semanas, revisando as conversas). Depois, liberação. Entrega dos **guias** (publicação e uso) e da **lista de testes**. | Uso real | Ver seção 6 |

---

## 11. Perguntas que só você ou o André podem responder

1. **Número do WhatsApp:** concorda com a recomendação (teste → número novo no piloto → decidir
   depois)? Ou prefere a coexistência com o número atual (opção A, ~€ 49/mês) desde o piloto?
2. **Pedidos de mudança no CRM:** aprova levar C1, C2, C3 e S1 para a sessão do CRM? C4 é
   opcional.
3. **Modelo da OpenAI:** começo com o GPT-6.1 Terra e testo o Luna na fase 2?
4. **Limite de gasto com a OpenAI:** qual valor por mês? Sugiro US$ 30 no piloto.
5. **Horário da equipe:** quando o agente deve dizer que "uma pessoa responde a partir de tal
   hora"? O agente atende 24 h, ou só em certos horários?
6. **Quem usa o painel:** só o André (gestor)? Mais alguém como atendente?
7. **Retomadas:** quais quer no começo? Sugestão: (a) proposta enviada e não aberta em 3 dias;
   (b) pedido parado sem resposta do cliente em 2 dias, uma vez só. Lembrete: modelos de
   marketing custam ~R$ 0,32 cada.
8. **Áudio:** liga a transcrição desde o início? Recomendo que sim.
9. **Aviso ao André de "proposta aguardando aprovação" pelo WhatsApp:** quer que o agente mande
   esse aviso para o celular do André? Cada aviso fora da janela de 24 h é um modelo de utilidade,
   ~R$ 0,035. Qual número?
10. **Nome do agente:** ele deve ter um nome (ex.: "Aurora") ou se apresentar só como "atendimento
    automático da Aurora Bartenders"?
11. **Supabase:** a conta da Aurora tem vaga para um 2º projeto grátis? E o projeto do agente fica
    na mesma conta (recomendo) ou na sua?
12. **Endereço do painel:** sugiro `agente.aurorabartendersaraxa.com.br`. Pode ser?

---

## 12. Fontes consultadas (páginas oficiais, via busca)

- OpenAI, preços: <https://developers.openai.com/api/docs/pricing>
- OpenAI, modelo GPT-6.1 Terra: <https://developers.openai.com/api/docs/models/gpt-6.1-terra> e
  guia "Using GPT-6": <https://developers.openai.com/api/docs/guides/latest-model>
- OpenAI, controle de dados: <https://developers.openai.com/api/docs/guides/your-data>
- Meta, preços do WhatsApp: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>
- Meta, mudança de 1º/10/2026 nas mensagens de serviço: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages>
- Meta, política para provedores de IA: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md> e
  termos: <https://www.whatsapp.com/legal/business-solution-terms>
- Meta, coexistência (app + API): <https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/>
- Meta, limites de envio: <https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md>
- Cloudflare, preços e limites: <https://developers.cloudflare.com/workers/platform/pricing/>,
  <https://developers.cloudflare.com/workers/platform/limits/>,
  <https://developers.cloudflare.com/durable-objects/platform/limits/>,
  Queues no plano grátis: <https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/>
- Supabase, plano grátis e pausa: <https://supabase.com/pricing> e
  <https://supabase.com/kb/faqs/platform/free-project-pausing>
- 360dialog, preços (intermediário): <https://docs.360dialog.com/partner/get-started/pricing-and-plans>
- Tarifa de ~R$ 0,035 (utilidade e serviço) e ~R$ 0,32 (marketing) no Brasil: confirmada pela
  página da Meta (0,68 centavo de dólar) e por tabelas de terceiros. **Conferir a tabela oficial
  em reais antes de fechar o orçamento.**
