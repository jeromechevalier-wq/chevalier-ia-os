// Barre commune des écrans de liste (règle de Jérôme, 05/11/2026) : les écrans de liste n'écrivent pas leur champ de recherche à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');

const ECRANS = [
  'js/modules/reseauxsociaux/relations-ecran.js',
  'js/modules/devis/liste-ecran.js', 'js/modules/crm/affaires.js', 'js/modules/projets/projets.js',
  'js/modules/devis/relances-ecran.js', 'js/modules/devis/bordereau.js', 'js/modules/devis/vocabulaire-ecran.js',
  // PR 2 (05/11/2026)
  'js/modules/crm/personnes.js', 'js/modules/crm/organisations.js', 'js/os/journal.js', 'js/modules/veille/ecran.js',
  'js/modules/automatisations/ecran.js', 'js/modules/automatisations/a-valider.js', 'js/modules/tableaudebord/ecran.js', 'js/modules/projets/modeles.js',
];

test('les écrans de liste n\'écrivent pas leur recherche à la main (type search)', () => {
  for (const chemin of ECRANS) {
    assert.doesNotMatch(lire(chemin), /type:\s*['"]search['"]/,
      `${chemin} pose un champ de recherche à la main. Règle (docs/consignes-ui.md, « Écrans de liste ») : la recherche avec sa loupe vient de js/modules/crm/barre-liste.js (barreListe / champRecherche).`);
  }
});

test('les écrans de liste ne reconstruisent pas les boutons de vue à la main', () => {
  for (const chemin of ECRANS) {
    assert.doesNotMatch(lire(chemin), /class:\s*[`'"]bascule-vue/,
      `${chemin} fabrique ses boutons de vue. Règle : utiliser basculeVues de js/modules/crm/barre-liste.js (« Archives » y est un bouton de vue, jamais mémorisé).`);
  }
});

test('le composant commun garde la loupe et la structure attendue par le CSS', () => {
  const src = lire('js/modules/crm/barre-liste.js');
  assert.match(src, /champ-avec-icone/);
  assert.match(src, /barre-filtres-ligne/);
  assert.match(src, /bascule-vues/);
});

test('chacun des écrans de liste importe le composant commun', () => {
  for (const chemin of ECRANS) {
    assert.match(lire(chemin), /from '(\.\/|\.\.\/crm\/|\.\.\/modules\/crm\/)barre-liste\.js'|from '\.\/barre-liste\.js'/,
      `${chemin} n'importe plus js/modules/crm/barre-liste.js : un écran de liste utilise la barre commune (docs/consignes-ui.md).`);
  }
});

test('les boutons de vue disent « Kanban | Liste » (jamais « Tableau ») et les boutons jaunes « + Module » (jamais « + Nouveau … »)', () => {
  const regle = 'Règle (docs/consignes-ui.md, « Écrans de liste : une seule barre ») : boutons de vue Kanban | Liste | Archives, bouton jaune « + <module au singulier> ».';
  for (const chemin of ECRANS) {
    const src = lire(chemin);
    assert.doesNotMatch(src, /vues:\s*\[[^\n]*'Tableau'/, `${chemin} écrit « Tableau » dans ses vues. ${regle}`);
    if (src.includes('basculeVues(')) {
      assert.match(src, /\[\s*'(kanban|tableau)',\s*'Kanban',\s*'square-kanban'\s*\],\s*\[\s*'liste',\s*'Liste',\s*'list'\s*\]/,
        `${chemin} : les vues ne commencent pas par Kanban puis Liste. ${regle}`);
    }
    assert.doesNotMatch(src, /icone\('plus'[^)]*\),\s*'Nouve(au|lle) /, `${chemin} a un bouton « + Nouveau … ». ${regle}`);
  }
});
