-- À ACTIVER PLUS TARD (règle 4 : « qui » = e-mail vérifié, jamais envoyé par l'appelant) : PAS dans migrations/, appliqué par personne.
-- tester.js le joue seulement avec --avec-a-activer, sur une base jetable.
--
-- Ce qu'il fait : la personne d'une décision et du journal vient de app.utilisateur (posé par la porte à partir de l'identité VÉRIFIÉE :
-- e-mail du jeton Firebase, e-mail de la connexion Google de l'assistant), et plus du paramètre p_qui envoyé par l'appelant.
-- p_qui RESTE dans la signature des fonctions (n8n l'envoie, l'OS lit les mêmes noms) : sa valeur est simplement ignorée.
-- Colonnes concernées : journal_modifications.qui (par journaliser_modification), factures_decisions.decide_par, rapprochements valide_par,
-- suggestions refusées refuse_par, ibans_confirmes confirme_par et revoque_par (et donc le libellé archivee_par du journal).
-- Pourquoi pas tout de suite : chez SCAB 04, n8n écrit les décisions avec app.utilisateur = « n8n » et le nom de la personne dans p_qui.
-- Avec ce fichier, decide_par vaudrait « n8n », refusé (une décision = un e-mail, 009) : la validation des factures casserait.
-- Il faut d'abord : (1) la porte qui pose comme app.utilisateur la personne du ticket quand n8n agit pour elle (le ticket est demandé par
-- l'écran avec son identité vérifiée, consommé par n8n) ; (2) les workflows n8n adaptés ; (3) un essai en vrai.
-- Limite connue : les identifiants uuid (decide_par_id, valide_par_id, qui_id…) viennent encore de la requête ; l'e-mail fait foi (règle 4).

create or replace function public.journaliser_modification(p_table text, p_id uuid, p_action text, p_qui text, p_qui_id uuid, p_avant jsonb, p_apres jsonb)
returns void language plpgsql
set search_path = public, pg_temp as $$
begin
  -- p_qui est ignoré : la personne est celle de la requête (identité vérifiée par la porte).
  insert into public.journal_modifications (table_nom, enregistrement_id, action, qui, qui_id, avant, apres)
  values (p_table, p_id, p_action, public.utilisateur_obligatoire(), p_qui_id, p_avant, p_apres);
end $$;

-- Le journal : même une ligne ajoutée en direct (POST de n8n, porte) prend la personne de la requête, jamais le nom envoyé.
create or replace function public.journal_qui_verifie() returns trigger
language plpgsql as $$
begin
  new.qui := public.utilisateur_obligatoire();
  return new;
end $$;
revoke all on function public.journal_qui_verifie() from public;
grant execute on function public.journal_qui_verifie() to porte, robot_reflets, indicateurs;
drop trigger if exists ac_journal_qui_verifie on public.journal_modifications;
create trigger ac_journal_qui_verifie before insert on public.journal_modifications for each row execute function public.journal_qui_verifie();

create or replace function public.qui_verifie() returns trigger
language plpgsql as $$
declare v_qui text := public.utilisateur_obligatoire();
begin
  if tg_table_name = 'factures_decisions' then
    new.decide_par := v_qui;
  elsif tg_table_name = 'suggestions_refusees_tous' then
    if tg_op = 'INSERT' then new.refuse_par := v_qui; else new.refuse_par := old.refuse_par; end if;
  elsif tg_table_name = 'rapprochements_articles_tous' then
    if new.valide_le is not null then
      if tg_op = 'INSERT' then new.valide_par := v_qui;
      elsif old.valide_le is null then new.valide_par := v_qui;
      else new.valide_par := old.valide_par;   -- une validation déjà faite garde sa personne
      end if;
    end if;
  elsif tg_table_name = 'ibans_confirmes' then
    if tg_op = 'INSERT' then new.confirme_par := v_qui; end if;
    if tg_op = 'UPDATE' then
      if new.revoque_le is not null and old.revoque_le is null then new.revoque_par := v_qui; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.qui_verifie() from public;
grant execute on function public.qui_verifie() to porte, robot_reflets, indicateurs;

do $$
declare v_t text;
begin
  foreach v_t in array array['factures_decisions', 'rapprochements_articles_tous', 'suggestions_refusees_tous', 'ibans_confirmes'] loop
    execute format('drop trigger if exists ac_qui_verifie on public.%I', v_t);
    execute format('create trigger ac_qui_verifie before insert or update on public.%I for each row execute function public.qui_verifie()', v_t);
  end loop;
end $$;
