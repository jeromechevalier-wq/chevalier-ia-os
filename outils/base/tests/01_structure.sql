-- 01 : la structure respecte les règles de Jérôme, pour TOUTES les tables (pas seulement celles qu'on pense à tester).
do $$
declare r record; v_liste text;
begin
  -- Règle 2 : chaque table est au registre, et le registre ne cite que des tables qui existent.
  select string_agg(c.relname, ', ') into v_liste from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not exists (select 1 from public.registre_tables t where t.nom_table = c.relname);
  if v_liste is not null then raise exception 'Règle 2 : tables absentes du registre : %', v_liste; end if;
  select string_agg(t.nom_table, ', ') into v_liste from public.registre_tables t
   where to_regclass('public.' || t.nom_table) is null;
  if v_liste is not null then raise exception 'Règle 2 : le registre cite des tables qui n''existent pas : %', v_liste; end if;

  -- Règle 8 : chaque reflet a source_nom, source_ref, copie_le et une unicité (espace_id, source_nom, source_ref).
  for r in select t.nom_table from public.registre_tables t where t.nature = 'reflet' loop
    if (select count(*) from pg_attribute a where a.attrelid = ('public.' || r.nom_table)::regclass
          and a.attname in ('source_nom', 'source_ref', 'copie_le') and not a.attisdropped) <> 3 then
      raise exception 'Règle 8 : % n''a pas source_nom / source_ref / copie_le', r.nom_table;
    end if;
    if not exists (select 1 from pg_index i where i.indrelid = ('public.' || r.nom_table)::regclass and i.indisunique
                     and (select array_agg(a.attname::text order by k.n) from unnest(i.indkey) with ordinality k(attnum, n)
                          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['espace_id', 'source_nom', 'source_ref']) then
      raise exception 'Règle 8 : % n''a pas l''unicité (espace_id, source_nom, source_ref)', r.nom_table;
    end if;
  end loop;

  -- Règles 1, 4, 6 : espace_id (sauf le registre), cree_le, cree_par, modifie_le, modifie_par, archive_le, archive_par partout.
  for r in select c.oid, c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    select string_agg(x, ', ') into v_liste from unnest(array['espace_id', 'cree_le', 'cree_par', 'modifie_le', 'modifie_par', 'archive_le', 'archive_par']) x
     where not (r.relname in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs') and x = 'espace_id')
       and not exists (select 1 from pg_attribute a where a.attrelid = r.oid and a.attname = x and not a.attisdropped);
    if v_liste is not null then raise exception 'Règles 1/4/6 : il manque à % : %', r.relname, v_liste; end if;
    if r.relname not in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs') and not exists (select 1 from pg_attribute a where a.attrelid = r.oid and a.attname = 'espace_id' and a.attnotnull) then
      raise exception 'Règle 1 : %.espace_id peut être vide', r.relname;
    end if;
    -- Déclencheurs communs présents.
    if not exists (select 1 from pg_trigger g where g.tgrelid = r.oid and g.tgname = 'aa_socle_qui_et_quand') then
      raise exception 'Règle 4 : % n''a pas le déclencheur qui-et-quand', r.relname;
    end if;
    if not exists (select 1 from pg_trigger g where g.tgrelid = r.oid and g.tgname = 'aa_socle_pas_de_suppression') then
      raise exception 'Règle 6 : % n''a pas le déclencheur qui refuse DELETE', r.relname;
    end if;
    -- Règle 7 : chaque table a son journal automatique (sauf le journal lui-même et le registre, qui change par migration).
    if r.relname not in ('journal_modifications', 'registre_tables', 'mode_emploi_objets', 'mode_emploi_champs')
       and not exists (select 1 from pg_trigger g where g.tgrelid = r.oid and g.tgname = 'zz_socle_journal') then
      raise exception 'Règle 7 : % n''a pas le déclencheur du journal', r.relname;
    end if;
  end loop;

  -- Règle 1 : toute unicité d'une table à espace commence par espace_id (sauf la clé primaire uuid, unique partout).
  select string_agg(i.indexrelid::regclass::text, ', ') into v_liste
    from pg_index i join pg_class c on c.oid = i.indrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and i.indisunique and not i.indisprimary
     and c.relname not in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs')
     and (select a.attname from pg_attribute a where a.attrelid = c.oid and a.attnum = i.indkey[0]) is distinct from 'espace_id';
  if v_liste is not null then raise exception 'Règle 1 : unicités sans espace_id en tête : %', v_liste; end if;

  -- Règle 1 : chaque clé étrangère contient espace_id (un lien ne peut pas viser une ligne d'un autre espace).
  select string_agg(k.conrelid::regclass::text || '.' || k.conname, ', ') into v_liste
    from pg_constraint k
   where k.contype = 'f' and k.connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_attribute a where a.attrelid = k.conrelid and a.attname = 'espace_id' and a.attnum = any (k.conkey));
  if v_liste is not null then raise exception 'Règle 1 : clés étrangères sans espace_id : %', v_liste; end if;

  -- C2 : sécurité par ligne activée ET forcée sur toutes les tables à espace ; une règle « espace_courant » sur chacune.
  select string_agg(c.relname, ', ') into v_liste from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs')
     and not (c.relrowsecurity and c.relforcerowsecurity
              and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'espace_courant'));
  if v_liste is not null then raise exception 'C2 : sécurité par ligne absente ou non forcée : %', v_liste; end if;

  -- C2 : aucune autre règle de sécurité par ligne (ex. « lecture indicateurs USING (true) » d'avant) : la seule est celle de l'espace.
  select string_agg(p.polrelid::regclass::text || '.' || p.polname, ', ') into v_liste from pg_policy p
    join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace and p.polname <> 'espace_courant';
  if v_liste is not null then raise exception 'C2 : règles en trop : %', v_liste; end if;

  -- C2 : toutes les vues en security_invoker.
  select string_agg(c.relname, ', ') into v_liste from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
     and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false);
  if v_liste is not null then raise exception 'C2 : vues sans security_invoker : %', v_liste; end if;
  if exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'm') then
    raise exception 'C2 : une vue matérialisée ne respecte pas la sécurité par ligne';
  end if;

  -- C2 : aucune fonction SECURITY DEFINER.
  select string_agg(p.oid::regprocedure::text, ', ') into v_liste from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef;
  if v_liste is not null then raise exception 'C2 : fonctions SECURITY DEFINER : %', v_liste; end if;

  -- Rôles : aucun ne contourne la sécurité par ligne, aucun n'est superutilisateur.
  select string_agg(rolname, ', ') into v_liste from pg_roles
   where rolname in ('porte', 'robot_reflets', 'indicateurs') and (rolbypassrls or rolsuper or rolcreaterole or rolcreatedb);
  if v_liste is not null then raise exception 'Rôles trop puissants : %', v_liste; end if;
  if (select count(*) from pg_roles where rolname in ('porte', 'robot_reflets', 'indicateurs')) <> 3 then
    raise exception 'Les trois rôles porte, robot_reflets, indicateurs doivent exister';
  end if;
  if exists (select 1 from pg_roles where rolname in ('metabase_ro', 'indicateurs_ro', 'anon', 'authenticated', 'service_role')) then
    raise exception 'C6 : un ancien rôle (Supabase ou metabase_ro / indicateurs_ro) existe encore';
  end if;

  -- Règle 6 : personne n'a le droit DELETE ni TRUNCATE ; indicateurs ne peut ni ajouter ni modifier.
  select string_agg(c.relname || ':' || r2.rolname, ', ') into v_liste
    from pg_class c cross join (values ('porte'), ('robot_reflets'), ('indicateurs')) r2(rolname)
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
     and (has_table_privilege(r2.rolname, c.oid, 'DELETE') or has_table_privilege(r2.rolname, c.oid, 'TRUNCATE'));
  if v_liste is not null then raise exception 'Règle 6 : DELETE ou TRUNCATE accordé : %', v_liste; end if;
  select string_agg(c.relname, ', ') into v_liste from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
     and (has_table_privilege('indicateurs', c.oid, 'INSERT') or has_table_privilege('indicateurs', c.oid, 'UPDATE'));
  if v_liste is not null then raise exception 'indicateurs peut écrire dans : %', v_liste; end if;
  if has_table_privilege('porte', 'public.registre_tables', 'INSERT') or has_table_privilege('porte', 'public.registre_tables', 'UPDATE') then
    raise exception 'La porte ne doit pas modifier le registre';
  end if;

  -- Règle 5 : aucune date-heure sans fuseau.
  select string_agg(c.relname || '.' || a.attname, ', ') into v_liste
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
     and a.atttypid = 'timestamp'::regtype;
  if v_liste is not null then raise exception 'Règle 5 : colonnes timestamp sans fuseau : %', v_liste; end if;

  -- Règle 10 : les montants (montant, prix, budget, coût) sont en numeric, jamais en nombre à virgule flottante.
  select string_agg(c.relname || '.' || a.attname, ', ') into v_liste
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     and a.attname ~ '(montant|prix|budget|cout|somme)' and a.atttypid <> 'numeric'::regtype;
  if v_liste is not null then raise exception 'Règle 10 : montants qui ne sont pas en numeric : %', v_liste; end if;
  if exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
                and a.atttypid in ('real'::regtype, 'double precision'::regtype, 'money'::regtype)) then
    raise exception 'Règle 10 : un nombre à virgule flottante ou money est utilisé';
  end if;

  -- Règle 11 : identifiants uuid (exception écrite : le compteur du journal, pour l'ordre exact des écritures).
  select string_agg(c.relname, ', ') into v_liste
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attname = 'id' and not a.attisdropped
     and a.atttypid <> 'uuid'::regtype and c.relname <> 'journal_modifications';
  if v_liste is not null then raise exception 'Règle 11 : identifiants qui ne sont pas des uuid : %', v_liste; end if;

  -- Règle 9 : chaque colonne *_id (sauf exceptions écrites) qui désigne une ligne d'une autre table a sa clé étrangère.
  select string_agg(c.relname || '.' || a.attname, ', ') into v_liste
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
     and a.attname ~ '_id$' and a.attname not in ('espace_id', 'decide_par_id', 'confirme_par_id', 'revoque_par_id', 'qui_id',
                                                   'workflow_id', 'execution_id', 'enregistrement_id')
     and a.atttypid = 'uuid'::regtype
     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any (k.conkey));
  if v_liste is not null then raise exception 'Règle 9 : colonnes sans clé étrangère : %', v_liste; end if;

  -- C1 / C5 : plus de reste de Supabase ni du badge Firebase.
  if exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'extensions')) then
    raise exception 'C5 : un schéma de Supabase (auth, storage, extensions) existe';
  end if;
  if to_regclass('public.acces_firebase_reglage') is not null or exists (select 1 from pg_proc where proname in ('acces_base_autorise', 'initialiser_acces_firebase')) then
    raise exception 'C1 : un reste du badge Firebase existe';
  end if;
  if exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception 'C10 : pgcrypto ne doit pas être utilisé';
  end if;
end $$;
