// Fabrique le « tools/list » réel (SDK MCP, protocole HTTP, en mémoire) d'un profil, avec le vrai gestionnaire `servirMcp`.
// Sert au test d'invariance (tests/mcp-variantes-profil.test.js) et au script qui fige les listes (tests/outils/figer-tools-list.js).
// Aucune donnée réelle : une base vide en mémoire ; seuls les textes des outils sortent.
import { createServer } from 'node:http';
import { servirMcp } from '../../functions/src/mcp/gestionnaire.js';
import { OUTILS } from '../../functions/src/mcp/outils/index.js';
import { outilsDesModules } from '../../functions/src/clients/gestionnaire.js';
import { MODULES_DECLARES } from '../../functions/partage/registre.js';
import { creerAccesMemoire } from '../../functions/src/coeur/donnees.js';

export const EMAIL_SUPER_ADMIN = 'jerome.chevalier@gmail.com';
export const TOUS_LES_MODULES = MODULES_DECLARES.map((m) => m.id);

/**
 * Rend le tableau `tools` du tools/list d'un jeton fictif. `modules` : null = serveur de Jérôme (tous les outils) ; sinon les modules actifs d'un client.
 * `email` : l'e-mail vérifié d'une connexion OAuth (super admin => outils réservés). Rend aussi `texte`, la réponse brute.
 */
export async function listerOutils({ profil, modules = null, email = null }) {
  const outils = modules ? outilsDesModules(modules, OUTILS) : OUTILS;
  const jeton = { jeton: 'essai-liste', acteur: 'essai-liste', profil, ...(email ? { email } : {}), ...(modules ? { actifs: modules } : {}) };
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      req.body = JSON.parse(Buffer.concat(m).toString('utf8'));
      servirMcp({ req, res, infos: {}, jeton, outils, donnees: creerAccesMemoire({}), limiteur: null, maintenant: () => 1000 });
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  try {
    const r = await fetch(`http://127.0.0.1:${serveur.address().port}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    const texte = await r.text();
    return { tools: JSON.parse(texte).result.tools, texte };
  } finally { serveur.close(); }
}

/** Les listes figées : nom du fichier => paramètres. Pas de fixture par alias (les alias sont convertis à la lecture du secret : jetons.js). */
export const CAS_FIGES = Object.freeze({
  lecture: { profil: 'lecture' },
  ecriture: { profil: 'ecriture' },
  'agent-devis': { profil: 'agent-devis' },
  complet: { profil: 'complet' }, // jeton fixe : 84 outils
  'complet-super-admin': { profil: 'complet', email: EMAIL_SUPER_ADMIN }, // connexion OAuth d'un super admin : 85 outils (+ modifier_reglages_devis)
  'client-editeur': { profil: 'complet', modules: TOUS_LES_MODULES }, // rôle éditeur d'un client (PROFIL_PAR_ROLE)
  'client-lecteur': { profil: 'lecture', modules: TOUS_LES_MODULES }, // rôle lecteur d'un client
});

export const texteFige = (tools) => `${JSON.stringify(tools, null, 1)}\n`;
