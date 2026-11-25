-- Sincronização do Traço: cada usuário só enxerga e grava os próprios dados.
create table if not exists public.traco_dados (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null,
  id text not null,
  dados jsonb,
  quando bigint not null default 0,
  apagado boolean not null default false,
  atualizado timestamptz not null default now(),
  primary key (user_id, tipo, id)
);
alter table public.traco_dados enable row level security;
drop policy if exists "dono le" on public.traco_dados;
drop policy if exists "dono grava" on public.traco_dados;
drop policy if exists "dono altera" on public.traco_dados;
drop policy if exists "dono apaga" on public.traco_dados;
create policy "dono le" on public.traco_dados for select to authenticated using (user_id = auth.uid());
create policy "dono grava" on public.traco_dados for insert to authenticated with check (user_id = auth.uid());
create policy "dono altera" on public.traco_dados for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono apaga" on public.traco_dados for delete to authenticated using (user_id = auth.uid());
create index if not exists traco_dados_atualizado on public.traco_dados (user_id, atualizado);
create or replace function public.traco_toca() returns trigger language plpgsql as $$ begin new.atualizado := now(); return new; end $$;
drop trigger if exists traco_toca on public.traco_dados;
create trigger traco_toca before insert or update on public.traco_dados for each row execute function public.traco_toca();
grant select, insert, update, delete on public.traco_dados to authenticated;
