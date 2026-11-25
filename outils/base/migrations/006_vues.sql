-- 006 : les vues de lecture (tableaux de bord, Pilotage, prix, IA), reprises À L'IDENTIQUE du dépôt BTP (état après 034) :
-- mêmes noms, mêmes colonnes. Toutes en security_invoker : elles lisent avec les droits de celui qui les interroge,
-- donc la sécurité par espace des tables s'applique (une vue ne montre jamais un autre espace).
-- Elles lisent les vues de compatibilité de 004 (factures, lignes_facture, rapprochements_articles, suggestions_refusees, journal_decisions).

create or replace view public.fournisseurs_a_verifier WITH (security_invoker='true') AS
 SELECT fo.id AS fournisseur_id,
    fo.siren,
    fo.nom,
    f.iban_normalise AS iban,
    count(*) AS nb_factures,
    max(f.created_at) AS derniere_facture_le,
    bool_or((f.statut = 'acceptee'::public.statut_facture)) AS a_une_facture_acceptee,
    bool_and((f.statut = 'refusee'::public.statut_facture)) AS vu_seulement_sur_refusee,
    (array_agg(f.id ORDER BY f.created_at DESC) FILTER (WHERE (f.statut <> 'refusee'::public.statut_facture)))[1] AS facture_a_confirmer,
    rv.revoque_le,
    rv.motif_revocation,
    (EXISTS ( SELECT 1
           FROM public.ibans_confirmes c3
          WHERE ((c3.iban = f.iban_normalise) AND (c3.revoque_le IS NULL) AND (c3.siren <> fo.siren)))) AS confirme_pour_autre_siren,
    (EXISTS ( SELECT 1
           FROM public.factures f2
          WHERE ((f2.iban_normalise = f.iban_normalise) AND (f2.fournisseur_siren IS NOT NULL) AND (f2.fournisseur_siren <> fo.siren)))) AS vu_chez_autre_siren
   FROM ((public.factures f
     JOIN public.fournisseurs fo ON ((fo.siren = f.fournisseur_siren)))
     LEFT JOIN LATERAL ( SELECT c2.revoque_le,
            c2.motif_revocation
           FROM public.ibans_confirmes c2
          WHERE ((c2.iban = f.iban_normalise) AND (c2.siren = fo.siren) AND (c2.revoque_le IS NOT NULL))
          ORDER BY c2.revoque_le DESC
         LIMIT 1) rv ON (true))
  WHERE ((f.iban_normalise IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.ibans_confirmes c
          WHERE ((c.iban = f.iban_normalise) AND (c.siren = fo.siren) AND (c.revoque_le IS NULL))))))
  GROUP BY fo.id, fo.siren, fo.nom, f.iban_normalise, rv.revoque_le, rv.motif_revocation;
create or replace view public.v_prix_articles WITH (security_invoker='true') AS
 SELECT l.id AS ligne_id,
    f.id AS facture_id,
    COALESCE(f.date_facture, ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date) AS date_prix,
    af.fournisseur_id,
    fo.nom AS fournisseur,
    e.id AS etablissement_id,
    e.nom_agence,
    e.ville,
    f.chantier_id,
    c.nom AS chantier,
    af.id AS article_fournisseur_id,
    af.reference AS reference_fournisseur,
    af.designation AS designation_fournisseur,
    COALESCE(ar.id, af.id) AS article_reference_id,
    COALESCE(ar.nom, af.designation) AS article_reference,
    COALESCE(ar.unite_reference, af.unite) AS unite_reference,
    COALESCE(r.coefficient, (1)::numeric) AS coefficient,
    l.quantite,
    l.montant_ht,
    (l.montant_ht / NULLIF(l.quantite, (0)::numeric)) AS prix_unite_fournisseur,
    ((l.montant_ht / NULLIF(l.quantite, (0)::numeric)) * COALESCE(r.coefficient, (1)::numeric)) AS prix_unite_reference,
    (l.quantite / COALESCE(r.coefficient, (1)::numeric)) AS quantite_unite_reference,
    (r.article_fournisseur_id IS NOT NULL) AS rapproche
   FROM ((((((((public.lignes_facture l
     JOIN public.factures f ON (((f.id = l.facture_id) AND (f.statut = 'acceptee'::public.statut_facture) AND (f.type_document = 'facture'::text))))
     JOIN public.articles_fournisseur af ON ((af.id = l.article_fournisseur_id)))
     LEFT JOIN public.rapprochements_articles r ON (((r.article_fournisseur_id = af.id) AND (r.valide_le IS NOT NULL))))
     LEFT JOIN public.articles_reference ar ON ((ar.id = r.article_reference_id)))
     JOIN public.fournisseurs fo ON ((fo.id = af.fournisseur_id)))
     LEFT JOIN public.etablissements_fournisseur e0 ON ((e0.id = f.etablissement_id)))
     LEFT JOIN public.etablissements_fournisseur e ON ((e.id = COALESCE(e0.fusionne_dans, f.etablissement_id))))
     LEFT JOIN public.chantiers c ON ((c.id = f.chantier_id)))
  WHERE ((l.quantite > (0)::numeric) AND (l.montant_ht IS NOT NULL));
create or replace view public.v_hausse_6_mois WITH (security_invoker='true') AS
 SELECT article_reference_id,
    article_reference,
    unite_reference,
    fournisseur_id,
    fournisseur,
    nb_lignes,
    premiere_date,
    derniere_date,
    premier_prix,
    dernier_prix,
    round((((100)::numeric * (dernier_prix - premier_prix)) / NULLIF(premier_prix, (0)::numeric)), 2) AS variation_pct
   FROM ( SELECT v_prix_articles.article_reference_id,
            v_prix_articles.article_reference,
            v_prix_articles.unite_reference,
            v_prix_articles.fournisseur_id,
            v_prix_articles.fournisseur,
            count(*) AS nb_lignes,
            min(v_prix_articles.date_prix) AS premiere_date,
            max(v_prix_articles.date_prix) AS derniere_date,
            (array_agg(v_prix_articles.prix_unite_reference ORDER BY v_prix_articles.date_prix, v_prix_articles.ligne_id))[1] AS premier_prix,
            (array_agg(v_prix_articles.prix_unite_reference ORDER BY v_prix_articles.date_prix DESC, v_prix_articles.ligne_id DESC))[1] AS dernier_prix
           FROM public.v_prix_articles
          WHERE (v_prix_articles.date_prix >= ((((now() AT TIME ZONE 'Europe/Paris'::text))::date - '6 mons'::interval))::date)
          GROUP BY v_prix_articles.article_reference_id, v_prix_articles.article_reference, v_prix_articles.unite_reference, v_prix_articles.fournisseur_id, v_prix_articles.fournisseur
         HAVING (count(*) >= 2)) s;
create or replace view public.v_articles_en_hausse WITH (security_invoker='true') AS
 SELECT article_reference_id,
    article_reference,
    unite_reference,
    fournisseur_id,
    fournisseur,
    nb_lignes,
    premiere_date,
    derniere_date,
    premier_prix,
    dernier_prix,
    variation_pct
   FROM public.v_hausse_6_mois
  WHERE (variation_pct > (0)::numeric)
  ORDER BY variation_pct DESC;
create or replace view public.v_budget_chantiers WITH (security_invoker='true') AS
 SELECT c.id AS chantier_id,
    c.nom AS chantier,
    c.client,
    c.statut,
    c.budget_ht,
    COALESCE(sum(
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ht)
            ELSE f.montant_ht
        END) FILTER (WHERE (f.statut = 'acceptee'::public.statut_facture)), (0)::numeric) AS engage_ht,
    COALESCE(sum(
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ht)
            ELSE f.montant_ht
        END) FILTER (WHERE (f.statut = 'a_valider'::public.statut_facture)), (0)::numeric) AS en_attente_ht,
    (c.budget_ht - COALESCE(sum(
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ht)
            ELSE f.montant_ht
        END) FILTER (WHERE (f.statut = 'acceptee'::public.statut_facture)), (0)::numeric)) AS reste_ht,
        CASE
            WHEN (c.budget_ht > (0)::numeric) THEN round((((100)::numeric * COALESCE(sum(
            CASE
                WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ht)
                ELSE f.montant_ht
            END) FILTER (WHERE (f.statut = 'acceptee'::public.statut_facture)), (0)::numeric)) / c.budget_ht), 1)
            ELSE NULL::numeric
        END AS pct_budget_consomme
   FROM (public.chantiers c
     LEFT JOIN public.factures f ON ((f.chantier_id = c.id)))
  GROUP BY c.id;
create or replace view public.v_comparaison_fournisseurs WITH (security_invoker='true') AS
 SELECT 'agence'::text AS niveau,
    v_prix_articles.article_reference_id,
    v_prix_articles.article_reference,
    v_prix_articles.unite_reference,
    v_prix_articles.fournisseur_id,
    v_prix_articles.fournisseur,
    v_prix_articles.etablissement_id,
    v_prix_articles.nom_agence,
    v_prix_articles.ville,
    count(*) AS nb_lignes,
    min(v_prix_articles.prix_unite_reference) AS prix_min,
    max(v_prix_articles.prix_unite_reference) AS prix_max,
    (sum(v_prix_articles.montant_ht) / NULLIF(sum(v_prix_articles.quantite_unite_reference), (0)::numeric)) AS prix_moyen,
    max(v_prix_articles.date_prix) AS derniere_date,
    (array_agg(v_prix_articles.prix_unite_reference ORDER BY v_prix_articles.date_prix DESC, v_prix_articles.ligne_id DESC))[1] AS dernier_prix
   FROM public.v_prix_articles
  GROUP BY v_prix_articles.article_reference_id, v_prix_articles.article_reference, v_prix_articles.unite_reference, v_prix_articles.fournisseur_id, v_prix_articles.fournisseur, v_prix_articles.etablissement_id, v_prix_articles.nom_agence, v_prix_articles.ville
UNION ALL
 SELECT 'fournisseur'::text AS niveau,
    v_prix_articles.article_reference_id,
    v_prix_articles.article_reference,
    v_prix_articles.unite_reference,
    v_prix_articles.fournisseur_id,
    v_prix_articles.fournisseur,
    NULL::uuid AS etablissement_id,
    NULL::text AS nom_agence,
    NULL::text AS ville,
    count(*) AS nb_lignes,
    min(v_prix_articles.prix_unite_reference) AS prix_min,
    max(v_prix_articles.prix_unite_reference) AS prix_max,
    (sum(v_prix_articles.montant_ht) / NULLIF(sum(v_prix_articles.quantite_unite_reference), (0)::numeric)) AS prix_moyen,
    max(v_prix_articles.date_prix) AS derniere_date,
    (array_agg(v_prix_articles.prix_unite_reference ORDER BY v_prix_articles.date_prix DESC, v_prix_articles.ligne_id DESC))[1] AS dernier_prix
   FROM public.v_prix_articles
  GROUP BY v_prix_articles.article_reference_id, v_prix_articles.article_reference, v_prix_articles.unite_reference, v_prix_articles.fournisseur_id, v_prix_articles.fournisseur;
create or replace view public.v_courriels_recus_par_jour WITH (security_invoker='true') AS
 SELECT ((recu_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    client,
    boite,
    workflow,
    resultat,
    authentification,
    count(*) AS nb_courriels
   FROM public.courriels_recus
  GROUP BY (((recu_le AT TIME ZONE 'Europe/Paris'::text))::date), client, boite, workflow, resultat, authentification;
create or replace view public.v_cout_ia_par_etiquette WITH (security_invoker='true') AS
 SELECT ((c.cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    COALESCE(e.etiquette,
        CASE
            WHEN (c.etiquettes_lues IS TRUE) THEN '(sans étiquette)'::text
            ELSE '(étiquettes non relevées)'::text
        END) AS etiquette,
        CASE
            WHEN (e.etiquette IS NULL) THEN 'aucune'::text
            WHEN (e.etiquette ~ '^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$'::text) THEN 'pour_qui'::text
            WHEN (e.etiquette ~~ 'domaine-%'::text) THEN 'domaine'::text
            ELSE 'autre'::text
        END AS famille,
    count(*) AS nb_appels,
    COALESCE(sum(c.cout_eur), (0)::numeric) AS cout_eur,
    count(*) FILTER (WHERE (c.cout_eur IS NULL)) AS appels_sans_cout
   FROM (public.couts_ia c
     LEFT JOIN LATERAL jsonb_array_elements_text(
        CASE
            WHEN (jsonb_typeof(c.etiquettes) = 'array'::text) THEN c.etiquettes
            ELSE '[]'::jsonb
        END) e(etiquette) ON (true))
  GROUP BY (((c.cree_le AT TIME ZONE 'Europe/Paris'::text))::date), COALESCE(e.etiquette,
        CASE
            WHEN (c.etiquettes_lues IS TRUE) THEN '(sans étiquette)'::text
            ELSE '(étiquettes non relevées)'::text
        END),
        CASE
            WHEN (e.etiquette IS NULL) THEN 'aucune'::text
            WHEN (e.etiquette ~ '^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$'::text) THEN 'pour_qui'::text
            WHEN (e.etiquette ~~ 'domaine-%'::text) THEN 'domaine'::text
            ELSE 'autre'::text
        END;
create or replace view public.v_cout_ia_par_facture WITH (security_invoker='true') AS
 SELECT f.id AS facture_id,
    f.numero,
    f.fournisseur,
    f.statut,
    count(c.id) AS nb_appels,
    COALESCE(sum(c.cout_eur), (0)::numeric) AS cout_eur
   FROM (public.factures f
     LEFT JOIN public.couts_ia c ON ((c.cle_fiche = f.email_message_id)))
  GROUP BY f.id, f.numero, f.fournisseur, f.statut;
create or replace view public.v_cout_ia_par_jour WITH (security_invoker='true') AS
 SELECT ((cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    workflow,
    etape,
    count(*) AS nb_appels,
    COALESCE(sum(jetons_entree), (0)::bigint) AS jetons_entree,
    COALESCE(sum(jetons_sortie), (0)::bigint) AS jetons_sortie,
    COALESCE(sum(cout_eur), (0)::numeric) AS cout_eur,
    count(*) FILTER (WHERE (cout_eur IS NULL)) AS appels_sans_cout
   FROM public.couts_ia
  GROUP BY (((cree_le AT TIME ZONE 'Europe/Paris'::text))::date), workflow, etape;
create or replace view public.v_delai_validation WITH (security_invoker='true') AS
 SELECT id,
    fournisseur,
    statut,
    created_at,
    date_decision,
    round((EXTRACT(epoch FROM (date_decision - created_at)) / (3600)::numeric), 1) AS heures_avant_decision
   FROM public.factures
  WHERE (date_decision IS NOT NULL);
create or replace view public.v_depense_article_chantier WITH (security_invoker='true') AS
 SELECT f.chantier_id,
    c.nom AS chantier,
    ar.id AS article_reference_id,
    ar.nom AS article_reference,
        CASE
            WHEN (ar.id IS NULL) THEN af.id
            ELSE NULL::uuid
        END AS article_fournisseur_id,
        CASE
            WHEN (ar.id IS NULL) THEN af.designation
            ELSE NULL::text
        END AS designation_fournisseur,
    count(*) AS nb_lignes,
    sum(
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN ((- l.montant_ht) * COALESCE(NULLIF(sign(f.lignes_somme_ht), (0)::numeric), (1)::numeric))
            ELSE l.montant_ht
        END) AS depense_ht,
    sum(
        CASE
            WHEN (ar.id IS NULL) THEN NULL::numeric
            WHEN (f.type_document = 'avoir'::text) THEN ((- (l.quantite / r.coefficient)) * COALESCE(NULLIF(sign(f.lignes_somme_ht), (0)::numeric), (1)::numeric))
            ELSE (l.quantite / r.coefficient)
        END) AS quantite_unite_reference
   FROM (((((public.lignes_facture l
     JOIN public.factures f ON (((f.id = l.facture_id) AND (f.statut = 'acceptee'::public.statut_facture))))
     LEFT JOIN public.chantiers c ON ((c.id = f.chantier_id)))
     LEFT JOIN public.articles_fournisseur af ON ((af.id = l.article_fournisseur_id)))
     LEFT JOIN public.rapprochements_articles r ON (((r.article_fournisseur_id = af.id) AND (r.valide_le IS NOT NULL))))
     LEFT JOIN public.articles_reference ar ON ((ar.id = r.article_reference_id)))
  GROUP BY f.chantier_id, c.nom, ar.id, ar.nom,
        CASE
            WHEN (ar.id IS NULL) THEN af.id
            ELSE NULL::uuid
        END,
        CASE
            WHEN (ar.id IS NULL) THEN af.designation
            ELSE NULL::text
        END;
create or replace view public.v_factures_detail WITH (security_invoker='true') AS
 SELECT f.id,
    f.created_at,
    f.date_facture,
    f.fournisseur,
    f.numero,
    c.nom AS chantier,
    f.montant_ht,
    f.montant_tva,
    f.montant_ttc,
    f.statut,
    f.motif_refus,
    f.date_decision,
    f.decide_par,
    f.acceptee_malgre_alerte,
    f.motif_acceptation,
    f.type_document,
    f.archivee_le
   FROM (public.factures f
     LEFT JOIN public.chantiers c ON ((c.id = f.chantier_id)));
create or replace view public.v_factures_par_mois WITH (security_invoker='true') AS
 SELECT (date_trunc('month'::text, (COALESCE(date_facture, ((created_at AT TIME ZONE 'Europe/Paris'::text))::date))::timestamp with time zone))::date AS mois,
    statut,
    count(*) AS nb_factures,
    COALESCE(sum(
        CASE
            WHEN (type_document = 'avoir'::text) THEN (- montant_ht)
            ELSE montant_ht
        END), (0)::numeric) AS total_ht,
    COALESCE(sum(
        CASE
            WHEN (type_document = 'avoir'::text) THEN (- montant_ttc)
            ELSE montant_ttc
        END), (0)::numeric) AS total_ttc
   FROM public.factures
  GROUP BY ((date_trunc('month'::text, (COALESCE(date_facture, ((created_at AT TIME ZONE 'Europe/Paris'::text))::date))::timestamp with time zone))::date), statut;
create or replace view public.v_journal_decisions WITH (security_invoker='true') AS
 SELECT j.id,
    j.facture_id,
    f.fournisseur,
    f.numero,
    j.decision,
    j.decide_par,
    j.decide_le,
    j.motif,
    j.acceptee_malgre_alerte,
    jsonb_array_length(COALESCE(j.alertes, '[]'::jsonb)) AS nb_alertes
   FROM (public.journal_decisions j
     LEFT JOIN public.factures f ON ((f.id = j.facture_id)));
create or replace view public.v_n8n_executions_par_jour WITH (security_invoker='true') AS
 SELECT ((cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    workflow_id,
    workflow_nom,
    ( SELECT e.etiquette
           FROM jsonb_array_elements_text(COALESCE(j.etiquettes, '[]'::jsonb)) e(etiquette)
          WHERE (e.etiquette ~ '^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$'::text)
          ORDER BY e.etiquette
         LIMIT 1) AS pour_qui,
    pour_qui_manquant,
    declencheur,
    resultat,
    count(*) AS nb_executions,
    COALESCE(sum(nb_appels_ia), (0)::bigint) AS nb_appels_ia
   FROM public.n8n_executions j
  WHERE (NOT test)
  GROUP BY (((cree_le AT TIME ZONE 'Europe/Paris'::text))::date), workflow_id, workflow_nom, ( SELECT e.etiquette
           FROM jsonb_array_elements_text(COALESCE(j.etiquettes, '[]'::jsonb)) e(etiquette)
          WHERE (e.etiquette ~ '^(interne|produit|perso|client-[a-z0-9][a-z0-9-]*)$'::text)
          ORDER BY e.etiquette
         LIMIT 1), pour_qui_manquant, declencheur, resultat;
create or replace view public.v_td_factures WITH (security_invoker='true') AS
 SELECT f.id AS facture_id,
    COALESCE(NULLIF(btrim(f.fournisseur), ''::text), 'Fournisseur inconnu'::text) AS fournisseur,
    f.numero,
    f.chantier_id,
    COALESCE(c.nom, 'Sans chantier'::text) AS chantier,
    (f.chantier_id IS NULL) AS sans_chantier,
    c.client,
    f.type_document,
    (f.statut)::text AS statut,
        CASE (f.statut)::text
            WHEN 'a_valider'::text THEN 'À valider'::text
            WHEN 'acceptee'::text THEN 'Acceptée'::text
            WHEN 'refusee'::text THEN 'Refusée'::text
            ELSE (f.statut)::text
        END AS statut_fr,
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ht)
            ELSE f.montant_ht
        END AS montant_ht,
        CASE
            WHEN (f.type_document = 'avoir'::text) THEN (- f.montant_ttc)
            ELSE f.montant_ttc
        END AS montant_ttc,
    f.date_facture,
    COALESCE(f.date_facture, ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date) AS date_ref,
    (date_trunc('month'::text, (COALESCE(f.date_facture, ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date))::timestamp with time zone))::date AS mois,
    ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date AS date_arrivee,
    f.created_at,
    f.date_decision,
    f.decide_par,
    f.motif_refus,
        CASE
            WHEN ((f.statut)::text = 'a_valider'::text) THEN 0
            ELSE COALESCE(j.nb_alertes, 0)
        END AS nb_alertes,
    f.acceptee_malgre_alerte,
    f.motif_acceptation,
    f.archivee_le,
    (f.archivee_le IS NOT NULL) AS archivee,
        CASE
            WHEN ((f.statut)::text = 'a_valider'::text) THEN (((now() AT TIME ZONE 'Europe/Paris'::text))::date - ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date)
            ELSE NULL::integer
        END AS jours_attente,
    (COALESCE(f.date_facture, ((f.created_at AT TIME ZONE 'Europe/Paris'::text))::date) > ((now() AT TIME ZONE 'Europe/Paris'::text))::date) AS date_future,
    COALESCE(NULLIF(btrim(fo.nom), ''::text), NULLIF(btrim(fs.nom), ''::text), NULLIF(btrim(f.fournisseur), ''::text), 'Fournisseur inconnu'::text) AS fournisseur_affiche,
    e.siret AS siret_agence
   FROM (((((public.factures f
     LEFT JOIN public.chantiers c ON ((c.id = f.chantier_id)))
     LEFT JOIN public.etablissements_fournisseur e ON ((e.id = f.etablissement_id)))
     LEFT JOIN public.fournisseurs fo ON ((fo.id = COALESCE(e.fournisseur_id, f.fournisseur_id))))
     LEFT JOIN public.fournisseurs fs ON (((fs.siren = f.fournisseur_siren) AND (fo.id IS NULL))))
     LEFT JOIN LATERAL ( SELECT (array_agg(
                CASE
                    WHEN (jsonb_typeof(jd.alertes) = 'array'::text) THEN jsonb_array_length(jd.alertes)
                    ELSE 0
                END ORDER BY jd.decide_le DESC, jd.id DESC))[1] AS nb_alertes
           FROM public.journal_decisions jd
          WHERE ((jd.facture_id = f.id) AND (jd.decision = ANY (ARRAY['accepter'::text, 'refuser'::text])))) j ON (true))
  WHERE ((COALESCE(btrim(f.fournisseur), ''::text) !~~* 'TEST%'::text) AND (COALESCE(btrim(fo.nom), ''::text) !~~* 'TEST%'::text) AND (COALESCE(btrim(fs.nom), ''::text) !~~* 'TEST%'::text));
create or replace view public.v_td_a_valider WITH (security_invoker='true') AS
 SELECT (count(*))::integer AS nb_factures,
    COALESCE(sum(montant_ht), (0)::numeric) AS total_ht,
    COALESCE(max(jours_attente), 0) AS attente_max_jours
   FROM public.v_td_factures
  WHERE (statut = 'a_valider'::text);
create or replace view public.v_td_acceptees_malgre_alerte WITH (security_invoker='true') AS
 SELECT facture_id,
    date_decision,
    fournisseur,
    numero,
    chantier,
    montant_ht,
    motif_acceptation,
    nb_alertes,
    decide_par
   FROM public.v_td_factures
  WHERE (acceptee_malgre_alerte AND (statut = 'acceptee'::text));
create or replace view public.v_td_achats_par_mois WITH (security_invoker='true') AS
 WITH fin AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date AS m_fin
        )
 SELECT (m.m)::date AS mois,
    (((ARRAY['janvier'::text, 'février'::text, 'mars'::text, 'avril'::text, 'mai'::text, 'juin'::text, 'juillet'::text, 'août'::text, 'septembre'::text, 'octobre'::text, 'novembre'::text, 'décembre'::text])[(EXTRACT(month FROM m.m))::integer] || ' '::text) || (EXTRACT(year FROM m.m))::integer) AS mois_libelle,
    COALESCE(sum(f.montant_ht), (0)::numeric) AS total_ht,
    (count(f.facture_id))::integer AS nb_factures
   FROM ((fin
     CROSS JOIN LATERAL generate_series((fin.m_fin - '11 mons'::interval), (fin.m_fin)::timestamp without time zone, '1 mon'::interval) m(m))
     LEFT JOIN public.v_td_factures f ON (((f.mois = (m.m)::date) AND (f.statut = 'acceptee'::text))))
  GROUP BY m.m;
create or replace view public.v_td_attente_anciennete WITH (security_invoker='true') AS
 SELECT t.ordre,
    t.tranche,
    (count(f.facture_id))::integer AS nb_factures,
    COALESCE(sum(f.montant_ht), (0)::numeric) AS montant_ht
   FROM (( VALUES (1,'0 à 2 jours'::text,0,2), (2,'3 à 7 jours'::text,3,7), (3,'8 à 30 jours'::text,8,30), (4,'Plus de 30 jours'::text,31,1000000)) t(ordre, tranche, j_min, j_max)
     LEFT JOIN public.v_td_factures f ON (((f.statut = 'a_valider'::text) AND ((f.jours_attente >= t.j_min) AND (f.jours_attente <= t.j_max)))))
  GROUP BY t.ordre, t.tranche;
create or replace view public.v_td_chantiers WITH (security_invoker='true') AS
 SELECT chantier_id,
    chantier,
    client,
    statut,
    statut_fr,
    archive,
    budget_ht,
    budget_renseigne,
    accepte_ht,
    en_attente_ht,
    reste_ht,
    pct_budget_consomme,
        CASE
            WHEN (NOT budget_renseigne) THEN 'budget_non_renseigne'::text
            WHEN (pct_budget_consomme >= (100)::numeric) THEN 'depasse'::text
            WHEN (pct_budget_consomme >= (90)::numeric) THEN 'a_surveiller'::text
            ELSE 'ok'::text
        END AS niveau
   FROM ( SELECT c.id AS chantier_id,
            c.nom AS chantier,
            c.client,
            (c.statut)::text AS statut,
                CASE (c.statut)::text
                    WHEN 'en_preparation'::text THEN 'En préparation'::text
                    WHEN 'en_cours'::text THEN 'En cours'::text
                    WHEN 'termine'::text THEN 'Terminé'::text
                    WHEN 'suspendu'::text THEN 'Suspendu'::text
                    ELSE (c.statut)::text
                END AS statut_fr,
            c.archive,
            c.budget_ht,
            (COALESCE(c.budget_ht, (0)::numeric) > (0)::numeric) AS budget_renseigne,
            COALESCE(sum(f.montant_ht) FILTER (WHERE (f.statut = 'acceptee'::text)), (0)::numeric) AS accepte_ht,
            COALESCE(sum(f.montant_ht) FILTER (WHERE (f.statut = 'a_valider'::text)), (0)::numeric) AS en_attente_ht,
                CASE
                    WHEN (COALESCE(c.budget_ht, (0)::numeric) > (0)::numeric) THEN (c.budget_ht - COALESCE(sum(f.montant_ht) FILTER (WHERE (f.statut = 'acceptee'::text)), (0)::numeric))
                    ELSE NULL::numeric
                END AS reste_ht,
                CASE
                    WHEN (COALESCE(c.budget_ht, (0)::numeric) > (0)::numeric) THEN round((((100)::numeric * COALESCE(sum(f.montant_ht) FILTER (WHERE (f.statut = 'acceptee'::text)), (0)::numeric)) / c.budget_ht), 1)
                    ELSE NULL::numeric
                END AS pct_budget_consomme
           FROM (public.chantiers c
             LEFT JOIN public.v_td_factures f ON ((f.chantier_id = c.id)))
          GROUP BY c.id) x;
create or replace view public.v_td_chantiers_a_surveiller WITH (security_invoker='true') AS
 SELECT (count(*))::integer AS nb_chantiers,
    COALESCE(string_agg(chantier, ', '::text ORDER BY pct_budget_consomme DESC, chantier), ''::text) AS noms
   FROM public.v_td_chantiers
  WHERE ((statut = 'en_cours'::text) AND (pct_budget_consomme >= (90)::numeric));
create or replace view public.v_td_chantiers_en_cours WITH (security_invoker='true') AS
 SELECT chantier_id,
    chantier,
    client,
    statut,
    budget_ht,
    budget_renseigne,
    accepte_ht,
    en_attente_ht,
    reste_ht,
    pct_budget_consomme,
    niveau
   FROM public.v_td_chantiers
  WHERE (statut = 'en_cours'::text);
create or replace view public.v_td_dates_anormales WITH (security_invoker='true') AS
 SELECT facture_id,
    fournisseur,
    numero,
    statut_fr,
    date_facture,
    date_arrivee,
    (date_facture - ((now() AT TIME ZONE 'Europe/Paris'::text))::date) AS jours_dans_le_futur
   FROM public.v_td_factures
  WHERE (date_future AND (date_facture IS NOT NULL));
create or replace view public.v_td_decisions_par_mois WITH (security_invoker='true') AS
 WITH fin AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date AS m_fin
        ), d AS (
         SELECT (date_trunc('month'::text, (jd.decide_le AT TIME ZONE 'Europe/Paris'::text)))::date AS mois,
            (
                CASE
                    WHEN (jsonb_typeof(jd.alertes) = 'array'::text) THEN jsonb_array_length(jd.alertes)
                    ELSE 0
                END > 0) AS avec_alerte
           FROM (public.journal_decisions jd
             JOIN public.v_td_factures f ON ((f.facture_id = jd.facture_id)))
          WHERE (jd.decision = ANY (ARRAY['accepter'::text, 'refuser'::text]))
        )
 SELECT (m.m)::date AS mois,
    (count(d.mois) FILTER (WHERE d.avec_alerte))::integer AS avec_alerte,
    (count(d.mois) FILTER (WHERE (NOT d.avec_alerte)))::integer AS sans_alerte,
    (count(d.mois))::integer AS total
   FROM ((fin
     CROSS JOIN LATERAL generate_series((fin.m_fin - '11 mons'::interval), (fin.m_fin)::timestamp without time zone, '1 mon'::interval) m(m))
     LEFT JOIN d ON ((d.mois = (m.m)::date)))
  GROUP BY m.m;
create or replace view public.v_td_delai_decision WITH (security_invoker='true') AS
 SELECT round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY (((EXTRACT(epoch FROM (date_decision - created_at)) / 86400.0))::double precision)))::numeric, 1) AS delai_median_jours,
    (count(*))::integer AS nb_decisions,
    90 AS periode_jours
   FROM public.v_td_factures
  WHERE ((statut <> 'a_valider'::text) AND (date_decision IS NOT NULL) AND (date_decision >= (now() - '90 days'::interval)));
create or replace view public.v_td_depenses_mois_chantier WITH (security_invoker='true') AS
 SELECT mois,
    chantier_id,
    chantier,
    COALESCE(sum(montant_ht), (0)::numeric) AS total_ht,
    (count(*))::integer AS nb_factures
   FROM public.v_td_factures
  WHERE ((statut = 'acceptee'::text) AND (mois <= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date))
  GROUP BY mois, chantier_id, chantier;
create or replace view public.v_td_etq_arbre WITH (security_invoker='true') AS
 SELECT 'appel'::text AS source,
    ((c.cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    (date_trunc('month'::text, (c.cree_le AT TIME ZONE 'Europe/Paris'::text)))::date AS mois,
        CASE
            WHEN (c.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(c.etiquettes, 'qui'::text), '(sans « à qui »)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS a_qui,
        CASE
            WHEN (c.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(c.etiquettes, 'ou'::text), '(sans « où »)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS ou,
        CASE
            WHEN (c.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(c.etiquettes, 'module'::text), '(sans module)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS module,
    COALESCE(NULLIF(btrim(c.workflow_nom), ''::text), NULLIF(btrim(c.workflow), ''::text), '(workflow inconnu)'::text) AS workflow,
    COALESCE(c.cout_eur, (0)::numeric) AS cout_eur,
    1 AS nb_appels,
    0 AS nb_executions,
        CASE
            WHEN (c.cout_eur IS NULL) THEN 1
            ELSE 0
        END AS appels_sans_cout
   FROM public.couts_ia c
UNION ALL
 SELECT 'execution'::text AS source,
    ((j.cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    (date_trunc('month'::text, (j.cree_le AT TIME ZONE 'Europe/Paris'::text)))::date AS mois,
        CASE
            WHEN (j.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(j.etiquettes, 'qui'::text), '(sans « à qui »)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS a_qui,
        CASE
            WHEN (j.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(j.etiquettes, 'ou'::text), '(sans « où »)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS ou,
        CASE
            WHEN (j.etiquettes_lues IS TRUE) THEN COALESCE(public.niveau_etiquette(j.etiquettes, 'module'::text), '(sans module)'::text)
            ELSE '(étiquettes non relevées)'::text
        END AS module,
    COALESCE(NULLIF(btrim(j.workflow_nom), ''::text), '(workflow inconnu)'::text) AS workflow,
    (0)::numeric AS cout_eur,
    0 AS nb_appels,
    1 AS nb_executions,
    0 AS appels_sans_cout
   FROM public.n8n_executions j
  WHERE (NOT j.test);
create or replace view public.v_td_etq_filtre_module WITH (security_invoker='true') AS
 SELECT DISTINCT module
   FROM public.v_td_etq_arbre a;
create or replace view public.v_td_etq_filtre_ou WITH (security_invoker='true') AS
 SELECT DISTINCT ou
   FROM public.v_td_etq_arbre a;
create or replace view public.v_td_etq_filtre_qui WITH (security_invoker='true') AS
 SELECT DISTINCT a_qui
   FROM public.v_td_etq_arbre a;
create or replace view public.v_td_factures_par_mois_statut WITH (security_invoker='true') AS
 SELECT mois,
    statut,
    statut_fr,
    (count(*))::integer AS nb_factures,
    COALESCE(sum(montant_ht), (0)::numeric) AS total_ht
   FROM public.v_td_factures
  WHERE (mois <= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date)
  GROUP BY mois, statut, statut_fr;
create or replace view public.v_td_filtre_chantiers WITH (security_invoker='true') AS
 SELECT chantiers.nom AS chantier
   FROM public.chantiers
UNION
 SELECT 'Sans chantier'::text AS chantier;
create or replace view public.v_td_filtre_clients WITH (security_invoker='true') AS
 SELECT DISTINCT client
   FROM public.chantiers
  WHERE ((client IS NOT NULL) AND (btrim(client) <> ''::text));
create or replace view public.v_td_filtre_decideurs WITH (security_invoker='true') AS
 SELECT DISTINCT decide_par
   FROM public.v_td_factures
  WHERE (decide_par IS NOT NULL);
create or replace view public.v_td_filtre_fournisseurs WITH (security_invoker='true') AS
 SELECT DISTINCT fournisseur_affiche AS fournisseur
   FROM public.v_td_factures;
create or replace view public.v_td_fournisseurs_agences WITH (security_invoker='true') AS
 SELECT e.id AS etablissement_id,
    e.fournisseur_id,
    e.nom_agence,
    e.ville,
    e.siret
   FROM (public.etablissements_fournisseur e
     JOIN public.fournisseurs fo ON ((fo.id = e.fournisseur_id)))
  WHERE ((e.fusionne_dans IS NULL) AND (btrim(fo.nom) !~~* 'TEST%'::text));
create or replace view public.v_td_fournisseurs_classement WITH (security_invoker='true') AS
 WITH t AS (
         SELECT v_td_factures.fournisseur_affiche AS fournisseur,
            sum(v_td_factures.montant_ht) AS total_accepte_ht
           FROM public.v_td_factures
          WHERE (v_td_factures.statut = 'acceptee'::text)
          GROUP BY v_td_factures.fournisseur_affiche
         HAVING (sum(v_td_factures.montant_ht) > (0)::numeric)
        )
 SELECT (row_number() OVER (ORDER BY total_accepte_ht DESC, fournisseur))::integer AS rang,
    fournisseur,
    total_accepte_ht,
    round(((100.0 * total_accepte_ht) / sum(total_accepte_ht) OVER ()), 1) AS part_pct
   FROM t;
create or replace view public.v_td_fournisseurs_detail WITH (security_invoker='true') AS
 SELECT fournisseur_affiche AS fournisseur,
    (count(*))::integer AS nb_factures,
    (count(*) FILTER (WHERE (statut = 'acceptee'::text)))::integer AS nb_acceptees,
    (count(*) FILTER (WHERE (statut = 'refusee'::text)))::integer AS nb_refusees,
    COALESCE(sum(montant_ht) FILTER (WHERE (statut = 'acceptee'::text)), (0)::numeric) AS total_accepte_ht,
    round(((100.0 * (count(*) FILTER (WHERE (statut = 'refusee'::text)))::numeric) / (NULLIF(count(*) FILTER (WHERE (statut = ANY (ARRAY['acceptee'::text, 'refusee'::text]))), 0))::numeric), 1) AS taux_refus_pct
   FROM public.v_td_factures
  GROUP BY fournisseur_affiche;
create or replace view public.v_td_fournisseurs_factures WITH (security_invoker='true') AS
 SELECT vf.facture_id,
    vf.numero,
    vf.date_ref,
    COALESCE(fo.id, fs.id) AS fournisseur_id,
    vf.fournisseur_affiche AS fournisseur,
    COALESCE(fo.siren, fs.siren, f.fournisseur_siren) AS siren,
    e.id AS etablissement_id,
    vf.chantier_id,
    vf.chantier,
    vf.type_document,
    vf.montant_ht,
    (( SELECT count(*) AS count
           FROM public.lignes_facture l
          WHERE ((l.facture_id = f.id) AND (l.quantite > (0)::numeric) AND (l.montant_ht > (0)::numeric) AND (vf.type_document IS DISTINCT FROM 'avoir'::text))))::integer AS nb_lignes
   FROM (((((public.v_td_factures vf
     JOIN public.factures f ON ((f.id = vf.facture_id)))
     LEFT JOIN public.etablissements_fournisseur e0 ON ((e0.id = f.etablissement_id)))
     LEFT JOIN public.etablissements_fournisseur e ON ((e.id = COALESCE(e0.fusionne_dans, e0.id))))
     LEFT JOIN public.fournisseurs fo ON ((fo.id = COALESCE(e0.fournisseur_id, f.fournisseur_id))))
     LEFT JOIN public.fournisseurs fs ON (((fs.siren = f.fournisseur_siren) AND (fo.id IS NULL))))
  WHERE (vf.statut = 'acceptee'::text);
create or replace view public.v_td_fournisseurs_fiches WITH (security_invoker='true') AS
 SELECT id AS fournisseur_id,
    btrim(nom) AS fournisseur,
    siren,
    (( SELECT count(*) AS count
           FROM public.etablissements_fournisseur e
          WHERE ((e.fournisseur_id = fo.id) AND (e.fusionne_dans IS NULL))))::integer AS nb_agences
   FROM public.fournisseurs fo
  WHERE (btrim(nom) !~~* 'TEST%'::text);
create or replace view public.v_td_fournisseurs_top3 WITH (security_invoker='true') AS
 SELECT round(((100.0 * sum(total_accepte_ht) FILTER (WHERE (rang <= 3))) / NULLIF(sum(total_accepte_ht), (0)::numeric)), 1) AS part_top3_pct,
    (count(*))::integer AS nb_fournisseurs,
    COALESCE(sum(total_accepte_ht), (0)::numeric) AS total_accepte_ht
   FROM public.v_td_fournisseurs_classement;
create or replace view public.v_td_ia_appels WITH (security_invoker='true') AS
 SELECT c.id AS appel_id,
    c.cree_le,
    ((c.cree_le AT TIME ZONE 'Europe/Paris'::text))::date AS jour,
    (date_trunc('month'::text, (c.cree_le AT TIME ZONE 'Europe/Paris'::text)))::date AS mois,
    c.workflow,
    c.etape,
    COALESCE(NULLIF(btrim(c.modele), ''::text), 'Modèle inconnu'::text) AS modele,
    COALESCE(NULLIF(btrim(c.hebergeur), ''::text), 'Hébergeur inconnu'::text) AS hebergeur,
    COALESCE(c.declencheur, 'inconnu'::text) AS declencheur,
        CASE COALESCE(c.declencheur, 'inconnu'::text)
            WHEN 'courriel'::text THEN 'Courriel'::text
            WHEN 'webhook'::text THEN 'Webhook'::text
            WHEN 'manuel'::text THEN 'Manuel'::text
            WHEN 'planifie'::text THEN 'Planifié'::text
            ELSE 'Non renseigné'::text
        END AS declencheur_fr,
    c.jetons_entree,
    c.jetons_sortie,
    (COALESCE(c.jetons_entree, 0) + COALESCE(c.jetons_sortie, 0)) AS jetons,
    c.cout_eur,
    f.id AS facture_id,
    (f.id IS NOT NULL) AS avec_facture,
        CASE
            WHEN (f.id IS NOT NULL) THEN COALESCE(NULLIF(btrim(f.fournisseur), ''::text), 'Fournisseur inconnu'::text)
            ELSE NULL::text
        END AS fournisseur,
    f.numero,
    (f.statut)::text AS statut,
    ((f.id IS NOT NULL) AND (COALESCE(btrim(f.fournisseur), ''::text) ~~* 'TEST%'::text)) AS est_test
   FROM (public.couts_ia c
     LEFT JOIN public.factures f ON ((f.email_message_id = c.cle_fiche)));
create or replace view public.v_td_ia_ce_mois WITH (security_invoker='true') AS
 WITH m AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date AS mois
        ), cur AS (
         SELECT (count(*))::integer AS nb_appels,
            COALESCE(sum(a.cout_eur), (0)::numeric) AS cout,
            (count(a.cout_eur))::integer AS nb_avec_cout,
            (count(DISTINCT a.facture_id) FILTER (WHERE (a.avec_facture AND (NOT a.est_test))))::integer AS nb_factures,
            (count(DISTINCT a.facture_id) FILTER (WHERE (a.avec_facture AND (NOT a.est_test) AND (a.cout_eur IS NOT NULL))))::integer AS nb_factures_avec_cout,
            (count(*) FILTER (WHERE (a.cout_eur IS NULL)))::integer AS nb_sans_cout,
            COALESCE(sum(a.cout_eur) FILTER (WHERE (a.avec_facture AND (NOT a.est_test))), (0)::numeric) AS cout_factures
           FROM public.v_td_ia_appels a,
            m m_1
          WHERE (a.mois = m_1.mois)
        ), prec AS (
         SELECT COALESCE(sum(a.cout_eur), (0)::numeric) AS cout
           FROM public.v_td_ia_appels a,
            m m_1
          WHERE (a.mois = ((m_1.mois - '1 mon'::interval))::date)
        )
 SELECT m.mois,
    (((ARRAY['janvier'::text, 'février'::text, 'mars'::text, 'avril'::text, 'mai'::text, 'juin'::text, 'juillet'::text, 'août'::text, 'septembre'::text, 'octobre'::text, 'novembre'::text, 'décembre'::text])[(EXTRACT(month FROM m.mois))::integer] || ' '::text) || (EXTRACT(year FROM m.mois))::integer) AS mois_libelle,
    cur.cout AS cout_eur,
    prec.cout AS cout_mois_precedent_eur,
    cur.nb_appels,
    cur.nb_factures,
    cur.nb_sans_cout AS appels_sans_cout,
        CASE
            WHEN (cur.nb_factures_avec_cout > 0) THEN round((cur.cout_factures / (cur.nb_factures_avec_cout)::numeric), 8)
            ELSE NULL::numeric
        END AS cout_moyen_par_facture_eur,
        CASE
            WHEN (cur.nb_avec_cout > 0) THEN round((cur.cout / (cur.nb_avec_cout)::numeric), 8)
            ELSE NULL::numeric
        END AS cout_moyen_par_appel_eur
   FROM m,
    cur,
    prec;
create or replace view public.v_td_ia_par_declencheur WITH (security_invoker='true') AS
 SELECT declencheur,
    declencheur_fr,
    nb_appels,
    jetons,
    cout_eur,
        CASE
            WHEN (part_pct IS NOT NULL) THEN (part_pct +
            CASE
                WHEN (rang = 1) THEN (100.0 - sum(part_pct) OVER ())
                ELSE (0)::numeric
            END)
            ELSE NULL::numeric
        END AS part_pct,
    appels_sans_cout,
    rang
   FROM ( SELECT a.declencheur,
            a.declencheur_fr,
            (count(*))::integer AS nb_appels,
            COALESCE(sum(a.jetons), (0)::bigint) AS jetons,
            COALESCE(sum(a.cout_eur), (0)::numeric) AS cout_eur,
                CASE
                    WHEN (sum(sum(a.cout_eur)) OVER () > (0)::numeric) THEN round((((100)::numeric * COALESCE(sum(a.cout_eur), (0)::numeric)) / sum(sum(a.cout_eur)) OVER ()), 1)
                    ELSE NULL::numeric
                END AS part_pct,
            (count(*) FILTER (WHERE (a.cout_eur IS NULL)))::integer AS appels_sans_cout,
            (row_number() OVER (ORDER BY COALESCE(sum(a.cout_eur), (0)::numeric) DESC, a.declencheur))::integer AS rang
           FROM public.v_td_ia_appels a
          GROUP BY a.declencheur, a.declencheur_fr) x;
create or replace view public.v_td_ia_par_facture WITH (security_invoker='true') AS
 SELECT facture_id,
    COALESCE(fournisseur, 'Hors facture'::text) AS fournisseur,
    numero,
    statut,
        CASE statut
            WHEN 'a_valider'::text THEN 'À valider'::text
            WHEN 'acceptee'::text THEN 'Acceptée'::text
            WHEN 'refusee'::text THEN 'Refusée'::text
            ELSE statut
        END AS statut_fr,
    (facture_id IS NULL) AS hors_facture,
    (count(*))::integer AS nb_appels,
    COALESCE(sum(jetons_entree), (0)::bigint) AS jetons_entree,
    COALESCE(sum(jetons_sortie), (0)::bigint) AS jetons_sortie,
    COALESCE(sum(jetons), (0)::bigint) AS jetons,
    COALESCE(sum(cout_eur), (0)::numeric) AS cout_eur,
    (count(*) FILTER (WHERE (cout_eur IS NULL)))::integer AS appels_sans_cout,
    (row_number() OVER (ORDER BY COALESCE(sum(cout_eur), (0)::numeric) DESC, COALESCE(fournisseur, 'Hors facture'::text), numero, facture_id))::integer AS rang
   FROM public.v_td_ia_appels a
  WHERE (NOT est_test)
  GROUP BY facture_id, fournisseur, numero, statut;
create or replace view public.v_td_ia_par_jour WITH (security_invoker='true') AS
 SELECT jour,
    (count(*))::integer AS nb_appels,
    COALESCE(sum(jetons_entree), (0)::bigint) AS jetons_entree,
    COALESCE(sum(jetons_sortie), (0)::bigint) AS jetons_sortie,
    COALESCE(sum(jetons), (0)::bigint) AS jetons,
    COALESCE(sum(cout_eur), (0)::numeric) AS cout_eur,
    (count(*) FILTER (WHERE (cout_eur IS NULL)))::integer AS appels_sans_cout
   FROM public.v_td_ia_appels a
  GROUP BY jour;
create or replace view public.v_td_ia_par_modele WITH (security_invoker='true') AS
 SELECT modele,
    hebergeur,
    (count(*))::integer AS nb_appels,
    COALESCE(sum(jetons), (0)::bigint) AS jetons,
    COALESCE(sum(cout_eur), (0)::numeric) AS cout_eur,
        CASE
            WHEN (COALESCE(sum(jetons) FILTER (WHERE (cout_eur IS NOT NULL)), (0)::bigint) > 0) THEN round((((1000)::numeric * sum(cout_eur)) / (sum(jetons) FILTER (WHERE (cout_eur IS NOT NULL)))::numeric), 8)
            ELSE NULL::numeric
        END AS cout_moyen_1000_jetons_eur,
    (count(*) FILTER (WHERE (cout_eur IS NULL)))::integer AS appels_sans_cout,
    (row_number() OVER (ORDER BY COALESCE(sum(cout_eur), (0)::numeric) DESC, modele, hebergeur))::integer AS rang
   FROM public.v_td_ia_appels a
  GROUP BY modele, hebergeur;
create or replace view public.v_td_ia_par_mois WITH (security_invoker='true') AS
 WITH fin AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date AS m_fin
        )
 SELECT (m.m)::date AS mois,
    (((ARRAY['janvier'::text, 'février'::text, 'mars'::text, 'avril'::text, 'mai'::text, 'juin'::text, 'juillet'::text, 'août'::text, 'septembre'::text, 'octobre'::text, 'novembre'::text, 'décembre'::text])[(EXTRACT(month FROM m.m))::integer] || ' '::text) || (EXTRACT(year FROM m.m))::integer) AS mois_libelle,
    (count(a.appel_id))::integer AS nb_appels,
    COALESCE(sum(a.jetons), (0)::bigint) AS jetons,
    COALESCE(sum(a.cout_eur), (0)::numeric) AS cout_eur,
    (count(*) FILTER (WHERE ((a.appel_id IS NOT NULL) AND (a.cout_eur IS NULL))))::integer AS appels_sans_cout
   FROM ((fin
     CROSS JOIN LATERAL generate_series((fin.m_fin - '11 mons'::interval), (fin.m_fin)::timestamp without time zone, '1 mon'::interval) m(m))
     LEFT JOIN public.v_td_ia_appels a ON ((a.mois = (m.m)::date)))
  GROUP BY m.m;
create or replace view public.v_td_ia_par_workflow_etape WITH (security_invoker='true') AS
 SELECT workflow,
    etape,
    nb_appels,
    jetons,
    cout_eur,
        CASE
            WHEN (part_pct IS NOT NULL) THEN (part_pct +
            CASE
                WHEN (rang = 1) THEN (100.0 - sum(part_pct) OVER ())
                ELSE (0)::numeric
            END)
            ELSE NULL::numeric
        END AS part_pct,
    appels_sans_cout,
    rang
   FROM ( SELECT a.workflow,
            a.etape,
            (count(*))::integer AS nb_appels,
            COALESCE(sum(a.jetons), (0)::bigint) AS jetons,
            COALESCE(sum(a.cout_eur), (0)::numeric) AS cout_eur,
                CASE
                    WHEN (sum(sum(a.cout_eur)) OVER () > (0)::numeric) THEN round((((100)::numeric * COALESCE(sum(a.cout_eur), (0)::numeric)) / sum(sum(a.cout_eur)) OVER ()), 1)
                    ELSE NULL::numeric
                END AS part_pct,
            (count(*) FILTER (WHERE (a.cout_eur IS NULL)))::integer AS appels_sans_cout,
            (row_number() OVER (ORDER BY COALESCE(sum(a.cout_eur), (0)::numeric) DESC, a.workflow, a.etape))::integer AS rang
           FROM public.v_td_ia_appels a
          GROUP BY a.workflow, a.etape) x;
create or replace view public.v_td_ia_sans_cout WITH (security_invoker='true') AS
 SELECT appel_id,
    cree_le,
    jour,
    workflow,
    etape,
    modele,
    hebergeur,
    declencheur_fr,
    jetons_entree,
    jetons_sortie,
    jetons,
    facture_id,
    fournisseur,
    numero
   FROM public.v_td_ia_appels a
  WHERE (cout_eur IS NULL);
create or replace view public.v_td_ia_taux WITH (security_invoker='true') AS
 SELECT t.taux_de_change,
    t.date_taux,
    t.utilise_le
   FROM (( SELECT 1 AS "?column?") u
     LEFT JOIN LATERAL ( SELECT c.taux_usd_eur AS taux_de_change,
            c.date_taux,
            c.cree_le AS utilise_le
           FROM public.couts_ia c
          WHERE (c.taux_usd_eur IS NOT NULL)
          ORDER BY c.cree_le DESC, c.id DESC
         LIMIT 1) t ON (true));
create or replace view public.v_td_ia_top_factures WITH (security_invoker='true') AS
 SELECT rang,
    facture_id,
    fournisseur,
    numero,
    statut,
    statut_fr,
    nb_appels,
    jetons,
    cout_eur
   FROM ( SELECT (row_number() OVER (ORDER BY p.cout_eur DESC, p.fournisseur, p.numero, p.facture_id))::integer AS rang,
            p.facture_id,
            p.fournisseur,
            p.numero,
            p.statut,
            p.statut_fr,
            p.nb_appels,
            p.jetons,
            p.cout_eur
           FROM public.v_td_ia_par_facture p
          WHERE (NOT p.hors_facture)) x
  WHERE (rang <= 20);
create or replace view public.v_td_journal_decisions WITH (security_invoker='true') AS
 SELECT jd.id AS journal_id,
    jd.facture_id,
    jd.decide_le,
    f.fournisseur,
    f.numero,
    jd.decision,
        CASE jd.decision
            WHEN 'accepter'::text THEN 'Acceptée'::text
            WHEN 'refuser'::text THEN 'Refusée'::text
            WHEN 'rouverte'::text THEN 'Rouverte'::text
            ELSE jd.decision
        END AS decision_fr,
        CASE
            WHEN (jsonb_typeof(jd.alertes) = 'array'::text) THEN jsonb_array_length(jd.alertes)
            ELSE 0
        END AS nb_alertes,
    jd.acceptee_malgre_alerte,
    jd.motif,
    jd.decide_par
   FROM (public.journal_decisions jd
     JOIN public.v_td_factures f ON ((f.facture_id = jd.facture_id)));
create or replace view public.v_td_malgre_alerte WITH (security_invoker='true') AS
 SELECT (count(*) FILTER (WHERE (((date_decision AT TIME ZONE 'Europe/Paris'::text))::date >= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date)))::integer AS nb_ce_mois,
    (count(*) FILTER (WHERE (date_decision >= (now() - '30 days'::interval))))::integer AS nb_30_jours,
    (count(*))::integer AS nb_total
   FROM public.v_td_factures
  WHERE (acceptee_malgre_alerte AND (statut = 'acceptee'::text));
create or replace view public.v_td_pareto_chantiers WITH (security_invoker='true') AS
 WITH t AS (
         SELECT v_td_factures.chantier_id,
            v_td_factures.chantier AS nom,
            sum(v_td_factures.montant_ht) AS m
           FROM public.v_td_factures
          WHERE (v_td_factures.statut = 'acceptee'::text)
          GROUP BY v_td_factures.chantier_id, v_td_factures.chantier
         HAVING (sum(v_td_factures.montant_ht) > (0)::numeric)
        ), r AS (
         SELECT t.chantier_id,
            t.nom,
            t.m,
            (row_number() OVER (ORDER BY t.m DESC, t.nom, t.chantier_id))::integer AS rang,
            (sum(t.m) OVER (ORDER BY t.m DESC, t.nom, t.chantier_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / sum(t.m) OVER ()) AS cum,
            (t.m / sum(t.m) OVER ()) AS part
           FROM t
        )
 SELECT rang,
    nom,
    m AS montant_ht,
    round(((100)::numeric * part), 1) AS part_pct,
    round(((100)::numeric * cum), 1) AS cumul_pct,
    (COALESCE(lag(cum) OVER (ORDER BY rang), (0)::numeric) < (0.8 - 0.0000001)) AS dans_80_pct,
    chantier_id
   FROM r;
create or replace view public.v_td_pareto_fournisseurs WITH (security_invoker='true') AS
 WITH t AS (
         SELECT v_td_factures.fournisseur_affiche AS nom,
            sum(v_td_factures.montant_ht) AS m
           FROM public.v_td_factures
          WHERE (v_td_factures.statut = 'acceptee'::text)
          GROUP BY v_td_factures.fournisseur_affiche
         HAVING (sum(v_td_factures.montant_ht) > (0)::numeric)
        ), r AS (
         SELECT t.nom,
            t.m,
            (row_number() OVER (ORDER BY t.m DESC, t.nom))::integer AS rang,
            (sum(t.m) OVER (ORDER BY t.m DESC, t.nom ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / sum(t.m) OVER ()) AS cum,
            (t.m / sum(t.m) OVER ()) AS part
           FROM t
        )
 SELECT rang,
    nom,
    m AS montant_ht,
    round(((100)::numeric * part), 1) AS part_pct,
    round(((100)::numeric * cum), 1) AS cumul_pct,
    (COALESCE(lag(cum) OVER (ORDER BY rang), (0)::numeric) < (0.8 - 0.0000001)) AS dans_80_pct
   FROM r;
create or replace view public.v_td_pareto_resume WITH (security_invoker='true') AS
 WITH s AS (
         SELECT 'fournisseurs'::text AS axe,
            (count(*) FILTER (WHERE v_td_pareto_fournisseurs.dans_80_pct))::integer AS k,
            (count(*))::integer AS n
           FROM public.v_td_pareto_fournisseurs
        UNION ALL
         SELECT 'chantiers'::text AS text,
            (count(*) FILTER (WHERE v_td_pareto_chantiers.dans_80_pct))::integer AS count,
            (count(*))::integer AS count
           FROM public.v_td_pareto_chantiers
        )
 SELECT axe,
    k,
    n,
        CASE
            WHEN (n > 0) THEN (round(((100.0 * (k)::numeric) / (n)::numeric)))::integer
            ELSE NULL::integer
        END AS pct,
        CASE
            WHEN (n = 0) THEN 'Aucune facture acceptée pour le moment : rien à analyser.'::text
            ELSE (((((((k || ' '::text) ||
            CASE
                WHEN (axe = 'fournisseurs'::text) THEN
                CASE
                    WHEN (k = 1) THEN 'fournisseur'::text
                    ELSE 'fournisseurs'::text
                END
                ELSE
                CASE
                    WHEN (k = 1) THEN 'chantier'::text
                    ELSE 'chantiers'::text
                END
            END) || ' sur '::text) || n) || ' ('::text) || (round(((100.0 * (k)::numeric) / (n)::numeric)))::integer) || ' %) font 80 % des achats acceptés.'::text)
        END AS phrase
   FROM s;
create or replace view public.v_td_plafonds_cles WITH (security_invoker='true') AS
 WITH dernier AS (
         SELECT DISTINCT ON (r.cle_nom) r.id,
            r.cree_le,
            r.releve_le,
            r.jour_utc,
            r.cle_nom,
            r.limite_fournisseur,
            r.devise_fournisseur,
            r.remise_limite,
            r.depense_jour_eur,
            r.depense_semaine_eur,
            r.depense_mois_eur,
            r.depense_totale_eur,
            r.desactivee,
            r.taux_usd_eur,
            r.date_taux,
            r.test
           FROM public.openrouter_cles_releves r
          WHERE ((NOT r.test) AND (r.releve_le = ( SELECT max(x.releve_le) AS max
                   FROM public.openrouter_cles_releves x
                  WHERE (NOT x.test))))
          ORDER BY r.cle_nom, r.cree_le DESC
        ), calc AS (
         SELECT d.cle_nom,
            d.desactivee,
            d.releve_le,
            d.date_taux,
            d.limite_fournisseur,
            d.devise_fournisseur,
            d.remise_limite,
            d.depense_mois_eur,
                CASE d.remise_limite
                    WHEN 'daily'::text THEN d.depense_jour_eur
                    WHEN 'weekly'::text THEN d.depense_semaine_eur
                    WHEN 'monthly'::text THEN d.depense_mois_eur
                    ELSE d.depense_totale_eur
                END AS depense_periode_eur,
                CASE
                    WHEN ((d.limite_fournisseur IS NOT NULL) AND (d.taux_usd_eur IS NOT NULL)) THEN round((d.limite_fournisseur * d.taux_usd_eur), 4)
                    ELSE NULL::numeric
                END AS plafond_eur
           FROM dernier d
        ), part AS (
         SELECT c.cle_nom,
            c.desactivee,
            c.releve_le,
            c.date_taux,
            c.limite_fournisseur,
            c.devise_fournisseur,
            c.remise_limite,
            c.depense_mois_eur,
            c.depense_periode_eur,
            c.plafond_eur,
                CASE
                    WHEN ((c.plafond_eur > (0)::numeric) AND (c.depense_periode_eur IS NOT NULL)) THEN round((((100)::numeric * c.depense_periode_eur) / c.plafond_eur), 1)
                    ELSE NULL::numeric
                END AS part_pct
           FROM calc c
        )
 SELECT cle_nom,
    desactivee,
        CASE remise_limite
            WHEN 'daily'::text THEN 'par jour'::text
            WHEN 'weekly'::text THEN 'par semaine'::text
            WHEN 'monthly'::text THEN 'par mois'::text
            ELSE 'sans remise à zéro'::text
        END AS remise,
    plafond_eur,
    limite_fournisseur AS plafond_monnaie_fournisseur,
    devise_fournisseur,
    depense_periode_eur,
    depense_mois_eur,
        CASE
            WHEN ((plafond_eur IS NOT NULL) AND (depense_periode_eur IS NOT NULL)) THEN GREATEST((plafond_eur - depense_periode_eur), (0)::numeric)
            ELSE NULL::numeric
        END AS reste_eur,
    part_pct,
        CASE
            WHEN (limite_fournisseur IS NULL) THEN 'sans plafond'::text
            WHEN (limite_fournisseur = (0)::numeric) THEN 'plafond atteint'::text
            WHEN (part_pct IS NULL) THEN 'non calculable'::text
            WHEN (part_pct >= (100)::numeric) THEN 'plafond atteint'::text
            WHEN (part_pct >= (80)::numeric) THEN 'à surveiller'::text
            ELSE 'normal'::text
        END AS etat,
        CASE
            WHEN (part_pct < (80)::numeric) THEN part_pct
            ELSE NULL::numeric
        END AS part_normal,
        CASE
            WHEN ((part_pct >= (80)::numeric) AND (part_pct < (100)::numeric)) THEN part_pct
            ELSE NULL::numeric
        END AS part_attention,
        CASE
            WHEN (part_pct >= (100)::numeric) THEN part_pct
            ELSE NULL::numeric
        END AS part_atteint,
    COALESCE(part_pct, ('-1'::integer)::numeric) AS part_tri,
    releve_le,
    (floor((EXTRACT(epoch FROM (now() - releve_le)) / (3600)::numeric)))::integer AS heures_depuis_releve,
    date_taux
   FROM part p;
create or replace view public.v_td_prix_ponts WITH (security_invoker='true') AS
 WITH cibles AS (
         SELECT a.fournisseur_id,
            a.designation_normalisee,
            a.unite_normalisee,
            (array_agg(a.id))[1] AS cible_id
           FROM public.articles_fournisseur a
          WHERE (a.reference_normalisee IS NOT NULL)
          GROUP BY a.fournisseur_id, a.designation_normalisee, a.unite_normalisee
         HAVING (count(*) = 1)
        )
 SELECT s.id AS article_source_id,
    c.id AS article_cible_id,
    s.fournisseur_id,
    fo.nom AS fournisseur,
    s.designation,
    s.unite,
    s.unite_normalisee,
    c.reference AS reference_cible,
    'Même fournisseur, même désignation, même unité : article sans référence relié au seul article avec référence'::text AS motif,
    'automatique'::text AS origine,
    (rc.article_fournisseur_id IS NOT NULL) AS cible_rapprochee,
    (rs.article_fournisseur_id IS NOT NULL) AS source_rapprochee,
    ((rc.article_fournisseur_id IS NOT NULL) AND (rs.article_fournisseur_id IS NULL)) AS applique,
    rc.article_reference_id,
    ar.nom AS libelle_reference,
    ar.unite_reference,
    rc.coefficient
   FROM ((((((public.articles_fournisseur s
     JOIN cibles k ON (((k.fournisseur_id = s.fournisseur_id) AND (k.designation_normalisee = s.designation_normalisee) AND (NOT (k.unite_normalisee IS DISTINCT FROM s.unite_normalisee)))))
     JOIN public.articles_fournisseur c ON ((c.id = k.cible_id)))
     JOIN public.fournisseurs fo ON ((fo.id = s.fournisseur_id)))
     LEFT JOIN public.rapprochements_articles rc ON (((rc.article_fournisseur_id = c.id) AND (rc.valide_le IS NOT NULL))))
     LEFT JOIN public.rapprochements_articles rs ON (((rs.article_fournisseur_id = s.id) AND (rs.valide_le IS NOT NULL))))
     LEFT JOIN public.articles_reference ar ON ((ar.id = rc.article_reference_id)))
  WHERE ((s.reference_normalisee IS NULL) AND (s.designation_normalisee <> ''::text) AND (COALESCE(btrim(fo.nom), ''::text) !~~* 'TEST%'::text));
create or replace view public.v_td_prix_lignes WITH (security_invoker='true') AS
 SELECT l.id AS ligne_id,
    l.facture_id,
    vf.numero,
    vf.date_ref AS date_prix,
    vf.fournisseur_affiche AS fournisseur,
    COALESCE(fo.siren, f.fournisseur_siren) AS siren,
    e.id AS etablissement_id,
    e.nom_agence,
    e.ville,
    vf.chantier_id,
    vf.chantier,
    l.article_fournisseur_id,
    l.reference_fournisseur,
    l.designation,
    l.designation_normalisee,
    l.unite,
    l.unite_normalisee,
    l.quantite,
    l.montant_ht,
    (l.montant_ht / NULLIF(l.quantite, (0)::numeric)) AS prix_net,
    l.remise_pct,
    COALESCE(rv.article_reference_id, p.article_reference_id) AS article_reference_id,
    ar.nom AS libelle_reference,
    ar.unite_reference,
    COALESCE(rv.coefficient, p.coefficient) AS coefficient,
    ((l.montant_ht / NULLIF(l.quantite, (0)::numeric)) * COALESCE(rv.coefficient, p.coefficient)) AS prix_unite_reference,
    (COALESCE(rv.article_reference_id, p.article_reference_id) IS NOT NULL) AS rapproche,
        CASE
            WHEN (rv.article_fournisseur_id IS NOT NULL) THEN 'valide'::text
            WHEN (p.article_source_id IS NOT NULL) THEN 'automatique'::text
            ELSE NULL::text
        END AS origine_rapprochement
   FROM ((((((((public.lignes_facture l
     JOIN public.v_td_factures vf ON (((vf.facture_id = l.facture_id) AND (vf.statut = 'acceptee'::text) AND (vf.type_document = 'facture'::text) AND (NOT vf.date_future))))
     JOIN public.factures f ON ((f.id = l.facture_id)))
     LEFT JOIN public.etablissements_fournisseur e0 ON ((e0.id = f.etablissement_id)))
     LEFT JOIN public.etablissements_fournisseur e ON ((e.id = COALESCE(e0.fusionne_dans, e0.id))))
     LEFT JOIN public.fournisseurs fo ON ((fo.id = COALESCE(e0.fournisseur_id, f.fournisseur_id))))
     LEFT JOIN public.rapprochements_articles rv ON (((rv.article_fournisseur_id = l.article_fournisseur_id) AND (rv.valide_le IS NOT NULL))))
     LEFT JOIN public.v_td_prix_ponts p ON (((p.article_source_id = l.article_fournisseur_id) AND p.applique AND (rv.article_fournisseur_id IS NULL))))
     LEFT JOIN public.articles_reference ar ON ((ar.id = COALESCE(rv.article_reference_id, p.article_reference_id))))
  WHERE ((l.quantite > (0)::numeric) AND (l.montant_ht > (0)::numeric));
create or replace view public.v_td_prix_controle_6mois WITH (security_invoker='true') AS
 WITH p AS (
         SELECT ((now() AT TIME ZONE 'Europe/Paris'::text))::date AS date_fin,
            ((((now() AT TIME ZONE 'Europe/Paris'::text))::date - '3 mons'::interval))::date AS date_milieu,
            ((((now() AT TIME ZONE 'Europe/Paris'::text))::date - '6 mons'::interval))::date AS date_debut
        ), m AS (
         SELECT l.article_fournisseur_id,
            min(l.fournisseur) AS fournisseur_ligne,
            count(*) FILTER (WHERE (l.date_prix < p_1.date_milieu)) AS nb_achats_debut,
            count(*) FILTER (WHERE (l.date_prix >= p_1.date_milieu)) AS nb_achats_fin,
            (sum(l.montant_ht) FILTER (WHERE (l.date_prix < p_1.date_milieu)) / NULLIF(sum(l.quantite) FILTER (WHERE (l.date_prix < p_1.date_milieu)), (0)::numeric)) AS prix_moyen_debut,
            (sum(l.montant_ht) FILTER (WHERE (l.date_prix >= p_1.date_milieu)) / NULLIF(sum(l.quantite) FILTER (WHERE (l.date_prix >= p_1.date_milieu)), (0)::numeric)) AS prix_moyen_fin,
            sum(l.montant_ht) AS depense_6mois
           FROM (public.v_td_prix_lignes l
             CROSS JOIN p p_1)
          WHERE ((l.article_fournisseur_id IS NOT NULL) AND (l.date_prix >= p_1.date_debut) AND (l.date_prix <= p_1.date_fin))
          GROUP BY l.article_fournisseur_id
        )
 SELECT m.article_fournisseur_id,
    COALESCE(NULLIF(btrim(fo.nom), ''::text), m.fournisseur_ligne) AS fournisseur,
    af.reference AS reference_fournisseur,
    af.designation,
    p.date_debut,
    p.date_milieu,
    p.date_fin,
    (m.nb_achats_debut)::integer AS nb_achats_debut,
    (m.nb_achats_fin)::integer AS nb_achats_fin,
    m.prix_moyen_debut,
    m.prix_moyen_fin,
    round((((100)::numeric * (m.prix_moyen_fin - m.prix_moyen_debut)) / NULLIF(m.prix_moyen_debut, (0)::numeric)), 2) AS variation_pct,
    m.depense_6mois
   FROM (((m
     CROSS JOIN p)
     JOIN public.articles_fournisseur af ON ((af.id = m.article_fournisseur_id)))
     LEFT JOIN public.fournisseurs fo ON ((fo.id = af.fournisseur_id)));
create or replace view public.v_td_prix_evolution WITH (security_invoker='true') AS
 WITH l AS (
         SELECT v_td_prix_lignes.article_fournisseur_id,
            v_td_prix_lignes.date_prix,
            v_td_prix_lignes.fournisseur,
            v_td_prix_lignes.etablissement_id,
            v_td_prix_lignes.unite_normalisee,
            v_td_prix_lignes.quantite,
            v_td_prix_lignes.montant_ht,
            v_td_prix_lignes.prix_net,
            v_td_prix_lignes.article_reference_id,
            v_td_prix_lignes.libelle_reference,
            v_td_prix_lignes.unite_reference,
            v_td_prix_lignes.coefficient,
            v_td_prix_lignes.rapproche,
            v_td_prix_lignes.origine_rapprochement
           FROM public.v_td_prix_lignes
          WHERE (v_td_prix_lignes.article_fournisseur_id IS NOT NULL)
        ), jours AS (
         SELECT l.article_fournisseur_id,
            l.date_prix,
            (sum(l.montant_ht) / NULLIF(sum(l.quantite), (0)::numeric)) AS prix_jour
           FROM l
          GROUP BY l.article_fournisseur_id, l.date_prix
        ), bornes AS (
         SELECT jours.article_fournisseur_id,
            min(jours.date_prix) AS date_premier,
            max(jours.date_prix) AS date_dernier,
            count(*) AS nb_dates
           FROM jours
          GROUP BY jours.article_fournisseur_id
        ), tot AS (
         SELECT l.article_fournisseur_id,
            count(*) AS nb_achats,
            min(l.prix_net) AS prix_min,
            max(l.prix_net) AS prix_max,
            sum(l.montant_ht) AS depense,
            sum(l.quantite) AS quantite_totale,
            count(DISTINCT l.etablissement_id) AS nb_agences,
            count(DISTINCT COALESCE(l.unite_normalisee, ''::text)) AS nb_unites,
            min(l.fournisseur) AS fournisseur_ligne,
            (array_agg(l.article_reference_id))[1] AS article_reference_id,
            max(l.libelle_reference) AS libelle_reference,
            max(l.unite_reference) AS unite_reference,
            max(l.coefficient) AS coefficient,
            bool_or(l.rapproche) AS rapproche,
            max(l.origine_rapprochement) AS origine_rapprochement
           FROM l
          GROUP BY l.article_fournisseur_id
        )
 SELECT t.article_fournisseur_id,
    af.fournisseur_id,
    COALESCE(NULLIF(btrim(fo.nom), ''::text), t.fournisseur_ligne) AS fournisseur,
    fo.siren,
    af.reference AS reference_fournisseur,
    af.designation,
    af.unite,
    af.unite_normalisee,
    (t.nb_achats)::integer AS nb_achats,
    (b.nb_dates)::integer AS nb_dates,
    b.date_premier,
    b.date_dernier,
    j1.prix_jour AS prix_premier,
    j2.prix_jour AS prix_dernier,
    t.prix_min,
    t.prix_max,
        CASE
            WHEN (b.nb_dates >= 2) THEN round((((100)::numeric * (j2.prix_jour - j1.prix_jour)) / NULLIF(j1.prix_jour, (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS variation_pct,
    t.depense,
    t.quantite_totale,
    (t.nb_agences)::integer AS nb_agences,
    (t.nb_agences > 1) AS agences_differentes,
    (t.nb_unites)::integer AS nb_unites,
    (t.nb_unites > 1) AS unites_differentes,
    (t.nb_achats < 3) AS peu_de_donnees,
    t.article_reference_id,
    t.libelle_reference,
    t.unite_reference,
    t.coefficient,
    COALESCE(t.rapproche, false) AS rapproche,
    t.origine_rapprochement
   FROM (((((tot t
     JOIN bornes b ON ((b.article_fournisseur_id = t.article_fournisseur_id)))
     JOIN jours j1 ON (((j1.article_fournisseur_id = t.article_fournisseur_id) AND (j1.date_prix = b.date_premier))))
     JOIN jours j2 ON (((j2.article_fournisseur_id = t.article_fournisseur_id) AND (j2.date_prix = b.date_dernier))))
     JOIN public.articles_fournisseur af ON ((af.id = t.article_fournisseur_id)))
     LEFT JOIN public.fournisseurs fo ON ((fo.id = af.fournisseur_id)));
create or replace view public.v_td_resume_jour WITH (security_invoker='true') AS
 WITH a AS (
         SELECT (count(*))::integer AS n,
            COALESCE(sum(v_td_factures.montant_ht), (0)::numeric) AS m,
            COALESCE(max(v_td_factures.jours_attente), 0) AS j
           FROM public.v_td_factures
          WHERE (v_td_factures.statut = 'a_valider'::text)
        ), c AS (
         SELECT v_td_chantiers_a_surveiller.nb_chantiers AS n,
            v_td_chantiers_a_surveiller.noms
           FROM public.v_td_chantiers_a_surveiller
        ), d AS (
         SELECT max(v_td_factures.created_at) AS dt
           FROM public.v_td_factures
        )
 SELECT a.n AS nb_a_decider,
    a.m AS montant_a_decider_ht,
    a.j AS jours_plus_ancienne,
    c.n AS nb_chantiers_a_90,
    c.noms AS noms_chantiers_a_90,
    ((d.dt AT TIME ZONE 'Europe/Paris'::text))::date AS derniere_facture_le,
        CASE
            WHEN (a.n = 0) THEN 'Aucune facture à décider.'::text
            ELSE (((a.n ||
            CASE
                WHEN (a.n = 1) THEN ' facture à décider : '::text
                ELSE ' factures à décider : '::text
            END) || replace(to_char(a.m, 'FM999,999,999,990'::text), ','::text, ' '::text)) || ' € HT.'::text)
        END AS phrase_a_decider,
        CASE
            WHEN (a.n = 0) THEN 'Rien n''attend.'::text
            ELSE (('La plus ancienne attend depuis '::text || a.j) ||
            CASE
                WHEN (a.j <= 1) THEN ' jour.'::text
                ELSE ' jours.'::text
            END)
        END AS phrase_plus_ancienne,
        CASE
            WHEN (c.n = 0) THEN 'Aucun chantier en cours à 90 % de son budget ou plus.'::text
            ELSE (((c.n ||
            CASE
                WHEN (c.n = 1) THEN ' chantier à 90 % du budget ou plus : '::text
                ELSE ' chantiers à 90 % du budget ou plus : '::text
            END) || c.noms) || '.'::text)
        END AS phrase_chantiers,
        CASE
            WHEN (d.dt IS NULL) THEN 'Aucune facture reçue pour le moment.'::text
            ELSE (('Dernière facture reçue le '::text || to_char((d.dt AT TIME ZONE 'Europe/Paris'::text), 'DD/MM/YYYY'::text)) || '.'::text)
        END AS phrase_derniere_facture
   FROM a,
    c,
    d;
create or replace view public.v_td_sans_chantier WITH (security_invoker='true') AS
 SELECT (count(*) FILTER (WHERE (statut <> 'refusee'::text)))::integer AS nb_factures,
    COALESCE(sum(montant_ht) FILTER (WHERE (statut <> 'refusee'::text)), (0)::numeric) AS montant_ht,
    COALESCE(sum(montant_ht) FILTER (WHERE (statut = 'acceptee'::text)), (0)::numeric) AS montant_accepte_ht,
    COALESCE(sum(montant_ht) FILTER (WHERE (statut = 'a_valider'::text)), (0)::numeric) AS montant_a_valider_ht,
    COALESCE(sum(montant_ht), (0)::numeric) AS montant_tous_statuts_ht
   FROM public.v_td_factures
  WHERE sans_chantier;
create or replace view public.v_td_taux_refus_par_mois WITH (security_invoker='true') AS
 WITH fin AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Paris'::text)))::date AS m_fin
        )
 SELECT (m.m)::date AS mois,
    (count(f.facture_id) FILTER (WHERE (f.statut = 'acceptee'::text)))::integer AS nb_acceptees,
    (count(f.facture_id) FILTER (WHERE (f.statut = 'refusee'::text)))::integer AS nb_refusees,
    (count(f.facture_id) FILTER (WHERE (f.statut = ANY (ARRAY['acceptee'::text, 'refusee'::text]))))::integer AS nb_decidees,
    round(((100.0 * (count(f.facture_id) FILTER (WHERE (f.statut = 'refusee'::text)))::numeric) / (NULLIF(count(f.facture_id) FILTER (WHERE (f.statut = ANY (ARRAY['acceptee'::text, 'refusee'::text]))), 0))::numeric), 1) AS taux_refus_pct
   FROM ((fin
     CROSS JOIN LATERAL generate_series((fin.m_fin - '11 mons'::interval), (fin.m_fin)::timestamp without time zone, '1 mon'::interval) m(m))
     LEFT JOIN public.v_td_factures f ON ((f.mois = (m.m)::date)))
  GROUP BY m.m;
