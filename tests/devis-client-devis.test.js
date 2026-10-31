// Choix du client et de l'affaire d'un devis (js/modules/devis/client-devis.js). Fonctions pures.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lireChoix, clientDePersonne, clientDOrganisation, clientDAffaire, memeClient, affairesDuClient, affaireDuClient, personnesAttention, emailDestinataire, aideAffaire, nomAffaireCreee, MESSAGE_SANS_AFFAIRE_CLIENT, MESSAGE_FINALISER_SANS_AFFAIRE } from '../js/modules/devis/client-devis.js';

const personnes = [
  { id: 'p1', nom: 'Julie', organisationId: 'o1' },
  { id: 'p2', nom: 'Paul', organisationId: 'o1' },
  { id: 'p3', nom: 'Seule', organisationId: null },
  { id: 'p4', nom: 'Autre', organisationId: 'o2' },
];
const affaires = [
  { id: 'a1', titre: 'Cuisine', organisationId: 'o1', personneId: 'p1' },
  { id: 'a2', titre: 'Garage', organisationId: 'o1' },
  { id: 'a3', titre: 'Salle de bains', personneId: 'p2' },
  { id: 'a4', titre: 'Toiture', organisationId: 'o2', personneId: 'p4' },
  { id: 'a5', titre: 'Particulier', personneId: 'p3' },
  { id: 'a6', titre: 'Sans client' },
];
const ids = (l) => l.map((a) => a.id).sort();

describe('CD choix du client et de l’affaire', () => {
  test('CD1 lireChoix : type et identifiant, le texte d’une création garde ses « : »', () => {
    assert.deepEqual(lireChoix('personne:p1'), { type: 'personne', id: 'p1' });
    assert.deepEqual(lireChoix('creer:organisation:Atelier : Nord'), { type: 'creer', genre: 'organisation', texte: 'Atelier : Nord' });
    assert.equal(lireChoix('').type, '');
  });
  test('CD2 personne : l’organisation par défaut avec elle « à l’attention de » ; « seule » retire l’organisation ; sans organisation, elle seule', () => {
    assert.deepEqual(clientDePersonne(personnes[0]), { organisationId: 'o1', personneId: 'p1' });
    assert.deepEqual(clientDePersonne(personnes[0], { seule: true }), { organisationId: null, personneId: 'p1' });
    assert.deepEqual(clientDePersonne(personnes[2]), { organisationId: null, personneId: 'p3' });
    assert.deepEqual(clientDePersonne(personnes[0], { organisationExiste: false }), { organisationId: null, personneId: 'p1' }); // organisation supprimée
  });
  test('CD3 organisation : client seul ; affaire : organisation ET personne, seulement ce qui existe encore', () => {
    assert.deepEqual(clientDOrganisation('o1'), { organisationId: 'o1', personneId: null });
    assert.deepEqual(clientDAffaire(affaires[0]), { organisationId: 'o1', personneId: 'p1' });
    assert.deepEqual(clientDAffaire(affaires[2]), { organisationId: null, personneId: 'p2' });
    assert.deepEqual(clientDAffaire(affaires[0], (type) => type === 'personne'), { organisationId: null, personneId: 'p1' });
    assert.equal(memeClient({ organisationId: 'o1', personneId: null }, { organisationId: 'o1' }), true);
    assert.equal(memeClient({ organisationId: 'o1', personneId: 'p1' }, { organisationId: 'o1' }), false);
  });
  test('CD4 affaires d’une organisation : les siennes ET celles de ses personnes, jamais celles d’un autre client', () => {
    assert.deepEqual(ids(affairesDuClient({ organisationId: 'o1', personneId: null }, affaires, personnes)), ['a1', 'a2', 'a3']);
    assert.deepEqual(ids(affairesDuClient({ organisationId: 'o1', personneId: 'p1' }, affaires, personnes)), ['a1', 'a2', 'a3']);
  });
  test('CD5 affaires d’une personne seule : les siennes ET celles de son organisation (pas celles des collègues)', () => {
    assert.deepEqual(ids(affairesDuClient({ organisationId: null, personneId: 'p1' }, affaires, personnes)), ['a1', 'a2']);
    assert.deepEqual(ids(affairesDuClient({ organisationId: null, personneId: 'p3' }, affaires, personnes)), ['a5']);
  });
  test('CD6 sans client : pas de filtre (null) ; client sans affaire : liste vide', () => {
    assert.equal(affairesDuClient({ organisationId: null, personneId: null }, affaires, personnes), null);
    assert.deepEqual(affairesDuClient({ organisationId: 'o9', personneId: null }, affaires, personnes), []);
  });
  test('CD7 une affaire d’un autre client est refusée ; une affaire sans client ne gêne pas ; sans client tout passe', () => {
    const client = { organisationId: 'o1', personneId: null };
    assert.equal(affaireDuClient(affaires[0], client, affaires, personnes), true);
    assert.equal(affaireDuClient(affaires[3], client, affaires, personnes), false);
    assert.equal(affaireDuClient(affaires[5], client, affaires, personnes), true);
    assert.equal(affaireDuClient(affaires[3], { organisationId: null, personneId: null }, affaires, personnes), true);
    assert.equal(affaireDuClient(null, client, affaires, personnes), false);
  });
  test('CD8 « à l’attention de » : les personnes de l’organisation, plus celle déjà posée même venue d’ailleurs', () => {
    assert.deepEqual(personnesAttention('o1', personnes).map((p) => p.id), ['p1', 'p2']);
    assert.deepEqual(personnesAttention('o1', personnes, 'p4').map((p) => p.id), ['p1', 'p2', 'p4']);
    assert.deepEqual(personnesAttention('o1', personnes, 'p1').map((p) => p.id), ['p1', 'p2']);
  });
  test('CD9 e-mail : celui de la personne « à l’attention de » l’emporte, sinon celui du client', () => {
    assert.equal(emailDestinataire('julie@exemple.fr', 'contact@societe.fr'), 'julie@exemple.fr');
    assert.equal(emailDestinataire('', 'contact@societe.fr'), 'contact@societe.fr');
    assert.equal(emailDestinataire('', ''), '');
  });
  test('CD10 phrase sous la ligne Affaire : sans client, client sans affaire, rien sinon', () => {
    assert.match(aideAffaire({ client: null, affaireId: null, nbAffaires: 0 }), /^Facultatif tant que le devis est un brouillon/);
    assert.equal(aideAffaire({ client: { organisationId: 'o1' }, affaireId: null, nbAffaires: 0 }), MESSAGE_SANS_AFFAIRE_CLIENT);
    assert.equal(aideAffaire({ client: { organisationId: 'o1' }, affaireId: null, nbAffaires: 2 }), '');
    assert.equal(aideAffaire({ client: { organisationId: 'o1' }, affaireId: 'a1', nbAffaires: 0 }), '');
  });
  test('CD11 personne archivée déjà posée : elle reste dans « à l’attention de »', () => {
    const toutes = [...personnes, { id: 'p9', nom: 'Archivée', organisationId: 'o2', archive: true }];
    assert.deepEqual(personnesAttention('o1', personnes, 'p9', toutes).map((p) => p.id), ['p1', 'p2', 'p9']);
    assert.deepEqual(personnesAttention('o1', personnes, 'p9').map((p) => p.id), ['p1', 'p2']);
  });
  test('CD12 nom de l’affaire créée : le texte tapé, sinon le nom du devis, sinon le client ; vide sans rien', () => {
    assert.equal(nomAffaireCreee('  Cuisine   neuve ', { nom: 'Variante' }), 'Cuisine neuve');
    assert.equal(nomAffaireCreee('', { nom: 'Variante' }, { organisation: { nom: 'Société' } }), 'Variante');
    assert.equal(nomAffaireCreee('', {}, { organisation: { nom: 'Société' }, personne: { nom: 'Ana' } }), 'Affaire Société');
    assert.equal(nomAffaireCreee('', {}, { personne: { nom: 'Ana' } }), 'Affaire Ana');
    assert.equal(nomAffaireCreee('  ', {}, {}), '');
  });
  test('CD13 une affaire archivée du même client reste « du client » quand on lui passe toutes les affaires', () => {
    const toutes = [...affaires, { id: 'a7', titre: 'Archivée', organisationId: 'o1', archive: true }];
    assert.equal(affaireDuClient(toutes.at(-1), { organisationId: 'o1', personneId: 'p1' }, toutes, personnes), true);
  });
  test('CD14 le message de finalisation de l’écran est la phrase de Jérôme (celle du serveur ne change pas)', () => {
    assert.equal(MESSAGE_FINALISER_SANS_AFFAIRE, 'Choisis ou crée une affaire pour finaliser ce devis.');
  });
});
