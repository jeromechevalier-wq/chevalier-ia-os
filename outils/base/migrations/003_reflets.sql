-- 003 : les tables REFLETS « simples » : copies de ce qui vit ailleurs (boîte mail, n8n, OpenRouter), écrites par les robots, en ajout seul.
-- Règle 8 : chaque reflet porte source_nom (d'où vient la copie), source_ref (son numéro là-bas), copie_le (quand la base l'a reçue),
-- et l'unicité (espace_id, source_nom, source_ref) empêche de recopier deux fois la même chose.
-- Les reflets des factures (factures_scans, lignes_facture_lues) sont dans 004.

-- Colonnes et unicité communes aux reflets. copie_le est TOUJOURS l'heure de la base.
create or replace function public.poser_reflet(p_table text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('alter table %s add column if not exists source_nom text', t);
  execute format('alter table %s add column if not exists source_ref text', t);
  execute format('alter table %s add column if not exists copie_le timestamptz not null default now()', t);
  execute format('alter table %s drop constraint if exists %I', t, p_table || '_source_remplie');
  execute format('alter table %s add constraint %I check (char_length(btrim(coalesce(source_nom, ''''))) between 1 and 200 and char_length(btrim(coalesce(source_ref, ''''))) between 1 and 600)',
                 t, p_table || '_source_remplie');
end $$;

create or replace function public.reflet_copie_le() returns trigger
language plpgsql as $$
begin
  new.copie_le := now();
  return new;
end $$;

-- Courriels reçus (la vérité : la boîte mail). Remplace l'ancien « factures.email_message_id unique » (001 du dépôt BTP) :
-- un même courriel n'est recopié qu'une fois par espace et par boîte.
create table if not exists public.courriels_recus (
  id uuid primary key default gen_random_uuid(),
  recu_le timestamptz not null default now(),
  date_courriel timestamptz,
  client text not null check (char_length(btrim(client)) between 1 and 80),
  boite text not null check (char_length(btrim(boite)) between 1 and 200),
  destinataire text check (destinataire is null or char_length(destinataire) <= 300),
  workflow text not null check (char_length(btrim(workflow)) between 1 and 120),
  workflow_id text check (workflow_id is null or char_length(workflow_id) <= 80),
  version_workflow text check (version_workflow is null or char_length(version_workflow) <= 80),
  execution_id text check (execution_id is null or char_length(execution_id) <= 80),
  email_message_id text check (email_message_id is null or char_length(email_message_id) <= 500),
  imap_uid bigint,
  expediteur text check (expediteur is null or char_length(expediteur) <= 320),
  cc text check (cc is null or char_length(cc) <= 1000),
  sujet text check (sujet is null or char_length(sujet) <= 500),
  corps_texte text check (corps_texte is null or char_length(corps_texte) <= 20000),
  pieces_jointes jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces_jointes) = 'array'),
  authentification text not null default 'absente' check (authentification in ('reussie', 'echouee', 'absente')),
  resultat text not null check (resultat in ('accepte', 'expediteur_non_autorise')),
  archive_chemin text check (archive_chemin is null or char_length(archive_chemin) <= 300)
);
select public.poser_socle('courriels_recus');
select public.poser_reflet('courriels_recus');
create unique index if not exists courriels_recus_source_unique on public.courriels_recus (espace_id, source_nom, source_ref);
create index if not exists courriels_recus_boite_idx on public.courriels_recus (espace_id, boite, recu_le);
create index if not exists courriels_recus_message_idx on public.courriels_recus (espace_id, email_message_id) where email_message_id is not null;
create index if not exists courriels_recus_recu_le_idx on public.courriels_recus (espace_id, recu_le);

create or replace function public.courriels_recus_source() returns trigger
language plpgsql as $$
begin
  -- Compatibilité avec les robots d'aujourd'hui, qui n'envoient pas source_nom / source_ref : la boîte et l'identifiant du message.
  new.source_nom := coalesce(nullif(btrim(coalesce(new.source_nom, '')), ''), 'courriel:' || btrim(new.boite));
  new.source_ref := coalesce(nullif(btrim(coalesce(new.source_ref, '')), ''), nullif(btrim(coalesce(new.email_message_id, '')), ''),
                             case when new.imap_uid is not null then 'uid:' || new.imap_uid::text end);
  if new.source_ref is null then
    raise exception 'Courriel : son identifiant dans la boîte (source_ref, email_message_id ou imap_uid) est obligatoire'
      using errcode = 'P0001', detail = 'reflet_sans_source';
  end if;
  return new;
end $$;
drop trigger if exists ab_reflet_source on public.courriels_recus;
create trigger ab_reflet_source before insert on public.courriels_recus for each row execute function public.courriels_recus_source();
drop trigger if exists ab_reflet_copie_le on public.courriels_recus;
create trigger ab_reflet_copie_le before insert on public.courriels_recus for each row execute function public.reflet_copie_le();
drop trigger if exists courriels_recus_ajout_seul on public.courriels_recus;
create trigger courriels_recus_ajout_seul before update on public.courriels_recus for each row execute function public.ajout_seul();

-- Coûts de l'IA (la vérité : OpenRouter et les exécutions n8n). Montants en numeric.
create table if not exists public.couts_ia (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  courriel_id uuid,
  cle_fiche text check (cle_fiche is null or char_length(cle_fiche) <= 500),
  workflow text not null check (char_length(btrim(workflow)) between 1 and 80),
  etape text not null check (char_length(btrim(etape)) between 1 and 80),
  execution_id text check (execution_id is null or char_length(execution_id) <= 80),
  piece_jointe text check (piece_jointe is null or char_length(piece_jointe) <= 300),
  declencheur text check (declencheur is null or declencheur in ('courriel', 'webhook', 'manuel', 'planifie')),
  nb_elements integer check (nb_elements is null or nb_elements >= 0),
  modele text check (modele is null or char_length(modele) <= 120),
  hebergeur text check (hebergeur is null or char_length(hebergeur) <= 80),
  jetons_entree integer check (jetons_entree is null or jetons_entree >= 0),
  jetons_sortie integer check (jetons_sortie is null or jetons_sortie >= 0),
  cle_openrouter text check (cle_openrouter is null or char_length(cle_openrouter) <= 120),
  cout_eur numeric(14,8) check (cout_eur is null or cout_eur >= 0),
  taux_usd_eur numeric(12,6) check (taux_usd_eur is null or taux_usd_eur > 0),
  date_taux date,
  workflow_id text,
  workflow_nom text,
  etiquettes jsonb,
  etiquettes_lues boolean,
  constraint couts_ia_eur_audit_chk check (cout_eur is null or (taux_usd_eur is not null and date_taux is not null)),
  constraint couts_ia_photo_workflow_ok check (
    (workflow_id is null or char_length(btrim(workflow_id)) between 1 and 80)
    and (workflow_nom is null or char_length(btrim(workflow_nom)) between 1 and 200)
    and (etiquettes is null or case when jsonb_typeof(etiquettes) = 'array' then jsonb_array_length(etiquettes) <= 50 else false end)
    and (etiquettes_lues is null or etiquettes_lues = (etiquettes is not null)))
);
select public.poser_socle('couts_ia');
select public.poser_reflet('couts_ia');
alter table public.couts_ia drop constraint if exists couts_ia_courriel_fk;
alter table public.couts_ia add constraint couts_ia_courriel_fk foreign key (espace_id, courriel_id) references public.courriels_recus (espace_id, id);
create unique index if not exists couts_ia_source_unique on public.couts_ia (espace_id, source_nom, source_ref);
create index if not exists couts_ia_cle_fiche_idx on public.couts_ia (espace_id, cle_fiche) where cle_fiche is not null;
create index if not exists couts_ia_courriel_idx on public.couts_ia (espace_id, courriel_id) where courriel_id is not null;
create index if not exists couts_ia_cree_le_idx on public.couts_ia (espace_id, cree_le);
create index if not exists couts_ia_workflow_id_idx on public.couts_ia (espace_id, workflow_id, cree_le) where workflow_id is not null;
create index if not exists couts_ia_workflow_idx on public.couts_ia (espace_id, workflow, cree_le);

create or replace function public.couts_ia_source() returns trigger
language plpgsql as $$
begin
  new.source_nom := coalesce(nullif(btrim(coalesce(new.source_nom, '')), ''), 'n8n:' || btrim(new.workflow));
  -- À VALIDER PAR JÉRÔME : le robot devrait envoyer l'identifiant de l'appel chez OpenRouter (source_ref) ; sans lui, un identifiant
  -- unique est fabriqué ici et le doublon de recopie n'est plus détecté pour cette ligne.
  new.source_ref := coalesce(nullif(btrim(coalesce(new.source_ref, '')), ''),
                             coalesce(new.execution_id, 'sans-execution') || ':' || btrim(new.etape) || ':' || gen_random_uuid()::text);
  return new;
end $$;
drop trigger if exists ab_reflet_source on public.couts_ia;
create trigger ab_reflet_source before insert on public.couts_ia for each row execute function public.couts_ia_source();
drop trigger if exists ab_reflet_copie_le on public.couts_ia;
create trigger ab_reflet_copie_le before insert on public.couts_ia for each row execute function public.reflet_copie_le();
drop trigger if exists couts_ia_ajout_seul on public.couts_ia;
create trigger couts_ia_ajout_seul before update on public.couts_ia for each row execute function public.ajout_seul();

-- Journal des exécutions n8n (la vérité : n8n).
create table if not exists public.n8n_executions (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  workflow_id text not null check (char_length(btrim(workflow_id)) between 1 and 80),
  workflow_nom text not null check (char_length(btrim(workflow_nom)) between 1 and 200),
  etiquettes jsonb check (etiquettes is null or case when jsonb_typeof(etiquettes) = 'array' then jsonb_array_length(etiquettes) <= 50 else false end),
  etiquettes_lues boolean not null default false,
  pour_qui_manquant boolean,
  execution_id text check (execution_id is null or char_length(execution_id) <= 80),
  declencheur text check (declencheur is null or declencheur in ('courriel', 'webhook', 'manuel', 'planifie', 'autre')),
  resultat text not null check (resultat in ('ok', 'refus', 'erreur', 'inconnu', 'erreur_journal')),
  nb_appels_ia integer not null default 0 check (nb_appels_ia >= 0),
  test boolean not null default false,
  constraint n8n_executions_etiquettes_coherentes check (etiquettes_lues = (etiquettes is not null)),
  constraint n8n_executions_pour_qui_coherent check (coalesce(
    case when etiquettes is null then pour_qui_manquant is null
         else pour_qui_manquant = (not jsonb_path_exists(etiquettes, '$[*] ? (@ like_regex "^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$")'))
    end, false))
);
select public.poser_socle('n8n_executions');
select public.poser_reflet('n8n_executions');
create unique index if not exists n8n_executions_source_unique on public.n8n_executions (espace_id, source_nom, source_ref);
create index if not exists n8n_executions_cree_le_idx on public.n8n_executions (espace_id, cree_le);
create index if not exists n8n_executions_execution_idx on public.n8n_executions (espace_id, execution_id) where execution_id is not null;
create index if not exists n8n_executions_workflow_idx on public.n8n_executions (espace_id, workflow_id, cree_le);

create or replace function public.n8n_executions_source() returns trigger
language plpgsql as $$
begin
  new.source_nom := coalesce(nullif(btrim(coalesce(new.source_nom, '')), ''), 'n8n:' || btrim(new.workflow_id));
  -- Une exécution n8n n'est recopiée qu'une fois ; sans numéro d'exécution (cas rare d'aujourd'hui), un identifiant unique est fabriqué (à valider par Jérôme).
  new.source_ref := coalesce(nullif(btrim(coalesce(new.source_ref, '')), ''), nullif(btrim(coalesce(new.execution_id, '')), ''), 'sans-execution:' || gen_random_uuid()::text);
  return new;
end $$;
drop trigger if exists ab_reflet_source on public.n8n_executions;
create trigger ab_reflet_source before insert on public.n8n_executions for each row execute function public.n8n_executions_source();
drop trigger if exists ab_reflet_copie_le on public.n8n_executions;
create trigger ab_reflet_copie_le before insert on public.n8n_executions for each row execute function public.reflet_copie_le();
drop trigger if exists n8n_executions_ajout_seul on public.n8n_executions;
create trigger n8n_executions_ajout_seul before update on public.n8n_executions for each row execute function public.ajout_seul();

-- Relevés des plafonds des clés OpenRouter (la vérité : OpenRouter).
create table if not exists public.openrouter_cles_releves (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now(),
  releve_le timestamptz not null default date_trunc('hour', now()),
  jour_utc date not null default ((now() at time zone 'utc')::date),
  cle_nom text not null check (char_length(btrim(cle_nom)) between 1 and 120),
  limite_fournisseur numeric check (limite_fournisseur is null or limite_fournisseur >= 0),
  devise_fournisseur text not null default 'USD' check (devise_fournisseur = 'USD'),
  remise_limite text check (remise_limite is null or remise_limite in ('daily', 'weekly', 'monthly')),
  depense_jour_eur numeric check (depense_jour_eur is null or depense_jour_eur >= 0),
  depense_semaine_eur numeric check (depense_semaine_eur is null or depense_semaine_eur >= 0),
  depense_mois_eur numeric check (depense_mois_eur is null or depense_mois_eur >= 0),
  depense_totale_eur numeric check (depense_totale_eur is null or depense_totale_eur >= 0),
  desactivee boolean not null default false,
  taux_usd_eur numeric check (taux_usd_eur is null or taux_usd_eur > 0),
  date_taux date,
  test boolean not null default false,
  constraint openrouter_cles_releves_taux_et_date check ((taux_usd_eur is null) = (date_taux is null))
);
select public.poser_socle('openrouter_cles_releves');
select public.poser_reflet('openrouter_cles_releves');
create unique index if not exists openrouter_cles_releves_source_unique on public.openrouter_cles_releves (espace_id, source_nom, source_ref);
create unique index if not exists openrouter_cles_releves_un_par_releve on public.openrouter_cles_releves (espace_id, releve_le, cle_nom);
create index if not exists openrouter_cles_releves_cle_releve_idx on public.openrouter_cles_releves (espace_id, cle_nom, releve_le desc);

create or replace function public.openrouter_cles_releves_source() returns trigger
language plpgsql as $$
begin
  new.source_nom := coalesce(nullif(btrim(coalesce(new.source_nom, '')), ''), 'openrouter');
  new.source_ref := coalesce(nullif(btrim(coalesce(new.source_ref, '')), ''), btrim(new.cle_nom) || '@' || to_char(new.releve_le at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  return new;
end $$;
drop trigger if exists ab_reflet_source on public.openrouter_cles_releves;
create trigger ab_reflet_source before insert on public.openrouter_cles_releves for each row execute function public.openrouter_cles_releves_source();
drop trigger if exists ab_reflet_copie_le on public.openrouter_cles_releves;
create trigger ab_reflet_copie_le before insert on public.openrouter_cles_releves for each row execute function public.reflet_copie_le();
drop trigger if exists openrouter_cles_releves_ajout_seul on public.openrouter_cles_releves;
create trigger openrouter_cles_releves_ajout_seul before update on public.openrouter_cles_releves for each row execute function public.ajout_seul();
