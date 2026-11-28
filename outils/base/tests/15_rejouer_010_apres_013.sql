-- 15 : « 010/013 » : rejouer 010 (avec l'e-mail) APRÈS les migrations suivantes ne fait disparaître AUCUNE contrainte de vérification.
-- 010 retire toutes les contraintes « …_liste » le temps de la réécriture ; elle doit reposer aussi celles qu'elle n'a pas posées
-- (ex. mode_emploi_champs_categorie_liste et mode_emploi_champs_modifiable_liste, posées par 013). Données INVENTÉES.
\ir aides.inc

-- Photo de toutes les contraintes de vérification avant (nom, table, définition, validée ou non).
create temp table contraintes_avant as
  select k.conrelid::regclass::text as t, k.conname as nom, pg_get_constraintdef(k.oid) as def, k.convalidated as valide
    from pg_constraint k where k.connamespace = 'public'::regnamespace and k.contype = 'c';

-- Rejouer 010 avec l'e-mail (inventé), une première puis une seconde fois.
\set email_jerome 'jerome@exemple.test'
\ir ../migrations/010_nettoyage_au_format.sql
\ir ../migrations/010_nettoyage_au_format.sql

do $$
declare v text;
begin
  -- 010/013 : les deux contraintes de 013 sont là, validées.
  perform pg_temp.egal((select count(*)::int from pg_constraint where conname = 'mode_emploi_champs_categorie_liste' and convalidated), 1,
    '010/013 : mode_emploi_champs_categorie_liste toujours là après 010');
  perform pg_temp.egal((select count(*)::int from pg_constraint where conname = 'mode_emploi_champs_modifiable_liste' and convalidated), 1,
    '010/013 : mode_emploi_champs_modifiable_liste toujours là après 010');
  -- 010/013 : aucune contrainte de vérification perdue ni changée (même définition ; une contrainte validée le reste).
  select string_agg(a.t || '.' || a.nom, ', ') into v from contraintes_avant a
   where not exists (select 1 from pg_constraint k where k.connamespace = 'public'::regnamespace and k.contype = 'c'
                       and k.conrelid::regclass::text = a.t and k.conname = a.nom and pg_get_constraintdef(k.oid) = a.def
                       and (k.convalidated or not a.valide));
  if v is not null then raise exception '010/013 : contraintes perdues ou changées après 010 : %', v; end if;
end $$;

-- 010/013 : elles refusent toujours une valeur hors liste.
select pg_temp.entrer(null, 'migration');
select pg_temp.doit_echouer($q$insert into public.mode_emploi_champs (objet, champ, categorie, modifiable) values ('factures', 'essai_x', 'inventee', 'oui')$q$,
  'MESSAGE:mode_emploi_champs_categorie_liste');
select pg_temp.doit_echouer($q$insert into public.mode_emploi_champs (objet, champ, categorie, modifiable) values ('factures', 'essai_y', 'saisi', 'peut_etre')$q$,
  'MESSAGE:mode_emploi_champs_modifiable_liste');
