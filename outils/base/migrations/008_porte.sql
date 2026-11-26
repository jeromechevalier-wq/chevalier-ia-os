-- 008 : le ticket n8n vu par la porte.
-- Pourquoi : les workflows n8n (validation, actions, suggestions, ajout de facture) refusent une personne dont l'identifiant
-- n'est pas un uuid, et l'envoient dans decide_par_id / p_qui_id (colonnes et paramètres en uuid, voir 004 et 005).
-- Avec la porte, consommer_ticket() rend « utilisateur » = le texte posé dans app.utilisateur (l'e-mail), pas un uuid.
-- consommer_ticket_porte() fait exactement la même chose (même ticket, même usage, une seule fois, 60 secondes),
-- mais rend un uuid STABLE pour chaque personne, tiré de son e-mail : md5(lower(e-mail))::uuid.
-- La même personne a toujours le même uuid ; deux personnes différentes en ont deux différents.
-- Mêmes colonnes que consommer_ticket (courriel, espace, utilisateur) : le code des workflows ne change pas, seule l'adresse
-- appelée change (/rest/v1/rpc/consommer_ticket_porte).
-- Aucune fonction SECURITY DEFINER : la sécurité par ligne de l'espace s'applique (un ticket d'un autre espace est introuvable).

create or replace function public.consommer_ticket_porte(p_ticket text, p_usage text)
returns table(courriel text, espace text, utilisateur text)
language sql
set search_path = public, pg_temp as $$
  select c.courriel, c.espace, md5(lower(c.utilisateur))::uuid::text
  from public.consommer_ticket(p_ticket, p_usage) c
  where c.utilisateur is not null and btrim(c.utilisateur) <> '';
$$;

-- Droits : la porte et les robots seulement (indicateurs lit, il ne consomme pas de ticket). Le revoke vient après le grant
-- général de 007, donc il tient aussi quand les migrations sont rejouées.
revoke all on function public.consommer_ticket_porte(text, text) from public, indicateurs;
grant execute on function public.consommer_ticket_porte(text, text) to porte, robot_reflets;
