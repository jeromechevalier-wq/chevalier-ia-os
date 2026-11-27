-- 08 : les fonctions du module Articles appelées par l'OS (C4) marchent sous leur nom d'aujourd'hui, et « enlever » = archiver.
-- creer_article_reference, valider_rapprochement, dissocier_rapprochement, refuser_suggestion, reprendre_suggestion, renommer_reference,
-- plus suggerer_rapprochement, suggerer_groupe_rapprochement, lot_articles_a_suggerer, catalogue_a_rapprocher.
\ir aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7500001');
do $$
declare
  v_four uuid := (select fournisseur_id from ids_a);
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_ref uuid; v_res jsonb; v_n int;
begin
  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  insert into public.articles_fournisseur (fournisseur_id, reference, designation, unite) values (v_four, 'P1', 'Plâtre 25 kg', 'sac') returning id into v_a1;
  insert into public.articles_fournisseur (fournisseur_id, reference, designation, unite) values (v_four, 'P2', 'Plâtre 40 kg', 'sac') returning id into v_a2;
  insert into public.articles_fournisseur (fournisseur_id, reference, designation, unite) values (v_four, 'P3', 'Plâtre fin', 'sac') returning id into v_a3;

  -- Le lot pour l'IA ne propose que des articles sans rapprochement, et compte ses passages.
  perform pg_temp.egal((select count(*)::int from public.lot_articles_a_suggerer(40) l where l.id in (v_a1, v_a2, v_a3)), 3, 'lot à suggérer');
  perform pg_temp.egal((select tentatives from public.suggestions_tentees where article_fournisseur_id = v_a1), 1, 'tentative comptée');

  -- L'IA suggère un groupe ; une personne refuse une suggestion puis la reprend, valide, renomme, dissocie.
  v_res := public.suggerer_groupe_rapprochement('Plâtre', 'kg', jsonb_build_array(
    jsonb_build_object('article_fournisseur_id', v_a1, 'coefficient', 25), jsonb_build_object('article_fournisseur_id', v_a2, 'coefficient', 40)), 'n8n');
  perform pg_temp.egal((v_res ->> 'ecrits')::int, 2, 'groupe suggéré');
  select r.article_reference_id into v_ref from public.rapprochements_articles r where r.article_fournisseur_id = v_a1;
  perform public.refuser_suggestion(v_a1, 'alice@exemple.test');
  perform pg_temp.egal((select count(*)::int from public.suggestions_refusees where article_fournisseur_id = v_a1), 1, 'refus noté');
  perform pg_temp.egal((select count(*)::int from public.rapprochements_articles_tous where article_fournisseur_id = v_a1 and archive_le is not null), 1, 'suggestion archivée, pas effacée');
  perform pg_temp.egal((select count(*)::int from public.catalogue_a_rapprocher(400) c where c.id = v_a1), 0, 'un article refusé ne revient pas au catalogue');
  perform public.reprendre_suggestion(v_a1, 'alice@exemple.test');
  perform pg_temp.egal((select count(*)::int from public.suggestions_refusees where article_fournisseur_id = v_a1), 0, 'refus levé');
  perform pg_temp.egal((select count(*)::int from public.suggestions_refusees_tous where article_fournisseur_id = v_a1), 1, 'refus gardé (archivé)');
  perform public.valider_rapprochement(v_a1, v_ref, 25, 'alice@exemple.test');
  perform pg_temp.egal((select suggere_par_ia from public.rapprochements_articles where article_fournisseur_id = v_a1), true, 'on garde la trace de l''IA');
  perform pg_temp.doit_echouer(format('select public.refuser_suggestion(%L, %L)', v_a1, 'alice@exemple.test'), 'rapprochement_deja_valide');
  perform public.renommer_reference(v_ref, 'Plâtre en sac', 'alice@exemple.test');
  perform pg_temp.egal((select nom from public.articles_reference where id = v_ref), 'Plâtre en sac', 'renommé');
  perform pg_temp.doit_echouer(format('select public.renommer_reference(%L, %L, %L)', v_ref, (select nom from public.articles_reference where id <> v_ref limit 1), 'alice@exemple.test'), 'nom_deja_pris');

  -- Dissocier les deux : la référence se désactive (plus aucun rapprochement), puis se réactive au rapprochement suivant.
  perform public.dissocier_rapprochement(v_a1, 'alice@exemple.test');
  perform public.refuser_suggestion(v_a2, 'alice@exemple.test');
  perform pg_temp.egal((select actif from public.articles_reference where id = v_ref), false, 'référence désactivée');
  perform public.valider_rapprochement(v_a3, v_ref, 1, 'alice@exemple.test');
  perform pg_temp.egal((select actif from public.articles_reference where id = v_ref), true, 'référence réactivée');
  -- Re-valider un article déjà dissocié : un nouveau rapprochement en cours, l'ancien reste archivé.
  perform public.valider_rapprochement(v_a1, v_ref, 25, 'alice@exemple.test');
  select count(*) into v_n from public.rapprochements_articles_tous where article_fournisseur_id = v_a1;
  perform pg_temp.egal(v_n, 3, 'historique des rapprochements de l''article (suggestion, validation, nouvelle validation)');
  perform pg_temp.egal((select count(*)::int from public.rapprochements_articles where article_fournisseur_id = v_a1), 1, 'un seul en cours');
  -- Chaque geste est au journal.
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where table_nom = 'rapprochements_articles' and enregistrement_id = v_a1
                        and action in ('suggestion', 'refus de suggestion', 'reprise de suggestion', 'validation', 'dissociation')), 6, 'journal des gestes');
end $$;
reset role;
