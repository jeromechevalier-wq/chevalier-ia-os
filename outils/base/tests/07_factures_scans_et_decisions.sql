-- 07 : les factures coupées en identité / scans / corrections / décisions (C3).
--   - un 2e scan de la même facture (même SIREN + numéro) s'ajoute à LA facture : pas de doublon ;
--   - le même courriel + la même pièce jointe recopié deux fois : refusé (pas de 2e scan) ;
--   - une correction ne touche pas le scan ; une correction qui ferait un doublon est refusée (pas de fusion automatique) ;
--   - décider fige la facture ; rouvrir ajoute une décision (rien n'est effacé).
\ir aides.inc
set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare
  v_siren text := pg_temp.siren('7300001');
  v_qui_id uuid := gen_random_uuid();
  v_f uuid; v_f2 uuid; v_f3 uuid; v_statut public.statut_facture; v_ag uuid; v_four uuid; v_ch uuid; f public.factures%rowtype; v_n int;
begin
  -- 1er scan (par un courriel).
  insert into public.factures (fournisseur, numero, montant_ht, montant_tva, montant_ttc, email_message_id, fichier_path, extraction)
  values ('Matériaux Exemple', 'FA-0042', 100, 20, 120, '<c1@exemple.test>', 'f/c1.pdf',
          jsonb_build_object('numero', 'FA-0042', 'fournisseur', jsonb_build_object('siren', v_siren)))
  returning id into v_f;
  -- 2e scan de la même facture (re-scannée avec des notes à la main), arrivé par un autre courriel, numéro écrit autrement.
  insert into public.factures (fournisseur, numero, montant_ht, montant_tva, montant_ttc, email_message_id, fichier_path, extraction)
  values ('Matériaux Exemple', 'fa 0042', 110, 22, 132, '<c2@exemple.test>', 'f/c2.pdf',
          jsonb_build_object('numero', 'fa 0042', 'fournisseur', jsonb_build_object('siren', v_siren)))
  returning id into v_f2;
  perform pg_temp.egal(v_f2, v_f, 'le 2e scan rejoint la même facture');
  perform pg_temp.egal((select count(*)::int from public.factures_identite), 1, 'une seule facture');
  perform pg_temp.egal((select count(*)::int from public.factures), 1, 'une seule ligne dans la vue factures');
  perform pg_temp.egal((select count(*)::int from public.factures_scans where facture_id = v_f), 2, 'deux scans gardés');
  -- La vue montre le dernier scan ; le désaccord de montant est signalé.
  select * into f from public.factures where id = v_f;
  perform pg_temp.egal(f.montant_ht, 110.00::numeric(12,2), 'montant du dernier scan');
  perform pg_temp.egal(f.email_message_id, '<c2@exemple.test>', 'courriel du dernier scan');
  perform pg_temp.egal((select nb_montants_ht from public.v_factures_desaccords where facture_id = v_f), 2, 'désaccord signalé');

  -- Le même courriel + la même pièce jointe recopié une 2e fois : refusé.
  perform pg_temp.doit_echouer(format($q$insert into public.factures (numero, montant_ht, email_message_id, fichier_path, extraction)
    values ('FA-0042', 100, '<c1@exemple.test>', 'f/c1.pdf', %L)$q$, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren))), null);
  -- Un scan sans facture connue (facture_id vide, rien de lu) : la base crée une facture à identifier.
  insert into public.factures_scans (source_nom, source_ref, fournisseur) values ('depot', 'depot-essai-1', 'Illisible') returning facture_id into v_f3;
  if v_f3 is null or v_f3 = v_f then raise exception 'scan sans facture : une nouvelle facture devait être créée'; end if;

  -- Correction à la main : le scan ne bouge pas, la vue montre la correction, l'historique est gardé.
  update public.factures set montant_ht = 105 where id = v_f;
  perform pg_temp.egal((select montant_ht from public.factures where id = v_f), 105.00::numeric(12,2), 'correction visible');
  perform pg_temp.egal((select count(*)::int from public.factures_scans where facture_id = v_f and montant_ht = 105), 0, 'le scan n''est pas réécrit');
  perform pg_temp.egal((select count(*)::int from public.factures_corrections where facture_id = v_f and champ = 'montant_ht'), 1, 'correction gardée');
  -- La dernière information en date gagne (Jérôme, 27/11/2026 ; avant : « une correction l'emporte toujours sur la lecture ») :
  -- un nouveau scan arrivé APRÈS la correction s'affiche ; une nouvelle correction ensuite l'emporte à son tour. Tout reste gardé.
  insert into public.factures (fournisseur, numero, montant_ht, montant_tva, montant_ttc, email_message_id, fichier_path, extraction)
  values ('Matériaux Exemple', 'FA-0042', 150, 30, 180, '<c3@exemple.test>', 'f/c3.pdf',
          jsonb_build_object('numero', 'FA-0042', 'fournisseur', jsonb_build_object('siren', v_siren)));
  perform pg_temp.egal((select montant_ht from public.factures where id = v_f), 150.00::numeric(12,2), 'nouveau scan après la correction : il gagne');
  perform pg_temp.egal((select count(*)::int from public.factures_corrections where facture_id = v_f and champ = 'montant_ht'), 1, 'la correction reste gardée');
  update public.factures set montant_ht = 105, montant_tva = 22, montant_ttc = 132 where id = v_f;
  perform pg_temp.egal((select montant_ht from public.factures where id = v_f), 105.00::numeric(12,2), 'nouvelle correction après le scan : elle gagne');
  perform pg_temp.egal((select bool_and(corrige_le is not null and corrige_le > now()) from public.factures_corrections where facture_id = v_f), true,
    'heure exacte de chaque correction posée par la base');
  -- Les colonnes calculées par la base ne s'écrivent pas.
  perform pg_temp.doit_echouer(format('update public.factures set lignes_etat = %L where id = %L', 'lues', v_f), 'colonne_calculee');

  -- Une 2e facture du même fournisseur ; lui donner le numéro de la 1re serait un doublon : refusé, sans fusion.
  insert into public.factures (numero, montant_ht, extraction) values ('FA-0043', 50, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
  returning id into v_f2;
  perform pg_temp.doit_echouer(format('update public.factures set numero = %L where id = %L', 'fa 0042', v_f2), 'facture_doublon');
  perform pg_temp.egal((select count(*)::int from public.factures_identite where fournisseur_siren = v_siren), 2, 'pas de fusion automatique');

  -- Décision : refus sans motif refusé ; acceptation sans agence refusée ; sans décideur refusée.
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L, decide_par_id = %L where id = %L', 'refusee', 'alice@exemple.test', v_qui_id, v_f2), null);
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L, decide_par_id = %L where id = %L', 'acceptee', 'alice@exemple.test', v_qui_id, v_f), 'agence_obligatoire');
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L where id = %L', 'refusee', 'alice@exemple.test', v_f2), 'decideur_manquant');

  select a.agence_id, a.entreprise_id into v_ag, v_four from public.creer_agence_et_fournisseur(v_siren || '00027', null, 'Matériaux Exemple', 'Agence Nord', 'Lyon', 'alice@exemple.test') a;
  v_ch := public.creer_chantier('Maison Exemple', null, 'Client Exemple', null, 5000, 'en_cours', null, null, 'alice@exemple.test');
  perform public.remplacer_lignes_facture(v_f, '[{"designation":"Gravier","quantite":1,"unite":"t","prix_unitaire_ht":105,"montant_ht":105}]', 'alice@exemple.test');
  -- Remplacer les lignes une 2e fois : les nouvelles se voient, les anciennes sont archivées (jamais effacées).
  perform public.remplacer_lignes_facture(v_f, '[{"designation":"Sable","quantite":1,"unite":"t","prix_unitaire_ht":105,"montant_ht":105}]', 'alice@exemple.test');
  perform pg_temp.egal((select string_agg(designation, ',') from public.lignes_facture where facture_id = v_f), 'Sable', 'la vue montre la nouvelle ligne');
  perform pg_temp.egal((select count(*)::int from public.lignes_facture_lues where facture_id = v_f and designation = 'Gravier' and archive_le is not null), 1, 'ancienne ligne archivée');
  -- Une ligne lue ne se modifie pas, même en la glissant dans un archivage.
  perform pg_temp.doit_echouer(format('update public.lignes_facture_lues set designation = %L, archive_le = now() where facture_id = %L', 'Autre', v_f), 'ajout_seul');
  perform pg_temp.doit_echouer(format('update public.lignes_facture_lues set designation = %L where facture_id = %L', 'Autre', v_f), 'ajout_seul');
  -- Un chantier ne naît pas archivé.
  perform pg_temp.doit_echouer('insert into public.chantiers (nom, code, archive) values (''Né archivé'', ''CH-NA'', true)', 'archivage_a_la_creation');
  update public.factures set statut = 'acceptee', etablissement_id = v_ag, chantier_id = v_ch, decide_par = 'alice@exemple.test', decide_par_id = v_qui_id where id = v_f;
  select * into f from public.factures where id = v_f;
  perform pg_temp.egal(f.statut, 'acceptee'::public.statut_facture, 'statut accepté');
  perform pg_temp.egal(f.fournisseur_id, v_four, 'fournisseur déduit de l''agence');
  perform pg_temp.egal(f.lignes_etat, 'lues', 'lignes lues et somme juste');
  perform pg_temp.egal((select count(*)::int from public.lignes_facture where facture_id = v_f and article_fournisseur_id is not null), 1, 'ligne rattachée au catalogue');

  -- Décidée = figée : ni correction, ni nouvelle décision, ni lignes ; un scan arrivé après est gardé mais ne change pas ce qui est affiché.
  perform pg_temp.doit_echouer(format('update public.factures set montant_ht = 1 where id = %L', v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, motif_refus = %L, decide_par = %L, decide_par_id = %L where id = %L', 'refusee', 'non', 'alice@exemple.test', v_qui_id, v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('select public.remplacer_lignes_facture(%L, %L, %L)', v_f, '[]', 'alice@exemple.test'), null);
  insert into public.factures (numero, montant_ht, email_message_id, extraction)
  values ('FA-0042', 999, '<c3@exemple.test>', jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)));
  perform pg_temp.egal((select montant_ht from public.factures where id = v_f), 105.00::numeric(12,2), 'un scan après la décision ne change rien');
  perform pg_temp.egal((select count(*)::int from public.factures_scans where facture_id = v_f), 4, 'scan tardif gardé (3 scans avant la décision, dont celui de la règle « dernière information »)');

  -- Archiver puis sortir des archives (avec trace au journal).
  perform public.archiver_facture(v_f, 'alice@exemple.test');
  -- La personne qui archive est celle de la requête (app.utilisateur), pas le nom envoyé.
  perform pg_temp.egal((select archivee_par from public.factures where id = v_f), 'alice@exemple.test', 'archivée par');
  perform public.desarchiver_facture(v_f, 'alice@exemple.test');
  perform pg_temp.egal((select archivee_le from public.factures where id = v_f), null::timestamptz, 'désarchivée');

  -- Rouvrir : une décision s'AJOUTE, rien n'est effacé ; agence et chantier remis à vide ; liens des lignes archivés.
  perform pg_temp.doit_echouer(format('select public.rouvrir_facture(%L, %L, %L)', v_f, '', 'alice@exemple.test'), 'motif_obligatoire');
  perform public.rouvrir_facture(v_f, 'Erreur de chantier', 'alice@exemple.test', v_qui_id);
  select * into f from public.factures where id = v_f;
  perform pg_temp.egal(f.statut, 'a_valider'::public.statut_facture, 'statut après réouverture');
  perform pg_temp.egal(f.chantier_id, null::uuid, 'chantier remis à vide');
  perform pg_temp.egal((select count(*)::int from public.factures_decisions where facture_id = v_f), 2, 'les deux décisions sont gardées');
  perform pg_temp.egal((select count(*)::int from public.journal_decisions where facture_id = v_f and decision = 'rouverte' and motif = 'Erreur de chantier'), 1, 'journal_decisions');
  perform pg_temp.egal((select count(*)::int from public.lignes_facture_articles l join public.lignes_facture_lues x on x.id = l.ligne_id
                        where x.facture_id = v_f and l.archive_le is not null), 1, 'lien de ligne archivé, pas effacé');
  -- Elle peut être acceptée de nouveau.
  update public.factures set statut = 'acceptee', etablissement_id = v_ag, decide_par = 'alice@exemple.test', decide_par_id = v_qui_id where id = v_f;
  perform pg_temp.egal((select statut from public.factures where id = v_f), 'acceptee'::public.statut_facture, 'acceptée de nouveau');

  -- Écritures DIRECTES dans les tables (sans passer par la vue factures) : les mêmes garde-fous tiennent.
  perform pg_temp.doit_echouer(format('update public.factures_identite set fournisseur_id = null where id = %L', v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('update public.factures_identite set numero_normalise = %L where id = %L', 'AUTRE', v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('update public.factures_identite set etablissement_id = null where id = %L', v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('update public.factures_identite set chantier_id = %L where id = %L', v_ch, v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id) values (%L, %L, %L, %L)', v_f, 'accepter', 'alice@exemple.test', v_qui_id), 'facture_decidee_figee');
  -- v_f2 est encore à valider : pas d'archivage, pas d'acceptation sans agence ni sans décideur, pas de « rouverte ».
  perform pg_temp.doit_echouer(format('update public.factures_identite set archive_le = now() where id = %L', v_f2), 'archivage_facture_non_decidee');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id) values (%L, %L, %L, %L)', v_f2, 'accepter', 'alice@exemple.test', v_qui_id), 'agence_obligatoire');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par) values (%L, %L, %L)', v_f2, 'accepter', 'alice@exemple.test'), 'decideur_manquant');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par, motif) values (%L, %L, %L, %L)', v_f2, 'rouverte', 'alice@exemple.test', 'motif'), 'facture_non_decidee');
  -- Chantier suspendu : acceptation directe refusée (même contrôle que la vue).
  update public.factures_identite set etablissement_id = v_ag, chantier_id = v_ch where id = v_f2;
  perform public.modifier_chantier(v_ch, '{"statut":"suspendu"}', 'alice@exemple.test');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id) values (%L, %L, %L, %L)', v_f2, 'accepter', 'alice@exemple.test', v_qui_id), 'chantier_suspendu');
  perform public.modifier_chantier(v_ch, '{"statut":"en_cours"}', 'alice@exemple.test');
  update public.factures_identite set chantier_id = null where id = v_f2;
  -- Le drapeau de relier_facture_chantier ne permet pas de CHANGER un chantier déjà posé : on relie v_f (acceptée, sans chantier), puis on essaie.
  perform public.relier_facture_chantier(v_f, v_ch, 'alice@exemple.test');
  perform pg_temp.egal((select chantier_id from public.factures where id = v_f), v_ch, 'chantier relié après coup');
  perform set_config('app.lien_chantier_facture', v_f::text, true);
  perform pg_temp.doit_echouer(format('update public.factures_identite set chantier_id = null where id = %L', v_f), 'facture_decidee_figee');
  perform set_config('app.lien_chantier_facture', '', true);
  -- Agence désactivée : acceptation directe refusée.
  update public.factures_identite set etablissement_id = v_ag where id = v_f2;
  perform public.desactiver_agence(v_ag, 'alice@exemple.test');
  perform pg_temp.doit_echouer(format('insert into public.factures_decisions (facture_id, decision, decide_par, decide_par_id) values (%L, %L, %L, %L)', v_f2, 'accepter', 'alice@exemple.test', v_qui_id), 'agence_inactive');

  -- Une facture REFUSÉE renvoyée par le fournisseur : le scan rejoint la facture, qui reste refusée (elle ne disparaît pas),
  -- et le scan tardif se voit dans v_factures_scans_apres_decision.
  update public.factures set statut = 'refusee', motif_refus = 'Montant faux', decide_par = 'alice@exemple.test', decide_par_id = v_qui_id where id = v_f2;
  insert into public.factures (numero, montant_ht, email_message_id, extraction)
  values ('FA-0043', 50, '<c9@exemple.test>', jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
  returning id, statut into v_f3, v_statut;
  perform pg_temp.egal(v_f3, v_f2, 'le renvoi rejoint la facture refusée');
  perform pg_temp.egal(v_statut, 'refusee'::public.statut_facture, 'statut rendu au robot');
  perform pg_temp.egal((select statut from public.factures where id = v_f2), 'refusee'::public.statut_facture, 'la facture reste refusée et visible');
  perform pg_temp.egal((select count(*)::int from public.v_factures_scans_apres_decision where facture_id = v_f2), 1, 'renvoi signalé');

  -- Une facture ne naît pas décidée.
  perform pg_temp.doit_echouer('insert into public.factures (numero, statut) values (''X-1'', ''acceptee'')', 'facture_creation_statut');
end $$;
reset role;
