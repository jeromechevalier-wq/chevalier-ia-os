// M3 : plus aucun texte « 90 jours » dans le code de l'appli (js/) ni du serveur (functions/src/) : les copies du journal sont gardées sans limite de durée
// (décision de Jérôme, 04/10/2026). Les commentaires sont ignorés ; la liste blanche est vide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const LISTE_BLANCHE = [];

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    if (nom === 'node_modules') return [];
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(js|mjs)$/.test(nom) ? [chemin] : [];
  });
}

/** Retire les commentaires `//` et bloc en respectant les chaînes de caractères (approximation suffisante pour ce contrôle). */
function sansCommentaires(code) {
  let sortie = '';
  for (let i = 0; i < code.length;) {
    const c = code[i];
    const suite = code[i + 1];
    if (c === '/' && suite === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && suite === '*') { const fin = code.indexOf('*/', i + 2); i = fin === -1 ? code.length : fin + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      sortie += code.slice(i, j + 1); i = j + 1; continue;
    }
    sortie += c; i++;
  }
  return sortie;
}

test('M3 : aucune chaîne de js/ ou functions/src/ ne contient « 90 jours » (commentaires ignorés, liste blanche vide)', () => {
  assert.deepEqual(LISTE_BLANCHE, []);
  const trouves = [];
  for (const dossier of ['js', 'functions/src']) {
    for (const f of fichiers(join(RACINE, dossier))) {
      const code = sansCommentaires(readFileSync(f, 'utf8'));
      if (/90\s*jours/i.test(code)) trouves.push(f.slice(RACINE.length));
    }
  }
  assert.deepEqual(trouves, [], `« 90 jours » reste dans : ${trouves.join(', ')}`);
});

test('M3 : le détecteur voit « 90 jours » dans une chaîne mais pas dans un commentaire', () => {
  assert.match(sansCommentaires("const a = 'gardée 90 jours';"), /90 jours/);
  assert.doesNotMatch(sansCommentaires('// 90 jours\n/* 90 jours */ const b = 1;'), /90 jours/);
});
