-- =====================================================================
-- BANCO DO AGENTE SDR DA AURORA (projeto Supabase SEPARADO do CRM)
-- Cole TUDO no Supabase ▸ SQL Editor ▸ New query ▸ Run.
-- Pode rodar quantas vezes quiser: é idempotente e não apaga dados.
--
-- O que mora aqui:
--   * pessoas do painel (gestor e atendente) — o 1º login vira gestor;
--   * configuração do agente (instruções, transferência, horários, limites) COM VERSÕES;
--   * conhecimento (perguntas e respostas, textos, PDFs, páginas do site) com ALERTA
--     quando o texto fala de preço ou condição (isso só pode vir do CRM);
--   * integrações (CRM, OpenAI, WhatsApp) — as chaves ficam CRIPTOGRAFADAS pelo painel,
--     com uma chave-mestra que NÃO está no banco; nem o gestor consegue ler de volta;
--   * pausa geral do agente (botão de emergência);
--   * registro de tudo o que foi alterado.
--
-- Segurança: RLS em todas as tabelas; visitante (anon) não lê nada. Regras importantes
-- ficam em funções e gatilhos (não dá para burlar pelo navegador). Funções internas ficam
-- no esquema "privado", que a API do Supabase não expõe.
--
-- Este banco NUNCA acessa o banco do CRM. O agente fala com o CRM só pela API dele.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Texto sem acento e em minúsculas (para procurar palavras sem depender de acento).
create or replace function privado.normalizar(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

-- =====================================================================
-- 1. PESSOAS DO PAINEL (gestor e atendente)
-- =====================================================================
create table if not exists public.perfis (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  email      text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  nome       text not null check (char_length(trim(nome)) between 2 and 80),
  papel      text not null default 'atendente' check (papel in ('gestor', 'atendente')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists perfis_email_uidx on public.perfis (email);
drop trigger if exists trg_perfis_updated_at on public.perfis;
create trigger trg_perfis_updated_at before update on public.perfis
  for each row execute function public.set_updated_at();

-- Quem está logado (só ativo conta).
create or replace function public.meu_perfil_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.perfis p where p.user_id = auth.uid() and p.ativo limit 1;
$$;
revoke all on function public.meu_perfil_id() from public, anon;
grant execute on function public.meu_perfil_id() to authenticated;

create or replace function public.sou_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.ativo and p.papel = 'gestor');
$$;
revoke all on function public.sou_gestor() from public, anon;
grant execute on function public.sou_gestor() to authenticated;

create or replace function public.sou_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.meu_perfil_id() is not null;
$$;
revoke all on function public.sou_ativo() from public, anon;
grant execute on function public.sou_ativo() to authenticated;

-- Nome de quem está agindo (para o registro).
create or replace function privado.nome_ator()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.nome from public.perfis p where p.user_id = auth.uid() limit 1),
                  case when auth.uid() is null then 'Sistema' else 'Usuário' end);
$$;

-- 1º acesso: liga o login ao cadastro pelo e-mail. O PRIMEIRO login vira gestor.
-- Quem entra sem ter sido cadastrado em Equipe fica DESATIVADO até o gestor liberar.
create or replace function public.meu_perfil()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_p     public.perfis%rowtype;
  v_tem_gestor boolean;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_p from public.perfis where user_id = v_uid limit 1;
  if found then
    return to_jsonb(v_p);
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    return null;
  end if;

  -- cadastrado antes pelo gestor (tela Equipe): só liga o login
  update public.perfis set user_id = v_uid where email = v_email and user_id is null
  returning * into v_p;
  if v_p.id is not null then
    return to_jsonb(v_p);
  end if;

  -- trava curta: dois primeiros acessos simultâneos não viram dois gestores
  perform pg_advisory_xact_lock(hashtext('meu_perfil:primeiro_gestor'));
  v_tem_gestor := exists (select 1 from public.perfis p where p.papel = 'gestor' and p.ativo);
  insert into public.perfis (user_id, email, nome, papel, ativo)
  values (v_uid, v_email,
          coalesce(nullif(initcap(replace(split_part(v_email, '@', 1), '.', ' ')), ''), 'Pessoa'),
          case when v_tem_gestor then 'atendente' else 'gestor' end,
          not v_tem_gestor)
  on conflict (email) do nothing
  returning * into v_p;
  if v_p.id is null then
    select * into v_p from public.perfis where user_id = v_uid limit 1;
  end if;
  return to_jsonb(v_p);
end;
$$;
revoke all on function public.meu_perfil() from public, anon;
grant execute on function public.meu_perfil() to authenticated;

-- Nunca ficar sem gestor ativo; ninguém muda o próprio papel nem se desativa.
create or replace function privado.perfis_proteger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- só a função meu_perfil (que roda como dono do banco) liga o login ao cadastro
    if new.user_id is distinct from old.user_id and current_user in ('authenticated', 'anon') then
      raise exception 'O vínculo com o login é feito automaticamente no primeiro acesso.';
    end if;
    if old.user_id = auth.uid() and (new.papel <> old.papel or new.ativo <> old.ativo) then
      raise exception 'Você não pode mudar o seu próprio papel nem se desativar. Peça a outro gestor.';
    end if;
  end if;
  if (tg_op = 'DELETE' and old.papel = 'gestor' and old.ativo)
     or (tg_op = 'UPDATE' and old.papel = 'gestor' and old.ativo and (new.papel <> 'gestor' or not new.ativo)) then
    if not exists (select 1 from public.perfis p where p.papel = 'gestor' and p.ativo and p.id <> old.id) then
      raise exception 'É preciso ter pelo menos um gestor ativo.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_perfis_proteger on public.perfis;
create trigger trg_perfis_proteger before update or delete on public.perfis
  for each row execute function privado.perfis_proteger();

alter table public.perfis enable row level security;
drop policy if exists "perfis_select" on public.perfis;
create policy "perfis_select" on public.perfis for select to authenticated using (public.sou_ativo());
drop policy if exists "perfis_insert" on public.perfis;
create policy "perfis_insert" on public.perfis for insert to authenticated with check (public.sou_gestor() and user_id is null);
drop policy if exists "perfis_update" on public.perfis;
create policy "perfis_update" on public.perfis for update to authenticated using (public.sou_gestor()) with check (public.sou_gestor());
drop policy if exists "perfis_delete" on public.perfis;
create policy "perfis_delete" on public.perfis for delete to authenticated using (public.sou_gestor());

-- =====================================================================
-- 2. REGISTRO (tudo o que foi alterado, por quem)
-- =====================================================================
create table if not exists public.registro (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  ator_tipo  text not null default 'humano' check (ator_tipo in ('humano', 'agente', 'sistema')),
  ator_id    uuid,
  ator_nome  text not null,
  acao       text not null check (char_length(acao) <= 60),
  alvo       text check (alvo is null or char_length(alvo) <= 200),
  detalhes   jsonb not null default '{}'::jsonb
);
create index if not exists registro_data_idx on public.registro (created_at desc);
create index if not exists registro_acao_idx on public.registro (acao, created_at desc);

create or replace function privado.registrar(p_acao text, p_alvo text, p_detalhes jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.registro (ator_tipo, ator_id, ator_nome, acao, alvo, detalhes)
  values (case when auth.uid() is null then 'sistema' else 'humano' end,
          auth.uid(), privado.nome_ator(), p_acao, left(p_alvo, 200), coalesce(p_detalhes, '{}'::jsonb));
$$;

alter table public.registro enable row level security;
drop policy if exists "registro_select" on public.registro;
create policy "registro_select" on public.registro for select to authenticated using (public.sou_gestor());
-- ninguém grava direto: só as funções e gatilhos do banco

-- Registro das mudanças em pessoas
create or replace function privado.perfis_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform privado.registrar('equipe.incluiu', new.nome, jsonb_build_object('email', new.email, 'papel', new.papel, 'ativo', new.ativo));
  elsif tg_op = 'UPDATE' then
    if (new.nome, new.papel, new.ativo) is distinct from (old.nome, old.papel, old.ativo) then
      perform privado.registrar('equipe.alterou', new.nome, jsonb_build_object(
        'antes', jsonb_build_object('nome', old.nome, 'papel', old.papel, 'ativo', old.ativo),
        'depois', jsonb_build_object('nome', new.nome, 'papel', new.papel, 'ativo', new.ativo)));
    end if;
  else
    perform privado.registrar('equipe.removeu', old.nome, jsonb_build_object('email', old.email));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_perfis_registrar on public.perfis;
create trigger trg_perfis_registrar after insert or update or delete on public.perfis
  for each row execute function privado.perfis_registrar();

-- =====================================================================
-- 3. CONFIGURAÇÃO DO AGENTE (linha única) + VERSÕES
--    Tudo o que muda o COMPORTAMENTO do agente fica aqui e ganha versão a cada
--    alteração (dá para voltar a qualquer versão). Integrações e pausa ficam fora.
-- =====================================================================
create table if not exists public.agente_config (
  id                     uuid primary key default gen_random_uuid(),
  unica                  boolean not null default true unique check (unica),
  -- Agente
  nome_agente            text not null default 'Atendimento Aurora' check (char_length(trim(nome_agente)) between 2 and 60),
  apresentacao           text not null default '' check (char_length(apresentacao) <= 1000),
  tom                    text not null default '' check (char_length(tom) <= 1000),
  saudacao               text not null default '' check (char_length(saudacao) <= 1000),
  instrucoes             text not null default '' check (char_length(instrucoes) <= 20000),
  exemplos               jsonb not null default '[]'::jsonb check (jsonb_typeof(exemplos) = 'array' and jsonb_array_length(exemplos) <= 50),
  -- Transferência e horários
  gatilhos_palavras      text[] not null default '{}' check (cardinality(gatilhos_palavras) <= 100),
  gatilhos_temas         text[] not null default '{}' check (cardinality(gatilhos_temas) <= 50),
  max_msgs_sem_avanco    integer not null default 8 check (max_msgs_sem_avanco between 3 and 50),
  horario_equipe         jsonb not null default '{}'::jsonb check (jsonb_typeof(horario_equipe) = 'object'),
  agente_24h             boolean not null default true,
  mensagens              jsonb not null default '{}'::jsonb check (jsonb_typeof(mensagens) = 'object'),
  -- Comportamento
  espera_segundos        integer not null default 8 check (espera_segundos between 2 and 30),
  transcrever_audio      boolean not null default true,
  -- OpenAI: modelo e limite de gasto
  modelo                 text not null default 'gpt-6.1-terra' check (modelo ~ '^[a-z0-9][a-z0-9._:-]{1,79}$'),
  limite_mensal_usd      numeric(10,2) not null default 30 check (limite_mensal_usd between 1 and 10000),
  alerta_pct             integer not null default 80 check (alerta_pct between 10 and 100),
  parar_no_limite        boolean not null default true,
  versao                 integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
drop trigger if exists trg_agente_config_updated_at on public.agente_config;
create trigger trg_agente_config_updated_at before update on public.agente_config
  for each row execute function public.set_updated_at();

create table if not exists public.config_versoes (
  id         bigint generated always as identity primary key,
  numero     integer not null unique,
  dados      jsonb not null,
  campos     text[] not null default '{}',   -- o que mudou em relação à versão anterior
  descricao  text,
  autor_id   uuid,
  autor_nome text not null,
  created_at timestamptz not null default now()
);
create index if not exists config_versoes_data_idx on public.config_versoes (created_at desc);

-- Campos da configuração que fazem parte da versão (tudo menos controle interno).
create or replace function privado.config_dados(c public.agente_config)
returns jsonb
language sql
immutable
as $$
  select to_jsonb(c) - 'id' - 'unica' - 'versao' - 'created_at' - 'updated_at';
$$;

-- Toda alteração vira uma versão nova (com a lista do que mudou).
create or replace function privado.agente_config_versionar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo     jsonb := privado.config_dados(new);
  v_antigo   jsonb := case when tg_op = 'UPDATE' then privado.config_dados(old) else '{}'::jsonb end;
  v_campos   text[];
  v_desc     text := nullif(current_setting('aurora.descricao_versao', true), '');
begin
  select coalesce(array_agg(k order by k), '{}') into v_campos
    from jsonb_object_keys(v_novo) k
   where v_novo -> k is distinct from v_antigo -> k;
  -- a criação da linha (vazia) não é uma versão: a 1ª versão é o primeiro conteúdo de verdade
  if tg_op = 'INSERT' then
    new.versao := 0;
    return new;
  end if;
  if cardinality(v_campos) = 0 then
    new.versao := old.versao;
    return new;
  end if;
  new.versao := coalesce((select max(numero) from public.config_versoes), 0) + 1;
  insert into public.config_versoes (numero, dados, campos, descricao, autor_id, autor_nome)
  values (new.versao, v_novo, v_campos, v_desc, auth.uid(), privado.nome_ator());
  perform privado.registrar('config.alterou', 'Versão ' || new.versao,
    jsonb_build_object('versao', new.versao, 'campos', to_jsonb(v_campos), 'descricao', v_desc));
  return new;
end;
$$;
drop trigger if exists trg_agente_config_versionar on public.agente_config;
create trigger trg_agente_config_versionar before insert or update on public.agente_config
  for each row execute function privado.agente_config_versionar();

-- a linha única (versão 0 = vazia; a versão 1 nasce com os dados iniciais)
insert into public.agente_config (unica) select true where not exists (select 1 from public.agente_config);

-- Voltar para uma versão anterior (gera uma versão NOVA igual à escolhida).
create or replace function public.restaurar_versao(p_numero integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dados jsonb;
  v_c     public.agente_config%rowtype;
begin
  if not public.sou_gestor() then
    raise exception 'Só o gestor pode voltar a uma versão anterior.';
  end if;
  select dados into v_dados from public.config_versoes where numero = p_numero;
  if v_dados is null then
    raise exception 'Versão % não encontrada.', p_numero;
  end if;
  select * into v_c from public.agente_config where unica for update;
  -- aplica os campos da versão sobre a linha atual (campos novos que a versão não tinha ficam como estão)
  v_c := jsonb_populate_record(v_c, v_dados);
  perform set_config('aurora.descricao_versao', 'Voltou para a versão ' || p_numero, true);
  update public.agente_config set
    nome_agente = v_c.nome_agente, apresentacao = v_c.apresentacao, tom = v_c.tom, saudacao = v_c.saudacao,
    instrucoes = v_c.instrucoes, exemplos = v_c.exemplos,
    gatilhos_palavras = v_c.gatilhos_palavras, gatilhos_temas = v_c.gatilhos_temas,
    max_msgs_sem_avanco = v_c.max_msgs_sem_avanco, horario_equipe = v_c.horario_equipe,
    agente_24h = v_c.agente_24h, mensagens = v_c.mensagens,
    espera_segundos = v_c.espera_segundos, transcrever_audio = v_c.transcrever_audio,
    modelo = v_c.modelo, limite_mensal_usd = v_c.limite_mensal_usd, alerta_pct = v_c.alerta_pct,
    parar_no_limite = v_c.parar_no_limite
  where unica
  returning * into v_c;
  perform set_config('aurora.descricao_versao', '', true);
  return v_c.versao;
end;
$$;
revoke all on function public.restaurar_versao(integer) from public, anon;
grant execute on function public.restaurar_versao(integer) to authenticated;

alter table public.agente_config enable row level security;
drop policy if exists "agente_config_select" on public.agente_config;
create policy "agente_config_select" on public.agente_config for select to authenticated using (public.sou_ativo());
drop policy if exists "agente_config_update" on public.agente_config;
create policy "agente_config_update" on public.agente_config for update to authenticated
  using (public.sou_gestor()) with check (public.sou_gestor());
-- sem insert/delete: a linha é única e criada por este script

alter table public.config_versoes enable row level security;
drop policy if exists "config_versoes_select" on public.config_versoes;
create policy "config_versoes_select" on public.config_versoes for select to authenticated using (public.sou_gestor());

-- =====================================================================
-- 4. CONHECIMENTO (o agente consulta para tirar dúvidas)
--    Preço, condição, desconto e disponibilidade SÓ podem vir do CRM: o banco marca
--    sozinho os textos que parecem falar disso (alertas) para o gestor revisar.
-- =====================================================================
create table if not exists public.conhecimento (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('pergunta', 'texto', 'arquivo', 'site')),
  titulo      text not null check (char_length(trim(titulo)) between 2 and 200),
  pergunta    text check (pergunta is null or char_length(pergunta) <= 1000),
  conteudo    text not null check (char_length(trim(conteudo)) between 2 and 60000),
  fonte       text check (fonte is null or char_length(fonte) <= 500),
  ativo       boolean not null default true,
  alertas     text[] not null default '{}',
  criado_por  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint conhecimento_pergunta_ck check (tipo <> 'pergunta' or nullif(trim(pergunta), '') is not null),
  constraint conhecimento_fonte_site_ck check (tipo <> 'site' or fonte ~ '^https?://')
);
create index if not exists conhecimento_tipo_idx on public.conhecimento (tipo, ativo);
drop trigger if exists trg_conhecimento_updated_at on public.conhecimento;
create trigger trg_conhecimento_updated_at before update on public.conhecimento
  for each row execute function public.set_updated_at();

-- Procura no texto sinais de preço, condição comercial, desconto e disponibilidade.
create or replace function public.alertas_texto(p text)
returns text[]
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  t text := privado.normalizar(p);
  r text[] := '{}';
begin
  if t ~ 'r\$\s*\d' or t ~ '\d+(\.\d{3})*,\d{2}\s*(reais|r\$)?' or t ~ '\m\d+\s*reais\M' or t ~ '\mreais\M' then
    r := array_append(r, 'valor em reais');
  end if;
  if t ~ '\d+([.,]\d+)?\s*%' or t ~ '\mpor cento\M' then
    r := array_append(r, 'percentual');
  end if;
  if t ~ '\m(preco|precos|custa|custam|custo|valor do|valor da|valores|investimento|tabela de)\M' then
    r := array_append(r, 'menção a preço');
  end if;
  if t ~ '\m(desconto|descontos|promocao|promocoes|cupom|cortesia|gratis|gratuito)\M' then
    r := array_append(r, 'desconto ou cortesia');
  end if;
  if t ~ '\m(entrada|sinal|parcela|parcelas|parcelado|parcelamento|a vista|pix|boleto|cartao|pagamento|saldo)\M' then
    r := array_append(r, 'forma de pagamento');
  end if;
  if t ~ '\m(multa|cancelamento|cancelar|reembolso|estorno|rescisao)\M' then
    r := array_append(r, 'cancelamento ou multa');
  end if;
  if t ~ '\m(disponibilidade|data livre|datas livres|agenda livre|vaga|vagas|lotad[ao])\M' then
    r := array_append(r, 'disponibilidade de data');
  end if;
  return r;
end;
$$;
grant execute on function public.alertas_texto(text) to authenticated;

create or replace function privado.conhecimento_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.titulo := trim(new.titulo);
  new.conteudo := trim(new.conteudo);
  new.pergunta := nullif(trim(new.pergunta), '');
  new.alertas := public.alertas_texto(coalesce(new.pergunta, '') || E'\n' || new.titulo || E'\n' || new.conteudo);
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, public.meu_perfil_id());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_conhecimento_antes on public.conhecimento;
create trigger trg_conhecimento_antes before insert or update on public.conhecimento
  for each row execute function privado.conhecimento_antes();

-- Registro: guarda o texto ANTERIOR em alterações e exclusões (dá para recuperar).
create or replace function privado.conhecimento_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform privado.registrar('conhecimento.incluiu', new.titulo, jsonb_build_object('id', new.id, 'tipo', new.tipo, 'alertas', to_jsonb(new.alertas)));
  elsif tg_op = 'UPDATE' then
    if (new.titulo, new.pergunta, new.conteudo, new.ativo, new.fonte) is distinct from (old.titulo, old.pergunta, old.conteudo, old.ativo, old.fonte) then
      perform privado.registrar(
        case when new.ativo <> old.ativo and (new.titulo, new.pergunta, new.conteudo) is not distinct from (old.titulo, old.pergunta, old.conteudo)
             then case when new.ativo then 'conhecimento.ativou' else 'conhecimento.desativou' end
             else 'conhecimento.alterou' end,
        new.titulo,
        jsonb_build_object('id', new.id, 'antes', jsonb_build_object('titulo', old.titulo, 'pergunta', old.pergunta, 'conteudo', old.conteudo)));
    end if;
  else
    perform privado.registrar('conhecimento.excluiu', old.titulo,
      jsonb_build_object('id', old.id, 'tipo', old.tipo, 'antes', jsonb_build_object('titulo', old.titulo, 'pergunta', old.pergunta, 'conteudo', old.conteudo, 'fonte', old.fonte)));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_conhecimento_registrar on public.conhecimento;
create trigger trg_conhecimento_registrar after insert or update or delete on public.conhecimento
  for each row execute function privado.conhecimento_registrar();

-- Se a regra dos alertas mudar, recalcula os itens já cadastrados (só os que mudaram).
update public.conhecimento c
   set alertas = public.alertas_texto(coalesce(c.pergunta, '') || E'\n' || c.titulo || E'\n' || c.conteudo)
 where c.alertas is distinct from public.alertas_texto(coalesce(c.pergunta, '') || E'\n' || c.titulo || E'\n' || c.conteudo);

alter table public.conhecimento enable row level security;
drop policy if exists "conhecimento_select" on public.conhecimento;
create policy "conhecimento_select" on public.conhecimento for select to authenticated using (public.sou_ativo());
drop policy if exists "conhecimento_insert" on public.conhecimento;
create policy "conhecimento_insert" on public.conhecimento for insert to authenticated with check (public.sou_gestor());
drop policy if exists "conhecimento_update" on public.conhecimento;
create policy "conhecimento_update" on public.conhecimento for update to authenticated using (public.sou_gestor()) with check (public.sou_gestor());
drop policy if exists "conhecimento_delete" on public.conhecimento;
create policy "conhecimento_delete" on public.conhecimento for delete to authenticated using (public.sou_gestor());

-- =====================================================================
-- 5. INTEGRAÇÕES (dados que NÃO são segredo) + SEGREDOS (criptografados)
-- =====================================================================
create table if not exists public.integracoes (
  id                       uuid primary key default gen_random_uuid(),
  unica                    boolean not null default true unique check (unica),
  crm_url                  text check (crm_url is null or crm_url ~ '^https?://[^\s/]+(:\d+)?$'),
  whatsapp_phone_number_id text check (whatsapp_phone_number_id is null or whatsapp_phone_number_id ~ '^\d{5,30}$'),
  whatsapp_waba_id         text check (whatsapp_waba_id is null or whatsapp_waba_id ~ '^\d{5,30}$'),
  whatsapp_numero          text check (whatsapp_numero is null or char_length(whatsapp_numero) <= 30),
  whatsapp_graph_versao    text not null default 'v23.0' check (whatsapp_graph_versao ~ '^v\d{1,3}\.\d$'),
  -- resultado do último "testar conexão" de cada serviço: {ok, em, mensagem, detalhes}
  teste_crm                jsonb,
  teste_openai             jsonb,
  teste_whatsapp           jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
drop trigger if exists trg_integracoes_updated_at on public.integracoes;
create trigger trg_integracoes_updated_at before update on public.integracoes
  for each row execute function public.set_updated_at();
insert into public.integracoes (unica) values (true) on conflict (unica) do nothing;

create or replace function privado.integracoes_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes  jsonb := to_jsonb(old) - 'id' - 'unica' - 'created_at' - 'updated_at' - 'teste_crm' - 'teste_openai' - 'teste_whatsapp';
  v_depois jsonb := to_jsonb(new) - 'id' - 'unica' - 'created_at' - 'updated_at' - 'teste_crm' - 'teste_openai' - 'teste_whatsapp';
begin
  if v_antes is distinct from v_depois then
    perform privado.registrar('integracoes.alterou', 'Integrações', jsonb_build_object('antes', v_antes, 'depois', v_depois));
  end if;
  return null;
end;
$$;
drop trigger if exists trg_integracoes_registrar on public.integracoes;
create trigger trg_integracoes_registrar after update on public.integracoes
  for each row execute function privado.integracoes_registrar();

alter table public.integracoes enable row level security;
drop policy if exists "integracoes_select" on public.integracoes;
create policy "integracoes_select" on public.integracoes for select to authenticated using (public.sou_gestor());
drop policy if exists "integracoes_update" on public.integracoes;
create policy "integracoes_update" on public.integracoes for update to authenticated using (public.sou_gestor()) with check (public.sou_gestor());

-- Segredos: o PAINEL criptografa (AES-GCM, chave-mestra só no servidor/Cloudflare) e
-- guarda aqui só o texto cifrado e os 4 últimos caracteres. A tabela não é lida por
-- ninguém diretamente: só pelas funções abaixo.
create table if not exists public.segredos (
  nome            text primary key check (nome in (
                    'crm_chave', 'crm_segredo_avisos', 'openai_chave',
                    'whatsapp_token', 'whatsapp_app_secret', 'whatsapp_verify_token')),
  cifrado         text not null check (cifrado ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' and char_length(cifrado) <= 8000),
  final           text check (final is null or char_length(final) <= 8),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);
alter table public.segredos enable row level security;
-- nenhuma política: nem o gestor lê a tabela diretamente
revoke all on table public.segredos from anon, authenticated;

create or replace function public.salvar_segredo(p_nome text, p_cifrado text, p_final text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Só o gestor altera as chaves das integrações.';
  end if;
  insert into public.segredos (nome, cifrado, final, atualizado_em, atualizado_por)
  values (p_nome, p_cifrado, nullif(right(coalesce(p_final, ''), 4), ''), now(), privado.nome_ator())
  on conflict (nome) do update
    set cifrado = excluded.cifrado, final = excluded.final, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
  -- o registro diz QUAL chave mudou, nunca o valor
  perform privado.registrar('segredo.alterou', p_nome, jsonb_build_object('final', nullif(right(coalesce(p_final, ''), 4), '')));
end;
$$;
revoke all on function public.salvar_segredo(text, text, text) from public, anon;
grant execute on function public.salvar_segredo(text, text, text) to authenticated;

create or replace function public.apagar_segredo(p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Só o gestor altera as chaves das integrações.';
  end if;
  delete from public.segredos where nome = p_nome;
  if found then
    perform privado.registrar('segredo.apagou', p_nome, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.apagar_segredo(text) from public, anon;
grant execute on function public.apagar_segredo(text) to authenticated;

-- Situação das chaves (sem o valor): quais estão cadastradas, final e quando.
create or replace function public.situacao_segredos()
returns table (nome text, final text, atualizado_em timestamptz, atualizado_por text)
language sql
stable
security definer
set search_path = public
as $$
  select s.nome, s.final, s.atualizado_em, s.atualizado_por
    from public.segredos s
   where public.sou_gestor()
   order by s.nome;
$$;
revoke all on function public.situacao_segredos() from public, anon;
grant execute on function public.situacao_segredos() to authenticated;

-- Texto cifrado de UMA chave, para o servidor do painel decifrar ao "testar conexão".
-- Sem a chave-mestra (que não está no banco) o texto cifrado não serve para nada.
create or replace function public.segredo_cifrado(p_nome text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.cifrado from public.segredos s where s.nome = p_nome and public.sou_gestor();
$$;
revoke all on function public.segredo_cifrado(text) from public, anon;
grant execute on function public.segredo_cifrado(text) to authenticated;

-- Resultado do "testar conexão" (gravado pelo servidor do painel).
create or replace function public.gravar_teste_integracao(p_servico text, p_resultado jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Só o gestor testa as integrações.';
  end if;
  if p_servico not in ('crm', 'openai', 'whatsapp') then
    raise exception 'Serviço desconhecido.';
  end if;
  execute format('update public.integracoes set %I = $1 where unica', 'teste_' || p_servico)
    using jsonb_build_object('em', now()) || coalesce(p_resultado, '{}'::jsonb);
  perform privado.registrar('integracoes.testou', p_servico,
    jsonb_build_object('ok', coalesce((p_resultado ->> 'ok')::boolean, false), 'mensagem', left(p_resultado ->> 'mensagem', 300)));
end;
$$;
revoke all on function public.gravar_teste_integracao(text, jsonb) from public, anon;
grant execute on function public.gravar_teste_integracao(text, jsonb) to authenticated;

-- =====================================================================
-- 6. OPERAÇÃO: botão de emergência (pausar o agente inteiro)
--    Qualquer pessoa ativa PAUSA (segurança em primeiro lugar); só o gestor RETOMA.
-- =====================================================================
create table if not exists public.operacao (
  id             uuid primary key default gen_random_uuid(),
  unica          boolean not null default true unique check (unica),
  pausado        boolean not null default false,
  pausado_em     timestamptz,
  pausado_por    text,
  motivo         text check (motivo is null or char_length(motivo) <= 300),
  updated_at     timestamptz not null default now()
);
insert into public.operacao (unica) values (true) on conflict (unica) do nothing;
drop trigger if exists trg_operacao_updated_at on public.operacao;
create trigger trg_operacao_updated_at before update on public.operacao
  for each row execute function public.set_updated_at();

alter table public.operacao enable row level security;
drop policy if exists "operacao_select" on public.operacao;
create policy "operacao_select" on public.operacao for select to authenticated using (public.sou_ativo());
-- gravação só pelas funções abaixo

create or replace function public.pausar_agente(p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_ativo() then
    raise exception 'Sem permissão.';
  end if;
  update public.operacao
     set pausado = true, pausado_em = now(), pausado_por = privado.nome_ator(),
         motivo = nullif(left(trim(coalesce(p_motivo, '')), 300), '')
   where unica and not pausado;
  if found then
    perform privado.registrar('agente.pausou', 'Agente inteiro', jsonb_build_object('motivo', nullif(trim(coalesce(p_motivo, '')), '')));
  end if;
end;
$$;
revoke all on function public.pausar_agente(text) from public, anon;
grant execute on function public.pausar_agente(text) to authenticated;

create or replace function public.retomar_agente()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Só o gestor pode religar o agente.';
  end if;
  update public.operacao set pausado = false, pausado_em = null, pausado_por = null, motivo = null
   where unica and pausado;
  if found then
    perform privado.registrar('agente.retomou', 'Agente inteiro', '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.retomar_agente() from public, anon;
grant execute on function public.retomar_agente() to authenticated;

-- =====================================================================
-- Funções internas: ninguém de fora executa.
-- =====================================================================
revoke all on all functions in schema privado from public, anon, authenticated;
