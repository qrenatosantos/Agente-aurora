# Plano: a plataforma de agentes (da Cecília para qualquer cliente)

Escrito em 17/11/2026. **Ainda não aprovado**: falta o Renato responder as decisões da seção 9.
Base: [`AVALIACAO-PLATAFORMA.md`](AVALIACAO-PLATAFORMA.md) (direção decidida), [`SITUACAO.md`](SITUACAO.md) (o que está
no ar), [`PLANO-THINK.md`](PLANO-THINK.md) (motor na Cloudflare) e o código atual (`painel/`, `motor/`, `avaliacao/`).

---

## 1. Em uma página

**Objetivo:** a Cecília vira o primeiro agente de uma **plataforma** onde o Renato cria, testa e põe no ar agentes
para qualquer cliente, pelo painel, sem mexer em código, com uma receita (skill) para cada etapa e um manual.

**Como chegar lá sem derrubar a Cecília:** em 8 fases pequenas. Cada etapa termina com testes passando e a
**bateria da Aurora (45/45)** passando de novo. A Aurora é o "cliente de prova": se ela piorar, a etapa não está pronta.

| Fase | O que entrega | Para o Renato, na prática |
|---|---|---|
| 0 | Ambiente de testes separado e a "fotografia" da Cecília de hoje | Mudanças são testadas longe da Cecília real |
| 1 | Banco e painel **multi-cliente** | Aparece a tela "Clientes"; a Aurora vira o cliente nº 1 |
| 2 | **Ficha do agente** em camadas e conhecimento como consulta | A tela "Agente" vira um formulário em abas, sem textão |
| 3 | **Peças de integração** (CRM da Aurora, CRM básico, Google Agenda) | Liga e desliga integrações por cliente |
| 4 | **Canais** (WhatsApp, Messenger, Instagram, chat do site) e caixa de entrada | Conecta canais por cliente; vê todas as conversas num lugar |
| 5 | **Bateria de testes por cliente** e "publicar" | Botão "Testar" e "Publicar"; nada vai ao ar sem passar |
| 6 | **API da plataforma + 8 skills** | O Claude implanta um cliente por você, conferindo cada passo |
| 7 | **Manual** e ensaio com um cliente fictício, depois o 1º cliente real | Você implanta um cliente seguindo o manual |

---

## 2. Ponto de partida (o que já existe e funciona)

| Peça | Onde | Situação |
|---|---|---|
| Painel (Next.js 16 no Cloudflare) | `painel/` | Login, equipe, Agente, Conhecimento, Transferência, Integrações, Registro e versões, Simulador, botão de emergência. **Só um cliente** (tabelas com "linha única") |
| Motor (Worker + Durable Objects + Think) | `motor/` | WhatsApp oficial da Meta, avisos do CRM, lembretes da proposta. **Só um cliente** (lê "a" configuração) |
| Núcleo do agente | `painel/lib/nucleo/` | Regras antes e depois da IA por código; ferramentas e prompt **misturam o genérico com o específico da Aurora** (pacotes, drinks, "festa", horas de bar) |
| Banco D1 | `painel/banco/migracoes/` 0001–0004 | Configuração, segredos cifrados, conhecimento, uso da IA, avisos |
| Testes | `banco.test.ts`, `nucleo.test.ts`, testes do motor, `avaliacao/avaliar.ts` (15 situações × 3) e `avaliacao/qualidade.ts` | Bateria e qualidade **só da Aurora** |
| Publicação | `.github/workflows/publicar.yml` | Cada push no ramo `claude/serene-faraday-w06f6u` testa e **publica direto na Cecília real** |

**O que muda de fundo:** (1) tudo ganha um "dono" (o cliente); (2) o que é da Aurora sai do núcleo e vai para a
ficha dela e para a peça "CRM da Aurora"; (3) o canal deixa de ser só WhatsApp.

---

## 3. Como vai ficar (o desenho)

```
 Canais (adaptadores)                 Motor (um só, para todos os clientes)              Peças de integração
 ────────────────────                 ─────────────────────────────────────              ───────────────────
 WhatsApp ─┐                          descobre o CLIENTE e o AGENTE pelo número/página    CRM da Aurora
 Messenger ┼─► Entrada (confere ──►   Conversa (1 Durable Object por conversa)     ◄──►  CRM básico da plataforma
 Instagram ┤   assinatura, ignora       1. travas ANTES da IA (código)                     Google Agenda
 Site ─────┘   repetida, agrupa)        2. IA + ferramentas das peças ligadas              (futuras: RD, Kommo, Pipedrive…)
                                        3. travas DEPOIS da IA (código)
                                        4. Saída no formato do canal (balões, limites, janela de 24 h)

 Painel (um só): Clientes ▸ [cliente] ▸ Agente (ficha) · Conhecimento · Canais · Integrações · Testes · Conversas · Registro
 API da plataforma (para o Claude): as mesmas operações do painel, com chave própria — as skills usam esta API
 Banco D1 (um só): tudo com "cliente_id"; segredos cifrados por cliente
```

### As camadas do agente e onde cada uma mora

| Camada | Onde mora | Quem edita |
|---|---|---|
| 1. Travas | Código, numa lista fixa; cada uma **liga/desliga** por agente | Ninguém edita o texto; o Renato liga/desliga |
| 2. Identidade e objetivo | Ficha ▸ abas "Identidade" e "Objetivo" → topo do prompt | Renato (painel ou skill) |
| 3. Regras de atendimento | Ficha ▸ "Regras" (lista numerada curta) e "Objeções" | Renato; o gestor do cliente, se você permitir |
| 4. Conhecimento | Base de conhecimento do cliente; o agente **consulta por ferramenta**; só itens marcados "essencial" vão sempre no prompt | Renato e o gestor do cliente |
| 5. Dados vivos | Sistema do cliente, lido a cada mensagem pela peça de integração | O próprio sistema |
| 6. Ferramentas | Vêm das peças ligadas; cada uma com "quando usar" | Código (peça) |
| 7. Exemplos | Ficha ▸ "Exemplos" (3 a 5 conversas-modelo) | Renato |
| 8. Situação atual | Montada a cada mensagem, no fim do prompt | Automático |
| 9. Bateria | Casos comuns a todos + casos do cliente (tela "Testes") | Renato; a skill sugere casos |

A ficha segue as seções da avaliação: identidade, canal (estilo por canal), objetivo, regras, objeções, exemplos,
política de ferramentas, passagem para humano, travas, modelo. **Números (preço, data, condição) nunca entram na
ficha**: só vêm do sistema do cliente, e a trava de preço confere isso por código.

---

## 4. Banco de dados (o que muda, em linguagem simples)

Toda mudança é **migração nova** (`0005_...sql` em diante); nenhuma migração antiga é editada.

| Tabela | O que guarda | Novidade |
|---|---|---|
| `clientes` | nome, apelido curto (ex.: `aurora`), marca (cores, logo), fuso, situação (ativo/pausado) | Nova |
| `membros` | quem da equipe acessa qual cliente e com que papel | Nova. Papéis: **dono da plataforma** (Renato: vê todos), **gestor** e **atendente** (só o próprio cliente) |
| `agentes` | a ficha (por seção), modelo, limites de gasto, **versão rascunho e versão publicada** | Substitui `agente_config` (linha única) |
| `agente_versoes` | histórico de cada publicação, com o resultado da bateria | Substitui `config_versoes` |
| `canais` | tipo (whatsapp, messenger, instagram, site), identificador (número, página, conta), estilo, situação do último teste | Nova |
| `pecas` | integrações ligadas por cliente (CRM da Aurora, CRM básico, Google Agenda…), configuração não secreta, último teste | Substitui `integracoes` (linha única) |
| `segredos` | chaves cifradas, agora **por cliente e por peça/canal** | Ganha `cliente_id` |
| `conhecimento` | + `cliente_id`, + "essencial", + índice de busca por palavras (FTS5 do D1) | Muda |
| `contatos` e `conversas` | quem é a pessoa (telefone, e-mail, @) e em quais canais falou; ligação com o sistema do cliente | Nova (substitui `conversas_whatsapp`) |
| `casos_teste` e `rodadas_teste` | casos da bateria do cliente e resultados | Nova |
| `operacao`, `uso_ia`, `avisos_crm`, `simulacoes`, `registro` | + `cliente_id` (pausa, gasto e limite **por cliente**) | Muda |

**Isolamento entre clientes (o risco número 1):** toda função de `painel/lib/banco/` passa a exigir o cliente e
confere se a pessoa é membro dele. Para cada operação, um teste prova que **a equipe do cliente A não lê nem altera
nada do cliente B**. Sem esse teste verde, a etapa não termina.

---

## 5. As fases, etapa por etapa

Cada etapa = um pedaço pequeno, com commit, testes e prova. Legenda: **Faço** (Claude), **Prova** (como sabemos que
deu certo), **Você** (o que o Renato faz; "nada" quando não precisa).

Regra de todas as etapas: `npm run test:banco`, `test:nucleo`, `test:motor`, `tsc`, `lint`, `build`; e, se mexer no
comportamento do agente, **bateria da Aurora 45/45** e `qualidade.ts` sem piorar. `docs/TESTES.md` e
`docs/SITUACAO.md` atualizados.

### Fase 0 — Preparar o terreno (protege a Cecília)

| # | Faço | Prova | Você |
|---|---|---|---|
| 0.1 | Docs trazidos para este ramo; este plano | Arquivos no ramo | Ler e decidir a seção 9 |
| 0.2 | **Ambiente de testes** na Cloudflare: painel, motor e banco D1 "-teste", com um número de teste do WhatsApp. O ramo `plataforma` publica no teste; o ramo da Cecília continua publicando na Cecília real. Só passa para o real quando você aprovar | Push no ramo de testes muda só o ambiente de testes | Aprovar (custo extra: zero no plano Workers Paid) |
| 0.3 | "Fotografia" da Cecília: rodar bateria e qualidade hoje e guardar o resultado como referência; copiar a configuração atual para `clientes/aurora/` | `avaliacao/RESULTADO.md` com a data de hoje | Nada |
| 0.4 | Trocar o ramo principal do GitHub para o ramo atual, para as sessões não abrirem no ramo velho | Sessão nova abre no ramo certo | Clicar em GitHub ▸ Settings ▸ Default branch (eu passo o caminho) |

### Fase 1 — Multi-cliente, sem mudar o comportamento

| # | Faço | Prova | Você |
|---|---|---|---|
| 1.1 | Tabelas `clientes` e `membros`; papel "dono da plataforma"; a migração cria o cliente `aurora` e põe a equipe atual nele | Testes: dono vê todos; equipe da Aurora só a Aurora | Nada |
| 1.2 | `cliente_id` em todas as tabelas; tabelas de "linha única" viram tabelas por cliente (copiando os dados da Aurora) | Migração aplicada numa cópia do banco real sem perder nada (conferência linha a linha) | Nada |
| 1.3 | `lib/banco/` inteiro passa a exigir o cliente; teste de isolamento para cada operação | ~40 testes novos de "A não vê B" | Nada |
| 1.4 | Painel: tela **Clientes** (lista, criar, pausar) e seletor de cliente no topo; a marca (cores, logo) vem do cliente, não do código | Navegador: criar "Cliente Teste", entrar como gestor dele, não ver a Aurora | Testar no ambiente de testes |
| 1.5 | Motor: descobre o cliente pelo número do WhatsApp (`phone_number_id`) e carrega a configuração dele; nomes das conversas com o cliente na frente, **mantendo as conversas atuais da Cecília** | Bateria 45/45; mensagem real no número de teste | Mandar um "oi" para o número de teste |
| 1.6 | Passar a fase 1 para a Cecília real | Cecília responde normal; Registro sem erros por 24 h | Aprovar a passagem e mandar uma mensagem de teste |

### Fase 2 — A ficha do agente em camadas

| # | Faço | Prova | Você |
|---|---|---|---|
| 2.1 | Formato da ficha (seções da seção 3) com validação; "compilador" que monta o prompt na ordem certa (fixo primeiro, para o cache) | Testes: cada seção aparece no lugar certo; ficha inválida é recusada com mensagem clara | Nada |
| 2.2 | Converter a configuração da Cecília (textão de Instruções) para a ficha, **e tirar do núcleo o que é da Aurora** (pacotes, drinks, festa) para a ficha dela e para a peça "CRM da Aurora" (fase 3.1) | Bateria 45/45 e qualidade igual ou melhor; prompt novo comparado com o antigo | Ler a ficha da Cecília e corrigir o que estiver estranho |
| 2.3 | **Catálogo de travas** no código, cada uma com nome simples e liga/desliga por agente: não inventar preço, parar quando pedir, palavra-gatilho, sem avanço, prometeu transferir, aviso de atendimento automático, texto repetido, fora do assunto. As travas de uma peça (ex.: data lotada) vêm com a peça | Um teste por trava ligada e desligada | Nada |
| 2.4 | **Conhecimento como consulta**: busca por palavras no D1 (FTS5) e ferramenta `consultar_conhecimento`; itens "essenciais" continuam sempre no prompt | Teste com 200 itens: acha a resposta certa; custo por mensagem não sobe | Marcar quais itens da Aurora são essenciais (eu sugiro) |
| 2.5 | Tela **Agente** em abas (Identidade, Objetivo, Regras, Objeções, Exemplos, Passar para pessoa, Travas, Modelo), com **"ver como a IA recebe"** e **rascunho × publicado** (editar não muda o agente no ar até publicar) | Navegador: editar, ver o prompt, publicar, voltar versão | Testar a tela e dizer o que ficou confuso |

### Fase 3 — Peças de integração

| # | Faço | Prova | Você |
|---|---|---|---|
| 3.1 | Formato padrão de "peça": ferramentas, leitura a cada mensagem (situação atual), travas próprias, avisos recebidos e **teste de conexão**. O CRM da Aurora vira a primeira peça; os "dados coletados" deixam de ser "dados da festa" e passam a ser campos definidos na ficha | Bateria 45/45; teste de conexão no painel | Nada |
| 3.2 | **CRM básico da plataforma**, para cliente sem sistema: guarda contato, resumo e o que a pessoa quer; avisa a equipe (e-mail ou WhatsApp) e mostra no painel | Conversa simulada termina com o contato salvo e o aviso enviado | Decidir se entra (seção 9) |
| 3.3 | **Google Agenda**: ver horários livres, marcar, remarcar e cancelar, com regras na ficha (duração, antecedência, horário de atendimento). Trava em código: **só marca em horário que a agenda confirmou livre** e só depois de o cliente confirmar | Teste com agenda de teste: lê livres, marca, remarca e apaga um evento | Criar o projeto no Google Cloud e a "conta de robô" seguindo meu passo a passo (uma vez só) |
| 3.4 | Tela **Integrações** por cliente: liga/desliga peças, cola chaves (cifradas), botão "testar conexão" | Navegador | Testar |
| 3.5 | Modelo para peças futuras (RD Station, Kommo, Pipedrive, HubSpot, sistema próprio): cada uma é um arquivo novo + testes, feita **quando houver cliente que use** | — | Avisar qual sistema o próximo cliente usa |

### Fase 4 — Canais

| # | Faço | Prova | Você |
|---|---|---|---|
| 4.1 | Formato padrão de "canal": receber, conferir assinatura, ignorar repetida, agrupar mensagens, enviar no formato do canal (balões, tamanho máximo, mídia), janela de 24 h. O WhatsApp atual vira o primeiro canal | Testes do motor; bateria 45/45 | Nada |
| 4.2 | Um **endereço único da Meta** para todos os clientes, que descobre cliente e canal pelo número, página ou conta | Testes com avisos assinados de verdade e falsos | Nada |
| 4.3 | **Messenger** (página do Facebook) | Recebeu e respondeu uma mensagem de teste numa página de teste | Pedir à Meta a permissão de mensagens (revisão do app) |
| 4.4 | **Instagram Direct** | Idem, numa conta de teste | Idem, e ligar uma conta profissional de teste |
| 4.5 | **Chat do site**: um código de 1 linha para colar no site do cliente; proteção contra robôs (Turnstile da Cloudflare) e limite por visitante; aparência pela marca do cliente | Página de teste conversa com o agente; robô bloqueado | Nada (no cliente: colar a linha no site) |
| 4.6 | **Contato único**: mesma pessoa em dois canais = um contato (quando der o telefone ou e-mail) | Teste: Instagram + WhatsApp do mesmo telefone viram um contato | Nada |
| 4.7 | **Caixa de entrada** no painel: todas as conversas do cliente, de todos os canais; assumir e devolver para o agente; aviso à equipe quando transferir (pendência antiga da Aurora) | Navegador + mensagem real | Testar com a equipe do André |

### Fase 5 — Testar antes de publicar

| # | Faço | Prova | Você |
|---|---|---|---|
| 5.1 | Bateria em duas partes: **casos comuns** (fora do assunto, tentativa de mudar as regras, "é robô?", pediu pessoa, "parar", não inventar preço) e **casos do cliente** (guardados no banco). Roda pelo motor, com o cliente simulado e o avaliador que já existem | Bateria da Aurora migrada dá 45/45 | Nada |
| 5.2 | Tela **Testes**: ver e criar casos ("quando o cliente disser X, o agente deve Y"), botão **Rodar**, relatório simples (passou/falhou e por quê), custo de cada rodada | Navegador | Criar um caso seu e rodar |
| 5.3 | **Publicar só se passar**: travas 100%; o resto acima do mínimo que você definir. Cada publicação guarda o resultado, e dá para voltar à versão anterior | Tentar publicar uma ficha que quebra uma trava → bloqueado | Nada |

### Fase 6 — API da plataforma e skills

| # | Faço | Prova | Você |
|---|---|---|---|
| 6.1 | **API da plataforma** (para o Claude operar por dentro): criar cliente, ler/gravar ficha, conhecimento, casos de teste, rodar bateria, publicar, ver situação de canais e peças. **Chaves secretas nunca passam pela API nem pelo chat**: só pela tela do painel | Testes de permissão (chave errada, cliente errado) | Gerar a chave da API no painel e guardar no ambiente do Claude (pelo formulário seguro) |
| 6.2 | `scripts/plataforma.mjs`: comando que as skills usam para falar com a API | Comando lista os clientes | Nada |
| 6.3 | As **8 skills** (tabela abaixo), em `.claude/skills/` | Cada uma testada no cliente fictício | Nada |

| Skill | O que faz | Só termina quando | O que pede a você |
|---|---|---|---|
| `/novo-cliente` | Entrevista sobre o negócio e cria o cliente, a marca e a 1ª ficha | O cliente existe e a ficha passa na validação | Respostas da entrevista; logo e cores |
| `/montar-conhecimento` | Lê PDFs, site, perguntas frequentes e monta a base; marca os essenciais | Cada item tem título e fonte; perguntas de teste acham a resposta | Os materiais do cliente |
| `/conectar-canal` | Passo a passo do canal escolhido (WhatsApp, Messenger, Instagram, site) | Recebeu **e** respondeu uma mensagem de teste naquele canal | Colar as chaves no painel; mandar a mensagem de teste |
| `/conectar-agenda` | Liga o Google Agenda e define as regras de horário | Leu horários livres, marcou e apagou um evento de teste | O cliente compartilhar a agenda com o e-mail do robô |
| `/conectar-sistema` | Liga o CRM/sistema do cliente (peça pronta ou nova) | Leu um dado de teste (e gravou, se a peça grava) | Chave do sistema no painel |
| `/testar-agente` | Sugere casos do cliente e roda a bateria | Travas 100% e o resto acima do mínimo | Aprovar os casos sugeridos |
| `/publicar` | Publica a ficha e confere o ar | Bateria verde, canais respondendo, uma conversa real ok | Mandar a mensagem final de conferência |
| `/ajustar-agente` | Muda regra, tom, exemplo ou conhecimento a partir de uma reclamação | A bateria passou de novo e há um caso novo cobrindo o problema | Dizer o que estava errado (print da conversa ajuda) |

Toda skill começa conferindo onde o cliente está (o que já foi feito) e termina com um **relatório curto**: o que fez,
a prova, e o próximo passo.

### Fase 7 — Manual e primeiros clientes

| # | Faço | Prova | Você |
|---|---|---|---|
| 7.1 | `docs/MANUAL-NOVO-CLIENTE.md`: do contrato ao ar, passo a passo, com o que pedir ao cliente (lista de materiais e acessos), quanto tempo cada passo leva e o que fazer se algo falhar | — | Ler |
| 7.2 | **Ensaio**: implantar um cliente fictício do zero (ex.: uma clínica com Google Agenda e chat do site) usando só o manual e as skills, no ambiente de testes. Tudo o que travar vira correção | Cliente fictício respondendo em 2 canais, bateria verde | Seguir o manual comigo e anotar o que confundiu |
| 7.3 | Primeiro cliente real novo | No ar e acompanhado na 1ª semana | Trazer o cliente |

---

## 6. O que fica de fora desta vez (de propósito)

- Construtor visual de fluxos, campanhas de disparo em massa e CRM completo (a plataforma avaliada tem; não é o foco).
- Telegram, e-mail e ligações: o formato de canal fica pronto para eles, mas só entram quando houver cliente.
- Busca "por significado" no conhecimento (Vectorize): só se a busca por palavras não der conta.
- Botão "Conectar WhatsApp" com cadastro incorporado da Meta: depende de você virar **Provedor de Tecnologia** na Meta
  (verificação da empresa). Até lá, conectamos o número de cada cliente pelo passo a passo da skill.
- Cobrança automática dos clientes.

Pendências antigas da Aurora que **entram** no plano: aviso à equipe e caixa de entrada (fase 4.7), assumir/devolver
(4.7). As que **continuam à parte**: modelos da Meta para fora das 24 h, LGPD (apagar dados) e política de
privacidade. Elas passam a valer para todos os clientes e serão feitas uma vez só, depois da fase 4.

## 7. Custos e limites

| Item | Hoje | Com a plataforma |
|---|---|---|
| Cloudflare | Workers Paid (US$ 5/mês) | O mesmo plano serve vários clientes no começo. Limite do Worker no plano pago: 10 MB (hoje: painel 2,57 MB, motor 1,32 MB) |
| OpenAI | ~US$ 0,0008 por resposta | Gasto e limite **por cliente** no painel, com parada automática |
| Bateria de testes | < US$ 0,05 por rodada | Igual, por cliente |
| Meta | Mensagens dentro das 24 h sem custo | Igual; modelos fora das 24 h são cobrados (fase de LGPD/modelos) |
| Google Agenda | — | Sem custo |

## 8. Riscos e como reduzir

| Risco | Como reduzir |
|---|---|
| Mexer na base e quebrar a Cecília | Ambiente de testes (0.2), bateria 45/45 em toda etapa, passagem para o real só com a sua aprovação |
| Dado de um cliente aparecer para outro | Cliente obrigatório em toda função do banco + teste de isolamento por operação |
| Tirar a Aurora do núcleo mudar o jeito da Cecília | Fotografia (0.3) e comparação do prompt antigo com o novo; qualidade não pode cair |
| Revisão da Meta (Messenger/Instagram) demorar | Pedir cedo (na fase 1); fazer o chat do site antes, se a Meta atrasar |
| Think é experimental | Versões fixas e plano B já existente (laço próprio) |
| Plataforma crescer demais | Seção 6: só entra o que um cliente real pedir |

---

## 9. O que o Renato precisa decidir

| # | Decisão | Minha recomendação |
|---|---|---|
| 1 | **Uma plataforma para todos** (um painel, um motor, um banco, tudo separado por cliente) ou uma instalação separada por cliente? | **Uma para todos.** É mais simples para você, o app da Meta trabalha com um endereço principal para avisos, e cliente grande pode ganhar instalação própria depois |
| 2 | **Quem paga a IA (OpenAI)?** A sua chave para todos, com limite por cliente e repasse no preço, ou a chave de cada cliente? | Sua chave (implantação mais rápida), com limite e custo por cliente visíveis no painel. O painel aceita as duas |
| 3 | **Conta da Cloudflare:** tudo na sua conta? | Sim |
| 4 | **Google Agenda:** o cliente compartilha a agenda com o e-mail de um "robô" seu, ou botão "Entrar com Google"? | Compartilhar com o robô para começar (sem revisão do Google). O botão exige verificação do Google, que leva semanas; fica para depois |
| 5 | **CRM básico da plataforma** para clientes sem sistema? | Sim, simples (contato, resumo, aviso à equipe) |
| 6 | **O que a equipe do cliente pode mexer no painel?** | Gestor do cliente: conhecimento, conversas, horários e equipe. Ficha, travas, canais e integrações: só você |
| 7 | **Ambiente de testes separado** da Cecília real? | Sim |
| 8 | **Qual canal depois do WhatsApp?** | Depende do próximo cliente. Sem cliente definido: chat do site (não depende da Meta) enquanto a revisão da Meta anda |
| 9 | **Quem é o próximo cliente real** (ramo e sistema que usa)? | Define qual peça vem primeiro na fase 3 |
| 10 | **Nome e endereço da plataforma** (ex.: `painel.suaempresa.com.br`) | Ter um domínio seu: o painel deixa de ter a cara da Aurora, e a Meta pede site com domínio para verificar a empresa |
| 11 | **Novidades na Cecília ficam em espera** durante as fases 1 a 3? | Sim, só correções. Mudanças grandes na Cecília ao mesmo tempo atrasam e arriscam a migração |

## 10. O que eu preciso de você, por fase (resumo)

| Quando | O quê |
|---|---|
| Agora | Responder a seção 9 |
| Fase 0 | Trocar o ramo principal no GitHub (eu passo o caminho) |
| Fase 1 | Mandar mensagens de teste; aprovar a passagem para a Cecília real; **iniciar a revisão do app na Meta** (Messenger e Instagram) e a verificação da empresa |
| Fase 2 | Revisar a ficha da Cecília e a tela nova |
| Fase 3 | Projeto no Google Cloud + conta de robô (passo a passo meu); dizer o sistema do próximo cliente |
| Fase 4 | Página do Facebook e conta do Instagram de teste; testar a caixa de entrada com o André |
| Fase 5 | Criar e rodar um caso de teste seu |
| Fase 6 | Gerar a chave da API no painel e guardar no ambiente do Claude |
| Fase 7 | Fazer o ensaio comigo seguindo o manual; trazer o 1º cliente |
