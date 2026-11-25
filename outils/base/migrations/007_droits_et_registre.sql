-- 007 : les droits des trois rôles et le registre des tables.
--   porte          : lit tout, ajoute et modifie (jamais DELETE ni TRUNCATE : on archive). Le registre : lecture seule.
--   robot_reflets  : mêmes droits que porte pour l'instant (les robots créent la facture en recopiant le scan).
--                    Le fichier a-activer/001_bloquer_reflets.sql réservera les écritures des reflets à ce rôle (PAS appliqué ici).
--   indicateurs    : lecture seule (remplace indicateurs_ro ; metabase_ro est supprimé, C6).
-- Personne n'a BYPASSRLS : chacun ne voit que l'espace posé dans app.espace_id.
-- Les migrations tournent avec un compte d'administration : « app.utilisateur » est posé à « migration » pour que les colonnes
-- cree_par / modifie_par du registre soient remplies.
do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

-- ------------------------------------------------------------------ Tables
revoke all on all tables in schema public from public;
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke all on public.%I from porte, robot_reflets, indicateurs', t.relname);
    if t.relname = 'registre_tables' then
      execute format('grant select on public.%I to porte, robot_reflets, indicateurs', t.relname);
    else
      execute format('grant select, insert, update on public.%I to porte, robot_reflets', t.relname);
      -- Décision prise seul (à valider par Jérôme) : indicateurs lit les TABLES entières de son espace et non plus colonne par colonne
      -- (les vues sont en security_invoker : elles lisent avec ses droits). Les favoris et les tickets ne le regardent pas.
      if t.relname not in ('favoris', 'favoris_os', 'tickets_n8n', 'tickets_n8n_demandes', 'journal_modifications') then
        execute format('grant select on public.%I to indicateurs', t.relname);
      end if;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ Vues
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v' loop
    execute format('revoke all on public.%I from public, porte, robot_reflets, indicateurs', v.relname);
    execute format('grant select on public.%I to porte, robot_reflets, indicateurs', v.relname);
  end loop;
end $$;
-- La vue factures s'écrit (déclencheurs INSTEAD OF de 004) : ajout d'un scan, corrections, décision, archivage.
grant insert, update on public.factures to porte, robot_reflets;

-- ------------------------------------------------------------------ Fonctions
-- Plus aucune fonction n'est SECURITY DEFINER : donner le droit de les lancer ne donne aucun pouvoir en plus des droits sur les tables.
revoke all on all functions in schema public from public;
grant execute on all functions in schema public to porte, robot_reflets, indicateurs;
-- Les outils de construction (ajouter des colonnes) ne servent qu'aux migrations.
revoke execute on function public.poser_socle(text, boolean, boolean) from porte, robot_reflets, indicateurs;
revoke execute on function public.poser_reflet(text) from porte, robot_reflets, indicateurs;
-- Les nouvelles fonctions et tables ne reçoivent AUCUN droit par défaut : chaque migration future les donne elle-même.
alter default privileges revoke execute on functions from public;

-- ------------------------------------------------------------------ Registre (règle 2)
insert into public.registre_tables (nom_table, nature, verite_ou, robot, a_valider_par_jerome, explication) values
  ('journal_modifications',       'source', null, null, false, 'Le journal avant / après de chaque écriture. Ajout seul, jamais effacé.'),
  ('registre_tables',             'source', null, null, true,  'Cette liste. Sans espace_id : elle décrit la structure, commune à tous les espaces.'),
  ('fournisseurs',                'source', null, null, false, 'Les entreprises qui facturent (SIREN). Statut vérifié quand un IBAN est confirmé.'),
  ('etablissements_fournisseur',  'source', null, null, false, 'Les agences des fournisseurs (SIRET), avec désactivation et fusion.'),
  ('chantiers',                   'source', null, null, false, 'Les chantiers, leur budget et leur statut.'),
  ('articles_fournisseur',        'source', null, null, false, 'Le catalogue des articles de chaque fournisseur, créé à l''acceptation des factures.'),
  ('articles_reference',          'source', null, null, false, 'Les articles de référence qui regroupent des articles de plusieurs fournisseurs.'),
  ('rapprochements_articles_tous','source', null, null, true,  'Les liens article fournisseur -> article de référence, validés par une personne ou suggérés par l''IA. Les liens défaits sont archivés.'),
  ('suggestions_refusees_tous',   'source', null, null, false, 'Les suggestions de l''IA refusées par une personne (archivées quand on les reprend).'),
  ('suggestions_tentees',         'source', null, null, false, 'Le compteur des passages de l''IA sur chaque article (pour tourner sur tout le catalogue).'),
  ('favoris',                     'source', null, null, true,  'Les étoiles de l''appli BTP. À garder seulement si l''appli BTP reste.'),
  ('favoris_os',                  'source', null, null, false, 'Les étoiles de Chevalier IA OS (chantier, agence, entreprise), par personne.'),
  ('tickets_n8n',                 'source', null, null, true,  'Les tickets d''une minute pour appeler n8n. Sans doute inutiles avec la porte : à valider.'),
  ('tickets_n8n_demandes',        'source', null, null, true,  'Le compteur anti-abus des tickets n8n. Même sort que tickets_n8n.'),
  ('factures_identite',           'source', null, null, false, 'Qui est la facture : fournisseur, numéro, agence, chantier. Une ligne par facture.'),
  ('factures_decisions',          'source', null, null, false, 'Les décisions (accepter, refuser, rouvrir), en ajout seul : la dernière fait le statut.'),
  ('factures_corrections',        'source', null, null, false, 'Les corrections faites à la main sur les valeurs lues, en ajout seul.'),
  ('lignes_facture_articles',     'source', null, null, false, 'Le lien de chaque ligne de facture vers l''article du fournisseur.'),
  ('ibans_confirmes',             'source', null, null, false, 'Les IBAN vérifiés par une personne (avec le moyen de vérification), révocables.'),
  ('courriels_recus',             'reflet', 'La boîte mail qui reçoit les factures', 'n8n (lecture de la boîte mail)', false, 'Une ligne par courriel reçu : empêche de traiter deux fois le même.'),
  ('couts_ia',                    'reflet', 'Les appels à l''IA faits par n8n', 'n8n (après chaque appel à l''IA)', true, 'Le coût de chaque appel à l''IA. La référence de secours est à valider.'),
  ('n8n_executions',              'reflet', 'n8n (liste des exécutions)', 'n8n (relevé des exécutions)', false, 'Le relevé des exécutions des workflows n8n.'),
  ('openrouter_cles_releves',     'reflet', 'OpenRouter (consommation des clés)', 'n8n (relevé OpenRouter)', false, 'Le relevé de la consommation des clés OpenRouter (jamais la clé elle-même).'),
  ('factures_scans',              'reflet', 'Le PDF reçu et sa lecture par l''IA', 'n8n (lecture des factures)', false, 'Chaque lecture d''une facture (courriel + pièce jointe, ou dépôt). Ajout seul.'),
  ('lignes_facture_lues',         'reflet', 'Le PDF reçu et sa lecture par l''IA', 'n8n (lecture des factures)', false, 'Les lignes lues sur la facture. Remplacées = archivées, jamais effacées.')
on conflict (nom_table) do update set nature = excluded.nature, verite_ou = excluded.verite_ou, robot = excluded.robot,
  a_valider_par_jerome = excluded.a_valider_par_jerome, explication = excluded.explication;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
