-- 009 : pas de texte libre pour qui / par où / source / statut / type / action / motif / unité (règle 25, décision de Jérôme du 27/11/2026).
-- Ces colonnes contiennent un e-mail ou une valeur d'une LISTE FERMÉE contrôlée par la base. Le texte libre reste permis seulement pour
-- les notes, les commentaires et ce qui est LU sur une facture (un motif = un type en liste fermée + un commentaire libre à côté).
--
-- Règles d'écriture (pour ne rien casser de ce que lisent l'OS, le Pilotage et n8n) :
--   - une liste fermée = une contrainte CHECK, jamais un changement de type de colonne (les 67 vues de 006 lisent ces colonnes) ;
--   - on AJOUTE des colonnes (motif_type, moyen_type, par_ou…), on n'en renomme pas, on n'en retire pas ;
--   - chaque contrainte est posée « not valid » puis VALIDÉE si les lignes déjà là la respectent. Sinon elle reste « not valid » :
--     elle s'applique déjà à toute nouvelle ligne, et la migration 010 (nettoyage) remet les anciennes au format puis la valide.
--   - rejouable : chaque contrainte est retirée puis reposée.
-- Les listes elles-mêmes sont écrites dans les fonctions est_…() ci-dessous (immuables : une contrainte CHECK ne doit lire aucune table),
-- et rappelées dans outils/base/REGLES.md. Le test 11_surveillant.sql échoue si une colonne de ce genre reste en texte libre.

do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

-- ------------------------------------------------------------------ 1. Les listes (fonctions immuables, sans lecture de table)

-- « qui » : l'e-mail de la personne, ou un des trois acteurs qui ne sont pas des personnes :
--   n8n (un robot qui travaille seul), migration (une migration jouée par Jérôme), base (un déclencheur de la base elle-même).
create or replace function public.est_email(p text) returns boolean
language sql immutable parallel safe as
$$ select p is not null and char_length(p) <= 320 and p ~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' $$;

create or replace function public.acteurs_sans_personne() returns text[]
language sql immutable parallel safe as $$ select array['n8n', 'migration', 'base']::text[] $$;

create or replace function public.est_qui_valide(p text) returns boolean
language sql immutable parallel safe as
$$ select public.est_email(p) or coalesce(p = any (public.acteurs_sans_personne()), false) $$;

-- Une DÉCISION (valider, refuser, confirmer un IBAN…) est toujours prise par une personne (règle 14) : e-mail seulement.
create or replace function public.est_personne_valide(p text) returns boolean
language sql immutable parallel safe as $$ select public.est_email(p) $$;

-- « par où » (règle 4) : écran ; assistant (avec son nom s'il est connu du serveur) ; n8n (avec l'identifiant du workflow et le
-- numéro d'exécution s'ils sont connus) ; migration ; base. Grammaire fermée :
--   ecran | migration | base | assistant | assistant:claude | assistant:chatgpt | n8n | n8n:<workflow> | n8n:<workflow>#<n° d'exécution>
create or replace function public.est_par_ou_valide(p text) returns boolean
language sql immutable parallel safe as
$$ select p is not null and p ~ '^(ecran|migration|base|assistant(:(claude|chatgpt))?|n8n(:[A-Za-z0-9_-]{1,80}(#[0-9]{1,20})?)?)$' $$;

-- source_nom d'un reflet (règle 8) : un genre de source en liste fermée, suivi si besoin d'un détail (la boîte, le workflow).
--   courriel | courriel:<boîte> | depot | lecture | openrouter | n8n:<workflow> | reprise (copie d'un ancien scan, règle 18)
create or replace function public.est_source_nom_valide(p text) returns boolean
language sql immutable parallel safe as
$$ select p is not null and char_length(p) <= 200 and p ~ '^(courriel|depot|lecture|openrouter|reprise|n8n)(:[^[:cntrl:][:space:]][^[:cntrl:]]*)?$' $$;

-- Les unités SAISIES (article de référence). L'unité LUE sur une facture reste libre (elle est lue, pas saisie) ; sa forme
-- normalisée (normaliser_unite) sert aux rapprochements.
create or replace function public.liste_unites() returns text[]
language sql immutable parallel safe as $$
  select array['u', 'm', 'ml', 'm2', 'm3', 'cm', 'mm', 'km', 'kg', 'g', 't', 'l', 'cl', 'sac', 'rouleau', 'boite', 'palette', 'lot',
               'forfait', 'h', 'jour', 'ens', 'paquet', 'carton', 'plaque', 'barre', 'botte', 'seau', 'bidon', 'cartouche', 'pot',
               'tube', 'paire', 'kit']::text[]
$$;
create or replace function public.est_unite_connue(p text) returns boolean
language sql immutable parallel safe as $$ select p is not null and public.normaliser_unite(p) = any (public.liste_unites()) $$;

-- Actions du journal : les écritures automatiques (insert, update), les actions nommées des fonctions métier, et la mise au format (010).
create or replace function public.liste_actions_journal() returns text[]
language sql immutable parallel safe as $$
  select array['insert', 'update', 'creation', 'modification', 'statut', 'archiver', 'desarchiver', 'relier_chantier', 'rouvrir',
               'remplacement des lignes', 'rattachement a l''acceptation', 'confirmer', 'revoquer', 'desactivation', 'fusion', 'renommage',
               'reactivation (nouveau rapprochement)', 'retrait du refus (rapprochement validé)', 'desactivation (plus aucun rapprochement)',
               'validation', 'suggestion', 'dissociation', 'refus de suggestion', 'reactivation (suggestion reprise)', 'reprise de suggestion',
               'mise_au_format']::text[]
$$;

-- Types de motif (le commentaire libre reste dans la colonne motif… d'à côté). « non_precise » : la valeur des lignes d'avant et
-- des écritures qui n'envoient pas encore de type.
create or replace function public.liste_motifs_decision() returns text[]
language sql immutable parallel safe as $$
  select array['non_precise', 'doublon', 'montant_errone', 'pas_pour_nous', 'illisible', 'deja_payee', 'verifie_aupres_du_fournisseur',
               'erreur_de_decision', 'nouveau_scan', 'autre']::text[]
$$;
create or replace function public.liste_motifs_correction() returns text[]
language sql immutable parallel safe as $$
  select array['non_precise', 'erreur_de_lecture', 'information_du_fournisseur', 'autre']::text[]
$$;
create or replace function public.liste_moyens_verification_iban() returns text[]
language sql immutable parallel safe as $$
  select array['non_precise', 'appel_fournisseur', 'courriel_fournisseur', 'courrier_fournisseur', 'rib_signe', 'en_personne', 'autre']::text[]
$$;
create or replace function public.liste_motifs_revocation_iban() returns text[]
language sql immutable parallel safe as $$
  select array['non_precise', 'iban_change', 'erreur_de_saisie', 'fraude_suspectee', 'autre']::text[]
$$;

-- Les tables qu'un journal peut citer : les tables du registre, et les noms gardés pour l'OS (vues recollées).
create or replace function public.liste_tables_journal_fixes() returns text[]
language sql immutable parallel safe as $$
  select array['factures', 'lignes_facture', 'journal_decisions', 'rapprochements_articles', 'suggestions_refusees']::text[]
$$;

-- ------------------------------------------------------------------ 2. Outil de pose (migrations seulement)
-- Pose une contrainte de liste fermée « not valid », puis la valide si les lignes déjà là la respectent.
create or replace function public.poser_contrainte_liste(p_table text, p_nom text, p_expression text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('alter table %s drop constraint if exists %I', t, p_nom);
  execute format('alter table %s add constraint %I check (%s) not valid', t, p_nom, p_expression);
  begin
    execute format('alter table %s validate constraint %I', t, p_nom);
  exception when check_violation then
    raise notice 'Liste fermée % (%) : des lignes déjà là ne la respectent pas ; elle vaut pour les nouvelles lignes (voir 010).', p_nom, p_table;
  end;
end $$;

-- Pose sur une table les listes communes du socle : cree_par, modifie_par, archive_par (qui) et par_ou.
create or replace function public.poser_listes_socle(p_table text) returns void
language plpgsql as $$
declare t regclass := format('public.%I', p_table)::regclass;
begin
  execute format('alter table %s add column if not exists par_ou text', t);
  perform public.poser_contrainte_liste(p_table, p_table || '_cree_par_liste', 'public.est_qui_valide(cree_par)');
  perform public.poser_contrainte_liste(p_table, p_table || '_modifie_par_liste', 'public.est_qui_valide(modifie_par)');
  perform public.poser_contrainte_liste(p_table, p_table || '_archive_par_liste', 'archive_par is null or public.est_qui_valide(archive_par)');
  perform public.poser_contrainte_liste(p_table, p_table || '_par_ou_liste', 'par_ou is null or public.est_par_ou_valide(par_ou)');
end $$;

-- Le journal ne cite que des tables connues : la liste est refaite à partir du registre (à rappeler après chaque nouvelle table).
create or replace function public.poser_liste_tables_journal() returns void
language plpgsql as $$
declare v text[];
begin
  select array_agg(distinct x order by x) into v
    from (select t.nom_table as x from public.registre_tables t
          union all select unnest(public.liste_tables_journal_fixes())) s;
  perform public.poser_contrainte_liste('journal_modifications', 'journal_modifications_table_nom_liste',
    format('table_nom = any (%L::text[])', v));
end $$;

revoke all on function public.poser_contrainte_liste(text, text, text) from public, porte, robot_reflets, indicateurs;
revoke all on function public.poser_listes_socle(text) from public, porte, robot_reflets, indicateurs;
revoke all on function public.poser_liste_tables_journal() from public, porte, robot_reflets, indicateurs;

-- ------------------------------------------------------------------ 3. Les colonnes ajoutées (types en liste fermée, à côté du texte libre)
alter table public.factures_decisions add column if not exists motif_type text not null default 'non_precise';
alter table public.factures_corrections add column if not exists motif_type text not null default 'non_precise';
alter table public.ibans_confirmes add column if not exists moyen_type text not null default 'non_precise';
alter table public.ibans_confirmes add column if not exists motif_revocation_type text;

-- ------------------------------------------------------------------ 4. Les contraintes
-- poser_listes_fermees() pose (ou repose) toutes les contraintes de liste fermée ; 010 la rappelle après le nettoyage pour les valider.
-- Une nouvelle table (migration future) la rappelle aussi : le test 11_surveillant.sql le vérifie.
create or replace function public.poser_listes_fermees() returns void
language plpgsql as $$
declare r record; v_t text;
begin
  -- Le socle sur toutes les tables (registre compris : cree_par = « migration »).
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1 loop
    perform public.poser_listes_socle(r.relname);
  end loop;

  -- Le journal.
  perform public.poser_contrainte_liste('journal_modifications', 'journal_modifications_qui_liste', 'public.est_qui_valide(qui)');
  perform public.poser_contrainte_liste('journal_modifications', 'journal_modifications_action_liste',
    'action = any (public.liste_actions_journal())');
  perform public.poser_liste_tables_journal();

  -- Les décisions : une personne (e-mail), jamais un robot seul (règle 14).
  perform public.poser_contrainte_liste('factures_decisions', 'factures_decisions_decide_par_liste', 'public.est_personne_valide(decide_par)');
  perform public.poser_contrainte_liste('factures_decisions', 'factures_decisions_motif_type_liste',
    'motif_type = any (public.liste_motifs_decision())');
  perform public.poser_contrainte_liste('factures_corrections', 'factures_corrections_motif_type_liste',
    'motif_type = any (public.liste_motifs_correction())');
  perform public.poser_contrainte_liste('rapprochements_articles_tous', 'rapprochements_valide_par_liste',
    'valide_par is null or public.est_personne_valide(valide_par)');
  perform public.poser_contrainte_liste('suggestions_refusees_tous', 'suggestions_refusees_refuse_par_liste', 'public.est_personne_valide(refuse_par)');
  perform public.poser_contrainte_liste('ibans_confirmes', 'ibans_confirmes_confirme_par_liste', 'public.est_personne_valide(confirme_par)');
  perform public.poser_contrainte_liste('ibans_confirmes', 'ibans_confirmes_revoque_par_liste', 'revoque_par is null or public.est_personne_valide(revoque_par)');
  perform public.poser_contrainte_liste('ibans_confirmes', 'ibans_confirmes_moyen_type_liste',
    'moyen_type = any (public.liste_moyens_verification_iban())');
  perform public.poser_contrainte_liste('ibans_confirmes', 'ibans_confirmes_motif_revocation_type_liste',
    'motif_revocation_type is null or motif_revocation_type = any (public.liste_motifs_revocation_iban())');

  -- La personne des favoris et des tickets (celle de app.utilisateur).
  foreach v_t in array array['favoris', 'favoris_os', 'tickets_n8n', 'tickets_n8n_demandes'] loop
    perform public.poser_contrainte_liste(v_t, v_t || '_utilisateur_liste', 'public.est_qui_valide(utilisateur)');
  end loop;

  -- La source de chaque reflet.
  for r in select t.nom_table as relname from public.registre_tables t where t.nature = 'reflet' order by 1 loop
    perform public.poser_contrainte_liste(r.relname, r.relname || '_source_nom_liste', 'public.est_source_nom_valide(source_nom)');
  end loop;

  -- L'unité saisie d'un article de référence.
  perform public.poser_contrainte_liste('articles_reference', 'articles_reference_unite_liste', 'public.est_unite_connue(unite_reference)');
end $$;
revoke all on function public.poser_listes_fermees() from public, porte, robot_reflets, indicateurs;
select public.poser_listes_fermees();

-- ------------------------------------------------------------------ 5. La base n'écrit plus de « qui » hors liste elle-même
-- Avant : un rapprochement suggéré (sans personne) écrivait « suggestion automatique » au journal. C'est un geste de la base : « base ».
create or replace function public.reactiver_article_reference() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare v_actif boolean;
begin
  if new.archive_le is not null then return null; end if;
  select a.actif into v_actif from public.articles_reference a where a.id = new.article_reference_id for update;
  if found and not v_actif then
    update public.articles_reference set actif = true where id = new.article_reference_id;
    perform public.journaliser_modification('articles_reference', new.article_reference_id, 'reactivation (nouveau rapprochement)',
      coalesce(nullif(btrim(new.valide_par), ''), 'base'), null,
      jsonb_build_object('actif', false), jsonb_build_object('actif', true, 'article_fournisseur_id', new.article_fournisseur_id));
  end if;
  return null;
end $$;

-- ------------------------------------------------------------------ 6. Droits
-- Les fonctions de liste servent aux contraintes : la base vérifie le droit d'exécuter de celui qui écrit.
do $$
declare f text;
begin
  foreach f in array array['est_email(text)', 'acteurs_sans_personne()', 'est_qui_valide(text)', 'est_personne_valide(text)',
                           'est_par_ou_valide(text)', 'est_source_nom_valide(text)', 'liste_unites()', 'est_unite_connue(text)',
                           'liste_actions_journal()', 'liste_motifs_decision()', 'liste_motifs_correction()',
                           'liste_moyens_verification_iban()', 'liste_motifs_revocation_iban()', 'liste_tables_journal_fixes()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to porte, robot_reflets, indicateurs', f);
  end loop;
end $$;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
