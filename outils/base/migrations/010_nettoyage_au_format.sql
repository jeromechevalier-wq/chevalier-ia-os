-- 010 : met au nouveau format (009, listes fermées) les valeurs déjà écrites dans une base de TEST (SCAB 04, accord de Jérôme du 27/11/2026 :
-- « C'est une base de test. Donc, si tu dois modifier des champs, tu es libre de les modifier. »).
--
-- L'e-mail de Jérôme ne s'écrit JAMAIS dans ce fichier (dépôt public) : il est donné au moment où l'on joue la migration,
--   psql -v email_jerome=<son e-mail> -f 010_nettoyage_au_format.sql
-- Sans cette variable, la migration ne réécrit rien (elle tente seulement de valider les contraintes de 009). Rejouable : une valeur
-- déjà au format n'est plus touchée.
--
-- À jouer avec psql (il lit la variable), dans la MÊME séance que 009, n8n arrêté : 009 et 010 verrouillent toutes les tables le temps
-- de la transaction, et tant que 010 n'a pas été jouée avec l'e-mail, une ancienne ligne hors liste ne peut plus être modifiée
-- (une contrainte « not valid » vaut pour toute écriture). Avant : relever les valeurs réelles (select distinct sur decide_par,
-- valide_par, refuse_par, confirme_par, journal.qui, cree_par, source_nom, unite_reference) pour vérifier qu'elles entrent dans les listes.
--
-- Règles générales (aucune valeur réelle ici) pour une colonne « qui » hors liste :
--   - un texte qui parle de Claude, de ChatGPT ou d'un assistant (ex. « validé par Claude sur son ordre ») -> l'e-mail de Jérôme,
--     par où = assistant (avec son nom) : c'est Jérôme qui a décidé, par son assistant ;
--   - une colonne de DÉCISION (decide_par, valide_par, refuse_par, confirme_par, revoque_par) -> l'e-mail de Jérôme (une décision est
--     toujours prise par une personne ; sur cette base de test, c'est lui) ; par où = n8n si le texte parlait d'un robot ;
--   - ailleurs : « migration », « script », « reprise », « import » -> migration ; « n8n », « robot », « automatique », « ia » -> n8n ;
--     tout autre texte -> l'e-mail de Jérôme (seul utilisateur de la base de test).
-- Et : type de motif des décisions et moyen de vérification des IBAN déduits du commentaire libre (qui reste tel quel).
-- Restent à la main (signalés, jamais inventés) : action ou table du journal inconnues, source_nom hors liste, unité inconnue.
--
-- Décision prise seul (accord de Jérôme pour SCAB 04) : le journal et les tables en ajout seul (décisions) sont réécrits UNE fois.
-- Pour cela, les déclencheurs de la table sont coupés le temps de la réécriture, et la sécurité par ligne forcée est levée (le compte
-- d'administration doit voir toutes les lignes), puis tout est remis, dans la même transaction. Chaque ligne réécrite laisse une ligne
-- au journal (action « mise_au_format », avant / après) : l'historique se rejoue toujours.

-- Les contraintes « …_liste » retirées le temps de la réécriture sont notées ici (table, nom, expression) : celles que
-- poser_listes_fermees() ne repose pas (posées par une migration suivante, ex. mode_emploi_champs_categorie_liste de 013) sont
-- reposées telles quelles à la fin. Rejouer 010 après 013 ne fait donc disparaître aucune contrainte.
create temp table if not exists nettoyage_listes_retirees (t text not null, nom text not null, expression text not null);
truncate pg_temp.nettoyage_listes_retirees;

\if :{?email_jerome}
select set_config('nettoyage.email_jerome', :'email_jerome', false);
\else
select set_config('nettoyage.email_jerome', '', false);
\endif

create or replace function pg_temp.qui_au_format(p_val text, p_personne boolean, p_email text, out valeur text, out par_ou text)
language plpgsql immutable as $$
declare v text := btrim(coalesce(p_val, ''));
begin
  valeur := v; par_ou := null;
  if (p_personne and public.est_email(v)) or (not p_personne and public.est_qui_valide(v)) then
    return;
  end if;
  if v ~* 'claude' then valeur := p_email; par_ou := 'assistant:claude';
  elsif v ~* 'chat ?gpt' then valeur := p_email; par_ou := 'assistant:chatgpt';
  elsif v ~* 'assistant' then valeur := p_email; par_ou := 'assistant';
  elsif p_personne then
    valeur := p_email;
    if v ~* 'n8n|robot|automati|(^|[^a-z])ia([^a-z]|$)' then par_ou := 'n8n'; end if;
  elsif v ~* 'migration|script|reprise|import' then valeur := 'migration'; par_ou := 'migration';
  elsif v ~* 'n8n|robot|automati|(^|[^a-z])ia([^a-z]|$)' then valeur := 'n8n'; par_ou := 'n8n';
  else valeur := p_email;
  end if;
end $$;

do $$
declare
  v_email text := btrim(coalesce(current_setting('nettoyage.email_jerome', true), ''));
  v_cibles text[][] := array[
    -- table, colonne, « décision » (une personne seulement)
    array['journal_modifications', 'qui', 'non'],
    array['factures_decisions', 'decide_par', 'oui'],
    array['rapprochements_articles_tous', 'valide_par', 'oui'],
    array['suggestions_refusees_tous', 'refuse_par', 'oui'],
    array['ibans_confirmes', 'confirme_par', 'oui'],
    array['ibans_confirmes', 'revoque_par', 'oui'],
    array['favoris', 'utilisateur', 'non'],
    array['favoris_os', 'utilisateur', 'non'],
    array['tickets_n8n', 'utilisateur', 'non'],
    array['tickets_n8n_demandes', 'utilisateur', 'non']];
  v_tables text[];
  v_t text; v_col text; v_pers boolean; i int;
  r record; v_n int; v_total int := 0; v_cle text;
begin
  if v_email = '' then
    raise notice '010 : aucun e-mail donné (psql -v email_jerome=…) : rien n''est réécrit.';
    return;
  end if;
  if not public.est_email(v_email) then
    raise exception '010 : l''e-mail donné n''a pas la forme d''un e-mail' using errcode = 'P0001', detail = 'email_nettoyage_invalide';
  end if;
  perform set_config('app.utilisateur', 'migration', true);

  -- Les colonnes communes à toutes les tables (cree_par, modifie_par, archive_par) s'ajoutent à la liste.
  select array_agg(c.relname::text order by c.relname) into v_tables
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p');
  foreach v_t in array v_tables loop
    v_cibles := v_cibles || array[array[v_t, 'cree_par', 'non'], array[v_t, 'modifie_par', 'non'], array[v_t, 'archive_par', 'non']];
  end loop;

  -- Lever les verrous le temps de la réécriture (même transaction : rien ne reste levé). Les contraintes de liste de 009 sont retirées
  -- aussi : une ligne peut avoir plusieurs colonnes hors liste, réécrites une par une ; poser_listes_fermees() les repose à la fin.
  for r in select c.relname::text as t, k.conname, pg_get_expr(k.conbin, k.conrelid) as expression
             from pg_constraint k join pg_class c on c.oid = k.conrelid
            where k.connamespace = 'public'::regnamespace and k.contype = 'c' and k.conname like '%\_liste' loop
    insert into pg_temp.nettoyage_listes_retirees (t, nom, expression) values (r.t, r.conname, r.expression);
    execute format('alter table public.%I drop constraint %I', r.t, r.conname);
  end loop;
  foreach v_t in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_t);
    execute format('alter table public.%I no force row level security', v_t);
  end loop;

  for i in 1 .. array_length(v_cibles, 1) loop
    v_t := v_cibles[i][1]; v_col := v_cibles[i][2]; v_pers := v_cibles[i][3] = 'oui';
    -- La clé de la ligne : id (uuid ou compteur du journal).
    for r in execute format(
      'select t.id::text as id, t.%1$I as ancien, (pg_temp.qui_au_format(t.%1$I, %2$L, %3$L)).* from public.%4$I t
        where t.%1$I is not null and t.%1$I is distinct from (pg_temp.qui_au_format(t.%1$I, %2$L, %3$L)).valeur',
      v_col, v_pers, v_email, v_t) loop
      execute format('update public.%I set %I = $1, par_ou = coalesce(par_ou, $2) where id::text = $3', v_t, v_col)
        using r.valeur, r.par_ou, r.id;
      -- Une ligne au journal pour chaque réécriture (le registre, sans espace, change seulement par migration : son histoire est dans Git).
      continue when v_t = 'registre_tables';
      execute format('insert into public.journal_modifications (espace_id, table_nom, enregistrement_id, action, qui, par_ou, avant, apres)
                      select t.espace_id, %1$L, %2$s, ''mise_au_format'', ''migration'', ''migration'', $1, $2 from public.%1$I t where t.id::text = $3',
                     v_t, case when v_t = 'journal_modifications' then 'null' else 't.id' end)
        using jsonb_build_object('id', r.id, v_col, r.ancien), jsonb_build_object('id', r.id, v_col, r.valeur, 'par_ou', r.par_ou), r.id;
      v_total := v_total + 1;
    end loop;
  end loop;

  -- Type de motif des décisions, déduit du commentaire libre (qui reste tel quel).
  for r in select d.id, d.espace_id, d.motif_type as ancien,
                  case
                    when d.decision = 'refuser' and d.motif_refus ~* 'doublon' then 'doublon'
                    when d.decision = 'refuser' and d.motif_refus ~* 'illisible' then 'illisible'
                    when d.decision = 'refuser' and d.motif_refus ~* 'd[ée]j[àa] pay' then 'deja_payee'
                    when d.decision = 'refuser' and d.motif_refus ~* 'montant|prix|total' then 'montant_errone'
                    when char_length(btrim(coalesce(d.motif_refus, d.motif, d.motif_acceptation, ''))) > 0 then 'autre'
                    else 'non_precise'
                  end as nouveau
             from public.factures_decisions d where d.motif_type = 'non_precise' loop
    continue when r.nouveau = r.ancien;
    update public.factures_decisions set motif_type = r.nouveau where id = r.id;
    insert into public.journal_modifications (espace_id, table_nom, enregistrement_id, action, qui, par_ou, avant, apres)
    values (r.espace_id, 'factures_decisions', r.id, 'mise_au_format', 'migration', 'migration',
            jsonb_build_object('motif_type', r.ancien), jsonb_build_object('motif_type', r.nouveau));
    v_total := v_total + 1;
  end loop;

  -- Moyen de vérification des IBAN, déduit du commentaire libre (qui reste tel quel) ; type de motif des révocations.
  for r in select c.id, c.espace_id, c.moyen_type as ancien,
                  case
                    when c.moyen_verification ~* 'appel|t[ée]l[ée]phon' then 'appel_fournisseur'
                    when c.moyen_verification ~* 'courriel|e-?mail|(^|[^a-z])mail' then 'courriel_fournisseur'
                    when c.moyen_verification ~* 'courrier|lettre' then 'courrier_fournisseur'
                    when c.moyen_verification ~* '(^|[^a-z])rib([^a-z]|$)' then 'rib_signe'
                    when c.moyen_verification ~* 'en personne|rendez|visite' then 'en_personne'
                    else 'autre'
                  end as nouveau
             from public.ibans_confirmes c where c.moyen_type = 'non_precise' loop
    update public.ibans_confirmes set moyen_type = r.nouveau where id = r.id;
    insert into public.journal_modifications (espace_id, table_nom, enregistrement_id, action, qui, par_ou, avant, apres)
    values (r.espace_id, 'ibans_confirmes', r.id, 'mise_au_format', 'migration', 'migration',
            jsonb_build_object('moyen_type', r.ancien), jsonb_build_object('moyen_type', r.nouveau));
    v_total := v_total + 1;
  end loop;
  for r in select c.id, c.espace_id from public.ibans_confirmes c where c.revoque_le is not null and c.motif_revocation_type is null loop
    update public.ibans_confirmes set motif_revocation_type = 'non_precise' where id = r.id;
    insert into public.journal_modifications (espace_id, table_nom, enregistrement_id, action, qui, par_ou, avant, apres)
    values (r.espace_id, 'ibans_confirmes', r.id, 'mise_au_format', 'migration', 'migration',
            jsonb_build_object('motif_revocation_type', null), jsonb_build_object('motif_revocation_type', 'non_precise'));
    v_total := v_total + 1;
  end loop;

  -- Remettre les verrous.
  foreach v_t in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_t);
    if v_t <> 'registre_tables' then
      execute format('alter table public.%I force row level security', v_t);
    end if;
  end loop;

  -- Ce qui reste à regarder à la main (jamais inventé).
  select count(*) into v_n from public.journal_modifications j
   where not (j.action = any (public.liste_actions_journal()));
  if v_n > 0 then raise notice '010 : % ligne(s) du journal avec une action hors liste (à regarder à la main).', v_n; end if;
  select count(*) into v_n from public.journal_modifications j where not (j.table_nom = any (public.liste_tables_journal_fixes()))
     and not exists (select 1 from public.registre_tables t where t.nom_table = j.table_nom);
  if v_n > 0 then raise notice '010 : % ligne(s) du journal avec une table inconnue (à regarder à la main).', v_n; end if;
  select count(*) into v_n from public.articles_reference a where not public.est_unite_connue(a.unite_reference);
  if v_n > 0 then raise notice '010 : % article(s) de référence avec une unité hors liste (à regarder à la main).', v_n; end if;
  select (select count(*) from public.factures_scans x where not public.est_source_nom_valide(x.source_nom))
       + (select count(*) from public.lignes_facture_lues x where not public.est_source_nom_valide(x.source_nom))
       + (select count(*) from public.courriels_recus x where not public.est_source_nom_valide(x.source_nom))
       + (select count(*) from public.couts_ia x where not public.est_source_nom_valide(x.source_nom))
       + (select count(*) from public.n8n_executions x where not public.est_source_nom_valide(x.source_nom))
       + (select count(*) from public.openrouter_cles_releves x where not public.est_source_nom_valide(x.source_nom)) into v_n;
  if v_n > 0 then raise notice '010 : % reflet(s) avec une source hors liste (à regarder à la main).', v_n; end if;
  raise notice '010 : % valeur(s) mise(s) au format.', v_total;
end $$;

-- Valider les contraintes de 009 maintenant que les anciennes lignes sont au format (celles qui ne le sont pas restent « not valid »).
do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;
select public.poser_listes_fermees();
-- Reposer les contraintes retirées que poser_listes_fermees() ne connaît pas (même nom, même expression ; validées si les lignes
-- la respectent, sinon elles valent pour les nouvelles lignes, comme dans 009).
do $$
declare r record;
begin
  for r in select x.t, x.nom, x.expression from pg_temp.nettoyage_listes_retirees x
            where not exists (select 1 from pg_constraint k join pg_class c on c.oid = k.conrelid
                               where c.relnamespace = 'public'::regnamespace and c.relname = x.t and k.conname = x.nom)
            order by x.t, x.nom loop
    perform public.poser_contrainte_liste(r.t, r.nom, r.expression);
  end loop;
end $$;
drop table if exists pg_temp.nettoyage_listes_retirees;
do $$ begin perform set_config('app.utilisateur', '', false); end $$;
