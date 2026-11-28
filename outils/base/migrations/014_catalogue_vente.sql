-- 014 : le catalogue de vente du futur « Devis 0.2.0 » (identifiant interne devisbase), décisions de Jérôme du 28/11/2026.
-- PLAN SEULEMENT : pas encore appliquée à la base de la maison d'essai (geste fait plus tard, avec Jérôme).
--
-- Deux tables SOURCES (la personne est la source : « + » permis), rangées par espace comme toutes les autres :
--   familles_articles : les familles d'articles, sur DEUX niveaux (famille, sous-famille), reprises de js/modules/devis/familles.js.
--                       Le type d'article se pose seulement au premier niveau. Aucune ligne de départ ici (les sept familles et leurs
--                       sous-familles de départ viendront avec le service, cle_depart garde leurs identifiants « famille-1 », « famille-1-2 »).
--   articles_vente    : les articles du bordereau, avec les champs modifiables de CHAMPS_MODIFIABLES (js/modules/devis/articles.js),
--                       sans « composants » (les ouvrages viennent plus tard), plus url_source (adresse de la page produit).
-- Les unités de vente : une LISTE FERMÉE (règle 25) = liste_unites() de 009, plus semaine et mois. La colonne garde la forme normalisée
-- (normaliser_unite_vente : celle de normaliser_unite, puis « ensemble » -> « ens »). normaliser_unite n'est PAS modifiée : elle sert à des
-- colonnes calculées et stockées.
-- Droits : porte lit, ajoute et modifie ; robot_reflets (n8n) et indicateurs LISENT seulement. Posés ici ET dans la boucle de 007 (rejouée).
-- Recherche approchée : extension pg_trgm et un index trigramme sur libelle_normalise, si la base le permet (sinon la migration continue).

do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

-- ------------------------------------------------------------------ 1. Les listes (fonctions immuables, sans lecture de table)
-- Les types d'article : TYPES_ARTICLE de js/modules/devis/articles.js.
create or replace function public.liste_types_article() returns text[]
language sql immutable parallel safe as $$
  select array['fourniture', 'main_oeuvre', 'ouvrage', 'sous_traitance', 'materiel', 'divers', 'texte']::text[]
$$;

-- Les unités de vente : celles qu'on saisit pour un article de référence (009), plus la semaine et le mois (location, abonnement).
create or replace function public.liste_unites_vente() returns text[]
language sql immutable parallel safe as $$
  select public.liste_unites() || array['semaine', 'mois']::text[]
$$;

-- La forme rangée d'une unité de vente : celle de normaliser_unite (m² -> m2, L -> l, pièce -> u…), puis « ensemble » -> « ens ».
-- Vide -> null.
create or replace function public.normaliser_unite_vente(t text) returns text
language sql immutable parallel safe as $$
  select nullif(case when x in ('ensemble', 'ensembles') then 'ens' else x end, '')
  from (select public.normaliser_unite(t) as x) s
$$;

-- ------------------------------------------------------------------ 2. Les familles (deux niveaux)
create table if not exists public.familles_articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(btrim(nom)) between 1 and 60),
  nom_normalise text generated always as (public.normaliser_texte(nom)) stored,
  parent_id uuid,
  type text,
  cle_depart text check (cle_depart is null or cle_depart ~ '^famille-[0-9]{1,3}(-[0-9]{1,3})?$'),
  actif boolean not null default true
);
select public.poser_socle('familles_articles');
-- Clés étrangères APRÈS poser_socle (elles s'appuient sur l'unicité (espace_id, id) qu'il pose).
alter table public.familles_articles drop constraint if exists familles_articles_parent_fk;
alter table public.familles_articles add constraint familles_articles_parent_fk
  foreign key (espace_id, parent_id) references public.familles_articles (espace_id, id);
alter table public.familles_articles drop constraint if exists familles_articles_pas_son_parent;
alter table public.familles_articles add constraint familles_articles_pas_son_parent check (parent_id is distinct from id);
-- Le type se pose seulement au premier niveau (une sous-famille prend celui de sa famille).
alter table public.familles_articles drop constraint if exists familles_articles_type_premier_niveau;
alter table public.familles_articles add constraint familles_articles_type_premier_niveau check (parent_id is null or type is null);
select public.poser_contrainte_liste('familles_articles', 'familles_articles_type_liste', 'type = any (public.liste_types_article())');
-- Un nom par parent (sans accents ni casse ; actives ou non, comme familles.js), dans l'espace. Premier niveau : parent vide.
create unique index if not exists familles_articles_nom_unique on public.familles_articles (espace_id, parent_id, nom_normalise) nulls not distinct;
create unique index if not exists familles_articles_cle_depart_unique on public.familles_articles (espace_id, cle_depart) where cle_depart is not null;

-- Deux niveaux seulement : le parent est une famille de premier niveau, et une famille qui a des sous-familles ne devient pas une sous-famille.
-- (Un parent introuvable est refusé par la clé étrangère, pas ici.)
create or replace function public.familles_articles_deux_niveaux() returns trigger
language plpgsql as $$
declare v_grand_parent uuid; v_trouve boolean;
begin
  if new.parent_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then return new; end if;
  select f.parent_id, true into v_grand_parent, v_trouve from public.familles_articles f where f.id = new.parent_id;
  if v_trouve and v_grand_parent is not null then
    raise exception 'Une sous-famille ne peut pas avoir de sous-famille (deux niveaux seulement)' using errcode = 'P0001', detail = 'famille_deux_niveaux';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.familles_articles f where f.parent_id = new.id) then
    raise exception 'Cette famille a des sous-familles : elle reste au premier niveau' using errcode = 'P0001', detail = 'famille_deux_niveaux';
  end if;
  return new;
end $$;
drop trigger if exists ac_familles_articles_deux_niveaux on public.familles_articles;
create trigger ac_familles_articles_deux_niveaux before insert or update of parent_id on public.familles_articles
  for each row execute function public.familles_articles_deux_niveaux();

-- ------------------------------------------------------------------ 3. Les articles de vente
create table if not exists public.articles_vente (
  id uuid primary key default gen_random_uuid(),
  libelle text not null check (char_length(btrim(libelle)) between 1 and 200),
  libelle_normalise text generated always as (public.normaliser_texte(libelle)) stored,
  unite text,
  prix_achat numeric check (prix_achat is null or (prix_achat between 0 and 10000000 and prix_achat = round(prix_achat, 2))),
  code text check (code is null or char_length(btrim(code)) between 1 and 40),
  code_normalise text generated always as (nullif(public.normaliser_texte(code), '')) stored,
  taux_tva numeric check (taux_tva is null or taux_tva between 0 and 100),
  type text,
  prix_vente_force numeric check (prix_vente_force is null or (prix_vente_force between 0 and 10000000 and prix_vente_force = round(prix_vente_force, 2))),
  marge numeric check (marge is null or marge between 0 and 1000),
  reference text check (reference is null or char_length(reference) <= 120),
  marque text check (marque is null or char_length(marque) <= 120),
  famille_id uuid,
  url_source text check (url_source is null or (char_length(url_source) <= 2000 and url_source ~* '^https?://[^[:space:]]+$')),
  actif boolean not null default true
);
select public.poser_socle('articles_vente');
alter table public.articles_vente drop constraint if exists articles_vente_famille_fk;
alter table public.articles_vente add constraint articles_vente_famille_fk
  foreign key (espace_id, famille_id) references public.familles_articles (espace_id, id);
select public.poser_contrainte_liste('articles_vente', 'articles_vente_unite_liste', 'unite = any (public.liste_unites_vente())');
select public.poser_contrainte_liste('articles_vente', 'articles_vente_type_liste', 'type = any (public.liste_types_article())');
-- Une ligne de texte n'a pas d'unité ; tout autre article en a une. Un ouvrage n'a pas de prix d'achat propre (il se calcule).
alter table public.articles_vente drop constraint if exists articles_vente_unite_obligatoire;
alter table public.articles_vente add constraint articles_vente_unite_obligatoire check (unite is not null or type = 'texte');
alter table public.articles_vente drop constraint if exists articles_vente_ouvrage_sans_prix_achat;
alter table public.articles_vente add constraint articles_vente_ouvrage_sans_prix_achat check (type is distinct from 'ouvrage' or prix_achat is null);
-- Le code est facultatif ; parmi les articles ACTIFS d'un espace, deux articles n'ont pas le même code (sans accents ni casse).
create unique index if not exists articles_vente_code_unique on public.articles_vente (espace_id, code_normalise)
  where actif and code_normalise is not null;
create index if not exists articles_vente_famille_idx on public.articles_vente (espace_id, famille_id);

-- L'unité est rangée sous sa forme normalisée (ce que la requête envoie est mis au format, puis contrôlé par la liste fermée).
create or replace function public.articles_vente_unite() returns trigger
language plpgsql as $$
begin
  new.unite := public.normaliser_unite_vente(new.unite);
  return new;
end $$;
drop trigger if exists ac_articles_vente_unite on public.articles_vente;
create trigger ac_articles_vente_unite before insert or update of unite on public.articles_vente
  for each row execute function public.articles_vente_unite();

-- ------------------------------------------------------------------ 4. Recherche approchée (pg_trgm)
-- pg_trgm est une extension « de confiance » (PostgreSQL 13 et plus) permise par Cloud SQL. Si le compte qui joue la migration ne peut pas
-- la créer, la migration continue sans l'index (avis seulement).
do $$
begin
  create extension if not exists pg_trgm with schema public;
exception when others then
  raise notice 'Extension pg_trgm refusée (%) : pas d''index trigramme sur articles_vente.libelle_normalise.', sqlerrm;
end $$;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute format('create index if not exists articles_vente_libelle_trgm on public.articles_vente using gin (libelle_normalise %I.gin_trgm_ops)',
                   (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'));
  end if;
end $$;

-- ------------------------------------------------------------------ 5. Registre, listes, par où, identifiant figé, mode d'emploi
insert into public.registre_tables (nom_table, nature, verite_ou, robot, a_valider_par_jerome, explication) values
  ('familles_articles', 'source', null, null, false, 'Les familles d''articles du devis, sur deux niveaux (famille, sous-famille) ; le type d''article au premier niveau.'),
  ('articles_vente',    'source', null, null, false, 'Les articles du bordereau de vente (devis) : libellé, unité, prix d''achat, code, TVA, marge, famille.')
on conflict (nom_table) do update set nature = excluded.nature, verite_ou = excluded.verite_ou, robot = excluded.robot,
  a_valider_par_jerome = excluded.a_valider_par_jerome, explication = excluded.explication;

select public.poser_listes_fermees();
select public.poser_liste_tables_journal();
select public.poser_par_ou('familles_articles');
select public.poser_par_ou('articles_vente');
select public.poser_id_fige('familles_articles');
select public.poser_id_fige('articles_vente');

-- ------------------------------------------------------------------ 6. Droits (les mêmes que la branche ajoutée dans la boucle de 007)
revoke all on public.familles_articles, public.articles_vente from public, porte, robot_reflets, indicateurs;
grant select, insert, update on public.familles_articles, public.articles_vente to porte;
grant select on public.familles_articles, public.articles_vente to robot_reflets, indicateurs;

do $$
declare f text;
begin
  foreach f in array array['liste_types_article()', 'liste_unites_vente()', 'normaliser_unite_vente(text)',
                           'familles_articles_deux_niveaux()', 'articles_vente_unite()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to porte, robot_reflets, indicateurs', f);
  end loop;
end $$;

-- Le mode d'emploi : les deux tables se créent avec « + » (la personne est la source).
select public.remplir_mode_emploi();
update public.mode_emploi_objets set creer = true, phrase_sans_creer = null
 where objet in ('familles_articles', 'articles_vente') and not creer;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
