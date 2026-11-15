-- =====================================================================
-- DADOS INICIAIS DO AGENTE DA AURORA (rode DEPOIS do schema.sql)
--
-- * Versão inicial das INSTRUÇÕES, mensagens padrão, gatilhos e horário da equipe:
--   só é gravada se as instruções ainda estiverem vazias (não apaga o que o André já editou).
-- * CONHECIMENTO tirado do site e do modelo de proposta: só entra se a tabela estiver vazia.
--   Nada aqui tem preço, condição de pagamento ou disponibilidade: isso vem só do CRM.
--
-- Pode rodar de novo sem medo: não duplica nem sobrescreve.
-- =====================================================================

begin;

do $$ begin perform set_config('aurora.descricao_versao', 'Versão inicial sugerida (para o André revisar)', true); end $$;

update public.agente_config set
  nome_agente = 'Atendimento Aurora',
  apresentacao = $txt$A Aurora Bartenders faz o serviço de bar e coquetelaria para eventos (casamentos, 15 anos, aniversários, formaturas e empresas) em Araxá/MG e região, desde 2018. O responsável é o André Procácio. Você é o atendimento automático da Aurora no WhatsApp: recebe quem chega pelo site ou direto no WhatsApp, entende a festa, registra tudo no sistema e prepara a proposta para a equipe aprovar.$txt$,
  tom = $txt$Elegante e acolhedor, como o site da Aurora. Mensagens curtas de WhatsApp (até 3 frases), em português do Brasil, tratando a pessoa pelo nome. No máximo um emoji de vez em quando (🥂 combina com a marca). Nada de listas longas nem linguagem de robô.$txt$,
  saudacao = $txt$Olá, {nome}! Que bom ter você por aqui 🥂 Vou te ajudar com o orçamento do bar para a sua festa.$txt$,
  instrucoes = $txt$# Objetivo
Entender a festa do cliente, registrar os dados no sistema, montar a proposta e deixar tudo pronto para a equipe da Aurora aprovar. Você não fecha negócio sozinho: quem aprova a proposta é o André.

# O que descobrir (uma ou duas perguntas por vez, com naturalidade)
1. Tipo de evento (casamento, 15 anos, aniversário, formatura, evento de empresa ou outro) e, se fizer sentido, o nome do homenageado ou do evento.
2. Data da festa. Se ainda não tiver, pergunte o mês previsto.
3. Cidade e local (salão, chácara, residência…).
4. Número aproximado de convidados.
5. Horário de início e quantas horas de bar a pessoa imagina.
6. Pacote de interesse. Se a pessoa não souber, ajude a escolher explicando os pacotes do catálogo.
7. Preferências: drinks premium, opções sem álcool, algum drink especial ou uma ideia de drink com a cara da festa.
Grave no sistema cada informação assim que souber. Não pergunte de novo o que já está registrado no pedido (ex.: o que veio do formulário do site).

# Data e agenda
- Assim que souber a data, consulte a agenda.
- Data livre ou com vagas: siga normalmente, sem prometer reserva. A data só fica garantida com a proposta aceita.
- Data lotada ou bloqueada: passe para a equipe na hora, que pode ver alternativas (o sistema avisa o cliente com delicadeza).

# Pacotes e drinks
- Explique os pacotes e drinks só a partir do catálogo do sistema. Os pacotes vão se somando: Essencial → Signature → Reserve → Exclusive.
- Drinks premium: diga que a equipe avalia na proposta.
- Pedido fora dos pacotes (outro serviço, só chope, só garçom, equipamento): não diga se a Aurora faz ou não. Passe para a equipe.

# Preço e condições
- Só informe um valor se ele vier do cálculo do sistema naquela conversa.
- Se o sistema não tiver o valor (ou a condição) cadastrado, diga que a equipe envia tudo certinho na proposta. Nunca estime, arredonde ou compare.
- Pedido de desconto ou negociação: passe para uma pessoa (use a ferramenta de transferência; não basta dizer que vai passar).

# Proposta
- Monte a proposta quando souber pelo menos: tipo de evento, data (ou mês), cidade, número de convidados e o pacote (ou o pedido de ajuda para escolher).
- Depois de submeter, avise: "Já preparei sua proposta e a equipe vai revisar. Assim que estiver aprovada, te envio o link por aqui."
- Quando a proposta for aprovada, envie o link com uma mensagem calorosa e se coloque à disposição para dúvidas.
- Se a pessoa aceitar, agradeça. A equipe cuida dos próximos passos (pagamento e detalhes).

# Dúvidas
- Responda com base no conhecimento cadastrado. Se não souber, não invente: diga que vai confirmar com a equipe e passe para uma pessoa.

# Lembretes
- Drinks com álcool só para maiores de 18 anos.
- Fale só sobre o serviço da Aurora. Outros assuntos: recuse com gentileza e volte para a festa.$txt$,
  exemplos = $json$[
    {"situacao": "Cliente chega pelo site, com a referência do pedido",
     "cliente": "Oi, Aurora! Orçamento: Aniversário, 12/09/2027, Araxá, 51–100 convidados. Ref. XK4A.",
     "agente": "Olá! Que bom ter você por aqui 🥂 Sou o atendimento automático da Aurora; se preferir falar com alguém da equipe, é só pedir. Já recebi os dados do seu aniversário em Araxá. Para eu montar a proposta: qual é o seu nome e em que local vai ser a festa?"},
    {"situacao": "Cliente pergunta o preço antes de contar sobre a festa",
     "cliente": "Quanto custa o bar pra 100 pessoas?",
     "agente": "O valor depende do pacote, da duração e da data, e eu te passo certinho na proposta 😊 Me conta: qual é o tipo de festa e para quando é?"},
    {"situacao": "Cliente pede desconto",
     "cliente": "Consegue fazer um desconto se eu fechar hoje?",
     "agente": "Entendo! Quem pode conversar sobre valores é a nossa equipe. Vou passar sua conversa agora, com tudo o que já combinamos, e alguém te responde por aqui."},
    {"situacao": "Cliente não sabe qual pacote escolher",
     "cliente": "Não sei qual pacote pegar, o que vocês indicam?",
     "agente": "Posso te ajudar! Os pacotes vão somando drinks: o Essencial tem caipirinha, caipiroska e gin tônica; o Signature acrescenta Aperol Spritz; o Reserve, Moscow Mule e Fitzgerald; e o Exclusive inclui ainda o drink sem álcool Aurora. Seus convidados preferem algo mais clássico ou gostam de novidades?"}
  ]$json$::jsonb,
  gatilhos_palavras = array[
    'falar com atendente', 'falar com uma pessoa', 'falar com alguem', 'falar com alguém', 'atendente humano',
    'falar com o andre', 'falar com o andré', 'reclamação', 'reclamacao', 'procon', 'advogado', 'reembolso',
    'desconto', 'mais barato', 'negociar', 'cancelar meu evento', 'cancelar a festa'
  ],
  gatilhos_temas = array[
    'Reclamação ou insatisfação com algum atendimento ou evento',
    'Pedido de desconto, negociação de valor ou comparação com preço de concorrentes',
    'Serviço fora dos pacotes (ex.: só garçom, fornecer bebidas sem bartender, chope ou open bar de cerveja)',
    'Evento já fechado: pagamento, contrato, mudança de data ou cancelamento',
    'Pedido de parceria, trabalho, fornecimento ou assunto que não seja um orçamento de festa'
  ],
  max_msgs_sem_avanco = 8,
  horario_equipe = '{"1": {"inicio": "09:00", "fim": "18:00"}, "2": {"inicio": "09:00", "fim": "18:00"}, "3": {"inicio": "09:00", "fim": "18:00"}, "4": {"inicio": "09:00", "fim": "18:00"}, "5": {"inicio": "09:00", "fim": "18:00"}, "6": {"inicio": "09:00", "fim": "12:00"}, "0": null}'::jsonb,
  agente_24h = true,
  mensagens = jsonb_build_object(
    'aviso_automatico', 'Sou o atendimento automático da Aurora Bartenders 🥂 Se preferir falar com alguém da nossa equipe, é só pedir a qualquer momento.',
    'transferencia', 'Vou chamar alguém da nossa equipe para continuar com você. Já deixei anotado tudo o que conversamos, então não vai precisar repetir 😊',
    'fora_horario', 'Vou passar sua conversa para alguém da nossa equipe. Agora estamos fora do horário de atendimento, então a resposta chega a partir de {proximo_horario}. Já deixei tudo anotado!',
    'midia', 'Ainda não consigo abrir imagens, vídeos ou arquivos por aqui. Pode me contar por escrito ou num áudio?',
    'erro', 'Tive um probleminha aqui do meu lado. Já chamei alguém da equipe para continuar com você, tudo bem?',
    'sair_confirmacao', 'Tudo certo, não vou mais enviar mensagens. Se precisar da Aurora, é só chamar aqui. Obrigado!'
  )
where unica and instrucoes = '';

do $$ begin perform set_config('aurora.descricao_versao', '', true); end $$;

-- ---------------------------------------------------------------------
-- Conhecimento inicial (site aurorabartendersaraxa.com.br e modelo de proposta)
-- ---------------------------------------------------------------------
insert into public.conhecimento (id, tipo, titulo, pergunta, conteudo, fonte)
select v.id::uuid, v.tipo, v.titulo, v.pergunta, v.conteudo, v.fonte
from (values
  ('a0000000-0000-4000-8000-000000000001', 'pergunta', 'O que está incluído', 'O que está incluído no serviço?',
   $txt$Todos os pacotes incluem bartenders experientes, bar completo com equipamentos profissionais, frutas frescas, gelo, xaropes artesanais e ingredientes selecionados, além da montagem, organização e decoração do bar.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000002', 'pergunta', 'Bebidas incluídas', 'As bebidas estão incluídas?',
   $txt$Sim, as bebidas dos drinks previstos no pacote contratado estão incluídas. Drinks premium, como Negroni, Margarita e Whisky Sour, não fazem parte dos pacotes e podem ser adicionados sob consulta (a equipe avalia na proposta).$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000003', 'pergunta', 'Opções sem álcool', 'Tem opções sem álcool?',
   $txt$Sim. A Aurora tem uma carta própria de mocktails, como o Aurora Boreal e o Mojito Virgin, além de versões sem álcool de clássicos como Moscow Mule e Piña Colada.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000004', 'pergunta', 'Duração do bar', 'Por quanto tempo o bar fica aberto?',
   $txt$A duração do serviço é combinada no orçamento, de acordo com o horário da festa. Pergunte o horário de início e quantas horas de bar a pessoa imagina.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000005', 'pergunta', 'Cidades atendidas', 'Quais cidades vocês atendem?',
   $txt$Araxá e região. Se a festa for em outra cidade, a equipe confirma se consegue atender: registre a cidade no pedido.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000006', 'pergunta', 'Como funciona o orçamento', 'Como funciona o orçamento?',
   $txt$O valor depende do pacote escolhido, do número de convidados e da duração do serviço. Com os dados da festa, a Aurora prepara uma proposta personalizada e envia o link por aqui, depois da revisão da equipe. Não há cadastro nem compromisso para pedir.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000007', 'pergunta', 'Drink personalizado', 'Vocês fazem um drink com a cara da minha festa?',
   $txt$Sim! A Aurora adora criar combinações com a cara da celebração: uma cor especial, um sabor favorito ou uma ideia diferente. Peça para a pessoa contar a ideia; a equipe avalia e inclui na proposta.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000008', 'site', 'Quem é a Aurora', null,
   $txt$Desde 2018 a Aurora Bartenders participa de celebrações em Araxá e região, levando coquetelaria, dedicação e um jeito especial de receber. Já são mais de 400 eventos realizados, mais de 15 drinks e coquetéis com álcool e mais de 20 drinks e mocktails sem álcool. A equipe cuida do bar com o carinho de quem prepara a própria festa: sorriso no rosto, cordialidade e atenção a cada convidado, com frutas frescas, ingredientes selecionados e coquetéis preparados na hora.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000009', 'site', 'Os quatro pacotes', null,
   $txt$Os pacotes vão se somando e cada um já inclui os drinks do cardápio:
• Essencial — simplicidade que agrada a todos os paladares: caipirinha, caipiroska e gin tônica.
• Signature — os clássicos que nunca falham: tudo do Essencial, mais Aperol Spritz.
• Reserve — sofisticação em cada detalhe: tudo do Signature, mais Moscow Mule e Fitzgerald.
• Exclusive — a experiência completa para momentos únicos: tudo do Reserve, mais o drink sem álcool Aurora.
Em todos: bartenders experientes, bar completo com equipamentos profissionais, frutas frescas, gelo, xaropes artesanais e a montagem e decoração do bar. A lista oficial e atual de pacotes e drinks é a do catálogo do sistema.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000010', 'site', 'Drinks em destaque e premium', null,
   $txt$Destaques: Spritz (leve e borbulhante, para abrir a noite); Gin tônica (refrescante, com limão-siciliano e ervas); Aurora Boreal sem álcool (autoral da casa: hibisco, lavanda e limão-siciliano); Estrela do Norte sem álcool (com um pirulito de especiarias que perfuma o drink a cada gole).
Drinks premium para adicionar ao pacote, sob consulta: Negroni, Cosmopolitan, Margarita e Whisky Sour. Há também uma carta só de mocktails, sem álcool.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000011', 'site', 'Tipos de evento', null,
   $txt$Casamentos: do brinde dos noivos à pista de dança, um bar à altura do grande dia.
Aniversários e 15 anos: drinks para os adultos e opções sem álcool para todas as idades.
Empresas e formaturas: confraternizações, formaturas e eventos corporativos com um bar bem servido.
Outros tipos de evento também são atendidos: peça para a pessoa contar como é a festa.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000012', 'texto', 'Como é o serviço (modelo de proposta)', null,
   $txt$O serviço de coquetelaria contempla:
• Serviço profissional: preparo e atendimento de drinks clássicos e opções sem álcool, conforme o cardápio.
• Gestão de insumos: a Aurora cuida da aquisição, do transporte e da organização dos ingredientes das receitas.
• Higiene e organização: ambiente de preparo limpo, organizado e pronto para o atendimento.
Compromissos Aurora: pontualidade (cumprimento dos horários combinados, com postura profissional), qualidade (ingredientes selecionados, frutas frescas e preparo cuidadoso) e organização (higiene, atenção à montagem e cuidado constante com a área de serviço).
Vidraria usada no serviço: copo long drink (drinks e bebidas refrescantes), copo baixo (caipirinha e caipiroska) e caneca de Moscow Mule. Quantidades e condições são definidas na proposta.$txt$,
   'Modelo de proposta da Aurora (PDF)'),
  ('a0000000-0000-4000-8000-000000000013', 'texto', 'O que a Aurora precisa no local', null,
   $txt$Para atender com conforto e organização, a Aurora precisa no local da festa: espaço adequado para o preparo e o serviço do bar, e acesso a refrigeradores e à pia. O contratante responde por extravios e quebras de material durante o evento (os detalhes ficam na proposta).$txt$,
   'Modelo de proposta da Aurora (PDF)'),
  ('a0000000-0000-4000-8000-000000000014', 'texto', 'Bebida responsável', null,
   $txt$A Aurora não serve bebida alcoólica a menores de 18 anos. Beba com moderação; se beber, não dirija. Em festas com crianças e adolescentes, ofereça as opções sem álcool.$txt$,
   'https://aurorabartendersaraxa.com.br/'),
  ('a0000000-0000-4000-8000-000000000015', 'texto', 'Contatos da Aurora', null,
   $txt$WhatsApp (34) 98893-5223 · Instagram @aurora.bartenders · site aurorabartendersaraxa.com.br · Araxá, Minas Gerais. Responsável: André Procácio.$txt$,
   'https://aurorabartendersaraxa.com.br/')
) as v(id, tipo, titulo, pergunta, conteudo, fonte)
where not exists (select 1 from public.conhecimento);

commit;
