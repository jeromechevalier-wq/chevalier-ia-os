-- 11 : le surveillant (règle 25). Échoue si une colonne « qui / par / par où / source / statut / type / action / motif / unité »
-- est en texte libre sans liste fermée contrôlée par la base. Regarde TOUTES les tables, y compris celles des migrations futures.
--
-- Une colonne est « fermée » si :
--   (a) une contrainte CHECK de sa table la cite ET contient une liste (= ANY (ARRAY[…]) ou = ANY (liste_…())) ou une fonction de liste
--       (est_qui_valide, est_personne_valide, est_par_ou_valide, est_source_nom_valide, est_unite_connue) ; une simple longueur ne compte pas ;
--   (b) ou c'est une clé étrangère ;
--   (c) ou c'est un COMMENTAIRE libre de motif (motif, motif_refus…) ou de vérification, ET sa table a la colonne de type fermée qui va avec ;
--   (d) ou elle est dans la liste des exceptions ci-dessous, avec sa raison (ce qui est LU sur une facture, ou calculé à partir de la lecture).

create or replace function pg_temp.colonne_fermee(p_table oid, p_attnum smallint) returns boolean language sql stable as $$
  -- La contrainte doit porter sur la colonne ELLE-MÊME : « colonne = ANY (…) » ou « est_…(colonne) » (une longueur ou un calcul ne compte pas).
  select exists (
    select 1 from pg_constraint k, pg_attribute a
     where k.conrelid = p_table and k.contype = 'c' and p_attnum = any (k.conkey)
       and a.attrelid = p_table and a.attnum = p_attnum
       and pg_get_constraintdef(k.oid) ~ ('(\(|\s)' || a.attname || ' = ANY \((ARRAY\[|''\{|(public\.)?liste_[a-z_]+\(\)\))'
                                          || '|est_(qui|personne|par_ou|source_nom|unite)[a-z_]*\(' || a.attname || '\)'))
  or exists (select 1 from pg_constraint k where k.conrelid = p_table and k.contype = 'f' and p_attnum = any (k.conkey))
$$;

create or replace function pg_temp.colonnes_libres() returns table(colonne text) language sql stable as $$
  with surveillees as (
    select c.oid as t, c.relname::text as table_nom, a.attnum, a.attname::text as col
      from pg_class c join pg_attribute a on a.attrelid = c.oid
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
       and a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)
       and a.attname ~ '(^qui$|_par$|^par_ou|^utilisateur$|^source_nom$|statut|^type_|_type$|^genre$|^nature$|^action$|^table_nom$|^decision$|^resultat$|^declencheur$|^usage$|^champ$|motif|unite|^moyen|^etat$|_etat$|^role$|^source$|^origine$|^decideur)'
  ),
  -- (c) commentaire libre -> sa colonne de type fermée.
  compagnons(table_nom, col, type_col) as (values
    ('factures_decisions', 'motif', 'motif_type'),
    ('factures_decisions', 'motif_refus', 'motif_type'),
    ('factures_decisions', 'motif_acceptation', 'motif_type'),
    ('factures_corrections', 'motif', 'motif_type'),
    ('ibans_confirmes', 'moyen_verification', 'moyen_type'),
    ('ibans_confirmes', 'motif_revocation', 'motif_revocation_type')),
  -- (d) exceptions écrites, avec leur raison.
  exceptions(table_nom, col, raison) as (values
    ('lignes_facture_lues', 'unite', 'lue sur la facture'),
    ('lignes_facture_lues', 'unite_normalisee', 'calculée à partir de l''unité lue'),
    ('articles_fournisseur', 'unite', 'recopiée de l''unité lue sur la facture'),
    ('articles_fournisseur', 'unite_normalisee', 'calculée à partir de l''unité lue'))
  select s.table_nom || '.' || s.col from surveillees s
   where not pg_temp.colonne_fermee(s.t, s.attnum)
     and not exists (select 1 from exceptions e where e.table_nom = s.table_nom and e.col = s.col)
     and not exists (select 1 from compagnons p join pg_attribute a2 on a2.attrelid = s.t and a2.attname = p.type_col and not a2.attisdropped
                      where p.table_nom = s.table_nom and p.col = s.col and pg_temp.colonne_fermee(s.t, a2.attnum))
   order by 1
$$;

do $$
declare v text;
begin
  select string_agg(colonne, ', ') into v from pg_temp.colonnes_libres();
  if v is not null then
    raise exception 'Règle 25 : colonnes en texte libre sans liste fermée : % (ajoute une contrainte de liste, un type fermé à côté, ou une exception motivée dans 11_surveillant.sql)', v;
  end if;
end $$;

-- Le surveillant voit bien une nouvelle colonne en texte libre (essai dans une transaction annulée).
begin;
alter table public.chantiers add column type_essai text;
alter table public.chantiers add column statut_essai text check (char_length(statut_essai) < 20);   -- une longueur n'est pas une liste
alter table public.chantiers add column essai_etat text check (char_length(essai_etat) = any (array[1, 2, 3]));   -- ni un calcul sur la colonne
do $$
begin
  if not exists (select 1 from pg_temp.colonnes_libres() c where c.colonne = 'chantiers.type_essai')
     or not exists (select 1 from pg_temp.colonnes_libres() c where c.colonne = 'chantiers.statut_essai')
     or not exists (select 1 from pg_temp.colonnes_libres() c where c.colonne = 'chantiers.essai_etat') then
    raise exception 'Le surveillant ne voit pas une colonne en texte libre';
  end if;
end $$;
rollback;

-- Chaque contrainte de liste fermée vaut aussi pour le rôle de la porte : la base vérifie le droit d'exécuter les fonctions de liste.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace and (p.proname like 'est\_%' or p.proname like 'liste\_%' or p.proname = 'acteurs_sans_personne') loop
    if not has_function_privilege('porte', f.sig, 'execute') or not has_function_privilege('robot_reflets', f.sig, 'execute') then
      raise exception 'La fonction de liste % n''est pas exécutable par porte et robot_reflets', f.sig;
    end if;
  end loop;
end $$;
