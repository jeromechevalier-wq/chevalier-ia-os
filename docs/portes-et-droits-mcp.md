# MCP : qui entre par quelle porte, et avec quels droits

Écrit le 18/10/2026 pour Jérôme. Page de départ : elle explique les idées en simple et renvoie vers les pages de détail. Aucun secret ici.

## Deux mots à ne pas mélanger

- **La porte** : comment on prouve qui on est pour entrer. C'est **OAuth** ou un **jeton**.
- **Les droits** : ce qu'on a le droit de faire une fois entré. C'est le **profil** (lecteur, éditeur, « claude-code »).

**OAuth** : on clique « Se connecter avec Google » sur un écran. Google confirme que c'est bien la personne, puis l'assistant (Claude, bientôt ChatGPT) reçoit une clé temporaire (1 heure, renouvelée toute seule, 30 jours glissants). C'est le clic sur « Autoriser » qui protège l'accès.

**Jeton** (`cia_…`) : un long mot de passe secret, écrit une fois dans un réglage. Il sert aux programmes qui ne peuvent pas cliquer sur un bouton Google : Claude Code sur le Mac, Hermes sur le VPS, les scripts. **Décision ferme de Jérôme (17/10/2026) : les jetons du CRM sont gardés.** Ils sont recensés dans le « Registre des clés et échéances » du second cerveau (ligne `MCP_JETONS`).

## Qui entre par quelle porte

| | OAuth (clic Google) | Jeton (mot de passe long) |
|---|---|---|
| **Plateforme clients** (Ingrid, etc.) | Oui : Claude aujourd'hui ; ChatGPT prévu | Non, jamais |
| **CRM de Jérôme** | Oui : Claude aujourd'hui ; ChatGPT prévu. Seulement les deux comptes Google de Jérôme | Oui : Claude Code et les programmes |

Les deux serveurs sont séparés : le CRM est sur `https://chevalier-ia-os.web.app/mcp` (projet Firebase `chevalier-ia-os`), la plateforme clients sur `https://chevalier-ia-app.web.app/mcp/<client>` (projet `chevalier-ia-app`).

## Les droits, une fois entré

| Qui | Lire | Écrire | Supprimer et restaurer |
|---|---|---|---|
| Client **lecteur** | oui | non | non |
| Client **éditeur** (décidé le 17/10/2026) | oui | oui | oui, dans son espace seulement |
| **Jérôme**, par Claude (OAuth) | oui | oui | oui |
| **Jérôme**, par ChatGPT (**prévu**) | oui | oui | oui |
| **Claude Code** (jeton `claude-code-jerome`) | oui | oui | oui |
| **Hermes** (jeton « bibliothécaire ») | oui | oui | non |

Chaque client ne voit et ne touche que **son** espace : l'identifiant du client est lu dans l'adresse, jamais dans ce que l'assistant envoie. Les suppressions sont journalisées dans l'audit et restaurables (outil `restaurer_depuis_audit`) ; plafond de **50 suppressions par jour** et par connexion, compté **par document supprimé** (supprimer une personne avec 30 notes en compte 31 ; une restauration qui supprime compte aussi).

**Double confirmation des suppressions** (tous les outils `supprimer_*`) : le premier appel ne supprime **rien** ; il rend un **aperçu** (nombre de fiches par type, les 10 premiers noms, « et N autres ») et un **code à usage unique, valable 5 minutes**. L'assistant doit te montrer l'aperçu, puis rappeler l'outil avec ce code pour supprimer vraiment. Si le contenu a changé entre-temps, ou si le code est périmé ou déjà servi, il faut recommencer l'aperçu. Si la suppression dépasserait le plafond restant du jour, l'aperçu le dit et ne donne pas de code. **Limite honnête** : le code revient dans la même réponse que l'aperçu ; il garantit un appel **en deux temps**, pas l'accord d'un humain. La vraie porte humaine est la permission **« demander »** par outil, dans Claude et dans ChatGPT (voir plus bas). Après la suppression, la réponse rappelle l'essentiel ; le détail complet est dans l'audit (`lire_audit` avec l'`operationId`). À noter : chez un client, le profil interne s'appelle `claude-code` (c'est celui du rôle éditeur, voir `functions/src/mcp/outils/suppression.js`, première ligne).

## Première connexion, outils manquants ou mal classés

Claude et ChatGPT classent les outils d'après leurs **annotations** (lecture seule / destructif), que le serveur envoie maintenant pour chaque outil. Mais ils gardent aussi une liste ancienne des outils. Après une mise à jour du serveur :

- **Claude** : ouvrir une **nouvelle conversation**, puis vérifier les **permissions par outil** dans les réglages du connecteur (les outils de lecture se règlent sur « autoriser », ceux de suppression restent sur « demander »).
- **ChatGPT** : sur la page du connecteur, bouton **« Actualiser les outils »** en bas de la page, après chaque mise à jour du serveur.
- Le nom du serveur affiché chez un client est neutre (`espace-client`) ; celui de ton CRM reste `chevalier-ia-os`.

## Où en est ChatGPT (18/10/2026)

- **Plateforme clients** : le code accepte déjà les adresses de retour de ChatGPT et l'enregistrement dynamique. **Jamais essayé avec un vrai ChatGPT.**
- **CRM de Jérôme** : refuse encore ChatGPT (adresses de retour, enregistrement). Chantier prévu, avec la page de consentement qui affichera l'identifiant du connecteur pour repérer un faux lien.
- **Le risque à connaître** : avec OAuth, un pirate peut envoyer un faux lien pour faire autoriser *son* connecteur. Le risque est le même avec Claude. La parade : lire l'identifiant affiché avant de cliquer « Autoriser ». Option plus forte, à décider plus tard : une liste des seuls connecteurs ChatGPT autorisés.

## Pour aller plus loin

- Connexion Google du CRM, couper l'accès du téléphone : [mcp-oauth.md](mcp-oauth.md).
- Jetons, profils, plafonds, interrupteurs d'urgence : [securite-et-pannes.md](securite-et-pannes.md).
- Brancher Claude Code ou Hermes avec un jeton : [branchement-mcp.md](branchement-mcp.md).
- MCP des espaces clients : [mcp-clients.md](mcp-clients.md).
