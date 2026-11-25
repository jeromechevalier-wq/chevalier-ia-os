-- À ACTIVER PLUS TARD (règle 3) : ce fichier n'est PAS dans migrations/, il n'est appliqué par personne.
-- tester.js le joue seulement avec l'option --avec-a-activer, sur une base jetable, pour prouver qu'il marche.
--
-- Ce qu'il fait : un REFLET (copie d'une vérité qui vit ailleurs : boîte mail, n8n, OpenRouter, lecture du PDF) ne s'écrit plus que
-- par le rôle robot_reflets. La porte (les écrans, les assistants) peut toujours le LIRE, mais plus l'ajouter ni le modifier.
-- Deux verrous : (1) le droit d'écrire est retiré à la porte ; (2) un déclencheur refuse toute écriture d'un rôle qui n'est pas
-- robot_reflets (même si quelqu'un redonne le droit par erreur).
-- La liste des reflets vient du registre (registre_tables, nature = 'reflet') : une nouvelle table reflet est couverte en rejouant ce fichier.
-- Conséquence à connaître : ajouter une facture (insert dans la vue factures, qui crée un scan) et remplacer les lignes lues deviennent
-- des gestes de robot ; décider, corriger, rouvrir, archiver restent possibles pour la porte.

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
revoke all on function public.reflet_robot_seulement() from public;
grant execute on function public.reflet_robot_seulement() to porte, robot_reflets, indicateurs;

do $$
declare r record;
begin
  for r in select t.nom_table from public.registre_tables t where t.nature = 'reflet' loop
    execute format('revoke insert, update on public.%I from porte', r.nom_table);
    execute format('drop trigger if exists ab_reflet_robot_seulement on public.%I', r.nom_table);
    execute format('create trigger ab_reflet_robot_seulement before insert or update on public.%I for each row execute function public.reflet_robot_seulement()', r.nom_table);
  end loop;
end $$;
