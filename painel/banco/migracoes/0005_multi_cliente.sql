-- =====================================================================
-- 0005 — MULTI-CLIENTE (Fase 1 da plataforma, docs/PLANO-PLATAFORMA.md)
--
-- * clientes: cada empresa atendida (o "CRM do Renato"). O id é o apelido curto e não muda (ex.: aurora).
-- * membros: quem da equipe de cada cliente acessa o quê (gestor ou atendente DAQUELE cliente).
-- * pessoas.dono = 1: o dono da plataforma (vê e administra todos os clientes, no Estúdio).
-- * Todas as tabelas de dados ganham cliente_id. As de linha única (agente_config, integracoes, operacao)
--   viram uma linha por cliente. agente_config → agentes; config_versoes → agente_versoes.
--
-- CONVERSÃO DE UMA INSTALAÇÃO QUE JÁ EXISTIA (banco com gente cadastrada): os dados de antes eram de um cliente só
-- (a Aurora Bartenders) e passam a ser do cliente "aurora". A 1ª pessoa gestora (quem instalou) vira a dona da
-- plataforma; as outras viram membros da Aurora com o mesmo papel. As conversas do WhatsApp da Aurora mantêm os
-- nomes antigos (conversas_sem_prefixo = 1), para a memória das conversas não se perder.
-- Banco novo (vazio): nada disso acontece; o dono nasce na instalação e cria os clientes no Estúdio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CLIENTES E MEMBROS
-- ---------------------------------------------------------------------
create table clientes (
  id                    text primary key check (length(id) between 2 and 30 and id not glob '*[^a-z0-9-]*' and id not like '-%' and id not like '%-'),
  nome                  text not null check (length(trim(nome)) between 2 and 80),
  situacao              text not null default 'ativo' check (situacao in ('ativo', 'pausado', 'encerrado')),
  -- marca: { "principal": "#RRGGBB", "destaque": "#RRGGBB", "fonte": "...", "logo": "/caminho ou https://..." }
  marca                 text not null default '{}' check (json_valid(marca) and json_type(marca) = 'object' and length(marca) <= 2000),
  fuso                  text not null default 'America/Sao_Paulo' check (length(fuso) between 3 and 60),
  plano_nome            text check (plano_nome is null or length(plano_nome) <= 60),
  plano_valor_brl       real check (plano_valor_brl is null or plano_valor_brl between 0 and 1000000),
  dia_fechamento        integer not null default 1 check (dia_fechamento between 1 and 28),
  responsavel_nome      text check (responsavel_nome is null or length(responsavel_nome) <= 80),
  responsavel_email     text check (responsavel_email is null or (responsavel_email like '%_@_%._%' and length(responsavel_email) <= 200)),
  responsavel_telefone  text check (responsavel_telefone is null or length(responsavel_telefone) <= 30),
  observacoes           text check (observacoes is null or length(observacoes) <= 2000),
  -- 1 = conversas do WhatsApp com o nome antigo (wa-<telefone>), sem o cliente na frente. Só o cliente convertido.
  conversas_sem_prefixo integer not null default 0 check (conversas_sem_prefixo in (0, 1)),
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index clientes_um_sem_prefixo on clientes (conversas_sem_prefixo) where conversas_sem_prefixo = 1;

create table membros (
  cliente_id text not null references clientes (id) on delete cascade,
  pessoa_id  text not null references pessoas (id) on delete cascade,
  papel      text not null default 'atendente' check (papel in ('gestor', 'atendente')),
  ativo      integer not null default 1 check (ativo in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (cliente_id, pessoa_id)
);
create index membros_pessoa_idx on membros (pessoa_id);

-- Dono da plataforma e confirmação em duas etapas (código do aplicativo autenticador, TOTP).
-- pessoas.papel deixa de valer (o papel agora é por cliente, em membros); fica só por compatibilidade.
alter table pessoas add column dono integer not null default 0 check (dono in (0, 1));
alter table pessoas add column totp_cifrado text check (totp_cifrado is null or (totp_cifrado like 'v1:%:%' and length(totp_cifrado) <= 500));
alter table pessoas add column totp_ativo integer not null default 0 check (totp_ativo in (0, 1));
-- Último passo de 30 s já usado: o mesmo código não serve duas vezes.
alter table pessoas add column totp_ultimo_passo integer;
-- Sessão aberta com a senha, esperando o código das duas etapas: confirmada = 0 (não vale para nada além do código).
alter table sessoes add column confirmada integer not null default 1 check (confirmada in (0, 1));

-- Conversão da instalação existente (só se já havia gente cadastrada).
insert into clientes (id, nome, conversas_sem_prefixo)
select 'aurora', 'Aurora Bartenders', 1 where exists (select 1 from pessoas);

update pessoas set dono = 1
 where id = (select id from pessoas where papel = 'gestor' and ativo = 1 order by created_at limit 1);

insert into membros (cliente_id, pessoa_id, papel, ativo)
select 'aurora', id, papel, ativo from pessoas
 where dono = 0 and exists (select 1 from clientes where id = 'aurora');

-- ---------------------------------------------------------------------
-- 2. AGENTE (uma linha por cliente) E VERSÕES
-- ---------------------------------------------------------------------
create table agentes (
  cliente_id              text primary key references clientes (id) on delete cascade,
  nome_agente             text not null default 'Atendimento' check (length(trim(nome_agente)) between 2 and 60),
  apresentacao            text not null default '' check (length(apresentacao) <= 1000),
  tom                     text not null default '' check (length(tom) <= 1000),
  saudacao                text not null default '' check (length(saudacao) <= 1000),
  instrucoes              text not null default '' check (length(instrucoes) <= 20000),
  exemplos                text not null default '[]' check (json_valid(exemplos) and json_type(exemplos) = 'array' and json_array_length(exemplos) <= 50),
  gatilhos_palavras       text not null default '[]' check (json_valid(gatilhos_palavras) and json_type(gatilhos_palavras) = 'array' and json_array_length(gatilhos_palavras) <= 100),
  gatilhos_temas          text not null default '[]' check (json_valid(gatilhos_temas) and json_type(gatilhos_temas) = 'array' and json_array_length(gatilhos_temas) <= 50),
  max_msgs_sem_avanco     integer not null default 8 check (max_msgs_sem_avanco between 3 and 50),
  horario_equipe          text not null default '{}' check (json_valid(horario_equipe) and json_type(horario_equipe) = 'object'),
  agente_24h              integer not null default 1 check (agente_24h in (0, 1)),
  mensagens               text not null default '{}' check (json_valid(mensagens) and json_type(mensagens) = 'object'),
  espera_segundos         integer not null default 8 check (espera_segundos between 2 and 30),
  transcrever_audio       integer not null default 1 check (transcrever_audio in (0, 1)),
  modelo                  text not null default 'gpt-6-luna' check (length(modelo) between 2 and 80 and modelo not glob '*[^a-z0-9._:-]*'),
  limite_mensal_usd       real not null default 30 check (limite_mensal_usd between 1 and 10000),
  alerta_pct              integer not null default 80 check (alerta_pct between 10 and 100),
  parar_no_limite         integer not null default 1 check (parar_no_limite in (0, 1)),
  retomada_aberta_min     integer not null default 30 check (retomada_aberta_min between 10 and 720),
  retomada_nao_aberta_min integer not null default 120 check (retomada_nao_aberta_min between 30 and 1200),
  versao                  integer not null default 0,
  updated_at              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
insert into agentes (cliente_id, nome_agente, apresentacao, tom, saudacao, instrucoes, exemplos, gatilhos_palavras, gatilhos_temas,
  max_msgs_sem_avanco, horario_equipe, agente_24h, mensagens, espera_segundos, transcrever_audio, modelo, limite_mensal_usd, alerta_pct,
  parar_no_limite, retomada_aberta_min, retomada_nao_aberta_min, versao, updated_at)
select 'aurora', nome_agente, apresentacao, tom, saudacao, instrucoes, exemplos, gatilhos_palavras, gatilhos_temas,
  max_msgs_sem_avanco, horario_equipe, agente_24h, mensagens, espera_segundos, transcrever_audio, modelo, limite_mensal_usd, alerta_pct,
  parar_no_limite, retomada_aberta_min, retomada_nao_aberta_min, versao, updated_at
  from agente_config where id = 1 and exists (select 1 from clientes where id = 'aurora');
drop table agente_config;

create table agente_versoes (
  cliente_id text not null references clientes (id) on delete cascade,
  numero     integer not null,
  dados      text not null check (json_valid(dados)),
  campos     text not null default '[]' check (json_valid(campos)),
  descricao  text,
  autor_id   text,
  autor_nome text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (cliente_id, numero)
);
insert into agente_versoes (cliente_id, numero, dados, campos, descricao, autor_id, autor_nome, created_at)
select 'aurora', numero, dados, campos, descricao, autor_id, autor_nome, created_at
  from config_versoes where exists (select 1 from clientes where id = 'aurora');
drop table config_versoes;

-- ---------------------------------------------------------------------
-- 3. INTEGRAÇÕES E SEGREDOS (por cliente)
-- ---------------------------------------------------------------------
create table integracoes_nova (
  cliente_id               text primary key references clientes (id) on delete cascade,
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
insert into integracoes_nova (cliente_id, crm_url, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_numero, whatsapp_graph_versao, teste_crm, teste_openai, teste_whatsapp, updated_at)
select 'aurora', crm_url, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_numero, whatsapp_graph_versao, teste_crm, teste_openai, teste_whatsapp, updated_at
  from integracoes where id = 1 and exists (select 1 from clientes where id = 'aurora');
drop table integracoes;
alter table integracoes_nova rename to integracoes;
-- Um número de WhatsApp pertence a um cliente só (é por ele que o motor descobre de quem é a mensagem).
create unique index integracoes_whatsapp_idx on integracoes (whatsapp_phone_number_id);

create table segredos_nova (
  cliente_id     text not null references clientes (id) on delete cascade,
  nome           text not null check (nome in ('crm_chave', 'crm_segredo_avisos', 'openai_chave', 'whatsapp_token', 'whatsapp_app_secret', 'whatsapp_verify_token')),
  cifrado        text not null check (cifrado like 'v1:%:%' and length(cifrado) <= 8000),
  final          text check (final is null or length(final) <= 8),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por text,
  primary key (cliente_id, nome)
);
insert into segredos_nova (cliente_id, nome, cifrado, final, atualizado_em, atualizado_por)
select 'aurora', nome, cifrado, final, atualizado_em, atualizado_por from segredos where exists (select 1 from clientes where id = 'aurora');
drop table segredos;
alter table segredos_nova rename to segredos;

-- ---------------------------------------------------------------------
-- 4. OPERAÇÃO (botão de emergência, por cliente)
-- ---------------------------------------------------------------------
create table operacao_nova (
  cliente_id  text primary key references clientes (id) on delete cascade,
  pausado     integer not null default 0 check (pausado in (0, 1)),
  pausado_em  text,
  pausado_por text,
  motivo      text check (motivo is null or length(motivo) <= 300),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
insert into operacao_nova (cliente_id, pausado, pausado_em, pausado_por, motivo, updated_at)
select 'aurora', pausado, pausado_em, pausado_por, motivo, updated_at from operacao where id = 1 and exists (select 1 from clientes where id = 'aurora');
drop table operacao;
alter table operacao_nova rename to operacao;

-- ---------------------------------------------------------------------
-- 5. CONHECIMENTO, SIMULAÇÕES, USO DA IA, REGISTRO (+ cliente)
-- ---------------------------------------------------------------------
create table conhecimento_nova (
  id          text primary key,
  cliente_id  text not null references clientes (id) on delete cascade,
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
insert into conhecimento_nova (id, cliente_id, tipo, titulo, pergunta, conteudo, fonte, ativo, alertas, criado_por, created_at, updated_at)
select id, 'aurora', tipo, titulo, pergunta, conteudo, fonte, ativo, alertas, criado_por, created_at, updated_at
  from conhecimento where exists (select 1 from clientes where id = 'aurora');
drop table conhecimento;
alter table conhecimento_nova rename to conhecimento;
create index conhecimento_cliente_idx on conhecimento (cliente_id, tipo, ativo);

create table simulacoes_nova (
  id              text primary key,
  cliente_id      text not null references clientes (id) on delete cascade,
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
insert into simulacoes_nova (id, cliente_id, criado_por, criado_por_nome, titulo, modelo, gravar_crm, mensagens, estado, custo_usd, tokens, created_at, updated_at)
select id, 'aurora', criado_por, criado_por_nome, titulo, modelo, gravar_crm, mensagens, estado, custo_usd, tokens, created_at, updated_at
  from simulacoes where exists (select 1 from clientes where id = 'aurora');
drop table simulacoes;
alter table simulacoes_nova rename to simulacoes;
create index simulacoes_cliente_idx on simulacoes (cliente_id, updated_at desc);

create table uso_ia_nova (
  id           integer primary key autoincrement,
  cliente_id   text not null references clientes (id) on delete cascade,
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
insert into uso_ia_nova (id, cliente_id, created_at, origem, modelo, entrada, cache, saida, custo_usd, simulacao_id, ator_id)
select id, 'aurora', created_at, origem, modelo, entrada, cache, saida, custo_usd, simulacao_id, ator_id
  from uso_ia where exists (select 1 from clientes where id = 'aurora');
drop table uso_ia;
alter table uso_ia_nova rename to uso_ia;
create index uso_ia_cliente_idx on uso_ia (cliente_id, created_at desc);

-- Registro: cliente_id nulo = ação da plataforma (ex.: criar um cliente fica no registro DELE; instalar, sem cliente).
-- Sem "on delete cascade": um cliente com histórico não é apagado (só encerrado).
create table registro_nova (
  id         integer primary key autoincrement,
  cliente_id text references clientes (id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ator_tipo  text not null default 'humano' check (ator_tipo in ('humano', 'agente', 'sistema')),
  ator_id    text,
  ator_nome  text not null,
  acao       text not null check (length(acao) <= 60),
  alvo       text check (alvo is null or length(alvo) <= 200),
  detalhes   text not null default '{}' check (json_valid(detalhes))
);
insert into registro_nova (id, cliente_id, created_at, ator_tipo, ator_id, ator_nome, acao, alvo, detalhes)
select id, (select id from clientes where id = 'aurora'), created_at, ator_tipo, ator_id, ator_nome, acao, alvo, detalhes from registro;
drop table registro;
alter table registro_nova rename to registro;
create index registro_cliente_idx on registro (cliente_id, id desc);

-- ---------------------------------------------------------------------
-- 6. AVISOS DO CRM E PEDIDO ↔ CONVERSA DO WHATSAPP (+ cliente)
-- ---------------------------------------------------------------------
create table avisos_crm_nova (
  cliente_id    text not null references clientes (id) on delete cascade,
  id            integer not null,
  tipo          text not null check (length(tipo) <= 60),
  negocio_id    text,
  proposta_id   text,
  contato_id    text,
  dados         text not null default '{}' check (json_valid(dados)),
  criado_em     text,
  recebido_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processado_em text,
  primary key (cliente_id, id)
);
insert into avisos_crm_nova (cliente_id, id, tipo, negocio_id, proposta_id, contato_id, dados, criado_em, recebido_em, processado_em)
select 'aurora', id, tipo, negocio_id, proposta_id, contato_id, dados, criado_em, recebido_em, processado_em
  from avisos_crm where exists (select 1 from clientes where id = 'aurora');
drop table avisos_crm;
alter table avisos_crm_nova rename to avisos_crm;
create index avisos_crm_pendentes_idx on avisos_crm (cliente_id, processado_em, id);

create table conversas_whatsapp_nova (
  cliente_id        text not null references clientes (id) on delete cascade,
  negocio_id        text not null,
  conversa          text not null,
  telefone          text not null,
  ultima_do_cliente text,
  atualizado_em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (cliente_id, negocio_id)
);
insert into conversas_whatsapp_nova (cliente_id, negocio_id, conversa, telefone, ultima_do_cliente, atualizado_em)
select 'aurora', negocio_id, conversa, telefone, ultima_do_cliente, atualizado_em
  from conversas_whatsapp where exists (select 1 from clientes where id = 'aurora');
drop table conversas_whatsapp;
alter table conversas_whatsapp_nova rename to conversas_whatsapp;
create index conversas_whatsapp_conversa_idx on conversas_whatsapp (cliente_id, conversa);
