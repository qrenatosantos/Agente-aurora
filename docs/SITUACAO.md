# Situação atual (leia primeiro) — atualizado em 17/11/2026

Resumo vivo do projeto, para qualquer sessão continuar sem perder contexto. Detalhes: `PLANO-THINK.md` (decisões),
`TESTES.md` (o que foi provado), `PEDIDOS-CRM.md` (CRM), `CLAUDE.md` (regras de trabalho).

## Próximo grande passo
- Plataforma de agentes para vários clientes: `PLANO-PLATAFORMA.md`. Duas faces: Estúdio (Renato) e Portal do cliente.
  **Fase 0 feita no ramo `plataforma` (17/11)**: ambiente de testes, vigia (saúde a cada 5 min + cópia semanal no R2),
  alertas por e-mail (Issues), fotografia da Cecília. Guia: `OPERACAO.md`. Em produção desde 17/11 16h37 (aprovado pelo Renato);
  ramo principal do GitHub = `claude/serene-faraday-w06f6u`. Próximo: Fase 1, numa sessão nova, no ramo `plataforma` (trazer antes os ajustes da Cecília).
  Base: `AVALIACAO-PLATAFORMA.md`. Guia de sessões: `COMO-USAR-O-CLAUDE.md`.

## No ar (conta Cloudflare do Renato, plano Workers Paid)
- Painel: https://aurora-agente-painel.q-renatosantos.workers.dev (login e-mail/senha; gestor: Renato).
- Motor (Cecília): https://aurora-motor.q-renatosantos.workers.dev — webhook do WhatsApp `/whatsapp/webhook`,
  avisos do CRM `/crm/avisos`, rotas internas `/interno/*` (SEGREDO_INTERNO).
- Banco D1 `aurora-agente` (região ENAM). Migrações 0001–0004.
- Publicação: GitHub Actions (`.github/workflows/publicar.yml`): ramo `claude/serene-faraday-w06f6u` → produção;
  ramo `plataforma` → ambiente de testes (`aurora-*-teste`, banco `aurora-agente-teste`). Só `docs/` não publica.
  Segredo no GitHub: CLOUDFLARE_API_TOKEN. Segredos dos Workers: CHAVE_MESTRA (painel e motor), SEGREDO_INTERNO.
- CRM publicado (projeto `qrenatosantos/Aurora`, Supabase + Cloudflare), integrado: chave do agente, segredo dos avisos.
- WhatsApp: número de TESTE da Meta (+1 555 142-3124); só entrega para destinatários cadastrados (Renato, André…).
  App "SDR Aurora" assinado na WABA (subscribed_apps); webhook verificado; campo messages assinado.

## Cecília (configuração da Aurora no painel, versões no Registro)
- Nome Cecília, "agente de atendimento da Aurora Bartenders"; NÃO oferece falar com pessoa (só se o cliente pedir);
  se perguntarem "é robô?", diz com sinceridade que é assistente virtual (decisão discutida com o Renato).
- Mensagens em balões (um por parágrafo); pacotes um por mensagem com emoji; emojis equilibrados no resto.
- Proposta só com: nome do cliente, tipo, data/mês, cidade, convidados e pacote/drinks (trava no código). Não pergunta
  as horas: 6 h é o padrão do CRM (só muda se o cliente pedir ou para baratear).
- Preço menor: oferece diminuir horas ou copos descartáveis; só transfere se recusar e insistir.
- Pedido do site: acha pelo "Ref. XXXX" (código do pedido no CRM) e continua de onde o site parou.
- Proposta aprovada no CRM ("Só aprovar" ou "Aprovar e enviar") → Cecília manda o link, mesmo com a conversa em
  atendimento humano (lê o link da proposta se o CRM não deixar o agente marcar como enviada). Reprocessar um aviso:
  `POST /interno/aviso {conversa:"avisos", id}`; lembretes: não abriu em 120 min / abriu e não
  respondeu em 30 min; só 8h–21h e dentro da janela grátis de 24 h.
- Pacotes num parágrafo só são separados por código (um balão por pacote; util.ts separarPacotes).
- Drinks soltos em vez de pacote: explica o pacote que cobre e oferece proposta personalizada (só os drinks
  escolhidos); nunca escolhe pelo cliente; confirma o resumo antes de preparar a proposta.
- Equipe devolve a conversa ("Passar para o agente") → a Cecília responde as mensagens que ficaram sem resposta
  (dentro das 24 h). Mudança em proposta aprovada, enviada ou recusada: a Cecília cria a nova versão
  (`/propostas/:id/nova-versao`, volta para o André aprovar); aguardando aprovação = pergunta e passa; aceita = passa.
- Pergunta sobre prazo da proposta: "até o final do dia"; depois das 19h, "até amanhã às 14h"; nunca transfere por isso (config v11).
- Agenda (17/11): consulta com data + horário (o CRM soma a folga da equipe). Sem horário e dia cheio = pergunta o
  horário. Sem vaga = não oferece, pergunta outra data/horário e consulta de novo; só transfere se o cliente não tiver
  outra opção (motivo "Limite de capacidade em <data> às <hora>"). Proposta não sai para data sem vaga (trava).
- Outra condição de pagamento (entrada, parcelar, prazo): não negocia, transfere com o pedido.
- Instruções v12 (`clientes/aurora/instrucoes-v12.md` + `exemplos-v12.json`) no ar desde 17/11 (config v12).
- Modelo `gpt-6-luna:low` ("pensar antes", raciocínio baixo): ":esforço" no nome do modelo liga o raciocínio.
- Simulador ▸ "Testes no WhatsApp" (só gestor): botão Zerar apaga a memória da Cecília com um número (o CRM não muda:
  marque o pedido antigo como perdido antes). Link da proposta não sai mais duplicado (avisos aprovada+enviada juntos).
- O Renato ajusta treinamento direto nas Instruções do painel. Ajuste pequeno = sem bateria com IA (economia).

## Pendências
- **Cecília (achado da fotografia de 17/11, config v13):** perguntou "demora quanto?" logo depois da proposta preparada →
  ela **transferiu** em vez de dizer "até o final do dia" (2/2 na avaliação de qualidade; nota caiu de 4,58 para 4,18).
  Conferir no chat da Cecília (`avaliacao/RESULTADO-QUALIDADE.md`, cenário "prazo").
- CRM: aprovar as regras de preço (Catálogo ▸ Calculadora) e confirmar condições (Configurações ▸ Propostas e agenda).
  Até lá, propostas vêm "Preço a definir" e o gestor põe o valor antes de aprovar.
- CRM ▸ Configurações ▸ Propostas e agenda ▸ "WhatsApp que recebe os clientes pela proposta" = número da Cecília
  (hoje o de teste, 15551423124; trocar quando houver o definitivo). Vazio = vai para o WhatsApp da empresa (André).
- Número definitivo (decisão do Renato/André): chip novo só da Cecília (simples; o site troca o "wa" na config) OU
  número do André em coexistência (exige Provedor de Tecnologia ou parceira; cuidado: amigos/família receberiam a Cecília).
- Fase 3 restante: aviso ao André no WhatsApp (proposta para aprovar; transferência), caixa de entrada no painel,
  André assumindo pela conversa (coexistência). CRM "Leads novos do site vão para" = Agente quando o número for definitivo.
- Fase 4: modelos da Meta (mensagens fora das 24 h), LGPD (apagar dados ao receber contato.dados_apagados), custos.
- Teste de agenda com conflito (pedido do Renato, 17/11): no CRM, bloquear/lotar uma data e conversar no Simulador
  pedindo essa data. Esperado: Cecília avisa e passa para a equipe. Já testado na cópia local (TESTES.md, fase 2);
  falta no CRM de verdade. Leitura da agenda no ar confirmada em 17/11 (`/agenda/disponibilidade` responde).
- Política de privacidade (S1) publicada antes de clientes reais.

## Testes locais nesta nuvem
`/tmp/claude-0/subir-tudo.sh` (sessões anteriores) sobe: Docker + Supabase do CRM de testes + CRM (porta 3200) +
repassador OpenAI (8789) + Graph falso (8792) + motor (8787) com D1 local em /tmp/claude-0/estado-local.
Se a sessão for nova, refazer conforme `TESTES.md` (seções da fase 1 e 2).
