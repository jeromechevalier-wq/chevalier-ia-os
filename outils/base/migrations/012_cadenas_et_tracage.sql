-- 012 : cadenas des reflets et traçage « par où » (règles 3, 4, 15 ; décisions de Jérôme du 27/11/2026).
--
-- 1. « Par où » (règle 4) : chaque ligne écrite porte le chemin de la dernière écriture (écran, assistant, n8n…), posé par la BASE à partir
--    du réglage app.par_ou. Ce réglage est écrit par la porte (functions/src/base/porte-base.js) d'après la voie qu'elle a reconnue
--    (jeton Firebase = écran, connexion de l'assistant = assistant, clé de n8n = n8n), jamais lu dans la requête. Ce que la requête envoie
--    dans la colonne par_ou est ignoré. Sans réglage (ancienne porte, migration jouée à la main) : par_ou reste vide, rien n'est refusé.
-- 2. Reflets en ajout seul pour TOUT le monde, robot compris (règle 15) : le droit UPDATE donné par 007 est retiré ; seule exception,
--    la case du tampon de fin des lignes lues (archive_le), par laquelle remplacer_lignes_facture archive les anciennes lignes.
--    (Les autres reflets refusaient déjà toute modification par un déclencheur « ajout seul ».)
-- 3. Un reflet n'est écrit que par le robot (règle 3) : l'ancien fichier a-activer/001_bloquer_reflets.sql est BRANCHÉ ici.
--    Vérifié le 27/11 dans le code de la porte : l'écran (rôle porte) ne lit que LECTURES_NAVIGATEUR et n'appelle que lister_favoris_os,
--    basculer_favori_os et demander_ticket_n8n ; l'assistant (rôle porte) lit et demande un ticket ; toute écriture passe par n8n (rôle
--    robot_reflets). Aucun des deux n'écrit un reflet par le rôle porte.
-- Restent dans a-activer/ (ils casseraient la validation des factures chez SCAB 04, où n8n écrit les décisions avec le nom dans p_qui) :
--    002 (le robot n'écrit ni décision ni correction) et 003 (« qui » pris dans l'identité vérifiée, plus dans p_qui).

do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

-- ------------------------------------------------------------------ 1. Par où
create or replace function public.par_ou_courant() returns text
language plpgsql stable as $$
declare v text := nullif(btrim(coalesce(current_setting('app.par_ou', true), '')), '');
begin
  if v is not null and not public.est_par_ou_valide(v) then
    raise exception 'Chemin inconnu (app.par_ou) : %', v using errcode = 'P0001', detail = 'par_ou_invalide';
  end if;
  return v;
end $$;

create or replace function public.socle_par_ou() returns trigger
language plpgsql as $$
begin
  new.par_ou := public.par_ou_courant();   -- jamais la valeur envoyée par la requête
  return new;
end $$;

-- Pose le déclencheur sur une table (à rappeler pour toute nouvelle table ; le test 13 le vérifie).
-- Nom « az_… » : il passe après les déclencheurs « aa_ » et « ab_ » (dont le verrou des lignes lues, qui compare l'avant et l'après).
create or replace function public.poser_par_ou(p_table text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('alter table %s add column if not exists par_ou text', t);
  execute format('drop trigger if exists az_socle_par_ou on %s', t);
  execute format('create trigger az_socle_par_ou before insert or update on %s for each row execute function public.socle_par_ou()', t);
end $$;
revoke all on function public.poser_par_ou(text) from public, porte, robot_reflets, indicateurs;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1 loop
    perform public.poser_par_ou(r.relname);
  end loop;
end $$;

-- Le journal automatique : un changement de par_ou seul n'est pas une modification (comme modifie_le / modifie_par).
create or replace function public.socle_journal() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_id uuid; v_avant jsonb; v_apres jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then
    v_avant := to_jsonb(old);
    if (v_avant - 'modifie_le' - 'modifie_par' - 'par_ou') = (v_apres - 'modifie_le' - 'modifie_par' - 'par_ou') then return null; end if;
  end if;
  begin
    v_id := (v_apres ->> 'id')::uuid;
  exception when others then
    v_id := null;
  end;
  insert into public.journal_modifications (table_nom, enregistrement_id, action, qui, avant, apres)
  values (tg_table_name, v_id, lower(tg_op), public.utilisateur_obligatoire(), v_avant, v_apres);
  return null;
end $$;

-- ------------------------------------------------------------------ 2 et 3. Reflets : ajout seul, robot seulement
create or replace function public.reflet_robot_seulement() returns trigger
language plpgsql as $$
begin
  if not pg_has_role(current_user, 'robot_reflets', 'member') then
    raise exception '% est un reflet : seul le robot qui recopie peut l''écrire (rôle %)', tg_table_name, current_user
      using errcode = 'P0001', detail = 'reflet_robot_seulement';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Pose le cadenas sur un reflet (à rappeler pour tout futur reflet inscrit au registre ; le test 13 le vérifie pour chacun).
create or replace function public.poser_cadenas_reflet(p_table text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('revoke insert, update on %s from porte', t);
  execute format('revoke update on %s from robot_reflets', t);
  execute format('drop trigger if exists ab_reflet_robot_seulement on %s', t);
  execute format('create trigger ab_reflet_robot_seulement before insert or update on %s for each row execute function public.reflet_robot_seulement()', t);
end $$;
revoke all on function public.poser_cadenas_reflet(text) from public, porte, robot_reflets, indicateurs;

do $$
declare r record;
begin
  for r in select t.nom_table from public.registre_tables t where t.nature = 'reflet' order by 1 loop
    perform public.poser_cadenas_reflet(r.nom_table);
  end loop;
end $$;
-- La seule case qui se modifie dans un reflet : le tampon de fin des lignes lues.
grant update (archive_le) on public.lignes_facture_lues to robot_reflets;

-- ------------------------------------------------------------------ Droits des nouvelles fonctions
revoke all on function public.par_ou_courant() from public;
revoke all on function public.socle_par_ou() from public;
revoke all on function public.reflet_robot_seulement() from public;
grant execute on function public.par_ou_courant() to porte, robot_reflets, indicateurs;
grant execute on function public.socle_par_ou() to porte, robot_reflets, indicateurs;
grant execute on function public.reflet_robot_seulement() to porte, robot_reflets, indicateurs;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
