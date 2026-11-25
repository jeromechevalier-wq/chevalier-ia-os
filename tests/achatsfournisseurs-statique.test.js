// Module Achats « Fournisseurs » (PR 5) : garde-fous lus dans le code (le dépôt est public, la base n'est jamais jointe que par la couche d'accès).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const DOSSIER = 'js/modules/achatsfournisseurs';
const lire = (c) => readFileSync(join(RACINE, c), 'utf8');
const FICHIERS = readdirSync(join(RACINE, DOSSIER)).filter((f) => f.endsWith('.js')).map((f) => `${DOSSIER}/${f}`);
const TOUT = FICHIERS.concat(['css/achatsfournisseurs.css']);

test('F2 aucun fichier du module n\'appelle le réseau directement (pas de fetch, même en commentaire) : tout passe par la couche d\'accès', () => {
  for (const f of FICHIERS) {
    assert.doesNotMatch(lire(f), /fetch\s*\(/, `${f} contient un appel direct au réseau`);
    assert.doesNotMatch(lire(f), /XMLHttpRequest|sendBeacon|WebSocket/, `${f} ouvre une connexion à la main`);
  }
});

test('F2 aucune adresse web, aucun nom de personne ou de client, aucun secret dans le module', () => {
  for (const f of TOUT) {
    const src = lire(f);
    assert.doesNotMatch(src, /https?:\/\//, `${f} contient une adresse web`);
    assert.doesNotMatch(src, /Jérôme|Chevalier|Charles|Claude Code/, `${f} cite une personne ou un outil`);
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}/, `${f} ressemble à une clé`);
  }
});

test('F2 les lectures nomment leurs colonnes (jamais d\'étoile) et ne visent que la vue et les deux tables prévues', () => {
  const src = lire(`${DOSSIER}/donnees.js`);
  assert.doesNotMatch(src, /'\*'|"\*"|select\s*=\s*\*/);
  const tables = [...src.matchAll(/\.lire\(\s*([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tables)].sort(), ['TABLE_CONFIRMATIONS', 'TABLE_FOURNISSEURS', 'VUE_A_VERIFIER']);
  assert.match(src, /VUE_A_VERIFIER\s*=\s*'fournisseurs_a_verifier'/);
  assert.match(src, /TABLE_CONFIRMATIONS\s*=\s*'ibans_confirmes'/);
  assert.match(src, /TABLE_FOURNISSEURS\s*=\s*'fournisseurs'/);
});

test('F5 les écritures sont deux actions métier seulement, jamais une écriture directe dans une table', () => {
  const src = lire(`${DOSSIER}/donnees.js`);
  const actions = [...src.matchAll(/appelerActionMetier\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(actions.sort(), ['confirmer_iban', 'revoquer_iban']);
  assert.doesNotMatch(src, /\.(ecrire|inserer|modifier|supprimer|upsert|insert|update|delete)\(/);
});

test('F1 l\'écran utilise la barre commune des écrans de liste et la carte d\'accès commune', () => {
  const src = lire(`${DOSSIER}/ecran.js`);
  assert.match(src, /from '\.\.\/crm\/barre-liste\.js'/);
  assert.match(src, /from '\.\.\/achatscommun\/etat\.js'/);
  assert.doesNotMatch(src, /type:\s*['"]search['"]/);
});

test('F10 le module exporte « reglages » et déclare sa section de sauvegarde dans le registre', () => {
  assert.match(lire(`${DOSSIER}/index.js`), /export (function|const) reglages/);
  const reg = lire('js/os/registre.js');
  assert.match(reg, /reglages-export-achatsfournisseurs/);
  assert.match(lire(`${DOSSIER}/export.js`), /id:\s*'reglages-export-achatsfournisseurs'/);
});

test('F10 le fichier d\'export ne contient aucune colonne d\'IBAN', () => {
  const src = lire(`${DOSSIER}/csv.js`);
  const bloc = src.slice(src.indexOf('ENTETES_FOURNISSEURS'), src.indexOf('ENTETES_FOURNISSEURS') + 300);
  assert.doesNotMatch(bloc, /IBAN/i);
});
