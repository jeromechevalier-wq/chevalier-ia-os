// Mode test, PR 1a-2b-1 : l'héritage du repère `test` À LA CRÉATION (fonctions pures, copiées au serveur). Jamais de cascade après coup, jamais `test: false` écrit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import * as P from '../js/modules/projets/logique.js';
import { valeursDeCreation } from '../js/modules/devis/editeur-logique.js';
import { planCreerBrouillon } from '../js/modules/devis/brouillon.js';
import { nouvelleVersion } from '../js/modules/devis/logique.js';

const cx = () => { let n = 0; return { maintenant: new Date('2026-11-03T10:00:00Z'), auteur: 'a@b.fr', config: L.CONFIG_JEROME, nouvelId: (c) => `${c}_${++n}` }; };
const creees = (ecritures, collection) => ecritures.filter((e) => e.type === 'creer' && e.collection === collection).map((e) => e.donnees);
const reel = (o) => assert.equal('test' in o, false, 'un élément réel n’a pas le champ `test`');
const marque = (o) => assert.equal(o.test, true);

describe('A heriterTest : une fonction pure, sans test: false', () => {
  test('A parent de test → test ; parent réel ou absent → valeurs inchangées', () => {
    marque(L.heriterTest({ a: 1 }, { personne: { test: true } }));
    marque(L.heriterTest({ a: 1 }, { personne: { test: false }, organisation: { test: true } }));
    reel(L.heriterTest({ a: 1 }, { personne: {}, organisation: null, affaire: undefined }));
    reel(L.heriterTest({ a: 1 }, { personne: { test: false } }));
    reel(L.heriterTest({ a: 1 }));
    assert.deepEqual(L.heriterTest({ a: 1 }, { personne: { test: true } }), { a: 1, test: true });
  });
  test('A un test: true déjà posé est gardé ; seul `=== true` compte', () => {
    marque(L.heriterTest({ test: true }, {}));
    reel(L.heriterTest({ a: 1 }, { personne: { test: 'true' }, organisation: { test: 1 } }));
  });
});

describe('1 affaire : parent de test → affaire, note de départ et activités du modèle de test', () => {
  const modele = { id: 'm1', nom: 'M', activites: [{ type: 'appel', titre: 'Appeler', delaiJours: 1 }] };
  test('1 affaire sur une personne de test', () => {
    const plan = L.planCreerAffaire({ titre: 'Audit', personneId: 'p1' }, { personnes: [{ id: 'p1', test: true }], organisations: [], modele }, cx());
    marque(creees(plan.ecritures, 'crm_affaires')[0]);
    marque(creees(plan.ecritures, 'crm_notes')[0]);
    marque(creees(plan.ecritures, 'crm_activites')[0]);
    for (const e of creees(plan.ecritures, 'crm_evenements')) reel(e); // le fil n’est pas marqué (hors cadrage)
  });
  test('1 affaire sur une organisation de test', () => {
    const plan = L.planCreerAffaire({ titre: 'Audit', organisationId: 'o1' }, { personnes: [], organisations: [{ id: 'o1', test: true }] }, cx());
    marque(creees(plan.ecritures, 'crm_affaires')[0]);
  });
  test('1 affaire sur une personne RÉELLE d’une organisation de test = test (décision prise seule)', () => {
    const plan = L.planCreerAffaire({ titre: 'Audit', personneId: 'p1' }, { personnes: [{ id: 'p1', organisationId: 'o1' }], organisations: [{ id: 'o1', test: true }], modele }, cx());
    marque(creees(plan.ecritures, 'crm_affaires')[0]);
    marque(creees(plan.ecritures, 'crm_activites')[0]);
  });
  test('7 affaire sous parents réels : aucun champ `test`, nulle part', () => {
    const plan = L.planCreerAffaire({ titre: 'Audit', personneId: 'p1' }, { personnes: [{ id: 'p1', organisationId: 'o1' }], organisations: [{ id: 'o1' }], modele }, cx());
    for (const c of ['crm_affaires', 'crm_notes', 'crm_activites']) reel(creees(plan.ecritures, c)[0]);
  });
  test('9c personne tapée à la volée (absente de la liste connue) : pas d’héritage', () => {
    const plan = L.planCreerAffaire({ titre: 'Audit', personneId: 'inconnue' }, { personnes: [], organisations: [] }, cx());
    reel(creees(plan.ecritures, 'crm_affaires')[0]);
  });
});

describe('4 projets et tâches', () => {
  const affaire = (v) => ({ id: 'a1', titre: 'Audit', statut: 'gagnee', ...v });
  const modele = { id: 'm1', taches: [{ id: 't1', titre: 'Visite', phase: 'decouverte', ordre: 1, delaiJours: 2 }] };
  test('3 projet créé depuis une affaire de test : projet, tâches du modèle et note de départ de test', () => {
    const plan = P.planCreerProjetDepuisAffaire({ affaire: affaire({ test: true }), modele }, cx());
    assert.deepEqual(plan.erreurs, {});
    marque(creees(plan.ecritures, 'projets_projets')[0]);
    marque(creees(plan.ecritures, 'projets_taches')[0]);
    marque(creees(plan.ecritures, 'crm_notes')[0]);
  });
  test('3 projet créé depuis une affaire réelle : rien de marqué', () => {
    const plan = P.planCreerProjetDepuisAffaire({ affaire: affaire(), modele }, cx());
    reel(creees(plan.ecritures, 'projets_projets')[0]);
    reel(creees(plan.ecritures, 'projets_taches')[0]);
    reel(creees(plan.ecritures, 'crm_notes')[0]);
  });
  test('3 projet avec `test: true` donné par l’appelant (« Ajouter un projet » sur une fiche de test) : tâches du modèle et note de test', () => {
    const plan = P.planCreerProjet({ titre: 'Chantier', test: true }, cx(), { modele });
    marque(creees(plan.ecritures, 'projets_projets')[0]);
    marque(creees(plan.ecritures, 'projets_taches')[0]);
    marque(creees(plan.ecritures, 'crm_notes')[0]);
  });
  test('4 tâche sur un projet de test / réel', () => {
    marque(creees(P.planCreerTache({ projet: { id: 'pr1', phase: 'decouverte', test: true }, valeurs: { titre: 'X' } }, cx()).ecritures, 'projets_taches')[0]);
    reel(creees(P.planCreerTache({ projet: { id: 'pr1', phase: 'decouverte' }, valeurs: { titre: 'X' } }, cx()).ecritures, 'projets_taches')[0]);
  });
  test('6 liensProjet : `test: true` seulement pour un projet de test (clés exactes pour un projet réel)', () => {
    assert.deepEqual(Object.keys(P.liensProjet({ id: 'p', personneId: null })).sort(), ['affaireId', 'organisationId', 'personneId', 'projetId']);
    assert.deepEqual(Object.keys(P.liensProjet({ id: 'p', test: false })).sort(), ['affaireId', 'organisationId', 'personneId', 'projetId']);
    marque(P.liensProjet({ id: 'p', test: true }));
    marque(L.nouvelleNote('x', P.liensProjet({ id: 'p', test: true }), cx()));
    marque(L.nouvelleActivite({ type: 'appel', ...P.liensProjet({ id: 'p', test: true }) }, cx()));
  });
});

describe('5 devis', () => {
  const regl = {};
  const brouillon = (aff, client) => planCreerBrouillon(valeursDeCreation(aff, client), cx(), regl).devis;
  test('5 affaire de test → brouillon de test', () => marque(brouillon({ id: 'a1', test: true }, null)));
  test('5 client de test (personne ou organisation) → brouillon de test', () => {
    marque(brouillon(null, { type: 'organisation', fiche: { id: 'o1', test: true, emails: [] }, adresse: '' }));
    marque(brouillon(null, { type: 'personne', fiche: { id: 'p1', test: true, emails: [] }, adresse: '' }));
  });
  test('5 affaire et client réels → pas de champ ; sans rien → pas de champ', () => {
    reel(brouillon({ id: 'a1' }, { type: 'organisation', fiche: { id: 'o1', emails: [] }, adresse: '' }));
    reel(brouillon(null, null));
  });
  test('7 devis de test sur une affaire réelle : permis', () => {
    marque(brouillon({ id: 'a1' }, { type: 'organisation', fiche: { id: 'o1', test: true, emails: [] }, adresse: '' }));
  });
  test('5 nouvelle version d’un devis de test hérite déjà (copie) ; d’un devis réel : pas de champ', () => {
    const base = { id: 'd1', statut: 'envoye', sections: [], version: 1 };
    marque(nouvelleVersion({ ...base, test: true }, { id: 'd2', creeLe: new Date('2026-11-03T10:00:00Z') }));
    reel(nouvelleVersion(base, { id: 'd2', creeLe: new Date('2026-11-03T10:00:00Z') }));
  });
});

describe('6 activités et notes : l’appelant calcule l’héritage avec heriterTest', () => {
  test('6 activité et note sur une affaire / personne / organisation de test', () => {
    for (const parents of [{ affaire: { test: true } }, { personne: { test: true } }, { organisation: { test: true } }]) {
      marque(creees(L.planCreerActivite(L.heriterTest({ type: 'appel', titre: 'x' }, parents), cx()).ecritures, 'crm_activites')[0]);
      marque(creees(L.planCreerNote('x', L.heriterTest({ affaireId: 'a' }, parents), cx()).ecritures, 'crm_notes')[0]);
    }
  });
  test('7 parents réels : rien', () => {
    reel(creees(L.planCreerActivite(L.heriterTest({ type: 'appel' }, { affaire: {}, personne: {} }), cx()).ecritures, 'crm_activites')[0]);
    reel(creees(L.planCreerNote('x', L.heriterTest({}, { affaire: {} }), cx()).ecritures, 'crm_notes')[0]);
  });
  test('2 personne créée dans une organisation de test', () => {
    marque(creees(L.planCreerPersonne(L.heriterTest({ nom: 'Marie Durand', organisationId: 'o1' }, { organisation: { test: true } }), cx()).ecritures, 'crm_personnes')[0]);
  });
  test('9a une restauration remet le document tel quel (test conservé, rien à coder)', () => {
    assert.equal(L.planRestaurerDocument('crm_notes', { id: 'n1', texte: 'x', test: true }).ecritures[0].donnees.test, true);
    reel(L.planRestaurerDocument('crm_notes', { id: 'n1', texte: 'x' }).ecritures[0].donnees);
  });
});
