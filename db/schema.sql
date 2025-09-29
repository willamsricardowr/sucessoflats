-- ========================================
-- Checklist: extensões, RLS e políticas mínimas
-- ========================================

create extension if not exists pgcrypto;

alter table flats          enable row level security;
alter table imagens        enable row level security;
alter table amenidades     enable row level security;
alter table flat_amenidade enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='flats' and policyname='public_read_flats') then
    create policy "public_read_flats" on flats for select using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='imagens' and policyname='public_read_imagens') then
    create policy "public_read_imagens" on imagens for select using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='amenidades' and policyname='public_read_amenidades') then
    create policy "public_read_amenidades" on amenidades for select using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename='flat_amenidade' and policyname='public_read_flat_amenidade') then
    create policy "public_read_flat_amenidade" on flat_amenidade for select using (true);
  end if;
end$$;


-- CMS mínimo para "Sucesso Flat's"
create extension if not exists pgcrypto;

-- Tabelas
create table if not exists flats (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  descricao text default '',
  preco_base numeric(10,2) not null default 118.00,
  ocupacao_maxima int not null default 2,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists imagens (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references flats(id) on delete cascade,
  url text not null,
  alt text default '',
  ordem int not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists amenidades (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,
  label text not null
);

create table if not exists flat_amenidade (
  flat_id uuid references flats(id) on delete cascade,
  amenidade_id uuid references amenidades(id) on delete cascade,
  primary key (flat_id, amenidade_id)
);

-- RLS (apenas leitura pública)
alter table flats enable row level security;
alter table imagens enable row level security;
alter table amenidades enable row level security;
alter table flat_amenidade enable row level security;

create policy "public_read_flats" on flats for select using (true);
create policy "public_read_imagens" on imagens for select using (true);
create policy "public_read_amenidades" on amenidades for select using (true);
create policy "public_read_flat_amenidade" on flat_amenidade for select using (true);

-- SEED: catálogo de amenidades (inclui 'máquina de lavar', mas NÃO será vinculada ainda)
insert into amenidades (chave, label) values
  ('ar-condicionado','Ar-condicionado'),
  ('wifi','Wi-Fi'),
  ('tv','TV'),
  ('cozinha','Cozinha equipada'),
  ('estacionamento','Estacionamento'),
  ('maquina-lavar','Máquina de lavar')
on conflict (chave) do nothing;

-- SEED: flats
insert into flats (slug, nome, descricao, preco_base, ocupacao_maxima, ordem) values
  ('flat-1','Flat 1 — Próx. Aeroporto','Flat compacto e funcional, ideal para conexões rápidas.', 118.00, 2, 1),
  ('flat-2','Flat 2 — Conforto & Praticidade','Perfeito para estadias de trabalho curtas.', 129.00, 2, 2),
  ('flat-3','Flat 3 — Família','Espaço extra e comodidades essenciais.', 149.00, 3, 3),
  ('flat-4','Flat 4 — Executivo','Padrão executivo com excelente custo-benefício.', 159.00, 2, 4)
on conflict (slug) do nothing;

-- Vincular APENAS amenidades básicas por enquanto (sem 'maquina-lavar')
with a as (select id, chave from amenidades),
     f as (select id, slug from flats)
insert into flat_amenidade (flat_id, amenidade_id)
select f.id, a.id
from f, a
where f.slug in ('flat-1','flat-2','flat-3','flat-4')
  and a.chave in ('ar-condicionado','wifi','tv')
on conflict do nothing;

-- Imagens placeholder
with f as (select id, slug from flats)
insert into imagens (flat_id, url, alt, ordem)
select f.id, 'https://placehold.co/800x600?text='||upper(f.slug), 'Imagem temporária', 1
from f
on conflict do nothing;
