-- 00 : vérifie que les aides des tests marchent (chaque fichier de test les recrée pour sa session, voir aides.inc).
\ir aides.inc
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$ begin
  if public.espace_courant() <> 'espace-a' or public.utilisateur_courant() <> 'alice@exemple.test' then raise exception 'entrer() ne marche pas'; end if;
  perform pg_temp.doit_echouer('select 1/0', null);
end $$;
set role porte;
select pg_temp.entrer('espace-b', 'bob@exemple.test');
select pg_temp.doit_echouer('select 1/0', null);
reset role;
