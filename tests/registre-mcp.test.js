// Registre des modules (chantier 7) : la liste des outils MCP déclarée par chaque module correspond EXACTEMENT aux outils du serveur
// (déclaration seulement : le serveur MCP multi-clients est le chantier 9). Ajouter un outil au serveur sans le déclarer dans un module échoue ici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { MODULES_DECLARES, OUTILS_COMMUNS } from '../js/os/registre.js';

test('chaque outil du serveur est déclaré une fois (module ou commun), et chaque outil déclaré existe', () => {
  const serveur = OUTILS.map((o) => o.nom).sort();
  const declares = [...OUTILS_COMMUNS, ...MODULES_DECLARES.flatMap((m) => m.outilsMcp)].sort();
  assert.deepEqual(declares, serveur);
});
