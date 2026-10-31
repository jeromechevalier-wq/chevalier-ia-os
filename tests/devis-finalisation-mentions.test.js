// PR B (31/10/2026) : ce que la finalisation exige pour les mentions légales du devis (source : economie.gouv.fr, « devis obligatoire »).
// B1 entreprise (nom, adresse, SIRET) · B2 assurance sans crochet · B3 client, nom figé · B4 début et durée des travaux · B5 date de validité à venir.
// Un test par règle ; le nom commence par le numéro du point. node --test, sans navigateur ni base.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/modules/devis/logique.js';
import { EMETTEUR_ESSAI, AUJOURDHUI_ESSAI, OPTIONS_FINALISATION, completerPourFinaliser } from './jeu-finalisation.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90, entreprise: EMETTEUR_ESSAI };
const complet = (extra = {}) => ({
  ...completerPourFinaliser(D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages)),
  sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'l1', libelle: 'Article', unite: 'u', quantite: 1, prixAchat: 10 }] }],
  ...extra,
});
const erreurs = (devis, options = OPTIONS_FINALISATION) => D.erreursFinalisation(devis, options);
const sansCle = (objet, ...cles) => Object.fromEntries(Object.entries(objet).filter(([k]) => !cles.includes(k)));

describe('B0 le jeu d’essai complet se finalise', () => {
  test('B0 un devis complet n’a aucune erreur ; sans second argument l’entreprise est vue comme vide (jamais « tout est permis »)', () => {
    assert.deepEqual(erreurs(complet()), []);
    assert.ok(D.erreursFinalisation(complet()).length >= 3, 'sans entreprise, la finalisation est refusée');
  });
});

describe('B1 entreprise : nom, adresse et SIRET', () => {
  test('B1 chacun des trois, absent ou vide, refuse la finalisation avec son message', () => {
    const cas = [['nom', D.MESSAGES_ENTREPRISE_MANQUANTE.nom], ['siret', D.MESSAGES_ENTREPRISE_MANQUANTE.siret], ['adresse', D.MESSAGES_ENTREPRISE_MANQUANTE.adresse]];
    for (const [cle, message] of cas) {
      assert.deepEqual(erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur: sansCle(EMETTEUR_ESSAI, cle) }), [message], `${cle} absent`);
      assert.deepEqual(erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur: { ...EMETTEUR_ESSAI, [cle]: '   ' } }), [message], `${cle} vide`);
    }
    assert.deepEqual(erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur: { ...EMETTEUR_ESSAI, adresse: { ligne1: '1 rue X' } } }), [], 'une adresse même partielle suffit : la rue');
    assert.match(D.MESSAGES_ENTREPRISE_MANQUANTE.nom, /Mon entreprise/);
  });
  test('B1 le téléphone, l’e-mail et le médiateur ne bloquent pas (ils restent dans le bandeau des réglages)', () => {
    assert.deepEqual(erreurs(complet()), []);
    assert.equal(EMETTEUR_ESSAI.mediateur, undefined);
    assert.equal(EMETTEUR_ESSAI.email, undefined);
  });
  test('B1 figerPourFinalisation lit « Mon entreprise » dans les réglages et refuse sans', () => {
    const ok = D.figerPourFinalisation(complet(), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages });
    assert.deepEqual(ok.erreurs, []);
    const refus = D.figerPourFinalisation(complet(), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages: { ...reglages, entreprise: {} } });
    assert.equal(refus.devis, null);
    assert.ok(refus.erreurs.includes(D.MESSAGES_ENTREPRISE_MANQUANTE.siret));
  });
});

describe('B2 assurance sans crochet', () => {
  test('B2 vide (texte par défaut), crochet ouvrant, crochet fermant : refusé avec « il reste des crochets » ; un texte propre passe', () => {
    const phrase = 'Complète l\'assurance dans Mon entreprise : il reste des crochets.';
    assert.equal(D.MESSAGE_ASSURANCE_CROCHETS, phrase);
    const avec = (assuranceTexte) => erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur: { ...EMETTEUR_ESSAI, assuranceTexte } });
    assert.deepEqual(avec(undefined), [phrase], 'vide : le texte par défaut a des crochets');
    assert.deepEqual(avec('  '), [phrase]);
    assert.deepEqual(avec(D.ASSURANCE_DEFAUT), [phrase]);
    assert.deepEqual(avec('Décennale chez [Assureur'), [phrase]);
    assert.deepEqual(avec('Décennale chez Assureur]'), [phrase]);
    assert.deepEqual(avec('Décennale chez Assureur SA,\ncontrat 123'), []);
  });
  test('B2 les anciens champs d’assurance (sans texte libre) comptent : le texte reconstruit n’a pas de crochet', () => {
    const emetteur = { ...sansCle(EMETTEUR_ESSAI, 'assuranceTexte'), assurance: { garantie: 'Décennale', assureur: 'Assureur SA' } };
    assert.deepEqual(erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur }), []);
  });
  test('B2 un métier hors bâtiment (metierBatiment: false) n’est pas bloqué par l’assurance', () => {
    assert.deepEqual(erreurs(complet(), { ...OPTIONS_FINALISATION, emetteur: { ...sansCle(EMETTEUR_ESSAI, 'assuranceTexte'), metierBatiment: false } }), []);
  });
});

describe('B3 client', () => {
  test('B3 sans personne ni organisation : « Choisis le client de ce devis. » ; l’un ou l’autre suffit', () => {
    assert.equal(D.MESSAGE_CLIENT_MANQUANT, 'Choisis le client de ce devis.');
    assert.deepEqual(erreurs(sansCle(complet(), 'personneId', 'organisationId')), [D.MESSAGE_CLIENT_MANQUANT]);
    assert.deepEqual(erreurs({ ...sansCle(complet(), 'personneId'), organisationId: 'org1' }), []);
    assert.deepEqual(erreurs({ ...complet(), personneId: null, organisationId: null }), [D.MESSAGE_CLIENT_MANQUANT]);
  });
  test('B3 le nom du client est figé à la finalisation (clientNomFige) et la vue client le préfère à celui de la fiche', () => {
    const r = D.figerPourFinalisation(complet(), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages, clientNom: '  Mme Dupont ' });
    assert.equal(r.devis.clientNomFige, 'Mme Dupont');
    assert.equal(D.vueClient(r.devis, { clientNom: 'Mme Durand (nouveau nom de la fiche)' }).client.nom, 'Mme Dupont');
    assert.equal(D.vueClient(complet(), { clientNom: 'Mme Durand' }).client.nom, 'Mme Durand', 'un brouillon suit la fiche');
    const sansNom = D.figerPourFinalisation(complet(), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages });
    assert.equal('clientNomFige' in sansNom.devis, false, 'sans nom connu, rien n’est figé');
  });
  test('B3 une nouvelle version repart sans nom figé (elle suit la fiche tant qu’elle est brouillon)', () => {
    const f = D.figerPourFinalisation(complet(), { numero: 'N', finaliseLe: '2026-10-24T10:00:00Z', reglages, clientNom: 'Mme Dupont' }).devis;
    assert.equal('clientNomFige' in D.nouvelleVersion(f, { id: 'd2', creeLe: ctx.maintenant }), false);
  });
});

describe('B4 début et durée des travaux', () => {
  test('B4 chacun, absent, refuse avec son message ; chantier complet ou anciens champs à plat : accepté', () => {
    const sansDebut = complet({ chantier: { dureeEstimee: { valeur: 3, unite: 'semaine' } } });
    assert.deepEqual(erreurs(sansDebut), [D.MESSAGE_DEBUT_TRAVAUX_MANQUANT]);
    const sansDuree = complet({ chantier: { debutTravaux: '2026-11-15' } });
    assert.deepEqual(erreurs(sansDuree), [D.MESSAGE_DUREE_TRAVAUX_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ chantier: undefined })), [D.MESSAGE_DEBUT_TRAVAUX_MANQUANT, D.MESSAGE_DUREE_TRAVAUX_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ chantier: { debutTravaux: '', dureeEstimee: null } })), [D.MESSAGE_DEBUT_TRAVAUX_MANQUANT, D.MESSAGE_DUREE_TRAVAUX_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ chantier: undefined, debutTravaux: 'Début janvier', dureeEstimee: '3 semaines' })), [], 'anciens champs à plat');
    assert.deepEqual(erreurs(complet({ chantier: undefined, debutTravaux: '  ', dureeEstimee: '' })), [D.MESSAGE_DEBUT_TRAVAUX_MANQUANT, D.MESSAGE_DUREE_TRAVAUX_MANQUANTE]);
  });
  test('B4 une date illisible ou une durée nulle reste refusée par les règles du chantier (un seul message, pas deux)', () => {
    const e = erreurs(complet({ chantier: { debutTravaux: '03/11/2026', dureeEstimee: { valeur: 0, unite: 'jour' } } }));
    assert.ok(e.some((m) => /début des travaux est illisible/.test(m)));
    assert.ok(e.some((m) => /supérieur à zéro/.test(m)));
    assert.ok(e.includes(D.MESSAGE_DEBUT_TRAVAUX_MANQUANT), 'une date illisible ne compte pas comme renseignée');
  });
});

describe('B5 date de validité', () => {
  test('B5 absente ou passée : refusé ; aujourd’hui et le futur : accepté ; un brouillon n’est pas « expiré » (estExpire non utilisé)', () => {
    assert.deepEqual(erreurs(complet({ expireLe: undefined })), [D.MESSAGE_VALIDITE_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ expireLe: null })), [D.MESSAGE_VALIDITE_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ expireLe: '24/10/2026' })), [D.MESSAGE_VALIDITE_MANQUANTE]);
    assert.deepEqual(erreurs(complet({ expireLe: '2026-10-23' })), [D.MESSAGE_VALIDITE_DEPASSEE]);
    assert.deepEqual(erreurs(complet({ expireLe: AUJOURDHUI_ESSAI })), []);
    assert.deepEqual(erreurs(complet({ expireLe: '2027-01-22' })), []);
    assert.equal(D.estExpire(complet({ expireLe: '2026-10-23' }), AUJOURDHUI_ESSAI), false, 'estExpire est faux pour un brouillon : on ne s’en sert pas');
  });
  test('B5 figerPourFinalisation compare à la date de la finalisation (fuseau de Paris)', () => {
    const f = (finaliseLe) => D.figerPourFinalisation(complet({ expireLe: '2026-10-24' }), { numero: 'N', finaliseLe, reglages });
    assert.deepEqual(f('2026-10-24T10:00:00Z').erreurs, []);
    assert.deepEqual(f('2026-10-24T22:30:00Z').erreurs, [D.MESSAGE_VALIDITE_DEPASSEE], '22 h 30 UTC le 24 : il est déjà le 25 à Paris');
  });
});
