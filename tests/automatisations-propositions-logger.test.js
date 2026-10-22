// Le « Logger » de la file « À valider » : une ligne naît « en préparation » au démarrage du workflow A, ses étapes s'allument une à une, puis elle est finalisée ou abandonnée.
// Fichier pur js/modules/automatisations/propositions.js (critères 1 à 5 de la PR 5, partie données).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETATS, ETATS_TERMINAUX, DELAI_BLOQUEE_MS, MAX_ETAPES, demarrer, ajouterEtape, finaliser, abandonner, estBloquee,
  valider, refuser, relancer, marquerAppliquee, marquerEchec, estPerimee, enMs, frise,
} from '../js/modules/automatisations/propositions.js';

const T0 = Date.UTC(2026, 10, 3, 9, 0);
const MIN = 60 * 1000;
const JOUR = 24 * 60 * MIN;
const PLAN = [{ cle: 'a-lire', libelle: 'Lire le message' }, { cle: 'a-extraire', libelle: 'Extraire les champs' }, { cle: 'a-deposer', libelle: 'Déposer' }];
const CHAMPS = [{ nom: 'Nom', valeur: 'Dupont' }, { nom: 'Ville', valeur: 'Lyon' }];
const DECIDE = { par: 'jerome@example.org', canal: 'interface', maintenant: T0 + 1000 };

const neuve = (plus = {}) => demarrer({ id: 'p1', type: 'Brouillon', titre: 'Un titre', executionId: '77', plan: PLAN, maintenant: T0, ...plus }).proposition;
const aValider = () => finaliser(neuve(), { titre: 'Titre final', resume: 'Résumé', champs: CHAMPS, lien: 'https://example.org/x', maintenant: T0 + MIN }).proposition;
const etatsEtapes = (p) => p.etapes.map((e) => e.etat);

describe('logger : données', () => {
  test('1. demarrer crée une ligne en_preparation avec son plan à venir ; le titre est facultatif ; rejouer le calcul ne change rien', () => {
    const r = demarrer({ id: 'p1', type: 'Brouillon', titre: 'Un titre', executionId: '77', plan: PLAN, maintenant: T0 });
    assert.equal(r.ok, true);
    const p = r.proposition;
    assert.equal(p.etat, 'en_preparation');
    assert.deepEqual(p.champsProposes, []); assert.equal(p.champsValides, null);
    assert.equal(p.resume, ''); assert.equal(p.lien, null); assert.equal(p.expireLe, null); assert.equal(p.source, 'porte');
    assert.ok(p.creeLe instanceof Date && p.creeLe.getTime() === T0);
    assert.deepEqual(p.executions, { proposer: '77', appliquer: null, refuser: null });
    assert.deepEqual(p.etapes, PLAN.map((e) => ({ ...e, etat: 'a_venir' })), 'toutes à venir, aucune date');
    assert.ok(p.etapes.every((e) => !('le' in e)));
    assert.equal(p.tentatives, 0); assert.equal(p.derniereErreur, null);
    // Titre facultatif : le type sert de titre. Pas de plan : pas d'étape.
    const sans = demarrer({ id: 'p2', type: 'Brouillon', maintenant: T0 }).proposition;
    assert.equal(sans.titre, 'Brouillon'); assert.deepEqual(sans.etapes, []);
    assert.deepEqual(demarrer({ id: 'p1', type: 'Brouillon', titre: 'Un titre', executionId: '77', plan: PLAN, maintenant: T0 }), r, 'le même appel donne la même ligne');
    // Plan invalide : vide, plus de 10, clé en double, clé ou libellé invalide.
    for (const plan of [[], Array.from({ length: 11 }, (_, i) => ({ cle: `e${i}`, libelle: 'x' })), [PLAN[0], PLAN[0]], [{ cle: 'A B', libelle: 'x' }], [{ cle: 'ok', libelle: '' }], [{ cle: 'ok', libelle: 'x'.repeat(61) }], 'texte']) {
      const refus = demarrer({ id: 'p1', type: 'T', plan, maintenant: T0 });
      assert.equal(refus.ok, false, JSON.stringify(plan).slice(0, 40)); assert.equal(refus.code, 'champs_invalides');
    }
    assert.equal(demarrer({ id: 'MAJ', type: 'T', maintenant: T0 }).code, 'champs_invalides');
    assert.equal(demarrer({ id: 'p1', type: 'x'.repeat(41), maintenant: T0 }).code, 'champs_invalides');
  });

  test('2. ajouterEtape met à jour par clé dans l\'ordre du plan, refuse la 11e, refuse hors préparation et rejouer ne change rien', () => {
    let p = neuve();
    const t1 = T0 + 5 * MIN;
    let r = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire le message', etat: 'en_cours', maintenant: t1 });
    assert.equal(r.ok, true);
    assert.deepEqual(etatsEtapes(r.proposition), ['en_cours', 'a_venir', 'a_venir']);
    assert.equal(r.proposition.etapes[0].le.getTime(), t1, 'le est posé à la première mise à jour');
    assert.ok(!('le' in r.proposition.etapes[1]));
    assert.deepEqual(etatsEtapes(p), ['a_venir', 'a_venir', 'a_venir'], 'l\'entrée n\'est jamais modifiée');
    p = r.proposition;
    r = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire le message', etat: 'fait', maintenant: t1 + MIN });
    assert.deepEqual(etatsEtapes(r.proposition), ['fait', 'a_venir', 'a_venir']);
    p = r.proposition;
    // Rejouer à l'identique : rien ne change (inchangee), même `le`.
    const rejeu = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire le message', etat: 'fait', maintenant: t1 + 9 * MIN });
    assert.equal(rejeu.ok, true); assert.equal(rejeu.inchangee, true);
    assert.deepEqual(rejeu.proposition.etapes, p.etapes);
    // Une clé hors plan s'ajoute à la fin ; l'ordre du plan ne bouge jamais.
    r = ajouterEtape(p, { cle: 'b-envoi', libelle: 'Envoyer', etat: 'en_cours', maintenant: t1 });
    assert.deepEqual(r.proposition.etapes.map((e) => e.cle), ['a-lire', 'a-extraire', 'a-deposer', 'b-envoi']);
    r = ajouterEtape(r.proposition, { cle: 'a-extraire', libelle: 'Extraire les champs', etat: 'fait', maintenant: t1 });
    assert.deepEqual(r.proposition.etapes.map((e) => e.cle), ['a-lire', 'a-extraire', 'a-deposer', 'b-envoi']);
    // 10 au total : la 11e nouvelle clé est refusée, mais une clé existante se met toujours à jour.
    let pleine = neuve({ plan: Array.from({ length: MAX_ETAPES }, (_, i) => ({ cle: `e${i}`, libelle: `Étape ${i}` })) });
    assert.equal(pleine.etapes.length, 10);
    const onze = ajouterEtape(pleine, { cle: 'e-onze', libelle: 'Trop', etat: 'en_cours', maintenant: t1 });
    assert.equal(onze.ok, false); assert.equal(onze.code, 'champs_invalides');
    assert.equal(ajouterEtape(pleine, { cle: 'e3', libelle: 'Étape 3', etat: 'en_cours', maintenant: t1 }).ok, true);
    // a_venir n'entre que par demarrer ; clé, libellé et état invalides.
    assert.equal(ajouterEtape(p, { cle: 'a-extraire', libelle: 'x', etat: 'a_venir', maintenant: t1 }).code, 'champs_invalides');
    for (const mauvais of [{ cle: 'Majuscule' }, { cle: '' }, { libelle: '' }, { libelle: 'x'.repeat(61) }, { libelle: 'x\u0007y' }, { etat: 'termine' }]) {
      assert.equal(ajouterEtape(p, { cle: 'a-lire', libelle: 'ok', etat: 'fait', maintenant: t1, ...mauvais }).code, 'champs_invalides', JSON.stringify(mauvais));
    }
    // Permis seulement en préparation (A) et validée (B).
    const base = { cle: 'x', libelle: 'x', etat: 'en_cours', maintenant: t1 };
    for (const etat of ['a_valider', 'appliquee', 'refusee', 'echec', 'abandonnee']) {
      const refus = ajouterEtape({ ...aValider(), etat }, base);
      assert.equal(refus.ok, false, etat); assert.equal(refus.code, 'transition_interdite', etat);
    }
    assert.equal(ajouterEtape({ ...aValider(), etat: 'validee' }, base).ok, true, 'étapes de B pendant l\'application');
  });

  test('2 bis. une chaîne ne recule pas : fait et ignoree restent, echec ne peut que passer à fait', () => {
    const avec = (etat) => ({ ...neuve(), etapes: [{ cle: 'k', libelle: 'K', etat, le: new Date(T0) }] });
    const essai = (depuis, vers) => ajouterEtape(avec(depuis), { cle: 'k', libelle: 'K', etat: vers, maintenant: T0 + MIN });
    for (const [depuis, vers] of [['fait', 'en_cours'], ['fait', 'echec'], ['fait', 'ignoree'], ['echec', 'en_cours'], ['echec', 'ignoree'], ['ignoree', 'en_cours'], ['ignoree', 'fait']]) {
      const r = essai(depuis, vers);
      assert.equal(r.ok, false, `${depuis} vers ${vers}`); assert.equal(r.code, 'transition_interdite', `${depuis} vers ${vers}`);
    }
    for (const [depuis, vers] of [['a_venir', 'en_cours'], ['a_venir', 'ignoree'], ['en_cours', 'fait'], ['en_cours', 'echec'], ['echec', 'fait']]) {
      assert.equal(essai(depuis, vers).ok, true, `${depuis} vers ${vers}`);
    }
  });

  test('3. finaliser passe à a_valider, pose expireLe à +30 jours, ne touche pas aux étapes ; hors préparation c\'est interdit', () => {
    const avant = ajouterEtape(neuve(), { cle: 'a-lire', libelle: 'Lire le message', etat: 'fait', maintenant: T0 + 2 * MIN }).proposition;
    const r = finaliser(avant, { titre: ' Titre final ', resume: 'Un résumé\nsur 2 lignes', champs: CHAMPS, lien: 'https://example.org/x', executionId: '88', maintenant: T0 + 3 * MIN });
    assert.equal(r.ok, true);
    const p = r.proposition;
    assert.equal(p.etat, 'a_valider'); assert.equal(p.titre, 'Titre final'); assert.equal(p.resume, 'Un résumé\nsur 2 lignes');
    assert.deepEqual(p.champsProposes, CHAMPS); assert.notEqual(p.champsProposes, CHAMPS, 'copie');
    assert.equal(p.lien, 'https://example.org/x');
    assert.ok(p.expireLe instanceof Date);
    assert.equal(p.expireLe.getTime(), T0 + 3 * MIN + 30 * JOUR);
    assert.equal(estPerimee(p, T0 + 3 * MIN + 30 * JOUR + 1), true);
    assert.deepEqual(p.etapes, avant.etapes, 'finaliser ne touche pas aux étapes');
    assert.equal(p.executions.proposer, '88');
    assert.equal(avant.etat, 'en_preparation', 'l\'entrée n\'est pas modifiée');
    // Sans executionId, celui du démarrage reste.
    assert.equal(finaliser(neuve(), { titre: 'T', champs: CHAMPS, maintenant: T0 }).proposition.executions.proposer, '77');
    // Une fois finalisée, la ligne se valide normalement.
    assert.equal(valider(p, DECIDE).ok, true);
    // Hors préparation : transition_interdite. Contenu invalide : champs_invalides.
    for (const etat of ['a_valider', 'validee', 'refusee', 'abandonnee']) assert.equal(finaliser({ ...aValider(), etat }, { titre: 'T', champs: CHAMPS, maintenant: T0 }).code, 'transition_interdite', etat);
    for (const mauvais of [{ champs: [] }, { champs: [{ nom: 'a', valeur: 'x' }, { nom: 'a', valeur: 'y' }] }, { champs: Array.from({ length: 41 }, (_, i) => ({ nom: `c${i}`, valeur: 'x' })) },
      { champs: [{ nom: 'a', valeur: 'x'.repeat(501) }] }, { champs: [{ nom: 'a', valeur: 'x\u0000' }] }, { titre: '' }, { titre: 'x'.repeat(121) }, { resume: 'x'.repeat(2001) }, { lien: 'javascript:alert(1)' }]) {
      assert.equal(finaliser(neuve(), { titre: 'T', champs: CHAMPS, maintenant: T0, ...mauvais }).code, 'champs_invalides', JSON.stringify(mauvais).slice(0, 50));
    }
  });

  test('4. abandonner passe à abandonnee : en_cours vers echec, a_venir vers ignoree, fait reste ; terminal et refusé hors préparation', () => {
    let p = neuve();
    p = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire le message', etat: 'fait', maintenant: T0 + MIN }).proposition;
    p = ajouterEtape(p, { cle: 'a-extraire', libelle: 'Extraire les champs', etat: 'en_cours', maintenant: T0 + 2 * MIN }).proposition;
    const r = abandonner(p, { erreur: `${'x'.repeat(250)}`, maintenant: T0 + 3 * MIN });
    assert.equal(r.ok, true);
    assert.equal(r.proposition.etat, 'abandonnee');
    assert.equal(r.proposition.derniereErreur.length, 200);
    assert.deepEqual(etatsEtapes(r.proposition), ['fait', 'echec', 'ignoree']);
    assert.equal(r.proposition.etapes[1].le.getTime(), T0 + 3 * MIN);
    assert.deepEqual(etatsEtapes(p), ['fait', 'en_cours', 'a_venir'], 'entrée intacte');
    assert.ok(ETATS_TERMINAUX.includes('abandonnee'));
    assert.equal(abandonner(r.proposition, { erreur: 'x' }).code, 'transition_interdite', 'déjà abandonnée : le rejeu est géré par la porte');
    assert.equal(abandonner(aValider(), { erreur: 'x' }).code, 'transition_interdite');
    // Sans erreur : texte par défaut ; abandon à la main : qui l'a fait.
    assert.equal(abandonner(neuve(), { maintenant: T0 }).proposition.derniereErreur, 'Erreur inconnue');
    const humain = abandonner(neuve(), { erreur: 'stop', par: 'jerome@example.org', canal: 'interface', maintenant: T0 }).proposition;
    assert.equal(humain.abandonneePar, 'jerome@example.org'); assert.equal(humain.canal, 'interface');
    // La frise d'une ligne abandonnée.
    assert.deepEqual(frise(r.proposition).map((e) => e.etat), ['fait', 'echec', 'ignoree', 'ignoree', 'ignoree']);
  });

  test('4 bis. fin de vie des étapes : refuser, marquerAppliquee, marquerEchec ; valider et finaliser n\'y touchent pas', () => {
    // Le plan de B est annoncé d'avance : tout reste à venir pendant a_valider et validee.
    let p = neuve({ plan: [{ cle: 'a-lire', libelle: 'Lire' }, { cle: 'b-creer', libelle: 'Créer' }, { cle: 'b-prevenir', libelle: 'Prévenir' }] });
    p = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire', etat: 'fait', maintenant: T0 }).proposition;
    p = finaliser(p, { titre: 'T', champs: CHAMPS, maintenant: T0 + MIN }).proposition;
    assert.deepEqual(etatsEtapes(p), ['fait', 'a_venir', 'a_venir']);
    const validee = valider(p, DECIDE).proposition;
    assert.deepEqual(etatsEtapes(validee), ['fait', 'a_venir', 'a_venir'], 'valider ne touche pas aux étapes');
    // refuser : a_venir et en_cours deviennent ignoree.
    const enCours = { ...p, etapes: p.etapes.map((e) => (e.cle === 'b-creer' ? { ...e, etat: 'en_cours', le: new Date(T0) } : e)) }; // cas limite : une étape déjà lancée
    assert.deepEqual(etatsEtapes(refuser(enCours, DECIDE).proposition), ['fait', 'ignoree', 'ignoree']);
    assert.deepEqual(etatsEtapes(refuser(p, DECIDE).proposition), ['fait', 'ignoree', 'ignoree']);
    // marquerAppliquee : en_cours devient fait, a_venir devient ignoree.
    const b = ajouterEtape(validee, { cle: 'b-creer', libelle: 'Créer', etat: 'en_cours', maintenant: T0 + 5 * MIN }).proposition;
    const finie = marquerAppliquee(b, { executionId: '9', maintenant: T0 + 6 * MIN }).proposition;
    assert.deepEqual(etatsEtapes(finie), ['fait', 'fait', 'ignoree']);
    assert.equal(finie.etapes[1].le.getTime(), T0 + 6 * MIN);
    // marquerEchec : en_cours devient echec, a_venir RESTE (B reprendra après relancer).
    const echec = marquerEchec(b, { erreur: 'boum', maintenant: T0 + 6 * MIN }).proposition;
    assert.deepEqual(etatsEtapes(echec), ['fait', 'echec', 'a_venir']);
    const relancee = relancer(echec, { maintenant: T0 + 7 * MIN }).proposition;
    assert.deepEqual(etatsEtapes(relancee), ['fait', 'echec', 'a_venir'], 'relancer ne touche pas aux étapes');
    const reprise = ajouterEtape(relancee, { cle: 'b-creer', libelle: 'Créer', etat: 'fait', maintenant: T0 + 8 * MIN });
    assert.equal(reprise.ok, true, 'echec vers fait : la reprise est permise');
    assert.deepEqual(etatsEtapes(marquerAppliquee(reprise.proposition, { maintenant: T0 + 9 * MIN }).proposition), ['fait', 'fait', 'ignoree']);
    // Sans étape, rien ne casse.
    assert.deepEqual(marquerEchec({ ...validee, etapes: [] }, { erreur: 'x' }).proposition.etapes, []);
  });

  test('5. valider, refuser et relancer renvoient pas_prete en préparation et abandonnee si abandonnée ; deja_decidee ne change pas', () => {
    const prete = neuve();
    const abandonnee = abandonner(neuve(), { erreur: 'x', maintenant: T0 }).proposition;
    for (const [nom, agir] of [['valider', (x) => valider(x, DECIDE)], ['refuser', (x) => refuser(x, DECIDE)], ['relancer', (x) => relancer(x, { maintenant: T0 })]]) {
      const a = agir(prete);
      assert.equal(a.ok, false, nom); assert.equal(a.code, 'pas_prete', nom); assert.equal(a.message, 'Cette proposition est encore en préparation.', nom);
      const b = agir(abandonnee);
      assert.equal(b.ok, false, nom); assert.equal(b.code, 'abandonnee', nom); assert.equal(b.message, 'Ce traitement a été abandonné.', nom);
    }
    // marquerAppliquee / marquerEchec gardent transition_interdite pour les deux nouveaux états.
    for (const x of [prete, abandonnee]) {
      assert.equal(marquerAppliquee(x, {}).code, 'transition_interdite');
      assert.equal(marquerEchec(x, { erreur: 'x' }).code, 'transition_interdite');
    }
    // Les cas de course ne changent pas.
    const validee = valider(aValider(), DECIDE).proposition;
    assert.equal(valider(validee, DECIDE).code, 'deja_decidee');
    assert.match(valider(validee, DECIDE).message, /^Déjà décidée par jerome@example\.org à \d\d:\d\d\.$/);
  });

  test('5 bis. estBloquee : plus de 15 minutes sans nouvelle étape, calculé sur creeLe et sur les étapes', () => {
    assert.equal(DELAI_BLOQUEE_MS, 15 * MIN);
    const p = neuve();
    assert.equal(estBloquee(p, T0 + 15 * MIN), false, 'pile 15 minutes : pas encore');
    assert.equal(estBloquee(p, T0 + 15 * MIN + 1), true);
    const avance = ajouterEtape(p, { cle: 'a-lire', libelle: 'Lire', etat: 'en_cours', maintenant: T0 + 10 * MIN }).proposition;
    assert.equal(estBloquee(avance, T0 + 25 * MIN), false, 'une nouvelle étape repousse le délai');
    assert.equal(estBloquee(avance, T0 + 25 * MIN + 1), true);
    // Les dates peuvent être des nombres ou des objets de type Timestamp.
    assert.equal(estBloquee({ ...p, creeLe: { toMillis: () => T0 } }, T0 + 20 * MIN), true);
    assert.equal(enMs({ toMillis: () => 5 }), 5);
    // Seule une ligne en préparation peut être bloquée.
    for (const etat of ['a_valider', 'validee', 'abandonnee', 'appliquee']) assert.equal(estBloquee({ ...p, etat }, T0 + JOUR), false, etat);
    assert.equal(estBloquee(null, T0), false);
  });

  test('6. les nouveaux états sont déclarés', () => {
    assert.equal(ETATS.EN_PREPARATION, 'en_preparation'); assert.equal(ETATS.ABANDONNEE, 'abandonnee');
    assert.equal(Object.values(ETATS).length, 7);
  });
});
