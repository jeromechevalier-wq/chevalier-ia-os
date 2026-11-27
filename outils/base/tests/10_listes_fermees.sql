-- 10 : listes fermées (règle 25, migration 009). qui = e-mail ou acteur connu ; une décision = un e-mail (jamais un robot seul) ;
-- par où, source, action, table du journal, unité saisie, types de motif : seulement les valeurs de la liste.
\ir aides.inc

-- Les listes elles-mêmes.
do $$
begin
  perform pg_temp.egal(public.est_qui_valide('alice@exemple.test'), true, 'e-mail = qui valide');
  perform pg_temp.egal(public.est_qui_valide('Alice@Exemple.test'), true, 'e-mail en majuscules');
  perform pg_temp.egal(public.est_qui_valide('n8n'), true, 'n8n = acteur connu');
  perform pg_temp.egal(public.est_qui_valide('migration'), true, 'migration = acteur connu');
  perform pg_temp.egal(public.est_qui_valide('base'), true, 'base = acteur connu');
  perform pg_temp.egal(public.est_qui_valide('validé par Claude sur son ordre'), false, 'une phrase n''est pas un qui');
  perform pg_temp.egal(public.est_qui_valide('alice'), false, 'un prénom n''est pas un qui');
  perform pg_temp.egal(public.est_qui_valide(''), false, 'vide');
  perform pg_temp.egal(public.est_personne_valide('n8n'), false, 'un robot n''est pas une personne');
  perform pg_temp.egal(public.est_personne_valide('alice@exemple.test'), true, 'une personne = un e-mail');
  perform pg_temp.egal(public.est_par_ou_valide('ecran'), true, 'par où : écran');
  perform pg_temp.egal(public.est_par_ou_valide('assistant'), true, 'par où : assistant sans nom');
  perform pg_temp.egal(public.est_par_ou_valide('assistant:claude'), true, 'par où : assistant Claude');
  perform pg_temp.egal(public.est_par_ou_valide('assistant:inconnu'), false, 'par où : assistant hors liste');
  perform pg_temp.egal(public.est_par_ou_valide('n8n:AbC_12-x#4521'), true, 'par où : n8n, workflow, exécution');
  perform pg_temp.egal(public.est_par_ou_valide('n8n:mon workflow'), false, 'par où : espace refusé dans le workflow');
  perform pg_temp.egal(public.est_par_ou_valide('téléphone'), false, 'par où : texte libre refusé');
  perform pg_temp.egal(public.est_source_nom_valide('courriel:factures@exemple.test'), true, 'source : courriel et sa boîte');
  perform pg_temp.egal(public.est_source_nom_valide('depot'), true, 'source : dépôt');
  perform pg_temp.egal(public.est_source_nom_valide('n8n:lecture'), true, 'source : n8n et son workflow');
  perform pg_temp.egal(public.est_source_nom_valide('fax'), false, 'source hors liste');
  perform pg_temp.egal(public.est_unite_connue('Sacs'), true, 'unité : sacs = sac');
  perform pg_temp.egal(public.est_unite_connue('m²'), true, 'unité : m² = m2');
  perform pg_temp.egal(public.est_unite_connue('zorglub'), false, 'unité inconnue');
end $$;

set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7600001');
do $$
declare v_four uuid := (select fournisseur_id from ids_a); v_f uuid; v_siren text := pg_temp.siren('7600002');
begin
  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  -- Une décision par un robot ou par un nom (pas un e-mail) est refusée.
  insert into public.factures (numero, montant_ht, extraction) values ('L-1', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
    returning id into v_f;
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, motif_refus = %L, decide_par = %L, decide_par_id = gen_random_uuid() where id = %L',
    'refusee', 'Doublon', 'n8n', v_f), 'MESSAGE:factures_decisions_decide_par_liste');
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, motif_refus = %L, decide_par = %L, decide_par_id = gen_random_uuid() where id = %L',
    'refusee', 'Doublon', 'Jérôme', v_f), 'MESSAGE:factures_decisions_decide_par_liste');
  update public.factures set statut = 'refusee', motif_refus = 'Doublon', decide_par = 'alice@exemple.test', decide_par_id = gen_random_uuid() where id = v_f;
  perform pg_temp.egal((select motif_type from public.factures_decisions where facture_id = v_f order by rang desc limit 1), 'non_precise',
    'type de motif par défaut');
  -- Un type de motif hors liste est refusé.
  insert into public.factures (numero, montant_ht, extraction) values ('L-2', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
    returning id into v_f;
  perform pg_temp.doit_echouer(format('insert into public.factures_corrections (facture_id, champ, valeur, motif_type) values (%L, ''numero'', ''L-3'', ''parce que'')', v_f),
    'MESSAGE:factures_corrections_motif_type_liste');
  insert into public.factures_corrections (facture_id, champ, valeur, motif_type) values (v_f, 'numero', 'L-3', 'erreur_de_lecture');

  -- Le journal : qui, action, table, par où.
  perform pg_temp.doit_echouer('select public.journaliser_modification(''chantiers'', null, ''modification'', ''validé par Claude'', null, null, null)',
    'MESSAGE:journal_modifications_qui_liste');
  perform pg_temp.doit_echouer('select public.journaliser_modification(''chantiers'', null, ''n''''importe quoi'', ''alice@exemple.test'', null, null, null)',
    'MESSAGE:journal_modifications_action_liste');
  perform pg_temp.doit_echouer('select public.journaliser_modification(''table_inconnue'', null, ''modification'', ''alice@exemple.test'', null, null, null)',
    'MESSAGE:journal_modifications_table_nom_liste');
  perform public.journaliser_modification('factures', null, 'modification', 'alice@exemple.test', null, null, null);   -- nom gardé pour l'OS
  perform pg_temp.doit_echouer('insert into public.journal_modifications (table_nom, action, qui, par_ou) values (''chantiers'', ''modification'', ''alice@exemple.test'', ''telephone'')',
    'MESSAGE:journal_modifications_par_ou_liste');
  insert into public.journal_modifications (table_nom, action, qui, par_ou) values ('chantiers', 'modification', 'alice@exemple.test', 'assistant:claude');

  -- IBAN : moyen de vérification en liste fermée à côté du commentaire libre ; confirmé par une personne seulement.
  perform pg_temp.egal((select moyen_type from public.ibans_confirmes where fournisseur_id = v_four limit 1), 'non_precise', 'moyen par défaut');
  perform pg_temp.doit_echouer(format('insert into public.ibans_confirmes (fournisseur_id, siren, iban, facture_id, moyen_verification, confirme_par, moyen_type)
    select id, siren, %L, %L, %L, %L, %L from public.fournisseurs where id = %L', 'FR1420041010050500013M02606', (select facture_id from ids_a),
    'Appel', 'alice@exemple.test', 'pigeon voyageur', v_four),
    'MESSAGE:ibans_confirmes_moyen_type_liste');
  perform pg_temp.doit_echouer('update public.ibans_confirmes set confirme_par = ''n8n''', null);

  -- Unité saisie d'un article de référence.
  perform pg_temp.doit_echouer('select public.creer_article_reference(''Brique'', ''zorglub'', ''alice@exemple.test'')', 'MESSAGE:articles_reference_unite_liste');
  perform public.creer_article_reference('Brique', 'palette', 'alice@exemple.test');

  -- La personne des favoris vient de app.utilisateur : un prénom seul est refusé.
  perform pg_temp.entrer('espace-a', 'alice');
  perform pg_temp.doit_echouer(format('select public.basculer_favori_os(''chantier'', %L)', (select chantier_id from ids_a)), 'MESSAGE:_liste');
end $$;

-- Un reflet : source hors liste refusée (n8n écrit les reflets).
do $$
begin
  perform pg_temp.entrer('espace-a', 'n8n');
  perform pg_temp.doit_echouer('insert into public.n8n_executions (workflow_id, workflow_nom, execution_id, resultat, source_nom, source_ref) values (''wf'', ''Lecture'', ''ex-9'', ''ok'', ''fax'', ''9'')',
    'MESSAGE:n8n_executions_source_nom_liste');
  insert into public.n8n_executions (workflow_id, workflow_nom, execution_id, resultat) values ('wf', 'Lecture', 'ex-9', 'ok');
  perform pg_temp.egal((select source_nom from public.n8n_executions where execution_id = 'ex-9'), 'n8n:wf', 'source par défaut au format');
end $$;
reset role;

-- Toutes les contraintes de liste sont validées sur une base neuve (aucune ne reste « not valid »).
do $$
declare v text;
begin
  select string_agg(conrelid::regclass || '.' || conname, ', ') into v from pg_constraint
   where connamespace = 'public'::regnamespace and contype = 'c' and conname like '%\_liste' and not convalidated;
  if v is not null then raise exception 'Contraintes de liste non validées : %', v; end if;
end $$;
