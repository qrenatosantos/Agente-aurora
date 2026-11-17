# Plano: a plataforma de agentes (da Cecília para qualquer cliente)

Escrito em 17/11/2026. Revisado no mesmo dia com as respostas do Renato (seção 10).
**Situação:** Fase 0 feita e em produção em 17/11/2026 (ver `OPERACAO.md`). Próximo passo: Fase 1.
Base: [`AVALIACAO-PLATAFORMA.md`](AVALIACAO-PLATAFORMA.md) (direção), [`SITUACAO.md`](SITUACAO.md) (o que está no ar),
[`PLANO-THINK.md`](PLANO-THINK.md) (motor na Cloudflare) e o código atual (`painel/`, `motor/`, `avaliacao/`).

---

## 1. Em uma página

São **duas faces do mesmo sistema**:

| | **Estúdio** (só o Renato) | **Portal do cliente** (entregue a cada cliente) |
|---|---|---|
| Para quê | O "meu GPT Maker": criar, configurar, testar, publicar e manter os agentes de todos os clientes, e acompanhar os clientes (contrato, plano, gasto) | O cliente acompanha o agente dele: conversas, assumir a conversa, resultados, equipe e horários |
| Quem entra | Renato (com confirmação em duas etapas no login) | Equipe do cliente (gestor e atendentes) |
| Pode mexer em | Tudo: ficha do agente, conhecimento, canais, integrações, testes, limites | **Só** equipe (quem recebe os contatos e a distribuição entre eles) e horários de atendimento. Ver conversas, assumir e devolver, ver resultados |
| CRM | O "CRM" do Renato: os clientes dele | **Cliente sem CRM:** portal com um CRM simples (contatos e funil) + aba do agente. **Cliente com CRM:** o agente grava no CRM dele, e o portal mostra só o agente (conversas, resultados, equipe, horários) |

**Por que no mesmo projeto, e não num projeto separado:** o Estúdio e o Portal usam o **mesmo agente, o mesmo banco e as
mesmas conversas**. Separar em dois projetos duplicaria o agente e, cedo ou tarde, um ficaria diferente do outro (é aí
que as coisas quebram). O que fica separado é o **endereço e o programa publicado**: o Portal é publicado como um
programa à parte, que **não tem** as telas do Estúdio (não estão escondidas: não existem nele). Cada fase será feita
numa **sessão (chat) nova**, como explica a seção 9.

**Como chegar lá sem derrubar a Cecília:** em fases pequenas, num **ambiente de testes separado**. Cada etapa termina com
os testes passando. A Cecília entra na plataforma só como **demonstração** (cópia congelada de 17/11): a bateria dela
serve de prova de que a reorganização não estragou o agente. A Cecília real segue no ramo dela, sem ser tocada (decisão 16).

| Fase | O que entrega |
|---|---|
| 0 | Ambiente de testes, alertas de erro, cópias de segurança e a "fotografia" da Cecília de hoje |
| 1 | Base **multi-cliente** e a tela de clientes do Estúdio (a Aurora vira o cliente nº 1) |
| 2 | **Ficha do agente** em camadas, **modelos de agente** prontos e conhecimento como consulta |
| 3 | **Peças de integração** (CRM da Aurora, CRM simples, Google Agenda) |
| 4 | **Canais** (WhatsApp, chat do site, Messenger, Instagram) |
| 5 | **Testes por cliente** e "publicar só se passar" |
| 6 | **Consumo e cobrança**: limite por cliente, avisos e excedente a preço de custo |
| 7 | **Portal do cliente**: conversas, assumir, resultados, equipe, distribuição e horários |
| 8 | **API do Estúdio + 8 skills** |
| 9 | **Manual** e ensaio com um cliente fictício |

---

## 2. Ponto de partida (o que já existe e funciona)

| Peça | Onde | Situação |
|---|---|---|
| Painel (Next.js 16 no Cloudflare) | `painel/` | Login, equipe, Agente, Conhecimento, Transferência, Integrações, Registro e versões, Simulador, botão de emergência. **Só um cliente** |
| Motor (Worker + Durable Objects + Think) | `motor/` | WhatsApp oficial da Meta, avisos do CRM, lembretes. **Só um cliente** |
| Núcleo do agente | `painel/lib/nucleo/` | Travas antes e depois da IA por código; ferramentas e prompt **misturam o genérico com o específico da Aurora** (pacotes, drinks, "festa", horas de bar) |
| Banco D1 | `painel/banco/migracoes/` 0001–0004 | Configuração, segredos cifrados, conhecimento, uso da IA, avisos |
| Testes | `banco.test.ts`, `nucleo.test.ts`, testes do motor, `avaliacao/avaliar.ts` (15 × 3), `avaliacao/qualidade.ts` | Só da Aurora |
| Publicação | `.github/workflows/publicar.yml` | Cada envio ao ramo `claude/serene-faraday-w06f6u` testa e **publica direto na Cecília real** |

**O que muda de fundo:** (1) tudo ganha um dono (o cliente); (2) o que é da Aurora sai do núcleo e vai para a ficha
dela e para a peça "CRM da Aurora"; (3) o canal deixa de ser só WhatsApp; (4) o painel vira duas faces (Estúdio e Portal).

---

## 3. Como vai ficar (o desenho)

```
 Canais                     Motor (um só, para todos os clientes)                    Peças de integração
 ──────                     ─────────────────────────────────────                    ───────────────────
 WhatsApp ─┐                descobre o CLIENTE pelo número / página / site            CRM da Aurora
 Site ─────┼─► Entrada ──►  Conversa (1 por pessoa, em fila: uma resposta por vez) ◄─► CRM simples do Portal
 Messenger ┤   (confere      1. travas ANTES da IA (código)                            Google Agenda
 Instagram ┘   assinatura,   2. IA + ferramentas das peças ligadas                     (futuras: RD, Kommo,
               repetidas,    3. travas DEPOIS da IA (código)                            Pipedrive, HubSpot…)
               agrupa)       4. distribui para a equipe quando passa para pessoa
                             5. sai no formato do canal

 Estúdio (Renato)   ── mesmo banco ──   Portal do cliente (cada cliente, só o que é dele)
 API do Estúdio (para o Claude) ── as skills usam esta API
 Banco D1 (um só): tudo com "cliente"; chaves cifradas por cliente
```

### As camadas do agente e onde cada uma mora

| Camada | Onde mora | Quem edita |
|---|---|---|
| 1. Travas | Código, numa lista fixa; cada uma liga/desliga por agente | Renato liga/desliga |
| 2. Identidade e objetivo | Ficha ▸ "Identidade" e "Objetivo" → topo do prompt | Renato |
| 3. Regras de atendimento | Ficha ▸ "Regras" (lista curta numerada) e "Objeções" | Renato |
| 4. Conhecimento | Base do cliente; o agente **consulta por ferramenta**; só os itens "essenciais" vão sempre no prompt | Renato |
| 5. Dados vivos | Sistema do cliente, lido a cada mensagem pela peça | O próprio sistema |
| 6. Ferramentas | Vêm das peças ligadas, cada uma com "quando usar" | Código |
| 7. Exemplos | Ficha ▸ "Exemplos" (3 a 5 conversas-modelo) | Renato |
| 8. Situação atual | Montada a cada mensagem, no fim do prompt | Automático |
| 9. Bateria | Casos comuns + casos do cliente | Renato (a skill sugere) |

Números (preço, data, condição) **nunca** entram na ficha: vêm do sistema do cliente, e a trava de preço confere por código.

### Modelos de agente (o ponto de partida de cada cliente)

Ao criar um cliente, o Renato escolhe um modelo, que já vem com objetivo, regras, travas, peças e casos de teste
sugeridos. Depois ajusta.

| Modelo | Objetivo | Termina quando | Exemplo |
|---|---|---|---|
| **Atendente que fecha** | Atender, montar e enviar proposta | Proposta preparada para a equipe aprovar | Aurora (Cecília) |
| **SDR (qualificador)** | Fazer as perguntas de qualificação e passar o contato pronto para um vendedor ou corretor | Contato qualificado entregue à pessoa certa, com resumo | Imobiliária, loja de planejados |
| **Agendador** | Tirar dúvidas e marcar horário | Horário marcado na agenda | Clínica, salão, consultoria |
| **Suporte** | Responder dúvidas pela base de conhecimento | Dúvida resolvida ou passada para a equipe | Pós-venda |

---

## 4. Banco de dados (o que muda, em linguagem simples)

Toda mudança é **migração nova** (`0005_...sql` em diante); nenhuma migração antiga é editada.

| Tabela | O que guarda | Novidade |
|---|---|---|
| `clientes` | nome, apelido curto (`aurora`), marca, fuso, situação, **plano contratado** (valor, limite de gasto da IA, dia de fechamento), contato do responsável | Nova. É o "CRM do Renato" |
| `membros` | quem acessa qual cliente e com que papel | Nova. Papéis: **dono da plataforma** (Renato, só no Estúdio), **gestor** e **atendente** do cliente (só no Portal) |
| `agentes` | a ficha (por seção), modelo de agente, modelo de IA, **rascunho e versão publicada** | Substitui `agente_config` (linha única) |
| `agente_versoes` | cada publicação, com o resultado da bateria | Substitui `config_versoes` |
| `canais` | tipo (whatsapp, site, messenger, instagram), identificador, estilo, último teste | Nova |
| `pecas` | integrações ligadas por cliente, configuração não secreta, último teste | Substitui `integracoes` |
| `segredos` | chaves cifradas, **por cliente e por peça/canal** | Ganha "cliente" |
| `conhecimento` | + cliente, + "essencial", + busca por palavras (FTS5 do D1) | Muda |
| `contatos`, `conversas` | a pessoa (telefone, e-mail, @), seus canais, etapa no funil (CRM simples), quem da equipe atende | Nova |
| `distribuicao` | regra de distribuição (rodízio, só quem está no horário) e de quem é a vez | Nova |
| `casos_teste`, `rodadas_teste` | bateria do cliente e resultados | Nova |
| `consumo_mensal` | gasto da IA por cliente e mês, limite, excedente, avisos enviados | Nova |
| `operacao`, `uso_ia`, `avisos_crm`, `simulacoes`, `registro` | + cliente | Muda |

**Isolamento entre clientes (o risco número 1):** toda função de `painel/lib/banco/` passa a exigir o cliente e confere
se a pessoa é membro dele. Para **cada** operação, um teste prova que a equipe do cliente A não lê nem altera nada do
cliente B, e que ninguém do Portal alcança as operações do Estúdio. Sem esse teste verde, a etapa não termina.

---

## 5. Confiabilidade e segurança (vale para todas as fases)

O Renato pediu: "não quero coisa quebrando e deixando o cliente na mão". Nenhum sistema tem risco zero; o objetivo é
**errar pouco, perceber na hora e consertar rápido**. O que entra:

| Proteção | Como funciona |
|---|---|
| Ambiente de testes | Toda mudança vai primeiro para cópias de teste (painel, motor, banco, número de WhatsApp de teste). A produção só recebe com a aprovação do Renato |
| Testes automáticos | Antes de qualquer publicação: testes do banco (incluindo isolamento), do agente, do motor, tipos e padrão de código. Falhou = não publica |
| Bateria com IA | Por cliente, antes de publicar mudanças no agente. Trava quebrada = não publica |
| Voltar atrás | Cada versão do agente fica guardada; "voltar para a versão anterior" é um clique. O código também volta à versão anterior pela Cloudflare |
| Cópias de segurança | O banco D1 guarda histórico de 30 dias e pode ser restaurado em qualquer ponto (Time Travel). Uma cópia semanal extra fica guardada no R2 |
| Se a IA cair | O agente manda a mensagem de "erro" configurada, passa a conversa para a equipe e avisa o Renato. Ninguém fica sem resposta e sem aviso |
| Alertas para o Renato | Por e-mail (e WhatsApp, quando houver número próprio): erros repetidos, canal desconectado, chave da Meta perto de vencer, gasto chegando no limite, conversa parada sem resposta |
| Conferência automática | A cada 5 minutos, um "teste de saúde" confere motor, banco, OpenAI e canais de cada cliente |
| Acesso | Senhas guardadas com hash; tentativas limitadas; **confirmação em duas etapas** (código no celular) para o Estúdio; o Portal não tem as telas do Estúdio |
| Chaves | Cifradas no banco; nunca aparecem em tela, chat ou API, só os 4 últimos caracteres |
| Registro | Toda alteração fica registrada: quem, quando, o quê |
| Versões fixas | Bibliotecas com versão travada; atualizar só com testes e bateria passando |

---

## 6. As fases, etapa por etapa

Legenda: **Faço** (Claude), **Prova** (como sabemos que deu certo), **Você** (o que o Renato faz).
Em toda etapa: testes do banco, do núcleo e do motor, tipos, padrão de código e build; se mexer no comportamento do
agente, **bateria da Aurora 45/45** e qualidade sem piorar. `docs/TESTES.md` e `docs/SITUACAO.md` atualizados.

### Fase 0 — Preparar o terreno

| # | Faço | Prova | Você |
|---|---|---|---|
| 0.1 | Docs trazidos; este plano | Feito | Responder a seção 11 |
| 0.2 | **Ambiente de testes**: painel, motor e banco "-teste" na sua conta. Um ramo novo, `plataforma`, publica só no teste; o ramo da Cecília continua publicando na real | Envio ao ramo `plataforma` muda só o teste | Nada (custo extra: zero no seu plano) |
| 0.3 | **Alertas** por e-mail para você (erros do motor, falha da IA) e **teste de saúde** a cada 5 min | Erro provocado de propósito chega no seu e-mail | Confirmar o e-mail que a Cloudflare vai mandar |
| 0.4 | **Cópia semanal** do banco no R2 e roteiro de restauração testado | Restaurar uma cópia no ambiente de testes | Nada |
| 0.5 | "Fotografia" da Cecília: bateria e qualidade de hoje guardadas como referência | `avaliacao/RESULTADO.md` atualizado | Nada |
| 0.6 | Trocar o ramo principal do GitHub para o atual | Sessão nova abre no ramo certo | Um clique no GitHub (eu passo o caminho) |

### Fase 1 — Multi-cliente (sem mudar o comportamento)

| # | Faço | Prova | Você |
|---|---|---|---|
| 1.1 | Tabelas `clientes` e `membros`; papel "dono da plataforma"; a Aurora vira o cliente `aurora` com a equipe atual | Testes: você vê todos; a equipe da Aurora só a Aurora | Nada |
| 1.2 | "Cliente" em todas as tabelas; as de linha única viram por cliente (copiando os dados da Aurora) | Migração numa cópia do banco real, conferida linha a linha | Nada |
| 1.3 | `lib/banco/` inteiro exige o cliente; teste de isolamento por operação | ~40 testes novos | Nada |
| 1.4 | Estúdio: tela **Clientes** (lista, criar, pausar, plano contratado, limite de gasto) e troca de cliente no topo; a marca vem do cliente | Navegador: criar "Cliente Teste" e conferir que um não vê o outro | Testar no ambiente de testes |
| 1.5 | Motor descobre o cliente pelo número do WhatsApp; nomes das conversas com o cliente, **mantendo as conversas atuais da Cecília** | Bateria 45/45; mensagem real no número de teste | Mandar um "oi" de teste |
| 1.6 | Confirmação em duas etapas no login do Estúdio | Login pede o código do celular | Instalar um app de código (Google Authenticator ou similar) |
| 1.7 | Passar a fase 1 para a Cecília real | Cecília normal; Registro sem erros por 24 h | Aprovar e mandar uma mensagem |

### Fase 2 — Ficha do agente e modelos

| # | Faço | Prova | Você |
|---|---|---|---|
| 2.1 | Formato da ficha com validação; "montador" do prompt na ordem certa (fixo primeiro, para o cache) | Testes por seção; ficha inválida recusada com mensagem clara | Nada |
| 2.2 | Converter a Cecília para a ficha e **tirar do núcleo o que é da Aurora** (vai para a ficha e para a peça "CRM da Aurora", 3.1) | Bateria 45/45; qualidade igual ou melhor; prompt novo comparado com o antigo | Ler a ficha da Cecília |
| 2.3 | **Catálogo de travas** no código (não inventar preço, parar quando pedir, palavra-gatilho, sem avanço, prometeu passar para pessoa, aviso de atendimento automático, texto repetido, fora do assunto), cada uma liga/desliga | Um teste por trava, ligada e desligada | Nada |
| 2.4 | **Modelos de agente** (Atendente que fecha, SDR, Agendador, Suporte), cada um com ficha, travas e casos de teste iniciais | Criar um cliente de cada modelo no teste e conversar | Ler os modelos e dizer o que falta (ex.: perguntas típicas de SDR de imobiliária) |
| 2.5 | **Conhecimento como consulta** (busca por palavras no D1) + "essenciais" sempre no prompt | 200 itens: acha a resposta certa; custo por mensagem não sobe | Conferir os essenciais da Aurora (eu sugiro) |
| 2.6 | Tela **Agente** do Estúdio em abas, com "ver como a IA recebe" e **rascunho × publicado** | Navegador: editar, ver, publicar, voltar versão | Testar a tela |

### Fase 3 — Peças de integração

| # | Faço | Prova | Você |
|---|---|---|---|
| 3.1 | Formato padrão de peça (ferramentas, leitura a cada mensagem, travas próprias, avisos, **teste de conexão**). O CRM da Aurora vira a 1ª peça; "dados da festa" viram "campos a coletar", definidos na ficha | Bateria 45/45 | Nada |
| 3.2 | **CRM simples** (para cliente sem CRM): contatos, funil com etapas, resumo da conversa, quem atende | Conversa simulada termina com o contato no funil | Nada |
| 3.3 | **Google Agenda** pelo "robô": o cliente compartilha a agenda com o e-mail do robô (sem senha nenhuma). Ver horários livres, marcar, remarcar, cancelar. Trava: só marca em horário confirmado livre e depois do "sim" do cliente | Agenda de teste: lê, marca, remarca e apaga | Criar o projeto no Google Cloud e o robô seguindo meu passo a passo (uma vez só, grátis) |
| 3.4 | Tela **Integrações** do Estúdio: liga/desliga, chaves cifradas, "testar conexão" | Navegador | Testar |
| 3.5 | Peças futuras (RD Station, Kommo, Pipedrive, HubSpot, sistema próprio do cliente): uma por vez, **quando houver cliente que use** | — | Avisar quando fechar um cliente |

### Fase 4 — Canais

| # | Faço | Prova | Você |
|---|---|---|---|
| 4.1 | Formato padrão de canal (receber, conferir assinatura, repetidas, agrupar, enviar no formato do canal, janela de 24 h). WhatsApp vira o 1º | Testes; bateria 45/45 | Nada |
| 4.2 | Endereço único da Meta para todos os clientes (descobre o cliente pelo número ou página) | Avisos verdadeiros e falsos testados | Nada |
| 4.3 | **Chat do site**: uma linha de código para colar no site do cliente; proteção contra robôs (Turnstile); aparência da marca | Página de teste conversa; robô bloqueado | Nada |
| 4.4 | **Messenger** | Recebe e responde numa página de teste | Pedir à Meta a permissão (depende da verificação da empresa, que pede domínio) |
| 4.5 | **Instagram Direct** | Idem numa conta de teste | Idem |
| 4.6 | **Contato único** em vários canais (pelo telefone ou e-mail informado) | Instagram + WhatsApp do mesmo telefone = 1 contato | Nada |

### Fase 5 — Testar antes de publicar

| # | Faço | Prova | Você |
|---|---|---|---|
| 5.1 | Bateria em duas partes: **casos comuns** (fora do assunto, tentar mudar as regras, "é robô?", pediu pessoa, "parar", preço inventado) + **casos do cliente** no banco; roda pelo motor | A bateria da Aurora migrada dá 45/45 | Nada |
| 5.2 | Tela **Testes** no Estúdio: casos em linguagem simples, botão Rodar, relatório e custo | Navegador | Criar e rodar um caso seu |
| 5.3 | **Publicar só se passar** (travas 100%); cada publicação guarda o resultado | Ficha que quebra trava → bloqueada | Nada |

### Fase 6 — Consumo e cobrança da IA

Decisão do Renato: a OpenAI é paga por ele; cada cliente tem um limite mensal; o excedente é cobrado do cliente
**a preço de custo**, **só se o cliente autorizar**, e vai no máximo até **1,3× o limite**.

Como funciona, mês a mês:

| Gasto do mês | O que acontece |
|---|---|
| 80% do limite | Aviso ao cliente (Portal; e-mail quando houver domínio) e a você: "está perto do limite". O Portal mostra o botão **"Autorizo o saldo extra"** (só o gestor do cliente), com o valor máximo do extra (0,3× o limite, a preço de custo) |
| 90% e 95% | Lembrete, se ainda não autorizou |
| 100%, **com** autorização | O agente continua; o excedente é contado e aparece no Portal e no Estúdio |
| 100%, **sem** autorização | O agente pausa como no teto (mensagens vão para a equipe, com aviso ao contato); você e o cliente são avisados; se o cliente autorizar pelo Portal, o agente volta na hora |
| 1,3× o limite | O agente pausa. As mensagens novas vão para a equipe do cliente com um aviso gentil ao contato (ninguém fica sem resposta). Só você libera, no Estúdio |
| Virada do mês | Tudo zera; a autorização vale só para o mês em que foi dada |

| # | Faço | Prova | Você |
|---|---|---|---|
| 6.1 | Gasto por cliente e mês (já medimos por resposta; passa a ser por cliente) | Conta bate com o painel da OpenAI (diferença < 5%) | Nada |
| 6.2 | Avisos e regras da tabela acima: 80/90/95%, botão de autorização no Portal (registrado: quem autorizou e quando), pausa no teto de 1,3× e liberação por você | Relógio e gastos falsos nos testes, cada linha da tabela | Nada |
| 6.3 | Tela **Consumo** no Estúdio (todos os clientes) e no Portal (só o dele): gasto do mês, limite, excedente em reais | Navegador | Dizer a cotação do dólar a usar (fixa ou do dia) |
| 6.4 | Fechamento do mês: relatório do excedente por cliente, para você cobrar (a cobrança em si continua com você) | Relatório de um mês simulado | Nada |

Observação: aviso por e-mail para o **cliente** exige um domínio seu (o e-mail sai "de" você). Até lá, o cliente vê o
aviso no Portal e você recebe por e-mail.

### Fase 7 — Portal do cliente

| # | Faço | Prova | Você |
|---|---|---|---|
| 7.1 | Programa separado (endereço próprio), com a marca do cliente e **sem** as telas do Estúdio | Teste: nenhuma rota do Estúdio responde no Portal | Nada |
| 7.2 | **Equipe**: o gestor do cliente adiciona e tira pessoas (ex.: André e Poliana) e escolhe quem recebe contatos | Testes de permissão | Nada |
| 7.3 | **Distribuição automática**: rodízio entre quem recebe contatos e está no horário; aviso para a pessoa da vez (WhatsApp ou e-mail) com o resumo | Teste: 4 contatos → 2 para cada | Nada |
| 7.4 | **Horários de atendimento** da equipe | Navegador | Nada |
| 7.5 | **Conversas**: ver todas (todos os canais), **assumir** e **devolver para o agente**, responder pelo Portal | Mensagem real: assumir, responder, devolver | Testar com o André |
| 7.6 | **Resultados**: conversas, contatos novos, tempo da 1ª resposta, tempo de atendimento, **taxa de resolução** (chegou ao objetivo sem precisar de pessoa), transferências e motivos, propostas/agendamentos, horários de pico | Números conferidos contra conversas de teste | Dizer se falta algum número |
| 7.7 | **CRM simples** no Portal (só para quem não tem CRM): funil em colunas, ficha do contato, histórico | Navegador | Nada |
| 7.8 | Aurora passa a usar o Portal (ela tem CRM próprio: Portal só com a parte do agente) | André usando | Apresentar ao André |

### Fase 8 — API do Estúdio e skills

| # | Faço | Prova | Você |
|---|---|---|---|
| 8.1 | **API do Estúdio** para o Claude: clientes, ficha, conhecimento, casos de teste, rodar bateria, publicar, situação de canais e peças. Chaves secretas **nunca** passam pela API nem pelo chat | Testes de permissão | Gerar a chave da API no Estúdio e guardar no ambiente do Claude (formulário seguro) |
| 8.2 | `scripts/plataforma.mjs`, o comando que as skills usam | Lista os clientes | Nada |
| 8.3 | As **8 skills** (tabela abaixo), em `.claude/skills/` | Cada uma testada no cliente fictício | Nada |

| Skill | O que faz | Só termina quando | O que pede a você |
|---|---|---|---|
| `/novo-cliente` | Entrevista sobre o negócio, escolhe o modelo de agente, cria cliente, marca, plano e 1ª ficha | Cliente criado e ficha válida | Respostas, logo e cores, plano contratado |
| `/montar-conhecimento` | Organiza PDFs, site e perguntas frequentes; marca os essenciais | Cada item com título e fonte; perguntas de teste acham a resposta | Materiais do cliente |
| `/conectar-canal` | Passo a passo do canal (WhatsApp, site, Messenger, Instagram) | Recebeu **e** respondeu uma mensagem de teste | Colar chaves no Estúdio; mandar a mensagem |
| `/conectar-agenda` | Liga o Google Agenda e as regras de horário | Leu livres, marcou e apagou um evento de teste | O cliente compartilhar a agenda com o robô |
| `/conectar-sistema` | Liga o CRM do cliente, ou o CRM simples | Leu (e gravou, se for o caso) um dado de teste | Chave do sistema no Estúdio |
| `/testar-agente` | Sugere casos do cliente e roda a bateria | Travas 100% e o resto acima do mínimo | Aprovar os casos |
| `/publicar` | Publica e confere o ar; cria o acesso do cliente ao Portal | Bateria verde, canais respondendo, conversa real ok, Portal abrindo | Mensagem final de conferência |
| `/ajustar-agente` | Corrige regra, tom, exemplo ou conhecimento a partir de uma reclamação | Bateria passou de novo, com um caso novo cobrindo o problema | O que estava errado (print ajuda) |

### Fase 9 — Manual e ensaio

| # | Faço | Prova | Você |
|---|---|---|---|
| 9.1 | `docs/MANUAL-NOVO-CLIENTE.md`: do contrato ao ar, com a lista do que pedir ao cliente, tempo de cada passo e o que fazer se falhar | — | Ler |
| 9.2 | **Ensaio**: um cliente fictício do zero (ex.: clínica com agenda e chat do site) só com o manual e as skills | Cliente fictício respondendo, bateria verde, Portal funcionando | Fazer o ensaio comigo |
| 9.4 | **Importar a versão final da Cecília** (indicada pelo Renato): instruções e exemplos viram a ficha; regras novas do código dela viram travas ou regras da peça "CRM da Aurora" | Bateria da Cecília final rodando na plataforma com o mesmo resultado do ramo dela | Dizer qual versão é a final |
| 9.3 | Primeiro cliente real novo | No ar e acompanhado na 1ª semana | Trazer o cliente |

---

## 7. O que fica de fora desta vez (de propósito)

- Construtor visual de fluxos e disparos em massa.
- Telegram, e-mail e ligações (o formato de canal fica pronto; entram quando houver cliente).
- Busca "por significado" no conhecimento (só se a busca por palavras não der conta).
- Botão "Conectar WhatsApp" da Meta (exige você virar Provedor de Tecnologia; até lá, a skill guia a conexão).
- Cobrança automática (boleto/Pix): a fase 6 entrega o relatório; cobrar continua com você.

Pendências antigas da Aurora: assumir/devolver e aviso à equipe entram na fase 7. Modelos da Meta (mensagens fora das
24 h), LGPD (apagar dados) e política de privacidade entram depois da fase 4, valendo para todos os clientes.

## 8. Custos e limites

| Item | Com a plataforma |
|---|---|
| Cloudflare | O plano atual (Workers Paid, US$ 5/mês) serve vários clientes no começo. Limite por programa: 10 MB (hoje: painel 2,57 MB, motor 1,32 MB) |
| OpenAI | Paga por você; ~US$ 0,0008 por resposta; limite e excedente por cliente (fase 6) |
| Bateria de testes | < US$ 0,05 por rodada |
| Domínio | ~R$ 60 a 80/ano quando você criar (pode ser comprado na própria Cloudflare) |
| Meta | Mensagens dentro das 24 h sem custo; modelos fora das 24 h cobrados por mensagem |
| Google Agenda | Sem custo |

## 9. Como vamos trabalhar (sessões)

- **Um projeto só** (este repositório), **uma sessão (chat) nova por fase**. Cada sessão termina salvando o que fez em
  `docs/SITUACAO.md`, e a próxima começa dali.
- Para abrir a próxima sessão: ambiente `Agente-aurora` e o pedido:
  > Trabalhe no ramo `claude/serene-faraday-w06f6u`. Leia `docs/SITUACAO.md` e `docs/PLANO-PLATAFORMA.md` e faça a
  > Fase N. Só me chame quando precisar de algo meu ou ao terminar a fase.
- Fases longas (1, 2 e 7) podem ocupar mais de uma sessão; a própria sessão avisa onde parou.
- A plataforma é feita no ramo `plataforma`; os chats da Cecília continuam no ramo dela. **Os dois não se misturam**
  (decisão 16): a plataforma não traz os ajustes da Cecília a cada sessão nem envia nada ao ramo dela.

## 10. Decisões do Renato (17/11/2026)

| # | Decisão |
|---|---|
| 1 | Duas faces: **Estúdio** (o "meu GPT Maker" + CRM dos meus clientes) e **Portal do cliente** (entregue a cada cliente). Precisa ser muito bem feito e seguro |
| 2 | **OpenAI paga pelo Renato**, repassada no preço. Limite mensal por cliente; ao chegar no limite, o Renato e o cliente são avisados e o excedente é cobrado **a preço de custo** |
| 3 | Tudo na conta da Cloudflare do Renato |
| 4 | Google Agenda: o cliente compartilha a agenda com o **robô** do Renato |
| 5 | Cliente sem CRM: Portal com **CRM simples** + aba do agente. Cliente com CRM: integra e o Portal mostra só o agente |
| 6 | Equipe do cliente mexe **só em equipe e horários**. Ficha, conhecimento, canais e integrações: só o Renato. **Distribuição automática** entre várias pessoas (ex.: André e Poliana) |
| 7 | Ambiente de testes separado: sim |
| 8 | Modelos prontos de agente, incluindo **SDR que passa para vendedor/corretor** |
| 9 | Ainda não há próximo cliente (prospecção começando): ensaio com cliente fictício |
| 10 | Ainda não há domínio: seguir com os endereços da Cloudflare e trocar quando houver |
| 11 | No Portal, o cliente vê conversas, assume, devolve e vê resultados; **não edita** conhecimento nem a ficha |
| 12 | Excedente só com **autorização do cliente** (pedida a partir de 80%), teto de **1,3× o limite**, pausa no teto |
| 13 | Depois do WhatsApp, o próximo canal é o **chat do site** |
| 14 | Sem autorização do extra, o agente pausa ao chegar a 100% (volta na hora se o cliente autorizar) |
| 16 | (17/11, substitui a parte de sincronizar da decisão 15) **Plataforma e Cecília separadas.** Na plataforma, a Cecília é só um agente de **demonstração** (cópia congelada de 17/11, ramo `plataforma`). Nenhuma sessão da plataforma mexe na Cecília real nem no ramo dela; nenhuma traz os ajustes dela a cada sessão. No fim, o Renato indica a versão final da Cecília e ela é **importada** para a plataforma (etapa 9.4) |
| 15 | A Cecília **continua recebendo ajustes** em outros chats, no ramo dela, durante toda a construção. A plataforma é feita num ramo separado (`plataforma`) e, **no início de cada sessão da plataforma**, os ajustes novos da Cecília são trazidos para lá e conferidos com a bateria. Instruções editadas no painel (dados, não código) vêm junto quando a Aurora vira o cliente nº 1 |

## 11. Ainda falta confirmar

Nada. Plano fechado em 17/11/2026; a próxima sessão começa pela Fase 0.
