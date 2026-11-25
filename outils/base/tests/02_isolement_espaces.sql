-- 02 : isolement des espaces (C2). Deux espaces A et B remplis par les chemins normaux ; depuis A on ne voit, ne lit et ne touche
-- RIEN de B : ni par les tables, ni par chaque vue, ni par les fonctions. Sans espace : rien du tout.
\ir aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7000001');
-- Même SIREN et même numéro de facture dans B : permis (l'unicité est PAR espace).
create temp table ids_b as select * from pg_temp.peupler('espace-b', 'MARQB', '7000001');
create temp table ids_b_textes as
  select v.x from ids_b, lateral (values (fournisseur_id::text), (agence_id::text), (chantier_id::text), (facture_id::text),
                                         (facture_refusee_id::text), (article_id::text), (reference_id::text), (courriel_id::text)) v(x);
reset role;
grant select on ids_a, ids_b, ids_b_textes to robot_reflets, indicateurs;

do $$
declare r record; v_n bigint; v_role text; v_nom text;
begin
  foreach v_role in array array['porte', 'robot_reflets', 'indicateurs'] loop
    execute format('set role %I', v_role);
    perform pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
    -- Tables : aucune ligne d'un autre espace, aucune trace de la marque de B.
    for r in select c.oid, c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'registre_tables' loop
      continue when not has_table_privilege(v_role, r.oid, 'SELECT');
      execute format('select count(*) from public.%I where espace_id <> %L', r.relname, 'espace-a') into v_n;
      if v_n > 0 then raise exception '[%] la table % montre % ligne(s) d''un autre espace', v_role, r.relname, v_n; end if;
      execute format('select count(*) from public.%I t where t::text ~ %L', r.relname, 'MARQB') into v_n;
      if v_n > 0 then raise exception '[%] la table % montre la marque de B', v_role, r.relname; end if;
    end loop;
    -- Les tables métier ont bien des lignes de A (sinon le test ne prouverait rien).
    foreach v_nom in array array['fournisseurs', 'etablissements_fournisseur', 'chantiers', 'factures_identite', 'factures_scans', 'factures_decisions',
                                 'lignes_facture_lues', 'lignes_facture_articles', 'articles_fournisseur', 'articles_reference', 'rapprochements_articles_tous',
                                 'ibans_confirmes', 'courriels_recus', 'couts_ia', 'n8n_executions', 'openrouter_cles_releves', 'journal_modifications'] loop
      execute format('select count(*) from public.%I', v_nom) into v_n;
      if v_n = 0 then raise exception '[%] la table % est vide dans A : le test ne prouverait rien', v_role, v_nom; end if;
    end loop;
    -- CHAQUE vue : ni la marque de B, ni un identifiant de B.
    for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' loop
      execute format('select count(*) from public.%I t where t::text ~ %L or exists (select 1 from ids_b_textes b where strpos(t::text, b.x) > 0)',
                     r.relname, 'MARQB') into v_n;
      if v_n > 0 then raise exception '[%] la vue % montre des données de l''espace B', v_role, r.relname; end if;
    end loop;
    -- Les vues lues par l'OS montrent bien A.
    foreach v_nom in array array['factures', 'lignes_facture', 'v_td_factures', 'v_td_chantiers', 'v_td_prix_lignes', 'v_td_fournisseurs_fiches',
                                 'v_td_fournisseurs_agences', 'v_td_fournisseurs_factures', 'journal_decisions', 'rapprochements_articles', 'v_td_ia_appels'] loop
      execute format('select count(*) from public.%I t where t::text ~ %L or exists (select 1 from ids_a a where strpos(t::text, a.facture_id::text) > 0 or strpos(t::text, a.chantier_id::text) > 0 or strpos(t::text, a.article_id::text) > 0)',
                     v_nom, 'MARQA') into v_n;
      if v_n = 0 then raise exception '[%] la vue % ne montre rien de A : le test ne prouverait rien', v_role, v_nom; end if;
    end loop;
    reset role;
  end loop;
end $$;

-- Fonctions de lecture : seulement A.
set role porte;
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
do $$
declare v_n int;
begin
  select count(*) into v_n from public.lister_favoris_os() f where f.cle = (select chantier_id::text from ids_b);
  perform pg_temp.egal(v_n, 0, 'lister_favoris_os montre un favori de B');
  select count(*) into v_n from public.lister_favoris_os();
  perform pg_temp.egal(v_n, 1, 'lister_favoris_os de A');
  select count(*) into v_n from public.references_pour_suggestion() r where r.nom ~ 'MARQB';
  perform pg_temp.egal(v_n, 0, 'references_pour_suggestion montre B');
  select count(*) into v_n from public.catalogue_a_rapprocher(400) r where r.fournisseur ~ 'MARQB';
  perform pg_temp.egal(v_n, 0, 'catalogue_a_rapprocher montre B');
  select count(*) into v_n from public.lot_articles_a_suggerer(40) r where r.fournisseur ~ 'MARQB';
  perform pg_temp.egal(v_n, 0, 'lot_articles_a_suggerer montre B');
  perform pg_temp.egal((select i.espace from public.identite_appelant() i), 'espace-a', 'identite_appelant');
end $$;

-- Fonctions d'écriture : depuis A, une ligne de B est introuvable (même erreur que si elle n'existait pas).
select pg_temp.doit_echouer(format('select public.rouvrir_facture(%L, %L, %L)', (select facture_id from ids_b), 'motif de test', 'alice'), 'facture_introuvable');
select pg_temp.doit_echouer(format('select public.archiver_facture(%L, %L)', (select facture_id from ids_b), 'alice'), 'facture_introuvable');
select pg_temp.doit_echouer(format('select public.relier_facture_chantier(%L, %L, %L)', (select facture_id from ids_b), (select chantier_id from ids_a), 'alice'), 'facture_introuvable');
select pg_temp.doit_echouer(format('select public.modifier_chantier(%L, %L, %L)', (select chantier_id from ids_b), '{"nom":"vol"}', 'alice'), 'chantier_introuvable');
select pg_temp.doit_echouer(format('select public.confirmer_iban(%L, %L, %L, %L, %L)', (select fournisseur_id from ids_b), 'FR7630006000011234567890189', (select facture_id from ids_a), 'appel', 'alice'), 'fournisseur_introuvable');
select pg_temp.doit_echouer(format('select public.valider_rapprochement(%L, %L, 1, %L)', (select article_id from ids_a), (select reference_id from ids_b), 'alice'), null);
select pg_temp.doit_echouer(format('select public.basculer_favori_os(%L, %L)', 'chantier', (select chantier_id from ids_b)), 'favori_cle_inconnue');
select pg_temp.doit_echouer(format('select public.dissocier_rapprochement(%L, %L)', (select article_id from ids_b), 'alice'), 'rapprochement_introuvable');
select pg_temp.doit_echouer(format('select public.renommer_reference(%L, %L, %L)', (select reference_id from ids_b), 'vol', 'alice'), 'reference_introuvable');
-- Écrire avec l'espace de B dans la requête : la base remet l'espace de la requête (A) ; modifier une ligne de B ne touche rien.
do $$
declare v_n int; v_esp text;
begin
  insert into public.chantiers (nom, code, espace_id) values ('Essai', 'CH-ESSAI', 'espace-b') returning espace_id into v_esp;
  perform pg_temp.egal(v_esp, 'espace-a', 'espace imposé par la base');
  update public.chantiers set nom = 'vol' where id = (select chantier_id from ids_b);
  get diagnostics v_n = row_count;
  perform pg_temp.egal(v_n, 0, 'modification d''une ligne de B depuis A');
  update public.factures set montant_ht = 1 where id = (select facture_id from ids_b);
  get diagnostics v_n = row_count;
  perform pg_temp.egal(v_n, 0, 'modification d''une facture de B depuis A');
end $$;
-- Une clé étrangère ne peut pas viser une ligne d'un autre espace (clés composites espace_id + id).
select pg_temp.doit_echouer(format('insert into public.etablissements_fournisseur (fournisseur_id, nom_agence) values (%L, %L)', (select fournisseur_id from ids_b), 'vol'), null);

-- Sans espace (absent, vide, blanc) : rien n'est visible, rien ne s'écrit.
do $$
declare r record; v_n bigint; v_esp text;
begin
  foreach v_esp in array array['', '   '] loop
    perform set_config('app.espace_id', v_esp, false);
    for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'registre_tables' loop
      execute format('select count(*) from public.%I', r.relname) into v_n;
      if v_n > 0 then raise exception 'Sans espace, la table % montre % ligne(s)', r.relname, v_n; end if;
    end loop;
    for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' loop
      execute format('select count(*) from public.%I t where t::text ~ %L', r.relname, 'MARQ[AB]') into v_n;
      if v_n > 0 then raise exception 'Sans espace, la vue % montre des données', r.relname; end if;
    end loop;
    perform pg_temp.doit_echouer('select public.creer_chantier(''X'', null, null, null, 0, null, null, null, ''alice'')', 'espace_manquant');
    perform pg_temp.doit_echouer('select * from public.lister_favoris_os()', 'acces_base_refuse');
  end loop;
  -- Un espace inconnu ne montre rien non plus.
  perform set_config('app.espace_id', 'espace-inconnu', false);
  select count(*) into v_n from public.factures;
  perform pg_temp.egal(v_n, 0::bigint, 'espace inconnu');
end $$;
reset role;
