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
  -- Une suggestion de l'IA n'est pas une décision : permise.
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
