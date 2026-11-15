-- =====================================================================
-- BANCO DO PAINEL DO AGENTE (Cloudflare D1 = SQLite)
--
-- Um banco por cliente. Pode rodar quantas vezes quiser: é idempotente e não apaga dados.
--   npx wrangler d1 execute <banco> --remote --file=banco/schema.sql
--
-- As REGRAS de acesso (quem pode o quê) ficam no código do painel, em lib/banco/ (uma função por
-- operação, sempre recebendo quem está agindo) e são testadas em lib/banco/banco.test.ts.
-- Aqui ficam as travas de formato e de valores (CHECK), que valem para qualquer caminho de gravação.
--
-- Datas: texto ISO em UTC (AAAA-MM-DDTHH:MM:SS.sssZ). Listas e objetos: JSON em texto.
-- Este banco NUNCA acessa o banco do CRM. O agente fala com o CRM só pela API dele.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PESSOAS DO PAINEL, LOGIN E SESSÕES
-- ---------------------------------------------------------------------
create table if not exists pessoas (
  id            text primary key,
  email         text not null unique check (email = lower(email) and email like '%_@_%._%' and length(email) <= 200),
  nome          text not null check (length(trim(nome)) between 2 and 80),
  papel         text not null default 'atendente' check (papel in ('gestor', 'atendente')),
  ativo         integer not null default 1 check (ativo in (0, 1)),
  -- PBKDF2-SHA256: "pbkdf2$<iteracoes>$<sal base64>$<hash base64>". Nulo = ainda não definiu a senha.
  senha_hash    text check (senha_hash is null or senha_hash like 'pbkdf2$%'),
  senha_em      text,
  ultimo_acesso text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sessões: o navegador guarda um código aleatório; aqui fica só o hash dele.
create table if not exists sessoes (
  token_hash  text primary key,
  pessoa_id   text not null references pessoas (id) on delete cascade,
  criada_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_em   text not null,
  ip          text
);
create index if not exists sessoes_pessoa_idx on sessoes (pessoa_id);

-- Links para definir ou trocar a senha (gerados pelo gestor em Equipe). Só o hash.
create table if not exists links_senha (
  token_hash  text primary key,
  pessoa_id   text not null references pessoas (id) on delete cascade,
  criado_por  text not null,
  expira_em   text not null,
  usado_em    text
);

-- Tentativas de login que falharam (proteção contra adivinhar senha).
create table if not exists tentativas_login (
  id     integer primary key autoincrement,
  chave  text not null,          -- "email:<email>" ou "ip:<ip>"
  em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index if not exists tentativas_chave_idx on tentativas_login (chave, em);

-- ---------------------------------------------------------------------
-- 2. REGISTRO (tudo o que foi alterado, por quem)
-- ---------------------------------------------------------------------
create table if not exists registro (
  id         integer primary key autoincrement,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ator_tipo  text not null default 'humano' check (ator_tipo in ('humano', 'agente', 'sistema')),
  ator_id    text,
  ator_nome  text not null,
  acao       text not null check (length(acao) <= 60),
  alvo       text check (alvo is null or length(alvo) <= 200),
  detalhes   text not null default '{}' check (json_valid(detalhes))
);
create index if not exists registro_data_idx on registro (created_at desc);

-- ---------------------------------------------------------------------
-- 3. CONFIGURAÇÃO DO AGENTE (linha única, id = 1) + VERSÕES
-- ---------------------------------------------------------------------
create table if not exists agente_config (
  id                  integer primary key check (id = 1),
  nome_agente         text not null default 'Atendimento' check (length(trim(nome_agente)) between 2 and 60),
  apresentacao        text not null default '' check (length(apresentacao) <= 1000),
  tom                 text not null default '' check (length(tom) <= 1000),
  saudacao            text not null default '' check (length(saudacao) <= 1000),
  instrucoes          text not null default '' check (length(instrucoes) <= 20000),
  exemplos            text not null default '[]' check (json_valid(exemplos) and json_type(exemplos) = 'array' and json_array_length(exemplos) <= 50),
  gatilhos_palavras   text not null default '[]' check (json_valid(gatilhos_palavras) and json_type(gatilhos_palavras) = 'array' and json_array_length(gatilhos_palavras) <= 100),
  gatilhos_temas      text not null default '[]' check (json_valid(gatilhos_temas) and json_type(gatilhos_temas) = 'array' and json_array_length(gatilhos_temas) <= 50),
  max_msgs_sem_avanco integer not null default 8 check (max_msgs_sem_avanco between 3 and 50),
  horario_equipe      text not null default '{}' check (json_valid(horario_equipe) and json_type(horario_equipe) = 'object'),
  agente_24h          integer not null default 1 check (agente_24h in (0, 1)),
  mensagens           text not null default '{}' check (json_valid(mensagens) and json_type(mensagens) = 'object'),
  espera_segundos     integer not null default 8 check (espera_segundos between 2 and 30),
  transcrever_audio   integer not null default 1 check (transcrever_audio in (0, 1)),
  modelo              text not null default 'gpt-6-luna' check (length(modelo) between 2 and 80 and modelo not glob '*[^a-z0-9._:-]*'),
  limite_mensal_usd   real not null default 30 check (limite_mensal_usd between 1 and 10000),
  alerta_pct          integer not null default 80 check (alerta_pct between 10 and 100),
  parar_no_limite     integer not null default 1 check (parar_no_limite in (0, 1)),
  versao              integer not null default 0,
  updated_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
insert or ignore into agente_config (id) values (1);

create table if not exists config_versoes (
  numero     integer primary key,
  dados      text not null check (json_valid(dados)),
  campos     text not null default '[]' check (json_valid(campos)),
  descricao  text,
  autor_id   text,
  autor_nome text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- 4. CONHECIMENTO (o agente consulta para tirar dúvidas)
-- ---------------------------------------------------------------------
create table if not exists conhecimento (
  id          text primary key,
  tipo        text not null check (tipo in ('pergunta', 'texto', 'arquivo', 'site')),
  titulo      text not null check (length(trim(titulo)) between 2 and 200),
  pergunta    text check (pergunta is null or length(pergunta) <= 1000),
  conteudo    text not null check (length(trim(conteudo)) between 2 and 60000),
  fonte       text check (fonte is null or length(fonte) <= 500),
  ativo       integer not null default 1 check (ativo in (0, 1)),
  alertas     text not null default '[]' check (json_valid(alertas)),
  criado_por  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (tipo <> 'pergunta' or length(trim(coalesce(pergunta, ''))) > 0),
  check (tipo <> 'site' or fonte like 'http://%' or fonte like 'https://%')
);
create index if not exists conhecimento_tipo_idx on conhecimento (tipo, ativo);

-- ---------------------------------------------------------------------
-- 5. INTEGRAÇÕES (o que NÃO é segredo) + SEGREDOS (cifrados pelo painel)
-- ---------------------------------------------------------------------
create table if not exists integracoes (
  id                       integer primary key check (id = 1),
  crm_url                  text check (crm_url is null or ((crm_url like 'http://%' or crm_url like 'https://%') and crm_url not like '%/' and crm_url not like '% %' and length(crm_url) <= 200)),
  whatsapp_phone_number_id text check (whatsapp_phone_number_id is null or (length(whatsapp_phone_number_id) between 5 and 30 and whatsapp_phone_number_id not glob '*[^0-9]*')),
  whatsapp_waba_id         text check (whatsapp_waba_id is null or (length(whatsapp_waba_id) between 5 and 30 and whatsapp_waba_id not glob '*[^0-9]*')),
  whatsapp_numero          text check (whatsapp_numero is null or length(whatsapp_numero) <= 30),
  whatsapp_graph_versao    text not null default 'v23.0' check (whatsapp_graph_versao glob 'v[0-9]*.[0-9]'),
  teste_crm                text check (teste_crm is null or json_valid(teste_crm)),
  teste_openai             text check (teste_openai is null or json_valid(teste_openai)),
  teste_whatsapp           text check (teste_whatsapp is null or json_valid(teste_whatsapp)),
  updated_at               text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
insert or ignore into integracoes (id) values (1);

-- O painel cifra (AES-GCM, chave-mestra só no servidor) e guarda aqui o texto cifrado e os 4 últimos caracteres.
create table if not exists segredos (
  nome           text primary key check (nome in ('crm_chave', 'crm_segredo_avisos', 'openai_chave', 'whatsapp_token', 'whatsapp_app_secret', 'whatsapp_verify_token')),
  cifrado        text not null check (cifrado like 'v1:%:%' and length(cifrado) <= 8000),
  final          text check (final is null or length(final) <= 8),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por text
);

-- ---------------------------------------------------------------------
-- 6. OPERAÇÃO: botão de emergência
-- ---------------------------------------------------------------------
create table if not exists operacao (
  id          integer primary key check (id = 1),
  pausado     integer not null default 0 check (pausado in (0, 1)),
  pausado_em  text,
  pausado_por text,
  motivo      text check (motivo is null or length(motivo) <= 300),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
insert or ignore into operacao (id) values (1);

-- ---------------------------------------------------------------------
-- 7. SIMULADOR: conversas de teste (a conversa em si mora no motor; aqui, o cadastro)
-- ---------------------------------------------------------------------
create table if not exists simulacoes (
  id              text primary key,
  criado_por      text references pessoas (id) on delete set null,
  criado_por_nome text not null default '',
  titulo          text not null default 'Simulação' check (length(titulo) between 1 and 120),
  modelo          text not null check (length(modelo) between 2 and 80 and modelo not glob '*[^a-z0-9._:-]*'),
  gravar_crm      integer not null default 0 check (gravar_crm in (0, 1)),
  mensagens       text not null default '[]' check (json_valid(mensagens) and json_type(mensagens) = 'array' and json_array_length(mensagens) <= 400),
  estado          text not null default '{}' check (json_valid(estado) and json_type(estado) = 'object'),
  custo_usd       real not null default 0 check (custo_usd >= 0),
  tokens          integer not null default 0 check (tokens >= 0),
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index if not exists simulacoes_data_idx on simulacoes (updated_at desc);

-- ---------------------------------------------------------------------
-- 8. USO DA IA (tokens e custo estimado): base do gasto do mês e do limite
-- ---------------------------------------------------------------------
create table if not exists uso_ia (
  id           integer primary key autoincrement,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  origem       text not null check (origem in ('simulador', 'agente', 'teste')),
  modelo       text not null,
  entrada      integer not null default 0 check (entrada >= 0),
  cache        integer not null default 0 check (cache >= 0),
  saida        integer not null default 0 check (saida >= 0),
  custo_usd    real not null default 0 check (custo_usd >= 0),
  simulacao_id text,
  ator_id      text
);
create index if not exists uso_ia_data_idx on uso_ia (created_at desc);
