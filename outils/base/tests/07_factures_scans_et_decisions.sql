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
  v_f uuid; v_f2 uuid; v_f3 uuid; v_ag uuid; v_four uuid; v_ch uuid; f public.factures%rowtype; v_n int;
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
  -- Les colonnes calculées par la base ne s'écrivent pas.
  perform pg_temp.doit_echouer(format('update public.factures set lignes_etat = %L where id = %L', 'lues', v_f), 'colonne_calculee');

  -- Une 2e facture du même fournisseur ; lui donner le numéro de la 1re serait un doublon : refusé, sans fusion.
  insert into public.factures (numero, montant_ht, extraction) values ('FA-0043', 50, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
  returning id into v_f2;
  perform pg_temp.doit_echouer(format('update public.factures set numero = %L where id = %L', 'fa 0042', v_f2), 'facture_doublon');
  perform pg_temp.egal((select count(*)::int from public.factures_identite where fournisseur_siren = v_siren), 2, 'pas de fusion automatique');

  -- Décision : refus sans motif refusé ; acceptation sans agence refusée ; sans décideur refusée.
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L, decide_par_id = %L where id = %L', 'refusee', 'alice', v_qui_id, v_f2), null);
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L, decide_par_id = %L where id = %L', 'acceptee', 'alice', v_qui_id, v_f), 'agence_obligatoire');
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, decide_par = %L where id = %L', 'refusee', 'alice', v_f2), 'decideur_manquant');

  select a.agence_id, a.entreprise_id into v_ag, v_four from public.creer_agence_et_fournisseur(v_siren || '00027', null, 'Matériaux Exemple', 'Agence Nord', 'Lyon', 'alice') a;
  v_ch := public.creer_chantier('Maison Exemple', null, 'Client Exemple', null, 5000, 'en_cours', null, null, 'alice');
  perform public.remplacer_lignes_facture(v_f, '[{"designation":"Sable","quantite":1,"unite":"t","prix_unitaire_ht":105,"montant_ht":105}]', 'alice');
  update public.factures set statut = 'acceptee', etablissement_id = v_ag, chantier_id = v_ch, decide_par = 'alice', decide_par_id = v_qui_id where id = v_f;
  select * into f from public.factures where id = v_f;
  perform pg_temp.egal(f.statut, 'acceptee'::public.statut_facture, 'statut accepté');
  perform pg_temp.egal(f.fournisseur_id, v_four, 'fournisseur déduit de l''agence');
  perform pg_temp.egal(f.lignes_etat, 'lues', 'lignes lues et somme juste');
  perform pg_temp.egal((select count(*)::int from public.lignes_facture where facture_id = v_f and article_fournisseur_id is not null), 1, 'ligne rattachée au catalogue');

  -- Décidée = figée : ni correction, ni nouvelle décision, ni lignes ; un scan arrivé après est gardé mais ne change pas ce qui est affiché.
  perform pg_temp.doit_echouer(format('update public.factures set montant_ht = 1 where id = %L', v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, motif_refus = %L, decide_par = %L, decide_par_id = %L where id = %L', 'refusee', 'non', 'alice', v_qui_id, v_f), 'facture_decidee_figee');
  perform pg_temp.doit_echouer(format('select public.remplacer_lignes_facture(%L, %L, %L)', v_f, '[]', 'alice'), null);
  insert into public.factures (numero, montant_ht, email_message_id, extraction)
  values ('FA-0042', 999, '<c3@exemple.test>', jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)));
  perform pg_temp.egal((select montant_ht from public.factures where id = v_f), 105.00::numeric(12,2), 'un scan après la décision ne change rien');
  perform pg_temp.egal((select count(*)::int from public.factures_scans where facture_id = v_f), 3, 'scan tardif gardé');

  -- Archiver puis sortir des archives (avec trace au journal).
  perform public.archiver_facture(v_f, 'alice');
  perform pg_temp.egal((select archivee_par from public.factures where id = v_f), 'alice', 'archivée par');
  perform public.desarchiver_facture(v_f, 'alice');
  perform pg_temp.egal((select archivee_le from public.factures where id = v_f), null::timestamptz, 'désarchivée');

  -- Rouvrir : une décision s'AJOUTE, rien n'est effacé ; agence et chantier remis à vide ; liens des lignes archivés.
  perform pg_temp.doit_echouer(format('select public.rouvrir_facture(%L, %L, %L)', v_f, '', 'alice'), 'motif_obligatoire');
  perform public.rouvrir_facture(v_f, 'Erreur de chantier', 'alice', v_qui_id);
  select * into f from public.factures where id = v_f;
  perform pg_temp.egal(f.statut, 'a_valider'::public.statut_facture, 'statut après réouverture');
  perform pg_temp.egal(f.chantier_id, null::uuid, 'chantier remis à vide');
  perform pg_temp.egal((select count(*)::int from public.factures_decisions where facture_id = v_f), 2, 'les deux décisions sont gardées');
  perform pg_temp.egal((select count(*)::int from public.journal_decisions where facture_id = v_f and decision = 'rouverte' and motif = 'Erreur de chantier'), 1, 'journal_decisions');
  perform pg_temp.egal((select count(*)::int from public.lignes_facture_articles l join public.lignes_facture_lues x on x.id = l.ligne_id
                        where x.facture_id = v_f and l.archive_le is not null), 1, 'lien de ligne archivé, pas effacé');
  -- Elle peut être acceptée de nouveau.
  update public.factures set statut = 'acceptee', etablissement_id = v_ag, decide_par = 'alice', decide_par_id = v_qui_id where id = v_f;
  perform pg_temp.egal((select statut from public.factures where id = v_f), 'acceptee'::public.statut_facture, 'acceptée de nouveau');

  -- Une facture ne naît pas décidée.
  perform pg_temp.doit_echouer('insert into public.factures (numero, statut) values (''X-1'', ''acceptee'')', 'facture_creation_statut');
end $$;
reset role;
