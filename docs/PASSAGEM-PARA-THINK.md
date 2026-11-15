# Passagem de bastão: do projeto atual para o agente com Cloudflare Think

Escrito em 15/11/2026, ao fim das fases 1 e 2, para a próxima sessão **não começar do zero**.
Leia junto: [`PLANO.md`](PLANO.md) (decisões aprovadas), [`TESTES.md`](TESTES.md) (o que já foi provado),
[`PEDIDOS-CRM.md`](PEDIDOS-CRM.md) (o que falta no CRM) e [`../avaliacao/RESULTADO.md`](../avaliacao/RESULTADO.md).

---

## 1. Em uma página

- **Cliente:** Aurora Bartenders (André Procácio), bar e coquetelaria para eventos em Araxá/MG.
- **Dono do projeto:** Renato (RS Queiroz Soluções Técnicas). Não é programador; quer **escalar para outros clientes**.
- **CRM da Aurora:** pronto, no repositório `qrenatosantos/Aurora`. **Não alterar.** O agente fala com ele só pela
  API `/api/v1` (chave `aur_…`, permissões limitadas, avisos assinados com HMAC). Documentação: `docs/API-DO-AGENTE.md`
  daquele repositório.
- **Este repositório** (`qrenatosantos/Agente-aurora`, ramo `claude/new-session-vdr8pz`) já tem:
  - **o painel** (Next.js 16 + Supabase próprio), fases 1 e 2 prontas: login, papéis, Agente, Conhecimento,
    Transferência e horários, Integrações (chaves cifradas), Equipe, Registro e versões, botão de emergência e **Simulador**;
  - **o núcleo do agente** (`painel/lib/nucleo/`, TypeScript puro): instruções, ferramentas da API do CRM,
    regras garantidas por código e chamada à OpenAI;
  - **testes:** 32 do banco, 27 do núcleo e uma **bateria com IA de verdade** (15 situações; `gpt-6-luna` 45/45).
- **Nova decisão do Renato:** construir o agente com o **Cloudflare Think** (Agents SDK), em outra sessão.

---

## 2. O que reaproveitar (e o que o Think substitui)

| Peça atual | Arquivo | Com o Think |
|---|---|---|
| Laço da IA (chamar modelo → ferramentas → repetir) | `nucleo/agente.ts` (dentro de `processarTurno`) e `nucleo/openai.ts` | **Substituído** pelo laço do Think (`getModel()` + ferramentas). |
| Histórico e estado da conversa | `EstadoConversa` em `nucleo/tipos.ts`; hoje guardado no Supabase (`simulacoes`) | **Substituído** pela memória do Think (SQLite do Durable Object). Uma instância por conversa (telefone). |
| Ordem e "uma resposta por vez" por conversa | planejado com Durable Object | **Vem pronto**: o Think roda num Durable Object. |
| **Ferramentas** (nomes, descrições, esquemas) | `nucleo/ferramentas.ts` → `DEFINICOES` | **Reaproveitar** o texto e os esquemas (convertidos para o formato de ferramentas do Think/AI SDK). |
| **Execução das ferramentas** (modo real e simulação, busca do telefone com e sem o 9, criar pedido UMA vez, dados mínimos da proposta, data no passado) | `nucleo/ferramentas.ts` → `executarFerramenta`, `garantirNegocio`, `faltamParaProposta` | **Reaproveitar** quase igual (é só `fetch` para a API do CRM). |
| **Instruções** (parte fixa + situação atual do CRM) | `nucleo/prompt.ts` | **Reaproveitar** como o "system prompt" do Think. A parte fixa primeiro (cache), a situação do CRM por último. |
| **Regras fixas** (as que o André vê e não edita) | `nucleo/regras-fixas.ts` | **Reaproveitar** igual. |
| **Regras por código**, ANTES da IA: pausado, conversa com pessoa, pediu para parar, gatilho de palavras, sem avanço | `nucleo/agente.ts` (passos 1–4) | **Reaproveitar** num gancho antes do turno do Think. Elas não podem depender da IA. |
| **Regras por código**, DEPOIS da IA: filtro de R$ sem base no CRM (reescreve; se insistir, bloqueia e transfere), data lotada/bloqueada → transfere, "prometeu transferir" → transfere, aviso automático só na 1ª resposta, texto repetido | `nucleo/agente.ts` (passos 5–7) e `nucleo/util.ts` | **Reaproveitar** num gancho depois da resposta e antes de enviar ao WhatsApp. **Confirmar no Think onde dá para interceptar a resposta antes de ela sair** (ver a seção 5). |
| Horário da equipe e mensagem "volta segunda às 09:00" | `nucleo/horario.ts` | Reaproveitar igual. |
| Cliente da API do CRM | `nucleo/crm.ts` (`ClienteCrm`, `variantesTelefone`) | Reaproveitar igual. |
| Tabela de preços dos modelos e cálculo do custo | `nucleo/openai.ts` → `PRECOS`, `custoUsd` | Reaproveitar. Se usar o AI Gateway da Cloudflare, ele também mostra o gasto. |
| **Testes sem IA** (27) | `nucleo/nucleo.test.ts` | Reaproveitar os casos (são a especificação das regras). |
| **Bateria com IA de verdade** (15 situações × 3 rodadas) | `avaliacao/avaliar.ts` | **Reaproveitar as situações e as conferências.** Trocar só a chamada (`processarTurno` → o agente Think). |
| **Painel** (configurar, treinar, simulador, integrações, emergência) | `painel/` | **Sugestão: manter.** O agente Think lê a configuração e o conhecimento do banco do painel. |
| Banco do painel | `supabase/schema.sql` + `dados-iniciais.sql` | Manter. O motor vai precisar de acesso próprio (ver a seção 6). |

> Em resumo: o Think troca o "motor" (laço da IA, memória, fila por conversa). As **regras, ferramentas,
> instruções, testes e o painel continuam valendo**, e são justamente o que deu trabalho para acertar.

---

## 3. Decisões já tomadas (não reabrir sem o Renato)

1. **Nada inventado:** preço, data, disponibilidade e condição só vêm do CRM, garantido também por código.
2. **Modelo:** o Renato pediu modelos baratos. Na bateria, `gpt-6-luna` fez 45/45 e `gpt-4o-mini` 40/45. O padrão é o
   `gpt-6-luna`, trocável no painel. Limite de **US$ 30/mês** no piloto, com parada automática.
   - Para usar o `gpt-6-luna` **com ferramentas** pelo Chat Completions, é obrigatório `reasoning_effort: "none"` (testado).
     Pelo AI SDK, confira como o provedor da OpenAI passa isso, ou use a API Responses.
   - O `gpt-4o-mini` **não aceita** `reasoning_effort`.
3. **Sem preço cadastrado:** o agente segue e monta a proposta (a equipe define o valor). Só transfere se o cliente
   **insistir** no valor antes.
4. **Data lotada/bloqueada:** transfere na hora (o sistema avisa o cliente com delicadeza).
5. **Pedido fora dos pacotes:** não afirmar se a Aurora faz ou não. Transferir.
6. **Número de WhatsApp:**
   - testes: número de teste da Meta;
   - piloto: número da Aurora no portfólio **da Aurora**.
7. **Contas da Meta:** o **app fica na conta do Renato** (RS Queiroz Soluções Técnicas), e o número de cada cliente
   fica na conta do cliente. Caminho para escalar: virar **Provedor de Tecnologia** com **Cadastro incorporado**
   (*Embedded Signup*): botão "Conectar WhatsApp" no painel e coexistência com o app do celular.
   - Pendências do Renato: verificação da empresa na Meta (site com HTTPS e e-mail no domínio) e um CNAE de
     tecnologia (falar com o contador).
8. **Hospedagem:** Cloudflare Workers. Supabase grátis (2º projeto da conta). Sem `service_role`.
9. **LGPD:**
   - aviso de atendimento automático na 1ª resposta;
   - "parar" respeitado;
   - prazo de guarda de 12 meses, igual ao do CRM;
   - apagar tudo ao receber `contato.dados_apagados`;
   - o item S1 da política de privacidade deve ser publicado antes do piloto.

---

## 4. O que falta (fases 3 a 6 do plano)

| Fase | Entrega | Observação com o Think |
|---|---|---|
| 3 | WhatsApp com o número de teste | Os exemplos usam o **Chat SDK** com Telegram, mas existe o adaptador **`@chat-adapter/whatsapp`** (Cloud API, botões e modelos; v4.45.0, de 13/11/2026). Avaliar usar no lugar do Telegram. Ver a seção 5. |
| 4 | Caixa de entrada, assumir e responder pelo painel, transferências, **avisos do CRM** (webhook HMAC + fila `GET /eventos`), proposta aprovada → enviar link (modelo da Meta fora da janela de 24 h) | Os avisos do CRM podem chegar num endpoint do Worker, que acorda a conversa certa. |
| 5 | Retomadas (proposta não aberta em 3 dias; parado 2 dias, 1 vez), modelos da Meta, correções, métricas, custo, apagar dados (LGPD) | Retomadas = tarefas agendadas do Think (confirmar). |
| 6 | Piloto acompanhado com o número real; guias de publicação e de uso | — |

Pendências do CRM (levar à sessão do CRM): **C1** (devolver ao agente pela API), **C2** (celular com e sem o 9; já
reproduzido na cópia local), **C3** ("não contatar" no contato), C4 (foto dos drinks) e **S1** (política de privacidade).

---

## 5. Pontos de atenção do Think (conferir na documentação antes de codar)

1. **Ele é experimental (prévia).** A própria Cloudflare diz que partes da API podem mudar. Para o primeiro cliente:
   fixar a versão do pacote e ter testes.
2. **WhatsApp:**
   - os exemplos do Think usam o **Chat SDK** (`@chat-adapter/telegram`), e existe o **`@chat-adapter/whatsapp`**:
     avaliar trocar um pelo outro (modelo: `examples/chat-sdk-messenger` do repositório `cloudflare/agents`);
   - conferir se o adaptador verifica `X-Hub-Signature-256`, responde rápido à Meta e envia modelos;
   - se não servir, escrever a entrada (webhook) e o envio (Graph API `/{phone_number_id}/messages`) à mão;
   - incluir "digitando" e o agrupamento de mensagens seguidas (~8 s, configurável no painel);
   - não processar a mesma mensagem duas vezes (pelo id da mensagem);
   - áudio: baixar a mídia e transcrever (`gpt-transcribe`).
3. **Interceptar a resposta antes de enviar:** as regras "depois da IA" (filtro de R$, data sem vaga, promessa de
   transferir, aviso automático) precisam rodar **antes** da mensagem sair para o WhatsApp. Se o Think fizer streaming
   direto para o cliente, desligar esse streaming no canal do WhatsApp e enviar só a resposta final já conferida.
4. **Regras antes da IA:** gatilhos e "parar" decididos sem chamar o modelo (economia e segurança).
5. **Modelo:** `getModel()` com o provedor da OpenAI do AI SDK. Testar `gpt-6-luna` com ferramentas (precisa de
   `reasoning_effort: "none"` no Chat Completions). Opcional: AI Gateway da Cloudflare para log e limite de gasto.
6. **Tamanho do Worker:** o plano grátis aceita 3 MB compactados. O AI SDK e o Think somam peso; medir com
   `wrangler deploy --dry-run`. O plano pago custa US$ 5/mês, se necessário.
7. **Memória do Think × LGPD:** as conversas ficam no SQLite do Durable Object. Implementar apagar e prazo de guarda lá também.
8. **Simulador do painel:** hoje ele usa `processarTurno`. Com o Think, o painel pode conversar com o próprio agente
   (em modo simulação), para o André testar exatamente o que vai para o WhatsApp.

---

## 6. Como rodar e testar (o que funcionou nesta sessão)

```bash
npm install && npm run test:banco && npm run test:nucleo      # raiz
cd painel && npm install && npx tsc --noEmit && npm run lint && npm run build
```

- **CRM de teste local:**
  1. suba um segundo Supabase local (`supabase start` com outras portas);
  2. rode o `supabase/schema.sql` e o `dados-iniciais.sql` **do CRM**;
  3. `next start -p 3200` no código do CRM;
  4. crie o gestor e a chave com `rpc/criar_chave_api`;
  5. bloqueie 12/06/2027 em `bloqueios_agenda` para a bateria.
- **OpenAI nesta nuvem:**
  - a chave foi salva como "segredo de rede" do ambiente (`api.openai.com`), e o proxy a injeta;
  - o Node só sai com `NODE_USE_ENV_PROXY=1`;
  - no código, use uma chave de mentira (`sk-proxy-injected…`).
- **Bateria:**
  `CRM_URL=… CRM_CHAVE=aur_… OPENAI_CHAVE=sk-… NODE_USE_ENV_PROXY=1 node avaliacao/avaliar.ts gpt-6-luna --rodadas 3`
  (custa centavos).
- **Ambiente Claude:** existe o ambiente "Agente-aurora" (rede: `api.openai.com`, site da Aurora). Para a Meta,
  liberar `graph.facebook.com`.
- **Cloudflare:** nesta sessão, o plugin que conecta à conta **não conseguiu se conectar** ("Proxy refused to open a
  tunnel: 403"), porque a rede do ambiente não libera o endereço dele. Na sessão nova, se acontecer o mesmo, liberar
  na rede do ambiente `mcp.cloudflare.com` (e `api.cloudflare.com` para o wrangler) ou usar uma chave da API pelo
  formulário seguro. As skills e a documentação do plugin funcionam sem isso.

---

## 7. Meta: o que já existe (16/11/2026)

- Conta de desenvolvedor criada. App **"SDR Aurora"** com o caso de uso "Conectar-se com os clientes pelo WhatsApp",
  no portfólio empresarial **"RQ Digital"** (do Renato). Renomear o app para a marca do Renato quando for atender
  outros clientes.
- **Número de teste:** +1 (555) 142-3124
  - Phone Number ID: `1482095894980440`
  - Identificação da conta (WABA ID): `972377628902303`
- A tela da Meta mostra a Graph API **v25.0**. O padrão do painel está em `v23.0` (`integracoes.whatsapp_graph_versao`):
  usar **v25.0**.
- Segredos (token permanente do usuário do sistema e chave secreta do app): **só pelo formulário seguro**.

## 8. O que o Renato ainda precisa fazer

1. Criar o **app na Meta**, com a conta dele (guia na conversa anterior): pegar o *Phone number ID* e o *WABA ID*,
   cadastrar o próprio WhatsApp como destinatário de teste, gerar o **token permanente** (usuário do sistema) e a
   **chave secreta do app**. Os dois últimos só pelo formulário seguro, nunca no chat.
2. Ter uma **conta na Cloudflare** e uma chave da API (ou o plugin) na nova sessão.
3. Levar os **pedidos ao CRM** para a sessão do CRM.
4. Verificação da empresa na Meta e CNAE (contador), em paralelo.

---

## 9. Modelos prontos da Cloudflare que encaixam (repositório `cloudflare/agents`, pasta `examples/`)

| Exemplo | Por que interessa |
|---|---|
| `chat-sdk-messenger` | Separa a entrada do mensageiro (webhook), o estado (filas, travas) e a IA (`ConversationAgent extends Think`, um por conversa). Trocar o Telegram pelo `@chat-adapter/whatsapp`. |
| `think-chat-sdk` | O jeito "nativo" do Think: `getMessengers()` e um painelzinho para inspecionar a conversa. |
| `think-workflows` | Passo de IA durável + **espera aprovação humana** + efeito garantido por código. Combina com "a proposta só sai depois que o André aprova". |
| `github-webhook` | Avisos assinados com HMAC, um agente por entidade e eventos guardados. Modelo para os **avisos do CRM** (`X-Aurora-Assinatura`). |
| `guides/human-in-the-loop` | Ferramentas que pedem aprovação antes de executar (`needsApproval`). |

## 10. Meta do Renato: fácil de configurar, manter e replicar para outros clientes

Direção combinada: **um código-molde, uma instalação por cliente**.

1. **Nada do cliente no código.** Nome, marca (cores, logo), instruções, conhecimento, endereço e chave do CRM, número de
   WhatsApp e modelo de IA ficam na configuração (banco e segredos).
   - Hoje ainda estão fixos "Aurora": a marca do painel (`painel/lib/marca-servidor.ts`, `public/aurora/`) e os
     dados iniciais (`supabase/dados-iniciais.sql`). Separar em "dados de exemplo" e "dados do cliente".
2. **Cada cliente com sua instalação isolada** (Worker, banco e segredos próprios): LGPD, segurança e custo por cliente.
3. **Cliente novo em um comando ou botão:**
   - um script ou assistente cria o Worker e o banco, aplica o schema e pede os segredos (pelo formulário seguro);
   - o cliente termina no painel, em 4 passos: marca, CRM, WhatsApp (botão "Conectar" = Cadastro incorporado do app
     de Provedor de Tecnologia do Renato) e IA.
4. **Manutenção única:**
   - corrigir no molde;
   - uma automação (GitHub Actions) roda `test:banco`, `test:nucleo` e a bateria com IA;
   - só se passar, publica em todos os clientes (lista de clientes num arquivo de configuração).
5. **Conector de CRM separado**: o mesmo kit de CRM reaproveita tudo; um CRM diferente troca só essa peça.
6. **Decidir no novo chat:**
   - banco no **D1** (tudo na Cloudflare, uma conta) ou continuar no **Supabase** (já pronto e testado);
   - a chave da OpenAI fica com o Renato (ele repassa o custo, e o painel já mede o gasto) ou com cada cliente;
   - quando passar de ~15–20 clientes, avaliar uma instalação só para todos (multi-cliente).
