// A6 : pour CHAQUE phrase que erreursFinalisation peut produire, champDeErreurFinalisation rend un champ connu, ou null pour les erreurs « sans champ ».
// Liste fermée : une phrase nouvelle sans décision (undefined) fait échouer ce test. Aucune phrase n'est modifiée par ce chantier.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/devis/logique.js';

const ligne = (o = {}) => ({ id: 'l1', libelle: 'Carrelage', type: 'fourniture', quantite: 10, prixAchat: 40, tauxTva: 20, ...o });
const base = (o = {}) => ({
  statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', modeMarge: 'majoration', marge: 25, expireLe: '2099-12-31', destinataires: ['a@exemple.fr'],
  chantier: { debutTravaux: '2099-01-01', dureeEstimee: { valeur: 2, unite: 'jour' } }, sections: [{ id: 's1', titre: 'Cuisine', lignes: [ligne()] }], ...o,
});
const entreprise = { nom: 'Entreprise', siret: '12345678901234', adresse: '1 rue A, 75001 Paris', metierBatiment: true };
const erreurs = (d, e = entreprise) => L.erreursFinalisation(d, { emetteur: e, aujourdhui: '2026-10-31' });

// [devis, emetteur, champ attendu pour la phrase produite]
const CAS = [
  [base({ affaireId: null }), entreprise, 'affaire'],
  [base({ organisationId: null }), entreprise, 'client'],
  [base({ chantier: { dureeEstimee: { valeur: 2, unite: 'jour' } } }), entreprise, 'debutTravaux'],
  [base({ chantier: { debutTravaux: '2099-01-01' } }), entreprise, 'duree'],
  [base({ expireLe: null }), entreprise, 'expireLe'],
  [base({ expireLe: '2020-01-01' }), entreprise, 'expireLe'],
  [base({ chantier: { debutTravaux: 'x', dureeEstimee: { valeur: 2, unite: 'jour' } } }), entreprise, 'debutTravaux'],
  [base({ chantier: { debutTravaux: '2099-01-01', finChantierAu: 'x', dureeEstimee: { valeur: 2, unite: 'jour' } } }), entreprise, 'finChantierAu'],
  [base({ chantier: { debutTravaux: '2099-02-01', finChantierAu: '2099-01-01', dureeEstimee: { valeur: 2, unite: 'jour' } } }), entreprise, 'finChantierAu'],
  [base({ chantier: { debutTravaux: '2099-01-01', adresse: { codePostal: '12' }, dureeEstimee: { valeur: 2, unite: 'jour' } } }), entreprise, 'chantier-adresse'],
  [base({ chantier: { debutTravaux: '2099-01-01', dureeEstimee: { valeur: 0, unite: 'jour' } } }), entreprise, 'duree'],
  [base({ sections: [{ id: 's1', lignes: [] }] }), entreprise, 'lignes'],
  [base({ sections: [{ id: 's1', titre: 'Cuisine', lignes: [ligne({ quantite: 0 })] }] }), entreprise, 'quantite'],
  [base({ sections: [{ id: 's1', lignes: [ligne({ prixAchat: null })] }] }), entreprise, 'prixAchat'],
  [base({ sections: [{ id: 's1', lignes: [ligne({ prixAchat: -3 })] }] }), entreprise, 'prixAchat'],
  [base({ sections: [{ id: 's1', lignes: [ligne({ tauxTva: -1 })] }] }), entreprise, 'tva'],
  [base({ modeMarge: 'marge_vente', marge: 100 }), entreprise, 'margeLigne'],
  [base({ modeMarge: 'inconnu' }), entreprise, 'marge'],
  [base({ marge: 'abc' }), entreprise, 'marge'],
  [base({ destinataires: ['pas-une-adresse'] }), entreprise, 'destinataires'],
  [base({ destinataires: ['a@exemple.fr', 'A@exemple.fr'] }), entreprise, 'destinataires'],
  [base({ destinataires: Array.from({ length: 11 }, (_, i) => `d${i}@exemple.fr`) }), entreprise, 'destinataires'],
  [base({ copie: ['pas-une-adresse'] }), entreprise, 'copie'],
  [base({ copie: ['a@exemple.fr'] }), entreprise, 'copie'],
  [base({ copie: Array.from({ length: 11 }, (_, i) => `c${i}@exemple.fr`) }), entreprise, 'copie'],
  [base({ remise: { type: 'pourcentage', valeur: 100 } }), entreprise, 'remise'],
  [base({ remise: { type: 'montant', valeur: -5 } }), entreprise, 'remise'],
  [base({ remise: { type: 'montant', valeur: 99999 } }), entreprise, 'remise'],
  [base({ remise: { type: 'x', valeur: 1 } }), entreprise, 'remise'],
  [base({ remise: { type: 'montant', valeur: 'a' } }), entreprise, 'remise'],
  [base({ acomptes: [{ id: 'ac1', moment: 'x', type: 'pourcentage', valeur: 150 }] }), entreprise, 'acompte'],
  [base({ primes: [{ id: 'p1', libelle: '', montant: 'x' }] }), entreprise, 'primes'],
  [base({ dechets: { types: ['inconnu'], volumeMin: 5, volumeMax: 1 } }), entreprise, 'dechets'],
  [base({ retenueGarantie: { pourcentage: 5, echeance: 'x' } }), entreprise, 'acompte'],
  // Sans champ.
  [base(), {}, null],
  [base(), { ...entreprise, assurance: 'Assurance [à compléter]', texteAssurance: 'Assurance [à compléter]' }, null],
  [base({ statut: 'en_attente_envoi' }), entreprise, null],
  [base({ sections: [{ id: 's1', lignes: [ligne({ id: '' })] }] }), entreprise, null],
  [base({ acomptes: 'x', primes: 'x', dechets: 'x', texteLibre: 3 }), entreprise, null],
];

test('A6 chaque phrase de erreursFinalisation reçoit une décision (champ de la table, ou null « aucun champ »)', () => {
  const vues = new Set();
  for (const [devis, emetteur, attendu] of CAS) {
    const liste = erreurs(devis, emetteur);
    assert.ok(liste.length > 0, `le cas doit produire une erreur : ${JSON.stringify(devis).slice(0, 80)}`);
    for (const message of liste) {
      const d = L.decisionChampFinalisation(message, devis);
      assert.notEqual(d, undefined, `phrase sans décision (ajoute-la dans decisionChampFinalisation) : ${message}`);
      vues.add(message);
    }
    // La phrase propre au cas donne le champ attendu (les phrases secondaires du même devis ont aussi une décision, vérifiée ci-dessus).
    const champs = liste.map((m) => L.champDeErreurFinalisation(m, devis)?.champ ?? null);
    if (attendu === null) assert.ok(champs.includes(null), `un message sans champ était attendu : ${liste.join(' | ')}`);
    else assert.ok(champs.includes(attendu), `champ « ${attendu} » attendu parmi ${JSON.stringify(champs)} pour ${liste.join(' | ')}`);
  }
  assert.ok(vues.size >= 30, `au moins 30 phrases différentes testées (${vues.size})`);
});

test('A6 le message d\'entreprise et d\'assurance n\'a aucun champ', () => {
  for (const m of [...Object.values(L.MESSAGES_ENTREPRISE_MANQUANTE), L.MESSAGE_ASSURANCE_CROCHETS, 'Le devis est introuvable.']) assert.equal(L.champDeErreurFinalisation(m), null, m);
});

test('A6 la ligne citée est retrouvée par son libellé (et sa section) ; introuvable : champ sans identifiant', () => {
  const devis = base({ sections: [{ id: 's1', titre: 'Cuisine', lignes: [ligne({ id: 'lA', libelle: 'Peinture', quantite: 0 }), ligne({ id: 'lB', libelle: 'Carrelage' })] }] });
  const [m] = erreurs(devis).filter((x) => x.startsWith('Ligne'));
  assert.deepEqual(L.champDeErreurFinalisation(m, devis), { champ: 'quantite', ligneId: 'lA', ligneLibelle: 'Peinture' });
  const sansLigne = L.champDeErreurFinalisation(m, base({ sections: [] }));
  assert.equal(sansLigne.champ, 'quantite');
  assert.equal(sansLigne.ligneId, null);
});

test('A6 phrase inconnue : aucune marque, aucune exception', () => {
  assert.equal(L.champDeErreurFinalisation('Phrase jamais vue.'), null);
  assert.equal(L.decisionChampFinalisation('Phrase jamais vue.'), undefined);
  assert.equal(L.champDeErreurFinalisation(undefined), null);
});
