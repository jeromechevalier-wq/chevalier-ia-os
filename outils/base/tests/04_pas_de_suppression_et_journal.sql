-- 04 : jamais de vraie suppression (règle 6) et journal avant / après en ajout seul (règle 7).
\ir aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7100001');
reset role;

-- DELETE et TRUNCATE : la porte n'en a pas le droit, sur aucune table ni vue.
do $$
declare r record;
begin
  set role porte;
  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') loop
    perform pg_temp.doit_echouer(format('delete from public.%I', r.relname), null);
  end loop;
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    perform pg_temp.doit_echouer(format('truncate public.%I', r.relname), null);
  end loop;
  reset role;
end $$;

-- Même le propriétaire des tables (compte d'administration) ne supprime pas : le déclencheur refuse (« on archive »).
do $$
declare r record;
begin
  perform pg_temp.entrer('espace-a', 'admin@exemple.test');
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' loop
    perform pg_temp.doit_echouer(format('delete from public.%I', r.relname), 'suppression_interdite');
    perform pg_temp.doit_echouer(format('truncate public.%I cascade', r.relname), 'suppression_interdite');
  end loop;
end $$;

-- Le journal : chaque ajout et chaque modification laisse une ligne avec l'avant et l'après, la personne et l'heure de la base.
set role porte;
select pg_temp.entrer('espace-a', 'carole@exemple.test');
do $$
declare v_id uuid; v_n int; j public.journal_modifications%rowtype;
begin
  insert into public.chantiers (nom, code, budget_ht) values ('Chantier journal', 'CH-J', 100) returning id into v_id;
  select * into j from public.journal_modifications where table_nom = 'chantiers' and enregistrement_id = v_id and action = 'insert';
  if not found then raise exception 'Journal : pas de ligne pour l''ajout'; end if;
  perform pg_temp.egal(j.qui, 'carole@exemple.test', 'journal.qui');
  perform pg_temp.egal(j.avant, null::jsonb, 'journal.avant d''un ajout');
  perform pg_temp.egal(j.apres ->> 'nom', 'Chantier journal', 'journal.apres');

  update public.chantiers set budget_ht = 200 where id = v_id;
  select * into j from public.journal_modifications where table_nom = 'chantiers' and enregistrement_id = v_id and action = 'update' order by id desc limit 1;
  perform pg_temp.egal(j.avant ->> 'budget_ht', '100.00', 'journal.avant');
  perform pg_temp.egal(j.apres ->> 'budget_ht', '200.00', 'journal.apres');

  -- Rien n'a changé : pas de ligne de plus.
  select count(*) into v_n from public.journal_modifications where enregistrement_id = v_id;
  update public.chantiers set budget_ht = 200 where id = v_id;
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where enregistrement_id = v_id), v_n, 'journal quand rien ne change');

  -- Ajout seul : une ligne du journal ne se modifie pas, ne se supprime pas.
  perform pg_temp.doit_echouer(format('update public.journal_modifications set qui = %L where id = %s', 'pirate', j.id), 'ajout_seul');
  perform pg_temp.doit_echouer(format('delete from public.journal_modifications where id = %s', j.id), null);
  -- L'heure d'une ligne du journal vient toujours de la base.
  insert into public.journal_modifications (table_nom, action, qui, quand) values ('chantiers', 'modification', 'carole@exemple.test', timestamptz '2000-01-01') returning * into j;
  if j.quand < now() - interval '1 minute' then raise exception 'journal.quand ne vient pas de la base'; end if;

  -- Les décisions, corrections et scans des factures sont aussi en ajout seul.
  perform pg_temp.doit_echouer('update public.factures_decisions set motif_refus = ''x''', 'ajout_seul');
  perform pg_temp.doit_echouer('update public.factures_scans set montant_ht = 1', 'ajout_seul');
  perform pg_temp.doit_echouer('update public.courriels_recus set sujet = ''x''', 'ajout_seul');
end $$;

-- Les fonctions qui « enlevaient » des lignes archivent maintenant : dissocier un rapprochement le garde, archivé.
do $$
declare v_art uuid := (select article_id from ids_a); v_n int;
begin
  perform public.dissocier_rapprochement(v_art, 'carole@exemple.test');
  select count(*) into v_n from public.rapprochements_articles where article_fournisseur_id = v_art;
  perform pg_temp.egal(v_n, 0, 'rapprochement visible après dissociation');
  select count(*) into v_n from public.rapprochements_articles_tous where article_fournisseur_id = v_art and archive_le is not null;
  perform pg_temp.egal(v_n, 1, 'rapprochement gardé (archivé) après dissociation');
  -- Un favori retiré est archivé, puis peut revenir (les favoris sont ceux de la personne : ici celle qui l'a posé).
  perform pg_temp.egal((select count(*)::int from public.lister_favoris_os()), 0, 'les favoris d''une autre personne ne se voient pas');
  perform pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
  perform pg_temp.egal(public.basculer_favori_os('chantier', (select chantier_id::text from ids_a)), false, 'retrait du favori');
  perform pg_temp.egal((select count(*)::int from public.favoris_os where archive_le is not null), 1, 'favori archivé');
  perform pg_temp.egal(public.basculer_favori_os('chantier', (select chantier_id::text from ids_a)), true, 'favori remis');
end $$;
reset role;
