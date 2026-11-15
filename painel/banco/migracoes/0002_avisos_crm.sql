-- Avisos (webhooks) recebidos do CRM. O id é o do CRM: o mesmo aviso nunca entra duas vezes.
-- O motor guarda ao receber; o processamento (proposta aprovada → enviar link, LGPD, devolução) é feito depois.
create table if not exists avisos_crm (
  id            integer primary key,
  tipo          text not null check (length(tipo) <= 60),
  negocio_id    text,
  proposta_id   text,
  contato_id    text,
  dados         text not null default '{}' check (json_valid(dados)),
  criado_em     text,
  recebido_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processado_em text
);
create index if not exists avisos_crm_pendentes_idx on avisos_crm (processado_em, id);
