-- À ACTIVER PLUS TARD (règle 14 : « un robot qui travaille seul ne décide jamais ») : PAS dans migrations/, appliqué par personne.
-- tester.js le joue seulement avec --avec-a-activer, sur une base jetable.
--
-- Ce qu'il fait : le rôle du robot (robot_reflets, la voie n8n de la porte) ne peut plus écrire une décision ni une correction :
-- décision sur une facture, correction d'une valeur lue, validation d'un rapprochement, refus d'une suggestion, confirmation ou
-- révocation d'un IBAN. Une personne (écran, ou son assistant) le fait, par le rôle porte.
-- Pourquoi pas tout de suite : chez SCAB 04, ce sont les workflows n8n (rôle robot_reflets) qui écrivent TOUTES les décisions, avec le nom
-- de la personne dans p_qui. Brancher ce verrou casserait la validation des factures. Il faut d'abord : (1) la porte qui laisse une personne
-- décider par son rôle (ou n8n qui agit au nom de la personne du ticket, avec son identité vérifiée) ; (2) les workflows n8n adaptés ;
-- (3) un essai en vrai.
-- Le test se fait sur le NOM du rôle courant (« set local role robot_reflets » de la porte) : un compte d'administration qui peut devenir ce
-- rôle n'est pas arrêté tant qu'il ne le devient pas.

create or replace function public.decision_par_une_personne() returns trigger
language plpgsql as $$
begin
  if current_user = 'robot_reflets' then
    if tg_table_name = 'rapprochements_articles_tous' then
      if new.valide_le is null then
        return new;   -- une suggestion de l'IA n'est pas une décision
      end if;
      if tg_op = 'UPDATE' then
        if old.valide_le is not null and new.valide_le is not distinct from old.valide_le then
          return new;   -- archiver un lien déjà validé (sans le valider à nouveau) suit la décision d'une personne
        end if;
      end if;
    end if;
    raise exception '% : un robot qui travaille seul ne décide jamais (règle 14) ; une personne décide, par l''écran ou son assistant', tg_table_name
      using errcode = 'P0001', detail = 'robot_ne_decide_pas';
  end if;
  return new;
end $$;
revoke all on function public.decision_par_une_personne() from public;
grant execute on function public.decision_par_une_personne() to porte, robot_reflets, indicateurs;

do $$
declare v_t text;
begin
  foreach v_t in array array['factures_decisions', 'factures_corrections', 'rapprochements_articles_tous', 'suggestions_refusees_tous', 'ibans_confirmes'] loop
    execute format('drop trigger if exists ab_decision_par_une_personne on public.%I', v_t);
    execute format('create trigger ab_decision_par_une_personne before insert or update on public.%I for each row execute function public.decision_par_une_personne()', v_t);
  end loop;
end $$;
