-- 03 : qui et quand (règle 4), dates avec fuseau (règle 5), archivage au lieu de suppression (règle 6).
-- Les colonnes cree_le / cree_par / modifie_le / modifie_par / archive_le / archive_par sont remplies par la BASE, jamais par la requête.
\ir aides.inc
set role porte;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
declare v public.chantiers%rowtype; v_avant timestamptz := clock_timestamp();
begin
  -- La requête essaie de mentir sur qui et quand : la base l'ignore.
  insert into public.chantiers (nom, code, cree_par, cree_le, modifie_par, modifie_le)
  values ('Chantier qui-quand', 'CH-QQ', 'pirate', timestamptz '2000-01-01', 'pirate', timestamptz '2000-01-01')
  returning * into v;
  perform pg_temp.egal(v.cree_par, 'alice@exemple.test', 'cree_par à la création');
  perform pg_temp.egal(v.modifie_par, 'alice@exemple.test', 'modifie_par à la création');
  if v.cree_le < now() - interval '1 minute' or v.modifie_le < now() - interval '1 minute' then
    raise exception 'cree_le / modifie_le ne viennent pas de la base : %, %', v.cree_le, v.modifie_le;
  end if;
  perform pg_temp.egal(v.created_at, v.cree_le, 'created_at (ancien nom) = cree_le');
  perform pg_temp.egal(v.espace_id, 'espace-a', 'espace_id rempli par la base');

  -- Une autre personne modifie : modifie_par change, cree_par et cree_le restent.
  perform pg_temp.entrer('espace-a', 'bob@exemple.test');
  update public.chantiers set nom = 'Chantier renommé', cree_par = 'pirate', cree_le = timestamptz '2000-01-01' where id = v.id;
  select * into v from public.chantiers where id = v.id;
  perform pg_temp.egal(v.cree_par, 'alice@exemple.test', 'cree_par après modification');
  perform pg_temp.egal(v.modifie_par, 'bob@exemple.test', 'modifie_par après modification');
  if v.cree_le < now() - interval '1 minute' then raise exception 'cree_le a été écrasé'; end if;

  -- Archiver : la base met l'heure et la personne (l'heure envoyée est ignorée).
  update public.chantiers set archive_le = timestamptz '2000-01-01' where id = v.id;
  select * into v from public.chantiers where id = v.id;
  perform pg_temp.egal(v.archive_par, 'bob@exemple.test', 'archive_par');
  if v.archive_le < now() - interval '1 minute' then raise exception 'archive_le ne vient pas de la base'; end if;
  perform pg_temp.egal(v.archive, true, 'chantiers.archive suit archive_le');
  -- Désarchiver remet les deux à vide.
  update public.chantiers set archive_le = null where id = v.id;
  select * into v from public.chantiers where id = v.id;
  perform pg_temp.egal(v.archive_par, null::text, 'archive_par après désarchivage');
  perform pg_temp.egal(v.archive, false, 'chantiers.archive après désarchivage');
  -- Une ligne ne naît pas archivée.
  perform pg_temp.doit_echouer('insert into public.chantiers (nom, code, archive_le, archive_par) values (''X'', ''CH-X'', now(), ''bob'')', 'archivage_a_la_creation');
  -- Une ligne ne change jamais d'espace.
  perform pg_temp.doit_echouer(format('update public.chantiers set espace_id = %L where id = %L', 'espace-b', v.id), null);
end $$;

-- Sans personne connue (app.utilisateur vide), rien ne s'écrit.
select pg_temp.entrer('espace-a', '');
select pg_temp.doit_echouer('insert into public.chantiers (nom, code) values (''Sans personne'', ''CH-SP'')', 'utilisateur_manquant');
select pg_temp.doit_echouer('update public.chantiers set nom = ''x''', 'utilisateur_manquant');
reset role;

-- Règle 5 : la base travaille en heure avec fuseau ; une heure écrite avec un autre fuseau désigne le même instant.
do $$
begin
  if timestamptz '2026-11-25 10:00:00+01' <> timestamptz '2026-11-25 09:00:00+00' then raise exception 'fuseaux'; end if;
end $$;
