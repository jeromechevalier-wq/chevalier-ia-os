// Contrôle des écarts entre functions/ (Jérôme) et functions-plateforme/ (clients) : règle du 26/10/2026.
// Toute fonction exportée par l'un des deux index doit figurer dans une des listes ci-dessous, avec sa raison.
// Une nouvelle fonction ajoutée d'un seul côté fait ÉCHOUER ce test : la brancher des deux côtés, ou la déclarer ici (avec raison et ligne dans .github/A-FAIRE.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const exports_ = (source) => new Set([...source.matchAll(/^export const ([A-Za-z_]\w*)\s*=\s*(.*)$/gm)]
  .filter(([, , reste]) => /^(onCall|onRequest|onSchedule|onDocument\w+|appel\w+|\w+\s*\?\s*(onCall|onSchedule))/.test(reste.trim()))
  .map(([, nom]) => nom));

const jerome = exports_(lire('functions/src/index.js'));
const clients = exports_(lire('functions-plateforme/src/index.js'));

/** Branchées des DEUX côtés (même nom). */
const PARTAGEES = [
  'porte', 'automatisationsDecider', 'automatisationsRenommer', 'deploiementVerifier',
  'devisFinaliser', 'devisChangerStatut', 'devisNouvelleVersion', 'devisArchiver', 'devisSupprimer', 'devisEnregistrerEnvoi',
  'devisModifierDestinataires', 'devisChoisirAffaire', 'modeTestSupprimer', 'devisMarquerTest',
  'devisPreparerEmail', 'devisPreparerEmailEtat', 'devisPdf', 'devisPdfLien', 'devisPdfAuto',
  'documentDeposer', 'documentLien', 'documentSupprimer',
];

/** Seulement chez Jérôme : raison par ligne. « normal » = voulu ; « ÉCART » = à brancher chez les clients (voir docs/audit-ecarts-fonctions.md). */
const RESERVEES_JEROME = {
  mcp: 'normal : le MCP de Jérôme ; chez les clients c\'est `mcpclients` (même code de functions/src/mcp, un lien par client)',
  automatisationsInterneHoraire: 'normal : copie horaire des workflows de Jérôme ; chez les clients c\'est `automatisationsCopieHoraire`',
  automatisationsAdmin: 'normal : écran Automatisations de Jérôme (tous les propriétaires) ; chez les clients c\'est `automatisationsRafraichir`',
  tableaudebord: 'ÉCART connu : porte des indicateurs de maintenance (scripts de surveillance de Jérôme) ; module Maintenance non branché chez les clients',
  tableaudebordSaisir: 'ÉCART connu : saisie d\'une échéance ou d\'une valeur du module Maintenance, absente chez les clients',
  veille: 'ÉCART connu : ajout de lien et résumé du module Veille (passe par n8n), absent chez les clients',
  reseauxsociauxBuffer: 'ÉCART connu : lecture Buffer, clé personnelle de Jérôme, absente chez les clients (une clé par client demanderait un secret par client)',
  reseauxsociauxMesuresHebdo: 'ÉCART connu : relevé hebdomadaire (lundi 06:00) des chiffres des posts LinkedIn de Jérôme dans `reseauxsociaux_mesures`, même raison que `reseauxsociauxBuffer` (clé Buffer personnelle)',
  reseauxsociauxReleverMesures: 'ÉCART connu : même relevé lancé à la main par Jérôme, absent chez les clients pour la même raison',
};

/** Seulement chez les clients : raison par ligne. */
const RESERVEES_CLIENTS = {
  mcpclients: 'normal : un MCP par client (lien /mcp/<client>), équivalent de `mcp` chez Jérôme',
  automatisationsCopieHoraire: 'normal : copie horaire des workflows de chaque client, équivalent de `automatisationsInterneHoraire`',
  automatisationsRafraichir: 'normal : rafraîchissement demandé par un client, équivalent de `automatisationsAdmin`',
  espaceReglages: 'normal : réglages de l\'espace d\'un client (Mon espace), n\'existe pas pour la racine de Jérôme',
};

describe('écarts functions/ et functions-plateforme/', () => {
  test('1 la lecture des deux index trouve bien des fonctions (le test ne tourne pas à vide)', () => {
    assert.ok(jerome.size >= 25, `functions/src/index.js : ${jerome.size} fonctions trouvées`);
    assert.ok(clients.size >= 25, `functions-plateforme/src/index.js : ${clients.size} fonctions trouvées`);
  });

  test('2 chaque fonction partagée existe des deux côtés', () => {
    for (const nom of PARTAGEES) {
      assert.ok(jerome.has(nom), `${nom} manque dans functions/src/index.js`);
      assert.ok(clients.has(nom), `${nom} manque dans functions-plateforme/src/index.js (branchement oublié ?)`);
    }
  });

  test('3 toute fonction de Jérôme est partagée ou déclarée réservée avec sa raison', () => {
    for (const nom of jerome) {
      assert.ok(PARTAGEES.includes(nom) || nom in RESERVEES_JEROME,
        `${nom} existe chez Jérôme seulement : la brancher dans functions-plateforme/ dans la même PR, ou la déclarer dans RESERVEES_JEROME avec la raison et une ligne dans .github/A-FAIRE.md`);
    }
  });

  test('4 toute fonction des clients est partagée ou déclarée réservée avec sa raison', () => {
    for (const nom of clients) {
      assert.ok(PARTAGEES.includes(nom) || nom in RESERVEES_CLIENTS,
        `${nom} existe chez les clients seulement : la déclarer dans RESERVEES_CLIENTS avec la raison`);
    }
  });

  test('5 les listes ne contiennent pas de nom périmé ni en double', () => {
    for (const nom of Object.keys(RESERVEES_JEROME)) assert.ok(jerome.has(nom) && !clients.has(nom), `${nom} : plus réservé à Jérôme, retirer la ligne`);
    for (const nom of Object.keys(RESERVEES_CLIENTS)) assert.ok(clients.has(nom) && !jerome.has(nom), `${nom} : plus réservé aux clients, retirer la ligne`);
    assert.equal(new Set(PARTAGEES).size, PARTAGEES.length);
  });
});
