// Module Achats « Factures » (PR 8b, page Examiner) : logique pure de la décision, des agences, de l'envoi d'un PDF, des explications et de la barre de séparation. Aucun réseau, aucune vraie identité (fausses données).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { expect, espion } from './_expect-achatsfactures.js';
import { construireCorps, alerteNomFournisseur, comparerNomFournisseur, offreLiaison, offreRouverture, corpsLiaison, corpsRouverture, motifValide, CODES_LIAISON_PERIMEE } from '../js/modules/achatsfactures/decision.js';
import { filtrerOptions, preselectionAgence, verifierChampsAgence, corpsCreationAgence, champsAgenceDepuis, optionsAgences, chantierAcceptable, phraseChantierFerme } from '../js/modules/achatsfactures/agences.js';
import { verifierMetadonnees, verifierContenu, envoyerFacture, suivreSelection, ErreurUpload, TAILLE_MAX_OCTETS, MESSAGE_INCERTAIN } from '../js/modules/achatsfactures/upload.js';
import { EXPLICATIONS, ACTIFS, BIENTOT } from '../js/modules/achatsfactures/explications.js';
import { PART_DEFAUT, bornerPart, partDepuisPosition, lirePartMemorisee } from '../js/modules/achatsfactures/separateur.js';
import { IDENT } from './_donnees-achatsfactures.js';

const SIRET = IDENT.siret;
const SIREN = IDENT.siren;
const agence = (o = {}) => ({ id: 'ag1', fournisseur_id: 'fo1', siret: SIRET, nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null, fournisseur: { id: 'fo1', siren: SIREN, nom: 'Point Q Matériaux' }, ...o });

describe('décision : corps envoyé au serveur', () => {
  test('accepter sans alerte : agence obligatoire, chantier null si aucun, aucun motif', () => {
    expect(construireCorps('f1', 'accepter', '', [], { etablissement_id: 'ag1' })).toEqual({ facture_id: 'f1', decision: 'accepter', chantier_id: null, etablissement_id: 'ag1' });
    assert.throws(() => construireCorps('f1', 'accepter', '', [], { chantier_id: 'c1' }));
  });
  test('accepter avec alerte : motif de 3 à 500 caractères obligatoire, alertes envoyées', () => {
    const alertes = [{ code: 'siret', niveau: 'orange', message: 'SIRET à vérifier' }];
    assert.throws(() => construireCorps('f1', 'accepter', 'ok', alertes, { etablissement_id: 'ag1' }));
    expect(construireCorps('f1', 'accepter', '  vérifié par téléphone ', alertes, { etablissement_id: 'ag1', chantier_id: 'c1' })).toEqual(
      { facture_id: 'f1', decision: 'accepter', chantier_id: 'c1', etablissement_id: 'ag1', alertes, motif: 'vérifié par téléphone' });
  });
  test('refuser : motif obligatoire, ni chantier ni agence, aucune identité', () => {
    assert.throws(() => construireCorps('f1', 'refuser', '  ', [], null));
    expect(construireCorps('f1', 'refuser', 'Doublon', [], { etablissement_id: 'ag1' })).toEqual({ facture_id: 'f1', decision: 'refuser', motif: 'Doublon' });
    expect(motifValide('a'.repeat(501))).toBe(false);
  });
  test('nom du fournisseur différent : alerte orange ; nom proche ou manquant : rien', () => {
    expect(comparerNomFournisseur('Point Q', 'Point Q Matériaux')).toBe('coherent');
    expect(alerteNomFournisseur('Zéta Outillage', 'Point Q Matériaux')).toMatchObject({ code: 'nom-fournisseur', niveau: 'orange' });
    expect(alerteNomFournisseur('', 'Point Q Matériaux')).toBeNull();
  });
});

describe('relier et rouvrir', () => {
  test('relier : seulement une facture ACCEPTÉE et SANS chantier ; archivée : on dit de la sortir des archives', () => {
    expect(offreLiaison({ statut: 'acceptee', chantier_id: null, archivee_le: null })).toBe('bouton');
    expect(offreLiaison({ statut: 'acceptee', chantier_id: null, archivee_le: '2026-11-01' })).toBe('archivee');
    expect(offreLiaison({ statut: 'acceptee', chantier_id: 'c1' })).toBe('aucune');
    expect(offreLiaison({ statut: 'a_valider', chantier_id: null })).toBe('aucune');
    assert.throws(() => corpsLiaison('f1', null));
    expect(corpsLiaison('f1', 'c1')).toEqual({ facture_id: 'f1', chantier_id: 'c1' });
    expect(CODES_LIAISON_PERIMEE.has('facture_deja_reliee')).toBe(true);
  });
  test('rouvrir : pas pour une facture à valider ; motif de 3 à 500 caractères', () => {
    expect(offreRouverture({ statut: 'a_valider' })).toBe('aucune');
    expect(offreRouverture({ statut: 'refusee', archivee_le: null })).toBe('bouton');
    expect(offreRouverture({ statut: 'acceptee', archivee_le: '2026-11-01' })).toBe('archivee');
    expect(corpsRouverture('f1', ' erreur de saisie ')).toEqual({ facture_id: 'f1', motif: 'erreur de saisie' });
    assert.throws(() => corpsRouverture('f1', 'ab'));
  });
});

describe('agences', () => {
  test('liste filtrable : sous 3 lettres toute la liste, ensuite chaque mot doit se trouver', () => {
    const o = optionsAgences([agence(), agence({ id: 'ag2', siret: null, nom_agence: 'Agence Sud', ville: 'Orvaleine' })]);
    expect(filtrerOptions(o, 'ag').options).toHaveLength(2);
    expect(filtrerOptions(o, 'sud orvaleine').options.map((x) => x.id)).toEqual(['ag2']);
    expect(filtrerOptions(o, 'VALMORAN').options.map((x) => x.id)).toEqual(['ag1']);
  });
  test('agence proposée : le SIRET d\'abord, sinon la seule agence du SIREN, sinon rien ; une agence inactive n\'est jamais proposée', () => {
    const lu = { fournisseur: { siret: SIRET, nom: 'Point Q' } };
    expect(preselectionAgence(lu, [agence()])).toBe('ag1');
    expect(preselectionAgence({ fournisseur: { siren: SIREN } }, [agence({ siret: null })])).toBe('ag1');
    expect(preselectionAgence({ fournisseur: { siren: SIREN } }, [agence({ siret: null }), agence({ id: 'ag2', siret: null, ville: 'Orvaleine' })])).toBeNull();
    expect(preselectionAgence(lu, [agence({ actif: false })])).toBeNull();
    expect(preselectionAgence({ fournisseur: {} }, [agence()])).toBeNull();
  });
  test('créer l\'agence : contrôle de forme, corps sans champ vide ni identité', () => {
    const champs = { nom_fournisseur: 'Point Q', siret: ` ${SIRET} `, siren: '', nom_agence: '', ville: '' };
    expect(verifierChampsAgence(champs)).toBeNull();
    expect(verifierChampsAgence({ ...champs, siret: '123' })).toMatch(/14 chiffres/);
    expect(verifierChampsAgence({ ...champs, nom_fournisseur: '' })).toMatch(/nom de l’entreprise/);
    expect(corpsCreationAgence(champs)).toEqual({ nom_fournisseur: 'Point Q', siret: SIRET });
    expect(champsAgenceDepuis({ fournisseur: { nom: 'Point Q', siret: SIRET } })).toMatchObject({ nom_fournisseur: 'Point Q', siret: SIRET, siren: SIREN });
  });
  test('chantier fermé : refusé avec une phrase claire', () => {
    expect(chantierAcceptable({ statut: 'en_cours', archive: false })).toBe(true);
    expect(chantierAcceptable({ statut: 'termine', archive: false })).toBe(false);
    expect(phraseChantierFerme({ statut: 'suspendu' })).toMatch(/suspendu/);
    expect(phraseChantierFerme({ statut: 'en_cours' })).toBeNull();
  });
});

describe('« + Facture » : contrôles et envoi', () => {
  const fichier = (o = {}) => ({ name: 'facture.pdf', type: 'application/pdf', size: 5000, ...o });
  test('type, taille et nom', () => {
    expect(verifierMetadonnees(fichier())).toBeNull();
    expect(verifierMetadonnees(fichier({ name: 'photo.jpg', type: 'image/jpeg' }))).toMatch(/seuls les PDF/);
    expect(verifierMetadonnees(fichier({ name: 'note.txt', type: 'text/plain' }))).toMatch(/pas un PDF/);
    expect(verifierMetadonnees(fichier({ size: 0 }))).toMatch(/vide/);
    expect(verifierMetadonnees(fichier({ size: TAILLE_MAX_OCTETS + 1 }))).toMatch(/trop gros/);
  });
  test('contenu : « %PDF- » au début et « %%EOF » à la fin', () => {
    const o = (s) => new TextEncoder().encode(s);
    expect(verifierContenu(o('%PDF-1.7'), o('...%%EOF\n'))).toBeNull();
    expect(verifierContenu(o('PK\u0003\u0004'), o('%%EOF'))).toMatch(/pas un vrai PDF/);
    expect(verifierContenu(o('%PDF-1.7'), o('abc'))).toMatch(/abîmé/);
  });
  const vrai = () => new File([new TextEncoder().encode('%PDF-1.7\n'), new Uint8Array(200), new TextEncoder().encode('\n%%EOF')], 'facture.pdf', { type: 'application/pdf' });
  test('envoi : un seul appel multipart, le fichier dans le champ « fichier », résultat lu dans la réponse', async () => {
    const ajouterFacture = espion(async () => ({ facture_id: 'nouvelle', lecture: 'reussie', lignes_ecrites: true }));
    const r = await envoyerFacture(vrai(), { actions: { ajouterFacture } });
    expect(r).toEqual({ factureId: 'nouvelle', lectureReussie: true, lignesEcrites: true, dejaConnue: false });
    expect(ajouterFacture).toHaveBeenCalledTimes(1);
    const corps = ajouterFacture.appels[0][0];
    expect(corps instanceof FormData).toBe(true);
    expect([...corps.keys()]).toEqual(['fichier']);
    expect(corps.get('fichier').name).toBe('facture.pdf');
  });
  test('lecture à compléter et lignes non écrites sont dites', async () => {
    const r = await envoyerFacture(vrai(), { actions: { ajouterFacture: async () => ({ facture_id: 'n', lecture: 'a_completer', lignes_ecrites: false }) } });
    expect(r).toEqual({ factureId: 'n', lectureReussie: false, lignesEcrites: false, dejaConnue: false });
  });
  test('sélection : la vérification d\'un fichier plus ancien est ignorée', () => {
    const s = suivreSelection();
    const premier = s.nouveau();
    const second = s.nouveau();
    expect(s.estCourant(premier)).toBe(false);
    expect(s.estCourant(second)).toBe(true);
  });
  test('erreurs : message du serveur dit tel quel, réseau = « peut-être en cours de lecture », session expirée, doublon', async () => {
    const echec = (code, message) => ({ ajouterFacture: async () => { throw Object.assign(new Error(message), { code }); } });
    await envoyerFacture(vrai(), { actions: echec('pdf_vide', 'x') }).then(() => { throw new Error('devait échouer'); }, (e) => expect(e instanceof ErreurUpload).toBe(true));
    await envoyerFacture(vrai(), { actions: echec('reseau', 'x') }).then(() => { throw new Error('devait échouer'); }, (e) => expect(e.message).toBe(MESSAGE_INCERTAIN));
    await envoyerFacture(vrai(), { actions: echec('ticket', 'x') }).then(() => { throw new Error('devait échouer'); }, (e) => expect(e.message).toMatch(/session a expiré/));
    await envoyerFacture(vrai(), { actions: echec('doublon', 'x') }).then(() => { throw new Error('devait échouer'); }, (e) => expect(e.message).toMatch(/déjà été ajoutée/));
    await envoyerFacture(vrai(), { actions: { ajouterFacture: async () => ({}) } }).then(() => { throw new Error('devait échouer'); }, (e) => expect(e.code).toBe('reponse_inattendue'));
  });
});

describe('explications et séparateur', () => {
  test('chaque contrôle actif a ses quatre textes ; aucun ne promet que la facture est sûre', () => {
    for (const a of ACTIFS) {
      const e = EXPLICATIONS[a.id];
      expect(Object.keys(e).sort()).toEqual(['cas', 'faire', 'limite', 'quoi']);
      expect(JSON.stringify(e)).not.toMatch(/facture (est )?(sûre|authentique)\b/i);
    }
    expect(BIENTOT).toHaveLength(3);
  });
  test('barre de séparation : bornée à 30–75 %, la colonne de droite garde 320 px', () => {
    expect(bornerPart(10, 1200)).toBe(30);
    expect(bornerPart(90, 1200)).toBeLessThanOrEqual(75);
    expect(bornerPart(70, 800)).toBeLessThanOrEqual(((800 - 12 - 320) / 800) * 100);
    expect(partDepuisPosition(600, 0, 1200)).toBe(50);
    expect(lirePartMemorisee(null)).toBe(PART_DEFAUT);
    expect(lirePartMemorisee('abc')).toBe(PART_DEFAUT);
    expect(lirePartMemorisee('55')).toBe(55);
  });
});
