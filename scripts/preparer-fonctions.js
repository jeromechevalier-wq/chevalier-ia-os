// Copie les règles métier de l'appli (js/modules/crm/logique.js, et js/modules/projets/logique.js pour les projets)
// dans functions/partage/ pour que le serveur MCP applique EXACTEMENT les mêmes règles que l'écran. Le déploiement n'envoie que le dossier functions/ : cette copie est faite avant chaque
// déploiement (« predeploy » de firebase.json) et avant chaque test, jamais commitée (functions/partage/ est ignoré par git).
// Aucune dépendance. Usage : node scripts/preparer-fonctions.js
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(racine, 'functions', 'partage');
mkdirSync(destination, { recursive: true });
copyFileSync(join(racine, 'js', 'modules', 'crm', 'logique.js'), join(destination, 'logique.js'));
console.log('functions/partage/logique.js mis à jour (copie exacte de js/modules/crm/logique.js)');

// Les règles des projets importent celles du CRM par `../crm/logique.js` ; dans functions/partage/, elles sont côte à côte.
const IMPORT_CRM = "from '../crm/logique.js'";
const projets = readFileSync(join(racine, 'js', 'modules', 'projets', 'logique.js'), 'utf8');
if (!projets.includes(IMPORT_CRM)) throw new Error('js/modules/projets/logique.js : import du CRM introuvable');
writeFileSync(join(destination, 'projets.js'), projets.replaceAll(IMPORT_CRM, "from './logique.js'"));
console.log("functions/partage/projets.js mis à jour (copie de js/modules/projets/logique.js, import du CRM réécrit)");

// Module Devis : les calculs (js/modules/devis/logique.js) et le bordereau (articles.js) sont les mêmes pour l'écran et pour les outils de l'assistant.
// Dans functions/partage/ : devis.js (calculs), devis-articles.js (bordereau) ; leurs imports du CRM (`../crm/logique.js`) pointent vers logique.js, côte à côte.
const devisLogique = readFileSync(join(racine, 'js', 'modules', 'devis', 'logique.js'), 'utf8');
const devisArticles = readFileSync(join(racine, 'js', 'modules', 'devis', 'articles.js'), 'utf8');
for (const [nom, source] of [['logique.js', devisLogique], ['articles.js', devisArticles]]) {
  if (!source.includes(IMPORT_CRM)) throw new Error(`js/modules/devis/${nom} : import du CRM introuvable`);
}
writeFileSync(join(destination, 'devis.js'), devisLogique.replaceAll(IMPORT_CRM, "from './logique.js'"));
// Dans articles.js : d'abord l'import des calculs du Devis (./logique.js -> ./devis.js), ensuite celui du CRM (../crm/logique.js -> ./logique.js).
// Les ouvrages (ouvrages.js) importent seulement les calculs du Devis : copie devis-ouvrages.js ; articles.js l'importe sous ce nom.
const devisOuvrages = readFileSync(join(racine, 'js', 'modules', 'devis', 'ouvrages.js'), 'utf8');
writeFileSync(join(destination, 'devis-ouvrages.js'), devisOuvrages.replaceAll("from './logique.js'", "from './devis.js'"));
// Les familles (familles.js) n'importent rien : copie telle quelle sous le nom devis-familles.js.
writeFileSync(join(destination, 'devis-familles.js'), readFileSync(join(racine, 'js', 'modules', 'devis', 'familles.js'), 'utf8'));
writeFileSync(join(destination, 'devis-articles.js'), devisArticles.replaceAll("from './logique.js'", "from './devis.js'").replaceAll("from './ouvrages.js'", "from './devis-ouvrages.js'").replaceAll("from './familles.js'", "from './devis-familles.js'").replaceAll(IMPORT_CRM, "from './logique.js'"));
// Le document imprimable du devis (document.js) n'importe que les calculs du Devis : copie devis-document.js, utilisée par la fonction devisPdf.
writeFileSync(join(destination, 'devis-document.js'), readFileSync(join(racine, 'js', 'modules', 'devis', 'document.js'), 'utf8').replaceAll("from './logique.js'", "from './devis.js'"));
console.log('functions/partage/devis.js, devis-ouvrages.js et devis-articles.js mis à jour (copies de js/modules/devis/, imports réécrits)');

// Message et objet par défaut de l'e-mail d'un devis (email-brouillon.js, fichier pur) : le serveur (action de porte `devis.lireEmail`) calcule le MÊME texte que l'écran.
// Son seul import est celui des calculs du Devis (./logique.js -> ./devis.js).
writeFileSync(join(destination, 'devis-email.js'), readFileSync(join(racine, 'js', 'modules', 'devis', 'email-brouillon.js'), 'utf8').replaceAll("from './logique.js'", "from './devis.js'"));
console.log('functions/partage/devis-email.js mis à jour (copie de js/modules/devis/email-brouillon.js, import réécrit)');

// Brouillons (plans d'écriture) et logique de l'éditeur (ligne copiée d'un article) : utilisés par les outils MCP du Devis (creer_devis_brouillon, modifier_devis_brouillon).
// Mêmes règles d'import : ./logique.js (calculs) -> ./devis.js d'abord, puis ../crm/logique.js -> ./logique.js.
const devisBrouillon = readFileSync(join(racine, 'js', 'modules', 'devis', 'brouillon.js'), 'utf8');
const devisEditeur = readFileSync(join(racine, 'js', 'modules', 'devis', 'editeur-logique.js'), 'utf8');
if (!devisBrouillon.includes(IMPORT_CRM)) throw new Error('js/modules/devis/brouillon.js : import du CRM introuvable');
writeFileSync(join(destination, 'devis-brouillon.js'), devisBrouillon.replaceAll("from './logique.js'", "from './devis.js'").replaceAll(IMPORT_CRM, "from './logique.js'"));
writeFileSync(join(destination, 'devis-editeur.js'), devisEditeur.replaceAll("from './logique.js'", "from './devis.js'").replaceAll("from './ouvrages.js'", "from './devis-ouvrages.js'").replaceAll("from './articles.js'", "from './devis-articles.js'"));
console.log('functions/partage/devis-brouillon.js et devis-editeur.js mis à jour (copies de js/modules/devis/, imports réécrits)');

// La porte des workflows n8n (scripts/porte/) : la logique (clés, contrôles, actions de la veille, accès Firestore, lecteur n8n) est copiée telle quelle,
// sans l'outil en ligne de commande (outil.js), qui reste sur le Mac de Jérôme. Même principe : un seul exemplaire du code, testé, utilisé par la fonction.
const FICHIERS_PORTE = ['cles.js', 'validation.js', 'actions-veille.js', 'n8n.js', 'adaptateur.js', 'porte.js', 'cles-tableau.js', 'actions-tableaudebord.js', 'porte-tableau.js', 'saisie-tableaudebord.js', 'actions-automatisations.js', 'actions-devis.js'];
const destinationPorte = join(destination, 'porte');
mkdirSync(destinationPorte, { recursive: true });
// actions-automatisations.js importe le fichier pur des propositions par son chemin dans le dépôt ; dans functions/partage/ il est un dossier plus haut.
const IMPORT_PROPOSITIONS = "from '../../js/modules/automatisations/propositions.js'";
for (const f of FICHIERS_PORTE) {
  if (f !== 'actions-automatisations.js') { copyFileSync(join(racine, 'scripts', 'porte', f), join(destinationPorte, f)); continue; }
  const source = readFileSync(join(racine, 'scripts', 'porte', f), 'utf8');
  if (!source.includes(IMPORT_PROPOSITIONS)) throw new Error('scripts/porte/actions-automatisations.js : import des propositions introuvable');
  writeFileSync(join(destinationPorte, f), source.replaceAll(IMPORT_PROPOSITIONS, "from '../propositions.js'"));
}
console.log(`functions/partage/porte/ mis à jour (${FICHIERS_PORTE.length} fichiers copiés de scripts/porte/)`);

// Le lien YouTube collé à la main (reconnaissance d'un épisode ou d'une chaîne, lecture du flux) : écrit une seule fois pour l'écran et pour le serveur.
copyFileSync(join(racine, 'js', 'modules', 'veille', 'lien.js'), join(destination, 'veille-lien.js'));
console.log('functions/partage/veille-lien.js mis à jour (copie exacte de js/modules/veille/lien.js)');
// Le MCP des clients (functions/src/clients/) lit le registre des modules (modules actifs d'un client, outils de chaque module), les règles de la fiche de marque
// (couleurs de l'écran d'autorisation) et les rôles des membres : mêmes fichiers que l'appli, copiés à plat dans functions/partage/ (aucun n'importe autre chose que ses voisins).
for (const f of ['registre.js', 'marque.js', 'chemins.js', 'membres.js']) copyFileSync(join(racine, 'js', 'os', f), join(destination, f));
console.log('functions/partage/ : registre.js, marque.js, chemins.js, membres.js copiés de js/os/');
// États et transitions de la file « À valider » (module Automatisations) : fichier pur, le même pour l'écran et pour le serveur.
copyFileSync(join(racine, 'js', 'modules', 'automatisations', 'propositions.js'), join(destination, 'propositions.js'));
console.log('functions/partage/propositions.js mis à jour (copie exacte de js/modules/automatisations/propositions.js)');

// Le même serveur tourne aussi sur la plateforme clients (projet chevalier-ia-app, codebase « plateforme ») : on y copie le code du serveur tel quel, à côté de ses fonctions.
// Le déploiement n'envoie que le dossier functions-plateforme/ ; les imports relatifs (../../partage/…) restent valables dans la copie. Dossier ignoré par git.
const destinationServeur = join(racine, 'functions-plateforme', 'serveur');
rmSync(destinationServeur, { recursive: true, force: true });
for (const dossier of ['coeur', 'mcp', 'oauth', 'securite', 'clients']) cpSync(join(racine, 'functions', 'src', dossier), join(destinationServeur, 'src', dossier), { recursive: true });
mkdirSync(join(destinationServeur, 'src'), { recursive: true });
// PDF des devis chez les clients : seulement ces quatre fichiers, nommés un par un (JAMAIS devis/pdf-appel.js ni devis/stockage-projet.js : ils importent les comptes autorisés de Jérôme).
mkdirSync(join(destinationServeur, 'src', 'devis'), { recursive: true });
for (const f of ['pdf-service.js', 'pdf-declencheur.js', 'chromium.js', 'stockage.js']) copyFileSync(join(racine, 'functions', 'src', 'devis', f), join(destinationServeur, 'src', 'devis', f));
copyFileSync(join(racine, 'functions', 'src', 'version.js'), join(destinationServeur, 'src', 'version.js'));
copyFileSync(join(racine, 'functions', 'package.json'), join(destinationServeur, 'package.json')); // version.js lit la version du serveur ici
for (const f of ['logique.js', 'projets.js', 'devis.js', 'devis-articles.js', 'devis-ouvrages.js', 'devis-familles.js', 'devis-brouillon.js', 'devis-editeur.js', 'devis-email.js', 'devis-document.js', 'registre.js', 'marque.js', 'chemins.js', 'membres.js', 'propositions.js']) {
  mkdirSync(join(destinationServeur, 'partage'), { recursive: true });
  copyFileSync(join(destination, f), join(destinationServeur, 'partage', f));
}
console.log('functions-plateforme/serveur/ mis à jour (copie du serveur MCP pour la plateforme clients)');

// Module Automatisations vu par le projet du CRM (chevalier-ia-os) : la copie des workflows de Jérôme et la vue administrateur réutilisent le MÊME code que la plateforme clients
// (lecture de n8n, reconnaissance des propriétaires, copie vers Firestore) et la liste des administrateurs de l'écran. Copies générées dans functions/partage/, ignorées par git.
const destinationAutom = join(destination, 'automatisations');
mkdirSync(destinationAutom, { recursive: true });
for (const f of ['n8n.js', 'etiquettes.js', 'synchro.js', 'libelle.js']) copyFileSync(join(racine, 'functions-plateforme', 'src', f), join(destinationAutom, f));
copyFileSync(join(racine, 'js', 'os', 'administrateur.js'), join(destination, 'administrateur.js'));
console.log('functions/partage/automatisations/ et administrateur.js mis à jour (copies de functions-plateforme/src/ et de js/os/)');
