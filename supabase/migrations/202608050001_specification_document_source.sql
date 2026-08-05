alter table public.specification_packages
  add column if not exists document_source jsonb;

comment on column public.specification_packages.document_source is
  'Optional durable DOCX/source snapshot: hash, fragments, anchors, and requirement mappings.';
