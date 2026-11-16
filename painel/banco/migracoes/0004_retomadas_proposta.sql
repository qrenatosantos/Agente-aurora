-- Lembretes da proposta: quantos minutos a Cecília espera para perguntar o que o cliente achou.
alter table agente_config add column retomada_aberta_min integer not null default 30 check (retomada_aberta_min between 10 and 720);
alter table agente_config add column retomada_nao_aberta_min integer not null default 120 check (retomada_nao_aberta_min between 30 and 1200);
