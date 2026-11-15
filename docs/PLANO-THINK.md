# Plano: o "motor" do agente com o Cloudflare Think

Escrito em 15/11/2026. **Aprovado pelo Renato em 15/11/2026, com a decisão: tudo na Cloudflare (D1 + Cloudflare Access), desde já.**
Base: [`PASSAGEM-PARA-THINK.md`](PASSAGEM-PARA-THINK.md), [`PLANO.md`](PLANO.md) e o código de `painel/lib/nucleo/`.

## Fontes consultadas

O site `developers.cloudflare.com` está bloqueado na rede desta sessão. Por isso, li a **mesma documentação**
direto no repositório oficial `github.com/cloudflare/agents` (pasta `docs/think/`) e nos pacotes publicados no npm:

| Fonte | O que confirmou |
|---|---|
| `packages/think/README.md` | Think é **experimental** ("a API é estável, mas pode mudar"). Versão atual **0.23.0** (29/10/2026). |
| `docs/think/lifecycle-hooks.md` | Ganchos `beforeTurn` (troca prompt, mensagens, modelo, `providerOptions`), `beforeToolCall`, `afterToolCall`, `onChatResponse`. |
| `docs/think/index.md` ("Choosing a turn API") | `saveMessages()` espera a resposta; `submitMessages()` aceita e responde rápido; `addMessages()` grava sem chamar a IA; `getScheduledTasks()` para tarefas agendadas. |
| `docs/think/messengers.md` | `getMessengers()` + Chat SDK: o **próprio Think entrega** a resposta ao mensageiro (não há ponto documentado para conferir o texto antes de sair). |
| `docs/think/programmatic-submissions.md` | `idempotencyKey`: a mesma mensagem não vira dois turnos. |
| `examples/chat-sdk-messenger/` | Entrada separada → um agente Think por conversa. |
| npm `@chat-adapter/whatsapp` 4.45.0, `README.md` | Confere `X-Hub-Signature-256`, envia modelos (`sendTemplate`), "digitando"; **não edita mensagem**; streaming é "acumula e envia". |
| Teste nesta sessão (`wrangler deploy --dry-run`) | Worker mínimo com Think + AI SDK + OpenAI: **1,30 MB compactado**. |

---

## 1. Como o Think recebe as regras "antes" e "depois" da IA

O ponto mais importante: **as regras não podem depender da IA**, e as regras "depois" precisam rodar **antes** de a
mensagem sair para o WhatsApp. Pela documentação, se o Think entregar sozinho ao WhatsApp (`getMessengers()`), não dá
para garantir isso. Então **o nosso código fica com a entrada e a saída**, e o Think fica com o miolo:

```
WhatsApp (Meta) ──► Entrada (nosso código) ──► Conversa (Think, 1 por telefone) ──► Saída (nosso código) ──► WhatsApp
                    confere assinatura          1. regras ANTES (código, sem IA)
                    ignora repetida             2. IA + ferramentas do CRM (Think)
                    agrupa ~8 s                 3. regras DEPOIS (código)
                                                4. só então envia
```

| Etapa | Onde fica | Reaproveita |
|---|---|---|
| **Antes da IA**: pausado, "parar", conversa com pessoa, gatilho de palavras, sem avanço | Método da classe `Conversa`, **antes** de chamar o Think. Se a regra decide, a IA nem é chamada (a mensagem só é registrada com `addMessages()`). | `agente.ts` passos 1–4, `util.ts` |
| **Instruções** | `getSystemPrompt()` = parte fixa (vai primeiro, aproveita o cache); `beforeTurn` acrescenta a situação atual do CRM no fim. | `prompt.ts`, `regras-fixas.ts` |
| **Ferramentas** | `getTools()`: as mesmas `DEFINICOES`, convertidas para o formato do AI SDK, chamando `executarFerramenta`. `afterToolCall` lê o efeito (transferir, parar, avançou). | `ferramentas.ts`, `crm.ts` |
| **Modelo** | `gpt-6-luna` pelo provedor da OpenAI, com `reasoningEffort: "none"` em `providerOptions`; até 6 rodadas (`maxSteps`). | `openai.ts` (`PRECOS`, `custoUsd`) |
| **Depois da IA**: filtro de R$, data lotada, "prometeu transferir", aviso automático, texto repetido | Depois que `saveMessages()` devolve a resposta, e **antes** do envio. Se o filtro reescrever, a versão final é a que fica na memória. | `agente.ts` passos 5–7 |

**Ponto a confirmar na fase 1:** quando o filtro troca a resposta, a memória do Think precisa guardar a versão
**enviada**, não a original (senão a IA "lembra" de um preço que nunca saiu). Se o Think não permitir trocar a
mensagem guardada, a conversa passa a ter **histórico próprio** (no mesmo SQLite) e o `beforeTurn` entrega esse
histórico ao modelo (opção documentada: `TurnConfig.messages`).

**Rede de segurança contra o "experimental":** o laço da IA fica atrás de uma interface única. Se o Think quebrar numa
versão futura, trocamos só esse arquivo pela classe `Agent` comum (estável) com o laço que já temos hoje (o que fez
45/45). As regras, ferramentas e testes não mudam.

## 2. Como ligar o WhatsApp

| Opção | Prós | Contras |
|---|---|---|
| A. `getMessengers()` do Think + `@chat-adapter/whatsapp` | Menos código. | O Think entrega a resposta sozinho: **não dá para garantir o filtro de R$** antes do envio. Não aceita. |
| B. Chat SDK por fora (como o exemplo `chat-sdk-messenger`) | Adaptador pronto (assinatura, modelos, digitando). | Traz o pacote `chat` inteiro (mais peso) e um "estado" extra de que não precisamos. |
| **C. Entrada e envio próprios, só com `fetch`** (recomendo) | Pequeno (~200 linhas), controle total, segue a regra do projeto ("prefira `fetch` a SDKs grandes"). Usa o adaptador como **referência** do que fazer. | Escrevemos e testamos nós mesmos. |

O que a entrada própria faz: confere `X-Hub-Signature-256` com a chave secreta do app; responde 200 na hora à Meta;
ignora mensagem repetida (pelo id `wamid`); agrupa mensagens seguidas (~8 s, configurável no painel, com o alarme do
Durable Object); mostra "digitando"; áudio → baixa e transcreve (`gpt-transcribe`); envia pela Graph API
(`/{phone_number_id}/messages`) e, fora da janela de 24 h, só modelos aprovados.

## 3. O molde para replicar para outros clientes

**Um código, uma instalação por cliente** (Workers, banco e segredos próprios).

```
nucleo/            regras, ferramentas, instruções (o que já existe em painel/lib/nucleo)
motor/             Worker do agente: Think + entrada do WhatsApp + avisos do CRM
painel/            Worker do painel (Next.js), fala com o motor por "service binding" (sem internet no meio)
clientes/aurora.jsonc   nome, domínio, contas — SEM segredos
scripts/novo-cliente    cria banco e Workers, aplica o schema, pede os segredos
.github/workflows/      testes + bateria com IA → publica em todos os clientes
```

- **Cliente novo:** `npm run novo-cliente` cria tudo na conta da Cloudflare e pede os segredos (sem passar pelo chat).
  O cliente termina no painel em 4 passos: marca → CRM → WhatsApp → IA.
- **Manutenção:** corrigiu no molde → a automação roda os testes e a bateria → só se passar, publica em todos.
- **Nada do cliente no código:** marca (cores, logo), nome "Aurora" e dados iniciais saem do código e vão para a
  configuração.

### Banco: D1 ou Supabase? (decisão sua)

| | **D1 + Cloudflare Access** (recomendo) | Supabase (o atual) |
|---|---|---|
| Tudo numa conta só | Sim | Não (duas contas) |
| Cliente novo | Um comando cria o banco | Precisa criar um projeto Supabase à mão |
| Escalar | Muitos bancos no plano da Cloudflare | **O plano grátis do Supabase só permite 2 projetos ativos** por conta; daí em diante, plano pago por cliente |
| Login | Cloudflare Access (grátis até 50 pessoas; entra com código por e-mail ou Google) | Supabase Auth (pronto) |
| Esforço | Reescrever a camada de banco do painel e portar os 32 testes do banco (as regras do RLS viram código) | Zero |

**Decidido: D1 + Cloudflare Access, desde já** ("vamos começar do jeito certo"). O painel sai do Supabase logo depois
de o motor provar o 45/45 (fase 1b), antes do WhatsApp: assim a Aurora já começa na instalação definitiva.

As **conversas** ficam no SQLite do Durable Object de cada conversa (de qualquer jeito). Os papéis ficam assim:
o banco do painel guarda **configuração, equipe e registro**; o motor guarda **conversas**. Ao salvar no painel, ele
"publica" a configuração para o motor. Assim o motor não precisa de chave mestra de banco nenhum.

## 4. Painel e simulador conversando com o agente

- O painel chama o motor por **service binding** (ligação interna entre Workers, sem endereço público).
- O **Simulador** passa a conversar com o **mesmo** agente Think, em modo simulação (lê o CRM, não grava), numa
  conversa separada (`sim:<id>`). O André testa exatamente o que vai para o WhatsApp.
- A caixa de entrada (fase 3) lê as conversas no motor; assumir/devolver também passa por ele.

## 5. Tamanho e custos

| Item | Situação |
|---|---|
| Worker do **motor** | 1,30 MB compactado no teste mínimo (limite grátis 3 MB). Fica separado do painel. |
| Worker do **painel** | 2,57 MB (fase 2). Junto com o motor estouraria os 3 MB: por isso, dois Workers. |
| Cloudflare | Workers e Durable Objects (SQLite) cabem no **plano grátis** no piloto. Se um dia passar de 3 MB ou do limite diário de uso: plano pago de **US$ 5/mês** por conta. Não contrato nada sem avisar. |
| OpenAI | ~US$ 0,0008 por resposta (bateria). 1.000 respostas ≈ US$ 0,80. Limite de US$ 30/mês mantido, com parada automática. |
| Meta | Conversas iniciadas pelo cliente (janela de 24 h) não são cobradas; **modelos fora da janela** (retomadas, link da proposta) são cobrados por mensagem. Confiro a tabela do Brasil na fase 4, antes de ligar. |

## 6. Riscos do Think ser experimental, e como reduzir

| Risco | Como reduzir |
|---|---|
| A API muda numa versão nova | Versões **fixas** (`@cloudflare/think 0.23.0`, `agents 0.33.0`), sem atualização automática; atualizar só com testes + bateria passando. |
| Algo que precisamos não existe ou some | Laço da IA atrás de uma interface; plano B = classe `Agent` (estável) + o laço atual, já provado. |
| Comportamento difere do laço atual | A **mesma bateria de 15 situações × 3** é o critério: só segue com 45/45. |
| Memória no Durable Object × LGPD | Apagar conversa (`clearMessages` + nossas tabelas) ao receber `contato.dados_apagados`; prazo de 12 meses com tarefa agendada. |

## 7. Fases (depois da sua aprovação), cada uma com commit e push

| Fase | Entrega | Como provar |
|---|---|---|
| **1** | Motor Think com o núcleo; roda a **mesma bateria** | `avaliar.ts` chamando o motor (local, `wrangler dev`): meta 45/45 com `gpt-6-luna`; 27 testes do núcleo verdes |
| **1b** | Painel no **D1 + Cloudflare Access** (sai do Supabase); simulador ligado ao motor | Os 32 testes do banco portados para o D1; login pelo Access |
| **2** | WhatsApp com o número de teste da Meta | Mensagem real ida e volta; assinatura, repetidas, agrupamento e "digitando" testados |
| **3** | Avisos do CRM (HMAC + `GET /eventos`), caixa de entrada, assumir/devolver, simulador ligado ao motor | Testes com avisos assinados de verdade e falsificados |
| **4** | Retomadas, custos, LGPD (parar, apagar, prazo) | Tarefas agendadas testadas com relógio falso |
| **5** | Molde: D1 + Access (se aprovado), `novo-cliente`, publicação automática | Criar um cliente "teste" do zero com um comando |
| **6** | Piloto da Aurora com o número real | Acompanhado |

## 8. O que vou precisar (cada coisa só quando chegar a hora)

- **Fase 1:** acesso de leitura ao repositório do CRM (`qrenatosantos/Aurora`) para subir a cópia local de testes,
  como na sessão anterior. A chave da OpenAI já está no ambiente.
- **Fase 2:** dados do app da Meta (*Phone number ID*, *WABA ID*) e, **pelo formulário seguro**, o token permanente e a
  chave secreta do app; liberar `graph.facebook.com` na rede da sessão.
- **Para publicar:** chave da API da Cloudflare pelo formulário seguro (o plugin da Cloudflare não conectou nesta
  sessão: o proxy recusou).
