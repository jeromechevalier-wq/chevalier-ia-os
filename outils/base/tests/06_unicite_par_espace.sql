-- 06 : les unicités sont PAR espace (règle 1) : la même valeur est permise dans deux espaces, refusée deux fois dans le même.
\ir aides.inc
set role porte;
do $$
declare v_siren text := pg_temp.siren('7200001'); v_esp text; v_id uuid;
begin
  foreach v_esp in array array['espace-a', 'espace-b'] loop
    perform pg_temp.entrer(v_esp, 'alice@exemple.test');
    insert into public.chantiers (nom, code) values ('Chantier', 'CH-0001');
    insert into public.fournisseurs (siren, nom) values (v_siren, 'Fournisseur');
    insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat)
      values ('client', 'factures@exemple.test', 'lecture', '<meme@exemple.test>', 'accepte');
    perform public.creer_article_reference('Ciment', 'sac', 'alice');
    insert into public.n8n_executions (workflow_id, workflow_nom, execution_id, resultat) values ('wf', 'Lecture', 'ex-1', 'ok');
    insert into public.factures (numero, montant_ht, extraction) values ('F-1', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)));
  end loop;
  -- Deux factures (une par espace), pas une seule.
  perform pg_temp.egal((select count(*)::int from public.factures), 1, 'une facture dans B');

  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  perform pg_temp.doit_echouer('insert into public.chantiers (nom, code) values (''Autre'', ''ch-0001'')', null);
  perform pg_temp.doit_echouer(format('insert into public.fournisseurs (siren, nom) values (%L, %L)', v_siren, 'Doublon'), null);
  perform pg_temp.doit_echouer('insert into public.courriels_recus (client, boite, workflow, email_message_id, resultat) values (''client'', ''factures@exemple.test'', ''lecture'', ''<meme@exemple.test>'', ''accepte'')', null);
  perform pg_temp.doit_echouer('insert into public.articles_reference (nom, unite_reference) values (''ciment'', ''sac'')', null);
  perform pg_temp.doit_echouer('insert into public.n8n_executions (workflow_id, workflow_nom, execution_id, resultat) values (''wf'', ''Lecture'', ''ex-1'', ''ok'')', null);
  -- Le code automatique des chantiers est compté par espace.
  v_id := public.creer_chantier('Suivant', null, null, null, 0, null, null, null, 'alice');
  perform pg_temp.egal((select c.code from public.chantiers c where c.id = v_id), 'CH-0002', 'code suivant dans A');
end $$;
reset role;
