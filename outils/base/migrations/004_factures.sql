-- 004 : les factures, coupées en tables « source » et « reflet » (règle 2), recollées par la vue factures pour la lecture.
--
--   factures_identite    SOURCE  l'identité de la facture : un fournisseur (SIREN) + un numéro, unique dans un espace ; son agence, son chantier, son archivage.
--   factures_scans       REFLET  chaque document reçu (scan, PDF), avec ce que le robot y a lu ; ajout seul, jamais écrasé.
--   factures_decisions   SOURCE  acceptée, refusée, rouverte : qui, quand, pourquoi ; ajout seul (remplace la table journal_decisions, gardée en vue).
--   factures_corrections SOURCE  un champ mal lu corrigé par une personne (montant, numéro…), sans toucher au reflet ; ajout seul.
--   lignes_facture_lues     REFLET  les lignes lues par le robot sur la facture ; remplacer des lignes = archiver les anciennes, jamais les effacer.
--   lignes_facture_articles SOURCE  le lien d'une ligne vers un article du catalogue (fait par la base à l'acceptation).
--
-- Vues de lecture qui gardent EXACTEMENT les colonnes d'aujourd'hui (les ~67 vues v_td_* et les écrans continuent de marcher) :
--   factures, journal_decisions, lignes_facture, rapprochements_articles, suggestions_refusees.
-- Les robots d'aujourd'hui écrivent encore « insert into factures » et « update factures set statut = … » : la vue factures a des déclencheurs
-- « à la place de » (INSTEAD OF) qui rangent chaque écriture dans la bonne table, avec les mêmes contrôles que le dépôt BTP (008 à 013).
-- Les garde-fous essentiels sont AUSSI posés sur les tables elles-mêmes (la porte peut les écrire en direct) : identité figée dès que la
-- facture est décidée, archivage seulement d'une facture décidée, décision « accepter » seulement avec une agence active et un décideur.
--
-- Un même document peut arriver plusieurs fois (re-scanné avec des notes à la main pour relier les bons de livraison) :
-- un nouveau scan au même SIREN + numéro s'AJOUTE à la même facture, il ne crée pas de doublon. Un désaccord entre deux scans est signalé
-- (vue v_factures_desaccords) : le robot ne tranche pas.

-- Clés d'une facture calculées par la base (reprise de factures_calculer_cles, état de 008 du dépôt BTP).
create or replace function public.cles_facture(p_extraction jsonb, p_numero text, out siren text, out numero_normalise text, out iban text)
language plpgsql immutable as $$
declare v_siret text; v_siren text; v_candidat text; v_brut text;
begin
  v_siret := regexp_replace(coalesce(p_extraction -> 'fournisseur' ->> 'siret', ''), '\D', '', 'g');
  v_siren := regexp_replace(coalesce(p_extraction -> 'fournisseur' ->> 'siren', ''), '\D', '', 'g');
  v_candidat := case when length(v_siret) = 14 then left(v_siret, 9) when length(v_siren) = 9 then v_siren else null end;
  siren := case when v_candidat is not null and public.luhn_valide(v_candidat) then v_candidat else null end;
  v_brut := regexp_replace(coalesce(nullif(trim(p_numero), ''), p_extraction ->> 'numero', ''), '[^A-Za-z0-9]+', '-', 'g');
  v_brut := upper(btrim(v_brut, '-'));
  if v_brut ~ '^[0-9]+$' then v_brut := coalesce(nullif(ltrim(v_brut, '0'), ''), '0'); end if;
  numero_normalise := nullif(v_brut, '');
  iban := nullif(upper(regexp_replace(coalesce(p_extraction ->> 'iban', ''), '[^A-Za-z0-9]', '', 'g')), '');
end $$;

-- ===================================================================================================================
-- Tables
-- ===================================================================================================================
create table if not exists public.factures_identite (
  id uuid primary key default gen_random_uuid(),
  fournisseur_siren text check (fournisseur_siren is null or fournisseur_siren ~ '^[0-9]{9}$'),
  numero_normalise text check (numero_normalise is null or char_length(numero_normalise) between 1 and 120),
  fournisseur_id uuid,
  etablissement_id uuid,
  chantier_id uuid
);
select public.poser_socle('factures_identite');
alter table public.factures_identite drop constraint if exists factures_identite_fournisseur_fk;
alter table public.factures_identite add constraint factures_identite_fournisseur_fk foreign key (espace_id, fournisseur_id) references public.fournisseurs (espace_id, id);
alter table public.factures_identite drop constraint if exists factures_identite_etablissement_fk;
alter table public.factures_identite add constraint factures_identite_etablissement_fk foreign key (espace_id, etablissement_id) references public.etablissements_fournisseur (espace_id, id);
alter table public.factures_identite drop constraint if exists factures_identite_chantier_fk;
alter table public.factures_identite add constraint factures_identite_chantier_fk foreign key (espace_id, chantier_id) references public.chantiers (espace_id, id);
-- Une facture = un fournisseur + un numéro DANS UN ESPACE (pas dans tout l'immeuble). Décision prise seul : la clé est le SIREN lu
-- (fournisseur_siren), comme la règle d'aujourd'hui (006, 008 : « fournisseur_siren, numero_normalise »), car le robot lit un SIREN, pas notre fiche.
create unique index if not exists factures_identite_sans_doublon on public.factures_identite (espace_id, fournisseur_siren, numero_normalise)
  where fournisseur_siren is not null and numero_normalise is not null;
-- C3 (relecture Fable) : la même règle sur la fiche fournisseur, dès qu'elle est connue (acceptation) : un fournisseur + un numéro = une facture.
create unique index if not exists factures_identite_fournisseur_numero on public.factures_identite (espace_id, fournisseur_id, numero_normalise)
  where fournisseur_id is not null and numero_normalise is not null;
create index if not exists factures_identite_chantier_idx on public.factures_identite (espace_id, chantier_id);
create index if not exists factures_identite_fournisseur_idx on public.factures_identite (espace_id, fournisseur_id) where fournisseur_id is not null;
create index if not exists factures_identite_etablissement_idx on public.factures_identite (espace_id, etablissement_id) where etablissement_id is not null;
create index if not exists factures_identite_siren_idx on public.factures_identite (espace_id, fournisseur_siren) where fournisseur_siren is not null;

-- Chaque scan reçu. Décision prise seul (règle 8) : l'unicité (espace_id, source_nom, source_ref) existe aussi ici, mais source_ref désigne
-- LE COURRIEL + LA PIÈCE JOINTE (ou le dépôt à la main), pas la facture : deux scans de la même facture sont donc deux lignes,
-- et le même courriel traité deux fois n'en fait qu'une.
create table if not exists public.factures_scans (
  id uuid primary key default gen_random_uuid(),
  rang bigint generated always as identity,
  facture_id uuid,
  courriel_id uuid,
  email_message_id text check (email_message_id is null or char_length(email_message_id) <= 500),
  email_expediteur text,
  piece_jointe text check (piece_jointe is null or char_length(piece_jointe) <= 300),
  fichier_path text,
  fournisseur text,
  numero text,
  date_facture date,
  montant_ht numeric(12,2) check (montant_ht >= 0),
  montant_tva numeric(12,2) check (montant_tva >= 0),
  montant_ttc numeric(12,2) check (montant_ttc >= 0),
  type_document text not null default 'facture' check (type_document in ('facture', 'avoir')),
  extraction jsonb,
  extraction_erreur text,
  fournisseur_siren text,
  numero_normalise text,
  iban_normalise text
);
select public.poser_socle('factures_scans');
select public.poser_reflet('factures_scans');
alter table public.factures_scans drop constraint if exists factures_scans_facture_fk;
alter table public.factures_scans add constraint factures_scans_facture_fk foreign key (espace_id, facture_id) references public.factures_identite (espace_id, id);
alter table public.factures_scans drop constraint if exists factures_scans_courriel_fk;
alter table public.factures_scans add constraint factures_scans_courriel_fk foreign key (espace_id, courriel_id) references public.courriels_recus (espace_id, id);
create unique index if not exists factures_scans_source_unique on public.factures_scans (espace_id, source_nom, source_ref);
create index if not exists factures_scans_facture_idx on public.factures_scans (espace_id, facture_id, rang);
create index if not exists factures_scans_iban_idx on public.factures_scans (espace_id, iban_normalise) where iban_normalise is not null;

create table if not exists public.factures_decisions (
  id uuid primary key default gen_random_uuid(),
  rang bigint generated always as identity,
  facture_id uuid not null,
  decision text not null check (decision in ('accepter', 'refuser', 'rouverte')),
  decide_par text not null,
  decide_par_id uuid,
  decide_le timestamptz not null default now(),
  motif text,
  motif_refus text,
  motif_acceptation text,
  alertes_a_la_decision jsonb,
  acceptee_malgre_alerte boolean not null default false,
  ancien_statut text check (ancien_statut is null or ancien_statut in ('acceptee', 'refusee')),
  constraint decision_avec_decideur check (char_length(btrim(decide_par)) > 0),
  constraint refus_avec_motif check (decision <> 'refuser' or coalesce(btrim(motif_refus), '') <> ''),
  constraint rouverture_motivee check (decision <> 'rouverte' or char_length(btrim(coalesce(motif, ''))) between 3 and 500),
  constraint acceptation_malgre_alerte_motivee check (not acceptee_malgre_alerte or (decision = 'accepter'
    and char_length(btrim(coalesce(motif_acceptation, ''))) >= 3
    and jsonb_typeof(alertes_a_la_decision) = 'array' and jsonb_array_length(alertes_a_la_decision) > 0))
);
select public.poser_socle('factures_decisions');
alter table public.factures_decisions drop constraint if exists factures_decisions_facture_fk;
alter table public.factures_decisions add constraint factures_decisions_facture_fk foreign key (espace_id, facture_id) references public.factures_identite (espace_id, id);
create index if not exists factures_decisions_facture_idx on public.factures_decisions (espace_id, facture_id, rang);
drop trigger if exists factures_decisions_ajout_seul on public.factures_decisions;
create trigger factures_decisions_ajout_seul before update on public.factures_decisions for each row execute function public.ajout_seul();
-- L'heure de la décision vient toujours de la base.
create or replace function public.factures_decisions_heure() returns trigger
language plpgsql as $$
begin
  new.decide_le := clock_timestamp();   -- heure réelle (comparée à copie_le des scans)
  return new;
end $$;
drop trigger if exists ab_decision_heure on public.factures_decisions;
create trigger ab_decision_heure before insert on public.factures_decisions for each row execute function public.factures_decisions_heure();

create table if not exists public.factures_corrections (
  id uuid primary key default gen_random_uuid(),
  rang bigint generated always as identity,
  facture_id uuid not null,
  champ text not null check (champ in ('fournisseur', 'numero', 'date_facture', 'montant_ht', 'montant_tva', 'montant_ttc', 'type_document')),
  valeur text,
  motif text
);
select public.poser_socle('factures_corrections');
alter table public.factures_corrections drop constraint if exists factures_corrections_facture_fk;
alter table public.factures_corrections add constraint factures_corrections_facture_fk foreign key (espace_id, facture_id) references public.factures_identite (espace_id, id);
create index if not exists factures_corrections_facture_idx on public.factures_corrections (espace_id, facture_id, champ, rang);
drop trigger if exists factures_corrections_ajout_seul on public.factures_corrections;
create trigger factures_corrections_ajout_seul before update on public.factures_corrections for each row execute function public.ajout_seul();

create table if not exists public.lignes_facture_lues (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null,
  scan_id uuid,
  "position" integer not null check ("position" >= 1),
  reference_fournisseur text,
  designation text not null check (char_length(btrim(designation)) > 0),
  designation_normalisee text generated always as (public.normaliser_texte(designation)) stored,
  quantite numeric,
  unite text,
  unite_normalisee text generated always as (public.normaliser_unite(unite)) stored,
  prix_unitaire_ht numeric,
  remise_pct numeric check (remise_pct is null or (remise_pct >= 0 and remise_pct <= 100)),
  montant_ht numeric,
  taux_tva numeric check (taux_tva is null or (taux_tva >= 0 and taux_tva <= 100))
);
select public.poser_socle('lignes_facture_lues');
select public.poser_reflet('lignes_facture_lues');
alter table public.lignes_facture_lues drop constraint if exists lignes_facture_lues_facture_fk;
alter table public.lignes_facture_lues add constraint lignes_facture_lues_facture_fk foreign key (espace_id, facture_id) references public.factures_identite (espace_id, id);
alter table public.lignes_facture_lues drop constraint if exists lignes_facture_lues_scan_fk;
alter table public.lignes_facture_lues add constraint lignes_facture_lues_scan_fk foreign key (espace_id, scan_id) references public.factures_scans (espace_id, id);
-- Décision prise seul (règle 8) : une ligne remplacée est archivée, puis relue sous le même numéro : l'unicité ne compte que les lignes en cours.
create unique index if not exists lignes_facture_lues_source_unique on public.lignes_facture_lues (espace_id, source_nom, source_ref) where archive_le is null;
create unique index if not exists lignes_facture_position_unique on public.lignes_facture_lues (espace_id, facture_id, "position") where archive_le is null;
create index if not exists lignes_facture_facture_idx on public.lignes_facture_lues (espace_id, facture_id) where archive_le is null;

create table if not exists public.lignes_facture_articles (
  id uuid primary key default gen_random_uuid(),
  ligne_id uuid not null,
  article_fournisseur_id uuid not null
);
select public.poser_socle('lignes_facture_articles');
alter table public.lignes_facture_articles drop constraint if exists lignes_facture_articles_ligne_fk;
alter table public.lignes_facture_articles add constraint lignes_facture_articles_ligne_fk foreign key (espace_id, ligne_id) references public.lignes_facture_lues (espace_id, id);
alter table public.lignes_facture_articles drop constraint if exists lignes_facture_articles_article_fk;
alter table public.lignes_facture_articles add constraint lignes_facture_articles_article_fk foreign key (espace_id, article_fournisseur_id) references public.articles_fournisseur (espace_id, id);
create unique index if not exists lignes_facture_articles_un_en_cours on public.lignes_facture_articles (espace_id, ligne_id) where archive_le is null;
create index if not exists lignes_facture_article_idx on public.lignes_facture_articles (espace_id, article_fournisseur_id) where archive_le is null;

-- IBAN confirmés (repris de 014) : jamais supprimés, révoqués avec un motif.
create table if not exists public.ibans_confirmes (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null,
  siren text not null check (siren ~ '^[0-9]{9}$'),
  iban text not null check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' and public.iban_valide(iban)),
  facture_id uuid not null,
  moyen_verification text not null check (char_length(btrim(moyen_verification)) between 3 and 500),
  confirme_par text not null check (char_length(btrim(confirme_par)) > 0),
  confirme_par_id uuid,
  confirme_le timestamptz not null default now(),
  revoque_le timestamptz,
  revoque_par text,
  revoque_par_id uuid,
  motif_revocation text,
  constraint ibans_confirmes_revocation_coherente check (
    (revoque_le is null) = (revoque_par is null) and (revoque_le is null) = (motif_revocation is null)
    and (motif_revocation is null or char_length(btrim(motif_revocation)) between 3 and 500)
    and (revoque_par is null or char_length(btrim(revoque_par)) > 0))
);
select public.poser_socle('ibans_confirmes');
alter table public.ibans_confirmes drop constraint if exists ibans_confirmes_fournisseur_fk;
alter table public.ibans_confirmes add constraint ibans_confirmes_fournisseur_fk foreign key (espace_id, fournisseur_id) references public.fournisseurs (espace_id, id);
alter table public.ibans_confirmes drop constraint if exists ibans_confirmes_facture_fk;
alter table public.ibans_confirmes add constraint ibans_confirmes_facture_fk foreign key (espace_id, facture_id) references public.factures_identite (espace_id, id);
create unique index if not exists ibans_confirmes_actif_unique on public.ibans_confirmes (espace_id, iban) where revoque_le is null;
create index if not exists ibans_confirmes_fournisseur_idx on public.ibans_confirmes (espace_id, fournisseur_id);
create index if not exists ibans_confirmes_siren_idx on public.ibans_confirmes (espace_id, siren);

create or replace function public.ibans_confirmes_garde() returns trigger
language plpgsql as $$
begin
  if old.revoque_le is not null
     or new.revoque_le is null
     or coalesce(nullif(current_setting('app.revocation_iban', true), ''), '') <> old.id::text
     or new.id is distinct from old.id or new.fournisseur_id is distinct from old.fournisseur_id or new.siren is distinct from old.siren
     or new.iban is distinct from old.iban or new.facture_id is distinct from old.facture_id
     or new.moyen_verification is distinct from old.moyen_verification or new.confirme_par is distinct from old.confirme_par
     or new.confirme_par_id is distinct from old.confirme_par_id or new.confirme_le is distinct from old.confirme_le then
    raise exception 'Un IBAN confirmé ne se modifie pas : on le révoque (avec un motif)' using errcode = 'P0001', detail = 'iban_confirme_fige';
  end if;
  return new;
end $$;
drop trigger if exists ibans_confirmes_garde on public.ibans_confirmes;
create trigger ibans_confirmes_garde before update on public.ibans_confirmes for each row execute function public.ibans_confirmes_garde();
create or replace function public.ibans_confirmes_heure() returns trigger
language plpgsql as $$
begin
  new.confirme_le := now();
  return new;
end $$;
drop trigger if exists ab_iban_heure on public.ibans_confirmes;
create trigger ab_iban_heure before insert on public.ibans_confirmes for each row execute function public.ibans_confirmes_heure();

-- ===================================================================================================================
-- Aides
-- ===================================================================================================================
-- Statut d'une facture = sa dernière décision (rouverte ou aucune = à valider).
create or replace function public.statut_de_facture(p_facture_id uuid) returns public.statut_facture
language sql stable
set search_path = public, pg_temp as $$
  select coalesce((select case d.decision when 'accepter' then 'acceptee' when 'refuser' then 'refusee' else 'a_valider' end
                   from public.factures_decisions d where d.facture_id = p_facture_id order by d.rang desc limit 1), 'a_valider')::public.statut_facture
$$;

-- Les clés que la facture DEVRAIT avoir d'après son dernier scan et les corrections (numéro corrigé compris).
create or replace function public.cles_lues_facture(p_facture_id uuid, out siren text, out numero_normalise text)
language plpgsql stable
set search_path = public, pg_temp as $$
declare v_s public.factures_scans%rowtype; v_num text; v_a_num boolean;
begin
  select * into v_s from public.factures_scans s where s.facture_id = p_facture_id order by s.rang desc limit 1;
  select true, c.valeur into v_a_num, v_num from public.factures_corrections c
    where c.facture_id = p_facture_id and c.champ = 'numero' and c.archive_le is null order by c.rang desc limit 1;
  select k.siren, k.numero_normalise into siren, numero_normalise
    from public.cles_facture(v_s.extraction, case when v_a_num then v_num else v_s.numero end) k;
end $$;

-- Recale l'identité d'une facture À VALIDER sur ses clés lues. Jamais de fusion automatique (règle de Jérôme, C3) :
-- si une autre facture porte déjà ces clés, l'identité n'est pas touchée et le cas apparaît dans v_factures_doublons_possibles.
create or replace function public.factures_recaler_cles(p_facture_id uuid) returns void
language plpgsql
set search_path = public, pg_temp as $$
declare v_k record; v_i public.factures_identite%rowtype;
begin
  select * into v_i from public.factures_identite where id = p_facture_id for update;
  if not found or public.statut_de_facture(p_facture_id) <> 'a_valider' then return; end if;
  select * into v_k from public.cles_lues_facture(p_facture_id);
  if (v_k.siren, v_k.numero_normalise) is not distinct from (v_i.fournisseur_siren, v_i.numero_normalise) then return; end if;
  if v_k.siren is not null and v_k.numero_normalise is not null and exists (
       select 1 from public.factures_identite i where i.id <> p_facture_id and i.fournisseur_siren = v_k.siren and i.numero_normalise = v_k.numero_normalise) then
    return;
  end if;
  update public.factures_identite set fournisseur_siren = v_k.siren, numero_normalise = v_k.numero_normalise where id = p_facture_id;
end $$;

-- ===================================================================================================================
-- Scans : calcul des clés et rattachement à LA facture (pas de doublon de facture)
-- ===================================================================================================================
create or replace function public.factures_scans_avant() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_k record; v_id uuid;
begin
  select * into v_k from public.cles_facture(new.extraction, new.numero);
  new.fournisseur_siren := v_k.siren;
  new.numero_normalise := v_k.numero_normalise;
  new.iban_normalise := v_k.iban;
  new.piece_jointe := coalesce(nullif(btrim(coalesce(new.piece_jointe, '')), ''), nullif(btrim(coalesce(new.fichier_path, '')), ''));
  -- Compatibilité : sans source donnée, le courriel + la pièce jointe ; sans courriel, un dépôt à la main (identifiant unique).
  if nullif(btrim(coalesce(new.source_nom, '')), '') is null or nullif(btrim(coalesce(new.source_ref, '')), '') is null then
    if nullif(btrim(coalesce(new.email_message_id, '')), '') is not null then
      new.source_nom := 'courriel';
      new.source_ref := btrim(new.email_message_id) || '/' || coalesce(new.piece_jointe, '-');
    else
      new.source_nom := 'depot';
      new.source_ref := gen_random_uuid()::text;
    end if;
  end if;
  if new.facture_id is null then
    -- Décision prise seul (à valider par Jérôme) : la colonne facture_id peut arriver vide (le robot ne connaît pas la facture),
    -- mais la base rattache TOUT DE SUITE le scan : à la facture qui a le même SIREN + numéro dans l'espace, sinon à une facture neuve
    -- (identité encore inconnue si le SIREN ou le numéro n'a pas été lu). Les écrans ont ainsi un identifiant stable dès la réception.
    if v_k.siren is not null and v_k.numero_normalise is not null then
      perform pg_advisory_xact_lock(hashtextextended('facture:' || public.espace_obligatoire() || ':' || v_k.siren || ':' || v_k.numero_normalise, 0));
      select i.id into v_id from public.factures_identite i where i.fournisseur_siren = v_k.siren and i.numero_normalise = v_k.numero_normalise;
    end if;
    if v_id is null then
      insert into public.factures_identite (fournisseur_siren, numero_normalise) values (v_k.siren, v_k.numero_normalise) returning id into v_id;
    end if;
    new.facture_id := v_id;
  end if;
  return new;
end $$;
drop trigger if exists ab_scan_avant on public.factures_scans;
create trigger ab_scan_avant before insert on public.factures_scans for each row execute function public.factures_scans_avant();
drop trigger if exists ab_reflet_copie_le on public.factures_scans;
create trigger ab_reflet_copie_le before insert on public.factures_scans for each row execute function public.reflet_copie_le();
drop trigger if exists factures_scans_ajout_seul on public.factures_scans;
create trigger factures_scans_ajout_seul before update on public.factures_scans for each row execute function public.ajout_seul();

create or replace function public.factures_scans_apres() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  perform public.factures_recaler_cles(new.facture_id);
  return null;
end $$;
drop trigger if exists factures_scans_apres on public.factures_scans;
create trigger factures_scans_apres after insert on public.factures_scans for each row execute function public.factures_scans_apres();

-- Corrections : valeur vérifiée (bon format), interdites sur une facture décidée, puis l'identité est recalée.
create or replace function public.factures_corrections_avant() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if public.statut_de_facture(new.facture_id) <> 'a_valider' then
    raise exception 'Facture déjà décidée : ses valeurs ne se corrigent plus' using errcode = 'P0001', detail = 'facture_decidee_figee';
  end if;
  begin
    if new.champ = 'date_facture' then perform new.valeur::date;
    elsif new.champ in ('montant_ht', 'montant_tva', 'montant_ttc') then
      if new.valeur::numeric(12,2) < 0 then raise exception 'négatif'; end if;
    elsif new.champ = 'type_document' and new.valeur not in ('facture', 'avoir') then raise exception 'type';
    end if;
  exception when others then
    raise exception 'Correction refusée : la valeur de % n''a pas le bon format', new.champ using errcode = 'P0001', detail = 'correction_invalide';
  end;
  if new.champ = 'type_document' and new.valeur is null then
    raise exception 'Correction refusée : le type de document est obligatoire' using errcode = 'P0001', detail = 'correction_invalide';
  end if;
  return new;
end $$;
drop trigger if exists ab_correction_avant on public.factures_corrections;
create trigger ab_correction_avant before insert on public.factures_corrections for each row execute function public.factures_corrections_avant();

create or replace function public.factures_corrections_apres() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_k record; v_i public.factures_identite%rowtype;
begin
  if new.champ = 'numero' then
    -- Une correction qui change l'identité (le numéro) : si une autre facture a déjà ce SIREN + numéro, refus (aucune fusion automatique ;
    -- à valider par Jérôme : comment fusionner deux factures à la main).
    select * into v_k from public.cles_lues_facture(new.facture_id);
    select * into v_i from public.factures_identite where id = new.facture_id;
    if v_k.siren is not null and v_k.numero_normalise is not null and exists (
         select 1 from public.factures_identite i where i.id <> new.facture_id and i.fournisseur_siren = v_k.siren and i.numero_normalise = v_k.numero_normalise) then
      raise exception 'Correction refusée : une autre facture de ce fournisseur porte déjà ce numéro (pas de fusion automatique)'
        using errcode = 'P0001', detail = 'facture_doublon';
    end if;
  end if;
  perform public.factures_recaler_cles(new.facture_id);
  return null;
end $$;
drop trigger if exists factures_corrections_apres on public.factures_corrections;
create trigger factures_corrections_apres after insert on public.factures_corrections for each row execute function public.factures_corrections_apres();

-- ===================================================================================================================
-- Lignes : verrou (une facture décidée ne change plus de lignes) — repris de lignes_facture_verrou (010 / 011)
-- ===================================================================================================================
create or replace function public.lignes_facture_lues_verrou() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.facture_id <> old.facture_id then
    raise exception 'Une ligne ne change pas de facture';
  end if;
  if public.statut_de_facture(new.facture_id) <> 'a_valider' then
    raise exception 'Facture déjà décidée : ses lignes ne peuvent plus changer (% refusé)', tg_op using errcode = 'P0001', detail = 'facture_decidee_figee';
  end if;
  -- designation_normalisee et unite_normalisee sont des colonnes calculées : encore vides dans NEW à ce moment (déclencheur « before »),
  -- elles ne comptent pas dans la comparaison.
  if tg_op = 'UPDATE' and (new.archive_le is not distinct from old.archive_le
       or (to_jsonb(new) - '{archive_le,archive_par,modifie_le,modifie_par,designation_normalisee,unite_normalisee}'::text[]) <> (to_jsonb(old) - '{archive_le,archive_par,modifie_le,modifie_par,designation_normalisee,unite_normalisee}'::text[])) then
    raise exception 'Une ligne lue ne se modifie pas : on remplace les lignes (remplacer_lignes_facture)' using errcode = 'P0001', detail = 'ajout_seul';
  end if;
  if tg_op = 'INSERT' then
    new.source_nom := coalesce(nullif(btrim(coalesce(new.source_nom, '')), ''), 'lecture');
    new.source_ref := coalesce(nullif(btrim(coalesce(new.source_ref, '')), ''), coalesce(new.scan_id, new.facture_id)::text || '#' || new."position"::text);
  end if;
  return new;
end $$;
drop trigger if exists ab_lignes_verrou on public.lignes_facture_lues;
create trigger ab_lignes_verrou before insert or update on public.lignes_facture_lues for each row execute function public.lignes_facture_lues_verrou();
drop trigger if exists ab_reflet_copie_le on public.lignes_facture_lues;
create trigger ab_reflet_copie_le before insert on public.lignes_facture_lues for each row execute function public.reflet_copie_le();

create or replace function public.lignes_facture_articles_verrou() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_facture uuid; v_statut public.statut_facture;
begin
  select l.facture_id into v_facture from public.lignes_facture_lues l where l.id = new.ligne_id;
  v_statut := public.statut_de_facture(v_facture);
  if tg_op = 'UPDATE' and (new.ligne_id <> old.ligne_id or new.article_fournisseur_id <> old.article_fournisseur_id) then
    raise exception 'Un lien ligne -> article ne se modifie pas : on archive l''ancien et on en crée un nouveau' using errcode = 'P0001', detail = 'ajout_seul';
  end if;
  -- Exception unique (reprise de 011) : le rattachement fait par la base au moment de l'acceptation (app.rattachement_interne = cette facture).
  if v_statut = 'a_valider'
     or (v_statut = 'acceptee' and nullif(current_setting('app.rattachement_interne', true), '') = v_facture::text) then
    return new;
  end if;
  raise exception 'Facture déjà décidée : ses lignes ne peuvent plus changer (% refusé)', tg_op using errcode = 'P0001', detail = 'facture_decidee_figee';
end $$;
drop trigger if exists ab_liens_verrou on public.lignes_facture_articles;
create trigger ab_liens_verrou before insert or update on public.lignes_facture_articles for each row execute function public.lignes_facture_articles_verrou();

-- Lier une ligne à un article (archive l'ancien lien s'il est différent).
create or replace function public.lier_ligne_article(p_ligne_id uuid, p_article_fournisseur_id uuid) returns void
language plpgsql
set search_path = public, pg_temp as $$
declare v_actuel uuid;
begin
  select a.article_fournisseur_id into v_actuel from public.lignes_facture_articles a where a.ligne_id = p_ligne_id and a.archive_le is null for update;
  if v_actuel is not distinct from p_article_fournisseur_id then return; end if;
  if v_actuel is not null then
    update public.lignes_facture_articles set archive_le = now() where ligne_id = p_ligne_id and archive_le is null;
  end if;
  if p_article_fournisseur_id is not null then
    insert into public.lignes_facture_articles (ligne_id, article_fournisseur_id) values (p_ligne_id, p_article_fournisseur_id);
  end if;
end $$;

-- ===================================================================================================================
-- Vues de lecture qui gardent les colonnes d'aujourd'hui
-- ===================================================================================================================
create or replace view public.journal_decisions with (security_invoker = true) as
select d.id, d.facture_id, d.decision, d.decide_par, d.decide_le,
       case when d.decision = 'refuser' then d.motif_refus
            when d.decision = 'accepter' and d.acceptee_malgre_alerte then d.motif_acceptation
            when d.decision = 'rouverte' then d.motif
            else null end as motif,
       case when d.acceptee_malgre_alerte then d.alertes_a_la_decision else null end as alertes,
       d.acceptee_malgre_alerte, d.decide_par_id, d.ancien_statut
from public.factures_decisions d;

create or replace view public.lignes_facture with (security_invoker = true) as
select l.id, l.facture_id, l."position", l.reference_fournisseur, l.designation, l.designation_normalisee, l.quantite, l.unite, l.unite_normalisee,
       l.prix_unitaire_ht, l.remise_pct, l.montant_ht, l.taux_tva, a.article_fournisseur_id, l.cree_le as created_at
from public.lignes_facture_lues l
left join public.lignes_facture_articles a on a.ligne_id = l.id and a.archive_le is null
where l.archive_le is null;

create or replace view public.rapprochements_articles with (security_invoker = true) as
select r.article_fournisseur_id, r.article_reference_id, r.coefficient, r.valide_par, r.valide_le, r.suggere_par_ia, r.created_at
from public.rapprochements_articles_tous r
where r.archive_le is null;

create or replace view public.suggestions_refusees with (security_invoker = true) as
select s.article_fournisseur_id, s.refuse_par, s.refuse_le, s.article_reference_id, s.coefficient
from public.suggestions_refusees_tous s
where s.archive_le is null;

-- La facture recollée : identité + DERNIER scan reçu avant la décision (une décision fige ce qu'on a lu ; un scan arrivé après est gardé
-- et signalé dans v_factures_desaccords) + dernières corrections (une correction l'emporte sur la lecture) + dernière décision + lignes en cours.
-- Colonnes EXACTEMENT celles de la table factures d'aujourd'hui, dans le même ordre.
create or replace view public.factures with (security_invoker = true) as
select v.id, v.chantier_id, v.fournisseur, v.numero, v.date_facture, v.montant_ht, v.montant_tva, v.montant_ttc,
       v.statut, v.motif_refus, v.date_decision, v.decide_par, v.fichier_path, v.email_expediteur, v.email_message_id, v.created_at,
       v.extraction, v.extraction_erreur, v.alertes_a_la_decision, v.acceptee_malgre_alerte, v.motif_acceptation,
       v.fournisseur_siren, v.numero_normalise, v.iban_normalise, v.decide_par_id, v.fournisseur_id, v.etablissement_id, v.type_document,
       case when lg.n = 0 then 'non_lues'
            when v.montant_ht is null or lg.somme is null then 'lues'
            when abs((case when v.type_document = 'avoir' then abs(lg.somme) else lg.somme end) - v.montant_ht) <= 0.01 * (lg.n + 1) then 'lues'
            else 'somme_ecart' end::text as lignes_etat,
       case when lg.n = 0 then null else round(lg.somme, 2) end::numeric(12,2) as lignes_somme_ht,
       v.archivee_le, v.archivee_par, v.courriel_id
from (
  select i.id, i.chantier_id,
         case when c.a_fournisseur then c.fournisseur else s.fournisseur end as fournisseur,
         case when c.a_numero then c.numero else s.numero end as numero,
         case when c.a_date then c.date_facture::date else s.date_facture end as date_facture,
         case when c.a_ht then c.montant_ht::numeric(12,2) else s.montant_ht end as montant_ht,
         case when c.a_tva then c.montant_tva::numeric(12,2) else s.montant_tva end as montant_tva,
         case when c.a_ttc then c.montant_ttc::numeric(12,2) else s.montant_ttc end as montant_ttc,
         (case d.decision when 'accepter' then 'acceptee' when 'refuser' then 'refusee' else 'a_valider' end)::public.statut_facture as statut,
         case when d.decision in ('accepter', 'refuser') then d.motif_refus end as motif_refus,
         case when d.decision in ('accepter', 'refuser') then d.decide_le end as date_decision,
         case when d.decision in ('accepter', 'refuser') then d.decide_par end as decide_par,
         s.fichier_path, s.email_expediteur, s.email_message_id, i.cree_le as created_at, s.extraction, s.extraction_erreur,
         case when d.decision in ('accepter', 'refuser') then d.alertes_a_la_decision end as alertes_a_la_decision,
         coalesce(case when d.decision in ('accepter', 'refuser') then d.acceptee_malgre_alerte end, false) as acceptee_malgre_alerte,
         case when d.decision in ('accepter', 'refuser') then d.motif_acceptation end as motif_acceptation,
         i.fournisseur_siren, i.numero_normalise, s.iban_normalise,
         case when d.decision in ('accepter', 'refuser') then d.decide_par_id end as decide_par_id,
         i.fournisseur_id, i.etablissement_id,
         case when c.a_type then c.type_document else coalesce(s.type_document, 'facture') end as type_document,
         i.archive_le as archivee_le, i.archive_par as archivee_par, s.courriel_id
  from public.factures_identite i
  left join lateral (
    select d0.* from public.factures_decisions d0 where d0.facture_id = i.id order by d0.rang desc limit 1
  ) d on true
  left join lateral (
    select s0.* from public.factures_scans s0
    where s0.facture_id = i.id
    order by (d.decision not in ('accepter', 'refuser') or d.decision is null or s0.copie_le <= d.decide_le) desc, s0.rang desc
    limit 1
  ) s on true
  left join lateral (
    select bool_or(c0.champ = 'fournisseur') as a_fournisseur, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'fournisseur'))[1] as fournisseur,
           bool_or(c0.champ = 'numero') as a_numero, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'numero'))[1] as numero,
           bool_or(c0.champ = 'date_facture') as a_date, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'date_facture'))[1] as date_facture,
           bool_or(c0.champ = 'montant_ht') as a_ht, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_ht'))[1] as montant_ht,
           bool_or(c0.champ = 'montant_tva') as a_tva, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_tva'))[1] as montant_tva,
           bool_or(c0.champ = 'montant_ttc') as a_ttc, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_ttc'))[1] as montant_ttc,
           bool_or(c0.champ = 'type_document') as a_type, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'type_document'))[1] as type_document
    from public.factures_corrections c0 where c0.facture_id = i.id and c0.archive_le is null
  ) c on true
) v
left join lateral (
  select count(*)::integer as n, sum(l.montant_ht) as somme
  from public.lignes_facture_lues l where l.facture_id = v.id and l.archive_le is null
) lg on true;

-- Valeurs par défaut de la vue (comme les colonnes de l'ancienne table), pour les robots qui écrivent « insert into factures ».
alter view public.factures alter column statut set default 'a_valider';
alter view public.factures alter column acceptee_malgre_alerte set default false;
alter view public.factures alter column type_document set default 'facture';

-- Désaccords entre scans d'une même facture (le robot ne tranche pas : une personne regarde).
create or replace view public.v_factures_desaccords with (security_invoker = true) as
select s.facture_id,
       count(*)::integer as nb_scans,
       count(distinct s.montant_ht)::integer as nb_montants_ht,
       count(distinct s.montant_ttc)::integer as nb_montants_ttc,
       count(distinct s.date_facture)::integer as nb_dates,
       count(distinct s.iban_normalise)::integer as nb_ibans,
       min(s.copie_le) as premier_scan_le,
       max(s.copie_le) as dernier_scan_le
from public.factures_scans s
where s.facture_id is not null
group by s.facture_id
having count(*) > 1
   and (count(distinct s.montant_ht) > 1 or count(distinct s.montant_ttc) > 1 or count(distinct s.date_facture) > 1 or count(distinct s.iban_normalise) > 1);

-- Doublons possibles : une facture dont l'identité n'a pas pu prendre ses clés lues, parce qu'une autre facture les porte déjà.
-- C'est ici que vit désormais la règle « doublon refusé avec motif » (à valider par Jérôme) : une personne regarde et refuse l'une des deux.
create or replace view public.v_factures_doublons_possibles with (security_invoker = true) as
select i.id as facture_id, k.siren as fournisseur_siren, k.numero_normalise, autre.id as autre_facture_id
from public.factures_identite i
cross join lateral public.cles_lues_facture(i.id) k
join public.factures_identite autre on autre.id <> i.id and autre.fournisseur_siren = k.siren and autre.numero_normalise = k.numero_normalise
where (i.fournisseur_siren, i.numero_normalise) is distinct from (k.siren, k.numero_normalise);

-- Scans arrivés APRÈS la dernière décision (ex. une facture refusée renvoyée par le fournisseur) : gardés, mais sans effet sur ce qui
-- s'affiche ; cette vue les montre pour qu'une personne regarde (à valider par Jérôme : faut-il rouvrir la facture automatiquement ?).
create or replace view public.v_factures_scans_apres_decision with (security_invoker = true) as
select s.facture_id, s.id as scan_id, s.copie_le, s.source_nom, s.source_ref, s.email_message_id, s.montant_ht, s.montant_ttc,
       d.decision as derniere_decision, d.decide_le as decide_le
from public.factures_scans s
join lateral (
  select d0.decision, d0.decide_le from public.factures_decisions d0 where d0.facture_id = s.facture_id order by d0.rang desc limit 1
) d on true
where d.decision in ('accepter', 'refuser') and s.copie_le > d.decide_le;

-- ===================================================================================================================
-- Garde-fous sur les TABLES (et pas seulement sur la vue factures) : la porte peut écrire les tables en direct.
-- ===================================================================================================================
create or replace function public.factures_identite_garde() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_statut public.statut_facture := public.statut_de_facture(old.id); v_lien boolean;
begin
  -- relier_facture_chantier : seulement pour poser un chantier sur une facture qui n'en a pas (comme la vue).
  v_lien := coalesce(nullif(current_setting('app.lien_chantier_facture', true), ''), '') = old.id::text and old.chantier_id is null;
  if v_statut <> 'a_valider' then
    if (new.fournisseur_siren, new.numero_normalise, new.fournisseur_id, new.etablissement_id)
       is distinct from (old.fournisseur_siren, old.numero_normalise, old.fournisseur_id, old.etablissement_id)
       or (new.chantier_id is distinct from old.chantier_id and not v_lien) then
      raise exception 'Facture déjà décidée : son identité (fournisseur, numéro, agence, chantier) ne change plus (la réouverture passe par rouvrir_facture)'
        using errcode = 'P0001', detail = 'facture_decidee_figee';
    end if;
  elsif new.archive_le is distinct from old.archive_le then
    raise exception 'Archivage refusé : seule une facture déjà acceptée ou refusée peut être archivée'
      using errcode = 'P0001', detail = 'archivage_facture_non_decidee';
  end if;
  return new;
end $$;
drop trigger if exists ac_identite_garde on public.factures_identite;
create trigger ac_identite_garde before update on public.factures_identite for each row execute function public.factures_identite_garde();

create or replace function public.factures_decisions_garde() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_statut public.statut_facture; v_ag uuid; v_actif boolean; v_ch uuid; v_ch_statut public.statut_chantier; v_ch_archive boolean;
begin
  perform 1 from public.factures_identite where id = new.facture_id for update;
  v_statut := public.statut_de_facture(new.facture_id);
  if new.decision in ('accepter', 'refuser') then
    if v_statut <> 'a_valider' then
      raise exception 'Facture déjà décidée : la réouverture passe par rouvrir_facture' using errcode = 'P0001', detail = 'facture_decidee_figee';
    end if;
    if new.decide_par_id is null then
      raise exception 'Décision refusée : identifiant du décideur manquant' using errcode = 'P0001', detail = 'decideur_manquant';
    end if;
  elsif v_statut = 'a_valider' then
    raise exception 'Réouverture refusée : la facture n''est pas encore décidée' using errcode = 'P0001', detail = 'facture_non_decidee';
  end if;
  if new.decision = 'accepter' then
    select i.etablissement_id, i.chantier_id into v_ag, v_ch from public.factures_identite i where i.id = new.facture_id;
    if v_ch is not null then
      select c.statut, c.archive into v_ch_statut, v_ch_archive from public.chantiers c where c.id = v_ch for share;
      if v_ch_statut = 'termine' then
        raise exception 'Acceptation refusée : le chantier est terminé' using errcode = 'P0001', detail = 'chantier_termine';
      elsif v_ch_statut = 'suspendu' then
        raise exception 'Acceptation refusée : le chantier est suspendu' using errcode = 'P0001', detail = 'chantier_suspendu';
      end if;
      if v_ch_archive then
        raise exception 'Acceptation refusée : le chantier est archivé' using errcode = 'P0001', detail = 'chantier_archive';
      end if;
    end if;
    if v_ag is null then
      raise exception 'Acceptation refusée : choisissez l''agence du fournisseur (agence obligatoire)' using errcode = 'P0001', detail = 'agence_obligatoire';
    end if;
    select e.actif into v_actif from public.etablissements_fournisseur e where e.id = v_ag;
    if v_actif is not true then
      raise exception 'Acceptation refusée : cette agence est désactivée' using errcode = 'P0001', detail = 'agence_inactive';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ac_decision_garde on public.factures_decisions;
create trigger ac_decision_garde before insert on public.factures_decisions for each row execute function public.factures_decisions_garde();

-- ===================================================================================================================
-- Écritures des robots d'aujourd'hui dans la vue factures : rangées dans les bonnes tables
-- ===================================================================================================================
create or replace function public.factures_vue_ajouter() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_scan public.factures_scans%rowtype; v_nouvelle boolean;
begin
  if coalesce(new.statut, 'a_valider') <> 'a_valider' then
    raise exception 'Une facture ne peut être créée que « à valider » : la décision passe par une mise à jour'
      using errcode = 'P0001', detail = 'facture_creation_statut';
  end if;
  if new.archivee_le is not null or new.archivee_par is not null then
    raise exception 'Archivage refusé : seule une facture déjà acceptée ou refusée peut être archivée'
      using errcode = 'P0001', detail = 'archivage_facture_non_decidee';
  end if;
  insert into public.factures_scans (courriel_id, email_message_id, email_expediteur, fichier_path, fournisseur, numero, date_facture,
                                     montant_ht, montant_tva, montant_ttc, type_document, extraction, extraction_erreur)
  values (new.courriel_id, new.email_message_id, new.email_expediteur, new.fichier_path, new.fournisseur, new.numero, new.date_facture,
          new.montant_ht, new.montant_tva, new.montant_ttc, coalesce(new.type_document, 'facture'), new.extraction, new.extraction_erreur)
  returning * into v_scan;
  -- Agence, fournisseur, chantier donnés à la réception : posés seulement s'ils sont encore vides sur la facture.
  update public.factures_identite i set
    chantier_id = coalesce(i.chantier_id, new.chantier_id),
    etablissement_id = coalesce(i.etablissement_id, new.etablissement_id),
    fournisseur_id = coalesce(i.fournisseur_id, new.fournisseur_id)
  where i.id = v_scan.facture_id
    and (new.chantier_id is not null or new.etablissement_id is not null or new.fournisseur_id is not null)
    and public.statut_de_facture(i.id) = 'a_valider';
  new.id := v_scan.facture_id;
  -- Le statut rendu est le VRAI statut de la facture rejointe (une facture refusée renvoyée reste refusée, et se voit dans v_factures_scans_apres_decision).
  new.statut := public.statut_de_facture(v_scan.facture_id);
  new.fournisseur_siren := v_scan.fournisseur_siren;
  new.numero_normalise := v_scan.numero_normalise;
  new.iban_normalise := v_scan.iban_normalise;
  new.created_at := (select i.cree_le from public.factures_identite i where i.id = v_scan.facture_id);
  new.lignes_etat := coalesce(new.lignes_etat, 'non_lues');
  return new;
end $$;
drop trigger if exists factures_vue_ajouter on public.factures;
create trigger factures_vue_ajouter instead of insert on public.factures for each row execute function public.factures_vue_ajouter();

create or replace function public.factures_vue_modifier() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_ag_id uuid; v_ag_four uuid; v_ag_actif boolean; v_ag_fusion uuid;
  v_four_siren text;
  v_ch_statut public.statut_chantier; v_ch_archive boolean;
  v_relu boolean; v_scan public.factures_scans%rowtype; v_champ text;
  v_qui_id uuid;
begin
  perform 1 from public.factures_identite where id = old.id for update;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.lignes_etat is distinct from old.lignes_etat or new.lignes_somme_ht is distinct from old.lignes_somme_ht
     or new.numero_normalise is distinct from old.numero_normalise or new.iban_normalise is distinct from old.iban_normalise then
    raise exception 'Cette colonne est calculée par la base : elle ne s''écrit pas' using errcode = 'P0001', detail = 'colonne_calculee';
  end if;

  -- ---------------- Facture déjà décidée ----------------
  if old.statut <> 'a_valider' then
    if new.statut = 'a_valider' then
      raise exception 'Facture déjà décidée : la réouverture passe par rouvrir_facture (motif et trace au journal)'
        using errcode = 'P0001', detail = 'facture_decidee_figee';
    end if;
    if new.statut is distinct from old.statut
       or new.decide_par is distinct from old.decide_par or new.decide_par_id is distinct from old.decide_par_id
       or new.date_decision is distinct from old.date_decision or new.motif_refus is distinct from old.motif_refus
       or new.motif_acceptation is distinct from old.motif_acceptation or new.alertes_a_la_decision is distinct from old.alertes_a_la_decision
       or new.acceptee_malgre_alerte is distinct from old.acceptee_malgre_alerte
       or new.fournisseur_siren is distinct from old.fournisseur_siren
       or (new.chantier_id is distinct from old.chantier_id
           and not (old.chantier_id is null and new.chantier_id is not null and old.statut = 'acceptee' and old.archivee_le is null
                    and coalesce(nullif(current_setting('app.lien_chantier_facture', true), ''), '') = old.id::text))
       or new.fournisseur_id is distinct from old.fournisseur_id or new.etablissement_id is distinct from old.etablissement_id
       or new.type_document is distinct from old.type_document
       -- Décision prise seul (plus strict qu'aujourd'hui) : ce qui a été lu ne change plus non plus après la décision.
       or new.fournisseur is distinct from old.fournisseur or new.numero is distinct from old.numero or new.date_facture is distinct from old.date_facture
       or new.montant_ht is distinct from old.montant_ht or new.montant_tva is distinct from old.montant_tva or new.montant_ttc is distinct from old.montant_ttc
       or new.extraction is distinct from old.extraction or new.extraction_erreur is distinct from old.extraction_erreur
       or new.fichier_path is distinct from old.fichier_path or new.email_expediteur is distinct from old.email_expediteur
       or new.email_message_id is distinct from old.email_message_id or new.courriel_id is distinct from old.courriel_id then
      raise exception 'Facture déjà décidée : la décision et ses clés ne peuvent plus changer'
        using errcode = 'P0001', detail = 'facture_decidee_figee';
    end if;
    -- Liaison après coup (013) : le chantier visé est revérifié.
    if old.chantier_id is null and new.chantier_id is not null then
      select c.statut, c.archive into v_ch_statut, v_ch_archive from public.chantiers c where c.id = new.chantier_id for share;
      if not found then
        raise exception 'Liaison refusée : ce chantier n''existe pas' using errcode = 'P0001', detail = 'chantier_introuvable';
      end if;
      if v_ch_statut = 'termine' then
        raise exception 'Liaison refusée : le chantier est terminé' using errcode = 'P0001', detail = 'chantier_termine';
      elsif v_ch_statut = 'suspendu' then
        raise exception 'Liaison refusée : le chantier est suspendu' using errcode = 'P0001', detail = 'chantier_suspendu';
      end if;
      if v_ch_archive then
        raise exception 'Liaison refusée : le chantier est archivé' using errcode = 'P0001', detail = 'chantier_archive';
      end if;
      update public.factures_identite set chantier_id = new.chantier_id where id = old.id;
    end if;
    -- Archivage (011) : posé ou retiré seulement sur une facture décidée, toujours avec une trace au journal.
    if new.archivee_le is distinct from old.archivee_le or new.archivee_par is distinct from old.archivee_par then
      if old.archivee_le is null then
        if char_length(btrim(coalesce(new.archivee_par, ''))) = 0 then
          raise exception 'Archivage refusé : la personne qui archive est obligatoire (archivee_par)'
            using errcode = 'P0001', detail = 'archivage_sans_auteur';
        end if;
        -- La personne qui archive est celle de la requête (le socle remplit archive_par) ; archivee_par ne sert qu'au libellé du journal.
        update public.factures_identite set archive_le = now() where id = old.id;
        v_qui_id := nullif(current_setting('app.archive_qui_id', true), '')::uuid;
        perform public.journaliser_modification('factures', old.id, 'archiver', btrim(new.archivee_par), v_qui_id, null,
          (select jsonb_build_object('archivee_le', i.archive_le, 'archivee_par', i.archive_par) from public.factures_identite i where i.id = old.id));
      elsif new.archivee_le is null and new.archivee_par is null then
        if nullif(current_setting('app.desarchive_qui', true), '') is null then
          raise exception 'Désarchivage refusé : il passe par desarchiver_facture (trace au journal)'
            using errcode = 'P0001', detail = 'desarchivage_sans_trace';
        end if;
        update public.factures_identite set archive_le = null, archive_par = null where id = old.id;
        v_qui_id := nullif(current_setting('app.desarchive_qui_id', true), '')::uuid;
        perform public.journaliser_modification('factures', old.id, 'desarchiver', current_setting('app.desarchive_qui', true), v_qui_id,
          jsonb_build_object('archivee_le', old.archivee_le, 'archivee_par', old.archivee_par), null);
      else
        raise exception 'Archivage refusé : la facture est déjà archivée' using errcode = 'P0001', detail = 'archivage_deja_fait';
      end if;
    end if;
    return new;
  end if;

  -- ---------------- Facture à valider ----------------
  if new.archivee_le is distinct from old.archivee_le or new.archivee_par is distinct from old.archivee_par then
    raise exception 'Archivage refusé : seule une facture déjà acceptée ou refusée peut être archivée'
      using errcode = 'P0001', detail = 'archivage_facture_non_decidee';
  end if;
  if new.fournisseur_siren is distinct from old.fournisseur_siren then
    raise exception 'Cette colonne est calculée par la base : elle ne s''écrit pas' using errcode = 'P0001', detail = 'colonne_calculee';
  end if;

  -- Ce qui a été lu. Si la lecture du robot change (extraction, fichier, courriel), c'est une NOUVELLE LECTURE : un scan de plus, jamais écrasé.
  -- Sinon, une valeur changée à la main est une CORRECTION (le reflet ne bouge pas).
  v_relu := new.extraction is distinct from old.extraction or new.extraction_erreur is distinct from old.extraction_erreur
            or new.fichier_path is distinct from old.fichier_path or new.email_expediteur is distinct from old.email_expediteur
            or new.email_message_id is distinct from old.email_message_id or new.courriel_id is distinct from old.courriel_id;
  if v_relu then
    select * into v_scan from public.factures_scans s where s.facture_id = old.id order by s.rang desc limit 1;
    insert into public.factures_scans (facture_id, source_nom, source_ref, courriel_id, email_message_id, email_expediteur, piece_jointe, fichier_path,
                                       fournisseur, numero, date_facture, montant_ht, montant_tva, montant_ttc, type_document, extraction, extraction_erreur)
    values (old.id, 'relecture', coalesce(v_scan.id::text, old.id::text) || ':' || gen_random_uuid()::text,
            new.courriel_id, new.email_message_id, new.email_expediteur, null, new.fichier_path,
            new.fournisseur, new.numero, new.date_facture, new.montant_ht, new.montant_tva, new.montant_ttc,
            coalesce(new.type_document, 'facture'), new.extraction, new.extraction_erreur);
  else
    foreach v_champ in array array['fournisseur', 'numero', 'date_facture', 'montant_ht', 'montant_tva', 'montant_ttc', 'type_document'] loop
      if (to_jsonb(new) -> v_champ) is distinct from (to_jsonb(old) -> v_champ) then
        insert into public.factures_corrections (facture_id, champ, valeur)
        values (old.id, v_champ, to_jsonb(new) ->> v_champ);
      end if;
    end loop;
  end if;

  if new.chantier_id is distinct from old.chantier_id or new.etablissement_id is distinct from old.etablissement_id
     or new.fournisseur_id is distinct from old.fournisseur_id then
    update public.factures_identite set chantier_id = new.chantier_id, etablissement_id = new.etablissement_id, fournisseur_id = new.fournisseur_id
    where id = old.id;
  end if;

  if new.statut = 'a_valider' then
    return new;
  end if;

  -- ---------------- Décision (reprise de factures_avant_decision, 008 à 013) ----------------
  if new.decide_par_id is null then
    raise exception 'Décision refusée : identifiant du décideur manquant' using errcode = 'P0001', detail = 'decideur_manquant';
  end if;
  if new.statut = 'acceptee' then
    if new.etablissement_id is null then
      raise exception 'Acceptation refusée : choisissez l''agence du fournisseur (agence obligatoire)' using errcode = 'P0001', detail = 'agence_obligatoire';
    end if;
    select e.id, e.fournisseur_id, e.actif, e.fusionne_dans into v_ag_id, v_ag_four, v_ag_actif, v_ag_fusion
      from public.etablissements_fournisseur e where e.id = new.etablissement_id for share;
    if not found then
      raise exception 'Acceptation refusée : cette agence n''existe pas' using errcode = 'P0001', detail = 'agence_introuvable';
    end if;
    if v_ag_fusion is not null then
      select e.id, e.fournisseur_id, e.actif, e.fusionne_dans into v_ag_id, v_ag_four, v_ag_actif, v_ag_fusion
        from public.etablissements_fournisseur e where e.id = v_ag_fusion for share;
      if not found then
        raise exception 'Acceptation refusée : l''agence cible de la fusion n''existe pas' using errcode = 'P0001', detail = 'agence_introuvable';
      end if;
    end if;
    if v_ag_actif is not true then
      raise exception 'Acceptation refusée : cette agence est désactivée' using errcode = 'P0001', detail = 'agence_inactive';
    end if;
    if new.chantier_id is not null then
      select c.statut, c.archive into v_ch_statut, v_ch_archive from public.chantiers c where c.id = new.chantier_id for share;
      if not found then
        raise exception 'Acceptation refusée : ce chantier n''existe pas' using errcode = 'P0001', detail = 'chantier_introuvable';
      end if;
      if v_ch_statut = 'termine' then
        raise exception 'Acceptation refusée : le chantier est terminé' using errcode = 'P0001', detail = 'chantier_termine';
      elsif v_ch_statut = 'suspendu' then
        raise exception 'Acceptation refusée : le chantier est suspendu' using errcode = 'P0001', detail = 'chantier_suspendu';
      end if;
      if v_ch_archive then
        raise exception 'Acceptation refusée : le chantier est archivé' using errcode = 'P0001', detail = 'chantier_archive';
      end if;
    end if;
    select f.siren into v_four_siren from public.fournisseurs f where f.id = v_ag_four for share;
    -- Fournisseur déduit de l'agence ; SIREN de l'identité = celui de l'entreprise s'il est connu. Si une AUTRE facture a déjà ce SIREN + numéro,
    -- l'index factures_identite_sans_doublon refuse (comme factures_acceptees_sans_doublon aujourd'hui).
    update public.factures_identite set
      etablissement_id = v_ag_id, fournisseur_id = v_ag_four, chantier_id = new.chantier_id,
      fournisseur_siren = coalesce(v_four_siren, fournisseur_siren)
    where id = old.id;
  end if;
  insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id, motif_refus, motif_acceptation, alertes_a_la_decision, acceptee_malgre_alerte)
  values (old.id, case new.statut when 'acceptee' then 'accepter' else 'refuser' end, coalesce(new.decide_par, ''), new.decide_par_id,
          new.motif_refus, new.motif_acceptation, new.alertes_a_la_decision,
          coalesce(new.acceptee_malgre_alerte, false));   -- les contraintes de factures_decisions refusent les combinaisons fausses (comme aujourd'hui)
  if new.statut = 'acceptee' then
    perform public.rattacher_lignes_facture_interne(old.id, v_ag_four, new.decide_par, new.decide_par_id);
  end if;
  return new;
end $$;
drop trigger if exists factures_vue_modifier on public.factures;
create trigger factures_vue_modifier instead of update on public.factures for each row execute function public.factures_vue_modifier();
