-- 05 : ce que lisent l'OS, Pilotage et les robots garde les MÊMES noms et les MÊMES colonnes qu'aujourd'hui (C4, C7).
-- Les listes ci-dessous sont relevées sur le schéma du dépôt BTP (état après 034) joué sur une base jetable.
-- Une vue (et la vue factures) doit avoir EXACTEMENT les mêmes colonnes, dans le même ordre.
-- Une table peut avoir des colonnes EN PLUS (espace_id, cree_le, modifie_le, archive_le…) mais garde toutes les anciennes,
-- sauf exceptions listées (et écrites dans REGLES.md).
-- Sont enlevés exprès : acces_firebase_reglage (C1), acces_base_autorise() et initialiser_acces_firebase() (C1).
do $$
declare r record; v_cols text; v_kind char; v_manque text; v_attendu text[]; v_trouve text[]; v_erreurs text := '';
begin
  for r in select * from (values
  ('articles_fournisseur','table','id,fournisseur_id,reference,reference_normalisee,designation,designation_normalisee,unite,unite_normalisee,created_at'),
  ('articles_reference','table','id,nom,nom_normalise,unite_reference,actif,created_at'),
  ('chantiers','table','id,nom,client,adresse,budget_ht,statut,date_debut,date_fin_prevue,created_at,code,date_fin_reelle,archive'),
  ('courriels_recus','table','id,recu_le,date_courriel,client,boite,destinataire,workflow,workflow_id,version_workflow,execution_id,email_message_id,imap_uid,expediteur,cc,sujet,corps_texte,pieces_jointes,authentification,resultat,archive_chemin'),
  ('couts_ia','table','id,cree_le,courriel_id,cle_fiche,workflow,etape,execution_id,piece_jointe,declencheur,nb_elements,modele,hebergeur,jetons_entree,jetons_sortie,cle_openrouter,cout_eur,taux_usd_eur,date_taux,workflow_id,workflow_nom,etiquettes,etiquettes_lues'),
  ('etablissements_fournisseur','table','id,fournisseur_id,siret,nom_agence,ville,nom_normalise,ville_normalisee,actif,fusionne_dans,created_at'),
  ('factures','table','id,chantier_id,fournisseur,numero,date_facture,montant_ht,montant_tva,montant_ttc,statut,motif_refus,date_decision,decide_par,fichier_path,email_expediteur,email_message_id,created_at,extraction,extraction_erreur,alertes_a_la_decision,acceptee_malgre_alerte,motif_acceptation,fournisseur_siren,numero_normalise,iban_normalise,decide_par_id,fournisseur_id,etablissement_id,type_document,lignes_etat,lignes_somme_ht,archivee_le,archivee_par,courriel_id'),
  ('favoris','table','id,utilisateur,genre,cle,cree_le'),
  ('favoris_os','table','id,utilisateur,genre,cle,cree_le'),
  ('fournisseurs','table','id,siren,nom,statut,cree_par,created_at'),
  ('fournisseurs_a_verifier','vue','fournisseur_id,siren,nom,iban,nb_factures,derniere_facture_le,a_une_facture_acceptee,vu_seulement_sur_refusee,facture_a_confirmer,revoque_le,motif_revocation,confirme_pour_autre_siren,vu_chez_autre_siren'),
  ('ibans_confirmes','table','id,fournisseur_id,siren,iban,facture_id,moyen_verification,confirme_par,confirme_par_id,confirme_le,revoque_le,revoque_par,revoque_par_id,motif_revocation'),
  ('journal_decisions','table','id,facture_id,decision,decide_par,decide_le,motif,alertes,acceptee_malgre_alerte,decide_par_id,ancien_statut'),
  ('journal_modifications','table','id,table_nom,enregistrement_id,action,qui,qui_id,quand,avant,apres'),
  ('lignes_facture','table','id,facture_id,position,reference_fournisseur,designation,designation_normalisee,quantite,unite,unite_normalisee,prix_unitaire_ht,remise_pct,montant_ht,taux_tva,article_fournisseur_id,created_at'),
  ('n8n_executions','table','id,cree_le,workflow_id,workflow_nom,etiquettes,etiquettes_lues,pour_qui_manquant,execution_id,declencheur,resultat,nb_appels_ia,test'),
  ('openrouter_cles_releves','table','id,cree_le,releve_le,jour_utc,cle_nom,limite_fournisseur,devise_fournisseur,remise_limite,depense_jour_eur,depense_semaine_eur,depense_mois_eur,depense_totale_eur,desactivee,taux_usd_eur,date_taux,test'),
  ('rapprochements_articles','table','article_fournisseur_id,article_reference_id,coefficient,valide_par,valide_le,suggere_par_ia,created_at'),
  ('suggestions_refusees','table','article_fournisseur_id,refuse_par,refuse_le,article_reference_id,coefficient'),
  ('suggestions_tentees','table','article_fournisseur_id,tentatives,derniere_le'),
  ('tickets_n8n','table','empreinte,usage,courriel,espace,utilisateur,cree_le,expire_le'),
  ('tickets_n8n_demandes','table','utilisateur,demande_le'),
  ('v_articles_en_hausse','vue','article_reference_id,article_reference,unite_reference,fournisseur_id,fournisseur,nb_lignes,premiere_date,derniere_date,premier_prix,dernier_prix,variation_pct'),
  ('v_budget_chantiers','vue','chantier_id,chantier,client,statut,budget_ht,engage_ht,en_attente_ht,reste_ht,pct_budget_consomme'),
  ('v_comparaison_fournisseurs','vue','niveau,article_reference_id,article_reference,unite_reference,fournisseur_id,fournisseur,etablissement_id,nom_agence,ville,nb_lignes,prix_min,prix_max,prix_moyen,derniere_date,dernier_prix'),
  ('v_courriels_recus_par_jour','vue','jour,client,boite,workflow,resultat,authentification,nb_courriels'),
  ('v_cout_ia_par_etiquette','vue','jour,etiquette,famille,nb_appels,cout_eur,appels_sans_cout'),
  ('v_cout_ia_par_facture','vue','facture_id,numero,fournisseur,statut,nb_appels,cout_eur'),
  ('v_cout_ia_par_jour','vue','jour,workflow,etape,nb_appels,jetons_entree,jetons_sortie,cout_eur,appels_sans_cout'),
  ('v_delai_validation','vue','id,fournisseur,statut,created_at,date_decision,heures_avant_decision'),
  ('v_depense_article_chantier','vue','chantier_id,chantier,article_reference_id,article_reference,article_fournisseur_id,designation_fournisseur,nb_lignes,depense_ht,quantite_unite_reference'),
  ('v_factures_detail','vue','id,created_at,date_facture,fournisseur,numero,chantier,montant_ht,montant_tva,montant_ttc,statut,motif_refus,date_decision,decide_par,acceptee_malgre_alerte,motif_acceptation,type_document,archivee_le'),
  ('v_factures_par_mois','vue','mois,statut,nb_factures,total_ht,total_ttc'),
  ('v_hausse_6_mois','vue','article_reference_id,article_reference,unite_reference,fournisseur_id,fournisseur,nb_lignes,premiere_date,derniere_date,premier_prix,dernier_prix,variation_pct'),
  ('v_journal_decisions','vue','id,facture_id,fournisseur,numero,decision,decide_par,decide_le,motif,acceptee_malgre_alerte,nb_alertes'),
  ('v_n8n_executions_par_jour','vue','jour,workflow_id,workflow_nom,pour_qui,pour_qui_manquant,declencheur,resultat,nb_executions,nb_appels_ia'),
  ('v_prix_articles','vue','ligne_id,facture_id,date_prix,fournisseur_id,fournisseur,etablissement_id,nom_agence,ville,chantier_id,chantier,article_fournisseur_id,reference_fournisseur,designation_fournisseur,article_reference_id,article_reference,unite_reference,coefficient,quantite,montant_ht,prix_unite_fournisseur,prix_unite_reference,quantite_unite_reference,rapproche'),
  ('v_td_a_valider','vue','nb_factures,total_ht,attente_max_jours'),
  ('v_td_acceptees_malgre_alerte','vue','facture_id,date_decision,fournisseur,numero,chantier,montant_ht,motif_acceptation,nb_alertes,decide_par'),
  ('v_td_achats_par_mois','vue','mois,mois_libelle,total_ht,nb_factures'),
  ('v_td_attente_anciennete','vue','ordre,tranche,nb_factures,montant_ht'),
  ('v_td_chantiers','vue','chantier_id,chantier,client,statut,statut_fr,archive,budget_ht,budget_renseigne,accepte_ht,en_attente_ht,reste_ht,pct_budget_consomme,niveau'),
  ('v_td_chantiers_a_surveiller','vue','nb_chantiers,noms'),
  ('v_td_chantiers_en_cours','vue','chantier_id,chantier,client,statut,budget_ht,budget_renseigne,accepte_ht,en_attente_ht,reste_ht,pct_budget_consomme,niveau'),
  ('v_td_dates_anormales','vue','facture_id,fournisseur,numero,statut_fr,date_facture,date_arrivee,jours_dans_le_futur'),
  ('v_td_decisions_par_mois','vue','mois,avec_alerte,sans_alerte,total'),
  ('v_td_delai_decision','vue','delai_median_jours,nb_decisions,periode_jours'),
  ('v_td_depenses_mois_chantier','vue','mois,chantier_id,chantier,total_ht,nb_factures'),
  ('v_td_etq_arbre','vue','source,jour,mois,a_qui,ou,module,workflow,cout_eur,nb_appels,nb_executions,appels_sans_cout'),
  ('v_td_etq_filtre_module','vue','module'),
  ('v_td_etq_filtre_ou','vue','ou'),
  ('v_td_etq_filtre_qui','vue','a_qui'),
  ('v_td_factures','vue','facture_id,fournisseur,numero,chantier_id,chantier,sans_chantier,client,type_document,statut,statut_fr,montant_ht,montant_ttc,date_facture,date_ref,mois,date_arrivee,created_at,date_decision,decide_par,motif_refus,nb_alertes,acceptee_malgre_alerte,motif_acceptation,archivee_le,archivee,jours_attente,date_future,fournisseur_affiche,siret_agence'),
  ('v_td_factures_par_mois_statut','vue','mois,statut,statut_fr,nb_factures,total_ht'),
  ('v_td_filtre_chantiers','vue','chantier'),
  ('v_td_filtre_clients','vue','client'),
  ('v_td_filtre_decideurs','vue','decide_par'),
  ('v_td_filtre_fournisseurs','vue','fournisseur'),
  ('v_td_fournisseurs_agences','vue','etablissement_id,fournisseur_id,nom_agence,ville,siret'),
  ('v_td_fournisseurs_classement','vue','rang,fournisseur,total_accepte_ht,part_pct'),
  ('v_td_fournisseurs_detail','vue','fournisseur,nb_factures,nb_acceptees,nb_refusees,total_accepte_ht,taux_refus_pct'),
  ('v_td_fournisseurs_factures','vue','facture_id,numero,date_ref,fournisseur_id,fournisseur,siren,etablissement_id,chantier_id,chantier,type_document,montant_ht,nb_lignes'),
  ('v_td_fournisseurs_fiches','vue','fournisseur_id,fournisseur,siren,nb_agences'),
  ('v_td_fournisseurs_top3','vue','part_top3_pct,nb_fournisseurs,total_accepte_ht'),
  ('v_td_ia_appels','vue','appel_id,cree_le,jour,mois,workflow,etape,modele,hebergeur,declencheur,declencheur_fr,jetons_entree,jetons_sortie,jetons,cout_eur,facture_id,avec_facture,fournisseur,numero,statut,est_test'),
  ('v_td_ia_ce_mois','vue','mois,mois_libelle,cout_eur,cout_mois_precedent_eur,nb_appels,nb_factures,appels_sans_cout,cout_moyen_par_facture_eur,cout_moyen_par_appel_eur'),
  ('v_td_ia_par_declencheur','vue','declencheur,declencheur_fr,nb_appels,jetons,cout_eur,part_pct,appels_sans_cout,rang'),
  ('v_td_ia_par_facture','vue','facture_id,fournisseur,numero,statut,statut_fr,hors_facture,nb_appels,jetons_entree,jetons_sortie,jetons,cout_eur,appels_sans_cout,rang'),
  ('v_td_ia_par_jour','vue','jour,nb_appels,jetons_entree,jetons_sortie,jetons,cout_eur,appels_sans_cout'),
  ('v_td_ia_par_modele','vue','modele,hebergeur,nb_appels,jetons,cout_eur,cout_moyen_1000_jetons_eur,appels_sans_cout,rang'),
  ('v_td_ia_par_mois','vue','mois,mois_libelle,nb_appels,jetons,cout_eur,appels_sans_cout'),
  ('v_td_ia_par_workflow_etape','vue','workflow,etape,nb_appels,jetons,cout_eur,part_pct,appels_sans_cout,rang'),
  ('v_td_ia_sans_cout','vue','appel_id,cree_le,jour,workflow,etape,modele,hebergeur,declencheur_fr,jetons_entree,jetons_sortie,jetons,facture_id,fournisseur,numero'),
  ('v_td_ia_taux','vue','taux_de_change,date_taux,utilise_le'),
  ('v_td_ia_top_factures','vue','rang,facture_id,fournisseur,numero,statut,statut_fr,nb_appels,jetons,cout_eur'),
  ('v_td_journal_decisions','vue','journal_id,facture_id,decide_le,fournisseur,numero,decision,decision_fr,nb_alertes,acceptee_malgre_alerte,motif,decide_par'),
  ('v_td_malgre_alerte','vue','nb_ce_mois,nb_30_jours,nb_total'),
  ('v_td_pareto_chantiers','vue','rang,nom,montant_ht,part_pct,cumul_pct,dans_80_pct,chantier_id'),
  ('v_td_pareto_fournisseurs','vue','rang,nom,montant_ht,part_pct,cumul_pct,dans_80_pct'),
  ('v_td_pareto_resume','vue','axe,k,n,pct,phrase'),
  ('v_td_plafonds_cles','vue','cle_nom,desactivee,remise,plafond_eur,plafond_monnaie_fournisseur,devise_fournisseur,depense_periode_eur,depense_mois_eur,reste_eur,part_pct,etat,part_normal,part_attention,part_atteint,part_tri,releve_le,heures_depuis_releve,date_taux'),
  ('v_td_prix_controle_6mois','vue','article_fournisseur_id,fournisseur,reference_fournisseur,designation,date_debut,date_milieu,date_fin,nb_achats_debut,nb_achats_fin,prix_moyen_debut,prix_moyen_fin,variation_pct,depense_6mois'),
  ('v_td_prix_evolution','vue','article_fournisseur_id,fournisseur_id,fournisseur,siren,reference_fournisseur,designation,unite,unite_normalisee,nb_achats,nb_dates,date_premier,date_dernier,prix_premier,prix_dernier,prix_min,prix_max,variation_pct,depense,quantite_totale,nb_agences,agences_differentes,nb_unites,unites_differentes,peu_de_donnees,article_reference_id,libelle_reference,unite_reference,coefficient,rapproche,origine_rapprochement'),
  ('v_td_prix_lignes','vue','ligne_id,facture_id,numero,date_prix,fournisseur,siren,etablissement_id,nom_agence,ville,chantier_id,chantier,article_fournisseur_id,reference_fournisseur,designation,designation_normalisee,unite,unite_normalisee,quantite,montant_ht,prix_net,remise_pct,article_reference_id,libelle_reference,unite_reference,coefficient,prix_unite_reference,rapproche,origine_rapprochement'),
  ('v_td_prix_ponts','vue','article_source_id,article_cible_id,fournisseur_id,fournisseur,designation,unite,unite_normalisee,reference_cible,motif,origine,cible_rapprochee,source_rapprochee,applique,article_reference_id,libelle_reference,unite_reference,coefficient'),
  ('v_td_resume_jour','vue','nb_a_decider,montant_a_decider_ht,jours_plus_ancienne,nb_chantiers_a_90,noms_chantiers_a_90,derniere_facture_le,phrase_a_decider,phrase_plus_ancienne,phrase_chantiers,phrase_derniere_facture'),
  ('v_td_sans_chantier','vue','nb_factures,montant_ht,montant_accepte_ht,montant_a_valider_ht,montant_tous_statuts_ht'),
  ('v_td_taux_refus_par_mois','vue','mois,nb_acceptees,nb_refusees,nb_decidees,taux_refus_pct')
  ) as t(nom, genre, colonnes) loop
    select c.relkind into v_kind from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = r.nom;
    if v_kind is null then
      v_erreurs := v_erreurs || format(E'\n- %s (%s) a disparu', r.nom, r.genre);
      continue;
    end if;
    select string_agg(a.attname, ',' order by a.attnum), array_agg(a.attname::text order by a.attnum) into v_cols, v_trouve
      from pg_attribute a where a.attrelid = format('public.%I', r.nom)::regclass and a.attnum > 0 and not a.attisdropped;
    v_attendu := string_to_array(r.colonnes, ',');
    if r.genre = 'vue' or r.nom in ('factures', 'lignes_facture', 'suggestions_refusees', 'rapprochements_articles', 'journal_decisions') then
      if v_cols is distinct from r.colonnes then
        v_erreurs := v_erreurs || format(E'\n- colonnes de %s changées. Attendu : %s / trouvé : %s', r.nom, r.colonnes, v_cols);
      end if;
    else
      select string_agg(x, ', ') into v_manque from unnest(v_attendu) x where x <> all (v_trouve)
        -- Renommage voulu (REGLES.md) : tickets_n8n.espace devient espace_id, comme partout (consommer_ticket rend toujours « espace »).
        and not (r.nom = 'tickets_n8n' and x = 'espace');
      if v_manque is not null then
        v_erreurs := v_erreurs || format(E'\n- il manque à la table %s : %s', r.nom, v_manque);
      end if;
    end if;
  end loop;
  if v_erreurs <> '' then
    raise exception 'Compatibilité :%', v_erreurs;
  end if;
end $$;

-- Les fonctions : même nom, mêmes paramètres.
do $$
declare r record;
begin
  for r in select * from (values
  ('archiver_facture(p_facture_id uuid, p_qui text, p_qui_id uuid)'),
  ('basculer_favori(p_genre text, p_cle text)'),
  ('basculer_favori_os(p_genre text, p_cle text)'),
  ('catalogue_a_rapprocher(p_limite integer)'),
  ('chantier_code_suivant()'),
  ('confirmer_iban(p_fournisseur_id uuid, p_iban text, p_facture_id uuid, p_moyen text, p_qui text, p_qui_id uuid)'),
  ('consommer_ticket(p_ticket text, p_usage text)'),
  ('creer_agence_et_fournisseur(p_siret text, p_siren text, p_nom_fournisseur text, p_nom_agence text, p_ville text, p_qui text, p_qui_id uuid)'),
  ('creer_article_reference(p_nom text, p_unite_reference text, p_qui text, p_qui_id uuid)'),
  ('creer_chantier(p_nom text, p_code text, p_client text, p_adresse text, p_budget_ht numeric, p_statut text, p_date_debut date, p_date_fin_prevue date, p_qui text, p_qui_id uuid)'),
  ('demander_ticket_n8n(p_usage text)'),
  ('desactiver_agence(p_id uuid, p_qui text, p_qui_id uuid)'),
  ('desarchiver_facture(p_facture_id uuid, p_qui text, p_qui_id uuid)'),
  ('dissocier_rapprochement(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid)'),
  ('fusionner_agence(p_id uuid, p_dans uuid, p_qui text, p_qui_id uuid)'),
  ('iban_valide(p_iban text)'),
  ('identite_appelant()'),
  ('journaliser_modification(p_table text, p_id uuid, p_action text, p_qui text, p_qui_id uuid, p_avant jsonb, p_apres jsonb)'),
  ('lister_favoris()'),
  ('lister_favoris_os()'),
  ('lot_articles_a_suggerer(p_limite integer)'),
  ('luhn_valide(v text)'),
  ('modifier_chantier(p_id uuid, p_champs jsonb, p_qui text, p_qui_id uuid)'),
  ('niveau_etiquette(p_etiquettes jsonb, p_niveau text)'),
  ('normaliser_reference(t text)'),
  ('normaliser_texte(t text)'),
  ('normaliser_unite(t text)'),
  ('purger_tickets_n8n()'),
  ('rattacher_lignes_facture(p_facture_id uuid, p_qui text, p_qui_id uuid)'),
  ('rattacher_lignes_facture_interne(p_facture_id uuid, p_four uuid, p_qui text, p_qui_id uuid)'),
  ('recalculer_lignes_facture(p_facture_id uuid)'),
  ('recalculer_statut_fournisseur(p_id uuid, p_qui text, p_qui_id uuid)'),
  ('references_pour_suggestion()'),
  ('refuser_suggestion(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid)'),
  ('relier_facture_chantier(p_facture_id uuid, p_chantier_id uuid, p_qui text, p_qui_id uuid)'),
  ('remplacer_lignes_facture(p_facture_id uuid, p_lignes jsonb, p_qui text, p_qui_id uuid)'),
  ('renommer_article_reference(p_id uuid, p_nom text, p_qui text, p_qui_id uuid)'),
  ('reprendre_suggestion(p_article_fournisseur_id uuid, p_qui text, p_qui_id uuid)'),
  ('revoquer_iban(p_id uuid, p_motif text, p_qui text, p_qui_id uuid)'),
  ('rouvrir_facture(p_facture_id uuid, p_motif text, p_qui text, p_qui_id uuid)'),
  ('suggerer_groupe_rapprochement(p_nom text, p_unite_reference text, p_membres jsonb, p_qui text, p_qui_id uuid)'),
  ('suggerer_rapprochement(p_article_fournisseur_id uuid, p_article_reference_id uuid, p_coefficient numeric, p_qui text, p_qui_id uuid)'),
  ('valider_rapprochement(p_article_fournisseur_id uuid, p_article_reference_id uuid, p_coefficient numeric, p_qui text, p_qui_id uuid)')
  ) as t(signature) loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                   and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = r.signature) then
      raise exception 'Compatibilité : la fonction % a disparu ou a changé de paramètres', r.signature;
    end if;
  end loop;
  -- Le nom utilisé par l'OS (actions de achatsarticles) existe aussi.
  if to_regprocedure('public.renommer_reference(uuid, text, text, uuid)') is null then
    raise exception 'Compatibilité : renommer_reference manque';
  end if;
end $$;
