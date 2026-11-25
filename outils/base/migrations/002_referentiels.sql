-- 002 : les référentiels (fournisseurs, agences, chantiers, articles, rapprochements, favoris…), repris de supabase/migrations du dépôt BTP
-- (état final après 034), avec : espace_id partout (dans toutes les unicités), qui et quand, archivage au lieu de suppression,
-- clés étrangères « dans le même espace » (espace_id, x_id) -> (espace_id, id), identifiants uuid.
-- Anciens noms de colonnes gardés pour les écrans : created_at est une COLONNE CALCULÉE égale à cree_le (lecture seule).

-- Fonctions pures (identiques au dépôt BTP).
create or replace function public.luhn_valide(v text) returns boolean
language plpgsql immutable parallel safe as $$
declare l int; i int; n int; s int := 0;
begin
  if v is null or v !~ '^[0-9]+$' then return false; end if;
  l := length(v);
  for i in 0 .. l - 1 loop
    n := substr(v, l - i, 1)::int;
    if i % 2 = 1 then n := n * 2; if n > 9 then n := n - 9; end if; end if;
    s := s + n;
  end loop;
  return s % 10 = 0;
end $$;

create or replace function public.iban_valide(p_iban text) returns boolean
language plpgsql immutable parallel safe as $$
declare
  v text := upper(regexp_replace(coalesce(p_iban, ''), '[^A-Za-z0-9]', '', 'g'));
  v_long int; v_r text; v_reste int := 0; v_c text; v_i int;
begin
  if v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' then return false; end if;
  v_long := case left(v, 2)
    when 'AD' then 24 when 'AE' then 23 when 'AL' then 28 when 'AT' then 20 when 'AZ' then 28 when 'BA' then 20 when 'BE' then 16 when 'BG' then 22
    when 'BH' then 22 when 'BR' then 29 when 'BY' then 28 when 'CH' then 21 when 'CR' then 22 when 'CY' then 28 when 'CZ' then 24 when 'DE' then 22
    when 'DK' then 18 when 'DO' then 28 when 'EE' then 20 when 'EG' then 29 when 'ES' then 24 when 'FI' then 18 when 'FO' then 18 when 'FR' then 27
    when 'GB' then 22 when 'GE' then 22 when 'GI' then 23 when 'GL' then 18 when 'GR' then 27 when 'GT' then 28 when 'HR' then 21 when 'HU' then 28
    when 'IE' then 22 when 'IL' then 23 when 'IQ' then 23 when 'IS' then 26 when 'IT' then 27 when 'JO' then 30 when 'KW' then 30 when 'KZ' then 20
    when 'LB' then 28 when 'LC' then 32 when 'LI' then 21 when 'LT' then 20 when 'LU' then 20 when 'LV' then 21 when 'MC' then 27 when 'MD' then 24
    when 'ME' then 22 when 'MK' then 19 when 'MR' then 27 when 'MT' then 31 when 'MU' then 30 when 'NL' then 18 when 'NO' then 15 when 'PK' then 24
    when 'PL' then 28 when 'PS' then 29 when 'PT' then 25 when 'QA' then 29 when 'RO' then 24 when 'RS' then 22 when 'SA' then 24 when 'SC' then 31
    when 'SE' then 24 when 'SI' then 19 when 'SK' then 24 when 'SM' then 27 when 'ST' then 25 when 'SV' then 28 when 'TL' then 23 when 'TN' then 24
    when 'TR' then 26 when 'UA' then 29 when 'VA' then 22 when 'VG' then 24 when 'XK' then 20
    else null end;
  if v_long is null or length(v) <> v_long then return false; end if;
  v_r := substr(v, 5) || substr(v, 1, 4);
  for v_i in 1..length(v_r) loop
    v_c := substr(v_r, v_i, 1);
    if v_c ~ '[A-Z]' then v_reste := (v_reste * 100 + (ascii(v_c) - 55)) % 97;
    else v_reste := (v_reste * 10 + v_c::int) % 97; end if;
  end loop;
  return v_reste = 1;
end $$;

create or replace function public.normaliser_texte(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(
      translate(lower(translate(coalesce(t, ''), 'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ', 'AAAAAACEEEEIIIINOOOOOUUUUY')),
                'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
      'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.normaliser_reference(t text) returns text
language sql immutable parallel safe as $$
  select nullif(regexp_replace(upper(public.normaliser_texte(t)), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function public.normaliser_unite(t text) returns text
language sql immutable parallel safe as $$
  select case
    when x in ('u', 'un', 'unite', 'unites', 'pce', 'pces', 'piece', 'pieces', 'pc', 'pcs', 'ea') then 'u'
    when x in ('m', 'metre', 'metres') then 'm'
    when x in ('ml', 'metrelineaire', 'metreslineaires') then 'ml'
    when x in ('m2', 'metrecarre', 'metrescarres') then 'm2'
    when x in ('m3', 'metrecube', 'metrescubes') then 'm3'
    when x in ('kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes') then 'kg'
    when x in ('t', 'tonne', 'tonnes') then 't'
    when x in ('l', 'litre', 'litres') then 'l'
    when x in ('sac', 'sacs') then 'sac'
    else x
  end
  from (select replace(public.normaliser_texte(replace(replace(coalesce(t, ''), '²', '2'), '³', '3')), ' ', '') as x) s
$$;

create or replace function public.niveau_etiquette(p_etiquettes jsonb, p_niveau text) returns text
language sql immutable parallel safe
set search_path = public, pg_temp as $$
  select min(e.etiquette)
  from jsonb_array_elements_text(case when jsonb_typeof(p_etiquettes) = 'array' then p_etiquettes else '[]'::jsonb end) as e(etiquette)
  where case p_niveau
          when 'qui'    then e.etiquette ~ '^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$'
          when 'ou'     then e.etiquette in ('os', 'plateforme', 'outils-perso') or e.etiquette ~ '^app-[a-z0-9][a-z0-9-]*$'
          when 'module' then e.etiquette ~ '^module-[a-z0-9][a-z0-9-]*$'
          else false
        end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'statut_facture' and typnamespace = 'public'::regnamespace) then
    create type public.statut_facture as enum ('a_valider', 'acceptee', 'refusee');
  end if;
  if not exists (select 1 from pg_type where typname = 'statut_chantier' and typnamespace = 'public'::regnamespace) then
    create type public.statut_chantier as enum ('en_preparation', 'en_cours', 'termine', 'suspendu');
  end if;
end $$;

-- Fournisseurs (entreprises, une par SIREN dans un espace).
create table if not exists public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  siren text,
  nom text not null check (char_length(btrim(nom)) > 0),
  statut text not null default 'a_verifier' check (statut in ('a_verifier', 'verifie')),
  cree_par text not null default public.utilisateur_courant() check (char_length(btrim(cree_par)) > 0),
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored,
  constraint fournisseurs_siren_valide check (siren is null or (siren ~ '^[0-9]{9}$' and public.luhn_valide(siren)))
);
select public.poser_socle('fournisseurs');
create unique index if not exists fournisseurs_siren_unique on public.fournisseurs (espace_id, siren);

-- Agences (établissements) : jamais supprimées, désactivées ou fusionnées.
create table if not exists public.etablissements_fournisseur (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null,
  siret text check (siret is null or siret ~ '^[0-9]{14}$'),
  nom_agence text,
  ville text,
  nom_normalise text generated always as (public.normaliser_texte(nom_agence)) stored,
  ville_normalisee text generated always as (public.normaliser_texte(ville)) stored,
  actif boolean not null default true,
  fusionne_dans uuid,
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored,
  constraint etablissements_identifiable check (siret is not null or char_length(btrim(coalesce(nom_agence, ''))) > 0),
  constraint etablissements_pas_auto_fusion check (fusionne_dans is null or fusionne_dans <> id)
);
select public.poser_socle('etablissements_fournisseur');
alter table public.etablissements_fournisseur drop constraint if exists etablissements_fournisseur_fk;
alter table public.etablissements_fournisseur add constraint etablissements_fournisseur_fk
  foreign key (espace_id, fournisseur_id) references public.fournisseurs (espace_id, id);
alter table public.etablissements_fournisseur drop constraint if exists etablissements_fusion_fk;
alter table public.etablissements_fournisseur add constraint etablissements_fusion_fk
  foreign key (espace_id, fusionne_dans) references public.etablissements_fournisseur (espace_id, id);
create index if not exists etablissements_fournisseur_idx on public.etablissements_fournisseur (espace_id, fournisseur_id);
create unique index if not exists etablissements_siret_unique on public.etablissements_fournisseur (espace_id, siret);
create unique index if not exists etablissements_sans_siret_unique on public.etablissements_fournisseur (espace_id, fournisseur_id, nom_normalise, ville_normalisee) where siret is null;

create or replace function public.etablissements_garde() returns trigger
language plpgsql as $$
declare v_siren text; v_cible_fournisseur uuid; v_cible_fusion uuid;
begin
  if tg_op = 'UPDATE' and new.fournisseur_id <> old.fournisseur_id then
    raise exception 'Une agence ne change pas d''entreprise';
  end if;
  if new.siret is not null then
    select f.siren into v_siren from public.fournisseurs f where f.id = new.fournisseur_id;
    if v_siren is not null and left(new.siret, 9) <> v_siren then
      raise exception 'Le SIRET % ne commence pas par le SIREN % de son fournisseur', new.siret, v_siren;
    end if;
  end if;
  if new.fusionne_dans is not null then
    select e.fournisseur_id, e.fusionne_dans into v_cible_fournisseur, v_cible_fusion
      from public.etablissements_fournisseur e where e.id = new.fusionne_dans;
    if v_cible_fournisseur is distinct from new.fournisseur_id then
      raise exception 'Une agence ne peut être fusionnée que dans une agence de la même entreprise';
    end if;
    if v_cible_fusion is not null then
      raise exception 'L''agence cible est elle-même déjà fusionnée : pas de fusion en chaîne';
    end if;
    if exists (select 1 from public.etablissements_fournisseur e where e.fusionne_dans = new.id) then
      raise exception 'D''autres agences sont fusionnées dans celle-ci : pas de fusion en chaîne';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists etablissements_garde on public.etablissements_fournisseur;
create trigger etablissements_garde before insert or update on public.etablissements_fournisseur
  for each row execute function public.etablissements_garde();

create or replace function public.fournisseurs_garde() returns trigger
language plpgsql as $$
begin
  if old.siren is not null and new.siren is distinct from old.siren then
    raise exception 'Le SIREN d''un fournisseur ne change plus une fois connu';
  end if;
  if new.siren is not null and exists (
       select 1 from public.etablissements_fournisseur e
       where e.fournisseur_id = new.id and e.siret is not null and left(e.siret, 9) <> new.siren) then
    raise exception 'Le SIREN % ne correspond pas aux SIRET des agences de ce fournisseur', new.siren;
  end if;
  return new;
end $$;
drop trigger if exists fournisseurs_garde on public.fournisseurs;
create trigger fournisseurs_garde before update of siren on public.fournisseurs
  for each row execute function public.fournisseurs_garde();

-- Chantiers. Décision prise seul : le code automatique CH-0001 est compté PAR ESPACE (plus de séquence commune à tout l'immeuble).
-- « archive » (vrai / faux, réglé à l'écran) est gardé ; archive_le / archive_par suivent automatiquement.
create table if not exists public.chantiers (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(btrim(nom)) > 0),
  client text,
  adresse text,
  budget_ht numeric(12,2) not null default 0 check (budget_ht >= 0),
  statut public.statut_chantier not null default 'en_cours',
  date_debut date,
  date_fin_prevue date,
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored,
  code text not null check (char_length(btrim(code)) > 0),
  date_fin_reelle date,
  archive boolean not null default false
);
select public.poser_socle('chantiers');
create unique index if not exists chantiers_code_unique on public.chantiers (espace_id, upper(code));

create or replace function public.chantier_code_suivant() returns text
language plpgsql
set search_path = public, pg_temp as $$
declare v_n integer; v text;
begin
  perform pg_advisory_xact_lock(hashtextextended('chantiers:code:' || public.espace_obligatoire(), 0));
  select coalesce(max(substring(upper(c.code) from '^CH-([0-9]{1,9})$')::integer), 0) + 1 into v_n from public.chantiers c;
  loop
    v := 'CH-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.chantiers c where upper(c.code) = upper(v));
    v_n := v_n + 1;
  end loop;
  return v;
end $$;

create or replace function public.chantiers_avant_ecriture() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  if new.code is null then
    if tg_op = 'INSERT' then
      new.code := public.chantier_code_suivant();
    else
      raise exception 'Chantier : le code ne peut pas être vide' using errcode = 'P0001', detail = 'chantier_code_obligatoire';
    end if;
  end if;
  if new.statut = 'termine' and new.date_fin_reelle is null and (tg_op = 'INSERT' or old.statut is distinct from new.statut) then
    new.date_fin_reelle := (now() at time zone 'Europe/Paris')::date;
  end if;
  -- « archive » et archive_le vont ensemble (le déclencheur commun aa_socle_* passe avant et remplit l'heure et la personne).
  if tg_op = 'INSERT' and new.archive then
    raise exception 'Un chantier ne naît pas archivé' using errcode = 'P0001', detail = 'archivage_a_la_creation';
  end if;
  if tg_op = 'UPDATE' and new.archive is distinct from old.archive then
    if new.archive then
      new.archive_le := now();
      new.archive_par := public.utilisateur_obligatoire();
    else
      new.archive_le := null;
      new.archive_par := null;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Archivage par archive_le (comme toutes les tables) : « archive » suit.
    new.archive := new.archive_le is not null;
  end if;
  return new;
end $$;
drop trigger if exists chantiers_avant_ecriture on public.chantiers;
create trigger chantiers_avant_ecriture before insert or update on public.chantiers
  for each row execute function public.chantiers_avant_ecriture();

-- Articles des fournisseurs (catalogue fabriqué par la base à partir des lignes de facture acceptées).
create table if not exists public.articles_fournisseur (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null,
  reference text,
  reference_normalisee text generated always as (public.normaliser_reference(reference)) stored,
  designation text not null check (char_length(btrim(designation)) > 0),
  designation_normalisee text generated always as (public.normaliser_texte(designation)) stored,
  unite text,
  unite_normalisee text generated always as (public.normaliser_unite(unite)) stored,
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored
);
select public.poser_socle('articles_fournisseur');
alter table public.articles_fournisseur drop constraint if exists articles_fournisseur_fournisseur_fk;
alter table public.articles_fournisseur add constraint articles_fournisseur_fournisseur_fk
  foreign key (espace_id, fournisseur_id) references public.fournisseurs (espace_id, id);
create unique index if not exists articles_fournisseur_avec_reference_unique on public.articles_fournisseur (espace_id, fournisseur_id, reference_normalisee) where reference_normalisee is not null;
create unique index if not exists articles_fournisseur_sans_reference_unique on public.articles_fournisseur (espace_id, fournisseur_id, designation_normalisee, unite_normalisee) where reference_normalisee is null;

create table if not exists public.articles_reference (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(btrim(nom)) > 0),
  nom_normalise text generated always as (public.normaliser_texte(nom)) stored,
  unite_reference text not null check (char_length(btrim(unite_reference)) > 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored
);
select public.poser_socle('articles_reference');
create unique index if not exists articles_reference_nom_unique on public.articles_reference (espace_id, nom_normalise);

-- Rapprochements (article du fournisseur -> article de référence). Une ligne « dissociée » ou « refusée » n'est plus effacée : elle est archivée.
-- La table garde tout l'historique (« _tous ») ; la vue rapprochements_articles (004) ne montre que les lignes en cours, avec les colonnes d'avant.
create table if not exists public.rapprochements_articles_tous (
  id uuid primary key default gen_random_uuid(),
  article_fournisseur_id uuid not null,
  article_reference_id uuid not null,
  coefficient numeric not null check (coefficient > 0),
  valide_par text,
  valide_le timestamptz,
  suggere_par_ia boolean not null default false,
  cree_le timestamptz not null default now(),
  created_at timestamptz generated always as (cree_le) stored,
  constraint rapprochements_valide_coherent check ((valide_le is null) = (valide_par is null)),
  constraint rapprochements_valide_par_non_vide check (valide_par is null or char_length(btrim(valide_par)) > 0)
);
select public.poser_socle('rapprochements_articles_tous');
alter table public.rapprochements_articles_tous drop constraint if exists rapprochements_article_fk;
alter table public.rapprochements_articles_tous add constraint rapprochements_article_fk
  foreign key (espace_id, article_fournisseur_id) references public.articles_fournisseur (espace_id, id);
alter table public.rapprochements_articles_tous drop constraint if exists rapprochements_reference_fk;
alter table public.rapprochements_articles_tous add constraint rapprochements_reference_fk
  foreign key (espace_id, article_reference_id) references public.articles_reference (espace_id, id);
create unique index if not exists rapprochements_un_en_cours on public.rapprochements_articles_tous (espace_id, article_fournisseur_id) where archive_le is null;
create index if not exists rapprochements_reference_idx on public.rapprochements_articles_tous (espace_id, article_reference_id) where archive_le is null;

create table if not exists public.suggestions_refusees_tous (
  id uuid primary key default gen_random_uuid(),
  article_fournisseur_id uuid not null,
  refuse_par text not null check (char_length(btrim(refuse_par)) > 0),
  refuse_le timestamptz not null default now(),
  article_reference_id uuid,
  coefficient numeric check (coefficient is null or coefficient > 0)
);
select public.poser_socle('suggestions_refusees_tous');
alter table public.suggestions_refusees_tous drop constraint if exists suggestions_refusees_article_fk;
alter table public.suggestions_refusees_tous add constraint suggestions_refusees_article_fk
  foreign key (espace_id, article_fournisseur_id) references public.articles_fournisseur (espace_id, id);
alter table public.suggestions_refusees_tous drop constraint if exists suggestions_refusees_reference_fk;
alter table public.suggestions_refusees_tous add constraint suggestions_refusees_reference_fk
  foreign key (espace_id, article_reference_id) references public.articles_reference (espace_id, id);
create unique index if not exists suggestions_refusees_un_en_cours on public.suggestions_refusees_tous (espace_id, article_fournisseur_id) where archive_le is null;
create index if not exists suggestions_refusees_reference_idx on public.suggestions_refusees_tous (espace_id, article_reference_id) where archive_le is null;

create table if not exists public.suggestions_tentees (
  id uuid primary key default gen_random_uuid(),
  article_fournisseur_id uuid not null,
  tentatives integer not null default 1 check (tentatives >= 1),
  derniere_le timestamptz not null default clock_timestamp()
);
select public.poser_socle('suggestions_tentees');
alter table public.suggestions_tentees drop constraint if exists suggestions_tentees_article_fk;
alter table public.suggestions_tentees add constraint suggestions_tentees_article_fk
  foreign key (espace_id, article_fournisseur_id) references public.articles_fournisseur (espace_id, id);
create unique index if not exists suggestions_tentees_unique on public.suggestions_tentees (espace_id, article_fournisseur_id);

-- Favoris. utilisateur devient un TEXTE (l'identité donnée par la porte dans app.utilisateur, par ex. l'adresse du compte Google),
-- et non plus l'identifiant uuid de Supabase. Retirer un favori l'archive.
create table if not exists public.favoris (
  id uuid primary key default gen_random_uuid(),
  utilisateur text not null check (char_length(btrim(utilisateur)) > 0),
  genre text not null check (genre in ('chantier', 'agence', 'entreprise')),
  cle text not null check (char_length(btrim(cle)) between 1 and 64)
);
select public.poser_socle('favoris');
create unique index if not exists favoris_unique on public.favoris (espace_id, utilisateur, genre, cle) where archive_le is null;

create table if not exists public.favoris_os (
  id uuid primary key default gen_random_uuid(),
  utilisateur text not null check (char_length(btrim(utilisateur)) > 0),
  genre text not null check (genre in ('chantier', 'agence', 'entreprise')),
  cle text not null check (char_length(btrim(cle)) between 1 and 64)
);
select public.poser_socle('favoris_os');
create unique index if not exists favoris_os_unique on public.favoris_os (espace_id, utilisateur, genre, cle) where archive_le is null;

-- Tickets à usage unique pour n8n (034). À VALIDER PAR JÉRÔME : sans doute inutiles quand la porte existera (elle vérifie elle-même le compte Google).
-- Gardés pour ne rien supprimer en silence ; un ticket consommé ou expiré est archivé, plus effacé.
create table if not exists public.tickets_n8n (
  id uuid primary key default gen_random_uuid(),
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  usage text not null check (usage in ('validation', 'actions', 'suggestions', 'ajoutFacture')),
  courriel text,
  utilisateur text not null check (char_length(btrim(utilisateur)) > 0),
  expire_le timestamptz not null
);
select public.poser_socle('tickets_n8n');
create unique index if not exists tickets_n8n_empreinte_unique on public.tickets_n8n (espace_id, empreinte);
create index if not exists tickets_n8n_expire_idx on public.tickets_n8n (espace_id, expire_le) where archive_le is null;

create table if not exists public.tickets_n8n_demandes (
  id uuid primary key default gen_random_uuid(),
  utilisateur text not null check (char_length(btrim(utilisateur)) > 0),
  demande_le timestamptz not null default now()
);
select public.poser_socle('tickets_n8n_demandes');
create index if not exists tickets_n8n_demandes_idx on public.tickets_n8n_demandes (espace_id, utilisateur, demande_le);
