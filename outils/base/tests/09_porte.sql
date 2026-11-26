-- 09 : consommer_ticket_porte (migration 008) : le ticket n8n rend un uuid stable tiré de l'e-mail. Données INVENTÉES seulement.
\ir aides.inc

-- Même nom, mêmes paramètres, mêmes colonnes que consommer_ticket (les workflows lisent courriel, espace, utilisateur).
do $$ begin
  if to_regprocedure('public.consommer_ticket_porte(text, text)') is null then
    raise exception 'consommer_ticket_porte(p_ticket text, p_usage text) manque';
  end if;
  perform pg_temp.egal(
    (select pg_get_function_result('public.consommer_ticket_porte(text, text)'::regprocedure)),
    'TABLE(courriel text, espace text, utilisateur text)', 'colonnes rendues par consommer_ticket_porte');
  if (select prosecdef from pg_proc where oid = 'public.consommer_ticket_porte(text, text)'::regprocedure) then
    raise exception 'consommer_ticket_porte ne doit pas être SECURITY DEFINER';
  end if;
  -- Droits : porte et robot_reflets oui ; indicateurs et public non.
  if not has_function_privilege('porte', 'public.consommer_ticket_porte(text, text)', 'execute')
     or not has_function_privilege('robot_reflets', 'public.consommer_ticket_porte(text, text)', 'execute') then
    raise exception 'porte et robot_reflets doivent pouvoir lancer consommer_ticket_porte';
  end if;
  if has_function_privilege('indicateurs', 'public.consommer_ticket_porte(text, text)', 'execute') then
    raise exception 'indicateurs ne doit pas pouvoir consommer un ticket';
  end if;
  if exists (select 1 from information_schema.routine_privileges
             where routine_name = 'consommer_ticket_porte' and grantee = 'PUBLIC') then
    raise exception 'consommer_ticket_porte ne doit pas être ouverte à tous (PUBLIC)';
  end if;
end $$;

set role porte;
-- Alice (espace A) demande deux tickets ; l'e-mail arrive avec des majuscules : l'uuid ne dépend pas de la casse.
select pg_temp.entrer('espace-a', 'Alice@Exemple.test');
create temp table t_tickets as select public.demander_ticket_n8n('validation') as t1, public.demander_ticket_n8n('actions') as t2;
-- Bob (espace B) demande un ticket.
select pg_temp.entrer('espace-b', 'bob@exemple.test');
insert into t_tickets (t1) select public.demander_ticket_n8n('validation');

select pg_temp.entrer('espace-a', 'n8n');
do $$
declare v_t1 text; v_t2 text; v_bob text; r record; v_nb int;
begin
  select t1, t2 into v_t1, v_t2 from t_tickets where t2 is not null;
  select t1 into v_bob from t_tickets where t2 is null;

  -- Mauvais usage : rien (et le ticket reste utilisable).
  select count(*) into v_nb from public.consommer_ticket_porte(v_t1, 'actions');
  perform pg_temp.egal(v_nb, 0, 'ticket « validation » consommé pour « actions »');

  -- Bon usage : une ligne, uuid = md5(lower(e-mail)).
  select * into r from public.consommer_ticket_porte(v_t1, 'validation');
  perform pg_temp.egal(r.courriel, 'alice@exemple.test', 'courriel rendu');
  perform pg_temp.egal(r.espace, 'espace-a', 'espace rendu');
  perform pg_temp.egal(r.utilisateur, md5('alice@exemple.test')::uuid::text, 'utilisateur = md5(lower(e-mail))::uuid');
  if r.utilisateur !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'utilisateur n''a pas la forme d''un uuid : %', r.utilisateur;
  end if;

  -- Une seule fois.
  select count(*) into v_nb from public.consommer_ticket_porte(v_t1, 'validation');
  perform pg_temp.egal(v_nb, 0, 'ticket consommé deux fois');

  -- Le 2e ticket de la même personne donne le MÊME uuid (stable).
  perform pg_temp.egal((select c.utilisateur from public.consommer_ticket_porte(v_t2, 'actions') c),
                       md5('alice@exemple.test')::uuid::text, 'uuid stable d''un ticket à l''autre');

  -- Ticket inconnu, vide ou nul : rien.
  select count(*) into v_nb from public.consommer_ticket_porte('inconnu', 'validation');
  perform pg_temp.egal(v_nb, 0, 'ticket inconnu');
  select count(*) into v_nb from public.consommer_ticket_porte(null, 'validation');
  perform pg_temp.egal(v_nb, 0, 'ticket nul');

  -- Le ticket de Bob (espace B) est introuvable depuis l'espace A.
  select count(*) into v_nb from public.consommer_ticket_porte(v_bob, 'validation');
  perform pg_temp.egal(v_nb, 0, 'ticket d''un autre espace consommé');
end $$;

-- Depuis l'espace B, le ticket de Bob passe, avec un uuid différent de celui d'Alice.
select pg_temp.entrer('espace-b', 'n8n');
do $$
declare r record;
begin
  select * into r from public.consommer_ticket_porte((select t1 from t_tickets where t2 is null), 'validation');
  perform pg_temp.egal(r.courriel, 'bob@exemple.test', 'courriel de Bob');
  perform pg_temp.egal(r.utilisateur, md5('bob@exemple.test')::uuid::text, 'uuid de Bob');
  if r.utilisateur = md5('alice@exemple.test')::uuid::text then raise exception 'Alice et Bob ont le même uuid'; end if;
end $$;
reset role;

-- indicateurs ne peut pas la lancer.
set role indicateurs;
select pg_temp.entrer('espace-a', 'n8n');
select pg_temp.doit_echouer($q$select * from public.consommer_ticket_porte('x', 'validation')$q$, 'MESSAGE:permission denied');
reset role;
