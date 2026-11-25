// Module Articles : verrous du code (lecture seule par la couche d'accès, écritures par les actions métier, aucun réseau direct, aucune adresse, feuille de style sans valeur en dur).
// Tests statiques : ils lisent les fichiers du module. Un test par règle, le nom commence par son numéro.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, describe } from 'node:test';
import { MODULES_DECLARES, reglagesDesModules } from '../js/os/registre.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = 'js/modules/achatsarticles';
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const fichiers = readdirSync(join(RACINE, DOSSIER)).filter((f) => f.endsWith('.js')).map((f) => `${DOSSIER}/${f}`);
const sansComm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const MOTS = /Chevalier|Jérôme|Jerome|Charles|Hermes|Claude Code/;

describe('V1 aucun réseau direct, aucune adresse', () => {
  test('V1 aucun fetch(, XMLHttpRequest, WebSocket, sendBeacon ni EventSource, même en commentaire', () => {
    assert.ok(fichiers.length >= 9);
    for (const f of fichiers) assert.doesNotMatch(lire(f), /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/, f);
  });
  test('V1 aucune adresse https écrite dans le code, aucun nom de personne ni de client dans ce que l’écran montre', () => {
    for (const f of fichiers) {
      const code = sansComm(lire(f));
      assert.doesNotMatch(code, /https?:\/\//, f);
      assert.doesNotMatch(code, MOTS, f);
    }
  });
});

describe('V2 lecture seule par la couche d’accès, écritures par les actions métier', () => {
  test('V2 seul donnees.js lit la base (clientBase), seul actions.js écrit (actionsBase) ; aucune lecture avec une étoile ni relation imbriquée', () => {
    for (const f of fichiers) {
      const code = sansComm(lire(f));
      const nom = f.split('/').pop();
      if (nom !== 'donnees.js') assert.doesNotMatch(code, /clientBase|\.lire\(/, f);
      if (nom !== 'actions.js') assert.doesNotMatch(code, /actionsBase|appelerActionMetier|\.appeler\(/, f);
    }
    const d = sansComm(lire(`${DOSSIER}/donnees.js`));
    assert.doesNotMatch(d, /select\(|\*\s*['"`]|\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    assert.doesNotMatch(d, /\(\s*['"`]\w+\(/, 'pas de relation imbriquée dans les colonnes');
  });
  test('V2 les six actions métier et le webhook des suggestions sont les seuls gestes d’écriture', () => {
    const a = lire(`${DOSSIER}/actions.js`);
    const noms = [...a.matchAll(/appeler\('([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(noms, ['creer_article_reference', 'dissocier_rapprochement', 'refuser_suggestion', 'renommer_reference', 'reprendre_suggestion', 'valider_rapprochement']);
    assert.match(a, /demanderSuggestions\(\)/);
  });
  test('V2 l’écran ne contient aucun appel direct à la base et ne lit qu’à travers donnees.js', () => {
    const e = sansComm(lire(`${DOSSIER}/ecran.js`));
    assert.match(e, /from '\.\/donnees\.js'/);
    assert.match(e, /from '\.\/actions\.js'/);
    assert.doesNotMatch(e, /supabase|rest\/v1|\.rpc\(/);
  });
});

describe('V3 imports : seuls le module, le code commun des Achats, la coque et la barre de liste commune', () => {
  test('V3 aucun import d’un autre module, hors achatscommun et js/modules/crm/barre-liste.js', () => {
    for (const f of fichiers) {
      for (const m of lire(f).matchAll(/from '([^']+)'/g)) {
        if (!m[1].startsWith('.')) continue;
        const resolu = join('/', dirname(f), m[1]).slice(1);
        if (resolu.startsWith('js/modules/')) assert.ok(resolu.startsWith(`${DOSSIER}/`) || resolu.startsWith('js/modules/achatscommun/') || resolu === 'js/modules/crm/barre-liste.js', `${f} importe ${m[1]}`);
      }
    }
  });
  test('V3 la barre de liste commune n’importe que la coque (aucune donnée, aucun Firebase)', () => {
    for (const m of lire('js/modules/crm/barre-liste.js').matchAll(/from '([^']+)'/g)) assert.equal(m[1], '../../os/ui.js');
  });
});

describe('V4 déclaration, réglages et export', () => {
  test('V4 le module est réservé à un seul compte, sans donnée Firebase ni dépendance ; une seule section de réglages : « Sauvegarde des articles »', () => {
    const m = MODULES_DECLARES.find((x) => x.id === 'achatsarticles');
    assert.equal(m.seulJerome, true);
    assert.deepEqual(m.collections, []);
    assert.deepEqual(m.dependances, []);
    assert.deepEqual(m.reglages.sections, [{ id: 'reglages-export-achatsarticles', libelle: 'Sauvegarde des articles' }]);
    const [achats] = reglagesDesModules(['achatsarticles']);
    assert.deepEqual(achats.sections.map((s) => s.id), ['reglages-export-achatsarticles']);
  });
  test('V4 l’index du module respecte le contrat et appelle l’export des réglages', () => {
    const i = lire(`${DOSSIER}/index.js`);
    for (const nom of ['demarrer', 'arreter', 'afficher', 'reglages', 'rechercher']) assert.match(i, new RegExp(`export function ${nom}\\(`));
    assert.match(i, /export const actionsRapides = \[\]/);
    assert.match(i, /reglagesExportArticles/);
    assert.match(lire(`${DOSSIER}/export.js`), /id: 'reglages-export-achatsarticles'/);
  });
  test('V4 le bouton « Exporter » est sur l’écran', () => {
    assert.match(lire(`${DOSSIER}/ecran.js`), /'Exporter'/);
    assert.match(lire(`${DOSSIER}/ecran.js`), /exporter-articles/);
  });
});

describe('V5 feuille de style : jetons seulement', () => {
  test('V5 aucune couleur ni taille de texte ni poids en dur', () => {
    const css = lire('css/achatsarticles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'couleur hexadécimale');
    assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/, 'couleur rgb/hsl');
    assert.doesNotMatch(css, /font-size:\s*\d|font-weight:\s*\d/, 'taille ou poids en dur');
    assert.doesNotMatch(css, /font:\s*\d/, 'raccourci font avec taille en dur');
  });
  test('V5 aucun mot interdit ni adresse dans la feuille', () => {
    const css = lire('css/achatsarticles.css');
    assert.doesNotMatch(css, MOTS);
    assert.doesNotMatch(css, /https?:\/\//);
  });
});
