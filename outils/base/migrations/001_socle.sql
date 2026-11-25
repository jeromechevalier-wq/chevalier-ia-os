-- 001 : le socle commun de la future base (Google Cloud SQL for PostgreSQL 17, sans Supabase).
-- PLAN SEULEMENT : aucun fichier de ce dossier n'est appliqué à une vraie base. outils/base/tester.js le joue sur une base JETABLE.
--
-- Ce que pose ce fichier :
--   1. les trois rôles applicatifs : porte (la future porte des Cloud Functions), robot_reflets (les robots qui recopient), indicateurs (Pilotage) ;
--      aucun n'est superutilisateur, aucun n'a BYPASSRLS : la sécurité par ligne s'applique à tous, eux compris ;
--   2. l'espace courant et l'utilisateur courant, lus dans les réglages de la requête app.espace_id et app.utilisateur
--      (la porte les pose à chaque requête avec set_config(..., true)) ; absents ou vides = rien n'est visible, rien ne s'écrit ;
--   3. les déclencheurs communs : « qui et quand », « jamais de vraie suppression », « journal avant / après » ;
--   4. le journal des modifications (ajout seul) et le registre des tables (source ou reflet) ;
--   5. poser_socle(table) : la procédure qui pose sur une table les colonnes et les règles communes, pour que TOUTES les tables soient pareilles.

-- 1. Rôles (globaux à l'instance : créés seulement s'ils manquent). NOLOGIN : les vrais comptes de connexion recevront ces rôles plus tard.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'porte') then
    create role porte nologin nobypassrls nosuperuser nocreatedb nocreaterole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'robot_reflets') then
    create role robot_reflets nologin nobypassrls nosuperuser nocreatedb nocreaterole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'indicateurs') then
    create role indicateurs nologin nobypassrls nosuperuser nocreatedb nocreaterole;
  end if;
end $$;

-- Personne n'a de droit par défaut sur le schéma public : chaque droit est donné table par table dans 007.
revoke all on schema public from public;
grant usage on schema public to porte, robot_reflets, indicateurs;

-- 2. Espace et utilisateur courants.
create or replace function public.espace_courant() returns text
language sql stable parallel safe as
$$ select nullif(btrim(coalesce(current_setting('app.espace_id', true), '')), '') $$;

create or replace function public.utilisateur_courant() returns text
language sql stable parallel safe as
$$ select nullif(btrim(coalesce(current_setting('app.utilisateur', true), '')), '') $$;

create or replace function public.espace_obligatoire() returns text
language plpgsql stable as $$
declare v text := public.espace_courant();
begin
  if v is null then
    raise exception 'Espace inconnu : la requête doit poser app.espace_id' using errcode = 'P0001', detail = 'espace_manquant';
  end if;
  if v !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'Espace invalide (lettres minuscules, chiffres, tiret) : %', v using errcode = 'P0001', detail = 'espace_invalide';
  end if;
  return v;
end $$;

create or replace function public.utilisateur_obligatoire() returns text
language plpgsql stable as $$
declare v text := public.utilisateur_courant();
begin
  if v is null then
    raise exception 'Utilisateur inconnu : la requête doit poser app.utilisateur' using errcode = 'P0001', detail = 'utilisateur_manquant';
  end if;
  if char_length(v) > 320 then
    raise exception 'Utilisateur trop long' using errcode = 'P0001', detail = 'utilisateur_invalide';
  end if;
  return v;
end $$;

-- 3. Déclencheurs communs.
-- « Qui et quand » : espace_id, cree_le, cree_par, modifie_le, modifie_par, archive_le et archive_par sont TOUJOURS remplis par la base,
-- jamais par la requête (ce que la requête envoie dans ces colonnes est écrasé, archive_par compris : c'est toujours app.utilisateur).
create or replace function public.socle_qui_et_quand() returns trigger
language plpgsql as $$
declare
  v_qui text := public.utilisateur_obligatoire();
  v_avec_espace boolean := tg_argv[0] is distinct from 'sans_espace';
begin
  if tg_op = 'INSERT' then
    if v_avec_espace then
      new.espace_id := public.espace_obligatoire();
    end if;
    new.cree_le := now();
    new.cree_par := v_qui;
    if new.archive_le is not null or new.archive_par is not null then
      raise exception 'Une ligne ne naît pas archivée (%)', tg_table_name using errcode = 'P0001', detail = 'archivage_a_la_creation';
    end if;
  else
    if v_avec_espace then
      if new.espace_id is distinct from old.espace_id then
        raise exception 'Une ligne ne change jamais d''espace (%)', tg_table_name using errcode = 'P0001', detail = 'espace_fige';
      end if;
    end if;
    new.cree_le := old.cree_le;
    new.cree_par := old.cree_par;
    -- Archivage : l'heure et la personne viennent de la base. Désarchiver remet les deux à vide.
    if old.archive_le is null and new.archive_le is not null then
      new.archive_le := now();
      new.archive_par := v_qui;   -- toujours la personne de la requête (app.utilisateur), jamais un nom envoyé
    elsif old.archive_le is not null and new.archive_le is null then
      new.archive_par := null;
    else
      new.archive_le := old.archive_le;
      new.archive_par := old.archive_par;
    end if;
  end if;
  new.modifie_le := now();
  new.modifie_par := v_qui;
  return new;
end $$;

-- Jamais de vraie suppression (règle 6) : DELETE et TRUNCATE refusés pour TOUT le monde, propriétaire compris. On archive.
create or replace function public.socle_pas_de_suppression() returns trigger
language plpgsql as $$
begin
  raise exception '% : une ligne ne se supprime jamais, on l''archive (archive_le) (% refusé)', tg_table_name, tg_op
    using errcode = 'P0001', detail = 'suppression_interdite';
end $$;

-- Ajout seul : une ligne ne se modifie pas (journal, décisions, corrections, scans et autres reflets en ajout seul).
create or replace function public.ajout_seul() returns trigger
language plpgsql as $$
begin
  raise exception '% est en ajout seul : une ligne ne se modifie ni ne se supprime', tg_table_name using errcode = 'P0001', detail = 'ajout_seul';
end $$;

-- 4a. Journal des modifications : avant / après de chaque écriture, en ajout seul, jamais effacé (règle 7).
-- Décision prise seul : l'identifiant reste un compteur (bigint) pour garder l'ordre exact des écritures (comme 009 du dépôt BTP) ;
-- toutes les autres tables ont un identifiant uuid.
create table if not exists public.journal_modifications (
  id bigint generated always as identity primary key,
  table_nom text not null check (char_length(btrim(table_nom)) between 1 and 80),
  enregistrement_id uuid,
  action text not null check (char_length(btrim(action)) between 1 and 120),
  qui text not null check (char_length(btrim(qui)) > 0),
  qui_id uuid,
  quand timestamptz not null default now(),
  avant jsonb,
  apres jsonb
);
create index if not exists journal_modifications_cible_idx on public.journal_modifications (table_nom, enregistrement_id, quand);

-- Journal métier (actions nommées : « validation », « fusion »…), gardé tel quel : les fonctions métier l'appellent avec la personne (p_qui).
create or replace function public.journaliser_modification(p_table text, p_id uuid, p_action text, p_qui text, p_qui_id uuid, p_avant jsonb, p_apres jsonb)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Journal : l''identité de la personne (qui) est obligatoire';
  end if;
  insert into public.journal_modifications (table_nom, enregistrement_id, action, qui, qui_id, avant, apres)
  values (p_table, p_id, p_action, btrim(p_qui), p_qui_id, p_avant, p_apres);
end $$;

-- Journal automatique de CHAQUE écriture (règle 7, généralisation de journal_modifications) : une ligne par insertion ou modification.
create or replace function public.socle_journal() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid; v_avant jsonb; v_apres jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then
    v_avant := to_jsonb(old);
    if (v_avant - 'modifie_le' - 'modifie_par') = (v_apres - 'modifie_le' - 'modifie_par') then return null; end if;   -- rien n'a changé : pas de ligne
  end if;
  begin
    v_id := (v_apres ->> 'id')::uuid;
  exception when others then
    v_id := null;
  end;
  insert into public.journal_modifications (table_nom, enregistrement_id, action, qui, avant, apres)
  values (tg_table_name, v_id, lower(tg_op), public.utilisateur_obligatoire(), v_avant, v_apres);
  return null;
end $$;

-- 4b. Registre des tables (règle 2) : chaque table du schéma public y est inscrite, avec sa nature : source (la vérité vit ici)
-- ou reflet (copie d'une vérité qui vit ailleurs, recopiée par un robot). Jamais mixte.
-- Exception écrite (décision prise seul, à valider par Jérôme) : le registre décrit la STRUCTURE, commune à tous les espaces :
-- il n'a pas d'espace_id et la porte ne peut que le lire.
create table if not exists public.registre_tables (
  id uuid primary key default gen_random_uuid(),
  nom_table text not null unique check (nom_table ~ '^[a-z][a-z0-9_]{1,62}$'),
  nature text not null check (nature in ('source', 'reflet')),
  verite_ou text,
  robot text,
  a_valider_par_jerome boolean not null default false,
  explication text not null check (char_length(btrim(explication)) >= 10),
  constraint registre_reflet_complet check (
    (nature = 'source' and verite_ou is null and robot is null)
    or (nature = 'reflet' and char_length(btrim(coalesce(verite_ou, ''))) > 0 and char_length(btrim(coalesce(robot, ''))) > 0))
);

-- 5. poser_socle : pose sur une table les colonnes communes (si elles manquent), l'unicité (espace_id, id) pour les clés étrangères
-- « dans le même espace », les déclencheurs communs et la sécurité par ligne PAR ESPACE (forcée, même pour le propriétaire).
create or replace function public.poser_socle(p_table text, p_avec_espace boolean default true, p_journal boolean default true)
returns void language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  if p_avec_espace then
    execute format('alter table %s add column if not exists espace_id text not null default public.espace_courant()', t);
    execute format('alter table %s drop constraint if exists %I', t, p_table || '_espace_format');
    execute format('alter table %s add constraint %I check (espace_id ~ %L)', t, p_table || '_espace_format', '^[a-z0-9][a-z0-9-]{1,39}$');
  end if;
  execute format('alter table %s add column if not exists cree_le timestamptz not null default now()', t);
  execute format('alter table %s add column if not exists cree_par text not null default public.utilisateur_courant()', t);
  execute format('alter table %s add column if not exists modifie_le timestamptz not null default now()', t);
  execute format('alter table %s add column if not exists modifie_par text not null default public.utilisateur_courant()', t);
  execute format('alter table %s add column if not exists archive_le timestamptz', t);
  execute format('alter table %s add column if not exists archive_par text', t);
  execute format('alter table %s drop constraint if exists %I', t, p_table || '_archive_coherent');
  execute format('alter table %s add constraint %I check ((archive_le is null) = (archive_par is null))', t, p_table || '_archive_coherent');

  execute format('drop trigger if exists aa_socle_qui_et_quand on %s', t);
  execute format('create trigger aa_socle_qui_et_quand before insert or update on %s for each row execute function public.socle_qui_et_quand(%L)',
                 t, case when p_avec_espace then 'avec_espace' else 'sans_espace' end);
  execute format('drop trigger if exists aa_socle_pas_de_suppression on %s', t);
  execute format('create trigger aa_socle_pas_de_suppression before delete on %s for each statement execute function public.socle_pas_de_suppression()', t);
  execute format('drop trigger if exists aa_socle_pas_de_truncate on %s', t);
  execute format('create trigger aa_socle_pas_de_truncate before truncate on %s for each statement execute function public.socle_pas_de_suppression()', t);
  if p_journal then
    execute format('drop trigger if exists zz_socle_journal on %s', t);
    execute format('create trigger zz_socle_journal after insert or update on %s for each row execute function public.socle_journal()', t);
  end if;

  if p_avec_espace then
    if exists (select 1 from pg_attribute where attrelid = t and attname = 'id' and not attisdropped) then
      if not exists (select 1 from pg_constraint where conrelid = t and conname = p_table || '_espace_id_unique') then
        execute format('alter table %s add constraint %I unique (espace_id, id)', t, p_table || '_espace_id_unique');
      end if;
    end if;
    execute format('alter table %s enable row level security', t);
    execute format('alter table %s force row level security', t);
    execute format('drop policy if exists espace_courant on %s', t);
    -- Une seule règle pour tout (lecture, ajout, modification) : la ligne appartient à l'espace de la requête. Sans espace : comparaison à NULL = rien.
    execute format('create policy espace_courant on %s for all using (espace_id = public.espace_courant()) with check (espace_id = public.espace_courant())', t);
  end if;
end $$;

-- Le journal : socle sans journal automatique (il ne se journalise pas lui-même), puis ajout seul.
select public.poser_socle('journal_modifications', true, false);
drop trigger if exists journal_modifications_ajout_seul on public.journal_modifications;
create trigger journal_modifications_ajout_seul before update on public.journal_modifications
  for each row execute function public.ajout_seul();
-- Le journal ne prend jamais l'heure ni la personne de la requête.
create or replace function public.journal_modifications_avant() returns trigger
language plpgsql as $$
begin
  new.quand := now();
  return new;
end $$;
drop trigger if exists ab_journal_quand on public.journal_modifications;
create trigger ab_journal_quand before insert on public.journal_modifications for each row execute function public.journal_modifications_avant();

-- Le registre : sans espace (structure commune), avec qui et quand, jamais supprimé. Pas de journal automatique : le journal est rangé
-- par espace, et le registre change seulement par une migration (son histoire est celle du dépôt Git).
select public.poser_socle('registre_tables', false, false);
