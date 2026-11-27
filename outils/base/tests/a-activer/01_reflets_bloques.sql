-- Test du fichier a-activer/001_bloquer_reflets.sql (joué seulement avec « node tester.js --avec-a-activer »).
-- Quand il est appliqué : la porte ne peut plus écrire un reflet ; le robot, oui ; la porte décide toujours.
\ir ../aides.inc
set role robot_reflets;
select pg_temp.entrer('espace-a', 'robot-lecture@exemple.test');
do $$
declare v_siren text := pg_temp.siren('7400001'); v_c uuid; v_f uuid;
begin
  -- Le robot recopie un courriel, une facture (scan) et ses lignes.
  insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat)
  values ('client', 'factures@exemple.test', 'lecture', '<r1@exemple.test>', 'accepte') returning id into v_c;
  insert into public.factures (numero, montant_ht, email_message_id, courriel_id, extraction)
  values ('R-1', 100, '<r1@exemple.test>', v_c, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren))) returning id into v_f;
  perform public.remplacer_lignes_facture(v_f, '[{"designation":"Gravier","montant_ht":100}]', 'n8n');
  insert into public.n8n_executions (workflow_id, workflow_nom, resultat) values ('wf', 'Lecture', 'ok');
  create temp table la_facture as select v_f as id;
end $$;
-- Donné par robot_reflets, propriétaire de la table temporaire (le compte d'administration n'est pas forcément superutilisateur).
grant select on la_facture to porte;
reset role;

set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare v_f uuid := (select id from la_facture); r record;
begin
  -- La porte lit les reflets…
  perform pg_temp.egal((select count(*)::int from public.courriels_recus), 1, 'la porte lit les courriels');
  perform pg_temp.egal((select count(*)::int from public.factures_scans), 1, 'la porte lit les scans');
  -- … mais n'en écrit aucun.
  for r in select nom_table from public.registre_tables where nature = 'reflet' loop
    if has_table_privilege('porte', ('public.' || r.nom_table)::regclass, 'INSERT') or has_table_privilege('porte', ('public.' || r.nom_table)::regclass, 'UPDATE') then
      raise exception 'La porte peut encore écrire le reflet %', r.nom_table;
    end if;
  end loop;
  perform pg_temp.doit_echouer('insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat) values (''c'', ''b'', ''w'', ''<p@exemple.test>'', ''accepte'')', null);
  perform pg_temp.doit_echouer('insert into public.factures (numero, montant_ht) values (''P-1'', 1)', null);
  perform pg_temp.doit_echouer(format('select public.remplacer_lignes_facture(%L, %L, %L)', v_f, '[]', 'alice@exemple.test'), null);
  perform pg_temp.doit_echouer('insert into public.n8n_executions (workflow_id, workflow_nom, resultat) values (''wf'', ''x'', ''ok'')', null);
  -- La porte corrige et décide toujours (ce sont des sources).
  update public.factures set montant_ht = 90, statut = 'refusee', motif_refus = 'Erreur de montant', decide_par = 'alice@exemple.test', decide_par_id = gen_random_uuid() where id = v_f;
  perform pg_temp.egal((select statut from public.factures where id = v_f), 'refusee'::public.statut_facture, 'la porte décide');
end $$;
reset role;

-- Même si quelqu'un redonne le droit par erreur, le déclencheur refuse.
grant insert on public.courriels_recus to porte;
set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
select pg_temp.doit_echouer('insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat) values (''c'', ''b'', ''w'', ''<p2@exemple.test>'', ''accepte'')', 'reflet_robot_seulement');
reset role;
