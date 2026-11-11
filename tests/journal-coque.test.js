// Journal commun dans la coque (11/11/2026) : l'écran et `executer` ont quitté js/modules/crm/ pour js/os/, sans changer les collections
// (crm_audit, crm_audit_avant) ni le format des lignes. `journal-donnees.js` importe Firebase depuis gstatic (inimportable par Node) : ce sont
// donc des tests de SOURCE ; le vrai lot (émulateur) est couvert par tests/e2e/journal-coque.spec.js. Le nom de chaque test commence par son numéro.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansCommentaires = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const occurrences = (texte, motif) => texte.split(motif).length - 1;
const donnees = lire('js/os/journal-donnees.js');
const code = sansCommentaires(donnees);
/** Fichiers .js d'un dossier, récursivement. */
function fichiers(dossier) {
  return readdirSync(join(RACINE, dossier)).flatMap((n) => {
    const c = `${dossier}/${n}`;
    return statSync(join(RACINE, c)).isDirectory() ? fichiers(c) : c.endsWith('.js') ? [c] : [];
  });
}

describe('journal commun : écriture (A1, A2)', () => {
  test('A1 executer de la coque : un seul lot par tranche, la donnée + sa ligne crm_audit + sa copie crm_audit_avant, mêmes règles pures qu’avant', () => {
    assert.match(code, /export async function executer\(ecritures, outil = 'ecran'\)/);
    assert.ok(code.includes('L.construireAudit(ecritures, avants,'), 'les lignes d’audit viennent de construireAudit (partagé avec le serveur MCP)');
    assert.ok(code.includes('L.ecrireParLots(ecritures.length, ACTIONS_PAR_LOT,'), 'écriture par lots, comme avant');
    assert.equal(occurrences(code, 'writeBatch(db)'), 1, 'un lot atomique par tranche');
    assert.equal(occurrences(code, 'lot.commit()'), 1);
    assert.ok(/ecrireDansLot\(lot, ecritures\[k\]\);\s*audit\[k\]\.forEach\(\(a\) => ecrireDansLot\(lot, a\)\);/.test(code), 'la donnée et ses lignes d’audit entrent dans le MÊME lot');
    assert.ok(code.includes("chemin('crm_audit')") && code.includes("chemin('crm_audit_avant')"), 'collections inchangées');
    assert.doesNotMatch(code, /['"]journal_audit|['"]audit['"]/, 'aucun nouveau nom de collection');
    assert.equal(occurrences(code, 'export const ACTIONS_PAR_LOT = 130;'), 1);
  });
  test('A1 les écritures signent avec le compte du journal et horodatent avec l’heure du serveur', () => {
    assert.match(code, /for \(const champ of e\.horodater \|\| \[\]\) marques\[champ\] = serverTimestamp\(\);/);
    assert.match(code, /for \(const champ of e\.signer \|\| \[\]\) marques\[champ\] = compte\?\.email \|\| '';/);
    assert.ok(code.includes('acteur: compte?.email'));
  });
  test('A2 un lot suivant qui échoue laisse la ligne « Échec » du Journal (même texte, même statut qu’avant)', () => {
    assert.match(code, /action: 'echec', statut: 'echec'/);
    assert.ok(code.includes('Opération arrêtée en cours de route : ${faites} éléments sur ${ecritures.length} ont été traités. Recommence-la pour la terminer.'));
    assert.ok(code.includes('jeton: L.CANAL_ECRAN, via: L.CANAL_ECRAN'));
  });
  test('A1 executer refuse d’écrire quand le journal n’est pas démarré (aucune écriture sans compte)', () => {
    assert.ok(code.includes("throw new Error('Le journal n’est pas démarré.')"));
    assert.ok(code.indexOf('Le journal n’est pas démarré.') < code.indexOf('await lireAvants(ecritures)'), 'la vérification passe avant toute lecture ou écriture');
    assert.match(code, /export function demarrerJournal\(compteConnecte, base = ''\)/);
    assert.match(code, /export function arreterJournal\(\)/);
  });
  test('A1 deuxième base (clients) : le chemin vient de demarrerJournal(compte, base), jamais d’un nom de collection en dur', () => {
    assert.ok(code.includes('cheminBase = normaliserBase(base);'));
    assert.doesNotMatch(code, /\bcollection\(db,\s*(?!chemin\()\S/);
    assert.doesNotMatch(code, /\bdoc\(db,\s*(?!chemin\()\S/);
  });
  test('A1 lecture : tri sur le seul champ date, aucune condition (règle D4), copie avant/après lue par identifiant', () => {
    const debut = donnees.indexOf('export async function lireJournal');
    const bloc = donnees.slice(debut, donnees.indexOf('\n}\n', debut));
    assert.ok(debut > 0 && /orderBy\('date', 'desc'\)/.test(bloc));
    assert.doesNotMatch(bloc, /\bwhere\s*\(/);
    assert.match(donnees, /export async function lireCopieJournal\(idLigne\)/);
  });
});

describe('journal commun : branchement des modules (A1, A6)', () => {
  test('A6 le CRM ré-exporte executer, lireJournal et lireCopieJournal de la coque : plus aucune copie locale', () => {
    const crm = lire('js/modules/crm/donnees.js');
    assert.ok(crm.includes("import { executer, lireJournal, lireCopieJournal } from '../../os/journal-donnees.js';"));
    assert.ok(crm.includes('export { executer, lireJournal, lireCopieJournal };'));
    for (const n of ['function executer(', 'function ecrireDansLot(', 'function lireAvants(', 'const ACTIONS_PAR_LOT', 'function lireJournal(', 'function lireCopieJournal(', 'writeBatch(']) {
      assert.ok(!crm.includes(n), `crm/donnees.js ne contient plus ${n}`);
    }
    assert.equal(occurrences(sansCommentaires(crm), 'await executer('), 22, 'les 22 appels internes passent toujours par executer');
  });
  test('A6 Devis et Projets écrivent toujours par CRM.executer, donc par le même journal', () => {
    for (const f of ['js/modules/devis/donnees.js', 'js/modules/projets/donnees.js']) assert.ok(/CRM\.executer\(/.test(lire(f)), f);
  });
  test('A6 aucun autre fichier n’écrit dans crm_audit : la coque est la seule porte', () => {
    for (const f of [...fichiers('js'), ...fichiers('functions/src')]) {
      if (f === 'js/os/journal-donnees.js' || /functions\/src\/coeur\/(ecriture|restaurer|lecture)/.test(f)) continue;
      const t = sansCommentaires(lire(f));
      if (!f.startsWith('js/')) continue;
      assert.ok(!/chemin\('crm_audit'\)|chemin\('crm_audit_avant'\)/.test(t), `${f} lit ou écrit le journal sans passer par js/os/journal-donnees.js`);
    }
  });
});

describe('journal commun : écran et routes (A3, A4, A5)', () => {
  test('A5 js/modules/crm/journal.js n’existe plus ; plus aucun import ne le cite', () => {
    assert.ok(!existsSync(join(RACINE, 'js/modules/crm/journal.js')));
    assert.ok(existsSync(join(RACINE, 'js/os/journal.js')));
    for (const f of fichiers('js')) assert.ok(!/modules\/crm\/journal/.test(lire(f)), f);
  });
  test('A5 oublierFiltresJournal est appelée à la déconnexion, chez Jérôme (main.js) et chez un client (espace.js), par le nouveau chemin', () => {
    for (const f of ['js/main.js', 'js/os/espace.js']) assert.match(lire(f), /import\('(\.\/os|\.)\/journal\.js'\)\.then\(\(m\) => m\.oublierFiltresJournal\(\)\)/, f);
    assert.match(lire('js/os/journal.js'), /export function oublierFiltresJournal\(\)/);
  });
  test('A1 la coque démarre le journal AVANT le socle et les modules, et l’arrête APRÈS eux (Jérôme et client)', () => {
    for (const f of ['js/main.js', 'js/os/espace-modules.js']) {
      const t = lire(f);
      assert.equal(occurrences(t, 'demarrerJournal('), 1, f);
      assert.equal(occurrences(t, 'arreterJournal()'), 1, f);
      assert.ok(t.indexOf('demarrerJournal(') < t.indexOf('demarrerSocle('), `${f} : le journal démarre avant le socle`);
      assert.ok(t.indexOf('demarrerSocle(') < t.indexOf('api.demarrer('), `${f} : le socle démarre avant les modules`);
      assert.ok(t.indexOf('arreterSocle()') < t.indexOf('arreterJournal()'), `${f} : le journal s’arrête après le socle`);
    }
    assert.match(lire('js/main.js'), /demarrerJournal\(compte, ''\)/);
    assert.match(lire('js/os/espace-modules.js'), /demarrerJournal\(compte, base\)/);
  });
  test('A3 la route #/crm/journal est toujours servie par le module Affaires et affiche l’écran de la coque', () => {
    const index = lire('js/modules/crm/index.js');
    assert.ok(index.includes("import { rendreJournal } from '../../os/journal.js';"));
    assert.match(index, /journal: \(conteneur\) => rendreJournal\(conteneur\)/);
  });
  test('A4 la route #/journal est servie par la coque (Jérôme, portail, client) sans passer par un module', () => {
    const main = lire('js/main.js');
    assert.match(main, /segs\[0\] === 'journal'/);
    assert.match(main, /segs\[0\] !== 'reglages' && segs\[0\] !== 'journal'/, 'le portail laisse passer la route journal comme Réglages');
    assert.ok(main.includes('rendreJournal(coquille.contenu)'));
    const espace = lire('js/os/espace-modules.js');
    assert.match(espace, /segs\[0\] === 'journal' && segs\.length === 1/);
    assert.ok(espace.indexOf("segs[0] === 'journal'") < espace.indexOf('ecranSocleDeRoute(segs)'), 'servie avant le socle et avant les modules');
    assert.ok(espace.includes("route === 'journal' ? route : routeModernisee(route)"), 'l’ancienne redirection journal -> automatisations ne touche plus la route seule');
  });
  test('A4 l’entrée « Voir le journal des modifications » apparaît dès qu’un module est actif et mène à #/journal', () => {
    const shell = lire('js/os/shell.js');
    assert.match(shell, /idsModules\.length \? \[\{ libelle: 'Voir le journal des modifications', icone: 'history', action: allerDepuisMenu\('journal'\) \}\] : \[\]/);
    assert.ok(!shell.includes("allerDepuisMenu('crm/journal')"));
    assert.ok(!lire('js/modules/mcp/ecran.js').includes("lien('crm/journal')"));
    assert.equal(occurrences(lire('js/modules/mcp/ecran.js'), "lien('journal')"), 2);
  });
  test('A3 l’écran garde ses textes : journal vide, lecture impossible, chargement des lignes plus anciennes', () => {
    const t = lire('js/os/journal.js');
    assert.ok(t.includes('Le journal est vide : rien n’a encore été écrit.'));
    assert.ok(t.includes('Le journal n’a pas pu être lu. Vérifie ta connexion, puis clique sur « Actualiser ».'));
    assert.ok(t.includes('Charger les lignes plus anciennes'));
    assert.ok(t.includes("export function rendreJournal(conteneur)"));
  });
  test('A1 point d’accroche pour les modules : declarerLibellesJournal({ collection: [singulier, pluriel] }), sans que la coque connaisse un module', () => {
    const t = lire('js/os/journal.js');
    assert.match(t, /export function declarerLibellesJournal\(table\)/);
    assert.ok(!/reseauxsociaux|veille_/.test(t), 'aucun nom de module dans la coque');
  });
});
