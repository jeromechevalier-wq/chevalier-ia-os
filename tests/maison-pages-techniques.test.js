// Maison d'un client (27/11/2026) : pages techniques réservées au titulaire (comptes_jerome_seul de reglages_maison/ecran).
// Réglages > Modules actifs, Déploiement, Mes tests, Connexion à la base, et le Journal des modifications : cachés à un compte non titulaire
// d'une maison NEUTRE (maison d'un client) ; chez Jérôme (maison sans champ neutre) et sur la plateforme des clients : rien ne change.
// Sans réseau ni émulateur, adresses inventées. Parcours dans le navigateur : tests/e2e/maison-pages-techniques.spec.js.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pagesTechniquesCachees } from '../js/os/acces-reserve.js';
import { remplirComptesMaison, viderComptesMaison } from '../js/os/comptes-maison.js';
import { retenirPublic, oublierPublic } from '../js/os/identite-maison.js';
import { SECTIONS_ESPACE, sectionsEspaceVisibles, cibleReglages, reglagesDesModules } from '../js/os/registre.js';

const TITULAIRE = 'titulaire@exemple.test';
const CLIENT = 'client@exemple.test';
const personnes = [{ email: TITULAIRE, nom: 'Titulaire' }, { email: CLIENT, nom: 'Client' }];
const ids = (o) => sectionsEspaceVisibles(o).map((s) => s.id);

beforeEach(() => { viderComptesMaison(); oublierPublic(); });

test('1 maison d’un client, compte non titulaire : pages techniques cachées ; Réglages limités à « Mon espace »', () => {
  remplirComptesMaison({ personnes, comptes_jerome_seul: [TITULAIRE], configuration_crm: 'neutre' });
  assert.equal(pagesTechniquesCachees({ email: CLIENT }), true);
  assert.equal(pagesTechniquesCachees({ email: ' Client@Exemple.test ' }), true);
  assert.equal(pagesTechniquesCachees(null), true, 'sans compte : caché (prudence)');
  assert.deepEqual(ids({ chezClient: false, editeur: true, jerome: false, techniques: false }), ['espace']);
  // Les autres signes d'une maison neutre (public : nom_espace ou connexion_neutre) suffisent aussi.
  viderComptesMaison();
  remplirComptesMaison({ personnes, comptes_jerome_seul: [TITULAIRE] });
  retenirPublic({ mode_crm: true, nom_espace: 'Espace exemple' });
  assert.equal(pagesTechniquesCachees({ email: CLIENT }), true);
  oublierPublic();
  retenirPublic({ mode_crm: true, connexion_neutre: true });
  assert.equal(pagesTechniquesCachees({ email: CLIENT }), true);
});

test('1 les sections techniques sont exactement Modules actifs, Déploiement, Mes tests et Connexion à la base', () => {
  assert.deepEqual(SECTIONS_ESPACE.filter((s) => s.technique).map((s) => s.id), ['modules', 'deploiement', 'tests', 'base']);
  assert.ok(!SECTIONS_ESPACE.find((s) => s.id === 'espace').technique, '« Mon espace » reste visible');
});

test('2 maison d’un client, compte non titulaire : une adresse de section cachée tapée à la main ne trouve rien (retour à « Mon espace »)', () => {
  const espaces = sectionsEspaceVisibles({ chezClient: false, editeur: true, jerome: false, techniques: false });
  const modules = reglagesDesModules(['achatsfactures']);
  for (const id of ['deploiement', 'tests', 'modules', 'base']) assert.equal(cibleReglages(['reglages', id], { espaces, modules }), null, id);
  assert.deepEqual(cibleReglages(['reglages'], { espaces, modules }), { type: 'espace', id: 'espace' });
});

test('2 le Journal est refusé dans js/main.js et caché dans le menu du compte (js/os/shell.js) et la page ChatGPT (js/modules/mcp/ecran.js)', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /segs\[0\] === 'journal'[^\n]*\n\s*if \(pagesTechniquesCachees\(session\.compte\)\) \{ afficherIntrouvable\(/);
  const shell = readFileSync(new URL('../js/os/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /!\(racineDeJerome && pagesTechniquesCachees\(compte\)\) \? \[\{ libelle: 'Voir le journal des modifications'/);
  const mcp = readFileSync(new URL('../js/modules/mcp/ecran.js', import.meta.url), 'utf8');
  assert.match(mcp, /pagesTechniquesCachees\(D\.compteCourant\(\)\) \? null : h\('p', \{ class: 'aide' \}, h\('a', \{ href: lien\('journal'\) \}/);
  const reglages = readFileSync(new URL('../js/os/reglages.js', import.meta.url), 'utf8');
  assert.match(reglages, /techniques: !!c\.chezClient \|\| !pagesTechniquesCachees\(c\.compte\)/, 'plateforme des clients (chezClient) : jamais caché par cette règle');
});

test('3 maison d’un client, compte titulaire : rien n’est caché', () => {
  remplirComptesMaison({ personnes, comptes_jerome_seul: [TITULAIRE], configuration_crm: 'neutre' });
  assert.equal(pagesTechniquesCachees({ email: TITULAIRE }), false);
  assert.deepEqual(ids({ chezClient: false, editeur: true, jerome: true, techniques: true }), ['espace', 'modules', 'deploiement', 'tests', 'base']);
});

test('4 chez Jérôme (maison sans champ neutre) : rien n’est caché, même pour un autre compte ; plateforme des clients : inchangée', () => {
  remplirComptesMaison({ personnes, comptes_jerome_seul: [TITULAIRE] });
  retenirPublic({ mode_crm: true });
  assert.equal(pagesTechniquesCachees({ email: TITULAIRE }), false);
  assert.equal(pagesTechniquesCachees({ email: CLIENT }), false);
  assert.deepEqual(ids({ chezClient: false, editeur: true, jerome: false }), ['espace', 'modules', 'deploiement', 'tests'], 'comme avant');
  // Plateforme : `techniques` n'est jamais faux (reglages.js) ; le défaut garde toutes les sections.
  assert.deepEqual(ids({ chezClient: true, editeur: true }), ['espace', 'membres', 'modules', 'deploiement', 'tests']);
  assert.deepEqual(ids({ chezClient: true, editeur: true, techniques: true }), ['espace', 'membres', 'modules', 'deploiement', 'tests']);
});
