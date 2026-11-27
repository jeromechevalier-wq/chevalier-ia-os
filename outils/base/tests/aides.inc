-- Aides communes des tests (incluses par \ir dans chaque fichier). Données INVENTÉES seulement.
-- entrer(espace, personne) : ce que fera la porte à chaque requête (ici pour toute la session de test).
create or replace function pg_temp.entrer(p_espace text, p_qui text) returns void language plpgsql as $$
begin
  perform set_config('app.espace_id', coalesce(p_espace, ''), false);
  perform set_config('app.utilisateur', coalesce(p_qui, ''), false);
end $$;
-- doit_echouer(requête, detail attendu) : la requête DOIT échouer ; si detail est donné, l'erreur doit porter ce detail
-- (ou, s'il commence par « MESSAGE: », son message doit contenir la suite).
create or replace function pg_temp.doit_echouer(p_sql text, p_detail text) returns void language plpgsql as $$
declare v_detail text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail, v_msg = message_text;
    if p_detail like 'MESSAGE:%' then
      if strpos(v_msg, substr(p_detail, 9)) = 0 then
        raise exception 'Message attendu contenant « % » mais reçu « % » pour : %', substr(p_detail, 9), v_msg, p_sql;
      end if;
    elsif p_detail is not null and coalesce(v_detail, '') <> p_detail then
      raise exception 'Erreur attendue « % » mais reçue « % » (%) pour : %', p_detail, v_detail, v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'Cette requête aurait dû être refusée : %', p_sql;
end $$;
-- egal(trouvé, attendu, quoi)
create or replace function pg_temp.egal(p_trouve anyelement, p_attendu anyelement, p_quoi text) returns void language plpgsql as $$
begin
  if p_trouve is distinct from p_attendu then
    raise exception '% : attendu %, trouvé %', p_quoi, p_attendu, p_trouve;
  end if;
end $$;

-- Un SIREN inventé dont la clé de contrôle est bonne : 7 chiffres donnés + 2 chiffres trouvés.
create or replace function pg_temp.siren(p_debut text) returns text language plpgsql as $$
declare i int; v text;
begin
  for i in 0..99 loop
    v := p_debut || lpad(i::text, 2, '0');
    if public.luhn_valide(v) then return v; end if;
  end loop;
  raise exception 'pas de SIREN';
end $$;

-- robot(_) : devenir le robot qui recopie (rôle robot_reflets, personne « n8n », le paramètre est ignoré), dans le même espace ; redevenir() : revenir au rôle et à la
-- personne d'avant. Le droit de « devenir » un rôle est celui du compte de la séance (l'administrateur des tests).
create or replace function pg_temp.robot(p_qui text) returns void language plpgsql as $$
begin
  set role robot_reflets;
  perform set_config('app.utilisateur', 'n8n', false);
end $$;
create or replace function pg_temp.redevenir(p_role text, p_qui text) returns void language plpgsql as $$
begin
  execute format('set role %I', p_role);
  perform set_config('app.utilisateur', p_qui, false);
end $$;

-- peupler(espace, marque, début de SIREN) : un jeu complet de données INVENTÉES dans un espace, par les chemins normaux
-- (fonctions, vue factures). Chaque texte porte la marque (ex. « MARQA ») pour vérifier qu'elle ne se voit jamais depuis un autre espace.
create or replace function pg_temp.peupler(p_espace text, p_marque text, p_siren_debut text)
returns table(fournisseur_id uuid, agence_id uuid, chantier_id uuid, facture_id uuid, facture_refusee_id uuid, article_id uuid, reference_id uuid, courriel_id uuid)
language plpgsql as $$
declare
  v_qui text := 'alice-' || lower(p_marque) || '@exemple.test';
  v_qui_id uuid := gen_random_uuid();
  v_siren text := pg_temp.siren(p_siren_debut);
  v_four uuid; v_ag uuid; v_ch uuid; v_f uuid; v_f2 uuid; v_art uuid; v_ref uuid; v_c uuid; v_role text;
begin
  perform pg_temp.entrer(p_espace, v_qui);
  -- Les reflets (courriel, scans, lignes lues, coûts, relevés) sont écrits par le robot (migration 012) ; le reste par la personne,
  -- sous le rôle de l'appelant (souvent porte). « set role » vise le compte de la séance (l'administrateur des tests), pas l'appelant.
  v_role := current_user;
  select a.agence_id, a.entreprise_id into v_ag, v_four
    from public.creer_agence_et_fournisseur(v_siren || '00012', null, 'Fournisseur ' || p_marque, 'Agence ' || p_marque, 'Ville ' || p_marque, v_qui) a;
  v_ch := public.creer_chantier('Chantier ' || p_marque, null, 'Client ' || p_marque, 'Adresse ' || p_marque, 1000, 'en_cours', null, null, v_qui);
  perform pg_temp.robot(v_qui);
  insert into public.courriels_recus (client, boite, workflow, email_message_id, expediteur, sujet, resultat)
  values ('client-' || lower(p_marque), 'factures@exemple.test', 'lecture', '<m1-' || p_marque || '@exemple.test>', 'compta@exemple.test', 'Facture ' || p_marque, 'accepte')
  returning id into v_c;
  insert into public.factures (fournisseur, numero, date_facture, montant_ht, montant_tva, montant_ttc, email_message_id, courriel_id, fichier_path, extraction)
  values ('Fournisseur ' || p_marque, 'F-1', date '2026-11-02', 100, 20, 120, '<m1-' || p_marque || '@exemple.test>', v_c, 'factures/' || p_marque || '-1.pdf',
          jsonb_build_object('numero', 'F-1', 'fournisseur', jsonb_build_object('siren', v_siren), 'iban', 'FR7630006000011234567890189'))
  returning id into v_f;
  perform public.remplacer_lignes_facture(v_f, jsonb_build_array(
    jsonb_build_object('reference_fournisseur', 'REF-' || p_marque, 'designation', 'Ciment ' || p_marque, 'quantite', 2, 'unite', 'sac',
                       'prix_unitaire_ht', 50, 'montant_ht', 100, 'taux_tva', 20)), 'n8n');
  perform pg_temp.redevenir(v_role, v_qui);
  update public.factures set statut = 'acceptee', etablissement_id = v_ag, chantier_id = v_ch, decide_par = v_qui, decide_par_id = v_qui_id where id = v_f;
  perform pg_temp.robot(v_qui);
  insert into public.factures (fournisseur, numero, montant_ht, montant_tva, montant_ttc, extraction)
  values ('Fournisseur ' || p_marque, 'F-2', 100, 20, 120, jsonb_build_object('fournisseur', jsonb_build_object('siren', v_siren)))
  returning id into v_f2;
  perform pg_temp.redevenir(v_role, v_qui);
  update public.factures set statut = 'refusee', motif_refus = 'Doublon ' || p_marque, decide_par = v_qui, decide_par_id = v_qui_id where id = v_f2;
  select a.id into v_art from public.articles_fournisseur a where a.fournisseur_id = v_four;
  v_ref := public.creer_article_reference('Ciment de référence ' || p_marque, 'sac', v_qui);
  perform public.valider_rapprochement(v_art, v_ref, 1, v_qui);
  perform public.confirmer_iban(v_four, 'FR7630006000011234567890189', v_f, 'Appel au ' || p_marque, v_qui);
  perform public.basculer_favori_os('chantier', v_ch::text);
  perform pg_temp.robot(v_qui);
  insert into public.couts_ia (courriel_id, workflow, etape, execution_id, declencheur, modele, cout_eur, taux_usd_eur, date_taux, cle_fiche)
  values (v_c, 'lecture', 'extraction', 'ex-' || p_marque, 'courriel', 'modele-' || p_marque, 0.01, 0.9, date '2026-11-01', v_f::text);
  insert into public.n8n_executions (workflow_id, workflow_nom, execution_id, resultat) values ('wf-' || p_marque, 'Lecture ' || p_marque, 'ex-' || p_marque, 'ok');
  insert into public.openrouter_cles_releves (cle_nom, depense_jour_eur) values ('cle-' || p_marque, 1);
  perform pg_temp.redevenir(v_role, v_qui);
  return query select v_four, v_ag, v_ch, v_f, v_f2, v_art, v_ref, v_c;
end $$;

-- La base retire le droit d'exécuter par défaut (007) : on le redonne aux aides des tests, et à elles seules.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to public', f.sig);
  end loop;
end $$;
