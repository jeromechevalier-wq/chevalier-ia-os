-- 16 : le catalogue de vente du futur Devis 0.2.0 (migration 014). Données INVENTÉES.
-- DB1 : familles sur deux niveaux (type au premier niveau, liste fermée, nom unique par parent).
-- DB2 : articles de vente (libellé normalisé, code unique par espace parmi les actifs, famille du même espace).
-- DB3 : unités de vente (forme normalisée rangée, liste fermée = liste_unites() + semaine et mois).
-- DB4 : droits (porte écrit ; robot_reflets et indicateurs lisent seulement), état après le 2e passage des migrations.
-- DB5 : extension pg_trgm et index trigramme sur libelle_normalise.
-- En plus : isolement entre les espaces A et B, unicité par espace, pas de suppression.
\ir aides.inc

-- DB4 : les droits, après le 2e passage des migrations (tester.js les joue deux fois).
do $$
declare t text; r text; d text; v text := '';
begin
  foreach t in array array['familles_articles', 'articles_vente'] loop
    foreach r in array array['porte', 'robot_reflets', 'indicateurs'] loop
      foreach d in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, ('public.' || t)::regclass, d)
           is distinct from (d = 'SELECT' or (r = 'porte' and d in ('INSERT', 'UPDATE'))) then
          v := v || format(' %s/%s/%s', t, r, d);
        end if;
      end loop;
    end loop;
  end loop;
  if v <> '' then raise exception 'DB4 : droits faux sur le catalogue de vente :%', v; end if;
  -- Les fonctions neuves se lancent par les trois rôles (les contraintes et les déclencheurs les appellent).
  foreach t in array array['liste_types_article()', 'liste_unites_vente()', 'normaliser_unite_vente(text)',
                           'familles_articles_deux_niveaux()', 'articles_vente_unite()'] loop
    foreach r in array array['porte', 'robot_reflets', 'indicateurs'] loop
      if not has_function_privilege(r, ('public.' || t)::regprocedure, 'execute') then
        raise exception 'DB4 : % ne peut pas lancer %', r, t;
      end if;
    end loop;
  end loop;
end $$;

-- DB5 : l'extension et l'index trigramme.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    raise exception 'DB5 : l''extension pg_trgm n''est pas installée';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'articles_vente'
                   and indexname = 'articles_vente_libelle_trgm' and indexdef ~ 'gin_trgm_ops') then
    raise exception 'DB5 : l''index trigramme articles_vente_libelle_trgm manque';
  end if;
end $$;

-- DB3 : les unités de vente (fonctions).
do $$
begin
  perform pg_temp.egal(public.normaliser_unite_vente('ensemble'), 'ens', 'DB3 : ensemble -> ens');
  perform pg_temp.egal(public.normaliser_unite_vente('Ensemble'), 'ens', 'DB3 : Ensemble -> ens');
  perform pg_temp.egal(public.normaliser_unite_vente('m²'), 'm2', 'DB3 : m² -> m2');
  perform pg_temp.egal(public.normaliser_unite_vente('m³'), 'm3', 'DB3 : m³ -> m3');
  perform pg_temp.egal(public.normaliser_unite_vente('L'), 'l', 'DB3 : L -> l');
  perform pg_temp.egal(public.normaliser_unite_vente('pièce'), 'u', 'DB3 : pièce -> u');
  perform pg_temp.egal(public.normaliser_unite_vente(''), null::text, 'DB3 : vide -> null');
  perform pg_temp.egal(public.normaliser_unite_vente(null), null::text, 'DB3 : null -> null');
  -- normaliser_unite n'a pas changé (elle sert à des colonnes calculées et stockées).
  perform pg_temp.egal(public.normaliser_unite('ensemble'), 'ensemble', 'DB3 : normaliser_unite inchangée');
  perform pg_temp.egal(public.liste_unites_vente(), public.liste_unites() || array['semaine', 'mois']::text[], 'DB3 : liste des unités de vente');
  -- Toutes les unités proposées par l'écran du devis (UNITES_PROPOSEES, js/modules/devis/articles.js) entrent dans la liste.
  perform pg_temp.egal((select array_agg(u) from unnest(array['u', 'm', 'm²', 'm³', 'ml', 'h', 'jour', 'semaine', 'mois', 'forfait', 'lot', 'kg', 't', 'L', 'paire', 'ensemble']) u
                         where not (public.normaliser_unite_vente(u) = any (public.liste_unites_vente()))), null::text[], 'DB3 : unités de l''écran hors liste');
  perform pg_temp.egal(public.liste_types_article(),
                       array['fourniture', 'main_oeuvre', 'ouvrage', 'sous_traitance', 'materiel', 'divers', 'texte']::text[], 'DB1 : types d''article');
end $$;

-- Les écritures, sous le rôle de la porte, dans deux espaces.
set role porte;
do $$
declare v_f1 uuid; v_s1 uuid; v_s2 uuid; v_fb uuid; v_a1 uuid; v_a2 uuid; v_n int;
begin
  -- Espace B d'abord (pour vérifier l'isolement depuis A).
  perform pg_temp.entrer('espace-b', 'bob@exemple.test');
  insert into public.familles_articles (nom, type) values ('Fournitures MARQB', 'fourniture') returning id into v_fb;
  insert into public.articles_vente (libelle, unite, prix_achat, code, famille_id) values ('Ciment MARQB', 'sac', 10, 'CIM-1', v_fb);
  create temp table famille_b as select v_fb as id;

  perform pg_temp.entrer('espace-a', 'alice@exemple.test');
  -- DB1 : deux niveaux.
  insert into public.familles_articles (nom, type, cle_depart) values ('Fournitures', 'fourniture', 'famille-1') returning id into v_f1;
  insert into public.familles_articles (nom, parent_id, cle_depart) values ('Carrelage', v_f1, 'famille-1-2') returning id into v_s1;
  insert into public.familles_articles (nom, parent_id) values ('Peinture', v_f1) returning id into v_s2;
  perform pg_temp.doit_echouer(format('insert into public.familles_articles (nom, parent_id) values (''Faïence'', %L)', v_s1), 'famille_deux_niveaux');
  perform pg_temp.doit_echouer(format('update public.familles_articles set parent_id = %L where id = %L', v_s1, v_s2), 'famille_deux_niveaux');
  perform pg_temp.doit_echouer(format('update public.familles_articles set parent_id = %L where id = %L', v_s2, v_f1), 'famille_deux_niveaux');
  insert into public.familles_articles (nom) values ('Seule') returning id into v_a1;
  perform pg_temp.doit_echouer(format('update public.familles_articles set parent_id = id where id = %L', v_a1), 'MESSAGE:familles_articles_pas_son_parent');
  -- DB1 : le type seulement au premier niveau, et dans la liste fermée.
  perform pg_temp.doit_echouer(format('insert into public.familles_articles (nom, parent_id, type) values (''Joints'', %L, ''fourniture'')', v_f1),
                               'MESSAGE:familles_articles_type_premier_niveau');
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom, type) values (''Bizarre'', ''zorglub'')', 'MESSAGE:familles_articles_type_liste');
  -- DB1 : un nom par parent (sans accents ni casse) ; le même nom ailleurs est permis.
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom) values (''FOURNITURES'')', 'MESSAGE:familles_articles_nom_unique');
  perform pg_temp.doit_echouer(format('insert into public.familles_articles (nom, parent_id) values (''carrelage'', %L)', v_f1), 'MESSAGE:familles_articles_nom_unique');
  insert into public.familles_articles (nom) values ('Carrelage');   -- même nom, mais au premier niveau
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom, cle_depart) values (''Autre'', ''famille-1'')', 'MESSAGE:familles_articles_cle_depart_unique');
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom, cle_depart) values (''Autre'', ''ma-famille'')', 'MESSAGE:check constraint');
  -- Isolement (DB1) : une famille de B n'est pas un parent possible depuis A.
  perform pg_temp.doit_echouer(format('insert into public.familles_articles (nom, parent_id) values (''Vol'', %L)', v_fb), 'MESSAGE:violates foreign key constraint');

  -- DB2 : un article ; libellé normalisé ; famille du même espace.
  insert into public.articles_vente (libelle, unite, prix_achat, code, taux_tva, marge, reference, marque, famille_id, url_source)
  values ('Carrelage Grès Cérame 60 x 60', 'm²', 25.5, 'Car-60', 20, 25, 'GC60', 'Marque A', v_s1, 'https://exemple.test/produit/gc60')
  returning id into v_a1;
  perform pg_temp.egal((select libelle_normalise from public.articles_vente where id = v_a1), 'carrelage gres cerame 60 x 60', 'DB2 : libellé normalisé');
  perform pg_temp.egal((select code_normalise from public.articles_vente where id = v_a1), 'car 60', 'DB2 : code normalisé');
  perform pg_temp.doit_echouer(format('insert into public.articles_vente (libelle, unite, famille_id) values (''Vol'', ''u'', %L)', v_fb), 'MESSAGE:violates foreign key constraint');
  -- DB2 : code unique parmi les actifs de l'espace (sans accents ni casse) ; un article désactivé libère son code.
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite, code) values (''Autre'', ''u'', ''CAR 60'')', 'MESSAGE:articles_vente_code_unique');
  insert into public.articles_vente (libelle, unite) values ('Sans code 1', 'u');
  insert into public.articles_vente (libelle, unite) values ('Sans code 2', 'u');   -- le code est facultatif
  update public.articles_vente set actif = false where id = v_a1;
  insert into public.articles_vente (libelle, unite, code) values ('Carrelage nouveau', 'm2', 'car-60') returning id into v_a2;
  perform pg_temp.doit_echouer(format('update public.articles_vente set actif = true where id = %L', v_a1), 'MESSAGE:articles_vente_code_unique');
  -- Unicité par espace : le code de B (CIM-1) est libre dans A.
  insert into public.articles_vente (libelle, unite, code) values ('Ciment', 'sac', 'cim-1');
  -- DB2 : les gardes des valeurs.
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite, type) values (''X'', ''u'', ''zorglub'')', 'MESSAGE:articles_vente_type_liste');
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite, prix_achat) values (''X'', ''u'', 1.234)', 'MESSAGE:check constraint');
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite, prix_achat) values (''X'', ''u'', -1)', 'MESSAGE:check constraint');
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite, type, prix_achat) values (''X'', ''u'', ''ouvrage'', 10)', 'MESSAGE:articles_vente_ouvrage_sans_prix_achat');
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, url_source, unite) values (''X'', ''javascript:alert(1)'', ''u'')', 'MESSAGE:check constraint');
  insert into public.articles_vente (libelle, type) values ('Conditions générales', 'texte');   -- une ligne de texte n'a pas d'unité
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, type) values (''Sans unité'', ''fourniture'')', 'MESSAGE:articles_vente_unite_obligatoire');

  -- DB3 : l'unité est rangée sous sa forme normalisée ; hors liste = refusée.
  perform pg_temp.egal((select unite from public.articles_vente where id = v_a1), 'm2', 'DB3 : m² rangé m2');
  update public.articles_vente set unite = 'Ensemble' where id = v_a2;
  perform pg_temp.egal((select unite from public.articles_vente where id = v_a2), 'ens', 'DB3 : Ensemble rangé ens');
  update public.articles_vente set unite = 'semaine' where id = v_a2;
  update public.articles_vente set unite = 'mois' where id = v_a2;
  update public.articles_vente set unite = 'L' where id = v_a2;
  perform pg_temp.egal((select unite from public.articles_vente where id = v_a2), 'l', 'DB3 : L rangé l');
  perform pg_temp.doit_echouer(format('update public.articles_vente set unite = ''zorglub'' where id = %L', v_a2), 'MESSAGE:articles_vente_unite_liste');

  -- Isolement : depuis A, rien de B.
  select count(*) into v_n from public.articles_vente t where t::text ~ 'MARQB';
  perform pg_temp.egal(v_n, 0, 'isolement : article de B vu depuis A');
  select count(*) into v_n from public.familles_articles t where t::text ~ 'MARQB';
  perform pg_temp.egal(v_n, 0, 'isolement : famille de B vue depuis A');
  update public.familles_articles set nom = 'Volé' where id = (select id from famille_b);
  get diagnostics v_n = row_count;
  perform pg_temp.egal(v_n, 0, 'isolement : famille de B modifiée depuis A');
  perform pg_temp.doit_echouer(format('update public.articles_vente set espace_id = ''espace-b'' where id = %L', v_a2), 'espace_fige');

  -- Jamais de suppression : on désactive ou on archive.
  perform pg_temp.doit_echouer(format('delete from public.articles_vente where id = %L', v_a2), null);
  perform pg_temp.doit_echouer(format('delete from public.familles_articles where id = %L', v_s2), null);

  -- Le journal garde l'avant / après.
  perform pg_temp.egal((select count(*)::int from public.journal_modifications where table_nom = 'articles_vente' and enregistrement_id = v_a2) >= 2, true,
                       'journal des articles de vente');

  -- DB5 : la recherche approchée marche sous le rôle de la porte (fautes de frappe).
  perform pg_temp.egal((select id from public.articles_vente order by public.similarity(libelle_normalise, 'carelage gres cerame 60x60') desc limit 1), v_a1,
                       'DB5 : recherche approchée');
end $$;
reset role;

-- Le Pilotage (indicateurs) lit le catalogue de son espace.
set role indicateurs;
select pg_temp.entrer('espace-a', 'alice@exemple.test');
do $$
begin
  perform pg_temp.egal((select count(*)::int from public.articles_vente) > 0, true, 'DB4 : indicateurs lit les articles');
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom) values (''Par le Pilotage'')', 'MESSAGE:permission denied');
end $$;
reset role;

-- DB4 : n8n (robot_reflets) lit, mais n'écrit pas dans le catalogue de vente.
set role robot_reflets;
select pg_temp.entrer('espace-a', 'n8n');
do $$
begin
  perform pg_temp.egal((select count(*)::int from public.familles_articles) > 0, true, 'DB4 : le robot lit les familles');
  perform pg_temp.egal((select count(*)::int from public.articles_vente) > 0, true, 'DB4 : le robot lit les articles');
  perform pg_temp.doit_echouer('insert into public.articles_vente (libelle, unite) values (''Par n8n'', ''u'')', 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer('insert into public.familles_articles (nom) values (''Par n8n'')', 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer('update public.articles_vente set libelle = ''Changé par n8n''', 'MESSAGE:permission denied');
  perform pg_temp.doit_echouer('update public.familles_articles set nom = ''Changé par n8n''', 'MESSAGE:permission denied');
end $$;
reset role;
