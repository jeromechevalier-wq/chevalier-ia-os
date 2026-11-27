-- 13 : migration 012 (branchée le 27/11/2026, était a-activer/001). Un reflet ne s'écrit que par le robot ; la porte décide toujours ;
-- et « par où » est posé par la base à partir du réglage de la porte (app.par_ou), jamais à partir de la requête.
\ir aides.inc
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
  perform pg_temp.doit_echouer('insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat) values (''c'', ''b'', ''w'', ''<p@exemple.test>'', ''accepte'')', 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer('insert into public.factures (numero, montant_ht) values (''P-1'', 1)', 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer(format('select public.remplacer_lignes_facture(%L, %L, %L)', v_f, '[]', 'alice@exemple.test'), 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer('insert into public.n8n_executions (workflow_id, workflow_nom, resultat) values (''wf'', ''x'', ''ok'')', 'MESSAGE:permission denied');
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

-- Chaque reflet du registre a son cadenas (déclencheur) ; le robot n'a le droit de modifier aucun reflet (sauf la case archive_le des lignes lues).
do $$
declare r record;
begin
  for r in select t.nom_table from public.registre_tables t where t.nature = 'reflet' loop
    if not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || r.nom_table)::regclass and g.tgname = 'ab_reflet_robot_seulement') then
      raise exception 'Reflet sans cadenas : %', r.nom_table;
    end if;
    if has_table_privilege('robot_reflets', ('public.' || r.nom_table)::regclass, 'UPDATE') then
      raise exception 'Le robot peut encore modifier le reflet %', r.nom_table;
    end if;
  end loop;
  if not has_column_privilege('robot_reflets', 'public.lignes_facture_lues', 'archive_le', 'UPDATE') then
    raise exception 'Le robot ne peut plus archiver les lignes lues';
  end if;
end $$;
-- Même l'administrateur (qui peut tout) ne modifie pas un reflet : le déclencheur « ajout seul » tient toujours.
select pg_temp.entrer('espace-a', 'migration');
select pg_temp.doit_echouer('update public.courriels_recus set sujet = ''changé''', 'ajout_seul');
select pg_temp.doit_echouer('update public.n8n_executions set resultat = ''ok''', 'ajout_seul');

-- Par où (règle 4) : chaque table a le déclencheur, et la valeur vient du réglage, pas de la requête.
do $$
declare v text;
begin
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'az_socle_par_ou');
  if v is not null then raise exception 'Règle 4 : tables sans « par où » posé par la base : %', v; end if;
end $$;
set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare v_id uuid;
begin
  perform set_config('app.par_ou', 'ecran', false);
  insert into public.chantiers (nom, code, par_ou) values ('Chantier par où', 'CH-PO', 'n8n:menteur') returning id into v_id;
  perform pg_temp.egal((select par_ou from public.chantiers where id = v_id), 'ecran', 'par où = la voie de la porte, pas la requête');
  perform pg_temp.egal((select par_ou from public.journal_modifications where enregistrement_id = v_id order by id desc limit 1), 'ecran', 'par où au journal');
  perform set_config('app.par_ou', 'assistant', false);
  update public.chantiers set nom = 'Chantier par où (renommé)' where id = v_id;
  perform pg_temp.egal((select par_ou from public.chantiers where id = v_id), 'assistant', 'par où de la dernière écriture');
  -- Sans réglage (ancienne porte) : vide, rien n'est refusé.
  perform set_config('app.par_ou', '', false);
  update public.chantiers set nom = 'Chantier par où (2)' where id = v_id;
  perform pg_temp.egal((select par_ou from public.chantiers where id = v_id), null::text, 'sans réglage : vide');
end $$;
reset role;
