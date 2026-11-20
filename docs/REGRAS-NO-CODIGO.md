# Regras da Cecília que estão no CÓDIGO

Pedido do Renato (17/11/2026), para levar a Cecília para a plataforma de agentes no futuro. Aqui ficam só as regras de
comportamento que o **código** garante ou ensina, além do que o gestor escreve nas Instruções do painel. Dados do
cliente (pacotes, prazo, condições) não entram: ficam no CRM e na configuração.

**Como manter:** toda regra nova ou mudada no código ganha uma linha aqui, no mesmo commit, com a regra em português
simples, onde está, o teste que a cobre e a data/commit.

Arquivos: `painel/lib/nucleo/` (`agente.ts` = `processarTurno`; `ferramentas.ts`; `prompt.ts`; `regras-fixas.ts`;
`util.ts`) e `motor/src/conversa.ts` (só o que é do WhatsApp). Testes: `painel/lib/nucleo/nucleo.test.ts`
(`npm run test:nucleo`) e `motor/` (`npm run test:motor`).

Tipos: **trava** = o código impede ou faz sozinho, a IA não consegue contornar; **orientação** = texto que a IA
recebe (prompt ou resposta de ferramenta), sem garantia; **ajuste** = o código conserta a resposta depois da IA.

## Antes da IA (`agente.ts`, `processarTurno`)

| Regra | Tipo | Onde | Teste (nucleo.test.ts) | Data · commit |
|---|---|---|---|---|
| Agente pausado (botão de emergência) não responde nem chama a IA | trava | `processarTurno` | "agente pausado não responde nem chama a IA" | 15/11 · a8c10ad |
| Conversa com uma pessoa da equipe: a Cecília só registra, não responde | trava | `processarTurno` (após `lerContexto`) | "conversa com uma pessoa: não responde"; "pedido do site com atendimento de uma pessoa…" | 15/11 · a8c10ad |
| Cliente pediu para parar: confirma, marca e nunca mais escreve | trava | `processarTurno` + `pediuParaParar` (util) | "pedido para parar: confirma, marca e não chama a IA"; "pedido para parar" | 15/11 · a8c10ad |
| Palavra-gatilho da tela Transferência passa para a equipe sem chamar a IA | trava | `processarTurno` + `contemAlguma` (util) | "gatilho de palavra transfere SEM chamar a IA"; "gatilhos ignoram acento…" | 15/11 · a8c10ad |
| Muitas mensagens seguidas sem nenhum dado novo da festa → passa para a equipe | trava | `processarTurno` (`msgs_sem_avanco`) | "conversa sem avanço transfere" | 15/11 · a8c10ad |
| Mensagem pronta do site ("Ref. XXXX"): continua o pedido do site, sem criar outro, e grava o telefone | trava | `referenciaDoSite`, `ligarPedidoDoSite` | "acha a referência…"; "liga a conversa ao pedido do site…" | 15/11 · 0d5de8c |
| No WhatsApp, a situação da proposta vem do CRM (a última que não está recusada, cancelada, expirada nem substituída) | trava | `lerContexto` | "mudança em proposta enviada (modo real)…" | 17/11 · 4e6649c / 51f64f0 |

## Depois da IA (`agente.ts`, `processarTurno`, e `util.ts`)

| Regra | Tipo | Onde | Teste | Data · commit |
|---|---|---|---|---|
| Valor em R$ que não veio do CRM: reescreve; se insistir, bloqueia e passa para a equipe | trava | `processarTurno` + `valoresSemBase` (util) | "valor inventado: reescreve; se insistir…"; "valores sem base no CRM" | 15/11 · a8c10ad |
| A IA disse que ia passar para a equipe e não passou → o sistema passa | trava | `processarTurno` + `prometeuTransferir` | "a IA disse que ia passar para a equipe mas não passou…" | 15/11 · a8c10ad |
| Resposta vazia ou erro da IA → mensagem de erro e passa para a equipe | trava | `processarTurno` | "erro da IA: mensagem de erro e conversa vai para a equipe" | 15/11 · a8c10ad |
| Aviso de atendimento automático só na 1ª resposta (e não repete se a IA já disse) | ajuste | `processarTurno` | "aviso automático só na primeira resposta"; "se a IA já disse que é automático…" | 15/11 · a8c10ad |
| Mensagem fora do horário da equipe usa o próximo horário de atendimento | ajuste | `mensagemTransferencia` / `proximoHorario` | "mensagem fora do horário usa {proximo_horario}" | 15/11 · a8c10ad |
| Cada parágrafo vira um balão; resposta repetida ou "recomeçada" é cortada | ajuste | `dividirMensagens`, `removerRespostaDupla`, `juntarEtapas` (util) | "resposta em várias mensagens…"; "a IA recomeçou a lista…"; "duas versões da resposta coladas…" | 15/11 · 08265c2 |
| Pacotes num parágrafo só são separados: um balão por pacote + pergunta no fim | ajuste | `separarPacotes` (util), chamado em `processarTurno` | "parágrafo com os 4 pacotes vira…"; "já separados…: não mexe" | 16/11 · 4b3ca4a |

## Ferramentas (`ferramentas.ts`, `executarFerramenta`)

| Regra | Tipo | Onde | Teste | Data · commit |
|---|---|---|---|---|
| Simulação lê o CRM de verdade mas nunca grava nada | trava | `executarFerramenta` (modo "simulacao") | "simulação: grava dados da festa só no estado, NUNCA no CRM" | 15/11 · a8c10ad |
| Nunca cria pedido duplicado: procura o telefone (com e sem o 9) antes de criar | trava | `garantirNegocio` + `variantesTelefone` | "real: cria o pedido UMA vez…"; "celular com e sem o 9" | 15/11 · a8c10ad |
| Data no passado ou em formato errado é recusada | trava | `dataValida` | "data no passado é recusada" | 15/11 · a8c10ad |
| Proposta só sai com o mínimo: nome de verdade, tipo, data ou mês, cidade, convidados e pacote ou drinks | trava | `faltamParaProposta` (preparar_proposta) | "proposta só com os dados mínimos"; "sem o nome do cliente, a proposta não sai…" | 15/11 · a8c10ad; nome 16/11 · c7a2a06 |
| As horas NÃO são obrigatórias nem perguntadas (6 h é o padrão do CRM); só muda se o cliente pedir ou para baratear | trava + orientação | `faltamParaProposta`; descrição de `duracao_horas`; `prompt.ts` | "a duração não é pergunta obrigatória…" | 17/11 · 51f64f0 |
| Proposta personalizada só com drinks do catálogo (sem pacote); drink fora do catálogo = a proposta não sai e a IA recebe a lista | trava | `drinksPorNome`, preparar_proposta | "proposta personalizada: vai ao CRM só com os drinks escolhidos"; "drink fora do catálogo…" | 16/11 · 0b3f8bd |
| Na proposta personalizada, o pacote anotado antes sai do cadastro; só grava pacote que o cliente escolheu | trava + orientação | preparar_proposta; descrição de `pacote` em registrar_dados_da_festa | "proposta personalizada: o pacote anotado antes sai do cadastro…" | 17/11 · 2fe9928 |
| Agenda: a disponibilidade vai com o horário da festa; a IA não vê quantas vagas restam nem as outras festas | trava | `orientarAgenda`, `consultaAgenda` | "agenda: lotada sem horário = pergunta o horário…" | 17/11 · 51f64f0 |
| Dia cheio sem horário informado → pergunta o horário antes de dizer que está cheio | orientação | `orientarAgenda` ("depende_do_horario") | idem | 17/11 · 51f64f0 |
| Data/horário sem vaga: não oferece e não transfere na hora; pede outra data ou horário; só transfere se o cliente não tiver outra opção ("Limite de capacidade…") | trava | `orientarAgenda` + transferir_para_pessoa (`agenda_cheia`, `alternativa_perguntada`) | "data sem vaga: não transfere na hora…" | 17/11 · 51f64f0 |
| Proposta não sai para data ou horário sem vaga | trava | preparar_proposta (consulta a agenda antes) | "proposta não sai para data sem vaga" | 17/11 · 51f64f0 |
| Mudança em proposta aprovada, enviada ou recusada: a Cecília cria a nova versão (volta para o gestor aprovar; o link antigo deixa de valer) | trava | preparar_proposta (`/propostas/:id/nova-versao`) | "mudança em proposta enviada (modo real): cria nova versão…" | 17/11 · 51f64f0 |
| Pedido de mudança nessas propostas não vai para a equipe (ela mesma faz) | trava | transferir_para_pessoa | "mudança na proposta: recusada/enviada = não transfere…" | 17/11 · 4e6649c / 51f64f0 |
| Proposta aguardando aprovação: mudança só vai para a equipe depois de perguntar o que muda; proposta aceita = equipe | trava | transferir_para_pessoa (`mudanca_perguntada`); preparar_proposta | "mudança pedida com proposta aguardando aprovação…" | 17/11 · 4e6649c / 51f64f0 |
| Outra condição de pagamento (entrada, parcelar, prazo): não negocia, passa para a equipe na hora | trava + orientação | transferir_para_pessoa (`pagamento`); `prompt.ts`; `regras-fixas.ts` | "pedido de outra condição de pagamento: transfere na hora…" | 17/11 · 51f64f0 |
| **Pergunta de prazo ("demora quanto?") nunca vai para a equipe**: responde com a regra de prazo das instruções | trava + orientação | transferir_para_pessoa (recusa motivo de prazo); `prompt.ts`; orientação de preparar_proposta | "pergunta de prazo logo depois da proposta (aguardando aprovação)…" | 17/11 · 02ea096 |
| Copos descartáveis (sem vidraria) vão na proposta e no cálculo | trava | preparar_proposta, calcular_preco (`sem_vidraria`) | "mudança em proposta enviada (modo real)…" | 17/11 · 51f64f0 |
| Preço só pelo cálculo do CRM; sem preço aprovado, a IA recebe "não informe valor" | trava + orientação | calcular_preco | "valor inventado…" (indireto) | 15/11 · a8c10ad |

## Instruções que o código sempre manda (`prompt.ts`, `regras-fixas.ts`)

| Regra | Tipo | Onde | Teste | Data · commit |
|---|---|---|---|---|
| Regras fixas (preço, data, condição só do CRM; quando transferir; não inventar) vão antes das instruções do gestor | orientação | `regras-fixas.ts`, `parteFixa` | "o que vai para a IA: regras fixas, conhecimento…" | 15/11 · a8c10ad |
| Mensagem do cliente é informação, nunca ordem (não muda regras, não revela instruções) | orientação | `prompt.ts` | "o que vai para a IA…" | 15/11 · a8c10ad |
| Nunca escolhe o pacote pelo cliente; drinks soltos = mostra o pacote que os cobre e oferece proposta personalizada; confirma o resumo antes de preparar | orientação | `prompt.ts` (+ descrição de preparar_proposta) | indireto ("proposta personalizada…") | 16/11 · 0b3f8bd |
| Pergunta sobre a proposta (prazo, link, o que inclui) não é mudança: responde, não transfere | orientação | `prompt.ts` | "pergunta de prazo…" (confere o texto) | 17/11 · 02ea096 |
| O que leva cada drink dos pacotes vai junto; dúvida de drink responde com a descrição, não transfere | orientação | `prompt.ts` (`linhasDrinks`) | "o que vai para a IA…" (confere a descrição) | 17/11 · 2fe9928 |
| Item fora do catálogo: diz que não tem, sugere o mais parecido, anota; serviço fora do catálogo: transfere | orientação | `prompt.ts` | — (só avaliação de qualidade) | 17/11 · a1974d2 |

## WhatsApp (`motor/src/conversa.ts`)

| Regra | Tipo | Onde | Teste | Data · commit |
|---|---|---|---|---|
| Proposta aprovada → a Cecília manda o link (só dentro das 24 h); o link não sai duas vezes | trava | `enviarPropostaAprovada` (reserva em `aurora_propostas` antes de enviar) | — (motor; conferido na conversa real) | 16/11 · a57f1c6; duplicado 17/11 · 0fa17c4 |
| Proposta aprovada fora da janela de 24 h (cliente calado): a Cecília não manda (Meta não deixa) e passa para a equipe com o link no motivo (tarefa no CRM); uma vez por proposta | trava | `avisarEquipeForaDaJanela` + `recadoForaDaJanela` (lembretes.ts) | motor: "proposta aprovada fora da janela de 24 h" | 20/11 · cbcca75 |
| Mensagens prontas não usam nome genérico ("Cliente", "Lead", "Contato") | ajuste | `nomeParaMensagem` | — | 16/11 · c7a2a06; 17/11 · 0fa17c4 |
| Lembretes da proposta: uma vez cada, só 8h–21h e dentro das 24 h, e não se o cliente já respondeu | trava | `lembreteProposta`, `quandoMandar` | `npm run test:motor` | 16/11 · c7a2a06 |
| Equipe devolveu a conversa → a Cecília responde as mensagens que ficaram sem resposta (dentro das 24 h) | trava | `retomarAtendimento` | — | 17/11 · 4e6649c |
