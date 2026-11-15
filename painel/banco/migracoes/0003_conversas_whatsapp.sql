-- Qual conversa do WhatsApp atende cada pedido do CRM (para reagir aos avisos: proposta aprovada → mandar o link).
create table if not exists conversas_whatsapp (
  negocio_id        text primary key,
  conversa          text not null,
  telefone          text not null,
  ultima_do_cliente text,
  atualizado_em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
