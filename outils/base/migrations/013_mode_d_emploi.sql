-- 013 : le mode d'emploi rangé dans la base (règles 23 et 24 ; point 5 du brief du 27/11/2026).
--
-- Deux tables de STRUCTURE, comme registre_tables : sans espace_id, communes à tous les espaces, lecture seule pour porte, robot_reflets
-- et indicateurs (elles changent seulement par une migration).
--   mode_emploi_objets : pour chaque table du registre (et la vue factures, la fiche que l'on voit), la personne peut-elle créer (« + ») ?
--                        Sinon, la phrase qui dit pourquoi.
--   mode_emploi_champs : pour chaque champ, sa catégorie (lu sur facture, recopié, saisi, calculé, sécurité, comptable), s'il se modifie
--                        (oui / non / avant la décision seulement) et la phrase à afficher quand il est cadenassé.
-- La base fait foi : l'écran et l'assistant LIRONT ce mode d'emploi (PR suivantes) au lieu de décider eux-mêmes.
-- Le test 14_mode_d_emploi.sql vérifie qu'il dit la même chose que les vrais verrous (droits, déclencheurs, et un essai réel de
-- modification de chaque champ sous le rôle de la porte, annulé ensuite).
--
-- Remplissage : des règles générales (calculées une fois ici, à partir de la structure), puis des cas particuliers écrits à la main.
-- Une nouvelle table ou une nouvelle colonne : rappeler public.poser_id_fige('<table>') et public.remplir_mode_emploi() à la fin de sa
-- migration (le test 14 échoue sinon). Les cas écrits à la main (ecrit_a_la_main) ne sont pas écrasés ; une colonne disparue est archivée.

do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

create table if not exists public.mode_emploi_objets (
  id uuid primary key default gen_random_uuid(),
  objet text not null unique check (objet ~ '^[a-z][a-z0-9_]{1,62}$'),
  creer boolean not null,
  phrase_sans_creer text,
  constraint mode_emploi_objets_phrase check (creer or char_length(btrim(coalesce(phrase_sans_creer, ''))) >= 10)
);
select public.poser_socle('mode_emploi_objets', false, false);

create table if not exists public.mode_emploi_champs (
  id uuid primary key default gen_random_uuid(),
  objet text not null check (objet ~ '^[a-z][a-z0-9_]{1,62}$'),
  champ text not null check (champ ~ '^[a-z][a-z0-9_]{0,62}$'),
  categorie text not null,
  modifiable text not null,
  phrase_cadenas text,
  ecrit_a_la_main boolean not null default false,   -- cas particulier écrit plus bas : remplir_mode_emploi() ne l'écrase pas
  constraint mode_emploi_champs_un unique (objet, champ),
  constraint mode_emploi_champs_categorie_liste check (categorie = any (array['lu_sur_facture', 'recopie', 'saisi', 'calcule', 'securite', 'comptable'])),
  -- oui ; non ; avant_decision (tant que la facture est à valider) ; apres_decision (seulement une fois décidée) ;
  -- tant_que_vide (se remplit une fois, puis ne change plus).
  constraint mode_emploi_champs_modifiable_liste check (modifiable = any (array['oui', 'non', 'avant_decision', 'apres_decision', 'tant_que_vide'])),
  constraint mode_emploi_champs_phrase check (modifiable = 'oui' or char_length(btrim(coalesce(phrase_cadenas, ''))) >= 10)
);
select public.poser_socle('mode_emploi_champs', false, false);
alter table public.mode_emploi_champs add column if not exists ecrit_a_la_main boolean not null default false;

-- L'identifiant d'une ligne ne change jamais (le mode d'emploi le dit « non » : la base le garantit, sur toutes les tables).
create or replace function public.socle_id_fige() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception '% : l''identifiant d''une ligne ne change pas', tg_table_name using errcode = 'P0001', detail = 'id_fige';
  end if;
  return new;
end $$;
revoke all on function public.socle_id_fige() from public;
grant execute on function public.socle_id_fige() to porte, robot_reflets, indicateurs;
-- À rappeler pour toute nouvelle table (le test 14 le vérifie par un essai réel).
create or replace function public.poser_id_fige(p_table text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('drop trigger if exists ab_socle_id_fige on %s', t);
  execute format('create trigger ab_socle_id_fige before update on %s for each row execute function public.socle_id_fige()', t);
end $$;
revoke all on function public.poser_id_fige(text) from public, porte, robot_reflets, indicateurs;

insert into public.registre_tables (nom_table, nature, verite_ou, robot, a_valider_par_jerome, explication) values
  ('mode_emploi_objets', 'source', null, null, true, 'Le mode d''emploi : pour chaque table, la personne peut-elle créer (« + »). Structure commune, sans espace.'),
  ('mode_emploi_champs', 'source', null, null, true, 'Le mode d''emploi : pour chaque champ, sa catégorie, s''il se modifie et la phrase du cadenas. Structure commune, sans espace.')
on conflict (nom_table) do update set nature = excluded.nature, verite_ou = excluded.verite_ou, robot = excluded.robot,
  a_valider_par_jerome = excluded.a_valider_par_jerome, explication = excluded.explication;

-- Les listes fermées et « par où » des deux nouvelles tables (règles 4 et 25).
select public.poser_par_ou('mode_emploi_objets');
select public.poser_par_ou('mode_emploi_champs');
select public.poser_listes_fermees();
do $$
declare r record;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1 loop
    perform public.poser_id_fige(r.relname);
  end loop;
end $$;

-- Droits : lecture seule pour les trois rôles (comme le registre). Pas de sécurité par ligne : rien n'y est propre à un espace.
revoke all on public.mode_emploi_objets, public.mode_emploi_champs from public, porte, robot_reflets, indicateurs;
grant select on public.mode_emploi_objets, public.mode_emploi_champs to porte, robot_reflets, indicateurs;

-- ------------------------------------------------------------------ Les phrases (une seule fois chacune)
create or replace function public.phrase_mode_emploi(p_cle text) returns text language sql immutable as $$
  select case p_cle
    when 'securite' then 'Rempli par la base (qui, quand, par où) : personne ne le change.'
    when 'calcule' then 'Calculé par la base à partir des autres champs : il ne s''écrit pas.'
    when 'lu' then 'Lu sur la facture par n8n : on ne le change pas ici. Une correction se fait sur la fiche de la facture, et l''original reste.'
    when 'recopie' then 'Recopié par n8n depuis l''endroit où vit la vérité : il se change là-bas, pas ici.'
    when 'ajout_seul' then 'Enregistré une fois pour toutes : on ne le modifie pas, on ajoute une nouvelle ligne.'
    when 'structure' then 'Décrit la structure de la base : il change seulement par une mise à jour de la base.'
    when 'decidee' then 'Facture déjà décidée : ce champ ne change plus. Pour revenir dessus, on rouvre la facture (avec un motif).'
    when 'agence_entreprise' then 'Une agence ne change pas d''entreprise.'
    when 'iban' then 'Un IBAN confirmé ne se change pas : on le révoque (avec un motif), puis on en confirme un autre.'
    when 'archive_facture' then 'On archive avec le bouton « Archiver » : la date et la personne sont remplies par la base.'
    when 'lien_valide' then 'Le lien se fait ou se défait avec les boutons « Valider » et « Dissocier » : la personne et l''heure sont remplies par la base.'
    when 'siren_connu' then 'Le SIREN d''une entreprise se remplit une fois ; ensuite il ne change plus.'
    when 'archive_non_decidee' then 'Seule une facture déjà acceptée ou refusée peut être archivée.'
    when 'decideur' then 'Rempli avec la décision (la personne et l''heure) ; une fois la facture décidée, il ne change plus.'
    when 'relecture' then 'Vient de la lecture de la facture par n8n : une nouvelle lecture s''ajoute, on ne l''écrit pas à la main.'
  end
$$;

-- ------------------------------------------------------------------ Remplissage
create or replace function public.remplir_mode_emploi() returns void
language plpgsql as $$
begin
  -- 1. Les objets : chaque table du registre, plus la vue factures. Personne ne crée, sauf les cas écrits plus bas.
  insert into public.mode_emploi_objets (objet, creer, phrase_sans_creer)
  select t.nom_table, false,
         case when t.nature = 'reflet' then 'Ces lignes arrivent toutes seules (recopiées par n8n) : on ne les crée pas à la main.'
              else 'Ces lignes sont créées par la base ou par une action d''une fiche, pas par un bouton « + ».' end
    from public.registre_tables t
  on conflict (objet) do nothing;
  insert into public.mode_emploi_objets (objet, creer, phrase_sans_creer)
  values ('factures', false, 'Une facture arrive par courriel ou par dépôt du PDF : on ne la tape pas à la main.')
  on conflict (objet) do nothing;
  -- La personne est la source (règle 24) : les chantiers, les entreprises, leurs agences et les articles de référence.
  update public.mode_emploi_objets set creer = true, phrase_sans_creer = null
   where objet in ('chantiers', 'fournisseurs', 'etablissements_fournisseur', 'articles_reference') and not creer;

  -- 2. Les champs des tables, par des règles générales tirées de la structure.
  insert into public.mode_emploi_champs (objet, champ, categorie, modifiable, phrase_cadenas)
  select x.objet, x.champ, x.categorie, x.modifiable,
         case when x.modifiable = 'oui' then null else public.phrase_mode_emploi(x.cle) end
    from (
      select c.relname::text as objet, a.attname::text as champ,
             case
               when c.relname = 'journal_modifications' then 'securite'
               when a.attname in ('id', 'espace_id', 'cree_le', 'cree_par', 'modifie_le', 'modifie_par', 'archive_par', 'par_ou', 'created_at',
                                  'copie_le', 'source_nom', 'source_ref', 'rang', 'qui', 'qui_id', 'quand', 'decide_le', 'corrige_le',
                                  'confirme_par', 'confirme_par_id', 'confirme_le', 'revoque_par', 'revoque_par_id', 'decide_par', 'decide_par_id',
                                  'refuse_par', 'refuse_le', 'valide_par', 'valide_le') then 'securite'
               when a.attgenerated <> '' then 'calcule'
               when t.nature = 'reflet' and c.relname in ('factures_scans', 'lignes_facture_lues') then 'lu_sur_facture'
               when t.nature = 'reflet' then 'recopie'
               when a.attname ~ '^(iban|montant|prix|taux_tva|remise_pct|budget_ht|cout_eur)' then 'comptable'
               else 'saisi'
             end as categorie,
             case
               when c.relname in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs') then 'non'
               when a.attgenerated <> '' then 'non'
               when t.nature = 'reflet' then 'non'
               when exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid where g.tgrelid = c.oid and p.proname = 'ajout_seul') then 'non'
               when not has_column_privilege('porte', c.oid, a.attnum, 'UPDATE') then 'non'
               when a.attname in ('id', 'espace_id', 'cree_le', 'cree_par', 'modifie_le', 'modifie_par', 'archive_par', 'par_ou', 'created_at',
                                  'copie_le', 'source_nom', 'source_ref', 'rang', 'qui', 'qui_id', 'quand', 'decide_le', 'corrige_le',
                                  'confirme_par', 'confirme_par_id', 'confirme_le', 'revoque_par', 'revoque_par_id', 'decide_par', 'decide_par_id',
                                  'refuse_par', 'refuse_le', 'valide_par', 'valide_le') then 'non'
               else 'oui'
             end as modifiable,
             case
               when c.relname in ('registre_tables', 'mode_emploi_objets', 'mode_emploi_champs') then 'structure'
               when a.attgenerated <> '' then 'calcule'
               when t.nature = 'reflet' and c.relname in ('factures_scans', 'lignes_facture_lues') then 'lu'
               when t.nature = 'reflet' then 'recopie'
               when exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid where g.tgrelid = c.oid and p.proname = 'ajout_seul') then 'ajout_seul'
               else 'securite'
             end as cle
        from pg_class c
        join public.registre_tables t on t.nom_table = c.relname
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    ) x
  on conflict (objet, champ) do update set categorie = excluded.categorie, modifiable = excluded.modifiable, phrase_cadenas = excluded.phrase_cadenas
    where not mode_emploi_champs.ecrit_a_la_main;

  -- 3. Une colonne disparue : sa ligne est archivée (on ne supprime rien), et le test 14 ne la regarde plus.
  update public.mode_emploi_champs m set archive_le = now()
   where m.archive_le is null
     and not exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.' || m.objet) and a.attname = m.champ and a.attnum > 0 and not a.attisdropped);
end $$;
revoke all on function public.remplir_mode_emploi() from public, porte, robot_reflets, indicateurs;
revoke all on function public.phrase_mode_emploi(text) from public;
grant execute on function public.phrase_mode_emploi(text) to porte, robot_reflets, indicateurs;

select public.remplir_mode_emploi();

-- ------------------------------------------------------------------ Cas particuliers (les gardes métier des migrations 002 à 005)
create or replace function pg_temp.cas(p_objet text, p_champ text, p_categorie text, p_modifiable text, p_cle text) returns void language sql as $$
  insert into public.mode_emploi_champs (objet, champ, categorie, modifiable, phrase_cadenas, ecrit_a_la_main)
  values (p_objet, p_champ, p_categorie, p_modifiable, case when p_modifiable = 'oui' then null else public.phrase_mode_emploi(p_cle) end, true)
  on conflict (objet, champ) do update set categorie = excluded.categorie, modifiable = excluded.modifiable, phrase_cadenas = excluded.phrase_cadenas,
    ecrit_a_la_main = true;
$$;

select pg_temp.cas('fournisseurs', 'siren', 'saisi', 'tant_que_vide', 'siren_connu');
select pg_temp.cas('etablissements_fournisseur', 'fournisseur_id', 'saisi', 'non', 'agence_entreprise');
-- Un IBAN confirmé ne se modifie pas (ibans_confirmes_garde) ; la révocation passe par revoquer_iban.
select pg_temp.cas('ibans_confirmes', c, case when c = 'iban' then 'comptable' else 'saisi' end, 'non', 'iban')
  from unnest(array['fournisseur_id', 'siren', 'iban', 'facture_id', 'moyen_verification', 'moyen_type', 'motif_revocation', 'motif_revocation_type',
                    'revoque_le', 'archive_le']) c;
-- L'identité d'une facture et le lien de ses lignes vers les articles : seulement tant que la facture est à valider.
select pg_temp.cas('factures_identite', c, 'saisi', 'avant_decision', 'decidee')
  from unnest(array['fournisseur_id', 'etablissement_id', 'chantier_id']) c;
-- Archiver une facture : seulement une fois décidée (l'inverse des autres champs) ; sur la fiche, c'est le bouton « Archiver ».
select pg_temp.cas('factures_identite', 'archive_le', 'saisi', 'apres_decision', 'archive_non_decidee');
-- Recalés par la base à chaque lecture ; tant que la facture est à valider, la table les accepte aussi en direct.
select pg_temp.cas('factures_identite', c, 'calcule', 'avant_decision', 'decidee') from unnest(array['fournisseur_siren', 'numero_normalise']) c;
select pg_temp.cas('lignes_facture_articles', c, 'saisi', 'non', 'ajout_seul') from unnest(array['ligne_id', 'article_fournisseur_id']) c;
select pg_temp.cas('lignes_facture_articles', 'archive_le', 'saisi', 'avant_decision', 'decidee');
-- Un lien validé : par les boutons (la personne et l'heure sont remplies par la base).
select pg_temp.cas('rapprochements_articles_tous', c, 'securite', 'non', 'lien_valide') from unnest(array['valide_par', 'valide_le']) c;

-- La vue factures (la fiche que l'on voit) : ce que fait factures_vue_modifier (004).
select pg_temp.cas('factures', c, 'calcule', 'non', 'calcule')
  from unnest(array['id', 'created_at', 'lignes_etat', 'lignes_somme_ht', 'numero_normalise', 'iban_normalise', 'fournisseur_siren', 'alertes_a_la_decision']) c;
select pg_temp.cas('factures', c, 'lu_sur_facture', 'avant_decision', 'decidee')
  from unnest(array['fournisseur', 'numero', 'date_facture', 'type_document']) c;
select pg_temp.cas('factures', c, 'comptable', 'avant_decision', 'decidee') from unnest(array['montant_ht', 'montant_tva', 'montant_ttc']) c;
select pg_temp.cas('factures', c, 'lu_sur_facture', 'non', 'relecture')
  from unnest(array['extraction', 'extraction_erreur', 'fichier_path', 'email_expediteur', 'email_message_id', 'courriel_id']) c;
select pg_temp.cas('factures', c, 'saisi', 'avant_decision', 'decidee')
  from unnest(array['fournisseur_id', 'etablissement_id', 'chantier_id', 'statut', 'motif_refus', 'motif_acceptation', 'acceptee_malgre_alerte']) c;
select pg_temp.cas('factures', c, 'securite', 'avant_decision', 'decideur') from unnest(array['decide_par', 'decide_par_id', 'date_decision']) c;
select pg_temp.cas('factures', c, 'securite', 'non', 'archive_facture') from unnest(array['archivee_le', 'archivee_par']) c;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
