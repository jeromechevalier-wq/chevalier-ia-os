// Copie les règles métier de l'appli (js/modules/crm/logique.js, et js/modules/projets/logique.js pour les projets et l'extraction de valeur)
// dans functions/partage/ pour que le serveur MCP applique EXACTEMENT les mêmes règles que l'écran. Le déploiement n'envoie que le dossier functions/ : cette copie est faite avant chaque
// déploiement (« predeploy » de firebase.json) et avant chaque test, jamais commitée (functions/partage/ est ignoré par git).
// Aucune dépendance. Usage : node scripts/preparer-fonctions.js
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

