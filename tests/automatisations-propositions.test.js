// File « À valider » : états et transitions (fichier pur js/modules/automatisations/propositions.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ETATS, ETATS_TERMINAUX, libelleEtat, estPerimee, peutPasser, valider, refuser, marquerAppliquee, marquerEchec, relancer, frise,
} from '../js/modules/automatisations/propositions.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.UTC(2026, 9, 22, 8, 0); // 22/10/2026 10:00 à Paris
const JOUR = 24 * 60 * 60 * 1000;

const base = (etat = 'a_valider', plus = {}) => ({
  id: 'p1', type: 'Brouillon', titre: 'Titre', resume: 'Résumé', lien: null, etat,
  champsProposes: [{ nom: 'a', valeur: '1' }, { nom: 'b', valeur: '2' }], champsValides: null,
  creeLe: T0, expireLe: T0 + 30 * JOUR, valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null,
  raison: null, tentatives: 0, derniereErreur: null, executions: { proposer: 5, appliquer: null, refuser: null }, etapes: [], source: 'porte', ...plus,
});
const gele = (o) => JSON.parse(JSON.stringify(o));
const DECIDE = { par: 'jerome@example.org', canal: 'interface', maintenant: T0 + 1000 };

describe('propositions : transitions', () => {
  test('1. chaque transition autorisée marche et ne mute jamais son entrée', () => {
    const cas = [
      [base('a_valider'), (p) => valider(p, DECIDE), 'validee'],
      [base('a_valider'), (p) => refuser(p, { ...DECIDE, raison: 'non' }), 'refusee'],
      [base('validee'), (p) => marquerAppliquee(p, { executionId: 'e9', maintenant: T0 }), 'appliquee'],
      [base('validee'), (p) => marquerEchec(p, { erreur: 'boum', maintenant: T0 }), 'echec'],
      [base('echec', { tentatives: 2, derniereErreur: 'x' }), (p) => relancer(p, { maintenant: T0 }), 'validee'],
    ];
    for (const [p, agir, attendu] of cas) {
      const avant = gele(p);
      const r = agir(p);
      assert.equal(r.ok, true, attendu);
      assert.equal(r.proposition.etat, attendu);
      assert.deepEqual(p, avant, `entrée mutée pour ${attendu}`);
      assert.notEqual(r.proposition, p);
    }
    const r = valider(base(), DECIDE).proposition;
    assert.equal(r.valideePar, DECIDE.par); assert.equal(r.valideeLe.getTime(), DECIDE.maintenant); assert.equal(r.canal, 'interface');
    assert.equal(marquerAppliquee(base('validee'), { executionId: 'e9' }).proposition.executions.appliquer, 'e9');
    const e = marquerEchec(base('validee'), { erreur: 'x'.repeat(500) }).proposition;
    assert.equal(e.tentatives, 1); assert.equal(e.derniereErreur.length, 200);
    const re = relancer(base('echec', { tentatives: 3, derniereErreur: 'x' })).proposition;
    assert.equal(re.tentatives, 0); assert.equal(re.derniereErreur, null);
    assert.equal(refuser(base(), { ...DECIDE, raison: 'pas bon' }).proposition.raison, 'pas bon');
    // Les horodatages ne sont jamais détruits par la copie : une Date ou un objet Firestore (toMillis) ressort inchangé.
    const fin = new Date(T0 + 30 * JOUR);
    assert.equal(valider(base('a_valider', { expireLe: fin }), DECIDE).proposition.expireLe, fin);
    const horodatage = { seconds: 1, nanoseconds: 0, toMillis: () => T0 + 30 * JOUR };
    const apres = valider(base('a_valider', { expireLe: horodatage }), DECIDE).proposition;
    assert.equal(apres.expireLe, horodatage);
    assert.equal(estPerimee(apres, T0 + 31 * JOUR), true, 'la péremption reste détectée après une transition');
    // Sans date fournie, la date du jour est prise ; une date illisible est refusée.
    assert.ok(valider(base(), { par: 'a@b.c', canal: 'interface' }).proposition.valideeLe instanceof Date);
    assert.equal(valider(base(), { par: 'a@b.c', canal: 'interface', maintenant: 'n’importe quoi' }).code, 'champs_invalides');
    // relancer pose relanceeLe (l'alerte des 30 minutes se calcule dessus).
    assert.equal(relancer(base('echec'), { maintenant: T0 }).proposition.relanceeLe.getTime(), T0);
  });

  test('2. toute autre transition renvoie transition_interdite', () => {
    const tous = Object.values(ETATS);
    for (const etat of tous) {
      for (const [nom, agir, vers] of [
        ['marquerAppliquee', (p) => marquerAppliquee(p, {}), 'appliquee'],
        ['marquerEchec', (p) => marquerEchec(p, { erreur: 'x' }), 'echec'],
        ['relancer', (p) => relancer(p, {}), 'validee'],
      ]) {
        const r = agir(base(etat));
        if (peutPasser(etat, vers) && (nom !== 'relancer' || etat === 'echec')) assert.equal(r.ok, true, `${nom} depuis ${etat}`);
        else { assert.equal(r.ok, false, `${nom} depuis ${etat}`); assert.equal(r.code, 'transition_interdite', `${nom} depuis ${etat}`); }
      }
    }
    // La table : seules 5 transitions existent.
    let n = 0;
    for (const de of tous) for (const vers of tous) if (peutPasser(de, vers)) n++;
    assert.equal(n, 5);
    assert.equal(peutPasser('appliquee', 'validee'), false);
    assert.equal(peutPasser('refusee', 'validee'), false);
    assert.equal(peutPasser('a_valider', 'appliquee'), false);
    assert.equal(peutPasser('inconnu', 'validee'), false);
    assert.deepEqual([...ETATS_TERMINAUX].sort(), ['appliquee', 'refusee']);
    assert.equal(libelleEtat('echec'), 'En échec'); assert.equal(libelleEtat('zzz'), 'Inconnu');
  });

  test('3. valider deux fois ou après un refus renvoie deja_decidee avec le même texte', () => {
    const validee = valider(base(), DECIDE).proposition;
    const deux = valider(validee, { ...DECIDE, par: 'autre@example.org' });
    assert.equal(deux.ok, false); assert.equal(deux.code, 'deja_decidee');
    assert.equal(deux.message, 'Déjà décidée par jerome@example.org à 10:00.');
    const refusee = refuser(base(), { par: 'jerome@example.org', canal: 'mcp', maintenant: T0 }).proposition;
    const apres = valider(refusee, DECIDE);
    assert.equal(apres.code, 'deja_decidee');
    assert.equal(apres.message, 'Déjà décidée par jerome@example.org à 10:00.');
    assert.equal(refuser(refusee, DECIDE).message, apres.message);
    assert.equal(refuser(validee, DECIDE).message, deux.message);
    assert.match(deux.message, /^Déjà décidée par .+ à \d\d:\d\d\.$/);
    // Une proposition déjà appliquée ou en échec a aussi été décidée.
    assert.equal(valider({ ...validee, etat: 'appliquee' }, DECIDE).code, 'deja_decidee');
    assert.equal(valider({ ...validee, etat: 'echec' }, DECIDE).code, 'deja_decidee');
  });

  test('4. une proposition périmée ne peut plus être validée mais peut être refusée', () => {
    const p = base();
    const tard = T0 + 30 * JOUR + 1;
    assert.equal(estPerimee(p, T0 + 30 * JOUR), false);
    assert.equal(estPerimee(p, tard), true);
    const v = valider(p, { ...DECIDE, maintenant: tard });
    assert.equal(v.ok, false); assert.equal(v.code, 'perimee');
    const r = refuser(p, { ...DECIDE, maintenant: tard });
    assert.equal(r.ok, true); assert.equal(r.proposition.etat, 'refusee');
    // Une proposition déjà validée n'est pas « périmée » : elle est déjà décidée.
    assert.equal(valider(base('validee', { valideePar: 'a@b.c', valideeLe: T0 }), { ...DECIDE, maintenant: tard }).code, 'deja_decidee');
  });

  test('5. champsProposes ne change jamais ; les champs fournis reprennent exactement les noms et vont dans champsValides', () => {
    const p = base();
    const ok = valider(p, { ...DECIDE, champs: [{ nom: 'b', valeur: 'deux' }, { nom: 'a', valeur: '1' }] });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.proposition.champsProposes, p.champsProposes);
    assert.deepEqual(ok.proposition.champsValides, [{ nom: 'b', valeur: 'deux' }, { nom: 'a', valeur: '1' }]);
    // Sans champs : on valide tel que proposé.
    assert.deepEqual(valider(p, DECIDE).proposition.champsValides, p.champsProposes);
    const faux = [
      [{ nom: 'a', valeur: '1' }], // un nom en moins
      [{ nom: 'a', valeur: '1' }, { nom: 'b', valeur: '2' }, { nom: 'c', valeur: '3' }], // un nom en plus
      [{ nom: 'a', valeur: '1' }, { nom: 'z', valeur: '2' }], // nom inconnu
      [{ nom: 'a', valeur: '1' }, { nom: 'a', valeur: '2' }], // doublon
      [{ nom: 'a', valeur: '1' }, { nom: 'b', valeur: 2 }], // valeur pas en texte
      [{ nom: 'a', valeur: '1' }, { nom: 'b', valeur: 'x'.repeat(501) }],
      [{ nom: 'a', valeur: '1' }, { nom: 'b', valeur: 'x\u0000y' }],
      'pas une liste', [],
    ];
    for (const champs of faux) {
      const r = valider(p, { ...DECIDE, champs });
      assert.equal(r.ok, false, JSON.stringify(champs)); assert.equal(r.code, 'champs_invalides');
    }
    assert.equal(valider(p, { par: '', canal: 'interface', maintenant: T0 }).code, 'champs_invalides');
    assert.equal(valider(p, { par: 'a@b.c', canal: 'sms', maintenant: T0 }).code, 'champs_invalides');
    assert.equal(refuser(p, { ...DECIDE, raison: 'x'.repeat(201) }).code, 'champs_invalides');
    assert.equal(refuser(p, { ...DECIDE, raison: '' }).proposition.raison, null);
  });

  test('6. frise donne la bonne étape en cours pour chacun des 5 états, et echec / relancer bouclent', () => {
    const etats = (p, t) => frise(p, t).map((e) => e.etat);
    assert.deepEqual(frise(base()).map((e) => e.libelle), ['Reçu', 'Proposé', 'En attente de validation', 'Validé ou Refusé', 'Appliqué ou En échec']);
    assert.deepEqual(etats(base('a_valider')), ['fait', 'fait', 'en_cours', 'a_venir', 'a_venir']);
    assert.deepEqual(etats(base('validee')), ['fait', 'fait', 'fait', 'fait', 'en_cours']);
    assert.deepEqual(etats(base('appliquee')), ['fait', 'fait', 'fait', 'fait', 'fait']);
    assert.deepEqual(etats(base('refusee')), ['fait', 'fait', 'fait', 'fait', 'ignoree']);
    assert.deepEqual(etats(base('echec')), ['fait', 'fait', 'fait', 'fait', 'echec']);
    assert.equal(frise(base('refusee'))[3].detail, 'Refusé');
    assert.equal(frise(base('validee'))[3].detail, 'Validé');
    assert.equal(frise(base(), T0 + 31 * JOUR)[2].detail, 'Périmée');
    // Boucle : validee -> echec -> validee -> echec -> validee -> appliquee.
    let p = valider(base(), DECIDE).proposition;
    p = marquerEchec(p, { erreur: 'une' }).proposition;
    assert.deepEqual(etats(p), ['fait', 'fait', 'fait', 'fait', 'echec']);
    p = relancer(p).proposition;
    assert.equal(p.tentatives, 0);
    assert.deepEqual(etats(p), ['fait', 'fait', 'fait', 'fait', 'en_cours']);
    p = marquerEchec(p, { erreur: 'deux' }).proposition;
    assert.equal(p.tentatives, 1);
    p = relancer(p).proposition;
    p = marquerAppliquee(p, { executionId: 'e1' }).proposition;
    assert.equal(p.etat, 'appliquee');
    assert.equal(relancer(p).code, 'transition_interdite');
    assert.equal(marquerEchec(p, { erreur: 'x' }).code, 'transition_interdite');
  });

  test('7. le fichier n\'importe ni Firebase ni le DOM', () => {
    const src = readFileSync(join(RACINE, 'js/modules/automatisations/propositions.js'), 'utf8').split('\n').map((l) => l.replace(/\/\*\*.*?\*\//g, '').replace(/\/\/.*$/, '')).join('\n'); // sans les commentaires
    assert.doesNotMatch(src, /^\s*import\s/m);
    assert.doesNotMatch(src, /firebase|firestore|document\.|window\.|innerHTML|localStorage/i);
    assert.match(readFileSync(join(RACINE, 'scripts/preparer-fonctions.js'), 'utf8'), /automatisations', 'propositions\.js'/);
  });
});
