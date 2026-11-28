// Console, finitions de la phase 2, PR 2 (28/11/2026, relecture Fable de la PR 771). Un test par correction, le nom commence par son numéro (F1…F8).
// F7 (export plein) et la capture de F8 (étages de l'immeuble) sont vus dans un navigateur : tests/e2e/console.spec.js.
// Aucun appel réseau ni émulateur ici : bases et lecteurs sont de faux objets. Dépôt public : noms inventés génériques seulement.
import './_fiche-essai.js';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validerRegistre } from '../functions/src/console/registre.js';
import { releverBatiments } from '../functions/src/console/releve.js';
import { lireBatimentsConsole, avecDelai, MOTIFS_BATIMENTS } from '../functions/src/console/batiments.js';
import { principal, refusAvantEcriture, lireArguments, lireProjetLie } from '../scripts/console-registre.js';
import { releveAffiche } from '../js/modules/console/logique.js';

const racine = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(`${racine}${chemin}`, 'utf8');

const MAISON = { cle: 'maison-a', nom: 'Espace essai A', genre: 'maison', etat: 'en_service', projets: [], lecture_projet: 'projet-essai-1' };

// Faux Firestore minimal : registre absent, relevés lents ou vides selon `lent`.
const jamais = () => new Promise(() => {});
const refVide = { get: async () => ({ exists: false }), collection: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) };
const refLente = { get: jamais, collection: () => ({ orderBy: () => ({ limit: () => ({ get: jamais }) }) }) };
const fauxOs = ({ lent = false, transaction } = {}) => ({
  collection: () => ({ doc: () => ({ get: async () => ({ exists: false }), collection: () => ({ doc: () => (lent ? refLente : refVide) }) }) }),
  runTransaction: transaction ?? (async (f) => f({ get: async () => ({ exists: false }), set: () => {} })),
});

describe('F1 consoleBatiments : appartements et relevés lus en 10 s au plus, au-delà partie vide + motif', () => {
  test('F1 appartements trop lents : liste vide et motif « appartements », le reste de la réponse arrive', async () => {
    const appLent = { collection: () => ({ listDocuments: jamais }) };
    const debut = Date.now();
    const r = await lireBatimentsConsole({ dbOs: () => fauxOs(), dbApp: async () => appLent, delaiMs: 50 });
    assert.ok(Date.now() - debut < 2000, 'la lecture n\'attend pas sans fin');
    assert.deepEqual([r.immeuble.appartements, r.immeuble.total_appartements], [[], 0]);
    assert.deepEqual(r.motifs, [MOTIFS_BATIMENTS.appartements]);
    assert.deepEqual(r.releves, {});
  });

  test('F1 ouverture de l\'immeuble trop lente : même motif, jamais une erreur pour tout le bloc', async () => {
    const r = await lireBatimentsConsole({ dbOs: () => fauxOs(), dbApp: jamais, delaiMs: 50 });
    assert.deepEqual(r.motifs, [MOTIFS_BATIMENTS.appartements]);
  });

  test('F1 relevés trop lents : relevés vides et motif « relevés » ; appartements lus normalement', async () => {
    const app = { collection: () => ({ listDocuments: async () => [] }), getAll: async () => [] };
    const r = await lireBatimentsConsole({ dbOs: () => fauxOs({ lent: true }), dbApp: async () => app, delaiMs: 50 });
    assert.deepEqual(r.releves, {});
    assert.deepEqual(r.motifs, [MOTIFS_BATIMENTS.releves]);
    assert.deepEqual(r.immeuble.appartements, []);
  });

  test('F1 avecDelai : rend la valeur à temps, lève après le délai, délai par défaut de 10 s comme releve.js ; minuterie nettoyée', async () => {
    assert.equal(await avecDelai(Promise.resolve(3), 50), 3);
    await assert.rejects(() => avecDelai(jamais(), 20), /délai dépassé/);
    const s = lire('functions/src/console/batiments.js');
    assert.match(s, /clearTimeout\(minuterie\)/);
    assert.match(s, /avecDelai\(lireAppartements\(app\), delaiMs\)/);
    assert.match(s, /avecDelai\(Promise\.all\(cles\.map\(\(cle\) => lireReleve\(os, cle\)\)\), delaiMs\)/);
    assert.match(s, /delaiMs = DELAI_LECTURE_MS/);
  });
});

describe('F2 script du registre : refus d\'écrire si la validation a retiré une entrée ou s\'il n\'y a aucun bâtiment, sauf --forcer', () => {
  const ARGS = ['--projet', 'projet-essai-os', '--fichier', '/chemin/inexistant.json'];
  const deroule = async (contenu, extra = [], { lie = 'projet-essai-app' } = {}) => {
    const ecrits = []; const affiche = [];
    const resultat = await principal([...ARGS, ...extra], {
      lireFichier: () => JSON.stringify(contenu), lireJeton: () => 'jeton-essai',
      lireLie: async () => lie, ecrire: async ({ fiche }) => { ecrits.push(fiche); }, afficher: (t) => affiche.push(t),
    });
    return { resultat, ecrits, affiche };
  };

  test('F2 --forcer est lu ; refusAvantEcriture : motifs ou 0 bâtiment = refus sans valeur, --forcer lève le refus', () => {
    assert.equal(lireArguments([...ARGS, '--oui', '--forcer']).forcer, true);
    assert.equal(lireArguments(ARGS).forcer, false);
    const avecMotif = validerRegistre({ batiments: [MAISON, { ...MAISON, cle: 'os' }] });
    assert.match(refusAvantEcriture(avecMotif), /1 entrée\(s\) retirée\(s\).*--forcer.*Rien n'a été écrit/);
    assert.match(refusAvantEcriture(validerRegistre({})), /aucun bâtiment valide.*--forcer/);
    assert.equal(refusAvantEcriture(avecMotif, { forcer: true }), null);
    assert.equal(refusAvantEcriture(validerRegistre({ batiments: [MAISON] })), null);
    assert.doesNotMatch(refusAvantEcriture(avecMotif), /Espace essai|projet-essai|maison-a/);
  });

  test('F2 avec --oui : entrée retirée = refus, rien écrit ; aucun bâtiment = refus ; avec --forcer = écrit la version validée', async () => {
    await assert.rejects(() => deroule({ batiments: [MAISON, { ...MAISON, cle: 'Invalide' }] }, ['--oui']), /entrée\(s\) retirée\(s\)/);
    await assert.rejects(() => deroule({ batiments: [] }, ['--oui']), /aucun bâtiment valide/);
    const force = await deroule({ batiments: [MAISON, { ...MAISON, cle: 'Invalide' }] }, ['--oui', '--forcer']);
    assert.equal(force.resultat, 'ecrit');
    assert.deepEqual(force.ecrits[0].batiments.map((b) => b.cle), ['maison-a']);
    const propre = await deroule({ batiments: [MAISON] }, ['--oui']);
    assert.equal(propre.ecrits.length, 1);
  });

  test('F2 sans --oui : essai à blanc, ni jeton, ni lecture, ni écriture', async () => {
    let touche = 0;
    const r = await principal(ARGS, {
      lireFichier: () => JSON.stringify({ batiments: [] }), lireJeton: () => { touche += 1; return 'x'; },
      lireLie: async () => { touche += 1; return 'x'; }, ecrire: async () => { touche += 1; }, afficher: () => {},
    });
    assert.equal(r, 'essai');
    assert.equal(touche, 0);
  });

  test('F2 docs/console.md §12 documente --forcer', () => {
    const doc = lire('docs/console.md');
    const s12 = doc.slice(doc.indexOf('## 12.'));
    assert.match(s12, /--forcer/);
  });
});

describe('F3 script du registre : refus si le projet visé n\'a pas de projet lié (ce n\'est pas le CRM de Jérôme), valeur jamais affichée', () => {
  const ARGS = ['--projet', 'projet-essai-os', '--fichier', '/chemin/inexistant.json', '--oui'];
  const avecLie = (lie) => {
    const ecrits = []; const affiche = [];
    const p = principal(ARGS, {
      lireFichier: () => JSON.stringify({ batiments: [MAISON] }), lireJeton: () => 'jeton-essai',
      lireLie: async () => lie, ecrire: async ({ fiche }) => { ecrits.push(fiche); }, afficher: (t) => affiche.push(t),
    });
    return { p, ecrits, affiche };
  };

  test('F3 projet lié vide ou absent : refus, rien écrit', async () => {
    for (const lie of ['', null]) {
      const { p, ecrits } = avecLie(lie);
      await assert.rejects(() => p, /pas de projet lié.*pas le CRM de Jérôme.*Rien n'a été écrit/);
      assert.equal(ecrits.length, 0);
    }
  });

  test('F3 projet lié présent : écrit ; la valeur lue n\'est jamais affichée ; une maison qui pointe vers l\'immeuble est retirée (donc refus sans --forcer)', async () => {
    const ok = avecLie('projet-essai-app');
    assert.equal(await ok.p, 'ecrit');
    assert.ok(!ok.affiche.join('\n').includes('projet-essai-app'));
    const versImmeuble = avecLie('projet-essai-1');
    await assert.rejects(() => versImmeuble.p, (e) => /entrée\(s\) retirée\(s\)/.test(e.message) && !e.message.includes('projet-essai-1'));
    assert.ok(!versImmeuble.affiche.join('\n').includes('projet-essai-1'));
    assert.equal(versImmeuble.ecrits.length, 0);
  });

  test('F3 lireProjetLie (faux lecteur, aucun appel réseau) : lit reglages_maison/maison, rend le champ, vide si 404 ou absent, erreur sans valeur sinon', async () => {
    const appels = [];
    const reponse = (status, corps) => async (url, options) => { appels.push([url, options.method]); return { status, json: async () => corps }; };
    assert.equal(await lireProjetLie({ projet: 'projet-essai-os', jeton: 'j', requete: reponse(200, { fields: { projet_plateforme_lie: { stringValue: ' projet-essai-app ' } } }) }), 'projet-essai-app');
    assert.match(appels[0][0], /\/projects\/projet-essai-os\/databases\/\(default\)\/documents\/reglages_maison\/maison$/);
    assert.equal(appels[0][1], 'GET');
    assert.equal(await lireProjetLie({ projet: 'projet-essai-os', jeton: 'j', requete: reponse(200, { fields: {} }) }), '');
    assert.equal(await lireProjetLie({ projet: 'projet-essai-os', jeton: 'j', requete: reponse(404, {}) }), '');
    await assert.rejects(() => lireProjetLie({ projet: 'projet-essai-os', jeton: 'j', requete: reponse(403, { error: { status: 'PERMISSION_DENIED' } }) }), /PERMISSION_DENIED/);
  });
});

describe('F4 releverBatiments : la valeur rendue porte le même statut que le journal', () => {
  test('F4 une écriture échouée : statut « erreur » dans la valeur rendue ET dans le journal', async () => {
    const journal = [];
    const os = fauxOs({ transaction: async () => { throw new Error('écriture refusée'); } });
    const r = await releverBatiments({ dbOs: () => os, dbApp: async () => fauxOs(), ouvrirBase: () => null, horodatage: () => 1, delaiMs: 200, journal: (e) => journal.push(e) });
    assert.deepEqual(r.resultats, { os: 'erreur', immeuble: 'erreur' });
    assert.equal(r.statut, 'erreur');
    assert.equal(journal[0].statut, 'erreur');
  });

  test('F4 tout s\'est bien passé : « ok » des deux côtés', async () => {
    const journal = [];
    const r = await releverBatiments({ dbOs: () => fauxOs(), dbApp: async () => fauxOs(), ouvrirBase: () => null, horodatage: () => 1, delaiMs: 200, journal: (e) => journal.push(e) });
    assert.equal(r.statut, 'ok');
    assert.equal(journal[0].statut, 'ok');
  });
});

describe('F5 validateur : un projet à lire par maison, jamais celui de l\'immeuble lié', () => {
  test('F5 deux maisons avec le même projet à lire : la seconde est retirée avec un motif sans valeur', () => {
    const r = validerRegistre({ batiments: [MAISON, { ...MAISON, cle: 'maison-b' }] });
    assert.deepEqual(r.batiments.map((b) => b.cle), ['maison-a']);
    assert.deepEqual(r.motifs, ['bâtiment 2 ignoré (projet à lire déjà pris par une autre maison)']);
  });

  test('F5 projet à lire égal à celui de l\'immeuble (passé en option) : retiré ; sans l\'option, accepté', () => {
    const r = validerRegistre({ batiments: [MAISON] }, { projetImmeuble: 'projet-essai-1' });
    assert.deepEqual(r.batiments, []);
    assert.deepEqual(r.motifs, ['bâtiment 1 ignoré (le projet à lire est celui de l\'immeuble)']);
    assert.equal(validerRegistre({ batiments: [MAISON] }).batiments.length, 1);
    assert.equal(validerRegistre({ batiments: [MAISON, { ...MAISON, cle: 'maison-b', lecture_projet: null }] }).batiments.length, 2, 'deux maisons sans projet à lire : acceptées');
  });

  test('F5 le serveur passe le projet de l\'immeuble au validateur (lecture pour l\'écran et relevé horaire)', async () => {
    const s = lire('functions/src/index.js');
    assert.match(s, /lireBatimentsConsole\(\{[^}]*projetImmeuble: await projetImmeubleOuNull\(\)/);
    assert.match(s, /releverBatiments\(\{[^}]*projetImmeuble: await projetImmeubleOuNull\(\)/);
    assert.match(s, /texteDe\('projet_plateforme_lie'\)/);
    // Le relevé ne lit pas une maison qui pointe vers l'immeuble.
    const os = {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ batiments: [MAISON] }) }), collection: () => ({ doc: () => refVide }) }) }),
      runTransaction: async (f) => f({ get: async () => ({ exists: false }), set: () => {} }),
    };
    let ouvertes = 0;
    const r = await releverBatiments({ dbOs: () => os, dbApp: async () => fauxOs(), ouvrirBase: () => { ouvertes += 1; return fauxOs(); }, projetImmeuble: 'projet-essai-1', horodatage: () => 1, delaiMs: 200 });
    assert.deepEqual(Object.keys(r.resultats), ['os', 'immeuble']);
    assert.equal(ouvertes, 0);
  });
});

describe('F6 export : seulement ce que l\'écran montre', () => {
  test('F6 releveAffiche garde les champs de l\'écran et retire le reste (projet à lire, champs inconnus, structure de base)', () => {
    const r = releveAffiche({
      version: '2.59.0', structure_code: 1, structure_base: 1, version_depuis: '2026-11-28T09:00:00.000Z', dernier_contact_ok: '2026-11-28T10:15:00.000Z',
      dernier_essai: '2026-11-28T10:15:00.000Z', motif: 'inconnu', lecture_projet: 'projet-essai-1', autre: 'x',
      historique: [{ version: '2.59.0', de_version: '2.58.0', structure_code: 1, de_structure: 1, le: '2026-11-28T09:15:00.000Z', lecture_projet: 'projet-essai-1' }],
    });
    assert.deepEqual(Object.keys(r), ['version', 'version_depuis', 'structure_code', 'dernier_contact_ok', 'dernier_essai', 'motif', 'historique']);
    assert.equal(r.motif, null, 'motif inconnu : non exporté');
    assert.deepEqual(Object.keys(r.historique[0]), ['version', 'de_version', 'structure_code', 'de_structure', 'le']);
    assert.ok(!JSON.stringify(r).includes('projet-essai'));
    assert.equal(releveAffiche({ motif: 'injoignable' }).motif, 'injoignable');
    assert.equal(releveAffiche(null), null);
    assert.equal(releveAffiche([]), null);
  });

  test('F6 export.js : appartements = nom et modules, maisons = clé, nom, état, projets, relevés filtrés ; jamais le relevé brut', () => {
    const exp = lire('js/modules/console/export.js');
    assert.match(exp, /appartements\.map\(\(a\) => \(\{ nom: a\.nom, modules: a\.modules \}\)\)/);
    assert.match(exp, /maisons\.map\(\(m\) => \(\{ cle: m\.cle, nom: m\.nom, etat: m\.etat, projets: m\.projets \}\)\)/);
    assert.match(exp, /LC\.releveAffiche\(rel\)/);
    assert.doesNotMatch(exp, /\.\.\.r\.maisons,|Object\.entries\(r\.releves\)\.map\(\(\[cle, rel\]\) => \(\{ cle, \.\.\.rel \}\)\)/);
  });
});

describe('F8 schéma : avec 1 ou 2 appartements, les étages partent du bas', () => {
  test('F8 schema.js place « À venir » en haut et décale les autres étages vers le bas quand il y en a moins de 4', () => {
    const s = lire('js/modules/console/schema.js');
    assert.match(s, /const decalage = Math\.max\(0, 4 - etages\.length\)/);
    assert.match(s, /\(i === 0 \? 0 : i \+ decalage\) \* pas/);
  });
});
