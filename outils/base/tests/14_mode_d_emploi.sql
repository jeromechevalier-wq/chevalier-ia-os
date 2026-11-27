-- 14 : le mode d'emploi de la base (migration 013, règles 23 et 24) dit la même chose que les vrais verrous.
-- 1. Il est complet : chaque table du registre (et la vue factures) a sa ligne, chaque colonne a la sienne, et rien de plus.
-- 2. Il suit les droits et les déclencheurs : « + » seulement sur une source que la porte peut écrire ; un champ « oui » est vraiment écrivable.
-- 3. Un ESSAI RÉEL sous le rôle de la porte, pour chaque champ (annulé ensuite) : un champ « oui » prend la valeur demandée ;
--    un champ « non » (ou « avant la décision » sur une facture décidée) la refuse ou la remplace. Données INVENTÉES.
\ir aides.inc

-- 1 et 2 : complet, et d'accord avec les droits et les déclencheurs.
do $$
declare v text;
begin
  select string_agg(o, ', ') into v from (
    select t.nom_table as o from public.registre_tables t
    union all select 'factures'
    except select m.objet from public.mode_emploi_objets m) x;
  if v is not null then raise exception 'Mode d''emploi : objets sans ligne : %', v; end if;

  select string_agg(c.relname || '.' || a.attname, ', ') into v
    from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace
     and (c.relname in (select nom_table from public.registre_tables) or c.relname = 'factures')
     and not exists (select 1 from public.mode_emploi_champs m where m.objet = c.relname and m.champ = a.attname);
  if v is not null then raise exception 'Mode d''emploi : champs sans ligne (rappeler remplir_mode_emploi() ou écrire le cas) : %', v; end if;

  select string_agg(m.objet || '.' || m.champ, ', ') into v from public.mode_emploi_champs m
   where not exists (select 1 from pg_attribute a where a.attrelid = ('public.' || m.objet)::regclass and a.attname = m.champ and a.attnum > 0 and not a.attisdropped);
  if v is not null then raise exception 'Mode d''emploi : champs qui n''existent pas : %', v; end if;

  -- L'identifiant ne change jamais : chaque table a le déclencheur (essayé pour de vrai plus bas).
  select string_agg(c.relname, ', ') into v from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'ab_socle_id_fige');
  if v is not null then raise exception 'Tables sans « identifiant figé » (rappeler poser_id_fige) : %', v; end if;

  -- « + » : seulement sur une source que la porte peut écrire ; jamais sur un reflet.
  select string_agg(m.objet, ', ') into v from public.mode_emploi_objets m
    left join public.registre_tables t on t.nom_table = m.objet
   where m.creer and (t.nature is distinct from 'source' or not has_table_privilege('porte', ('public.' || m.objet)::regclass, 'INSERT'));
  if v is not null then raise exception 'Mode d''emploi : « + » promis sans le droit de créer : %', v; end if;

  -- « oui » : la porte a le droit de modifier la colonne, la table n'est ni un reflet ni en ajout seul, la colonne n'est pas calculée.
  select string_agg(m.objet || '.' || m.champ, ', ') into v
    from public.mode_emploi_champs m
    join pg_class c on c.relname = m.objet and c.relnamespace = 'public'::regnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = m.champ
    left join public.registre_tables t on t.nom_table = m.objet
   where m.modifiable <> 'non' and c.relkind in ('r', 'p')
     and (not has_column_privilege('porte', c.oid, a.attnum, 'UPDATE') or t.nature = 'reflet' or a.attgenerated <> ''
          or exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid where g.tgrelid = c.oid and p.proname = 'ajout_seul'));
  if v is not null then raise exception 'Mode d''emploi : champs dits modifiables mais verrouillés par les droits ou un déclencheur : %', v; end if;

  -- Le mode d'emploi lui-même : lu par les trois rôles, écrit par aucun (il n'a pas de sécurité par ligne : les droits sont le seul verrou).
  select string_agg(r || ' ' || d || ' ' || t, ', ') into v
    from unnest(array['porte', 'robot_reflets', 'indicateurs']) r, unnest(array['mode_emploi_objets', 'mode_emploi_champs']) t,
         unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'SELECT']) d
   where has_table_privilege(r, ('public.' || t)::regclass, d) is distinct from (d = 'SELECT');
  if v is not null then raise exception 'Mode d''emploi : droits faux (lecture seule pour les trois rôles) : %', v; end if;
end $$;

-- 3. L'essai réel.
-- autre_valeur(colonne, type) : une expression SQL qui donne une AUTRE valeur VALABLE du même type ; null si on ne sait pas en fabriquer une.
create or replace function pg_temp.autre_valeur(p_col text, p_type regtype) returns text language plpgsql stable as $$
begin
  if p_type in ('text'::regtype, 'varchar'::regtype) then
    -- Une personne : un autre e-mail (une valeur hors liste serait refusée par la liste fermée, sans rien prouver).
    if p_col ~ '(_par$|^qui$|^utilisateur$)' then
      return format('case when %I = ''bob@exemple.test'' then ''carol@exemple.test'' else ''bob@exemple.test'' end', p_col);
    end if;
    return format('coalesce(%I, '''') || ''-essai''', p_col);
  elsif p_type in ('integer'::regtype, 'bigint'::regtype, 'smallint'::regtype, 'numeric'::regtype) then return format('coalesce(%I, 0) + 1', p_col);
  elsif p_type = 'boolean'::regtype then return format('not coalesce(%I, false)', p_col);
  elsif p_type = 'date'::regtype then return format('coalesce(%I, current_date) + 1', p_col);
  elsif p_type = 'timestamptz'::regtype then return format('coalesce(%I, now()) + interval ''1 day''', p_col);
  elsif p_type = 'uuid'::regtype then return 'gen_random_uuid()';
  elsif p_type = 'jsonb'::regtype then return format('coalesce(%I, ''{}''::jsonb) || ''{"essai": 1}''::jsonb', p_col);
  elsif p_type = 'text[]'::regtype then return format('coalesce(%I, ''{}''::text[]) || array[''essai'']', p_col);
  elsif exists (select 1 from pg_type t where t.oid = p_type and t.typtype = 'e') then
    return format('(select e.enumlabel::%s from pg_enum e where e.enumtypid = %s and e.enumlabel::%s is distinct from %I order by e.enumsortorder limit 1)',
                  p_type, p_type::oid, p_type, p_col);
  end if;
  return null;
end $$;
-- essayer(objet, champ, id) : modifie le champ d'une ligne, regarde ce qui est écrit, et ANNULE.
-- Renvoie 'pris', 'remplace' (la base a écrit autre chose), 'refuse: <message>', 'format: <message>' (valeur refusée par un contrôle de
-- format, une clé étrangère ou une garde de lien : ne prouve rien) ou 'type' (on ne sait pas fabriquer une valeur).
-- La valeur est calculée UNE fois puis écrite telle quelle ; pour « id », la ligne est relue à sa nouvelle place.
create or replace function pg_temp.essayer(p_objet text, p_champ text, p_id text) returns text language plpgsql as $$
declare v_type regtype; v_type_exact text; v_expr text; v_voulu text; v_ecrit text; v_msg text; v_etat text; v_n int;
begin
  select a.atttypid::regtype, format_type(a.atttypid, a.atttypmod) into v_type, v_type_exact
    from pg_attribute a where a.attrelid = ('public.' || p_objet)::regclass and a.attname = p_champ;
  v_expr := pg_temp.autre_valeur(p_champ, v_type);
  if v_expr is null then return 'type'; end if;
  begin
    execute format('select ((%s)::%s)::text from public.%I where id::text = %L', v_expr, v_type_exact, p_objet, p_id) into v_voulu;
    execute format('update public.%I set %I = %L::%s where id::text = %L', p_objet, p_champ, v_voulu, v_type_exact, p_id);
    get diagnostics v_n = row_count;
    if p_champ = 'id' then
      execute format('select %I::text from public.%I where id::text = %L', p_champ, p_objet, v_voulu) into v_ecrit;
    else
      execute format('select %I::text from public.%I where id::text = %L', p_champ, p_objet, p_id) into v_ecrit;
    end if;
    if v_n = 0 then
      v_etat := 'remplace';   -- la vue ou la sécurité par ligne n'a rien écrit
    elsif p_champ = 'archive_le' then
      v_etat := case when (v_ecrit is null) = (v_voulu is null) then 'pris' else 'remplace' end;   -- la base met sa propre heure
    else
      v_etat := case when v_ecrit is not distinct from v_voulu then 'pris' else 'remplace' end;
    end if;
    raise exception 'annuler' using errcode = 'P0099', detail = v_etat;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_ecrit = pg_exception_detail;
    if sqlstate = 'P0099' then return v_ecrit; end if;
    if sqlstate in ('23514', '23503', '23505') then return 'format: ' || v_msg; end if;
    return 'refuse: ' || v_msg;
  end;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to public', f.sig);
  end loop;
end $$;

set role porte;
create temp table ids_a as select * from pg_temp.peupler('espace-a', 'MARQA', '7300001');
grant select on ids_a to public;
-- Une facture encore à valider (écrite par le robot), et une ligne dans chaque table que peupler() ne remplit pas.
select pg_temp.entrer('espace-a', 'alice-marqa@exemple.test');
do $$
declare v_f uuid;
begin
  perform pg_temp.robot('n8n');
  insert into public.factures (fournisseur, numero, montant_ht, extraction)
  values ('Fournisseur MARQA', 'AV-1', 100, jsonb_build_object('fournisseur', jsonb_build_object('siren', pg_temp.siren('7300002')))) returning id into v_f;
  perform pg_temp.redevenir('porte', 'alice-marqa@exemple.test');
  create temp table a_valider as select v_f as id;
  update public.factures set numero = 'AV-1 corrigé' where id = v_f;   -- une correction
  insert into public.suggestions_refusees_tous (article_fournisseur_id, refuse_par, article_reference_id, coefficient)
  values ((select article_id from ids_a), 'alice-marqa@exemple.test', (select reference_id from ids_a), 1);
  insert into public.suggestions_tentees (article_fournisseur_id) values ((select article_id from ids_a));
  insert into public.favoris (utilisateur, genre, cle) values ('alice-marqa@exemple.test', 'chantier', 'x');
  perform public.demander_ticket_n8n('validation');
end $$;
grant select on a_valider to public;

do $$
declare m record; v_id text; v_res text; v_fautes text := ''; v_ecarts text := ''; v_decidee text := (select facture_id from ids_a)::text;
  v_a_valider text := (select id from a_valider)::text;
  -- Sur la fiche facture, ces champs se remplissent AVEC la décision (statut, motifs, décideur) ou sont des liens : l'essai « sur une facture
  -- à valider » ne les regarde pas seuls (le refus après la décision, lui, est essayé pour tous).
  v_avec_decision text[] := array['statut', 'motif_refus', 'motif_acceptation', 'acceptee_malgre_alerte', 'type_document',
                                  'fournisseur_id', 'etablissement_id', 'chantier_id', 'decide_par', 'decide_par_id', 'date_decision'];
  -- Écarts connus : le mode d'emploi dit « non » (c'est la règle), mais la porte peut encore écrire ces champs en direct. Écrits dans
  -- REGLES.md (« à cadenasser ») ; a-activer/003 ferme valide_par et refuse_par. Signalés par un avis, pas bloquants.
  v_ecarts_connus text[] := array['rapprochements_articles_tous.valide_le', 'rapprochements_articles_tous.valide_par',
                                  'suggestions_refusees_tous.refuse_le', 'suggestions_refusees_tous.refuse_par'];
  v_bloque boolean;
begin
  for m in select * from public.mode_emploi_champs where archive_le is null order by objet, champ loop
    -- La ligne essayée : la facture décidée (F-1) pour les objets de facture, sinon la première ligne visible.
    if m.objet in ('factures', 'factures_identite') then
      v_id := v_decidee;
    else
      execute format('select id::text from public.%I order by cree_le limit 1', m.objet) into v_id;
    end if;
    if v_id is null then
      v_fautes := v_fautes || format(E'\n  %s : aucune ligne de test (ajoute-en une plus haut)', m.objet);
      continue;
    end if;
    v_res := pg_temp.essayer(m.objet, m.champ, v_id);
    if v_res = 'type' then
      v_fautes := v_fautes || format(E'\n  %s.%s : type non géré par autre_valeur()', m.objet, m.champ);
      continue;
    end if;
    v_bloque := v_res like 'refuse:%' or v_res = 'remplace';
    if (m.objet || '.' || m.champ) = any (v_ecarts_connus) then
      if not v_bloque then v_ecarts := v_ecarts || ' ' || m.objet || '.' || m.champ; end if;
      continue;
    end if;
    if m.modifiable in ('oui', 'apres_decision') then
      -- Sur la ligne essayée (facture décidée pour « après la décision »), la modification doit être prise ; un refus de format ne compte pas.
      -- Un lien vers une autre ligne prise au hasard peut être refusé par une garde de lien (même entreprise…) : ne prouve rien.
      if v_bloque and v_res like 'refuse:%' and m.champ ~ '(_id$|^fusionne_dans$)' then
        null;
      elsif v_bloque then
        v_fautes := v_fautes || format(E'\n  %s.%s dit « %s » mais : %s', m.objet, m.champ, m.modifiable, v_res);
      end if;
    elsif not v_bloque then
      -- non, avant_decision (sur une facture décidée), tant_que_vide (sur une ligne remplie) : il faut un vrai refus.
      v_fautes := v_fautes || format(E'\n  %s.%s dit « %s » mais la modification n''est pas bloquée : %s', m.objet, m.champ, m.modifiable, v_res);
    end if;
    -- Sur une facture encore à valider : « avant » se modifie vraiment ; « non » et « après » restent bloqués.
    if m.objet in ('factures', 'factures_identite') then
      v_res := pg_temp.essayer(m.objet, m.champ, v_a_valider);
      v_bloque := v_res like 'refuse:%' or v_res = 'remplace';
      if m.modifiable = 'avant_decision' and not (m.champ = any (v_avec_decision)) and v_bloque then
        v_fautes := v_fautes || format(E'\n  %s.%s dit « avant la décision » mais sur une facture à valider : %s', m.objet, m.champ, v_res);
      elsif m.modifiable in ('non', 'apres_decision') and not v_bloque then
        v_fautes := v_fautes || format(E'\n  %s.%s dit « %s » mais se modifie sur une facture à valider : %s', m.objet, m.champ, m.modifiable, v_res);
      end if;
    end if;
  end loop;
  if v_fautes <> '' then raise exception 'Le mode d''emploi ne dit pas la même chose que les vrais verrous :%', v_fautes; end if;
  if v_ecarts <> '' then raise notice 'Écarts connus (à cadenasser) :%', v_ecarts; end if;
end $$;
reset role;
