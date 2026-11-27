# Schéma du déploiement : de GitHub aux sites en ligne

Écrit le 27/11/2026 à la demande de Jérôme. Vue d'ensemble en une page ; le détail est dans `deploiement-plateforme.md`, `deploiement-client.md` et `page-deploiement.md`.

```
                         GitHub (branche main)
                                 │
         ┌───────────────────────┼────────────────────────┐
         ▼                       ▼                        ▼
 ① Chevalier IA OS        ② Plateforme clients      ③ Une maison
    (CRM de Jérôme)          (Chevalier IA App)        (espace sur son
                                                        propre projet)
         │                       │                        │
   AUTOMATIQUE              MANUEL (1 bouton)         MANUEL (Mac)
   à chaque fusion          workflow GitHub           commande lancée
   d'une PR                 « Déploiement             sur le Mac
   (site + fonctions)       plateforme clients »      (pas encore de
   règles : workflow        lancé par Jérôme          workflow GitHub)
   « Publier les règles
   (CRM de Jérôme) »
         │                       │                        │
         ▼                       ▼                        ▼
 Projet Google            Projet Google             Projet Google
 chevalier-ia-os          chevalier-ia-app          chevalier-ia-<maison>
         │                       │                        │
         ▼                       ▼                        ▼
 chevalier-ia-os.web.app  chevalier-ia-app.web.app  chevalier-ia-<maison>.web.app
```

| | Comment ça part | Qui déclenche | Sans le Mac ? |
|---|---|---|---|
| ① CRM de Jérôme | Tout seul à la fusion d'une PR ; règles par le workflow « Publier les règles (CRM de Jérôme) » | Automatique (règles : Claude, autorisation permanente) | Oui |
| ② Plateforme clients | Workflow manuel « Déploiement plateforme clients » | Jérôme (ou Claude avec son accord) | Oui |
| ③ Maison | `firebase-tools` sur le Mac, photos de connexion ajoutées au passage | Claude avec l'accord de Jérôme | **Pas encore** (à faire : `.github/A-FAIRE.md`) |

Règle du 27/11/2026 (`CLAUDE.md`) : tout doit pouvoir se publier depuis GitHub seul, et aucun contrôle ne bloque une publication d'urgence. Les adresses `*.web.app` sont les adresses Firebase de base ; un nom de domaine peut y mener en plus (non vérifié ici). La liste des maisons et de leurs projets est dans le second cerveau (fiche « Chevalier IA OS - accès et outils de Claude »), pas dans ce dépôt public.
