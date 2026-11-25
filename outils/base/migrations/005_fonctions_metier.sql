-- 005 : les fonctions métier, reprises du dépôt BTP (état final après 034) avec les MÊMES noms et les MÊMES paramètres.
-- Changements communs (pour toutes) :
--   * plus aucune fonction SECURITY DEFINER : chaque fonction s'exécute avec les droits de l'appelant (porte, robot_reflets),
--     donc la sécurité par ligne de l'espace s'applique aussi à l'intérieur des fonctions (rien ne déborde sur un autre espace) ;
--   * plus de DELETE : « effacer » = archiver (archive_le), dans les tables *_tous ou favoris ;
--   * les « on conflict (…) » visent les nouvelles unicités qui commencent par espace_id ;
--   * plus de auth.uid() / auth.jwt() (Supabase) : l'identité vient de app.utilisateur, posé par la porte ;
--   * « select … from factures … for update » verrouille factures_identite (la vue factures ne se verrouille pas).

-- Identité de l'appelant (C1 : n'est plus le badge Firebase ni Supabase, mais ce que la porte a posé).
-- utilisateur devient un texte (avant : uuid de Supabase).
create or replace function public.identite_appelant()
returns table(courriel text, espace text, utilisateur text, origine text)
language sql stable
set search_path = public, pg_temp as $$
  select case when public.utilisateur_courant() like '%@%' then lower(public.utilisateur_courant()) end,
         public.espace_courant(), public.utilisateur_courant(), 'porte'::text
  where public.utilisateur_courant() is not null and public.espace_courant() is not null
$$;

-- ---------------------------------------------------------------- Factures
create or replace function public.archiver_facture(p_facture_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_statut public.statut_facture; v_archivee timestamptz;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Archivage : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  select f.statut, f.archivee_le into v_statut, v_archivee from public.factures f where f.id = p_facture_id;
  if not found then
    raise exception 'Facture introuvable : %', p_facture_id using errcode = 'P0001', detail = 'facture_introuvable';
  end if;
  if v_statut = 'a_valider' then
    raise exception 'Archivage refusé : seule une facture déjà acceptée ou refusée peut être archivée' using errcode = 'P0001', detail = 'archivage_facture_non_decidee';
  end if;
  if v_archivee is not null then
    raise exception 'Archivage refusé : la facture est déjà archivée' using errcode = 'P0001', detail = 'archivage_deja_fait';
  end if;
  perform set_config('app.archive_qui_id', coalesce(p_qui_id::text, ''), true);
  update public.factures set archivee_le = now(), archivee_par = btrim(p_qui) where id = p_facture_id;
  perform set_config('app.archive_qui_id', '', true);
end $$;

create or replace function public.desarchiver_facture(p_facture_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_archivee timestamptz;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Désarchivage : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  select f.archivee_le into v_archivee from public.factures f where f.id = p_facture_id;
  if not found then
    raise exception 'Facture introuvable : %', p_facture_id using errcode = 'P0001', detail = 'facture_introuvable';
  end if;
  if v_archivee is null then
    raise exception 'Désarchivage refusé : la facture n''est pas archivée' using errcode = 'P0001', detail = 'facture_non_archivee';
  end if;
  perform set_config('app.desarchive_qui', btrim(p_qui), true);
  perform set_config('app.desarchive_qui_id', coalesce(p_qui_id::text, ''), true);
  update public.factures set archivee_le = null, archivee_par = null where id = p_facture_id;
  perform set_config('app.desarchive_qui', '', true);
  perform set_config('app.desarchive_qui_id', '', true);
end $$;

create or replace function public.relier_facture_chantier(p_facture_id uuid, p_chantier_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_f public.factures%rowtype; v_ch_statut public.statut_chantier; v_ch_archive boolean;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Liaison : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if p_chantier_id is null then
    raise exception 'Liaison refusée : choisis un chantier' using errcode = 'P0001', detail = 'chantier_obligatoire';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  select * into v_f from public.factures f where f.id = p_facture_id;
  if not found then
    raise exception 'Facture introuvable : %', p_facture_id using errcode = 'P0001', detail = 'facture_introuvable';
  end if;
  if v_f.statut <> 'acceptee' then
    raise exception 'Liaison refusée : seule une facture acceptée se relie à un chantier après coup' using errcode = 'P0001', detail = 'liaison_facture_non_acceptee';
  end if;
  if v_f.archivee_le is not null then
    raise exception 'Liaison refusée : la facture est archivée, sors-la d''abord des archives' using errcode = 'P0001', detail = 'liaison_facture_archivee';
  end if;
  if v_f.chantier_id is not null then
    raise exception 'Liaison refusée : la facture est déjà reliée à un chantier (pour la changer, rouvre-la puis accepte-la de nouveau)' using errcode = 'P0001', detail = 'facture_deja_reliee';
  end if;
  select c.statut, c.archive into v_ch_statut, v_ch_archive from public.chantiers c where c.id = p_chantier_id for share;
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
  perform set_config('app.lien_chantier_facture', p_facture_id::text, true);
  update public.factures set chantier_id = p_chantier_id where id = p_facture_id;
  perform set_config('app.lien_chantier_facture', '', true);
  perform public.journaliser_modification('factures', p_facture_id, 'relier_chantier', p_qui, p_qui_id,
    jsonb_build_object('chantier_id', null), jsonb_build_object('chantier_id', p_chantier_id));
end $$;

-- Réouverture (012) : une décision « rouverte » s'AJOUTE (rien n'est effacé) ; agence, fournisseur et chantier sont remis à vide ;
-- les liens des lignes vers les articles sont archivés ; les clés reviennent à celles lues (si aucune autre facture ne les porte).
create or replace function public.rouvrir_facture(p_facture_id uuid, p_motif text, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_f public.factures%rowtype; v_motif text := btrim(coalesce(p_motif, '')); v_avant jsonb;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Réouverture : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if char_length(v_motif) < 3 or char_length(v_motif) > 500 then
    raise exception 'Réouverture refusée : le motif est obligatoire (3 à 500 caractères)' using errcode = 'P0001', detail = 'motif_obligatoire';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  select * into v_f from public.factures f where f.id = p_facture_id;
  if not found then
    raise exception 'Facture introuvable : %', p_facture_id using errcode = 'P0001', detail = 'facture_introuvable';
  end if;
  if v_f.statut = 'a_valider' then
    raise exception 'Réouverture refusée : la facture n''est pas encore décidée' using errcode = 'P0001', detail = 'facture_non_decidee';
  end if;
  if v_f.archivee_le is not null then
    raise exception 'Réouverture refusée : la facture est archivée, sortez-la d''abord des archives' using errcode = 'P0001', detail = 'rouverture_facture_archivee';
  end if;
  v_avant := jsonb_build_object(
    'statut', v_f.statut, 'chantier_id', v_f.chantier_id, 'etablissement_id', v_f.etablissement_id, 'fournisseur_id', v_f.fournisseur_id,
    'fournisseur_siren', v_f.fournisseur_siren, 'date_decision', v_f.date_decision, 'decide_par', v_f.decide_par, 'decide_par_id', v_f.decide_par_id,
    'motif_refus', v_f.motif_refus, 'acceptee_malgre_alerte', v_f.acceptee_malgre_alerte, 'alertes_a_la_decision', v_f.alertes_a_la_decision,
    'motif_acceptation', v_f.motif_acceptation);
  insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id, motif, ancien_statut)
  values (p_facture_id, 'rouverte', btrim(p_qui), p_qui_id, v_motif, v_f.statut::text);
  update public.factures_identite set chantier_id = null, etablissement_id = null, fournisseur_id = null where id = p_facture_id;
  update public.lignes_facture_articles a set archive_le = now()
   where a.archive_le is null and a.ligne_id in (select l.id from public.lignes_facture_lues l where l.facture_id = p_facture_id);
  perform public.factures_recaler_cles(p_facture_id);
  perform public.journaliser_modification('factures', p_facture_id, 'rouvrir', p_qui, p_qui_id, v_avant,
    jsonb_build_object('statut', 'a_valider', 'motif', v_motif));
end $$;

-- Lignes : plus de recalcul stocké (lignes_etat et lignes_somme_ht sont calculés par la vue factures). Gardée pour les robots qui l'appellent.
create or replace function public.recalculer_lignes_facture(p_facture_id uuid) returns void
language plpgsql
set search_path = public, pg_temp as $$
begin
  return;   -- volontairement vide : le calcul vit dans la vue factures (toujours à jour)
end $$;

create or replace function public.remplacer_lignes_facture(p_facture_id uuid, p_lignes jsonb, p_qui text, p_qui_id uuid default null)
returns integer language plpgsql
set search_path = public, pg_temp as $$
declare v_avant jsonb; v_n integer; v_scan uuid;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Lignes : l''identité de la personne (qui) est obligatoire';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Lignes : un tableau JSON est attendu';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  if not found then raise exception 'Facture introuvable : %', p_facture_id; end if;
  if public.statut_de_facture(p_facture_id) <> 'a_valider' then
    raise exception 'Facture déjà décidée : ses lignes ne peuvent plus changer';
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.position), '[]'::jsonb) into v_avant from public.lignes_facture l where l.facture_id = p_facture_id;
  -- Les anciennes lignes et leurs liens sont ARCHIVÉS (jamais effacés).
  update public.lignes_facture_articles a set archive_le = now()
   where a.archive_le is null and a.ligne_id in (select l.id from public.lignes_facture_lues l where l.facture_id = p_facture_id and l.archive_le is null);
  update public.lignes_facture_lues set archive_le = now() where facture_id = p_facture_id and archive_le is null;
  select s.id into v_scan from public.factures_scans s where s.facture_id = p_facture_id order by s.rang desc limit 1;
  insert into public.lignes_facture_lues
    (facture_id, scan_id, position, reference_fournisseur, designation, quantite, unite, prix_unitaire_ht, remise_pct, montant_ht, taux_tva)
  select p_facture_id, v_scan, e.ord::integer,
         nullif(btrim(e.val ->> 'reference_fournisseur'), ''),
         e.val ->> 'designation',
         nullif(e.val ->> 'quantite', '')::numeric,
         nullif(btrim(e.val ->> 'unite'), ''),
         nullif(e.val ->> 'prix_unitaire_ht', '')::numeric,
         nullif(e.val ->> 'remise_pct', '')::numeric,
         nullif(e.val ->> 'montant_ht', '')::numeric,
         nullif(e.val ->> 'taux_tva', '')::numeric
  from jsonb_array_elements(p_lignes) with ordinality as e(val, ord);
  get diagnostics v_n = row_count;
  perform public.journaliser_modification('lignes_facture', p_facture_id, 'remplacement des lignes', p_qui, p_qui_id, v_avant, p_lignes);
  return v_n;
end $$;

-- Trouve ou crée l'article du fournisseur pour une ligne (partie commune aux deux rattachements, reprise de 010 / 011).
create or replace function public.article_pour_ligne(p_four uuid, p_ref_fournisseur text, p_designation text, p_unite text,
                                                     p_designation_normalisee text, p_unite_normalisee text, p_qui text, p_qui_id uuid)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare v_ref text := public.normaliser_reference(p_ref_fournisseur); v_art uuid;
begin
  if v_ref is not null then
    select a.id into v_art from public.articles_fournisseur a where a.fournisseur_id = p_four and a.reference_normalisee = v_ref;
  else
    select a.id into v_art from public.articles_fournisseur a
      where a.fournisseur_id = p_four and a.reference_normalisee is null
        and a.designation_normalisee = p_designation_normalisee and a.unite_normalisee = p_unite_normalisee;
  end if;
  if v_art is not null then return v_art; end if;
  insert into public.articles_fournisseur (fournisseur_id, reference, designation, unite)
  values (p_four, p_ref_fournisseur, p_designation, p_unite)
  on conflict do nothing
  returning id into v_art;
  if v_art is not null then
    perform public.journaliser_modification('articles_fournisseur', v_art, 'creation', p_qui, p_qui_id, null,
      jsonb_build_object('fournisseur_id', p_four, 'reference', p_ref_fournisseur, 'designation', p_designation, 'unite', p_unite));
    return v_art;
  end if;
  if v_ref is not null then   -- filet : une autre transaction l'a créé entre-temps
    select a.id into v_art from public.articles_fournisseur a where a.fournisseur_id = p_four and a.reference_normalisee = v_ref;
  else
    select a.id into v_art from public.articles_fournisseur a
      where a.fournisseur_id = p_four and a.reference_normalisee is null
        and a.designation_normalisee = p_designation_normalisee and a.unite_normalisee = p_unite_normalisee;
  end if;
  return v_art;
end $$;

create or replace function public.rattacher_lignes_facture(p_facture_id uuid, p_qui text, p_qui_id uuid default null)
returns integer language plpgsql
set search_path = public, pg_temp as $$
declare v_statut public.statut_facture; v_four uuid; v_n integer := 0; l record; v_art uuid;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Rattachement : l''identité de la personne (qui) est obligatoire';
  end if;
  perform 1 from public.factures_identite where id = p_facture_id for update;
  select f.statut, f.fournisseur_id into v_statut, v_four from public.factures f where f.id = p_facture_id;
  if not found then raise exception 'Facture introuvable : %', p_facture_id; end if;
  if v_statut <> 'a_valider' then
    raise exception 'Rattachement impossible : la facture est déjà décidée (à faire avant l''acceptation)';
  end if;
  if v_four is null then
    raise exception 'Rattachement impossible : le fournisseur de la facture est inconnu';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('articles:' || v_four::text, 0));
  for l in select * from public.lignes_facture where facture_id = p_facture_id and article_fournisseur_id is null order by position loop
    v_art := public.article_pour_ligne(v_four, l.reference_fournisseur, l.designation, l.unite, l.designation_normalisee, l.unite_normalisee, p_qui, p_qui_id);
    perform public.lier_ligne_article(l.id, v_art);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.rattacher_lignes_facture_interne(p_facture_id uuid, p_four uuid, p_qui text, p_qui_id uuid)
returns integer language plpgsql
set search_path = public, pg_temp as $$
declare v_n integer := 0; l record; v_art uuid;
begin
  if p_four is null then
    raise exception 'Acceptation annulée : rattachement des lignes impossible (fournisseur inconnu)' using errcode = 'P0001', detail = 'rattachement_impossible';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('articles:' || p_four::text, 0));
  perform set_config('app.rattachement_interne', p_facture_id::text, true);
  for l in select * from public.lignes_facture where facture_id = p_facture_id order by position loop
    v_art := public.article_pour_ligne(p_four, l.reference_fournisseur, l.designation, l.unite, l.designation_normalisee, l.unite_normalisee, p_qui, p_qui_id);
    if v_art is null then
      raise exception 'Acceptation annulée : rattachement impossible de la ligne % (article introuvable)', l.position
        using errcode = 'P0001', detail = 'rattachement_impossible';
    end if;
    perform public.lier_ligne_article(l.id, v_art);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.rattachement_interne', '', true);
  if v_n > 0 then
    perform public.journaliser_modification('lignes_facture', p_facture_id, 'rattachement a l''acceptation', p_qui, p_qui_id, null,
      jsonb_build_object('lignes_rattachees', v_n, 'fournisseur_id', p_four));
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- IBAN
create or replace function public.recalculer_statut_fournisseur(p_id uuid, p_qui text, p_qui_id uuid)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_avant text; v_apres text;
begin
  select f.statut into v_avant from public.fournisseurs f where f.id = p_id;
  v_apres := case when exists (select 1 from public.ibans_confirmes c where c.fournisseur_id = p_id and c.revoque_le is null) then 'verifie' else 'a_verifier' end;
  if v_avant is distinct from v_apres then
    update public.fournisseurs set statut = v_apres where id = p_id;
    perform public.journaliser_modification('fournisseurs', p_id, 'statut', p_qui, p_qui_id, jsonb_build_object('statut', v_avant), jsonb_build_object('statut', v_apres));
  end if;
end $$;

create or replace function public.confirmer_iban(p_fournisseur_id uuid, p_iban text, p_facture_id uuid, p_moyen text, p_qui text, p_qui_id uuid default null)
returns table(iban_id uuid, existait boolean) language plpgsql
set search_path = public, pg_temp as $$
declare
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '[^A-Za-z0-9]', '', 'g'));
  v_moyen text := btrim(coalesce(p_moyen, ''));
  v_four public.fournisseurs%rowtype;
  v_f public.factures%rowtype;
  v_exist public.ibans_confirmes%rowtype;
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Confirmation : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if not public.iban_valide(v_iban) then
    raise exception 'Cet IBAN n''est pas valide (il a peut-être été mal lu) : il ne peut pas être confirmé' using errcode = 'P0001', detail = 'iban_invalide';
  end if;
  if char_length(v_moyen) < 3 or char_length(v_moyen) > 500 then
    raise exception 'Dis comment tu as vérifié cet IBAN (de 3 à 500 caractères)' using errcode = 'P0001', detail = 'moyen_verification_obligatoire';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('iban:' || public.espace_obligatoire() || ':' || v_iban, 0));
  perform 1 from public.factures_identite where id = p_facture_id for share;
  select * into v_f from public.factures f where f.id = p_facture_id;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0001', detail = 'facture_introuvable';
  end if;
  select * into v_four from public.fournisseurs f where f.id = p_fournisseur_id for update;
  if not found then
    raise exception 'Fournisseur introuvable' using errcode = 'P0001', detail = 'fournisseur_introuvable';
  end if;
  if v_four.siren is null then
    raise exception 'Ce fournisseur n''a pas de SIREN connu : son IBAN ne peut pas être confirmé' using errcode = 'P0001', detail = 'fournisseur_sans_siren';
  end if;
  if v_f.statut = 'refusee' then
    raise exception 'Une facture refusée ne peut pas servir à confirmer un IBAN' using errcode = 'P0001', detail = 'facture_refusee';
  end if;
  if v_f.iban_normalise is distinct from v_iban then
    raise exception 'L''IBAN de cette facture n''est pas celui que tu confirmes' using errcode = 'P0001', detail = 'facture_iban_different';
  end if;
  if v_f.fournisseur_siren is distinct from v_four.siren then
    raise exception 'Cette facture n''est pas celle de ce fournisseur' using errcode = 'P0001', detail = 'facture_fournisseur_different';
  end if;
  select * into v_exist from public.ibans_confirmes c where c.iban = v_iban and c.revoque_le is null;
  if found then
    if v_exist.siren = v_four.siren then
      return query select v_exist.id, true;
      return;
    end if;
    raise exception 'Cet IBAN est déjà confirmé pour un autre fournisseur : appelle avant toute chose' using errcode = 'P0001', detail = 'iban_deja_confirme_ailleurs';
  end if;
  insert into public.ibans_confirmes (fournisseur_id, siren, iban, facture_id, moyen_verification, confirme_par, confirme_par_id)
  values (v_four.id, v_four.siren, v_iban, p_facture_id, v_moyen, btrim(p_qui), p_qui_id)
  returning id into v_id;
  perform public.journaliser_modification('ibans_confirmes', v_id, 'confirmer', p_qui, p_qui_id, null,
    jsonb_build_object('fournisseur_id', v_four.id, 'siren', v_four.siren, 'iban', v_iban, 'facture_id', p_facture_id, 'moyen_verification', v_moyen));
  perform public.recalculer_statut_fournisseur(v_four.id, p_qui, p_qui_id);
  return query select v_id, false;
end $$;

create or replace function public.revoquer_iban(p_id uuid, p_motif text, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_motif text := btrim(coalesce(p_motif, '')); v_iban text; v_c public.ibans_confirmes%rowtype;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Révocation : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if char_length(v_motif) < 3 or char_length(v_motif) > 500 then
    raise exception 'Explique pourquoi tu révoques cet IBAN (de 3 à 500 caractères)' using errcode = 'P0001', detail = 'motif_revocation_obligatoire';
  end if;
  select c.iban into v_iban from public.ibans_confirmes c where c.id = p_id;
  if v_iban is null then
    raise exception 'Cet IBAN confirmé est introuvable' using errcode = 'P0001', detail = 'iban_confirme_introuvable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('iban:' || public.espace_obligatoire() || ':' || v_iban, 0));
  select * into v_c from public.ibans_confirmes c where c.id = p_id for update;
  perform 1 from public.fournisseurs f where f.id = v_c.fournisseur_id for update;
  if v_c.revoque_le is not null then
    raise exception 'Cet IBAN est déjà révoqué' using errcode = 'P0001', detail = 'iban_deja_revoque';
  end if;
  perform set_config('app.revocation_iban', p_id::text, true);
  update public.ibans_confirmes set revoque_le = now(), revoque_par = btrim(p_qui), revoque_par_id = p_qui_id, motif_revocation = v_motif where id = p_id;
  perform set_config('app.revocation_iban', '', true);
  perform public.journaliser_modification('ibans_confirmes', p_id, 'revoquer', p_qui, p_qui_id,
    jsonb_build_object('iban', v_c.iban, 'siren', v_c.siren, 'confirme_par', v_c.confirme_par, 'confirme_le', v_c.confirme_le),
    jsonb_build_object('motif_revocation', v_motif));
  perform public.recalculer_statut_fournisseur(v_c.fournisseur_id, p_qui, p_qui_id);
end $$;

-- ---------------------------------------------------------------- Fournisseurs et agences
create or replace function public.creer_agence_et_fournisseur(p_siret text, p_siren text, p_nom_fournisseur text, p_nom_agence text, p_ville text, p_qui text, p_qui_id uuid default null)
returns table(agence_id uuid, entreprise_id uuid, existait boolean) language plpgsql
set search_path = public, pg_temp as $$
declare
  v_siret text := nullif(regexp_replace(coalesce(p_siret, ''), '\D', '', 'g'), '');
  v_siren text := nullif(regexp_replace(coalesce(p_siren, ''), '\D', '', 'g'), '');
  v_nom_f text := nullif(btrim(coalesce(p_nom_fournisseur, '')), '');
  v_nom_a text := nullif(btrim(coalesce(p_nom_agence, '')), '');
  v_ville text := nullif(btrim(coalesce(p_ville, '')), '');
  v_four uuid; v_agence uuid; v_cree_f boolean := false;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Création d''agence : l''identité de la personne (qui) est obligatoire';
  end if;
  if v_siret is not null and length(v_siret) <> 14 then
    raise exception 'SIRET invalide (14 chiffres attendus) : %', p_siret;
  end if;
  if v_siren is not null and length(v_siren) <> 9 then
    raise exception 'SIREN invalide (9 chiffres attendus) : %', p_siren;
  end if;
  if v_siret is not null then
    if v_siren is not null and v_siren <> left(v_siret, 9) then
      raise exception 'Le SIRET % ne commence pas par le SIREN %', v_siret, v_siren;
    end if;
    v_siren := left(v_siret, 9);
  end if;
  if v_siren is not null and not public.luhn_valide(v_siren) then
    raise exception 'SIREN % : clé de contrôle fausse', v_siren;
  end if;
  if v_siren is null and v_nom_f is null then
    raise exception 'Sans SIRET ni SIREN, le nom du fournisseur est obligatoire';
  end if;
  if v_siret is null and v_nom_a is null then
    raise exception 'Sans SIRET, le nom de l''agence est obligatoire';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fournisseur:' || public.espace_obligatoire() || ':' || coalesce(v_siren, 'nom:' || public.normaliser_texte(v_nom_f)), 0));
  if v_siret is not null then
    select e.id, e.fournisseur_id into v_agence, v_four from public.etablissements_fournisseur e where e.siret = v_siret;
    if found then
      select coalesce(e.fusionne_dans, e.id) into v_agence from public.etablissements_fournisseur e where e.id = v_agence;
      return query select v_agence, v_four, true;
      return;
    end if;
  end if;
  if v_siren is not null then
    select f.id into v_four from public.fournisseurs f where f.siren = v_siren;
  else
    select f.id into v_four from public.fournisseurs f
      where f.siren is null and public.normaliser_texte(f.nom) = public.normaliser_texte(v_nom_f)
      order by f.created_at, f.id limit 1;
  end if;
  if v_four is null then
    insert into public.fournisseurs (siren, nom, statut, cree_par)
    values (v_siren, coalesce(v_nom_f, 'Fournisseur ' || v_siren), 'a_verifier', p_qui)
    on conflict do nothing
    returning id into v_four;
    v_cree_f := v_four is not null;
    if v_four is null then
      select f.id into v_four from public.fournisseurs f where f.siren = v_siren;
    end if;
    if v_cree_f then
      perform public.journaliser_modification('fournisseurs', v_four, 'creation', p_qui, p_qui_id, null,
        jsonb_build_object('siren', v_siren, 'nom', coalesce(v_nom_f, 'Fournisseur ' || v_siren), 'statut', 'a_verifier'));
    end if;
  end if;
  if v_siret is null then
    select e.id into v_agence from public.etablissements_fournisseur e
      where e.fournisseur_id = v_four and e.siret is null
        and e.nom_normalise = public.normaliser_texte(v_nom_a) and e.ville_normalisee = public.normaliser_texte(v_ville);
    if found then
      select coalesce(e.fusionne_dans, e.id) into v_agence from public.etablissements_fournisseur e where e.id = v_agence;
      return query select v_agence, v_four, true;
      return;
    end if;
  end if;
  insert into public.etablissements_fournisseur (fournisseur_id, siret, nom_agence, ville)
  values (v_four, v_siret, v_nom_a, v_ville)
  on conflict do nothing
  returning id into v_agence;
  if v_agence is null then
    if v_siret is not null then
      select e.id into v_agence from public.etablissements_fournisseur e where e.siret = v_siret;
    else
      select e.id into v_agence from public.etablissements_fournisseur e
        where e.fournisseur_id = v_four and e.siret is null
          and e.nom_normalise = public.normaliser_texte(v_nom_a) and e.ville_normalisee = public.normaliser_texte(v_ville);
    end if;
    select coalesce(e.fusionne_dans, e.id) into v_agence from public.etablissements_fournisseur e where e.id = v_agence;
    return query select v_agence, v_four, true;
    return;
  end if;
  perform public.journaliser_modification('etablissements_fournisseur', v_agence, 'creation', p_qui, p_qui_id, null,
    jsonb_build_object('fournisseur_id', v_four, 'siret', v_siret, 'nom_agence', v_nom_a, 'ville', v_ville));
  return query select v_agence, v_four, false;
end $$;

create or replace function public.desactiver_agence(p_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_avant jsonb; v_apres jsonb;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Désactivation d''agence : l''identité de la personne (qui) est obligatoire';
  end if;
  select to_jsonb(e) into v_avant from public.etablissements_fournisseur e where e.id = p_id for update;
  if v_avant is null then raise exception 'Agence introuvable : %', p_id; end if;
  update public.etablissements_fournisseur set actif = false where id = p_id;
  select to_jsonb(e) into v_apres from public.etablissements_fournisseur e where e.id = p_id;
  perform public.journaliser_modification('etablissements_fournisseur', p_id, 'desactivation', p_qui, p_qui_id, v_avant, v_apres);
end $$;

create or replace function public.fusionner_agence(p_id uuid, p_dans uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_avant jsonb; v_apres jsonb;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Fusion d''agence : l''identité de la personne (qui) est obligatoire';
  end if;
  if p_dans is null then raise exception 'Fusion d''agence : l''agence cible est obligatoire'; end if;
  perform 1 from public.etablissements_fournisseur where id in (p_id, p_dans) order by id for update;
  select to_jsonb(e) into v_avant from public.etablissements_fournisseur e where e.id = p_id;
  if v_avant is null then raise exception 'Agence introuvable : %', p_id; end if;
  update public.etablissements_fournisseur set fusionne_dans = p_dans, actif = false where id = p_id;
  select to_jsonb(e) into v_apres from public.etablissements_fournisseur e where e.id = p_id;
  perform public.journaliser_modification('etablissements_fournisseur', p_id, 'fusion', p_qui, p_qui_id, v_avant, v_apres);
end $$;

-- ---------------------------------------------------------------- Chantiers
create or replace function public.creer_chantier(p_nom text, p_code text, p_client text, p_adresse text, p_budget_ht numeric, p_statut text,
                                                 p_date_debut date, p_date_fin_prevue date, p_qui text, p_qui_id uuid default null)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid; v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Chantier : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if char_length(btrim(coalesce(p_nom, ''))) = 0 then
    raise exception 'Chantier : le nom est obligatoire' using errcode = 'P0001', detail = 'chantier_nom_obligatoire';
  end if;
  if p_statut is not null and p_statut not in ('en_preparation', 'en_cours', 'termine', 'suspendu') then
    raise exception 'Chantier : statut inconnu (%)', p_statut using errcode = 'P0001', detail = 'chantier_statut_invalide';
  end if;
  if coalesce(p_budget_ht, 0) < 0 then
    raise exception 'Chantier : le budget ne peut pas être négatif' using errcode = 'P0001', detail = 'chantier_budget_invalide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chantiers:code:' || public.espace_obligatoire(), 0));
  if v_code is not null and exists (select 1 from public.chantiers c where upper(c.code) = upper(v_code)) then
    raise exception 'Chantier : le code % est déjà pris', v_code using errcode = 'P0001', detail = 'chantier_code_deja_pris';
  end if;
  insert into public.chantiers (nom, code, client, adresse, budget_ht, statut, date_debut, date_fin_prevue)
  values (btrim(p_nom), v_code, nullif(btrim(coalesce(p_client, '')), ''), nullif(btrim(coalesce(p_adresse, '')), ''),
          coalesce(p_budget_ht, 0), coalesce(p_statut, 'en_cours')::public.statut_chantier, p_date_debut, p_date_fin_prevue)
  returning id into v_id;
  perform public.journaliser_modification('chantiers', v_id, 'creation', p_qui, p_qui_id, null,
    (select to_jsonb(c) from public.chantiers c where c.id = v_id));
  return v_id;
end $$;

create or replace function public.modifier_chantier(p_id uuid, p_champs jsonb, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_avant jsonb; v_inconnue text; v_code text;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Chantier : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if p_champs is null or jsonb_typeof(p_champs) <> 'object' then
    raise exception 'Chantier : un objet JSON est attendu' using errcode = 'P0001', detail = 'chantier_champs_invalides';
  end if;
  select k into v_inconnue from jsonb_object_keys(p_champs) k
    where k <> all (array['nom', 'code', 'client', 'adresse', 'budget_ht', 'statut', 'date_debut', 'date_fin_prevue', 'date_fin_reelle', 'archive']) limit 1;
  if v_inconnue is not null then
    raise exception 'Chantier : champ inconnu (%)', v_inconnue using errcode = 'P0001', detail = 'chantier_champ_inconnu';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('chantiers:code:' || public.espace_obligatoire(), 0));
  select to_jsonb(c) into v_avant from public.chantiers c where c.id = p_id for update;
  if v_avant is null then
    raise exception 'Chantier introuvable : %', p_id using errcode = 'P0001', detail = 'chantier_introuvable';
  end if;
  begin
    if p_champs ? 'budget_ht' then perform (p_champs ->> 'budget_ht')::numeric; end if;
    if p_champs ? 'archive' then perform (p_champs ->> 'archive')::boolean; end if;
    if p_champs ? 'date_debut' then perform (p_champs ->> 'date_debut')::date; end if;
    if p_champs ? 'date_fin_prevue' then perform (p_champs ->> 'date_fin_prevue')::date; end if;
    if p_champs ? 'date_fin_reelle' then perform (p_champs ->> 'date_fin_reelle')::date; end if;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'Chantier : une valeur n''a pas le bon format (nombre, vrai/faux ou date AAAA-MM-JJ attendus)'
      using errcode = 'P0001', detail = 'chantier_champs_invalides';
  end;
  if p_champs ? 'nom' and char_length(btrim(coalesce(p_champs ->> 'nom', ''))) = 0 then
    raise exception 'Chantier : le nom est obligatoire' using errcode = 'P0001', detail = 'chantier_nom_obligatoire';
  end if;
  if p_champs ? 'budget_ht' and (p_champs ->> 'budget_ht' is null or (p_champs ->> 'budget_ht')::numeric < 0) then
    raise exception 'Chantier : le budget est obligatoire et ne peut pas être négatif' using errcode = 'P0001', detail = 'chantier_budget_invalide';
  end if;
  if p_champs ? 'statut' and coalesce(p_champs ->> 'statut', '') not in ('en_preparation', 'en_cours', 'termine', 'suspendu') then
    raise exception 'Chantier : statut inconnu (%)', p_champs ->> 'statut' using errcode = 'P0001', detail = 'chantier_statut_invalide';
  end if;
  if p_champs ? 'date_fin_reelle' and p_champs ->> 'date_fin_reelle' is not null
     and coalesce(p_champs ->> 'statut', v_avant ->> 'statut') <> 'termine' then
    raise exception 'Chantier : la date de fin réelle n''a de sens que pour un chantier terminé'
      using errcode = 'P0001', detail = 'chantier_date_fin_incoherente';
  end if;
  if p_champs ? 'archive' and p_champs ->> 'archive' is null then
    raise exception 'Chantier : « archive » doit être vrai ou faux' using errcode = 'P0001', detail = 'chantier_champs_invalides';
  end if;
  if p_champs ? 'code' then
    v_code := nullif(btrim(coalesce(p_champs ->> 'code', '')), '');
    if v_code is null then
      raise exception 'Chantier : le code ne peut pas être vide' using errcode = 'P0001', detail = 'chantier_code_obligatoire';
    end if;
    if exists (select 1 from public.chantiers c where upper(c.code) = upper(v_code) and c.id <> p_id) then
      raise exception 'Chantier : le code % est déjà pris', v_code using errcode = 'P0001', detail = 'chantier_code_deja_pris';
    end if;
  end if;
  update public.chantiers c set
    nom             = case when p_champs ? 'nom' then btrim(p_champs ->> 'nom') else c.nom end,
    code            = case when p_champs ? 'code' then v_code else c.code end,
    client          = case when p_champs ? 'client' then nullif(btrim(coalesce(p_champs ->> 'client', '')), '') else c.client end,
    adresse         = case when p_champs ? 'adresse' then nullif(btrim(coalesce(p_champs ->> 'adresse', '')), '') else c.adresse end,
    budget_ht       = case when p_champs ? 'budget_ht' then (p_champs ->> 'budget_ht')::numeric else c.budget_ht end,
    statut          = case when p_champs ? 'statut' then (p_champs ->> 'statut')::public.statut_chantier else c.statut end,
    date_debut      = case when p_champs ? 'date_debut' then (p_champs ->> 'date_debut')::date else c.date_debut end,
    date_fin_prevue = case when p_champs ? 'date_fin_prevue' then (p_champs ->> 'date_fin_prevue')::date else c.date_fin_prevue end,
    date_fin_reelle = case when p_champs ? 'date_fin_reelle' then (p_champs ->> 'date_fin_reelle')::date
                           when p_champs ? 'statut' and (p_champs ->> 'statut') <> 'termine' and c.statut = 'termine' then null
                           else c.date_fin_reelle end,
    archive         = case when p_champs ? 'archive' then (p_champs ->> 'archive')::boolean else c.archive end
  where c.id = p_id;
  perform public.journaliser_modification('chantiers', p_id, 'modification', p_qui, p_qui_id, v_avant,
    (select to_jsonb(c) from public.chantiers c where c.id = p_id));
end $$;

-- ---------------------------------------------------------------- Articles et rapprochements
create or replace function public.creer_article_reference(p_nom text, p_unite_reference text, p_qui text, p_qui_id uuid default null)
returns uuid language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Article de référence : l''identité de la personne (qui) est obligatoire';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('article_reference:' || public.espace_obligatoire() || ':' || public.normaliser_texte(p_nom), 0));
  select a.id into v_id from public.articles_reference a where a.nom_normalise = public.normaliser_texte(p_nom);
  if v_id is not null then return v_id; end if;
  insert into public.articles_reference (nom, unite_reference) values (btrim(p_nom), btrim(p_unite_reference)) returning id into v_id;
  perform public.journaliser_modification('articles_reference', v_id, 'creation', p_qui, p_qui_id, null,
    jsonb_build_object('nom', btrim(p_nom), 'unite_reference', btrim(p_unite_reference)));
  return v_id;
end $$;

create or replace function public.renommer_article_reference(p_id uuid, p_nom text, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare
  v_nom text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_norm text := public.normaliser_texte(v_nom);
  v_avant text;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Renommage : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if char_length(v_nom) = 0 or v_norm = '' then
    raise exception 'Renommage : le nom de l''article de référence est obligatoire' using errcode = 'P0001', detail = 'nom_obligatoire';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('article_reference:' || public.espace_obligatoire() || ':' || v_norm, 0));
  select a.nom into v_avant from public.articles_reference a where a.id = p_id for update;
  if not found then
    raise exception 'Renommage : cet article de référence n''existe pas' using errcode = 'P0001', detail = 'reference_introuvable';
  end if;
  if v_avant = v_nom then return; end if;
  if exists (select 1 from public.articles_reference a where a.nom_normalise = v_norm and a.id <> p_id) then
    raise exception 'Renommage : ce nom est déjà pris par un autre article de référence' using errcode = 'P0001', detail = 'nom_deja_pris';
  end if;
  begin
    update public.articles_reference set nom = v_nom where id = p_id;
  exception when unique_violation then
    raise exception 'Renommage : ce nom est déjà pris par un autre article de référence' using errcode = 'P0001', detail = 'nom_deja_pris';
  end;
  perform public.journaliser_modification('articles_reference', p_id, 'renommage', p_qui, p_qui_id,
    jsonb_build_object('nom', v_avant), jsonb_build_object('nom', v_nom));
end $$;

-- Même nom que l'action de l'OS (« renommer_reference », js/modules/achatsarticles/actions.js), pour que la future porte l'appelle directement.
create or replace function public.renommer_reference(p_id uuid, p_nom text, p_qui text, p_qui_id uuid default null)
returns void language sql
set search_path = public, pg_temp as $$
  select public.renommer_article_reference(p_id, p_nom, p_qui, p_qui_id)
$$;

create or replace function public.reactiver_article_reference() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_actif boolean;
begin
  if new.archive_le is not null then return null; end if;
  select a.actif into v_actif from public.articles_reference a where a.id = new.article_reference_id for update;
  if found and not v_actif then
    update public.articles_reference set actif = true where id = new.article_reference_id;
    perform public.journaliser_modification('articles_reference', new.article_reference_id, 'reactivation (nouveau rapprochement)',
      coalesce(nullif(btrim(new.valide_par), ''), 'suggestion automatique'), null,
      jsonb_build_object('actif', false), jsonb_build_object('actif', true, 'article_fournisseur_id', new.article_fournisseur_id));
  end if;
  return null;
end $$;
drop trigger if exists rapprochements_reactiver_reference on public.rapprochements_articles_tous;
create trigger rapprochements_reactiver_reference after insert or update of article_reference_id on public.rapprochements_articles_tous
  for each row execute function public.reactiver_article_reference();

create or replace function public.retirer_suggestion_refusee() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_s public.suggestions_refusees_tous%rowtype;
begin
  if new.valide_le is null or new.archive_le is not null then return null; end if;
  update public.suggestions_refusees_tous set archive_le = now()
   where article_fournisseur_id = new.article_fournisseur_id and archive_le is null
  returning * into v_s;
  if found then
    perform public.journaliser_modification('suggestions_refusees', new.article_fournisseur_id, 'retrait du refus (rapprochement validé)',
      new.valide_par, null, to_jsonb(v_s), null);
  end if;
  return null;
end $$;
drop trigger if exists rapprochements_retirer_refus on public.rapprochements_articles_tous;
create trigger rapprochements_retirer_refus after insert or update of valide_le on public.rapprochements_articles_tous
  for each row execute function public.retirer_suggestion_refusee();

-- Désactive la référence si plus aucun rapprochement en cours ne la vise (partie commune de 015 / 031).
create or replace function public.desactiver_reference_orpheline(p_ref uuid, p_qui text, p_qui_id uuid) returns void
language plpgsql
set search_path = public, pg_temp as $$
declare v_actif boolean;
begin
  select a.actif into v_actif from public.articles_reference a where a.id = p_ref for update;
  if found and v_actif and not exists (select 1 from public.rapprochements_articles r where r.article_reference_id = p_ref) then
    update public.articles_reference set actif = false where id = p_ref;
    perform public.journaliser_modification('articles_reference', p_ref, 'desactivation (plus aucun rapprochement)', p_qui, p_qui_id,
      jsonb_build_object('actif', true), jsonb_build_object('actif', false));
  end if;
end $$;

create or replace function public.valider_rapprochement(p_article_fournisseur_id uuid, p_article_reference_id uuid, p_coefficient numeric, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_avant jsonb;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Validation : l''identité de la personne (qui) est obligatoire';
  end if;
  select to_jsonb(r) into v_avant from public.rapprochements_articles r where r.article_fournisseur_id = p_article_fournisseur_id;
  perform 1 from public.rapprochements_articles_tous r where r.article_fournisseur_id = p_article_fournisseur_id and r.archive_le is null for update;
  insert into public.rapprochements_articles_tous (article_fournisseur_id, article_reference_id, coefficient, valide_par, valide_le, suggere_par_ia)
  values (p_article_fournisseur_id, p_article_reference_id, p_coefficient, p_qui, now(), false)
  on conflict (espace_id, article_fournisseur_id) where archive_le is null do update
    set article_reference_id = excluded.article_reference_id,
        coefficient = excluded.coefficient,
        valide_par = excluded.valide_par,
        valide_le = excluded.valide_le;   -- suggere_par_ia est conservé : on garde la trace que l'idée venait de l'IA
  perform public.journaliser_modification('rapprochements_articles', p_article_fournisseur_id, 'validation', p_qui, p_qui_id, v_avant,
    jsonb_build_object('article_reference_id', p_article_reference_id, 'coefficient', p_coefficient));
end $$;

create or replace function public.suggerer_rapprochement(p_article_fournisseur_id uuid, p_article_reference_id uuid, p_coefficient numeric, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_n integer := 0;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Suggestion : l''identité de la personne ou du service (qui) est obligatoire';
  end if;
  insert into public.rapprochements_articles_tous (article_fournisseur_id, article_reference_id, coefficient, suggere_par_ia)
  values (p_article_fournisseur_id, p_article_reference_id, p_coefficient, true)
  on conflict (espace_id, article_fournisseur_id) where archive_le is null do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.journaliser_modification('rapprochements_articles', p_article_fournisseur_id, 'suggestion', p_qui, p_qui_id, null,
      jsonb_build_object('article_reference_id', p_article_reference_id, 'coefficient', p_coefficient));
  end if;
end $$;

create or replace function public.dissocier_rapprochement(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_r public.rapprochements_articles%rowtype;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Dissociation : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  perform 1 from public.rapprochements_articles_tous r where r.article_fournisseur_id = p_article_fournisseur_id and r.archive_le is null for update;
  select r.* into v_r from public.rapprochements_articles r where r.article_fournisseur_id = p_article_fournisseur_id;
  if not found then
    raise exception 'Dissociation : aucun rapprochement pour cet article' using errcode = 'P0001', detail = 'rapprochement_introuvable';
  end if;
  if v_r.valide_le is null then
    raise exception 'Dissociation : ce rapprochement n''est pas validé (c''est une suggestion : on la refuse)' using errcode = 'P0001', detail = 'rapprochement_non_valide';
  end if;
  update public.rapprochements_articles_tous set archive_le = now() where article_fournisseur_id = p_article_fournisseur_id and archive_le is null;
  perform public.journaliser_modification('rapprochements_articles', p_article_fournisseur_id, 'dissociation', p_qui, p_qui_id, to_jsonb(v_r), null);
  perform public.desactiver_reference_orpheline(v_r.article_reference_id, p_qui, p_qui_id);
end $$;

create or replace function public.refuser_suggestion(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_r public.rapprochements_articles%rowtype;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Refus de suggestion : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  perform 1 from public.rapprochements_articles_tous r where r.article_fournisseur_id = p_article_fournisseur_id and r.archive_le is null for update;
  select r.* into v_r from public.rapprochements_articles r where r.article_fournisseur_id = p_article_fournisseur_id;
  if not found then
    raise exception 'Refus de suggestion : aucune suggestion pour cet article' using errcode = 'P0001', detail = 'suggestion_introuvable';
  end if;
  if v_r.valide_le is not null then
    raise exception 'Refus de suggestion : ce rapprochement est validé, il ne se supprime pas' using errcode = 'P0001', detail = 'rapprochement_deja_valide';
  end if;
  update public.rapprochements_articles_tous set archive_le = now() where article_fournisseur_id = p_article_fournisseur_id and archive_le is null;
  perform public.journaliser_modification('rapprochements_articles', p_article_fournisseur_id, 'refus de suggestion', p_qui, p_qui_id, to_jsonb(v_r), null);
  insert into public.suggestions_refusees_tous (article_fournisseur_id, refuse_par, article_reference_id, coefficient)
  values (p_article_fournisseur_id, btrim(p_qui), v_r.article_reference_id, v_r.coefficient)
  on conflict (espace_id, article_fournisseur_id) where archive_le is null do update
    set refuse_par = excluded.refuse_par, refuse_le = now(),
        article_reference_id = excluded.article_reference_id, coefficient = excluded.coefficient;
  perform public.desactiver_reference_orpheline(v_r.article_reference_id, p_qui, p_qui_id);
end $$;

create or replace function public.reprendre_suggestion(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid default null)
returns void language plpgsql
set search_path = public, pg_temp as $$
declare v_s public.suggestions_refusees%rowtype; v_actif boolean; v_n integer := 0;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Reprise de suggestion : l''identité de la personne (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  perform 1 from public.suggestions_refusees_tous s where s.article_fournisseur_id = p_article_fournisseur_id and s.archive_le is null for update;
  select s.* into v_s from public.suggestions_refusees s where s.article_fournisseur_id = p_article_fournisseur_id;
  if not found then
    raise exception 'Reprise de suggestion : cet article n''a pas de suggestion refusée' using errcode = 'P0001', detail = 'refus_introuvable';
  end if;
  if exists (select 1 from public.rapprochements_articles r where r.article_fournisseur_id = p_article_fournisseur_id) then
    raise exception 'Reprise de suggestion : cet article a déjà un rapprochement' using errcode = 'P0001', detail = 'deja_rapproche';
  end if;
  if v_s.article_reference_id is null or v_s.coefficient is null then
    raise exception 'Reprise de suggestion : la suggestion refusée n''a pas été gardée (refus ancien) ou sa référence n''existe plus'
      using errcode = 'P0001', detail = 'reference_introuvable';
  end if;
  select a.actif into v_actif from public.articles_reference a where a.id = v_s.article_reference_id for update;
  if not found then
    raise exception 'Reprise de suggestion : l''article de référence n''existe plus' using errcode = 'P0001', detail = 'reference_introuvable';
  end if;
  if not v_actif then
    update public.articles_reference set actif = true where id = v_s.article_reference_id;
    perform public.journaliser_modification('articles_reference', v_s.article_reference_id, 'reactivation (suggestion reprise)', p_qui, p_qui_id,
      jsonb_build_object('actif', false), jsonb_build_object('actif', true, 'article_fournisseur_id', p_article_fournisseur_id));
  end if;
  insert into public.rapprochements_articles_tous (article_fournisseur_id, article_reference_id, coefficient, suggere_par_ia)
  values (p_article_fournisseur_id, v_s.article_reference_id, v_s.coefficient, true)
  on conflict (espace_id, article_fournisseur_id) where archive_le is null do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Reprise de suggestion : cet article a déjà un rapprochement' using errcode = 'P0001', detail = 'deja_rapproche';
  end if;
  perform public.journaliser_modification('rapprochements_articles', p_article_fournisseur_id, 'reprise de suggestion', p_qui, p_qui_id, to_jsonb(v_s),
    jsonb_build_object('article_reference_id', v_s.article_reference_id, 'coefficient', v_s.coefficient, 'suggere_par_ia', true));
  update public.suggestions_refusees_tous set archive_le = now() where article_fournisseur_id = p_article_fournisseur_id and archive_le is null;
end $$;

create or replace function public.catalogue_a_rapprocher(p_limite integer default 400)
returns table(id uuid, fournisseur text, reference text, designation text, unite text) language sql stable
set search_path = public, pg_temp as $$
  select a.id, f.nom::text, a.reference::text, a.designation::text, a.unite::text
  from public.articles_fournisseur a
  join public.fournisseurs f on f.id = a.fournisseur_id
  where not exists (select 1 from public.rapprochements_articles r where r.article_fournisseur_id = a.id)
    and not exists (select 1 from public.suggestions_refusees s where s.article_fournisseur_id = a.id)
  order by f.nom, a.designation, a.id
  limit least(greatest(coalesce(p_limite, 400), 1), 400)
$$;

create or replace function public.references_pour_suggestion()
returns table(id uuid, nom text, unite_reference text, nb_membres integer) language sql stable
set search_path = public, pg_temp as $$
  select ar.id, ar.nom::text, ar.unite_reference::text, (select count(*)::integer from public.rapprochements_articles r where r.article_reference_id = ar.id)
  from public.articles_reference ar
  where ar.actif
  order by ar.nom
  limit 1000
$$;

create or replace function public.lot_articles_a_suggerer(p_limite integer default 40)
returns table(id uuid, fournisseur text, reference text, designation text, unite text) language plpgsql
set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_limite integer := least(greatest(coalesce(p_limite, 40), 1), 40);
begin
  return query
  with lot as (
    select a.id as af_id, f.nom as f_nom, a.reference as a_ref, a.designation as a_des, a.unite as a_un,
           t.derniere_le as t_der, a.created_at as a_cree
    from public.articles_fournisseur a
    join public.fournisseurs f on f.id = a.fournisseur_id
    left join public.suggestions_tentees t on t.article_fournisseur_id = a.id
    where not exists (select 1 from public.rapprochements_articles r where r.article_fournisseur_id = a.id)
      and not exists (select 1 from public.suggestions_refusees s where s.article_fournisseur_id = a.id)
    order by t.derniere_le nulls first, a.created_at, a.id
    limit v_limite
  ), note as (
    insert into public.suggestions_tentees as st (article_fournisseur_id)
    select af_id from lot
    on conflict (espace_id, article_fournisseur_id) do update set tentatives = st.tentatives + 1, derniere_le = clock_timestamp()
    returning 1
  )
  select l.af_id, l.f_nom, l.a_ref, l.a_des, l.a_un from lot l
  order by l.t_der nulls first, l.a_cree, l.af_id;
end $$;

create or replace function public.suggerer_groupe_rapprochement(p_nom text, p_unite_reference text, p_membres jsonb, p_qui text, p_qui_id uuid default null)
returns jsonb language plpgsql
set search_path = public, pg_temp as $$
declare
  v_ref uuid; v_unite text; v_existants integer := 0;
  v_libres uuid[] := '{}'; v_coefs numeric[] := '{}';
  v_m jsonb; v_id uuid; v_k numeric; v_vus uuid[] := '{}'; i integer;
begin
  if char_length(btrim(coalesce(p_qui, ''))) = 0 then
    raise exception 'Suggestion de groupe : l''identité de la personne ou du service (qui) est obligatoire' using errcode = 'P0001', detail = 'qui_obligatoire';
  end if;
  if char_length(btrim(coalesce(p_nom, ''))) = 0 or char_length(btrim(coalesce(p_unite_reference, ''))) = 0 then
    raise exception 'Suggestion de groupe : nom et unité de la référence obligatoires' using errcode = 'P0001', detail = 'reference_invalide';
  end if;
  if p_membres is null or jsonb_typeof(p_membres) <> 'array' or jsonb_array_length(p_membres) < 1 or jsonb_array_length(p_membres) > 50 then
    raise exception 'Suggestion de groupe : la liste des articles doit compter de 1 à 50 éléments' using errcode = 'P0001', detail = 'membres_invalides';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('article_reference:' || public.espace_obligatoire() || ':' || public.normaliser_texte(p_nom), 0));
  select a.id, a.unite_reference into v_ref, v_unite from public.articles_reference a where a.nom_normalise = public.normaliser_texte(p_nom);
  if v_ref is not null then
    if public.normaliser_unite(v_unite) is distinct from public.normaliser_unite(p_unite_reference) then
      raise exception 'Suggestion de groupe : la référence existe déjà avec une autre unité' using errcode = 'P0001', detail = 'unite_differente';
    end if;
    select count(*)::integer into v_existants from public.rapprochements_articles r where r.article_reference_id = v_ref;
  end if;
  for i in 0 .. jsonb_array_length(p_membres) - 1 loop
    v_m := p_membres -> i;
    if jsonb_typeof(v_m) <> 'object' then
      raise exception 'Suggestion de groupe : élément % invalide', i using errcode = 'P0001', detail = 'membres_invalides';
    end if;
    begin
      v_id := (v_m ->> 'article_fournisseur_id')::uuid;
      v_k := (v_m ->> 'coefficient')::numeric;
    exception when others then
      raise exception 'Suggestion de groupe : élément % illisible', i using errcode = 'P0001', detail = 'membres_invalides';
    end;
    if v_id is null or v_k is null or v_k = 'NaN'::numeric or v_k < 0.000001 or v_k > 1000000 then
      raise exception 'Suggestion de groupe : élément % invalide (identifiant ou coefficient)', i using errcode = 'P0001', detail = 'membres_invalides';
    end if;
    if v_id = any (v_vus) then continue; end if;
    v_vus := v_vus || v_id;
    if exists (select 1 from public.articles_fournisseur a where a.id = v_id)
       and not exists (select 1 from public.rapprochements_articles r where r.article_fournisseur_id = v_id)
       and not exists (select 1 from public.suggestions_refusees s where s.article_fournisseur_id = v_id) then
      v_libres := v_libres || v_id;
      v_coefs := v_coefs || v_k;
    end if;
  end loop;
  if coalesce(array_length(v_libres, 1), 0) = 0 then
    return jsonb_build_object('ecrits', 0, 'raison', 'aucun_membre_libre');
  end if;
  if coalesce(array_length(v_libres, 1), 0) + v_existants < 2 then
    return jsonb_build_object('ecrits', 0, 'raison', 'groupe_trop_petit');
  end if;
  v_ref := public.creer_article_reference(p_nom, p_unite_reference, p_qui, p_qui_id);
  for i in 1 .. array_length(v_libres, 1) loop
    perform public.suggerer_rapprochement(v_libres[i], v_ref, v_coefs[i], p_qui, p_qui_id);
  end loop;
  return jsonb_build_object('ecrits', array_length(v_libres, 1), 'raison', null);
end $$;

-- ---------------------------------------------------------------- Favoris (026, 028, 034)
create or replace function public.favori_cle_verifiee(p_genre text, p_cle text) returns text
language plpgsql stable
set search_path = public, pg_temp as $$
declare v_cle text := btrim(coalesce(p_cle, ''));
begin
  if p_genre is null or p_genre not in ('chantier', 'agence', 'entreprise') then
    raise exception 'Genre de favori inconnu.' using errcode = 'P0001', detail = 'favori_genre_inconnu';
  end if;
  if p_genre = 'chantier' then
    if v_cle !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or not exists (select 1 from public.chantiers c where c.id = v_cle::uuid) then
      raise exception 'Ce chantier n''existe pas.' using errcode = 'P0001', detail = 'favori_cle_inconnue';
    end if;
    return lower(v_cle);
  elsif p_genre = 'entreprise' then
    if v_cle !~ '^[0-9]{9}$'
       or not (exists (select 1 from public.fournisseurs f where f.siren = v_cle)
               or exists (select 1 from public.etablissements_fournisseur e where e.siret like v_cle || '_____')) then
      raise exception 'Cette entreprise n''existe pas.' using errcode = 'P0001', detail = 'favori_cle_inconnue';
    end if;
    return v_cle;
  end if;
  if not exists (select 1 from public.etablissements_fournisseur e where e.siret = v_cle) then
    raise exception 'Cette agence n''existe pas.' using errcode = 'P0001', detail = 'favori_cle_inconnue';
  end if;
  return v_cle;
end $$;

create or replace function public.basculer_favori_os(p_genre text, p_cle text) returns boolean
language plpgsql
set search_path = public, pg_temp as $$
declare v_user text := public.utilisateur_courant(); v_cle text;
begin
  if v_user is null or public.espace_courant() is null then
    raise exception 'Accès refusé.' using errcode = 'P0001', detail = 'acces_base_refuse';
  end if;
  v_cle := public.favori_cle_verifiee(p_genre, p_cle);
  update public.favoris_os set archive_le = now() where utilisateur = v_user and genre = p_genre and cle = v_cle and archive_le is null;
  if found then return false; end if;
  insert into public.favoris_os (utilisateur, genre, cle) values (v_user, p_genre, v_cle)
  on conflict (espace_id, utilisateur, genre, cle) where archive_le is null do nothing;
  return true;
end $$;

create or replace function public.lister_favoris_os() returns table(genre text, cle text)
language plpgsql stable
set search_path = public, pg_temp as $$
declare v_user text := public.utilisateur_courant();
begin
  if v_user is null or public.espace_courant() is null then
    raise exception 'Accès refusé.' using errcode = 'P0001', detail = 'acces_base_refuse';
  end if;
  return query select f.genre, f.cle from public.favoris_os f where f.utilisateur = v_user and f.archive_le is null order by f.cree_le, f.id;
end $$;

-- Favoris de l'appli BTP (026) : même règle, autre table (gardée : c'est du métier ; à valider par Jérôme si l'appli BTP disparaît).
create or replace function public.basculer_favori(p_genre text, p_cle text) returns boolean
language plpgsql
set search_path = public, pg_temp as $$
declare v_user text := public.utilisateur_courant(); v_cle text;
begin
  if v_user is null or public.espace_courant() is null then
    raise exception 'Connexion requise.' using errcode = 'P0001', detail = 'favori_non_connecte';
  end if;
  v_cle := public.favori_cle_verifiee(p_genre, p_cle);
  update public.favoris set archive_le = now() where utilisateur = v_user and genre = p_genre and cle = v_cle and archive_le is null;
  if found then return false; end if;
  insert into public.favoris (utilisateur, genre, cle) values (v_user, p_genre, v_cle)
  on conflict (espace_id, utilisateur, genre, cle) where archive_le is null do nothing;
  return true;
end $$;

create or replace function public.lister_favoris() returns table(genre text, cle text)
language plpgsql stable
set search_path = public, pg_temp as $$
begin
  if public.utilisateur_courant() is null then return; end if;
  return query select f.genre, f.cle from public.favoris f where f.utilisateur = public.utilisateur_courant() and f.archive_le is null order by f.cree_le, f.id;
end $$;

-- ---------------------------------------------------------------- Tickets n8n (034) — À VALIDER PAR JÉRÔME (sans doute inutiles avec la porte)
create or replace function public.purger_tickets_n8n() returns void
language sql
set search_path = public, pg_temp as $$
  update public.tickets_n8n set archive_le = now() where archive_le is null and expire_le < now();
  update public.tickets_n8n_demandes set archive_le = now() where archive_le is null and demande_le < now() - interval '10 minutes';
$$;

create or replace function public.demander_ticket_n8n(p_usage text) returns text
language plpgsql
set search_path = public, pg_temp as $$
declare v_id record; v_ticket text;
begin
  select i.courriel, i.espace, i.utilisateur into v_id from public.identite_appelant() i;
  if v_id.utilisateur is null then
    raise exception 'Accès refusé.' using errcode = 'P0001', detail = 'acces_base_refuse';
  end if;
  if p_usage is null or p_usage not in ('validation', 'actions', 'suggestions', 'ajoutFacture') then
    raise exception 'Usage de ticket inconnu.' using errcode = 'P0001', detail = 'ticket_usage_inconnu';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ticket_n8n:' || v_id.espace || ':' || v_id.utilisateur, 0));
  perform public.purger_tickets_n8n();
  if (select count(*) from public.tickets_n8n_demandes d where d.utilisateur = v_id.utilisateur and d.archive_le is null and d.demande_le > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de demandes de ticket. Réessaie dans une minute.' using errcode = 'P0001', detail = 'ticket_trop_de_demandes';
  end if;
  insert into public.tickets_n8n_demandes (utilisateur) values (v_id.utilisateur);
  v_ticket := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.tickets_n8n (empreinte, usage, courriel, utilisateur, expire_le)
  values (encode(sha256(convert_to(v_ticket, 'UTF8')), 'hex'), p_usage, v_id.courriel, v_id.utilisateur, now() + interval '60 seconds');
  return v_ticket;
end $$;

create or replace function public.consommer_ticket(p_ticket text, p_usage text)
returns table(courriel text, espace text, utilisateur text)
language sql
set search_path = public, pg_temp as $$
  update public.tickets_n8n t set archive_le = now()
  where t.empreinte = encode(sha256(convert_to(coalesce(p_ticket, ''), 'UTF8')), 'hex')
    and t.usage = p_usage
    and t.expire_le > now()
    and t.archive_le is null
  returning t.courriel, t.espace_id, t.utilisateur;
$$;
