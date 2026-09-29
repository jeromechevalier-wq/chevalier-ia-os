# Chevalier IA OS, CRM : décisions de l'entretien (en cours)

Mis à jour le 29/09/2026. Sert de mémoire pour rédiger le cahier des charges final.

## Bloc 1. Usage et objectifs
1. But : ne perdre aucun prospect, ne rater aucune relance ; outil beau et agréable, DA chevalier-ia.fr, Kanban animé, graphiques, gamification (feux d'artifice, compteurs qui défilent), présence de Charles.
2. Utilisateurs : Jérôme (jerome.chevalier@gmail.com) au quotidien sur Mac, téléphone de temps en temps ; second compte jeromebot.chevalierbot@gmail.com = Charles, l'assistant IA (robot corail, assets/charles-portrait.png). Nom affiché "Jérôme" et "Charles" dans l'appli.
3. Rythme : le matin (À faire aujourd'hui), après chaque échange, revue hebdomadaire. Succès à 3 mois : beaucoup de prospects et des cartes qui avancent dans le Kanban.
4. Page d'accueil : 4 ou 5 objectifs avec barres de progression en couleur, cibles modifiables dans l'appli (à définir au Bloc 5). Un objectif portera sur le nombre d'interviews JTBD réalisées.
5. Notes vocales après rencontre : V1 = dictée clavier iPhone dans "Notes rapides" ; V2 = enregistrement audio transcrit et résumé par n8n, audio rangé dans Google Drive.

## Bloc 2. Champs
1. Une fiche par personne. Rôles à choix multiple : Prospect, Partenaire, Interviewé JTBD. Champ Date de l'interview JTBD (vide = non faite). JTBD n'est pas une offre.
2. Champs : prénom et nom (obligatoire), entreprise, secteur (liste modifiable), taille (facultatif), ville, téléphone, email, site web, LinkedIn, source (liste modifiable), étape, date d'entrée dans l'étape (auto), priorité (Chaud, Tiède, Froid), besoin identifié, offre envisagée, durée en jours (demi journées possibles), montant estimé (facultatif), date du premier contact, date du dernier échange (auto), prochaine action et sa date, documents (liens Drive), raison si perdu, opposition à la prospection, créé et modifié le et par (auto).
3. Offres : catalogue géré dans l'appli (ajouter, renommer, archiver). Départ : Audit, Accompagnement.
4. Trois zones de notes séparées : Notes (grand texte libre façon Notion, géré uniquement par Jérôme) ; Notes rapides (dictées, datées, supprimables ou copiables dans Notes) ; Historique automatique (replié, discret).
5. Champs personnalisés ajoutables dans les réglages (texte, nombre, date, liste, case à cocher) en V1 ; filtre sur ces champs en V2.

## Bloc 3. Pipeline
1. Étapes du Kanban : Premier contact, Rendez vous fixé, Proposition envoyée, Gagné, Facture envoyée, Facture payée. Une fiche en Facture payée disparaît du Kanban (reste dans la liste et les statistiques).
2. Les fiches JTBD restent en Premier contact.
3. Sorties Perdu (avec raison) et Pas maintenant (avec date de réveil) : proposées par défaut, non contestées.
4. Alerte : pas de durée par étape. Une fiche est en alerte quand la date de prochaine action, fixée à la main par Jérôme, est dépassée.
5. Retour en arrière par glisser déposer : oui.

## DA déjà relevée
1. Thème sombre par défaut, menu latéral repliable façon console Firebase.
2. Couleurs styles.css : ink #29292c, ink2 #36353a, paper #f5f5f3, warm #efeee9, line #dcdcd6, yellow #ecbc06, purple #341363, muted #69696d ; lilas #e3cdee (tally-merci.html).
3. Polices locales du site : Poppins 500/700, Be Vietnam Pro 400/500/600/700 (assets/fonts).
4. Célébrations dans l'esprit de tally-merci.html : fond radial violet, Charles qui flotte entre deux orbites, feu d'artifice en canvas (jaune, jaune clair, lilas, blanc, violet clair).
5. Leçon du site (LECONS-DEPLOIEMENT.md) : attention au cache après déploiement ; prévoir un service worker versionné qui propose "Nouvelle version disponible".

## Bloc 4. Tâches et rappels
1. Une seule prochaine action par fiche (texte + date), fixée par Jérôme. Boutons de date rapide : Demain, +3 jours, +1 semaine, +2 semaines, date précise.
2. Suggestions douces au changement d'étape (préremplies, ignorables) : Proposition envoyée => "Relancer la proposition" à +3 jours ; Gagné => "Envoyer la facture" aujourd'hui ; Facture envoyée => "Vérifier le paiement" à l'échéance (délai par défaut 30 jours, hypothèse, réglable).
3. Écran "À faire aujourd'hui" : En retard (rouge), Aujourd'hui, Sans action prévue ; félicitations de Charles quand tout est fait.
4. Aucun rappel hors de l'appli, aucune automatisation en V1 (plus tard).
5. Tâches confiées à Charles : plus tard.

## Bloc 5. Objectifs, filtres, vues
1. Objectifs mensuels : 10 interviews JTBD réalisées ; 10 nouveaux contacts ajoutés ; 4 rendez vous tenus ; 3 propositions envoyées ; 1 000 € de chiffre d'affaires encaissé (factures payées). Cibles modifiables dans l'appli.
2. Objectifs extensibles : un jour d'autres objectifs dont la donnée ne vient pas du CRM (ex : nombre de flyers distribués). Prévoir des objectifs "calculés" et des objectifs "saisis à la main".
3. Filtres combinables : étape, rôle, source, secteur, ville, priorité, offre, en retard, sans action prévue, interview JTBD faite ou non. Recherche : nom, entreprise, ville, notes.
4. Filtres enregistrés : À relancer cette semaine, Chauds, Réseau entrepreneuses, Interviews JTBD à faire ; tous modifiables, supprimables, et création des siens.
5. Vues : Accueil (objectifs + à faire : en retard, aujourd'hui, sans action + statistiques), Kanban, Liste. Accueil et Statistiques fusionnés ; À faire aujourd'hui intégré à l'accueil.
6. Objectif manuel dès la V1 : 100 flyers distribués par mois (saisie manuelle, boutons +1 / +10).
7. Rendez vous : champ date du rendez vous + case à cocher "Rendez vous tenu" (compte pour l'objectif) ; le compte rendu va dans le champ Notes.

## Bloc 6. Direction artistique
1. Reprendre la DA du site chevalier-ia.fr (couleurs, polices, logo, Charles). Thème : voir question en cours (sombre demandé plus tôt, clair = site).
2. Liste compacte sur ordinateur, aérée sur téléphone.
3. Étapes : Premier contact gris lilas ; Rendez vous fixé lilas ; Proposition envoyée violet clair ; Gagné jaune ; Facture envoyée corail (Charles) ; Facture payée vert.
4. Priorités : Chaud corail, Tiède jaune, Froid gris.
5. Icônes Lucide au trait fin.
6. Célébrations : Gagné = feu d'artifice + Charles ; facture payée = compteur CA qui défile + étincelles jaunes ; objectif atteint = feu d'artifice + "Objectif atteint" ; tâches du jour faites = petite animation de Charles. Écran de connexion façon tally-merci (fond radial violet, Charles, bouton Google).
7. Thème : sombre par défaut + thème clair (ambiance du site) via un bouton dans le menu, dès la V1.

## Bloc 7. Technique, sécurité, RGPD
1. Hors ligne : consultation et modification, via le cache persistant intégré à Firestore (faible risque ; dernière modification gagne en cas de conflit ; première connexion nécessite le réseau). Jérôme : seulement si peu risqué, non indispensable.
2. Sauvegarde : bouton Exporter en CSV en V1 ; sauvegarde automatique n8n plus tard.
3. Pas d'import en V1.
4. RGPD : signalement pour suppression après 3 ans sans échange ; bouton Supprimer définitivement ; case Opposition à la prospection désactive le bouton email.
5. Détection de nouvelle version : bandeau "Nouvelle version disponible, recharger".

## Bloc 8. Priorités
1. Champs personnalisés : supprimés (ni V1 ni V2).
2. Modèles d'email : repoussés en V2 ; V1 = bouton "Écrire un email" qui ouvre Apple Mail avec l'adresse du prospect.
3. Classement V1 / V2 / Plus tard validé pour le reste.
4. Protocole de test défini dès la conception, dans le cahier des charges (tests automatiques exécutés par l'IA avant livraison + recette manuelle courte pour Jérôme).

## Relecture finale (réduction du risque)
1. Supprimés ou repoussés : hors ligne avec modification (V2), service worker avec cache (abandonné, remplacé par version.json), taux de passage (abandonné), question automatique de rendez vous (abandonné), détection du retour d'Apple Mail (remplacé par bouton "Email envoyé"), signalement RGPD 3 ans (V2), réordonnancement des filtres (abandonné).
2. Ajout : rappel d'export CSV à l'Accueil si aucun export depuis 30 jours (sauvegarde mensuelle).
3. Construction en une seule fois, mais par étapes internes testées. Effort élevé choisi par Jérôme pour la construction.
