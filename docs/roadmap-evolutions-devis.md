# Roadmap : évolutions envisagées du module Devis

Tenu à jour avec Jérôme. Rien de ce tableau n'est décidé ni daté : c'est l'ordre dans lequel on a envie de le faire. Dernière mise à jour : 24/10/2026.

Colonne « Décision » : **retenu** (Jérôme le veut), **à voir** (idée à garder en tête), **écarté pour l'instant**.

| Priorité | Évolution | Pourquoi | Ce qu'il faut avant | Décision |
|---|---|---|---|---|
| 0 | **Reprise des données existantes du client pilote** : import du catalogue d'articles (Bordereau) et de tous les devis passés (gagnés, perdus, en attente) avec leur numéro d'origine, marqués « importé » et en lecture seule (non dupliquables : reçus en PDF, ils ne se rattachent pas au catalogue) ; les chiffres d'affaires mois par mois alimentent la table d'indicateurs ; les affaires correspondantes sont créées ou rattachées | L'outil arrive déjà rempli : pas de salle vide le premier jour ; le client pilote voit tous ses devis ensemble | Un export de son logiciel actuel (tableur, CSV, ou PDF à défaut) et une adresse Google pour le client ; étape ajoutée à la procédure de déploiement chez un client ; l'éditeur et la liste des devis (faits) ; la table d'indicateurs ; accord de Jérôme avant toute écriture sur les vraies données | retenu (Jérôme), à préparer avant la mise en service ; rendez-vous avec le client pilote lundi |
| 1 | **Page de consultation en ligne** : l'e-mail contient un lien vers notre serveur, le client voit son devis, clique « Accepter » ou « J'ai une question » | Rien à télécharger ; sert de base à tout ce qui suit | Le PDF et l'envoi par e-mail | retenu |
| 2 | **Question du client reçue par SMS** par l'artisan | Réponse rapide, sans ouvrir l'ordinateur | Page de consultation, service d'envoi de SMS | retenu |
| 3 | **Savoir si le client a ouvert le devis** (« consulté mardi 18 h ») | Relancer au bon moment | Page de consultation | retenu |
| 4 | **Relances automatiques** (ex. après 5 puis 12 jours sans réponse), modifiables par devis | Gain de temps, moins d'oublis | Savoir si le devis est ouvert, envoi d'e-mails | retenu |
| 5 | **Photos du chantier dans le devis** | Personnalise le devis, montre qu'on a regardé le problème | Dépôt de photos, gabarit PDF | retenu |
| 6 | **Pages de présentation dynamiques devant le tableau de chiffrage** (2 pages : l'entreprise, des photos). Au début : mêmes pages pour tous les devis, fournies en PDF ou en images. Ensuite : pages **générées selon le contexte du devis** (texte et photos choisis d'après les notes et comptes rendus de la fiche : on ne présente pas l'entreprise de la même façon pour l'étanchéité d'une souche de cheminée que pour le fond d'une piscine) | Belle première impression, très vendeur : pages dynamiques, pas statiques | Gabarit PDF prévu pour des pages facultatives avant le chiffrage ; réglages pour déposer le fichier ; pour la version dynamique : une clé API OpenRouter (à la charge de l'artisan ou de nous, à décider) pour générer le texte, et la fiche (notes, comptes rendus) comme matière | retenu, **pas développé pour l'instant** |
| 7 | **Signature électronique** en dernière page, via la page de consultation | Devis signé sans papier | Page de consultation, choix d'un service de signature | retenu, **pas développé pour l'instant** |
| 8 | **Lien de paiement Stripe pour l'acompte**, placé dans le corps de l'e-mail (pas dans le PDF) | Acompte payé en un clic | Envoi par e-mail, compte Stripe | retenu |
| 9 | **Facture d'acompte puis facture finale automatiques** à partir du devis signé | Prolongement du paiement | Module Facturation | à voir |
| 10 | **Demande d'avis après chantier** (lien vers la fiche Google, quelques jours après la fin) | Apporte les prochains clients | Fin de chantier connue | retenu |
| 11 | **Messages de suivi de chantier** (« les travaux démarrent lundi », « chantier terminé ») | Moins d'appels « où en est-on ? » | Chantier lié au devis signé | à voir |
| 12 | **Variantes vues côte à côte par le client** (option standard / haut de gamme) | Aide le client à choisir | Page de consultation | écarté pour l'instant |

| 13 | **Mise en place chez un nouveau client** | Le deuxième client ne doit pas être surpris | Fonctions activées client par client (code unique, interrupteurs dans la fiche de l'espace) ; numéro de version visible du module et message « Quoi de neuf » à chaque nouveauté ; dire franchement au deuxième client que le premier a des fonctions en avance | retenu |

## Autres sujets déjà notés (pas dans l'ordre ci-dessus)
Pilotage (tableaux de bord de ventes), stocks, tarifs fournisseurs, sous-familles, glisser-déposer des lignes, primes énergie / retenue de garantie / déchets dans l'éditeur, étiquettes, QR code, numérotation modifiable.

## Notes de Jérôme (24/10/2026)
- Les pages de présentation viennent **avant le tableau de chiffrage** ; la signature électronique est **en fin de PDF**. Ni l'un ni l'autre n'est développé pour l'instant : le gabarit PDF est seulement préparé pour les accueillir.
- Les pages de présentation seront plus tard **dynamiques**, générées d'après les notes et comptes rendus de la fiche (technique jugée faisable). Cela demandera un modèle de langage via une clé API OpenRouter (qui la fournit : le client pilote ou nous : à décider).
- Les photos du chantier dans le devis : idée très appréciée, elle personnalise fortement le devis.
- Lien Stripe d'acompte : dans le corps de l'e-mail, pas dans le PDF.
- Variantes côte à côte : bonne idée, probablement pas gardée.
- Retenues : page de consultation, SMS à l'artisan, suivi d'ouverture, relances, photos, demande d'avis, et plusieurs autres du tableau.

## Liens entre le devis et le reste de l'outil (à discuter avec Jérôme, 24/10/2026)
| Sujet | Proposition | Décision |
|---|---|---|
| Déplacer une affaire qui a un devis en brouillon | Tant qu'un brouillon existe, la carte est verrouillée avec un message qui dit pourquoi ; elle se libère quand le devis est finalisé | **retenu (Jérôme)** |
| Affaire vers devis | Bouton « Ouvrir le devis » sur la carte et dans la fiche de l'affaire (plusieurs devis : liste) | à faire |
| Devis vers affaire | Lien « Voir l'affaire » dans l'éditeur et dans la liste des devis | à faire |
| Indicateur « devis signé » | Le module Devis a sa propre table d'indicateurs (KPI), comme prévu pour chaque module ; le tableau de bord des affaires l'utilise : nombre et montant des devis signés | **retenu (Jérôme)** |
| Signature d'un devis | Passe l'affaire à l'étape « Gagnée » (proposé, confirmé par l'artisan) | à discuter |
| Montant de l'affaire | Se met à jour avec le devis signé (somme HT des devis acceptés, `montantDevisHt`, 29/10/2026) | fait, à valider par Jérôme |
| Journal de l'affaire | Chaque événement du devis (finalisé, envoyé, signé, refusé…) laisse une ligne dans l'historique de l'affaire | **retenu (Jérôme)** |
| Automatisations | Événements « devis envoyé / signé / refusé / expiré » utilisables comme déclencheurs (relances, message de félicitations). Le fonctionnement reste à définir, mais c'est à mettre en place | **retenu (Jérôme)**, méthode à trancher |
| Facturation | Le devis signé alimente la facture d'acompte et la facture finale | plus tard |
| Contrat d'entretien en fin de chantier | À la fin du chantier, un e-mail propose un contrat d'entretien ou un rappel annuel (rien à voir avec le module Maintenance, qui suit la maintenance technique des logiciels de Jérôme) | **retenu (Jérôme)** |
| Options de dernière minute (« order bump ») | Dans le devis, de petites options ajoutables à la dernière minute par le client (ex. traitement hydrofuge, nettoyage de fin de chantier) | idée de Jérôme, à définir |
| Perte de travail à l'écriture | Quitter l'éditeur avec des changements non enregistrés (menu Affaires compris) affiche toujours « ton travail n'est pas enregistré, quitter ? » | **retenu (Jérôme)** |
| Signature d'un devis et étape de l'affaire | Proposer à l'artisan de passer l'affaire à « Gagnée » (pas automatique) | recommandation de Claude, à confirmer |
| Ajouter un article en collant l'adresse d'une page produit (l'URL source est enregistrée sur l'article, champ `urlSource`) | Demandé le 24/10/2026 ; prix public TTC à valider en prix d'achat HT | À planifier |
| Outil MCP « générer le PDF d'un devis et le ranger dans Drive » (l'assistant ne peut pas imprimer : il faut la fonction serveur `devisPdf`, PR 235 en pause) | Demandé le 24/10/2026 | À planifier avec un Gotenberg commun à tous les clients |
| Remplacer Gotenberg par Chromium dans la fonction Firebase (`puppeteer-core` + `@sparticuz/chromium`) : 2 étapes par client au lieu de 7, même rendu que l'aperçu ; ajouter `gabaritVersion` sur le devis ; page dédiée « imprimer » qui deviendra le lien de consultation + Signer | Avis Fable du 24/10/2026 ; PR 235 en pause | À planifier |
| **Vocabulaire configurable par client** (affaire → vente, projet → chantier, partout, avec les accords en genre et en nombre) | Demandé le 24/10/2026, très important pour le client pilote ; plan et inventaire dans `docs/vocabulaire-configurable.md` ; remplacement fait dans une session dédiée | **retenu (Jérôme)**, session dédiée |
| Menu Options du devis : cases encore grisées « bientôt » (annexe photos, remises par ligne, stocks, numérotation personnalisée, date de visite préalable) | « Cacher le reste à facturer » est active depuis le 24/10/2026 ; les autres sont à décider avec Jérôme | À planifier |
| Document PDF : logo en haut à gauche, bloc client gris à droite, grand titre « Devis », bandeaux de couleur par section | Idée du 24/10/2026, brief non écrit | À planifier |
