// Plus de pause (décision de Jérôme, 22/10/2026) : le serveur MCP n'a plus les trois outils de pause, ni chez Jérôme (functions/) ni dans la copie
// de la plateforme clients (functions-plateforme/serveur/, recréée par `npm run preparer`) ; « rouvrir_affaire » marche sur une affaire perdue.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../functions/partage/logique.js';
import * as PL from '../functions/partage/projets.js';
import { OUTILS_ECRITURE } from '../functions/src/mcp/outils/ecriture.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const TROIS_OUTILS = ['mettre_en_pause', 'mettre_projet_en_pause', 'reprendre_projet'];
const nomsDansLeCode = (fichier) => [...readFileSync(`${RACINE}${fichier}`, 'utf8').matchAll(/outil\('([a-z_]+)'/g)].map((m) => m[1]);

describe('P5 serveur MCP : plus de pause', () => {
  test('P5 la liste des outils d’écriture de functions/ n’a plus les trois outils de pause, et garde rouvrir_affaire', () => {
    const noms = OUTILS_ECRITURE.map((o) => o.nom);
    for (const n of TROIS_OUTILS) assert.ok(!noms.includes(n), n);
    assert.ok(noms.includes('rouvrir_affaire'));
    assert.ok(noms.includes('rouvrir_projet'));
    assert.equal(OUTILS_ECRITURE.find((o) => o.nom === 'rouvrir_affaire').description, 'Rouvre une affaire perdue.');
    for (const o of OUTILS_ECRITURE) assert.doesNotMatch(`${o.description}`, /pause|réveil/i, `la description de ${o.nom} ne parle plus de pause`);
  });
  test('P5 la copie de la plateforme clients (recréée par « npm run preparer ») n’a plus non plus les trois outils', () => {
    const fichier = 'functions-plateforme/serveur/src/mcp/outils/ecriture.js';
    assert.ok(existsSync(`${RACINE}${fichier}`), 'copie absente : lancer « npm run preparer »');
    const noms = nomsDansLeCode(fichier);
    assert.ok(noms.includes('rouvrir_affaire'));
    for (const n of TROIS_OUTILS) assert.ok(!noms.includes(n), n);
    assert.doesNotMatch(readFileSync(`${RACINE}${fichier}`, 'utf8'), /mettre_en_pause|mettre_projet_en_pause|reprendre_projet/);
    assert.doesNotMatch(readFileSync(`${RACINE}functions-plateforme/serveur/src/coeur/metier.js`, 'utf8'), /mettreEnPause|mettreProjetEnPause|reprendreProjet/);
  });
  test('P5 le registre des modules ne liste plus les trois outils (Jérôme et plateforme)', () => {
    for (const f of ['js/os/registre.js', 'functions/partage/registre.js']) {
      const texte = readFileSync(`${RACINE}${f}`, 'utf8');
      for (const n of TROIS_OUTILS) assert.ok(!texte.includes(n), `${f} : ${n}`);
      assert.ok(texte.includes("'rouvrir_affaire'"), f);
    }
  });
  test('P5 rouvrir_affaire : la règle rouvre une affaire perdue (et une ancienne « en_pause » d’une base non migrée)', () => {
    const ctx = { maintenant: new Date('2026-10-23T08:00:00Z'), auteur: 'x', config: L.CONFIG_JEROME };
    const base = { ...L.nouvelleAffaire({ titre: 'Essai' }, ctx), id: 'a1' };
    const perdue = L.rouvrirAffaire({ ...base, statut: 'perdue', raisonPerdue: 'Prix' }, ctx);
    assert.equal(perdue.patch.statut, 'ouverte');
    assert.equal(perdue.evenements[0].type, 'affaire_rouverte');
    const ancienne = L.rouvrirAffaire({ ...base, statut: 'en_pause', dateReveil: '2026-12-01' }, ctx);
    assert.equal(ancienne.patch.statut, 'ouverte');
    assert.equal(ancienne.patch.dateReveil, null);
  });
  test('P5 la règle des projets n’a plus de pause ; la lecture MCP montre « ouverte » pour une ancienne pause', () => {
    assert.equal(PL.mettreProjetEnPause, undefined);
    assert.equal(PL.reprendreProjet, undefined);
    assert.equal(L.statutAffiche({ statut: 'en_pause' }), 'ouverte');
  });
});
