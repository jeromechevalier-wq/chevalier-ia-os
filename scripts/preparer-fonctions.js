// Copie les règles métier de l'appli (js/modules/crm/logique.js) dans functions/partage/ pour que le serveur MCP applique
// EXACTEMENT les mêmes règles que l'écran. Le déploiement n'envoie que le dossier functions/ : cette copie est faite avant chaque
// déploiement (« predeploy » de firebase.json) et avant chaque test, jamais commitée (functions/partage/ est ignoré par git).
// Aucune dépendance. Usage : node scripts/preparer-fonctions.js
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(racine, 'functions', 'partage');
mkdirSync(destination, { recursive: true });
copyFileSync(join(racine, 'js', 'modules', 'crm', 'logique.js'), join(destination, 'logique.js'));
console.log('functions/partage/logique.js mis à jour (copie exacte de js/modules/crm/logique.js)');
