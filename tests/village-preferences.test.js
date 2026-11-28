// Interrupteurs « Mon accueil » par personne (27/11/2026, docs/accueil-village.md « Interrupteurs par personne ») : défauts et lecture d'un document mal formé
// (js/os/village-preferences-logique.js), et câblage de js/main.js (or toujours branché hors portail, accueil classique). Un test par critère (le nom commence par son numéro).
// Parcours dans le navigateur : tests/e2e/village-interrupteurs.spec.js ; règles : tests/regles.test.js (I.R1 à I.R3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defauts, preferencesAppliquees, preferencesValables, preferencesMemorisees, apresClic, ACCUEILS } from '../js/os/village-preferences-logique.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');

test('I1 défauts : maison de Jérôme = jeu allumé ; maison d’un client (neutre) = jeu éteint ; accueil classique dans les deux cas (décision de Jérôme du 28/11/2026)', () => {
  // le crochet de test qui remet le village par défaut n'existe qu'avec les émulateurs
  assert.match(lire('js/os/village-preferences.js'), /const essai = MODE_EMULATEURS \? window\.__chevalierTest\?\.accueilParDefaut : null;/);
  assert.deepEqual(defauts({ neutre: false }), { jeu: true, accueil: 'classique' });
  assert.deepEqual(defauts({ neutre: true }), { jeu: false, accueil: 'classique' });
  assert.deepEqual(defauts(), { jeu: true, accueil: 'classique' });
  assert.deepEqual(ACCUEILS, ['village', 'classique']);
  // document absent : les défauts
  assert.deepEqual(preferencesAppliquees(null, { neutre: true }), { jeu: false, accueil: 'classique' });
  // document bien formé : ses valeurs, sans rien d'autre
  assert.deepEqual(preferencesAppliquees({ jeu: false, accueil: 'classique', modifieLe: new Date() }, { neutre: false }), { jeu: false, accueil: 'classique' });
  assert.deepEqual(preferencesAppliquees({ jeu: true, accueil: 'village' }, { neutre: true }), { jeu: true, accueil: 'village' });
});

test('I2 un document mal formé donne les défauts', () => {
  for (const d of [{}, { jeu: 'oui', accueil: 'village' }, { jeu: true, accueil: 'autre' }, { jeu: true }, { accueil: 'classique' }, 'texte', 42, [], { jeu: 1, accueil: 'classique' }]) {
    assert.equal(preferencesValables(d), false, JSON.stringify(d));
    assert.deepEqual(preferencesAppliquees(d, { neutre: false }), { jeu: true, accueil: 'classique' }, JSON.stringify(d));
    assert.deepEqual(preferencesAppliquees(d, { neutre: true }), { jeu: false, accueil: 'classique' }, JSON.stringify(d));
  }
});

test('I2-bis câblage : l’or est branché à chaque session hors portail (visible seulement jeu allumé et accueil village) ; accueil classique = sans village ; adresse du village redirigée', () => {
  const main = lire('js/main.js');
  assert.match(main, /if \(!portail\) arretOr = activerOr\(\{ base: '', uid: compte\.uid, visible: besoinsVillage\.length > 0 && preferencesAccueil\.jeu \}\)/);
  assert.match(main, /if \(preferencesAccueil\.accueil === 'classique'\) besoinsVillage = \[\];/);
  assert.match(main, /preferencesAccueil\.accueil === 'classique' && segs\.length === 1 && segs\[0\] === ROUTE_VILLAGE\) \{ naviguer\(accueilClassique, \{ remplacer: true \}\); return; \}/);
  // lecture seulement avec un village, lancée avant le montage des modules, attendue après, puis arrêt si la session a changé
  assert.match(main, /const lecturePreferences = !portail && besoinsMaison\.length \? lirePreferences\(\{ uid: compte\.uid \}\) : null;/);
  assert.ok(main.indexOf('const lecturePreferences') < main.indexOf('await m.monter()') && main.indexOf('await m.monter()') < main.indexOf('await lecturePreferences'));
  assert.match(main, /if \(generation !== generationSession\) return;/);
  assert.match(main, /function fermerSession\(\) \{\n  generationSession \+= 1;\n  preferencesAccueil = defautsAccueil\(\);\n  accueilClassique = ROUTE_DEFAUT;/);
  const or = lire('js/os/village-or.js');
  assert.equal((or.match(/if \(moi\.visible\) feterOr\(/g) ?? []).length, 2); // gain et récolte : jamais de fête en silence
  assert.ok(!/[^.]feterOr\(d\./.test(or.replace(/if \(moi\.visible\) feterOr\(/g, '')));
  const prefs = lire('js/os/village-preferences.js');
  assert.match(prefs, /DELAI_LECTURE_MS = 2000/);
  assert.match(prefs, /DELAI_ECRITURE_MS = 8000/);
  assert.match(prefs, /setDoc\(document_\(uid\), \{ jeu, accueil, modifieLe: serverTimestamp\(\) \}\)/);
  // la plateforme des clients n'est pas touchée (pas de village, .github/A-FAIRE.md A12)
  assert.ok(!/preferences/.test(lire('firestore.plateforme.rules')));
});

test('I8 réglage mémorisé sur l’appareil (lecture lente ou en panne) et clic : seul l’interrupteur touché change', () => {
  assert.deepEqual(preferencesMemorisees(JSON.stringify({ jeu: false, accueil: 'classique' })), { jeu: false, accueil: 'classique' });
  for (const t of [null, '', 'pas du json', JSON.stringify({ jeu: 'oui', accueil: 'village' }), JSON.stringify([])]) assert.equal(preferencesMemorisees(t), null, String(t));
  // relu dans la base : jeu allumé, accueil classique ; on rallume le village : le jeu ne bouge pas
  assert.deepEqual(apresClic({ jeu: true, accueil: 'classique', sur: true }, 'accueil', true), { jeu: true, accueil: 'village' });
  assert.deepEqual(apresClic({ jeu: true, accueil: 'classique' }, 'jeu', false), { jeu: false, accueil: 'classique' });
  const prefs = lire('js/os/village-preferences.js');
  assert.match(prefs, /memoriser\(uid, p\);\n    return \{ \.\.\.p, sur: true \};/); // lecture réussie : mémorisée
  assert.match(prefs, /memoriser\(uid, \{ jeu, accueil \}\);\n    return true;/); // écriture réussie : mémorisée
  assert.match(prefs, /preferencesMemorisees\(lirePreference\(cleAppareil\(uid\)\)\) \?\? defauts\(\{ neutre \}\)\), sur: false/); // panne : le mémorisé, sinon les défauts
  const reglages = lire('js/os/reglages.js');
  assert.match(reglages, /if \(prefs\.sur === false\) \{\n\s+const relu = await ctx\.accueil\.relire\(\);/);
  assert.match(reglages, /ctx\.accueil\.ecrire\(apresClic\(base, touche, inter\.valeur\(\)\)\)/);
});
