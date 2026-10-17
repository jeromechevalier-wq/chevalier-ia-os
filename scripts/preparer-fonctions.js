// Copie les règles métier de l'appli (js/modules/crm/logique.js, et js/modules/projets/logique.js pour les projets et l'extraction de valeur)
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


// La porte des workflows n8n (scripts/porte/) : la logique (clés, contrôles, actions de la veille, accès Firestore, lecteur n8n) est copiée telle quelle,
// sans l'outil en ligne de commande (outil.js), qui reste sur le Mac de Jérôme. Même principe : un seul exemplaire du code, testé, utilisé par la fonction.
const FICHIERS_PORTE = ['cles.js', 'validation.js', 'actions-veille.js', 'n8n.js', 'adaptateur.js', 'porte.js', 'cles-tableau.js', 'actions-tableaudebord.js', 'porte-tableau.js', 'saisie-tableaudebord.js'];
const destinationPorte = join(destination, 'porte');
mkdirSync(destinationPorte, { recursive: true });
for (const f of FICHIERS_PORTE) copyFileSync(join(racine, 'scripts', 'porte', f), join(destinationPorte, f));
console.log(`functions/partage/porte/ mis à jour (${FICHIERS_PORTE.length} fichiers copiés de scripts/porte/)`);

// Le lien YouTube collé à la main (reconnaissance d'un épisode ou d'une chaîne, lecture du flux) : écrit une seule fois pour l'écran et pour le serveur.
copyFileSync(join(racine, 'js', 'modules', 'veille', 'lien.js'), join(destination, 'veille-lien.js'));
console.log('functions/partage/veille-lien.js mis à jour (copie exacte de js/modules/veille/lien.js)');
// Le MCP des clients (functions/src/clients/) lit le registre des modules (modules actifs d'un client, outils de chaque module), les règles de la fiche de marque
// (couleurs de l'écran d'autorisation) et les rôles des membres : mêmes fichiers que l'appli, copiés à plat dans functions/partage/ (aucun n'importe autre chose que ses voisins).
for (const f of ['registre.js', 'marque.js', 'chemins.js', 'membres.js']) copyFileSync(join(racine, 'js', 'os', f), join(destination, f));
console.log('functions/partage/ : registre.js, marque.js, chemins.js, membres.js copiés de js/os/');

// Le même serveur tourne aussi sur la plateforme clients (projet chevalier-ia-app, codebase « plateforme ») : on y copie le code du serveur tel quel, à côté de ses fonctions.
// Le déploiement n'envoie que le dossier functions-plateforme/ ; les imports relatifs (../../partage/…) restent valables dans la copie. Dossier ignoré par git.
const destinationServeur = join(racine, 'functions-plateforme', 'serveur');
rmSync(destinationServeur, { recursive: true, force: true });
for (const dossier of ['coeur', 'mcp', 'oauth', 'securite', 'clients']) cpSync(join(racine, 'functions', 'src', dossier), join(destinationServeur, 'src', dossier), { recursive: true });
mkdirSync(join(destinationServeur, 'src'), { recursive: true });
copyFileSync(join(racine, 'functions', 'src', 'version.js'), join(destinationServeur, 'src', 'version.js'));
copyFileSync(join(racine, 'functions', 'package.json'), join(destinationServeur, 'package.json')); // version.js lit la version du serveur ici
for (const f of ['logique.js', 'projets.js', 'registre.js', 'marque.js', 'chemins.js', 'membres.js']) {
  mkdirSync(join(destinationServeur, 'partage'), { recursive: true });
  copyFileSync(join(destination, f), join(destinationServeur, 'partage', f));
}
console.log('functions-plateforme/serveur/ mis à jour (copie du serveur MCP pour la plateforme clients)');

// Module Automatisations vu par le projet du CRM (chevalier-ia-os) : la copie des workflows de Jérôme et la vue administrateur réutilisent le MÊME code que la plateforme clients
// (lecture de n8n, reconnaissance des propriétaires, copie vers Firestore) et la liste des administrateurs de l'écran. Copies générées dans functions/partage/, ignorées par git.
const destinationAutom = join(destination, 'automatisations');
mkdirSync(destinationAutom, { recursive: true });
for (const f of ['n8n.js', 'etiquettes.js', 'synchro.js']) copyFileSync(join(racine, 'functions-plateforme', 'src', f), join(destinationAutom, f));
copyFileSync(join(racine, 'js', 'os', 'administrateur.js'), join(destination, 'administrateur.js'));
console.log('functions/partage/automatisations/ et administrateur.js mis à jour (copies de functions-plateforme/src/ et de js/os/)');
