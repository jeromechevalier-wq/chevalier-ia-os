-- Test de a-activer/002_robot_ne_decide_pas.sql (joué seulement avec « node tester.js --avec-a-activer »).
-- Quand il est appliqué : le robot recopie (scans, suggestions) mais ne décide ni ne corrige ; une personne (rôle porte) décide.
\ir ../aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7800001');
grant select on ids_a to public;
reset role;
set role robot_reflets;
select pg_temp.entrer('espace-a', 'n8n');
do $$
declare v_siren text := pg_temp.siren('7800002'); v_f uuid;
begin
  insert into public.factures (numero, montant_ht, extraction) values ('R-1', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
    returning id into v_f;
  create temp table la_facture as select v_f as id;
  -- Décider, corriger, refuser une suggestion, valider un rapprochement, confirmer un IBAN : refusé au robot.
  perform pg_temp.doit_echouer(format('update public.factures set statut = %L, motif_refus = %L, decide_par = %L, decide_par_id = gen_random_uuid() where id = %L',
    'refusee', 'Doublon', 'alice@exemple.test', v_f), 'robot_ne_decide_pas');
  perform pg_temp.doit_echouer(format('update public.factures set montant_ht = 90 where id = %L', v_f), 'robot_ne_decide_pas');
  perform pg_temp.doit_echouer(format('select public.valider_rapprochement(%L, %L, 1, %L)', (select article_id from ids_a), (select reference_id from ids_a), 'alice@exemple.test'),
    'robot_ne_decide_pas');
  -- IBAN : confirmer ou révoquer est une décision.
  perform pg_temp.doit_echouer(format('insert into public.ibans_confirmes (fournisseur_id, siren, iban, facture_id, moyen_verification, confirme_par)
    select id, siren, %L, %L, %L, %L from public.fournisseurs where id = %L', 'FR1420041010050500013M02606', (select facture_id from ids_a),
    'Appel', 'alice@exemple.test', (select fournisseur_id from ids_a)), 'robot_ne_decide_pas');
  perform pg_temp.doit_echouer(format('select public.revoquer_iban(%L, %L, %L)', (select id from public.ibans_confirmes limit 1), 'Changé', 'alice@exemple.test'),
    'robot_ne_decide_pas');
  -- Refuser une suggestion (écrire un refus) : une décision.
  perform pg_temp.doit_echouer(format('insert into public.suggestions_refusees_tous (article_fournisseur_id, refuse_par, article_reference_id, coefficient) values (%L, %L, %L, 1)',
    (select article_id from ids_a), 'alice@exemple.test', (select reference_id from ids_a)), 'robot_ne_decide_pas');
  -- Un lien validé : ni dé-valider, ni changer le coefficient, en direct.
  perform pg_temp.doit_echouer(format('update public.rapprochements_articles_tous set valide_le = null, valide_par = null where article_fournisseur_id = %L and archive_le is null',
    (select article_id from ids_a)), 'robot_ne_decide_pas');
  perform pg_temp.doit_echouer(format('update public.rapprochements_articles_tous set coefficient = 2 where article_fournisseur_id = %L and archive_le is null',
    (select article_id from ids_a)), 'robot_ne_decide_pas');
  perform pg_temp.doit_echouer(format('update public.rapprochements_articles_tous set archive_le = now(), coefficient = 2 where article_fournisseur_id = %L and archive_le is null',
    (select article_id from ids_a)), 'robot_ne_decide_pas');
  -- Archiver seulement un lien validé (suivre la décision d'une personne) : permis (essai annulé ensuite).
  begin
    update public.rapprochements_articles_tous set archive_le = now() where article_fournisseur_id = (select article_id from ids_a) and archive_le is null;
    raise exception 'annuler' using detail = 'essai_annule';
  exception when others then
    if sqlerrm <> 'annuler' then raise; end if;
  end;
  -- Une suggestion de l'IA n'est pas une décision : permise (sur un article sans lien, il n'y en a pas ici : « rien à faire » est accepté).
  perform public.suggerer_rapprochement((select article_id from ids_a), (select reference_id from ids_a), 1, 'n8n');
end $$;
grant select on la_facture to porte;
reset role;

-- La personne décide (rôle porte).
set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare v_f uuid := (select id from la_facture);
begin
  update public.factures set montant_ht = 90 where id = v_f;
  update public.factures set statut = 'refusee', motif_refus = 'Doublon', decide_par = 'alice@exemple.test', decide_par_id = gen_random_uuid() where id = v_f;
  perform pg_temp.egal((select statut from public.factures where id = v_f), 'refusee'::public.statut_facture, 'la personne décide');
end $$;
reset role;
