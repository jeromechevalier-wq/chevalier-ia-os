-- Test de a-activer/003_qui_verifie.sql (joué seulement avec « node tester.js --avec-a-activer »).
-- Quand il est appliqué : la personne d'une décision et du journal est celle de la requête (app.utilisateur, identité vérifiée par la porte),
-- jamais le nom envoyé dans p_qui ou decide_par.
\ir ../aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7900001');
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare v_f uuid; v_siren text := pg_temp.siren('7900002');
begin
  perform pg_temp.robot('n8n');
  insert into public.factures (numero, montant_ht, extraction) values ('Q-1', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
    returning id into v_f;
  perform pg_temp.redevenir('porte', 'alice@exemple.test');
  -- La requête dit « pirate » : la base écrit alice (la personne de la requête).
  update public.factures set statut = 'refusee', motif_refus = 'Doublon', decide_par = 'pirate@exemple.test', decide_par_id = gen_random_uuid() where id = v_f;
  perform pg_temp.egal((select decide_par from public.factures_decisions where facture_id = v_f order by rang desc limit 1), 'alice@exemple.test', 'decide_par = la personne de la requête');
  perform public.journaliser_modification('factures', v_f, 'modification', 'pirate@exemple.test', null, null, null);
  perform pg_temp.egal((select qui from public.journal_modifications order by id desc limit 1), 'alice@exemple.test', 'journal : qui = la personne de la requête');
  perform public.dissocier_rapprochement((select article_id from ids_a), 'pirate@exemple.test');
  perform public.valider_rapprochement((select article_id from ids_a), (select reference_id from ids_a), 1, 'pirate@exemple.test');
  perform pg_temp.egal((select valide_par from public.rapprochements_articles where article_fournisseur_id = (select article_id from ids_a)), 'alice@exemple.test',
    'valide_par = la personne de la requête');
  -- Une ligne ajoutée en direct au journal : même chose.
  insert into public.journal_modifications (table_nom, action, qui) values ('factures', 'modification', 'pirate@exemple.test');
  perform pg_temp.egal((select qui from public.journal_modifications order by id desc limit 1), 'alice@exemple.test', 'journal direct : qui = la personne de la requête');
  -- Une validation déjà faite garde sa personne (une autre personne qui touche la ligne ne la reprend pas).
  perform pg_temp.entrer('espace-a', 'bob@exemple.test');
  update public.rapprochements_articles_tous set valide_par = 'pirate@exemple.test' where article_fournisseur_id = (select article_id from ids_a) and archive_le is null;
  perform pg_temp.egal((select valide_par from public.rapprochements_articles where article_fournisseur_id = (select article_id from ids_a)), 'alice@exemple.test',
    'valide_par gardé');
  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where qui = 'pirate@exemple.test'), 0, 'aucun nom envoyé n''entre au journal');
end $$;
reset role;
