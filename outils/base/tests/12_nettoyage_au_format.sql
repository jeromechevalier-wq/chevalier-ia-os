-- 12 : la migration 010 met les anciennes valeurs au format des listes fermées (base de test SCAB 04), sans rien inventer,
-- seulement quand l'e-mail de Jérôme est donné au moment de la jouer, et en laissant une trace au journal. Données INVENTÉES.
\ir aides.inc
set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7700001');
grant select on ids_a to public;   -- le compte d'administration (pas superutilisateur dans Cloud SQL) la lit aussi
reset role;

-- Des valeurs « d'avant » (écrites avant 009) : on retire les contraintes le temps de les écrire, comme dans une base déjà remplie.
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
alter table public.journal_modifications drop constraint journal_modifications_qui_liste;
alter table public.factures_decisions drop constraint factures_decisions_decide_par_liste;
alter table public.chantiers drop constraint chantiers_cree_par_liste;
alter table public.chantiers drop constraint chantiers_modifie_par_liste;
insert into public.journal_modifications (table_nom, action, qui) values ('factures', 'modification', 'validé par Claude sur son ordre');
insert into public.journal_modifications (table_nom, action, qui) values ('factures', 'modification', 'script de reprise du 24/11');
insert into public.journal_modifications (table_nom, action, qui) values ('factures', 'modification', 'n8n (robot)');
alter table public.factures_decisions disable trigger user;
update public.factures_decisions set decide_par = 'Jérôme' where facture_id = (select facture_refusee_id from ids_a);
alter table public.factures_decisions enable trigger user;
alter table public.chantiers disable trigger user;
update public.chantiers set cree_par = 'Jérôme', modifie_par = 'script d''import' where id = (select chantier_id from ids_a);   -- deux colonnes hors liste
alter table public.chantiers enable trigger user;

-- 1. Sans e-mail donné : rien n'est réécrit, les contraintes restent posées (pour les nouvelles lignes) sans être validées.
\ir ../migrations/010_nettoyage_au_format.sql
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
do $$
begin
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where qui = 'validé par Claude sur son ordre'), 1, 'sans e-mail : rien de réécrit');
  perform pg_temp.egal((select convalidated from pg_constraint where conname = 'journal_modifications_qui_liste'), false, 'contrainte posée, pas validée');
  -- Elle vaut déjà pour une nouvelle ligne.
  perform pg_temp.doit_echouer('insert into public.journal_modifications (table_nom, action, qui) values (''factures'', ''modification'', ''Jérôme'')',
    'MESSAGE:journal_modifications_qui_liste');
end $$;

-- 2. Avec l'e-mail (donné au moment de jouer la migration, jamais écrit dans le dépôt).
\set email_jerome 'jerome@exemple.test'
\ir ../migrations/010_nettoyage_au_format.sql
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
do $$
declare v_n int; v text;
begin
  -- « validé par Claude sur son ordre » -> l'e-mail de Jérôme, par l'assistant Claude.
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where qui = 'validé par Claude sur son ordre'), 0, 'phrase réécrite');
  perform pg_temp.egal((select count(*)::int from public.journal_modifications
                         where qui = 'jerome@exemple.test' and par_ou = 'assistant:claude' and action = 'modification'), 1, 'Claude -> Jérôme par l''assistant');
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where qui = 'migration' and par_ou = 'migration' and action = 'modification'), 1,
    'script -> migration');
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where qui = 'n8n' and par_ou = 'n8n' and action = 'modification'), 1, 'robot -> n8n');
  -- Une décision est toujours d'une personne : « Jérôme » -> son e-mail.
  perform pg_temp.egal((select decide_par from public.factures_decisions where facture_id = (select facture_refusee_id from ids_a) order by rang desc limit 1),
    'jerome@exemple.test', 'décision -> e-mail');
  perform pg_temp.egal((select motif_type from public.factures_decisions where facture_id = (select facture_refusee_id from ids_a) order by rang desc limit 1),
    'doublon', 'type de motif déduit du commentaire');
  perform pg_temp.egal((select cree_par from public.chantiers where id = (select chantier_id from ids_a)), 'jerome@exemple.test', 'cree_par -> e-mail');
  perform pg_temp.egal((select modifie_par from public.chantiers where id = (select chantier_id from ids_a)), 'migration', 'modifie_par (même ligne) -> migration');
  perform pg_temp.egal((select moyen_type from public.ibans_confirmes limit 1), 'appel_fournisseur', 'moyen de vérification déduit du commentaire');
  perform pg_temp.egal((select moyen_verification from public.ibans_confirmes limit 1), 'Appel au MARQA', 'le commentaire libre reste');
  -- Chaque réécriture laisse une ligne au journal, avec l'avant et l'après.
  select count(*) into v_n from public.journal_modifications where action = 'mise_au_format' and qui = 'migration';
  if v_n < 8 then raise exception 'Journal de la mise au format : % lignes seulement', v_n; end if;
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where action = 'mise_au_format'
                         and avant ->> 'qui' = 'validé par Claude sur son ordre' and apres ->> 'qui' = 'jerome@exemple.test'), 1, 'avant / après au journal');
  -- Toutes les contraintes de liste sont maintenant validées.
  select string_agg(conname, ', ') into v from pg_constraint
   where connamespace = 'public'::regnamespace and contype = 'c' and conname like '%\_liste' and not convalidated;
  if v is not null then raise exception 'Contraintes encore non validées : %', v; end if;
  -- Les verrous sont remis : déclencheurs actifs, sécurité par ligne forcée.
  select string_agg(g.tgrelid::regclass || '.' || g.tgname, ', ') into v from pg_trigger g join pg_class c on c.oid = g.tgrelid
   where c.relnamespace = 'public'::regnamespace and not g.tgisinternal and g.tgenabled <> 'O';
  if v is not null then raise exception 'Déclencheurs restés coupés : %', v; end if;
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'registre_tables' and not c.relforcerowsecurity;
  if v is not null then raise exception 'Sécurité par ligne plus forcée sur : %', v; end if;
end $$;
-- Le journal est toujours en ajout seul.
select pg_temp.doit_echouer('update public.journal_modifications set qui = ''n8n''', 'ajout_seul');

-- 3. Rejouer : rien de plus (une valeur déjà au format n'est plus touchée).
create temp table avant_rejeu as select count(*)::int as n from public.journal_modifications where action = 'mise_au_format';
\ir ../migrations/010_nettoyage_au_format.sql
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
do $$
begin
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where action = 'mise_au_format'), (select n from avant_rejeu), 'rejeu sans effet');
end $$;

