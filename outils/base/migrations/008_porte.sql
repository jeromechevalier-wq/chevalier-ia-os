-- 008 : le ticket n8n vu par la porte.
-- Pourquoi : les workflows n8n (validation, actions, suggestions, ajout de facture) refusent une personne dont l'identifiant
-- n'est pas un uuid, et l'envoient dans decide_par_id / p_qui_id (colonnes et paramètres en uuid, voir 004 et 005).
-- Avec la porte, consommer_ticket() rend « utilisateur » = le texte posé dans app.utilisateur (l'e-mail), pas un uuid.
-- consommer_ticket_porte() fait exactement la même chose (même ticket, même usage, une seule fois, 60 secondes),
-- mais rend un uuid STABLE pour chaque personne, tiré de app.utilisateur (l'e-mail posé par la porte quand le ticket a été
-- demandé) : md5('chevalier-ia-os:personne:' || lower(e-mail))::uuid. Le préfixe empêche de retrouver l'e-mail par un simple
-- dictionnaire (md5(e-mail) seul est l'empreinte publique de Gravatar).
-- La même personne a toujours le même uuid ; deux personnes différentes en ont deux différents.
-- Mêmes colonnes et mêmes paramètres que consommer_ticket (courriel, espace, utilisateur) : la logique des workflows ne change
-- pas, l'adresse appelée devient /rest/v1/rpc/consommer_ticket_porte.
-- ATTENTION : la fonction tourne avec les droits de l'appelant (aucune fonction SECURITY DEFINER), la sécurité par ligne
-- s'applique. La porte doit donc poser app.espace_id ET une personne (app.utilisateur, par exemple « n8n ») AVANT l'appel,
-- dans la transaction ; sinon aucun ticket n'est trouvé. L'espace vient de la CONFIGURATION de la porte (secret propre à
-- l'espace, lu côté serveur), jamais de la requête reçue. Un ticket d'un autre espace reste introuvable.

create or replace function public.consommer_ticket_porte(p_ticket text, p_usage text)
returns table(courriel text, espace text, utilisateur text)
language sql
set search_path = public, pg_temp as $$
  select c.courriel, c.espace, md5('chevalier-ia-os:personne:' || lower(c.utilisateur))::uuid::text
  from public.consommer_ticket(p_ticket, p_usage) c
  where c.utilisateur is not null and btrim(c.utilisateur) <> '';
$$;

-- Droits : la porte et les robots seulement (indicateurs lit, il ne demande ni ne consomme de ticket). Les revoke viennent
-- après le grant général de 007, donc ils tiennent aussi quand les migrations sont rejouées.
revoke all on function public.consommer_ticket_porte(text, text) from public, indicateurs;
grant execute on function public.consommer_ticket_porte(text, text) to porte, robot_reflets;
revoke execute on function public.consommer_ticket(text, text) from indicateurs;
revoke execute on function public.demander_ticket_n8n(text) from indicateurs;
