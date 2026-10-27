// Onglets qu'un module ajoute sur la fiche d'une affaire : fournisseurs qui plantent, ids en double, null, élément invalide. Pur : aucun navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../js/modules/crm/pastilles-externes.js');
const noeud = () => ({ nodeType: 1 }); // un « nœud » suffisant (le test n'a pas de DOM)
const onglet = (id, extra = {}) => ({ id, libelle: id.toUpperCase(), icone: 'file-text', element: noeud(), compteur: 1, ...extra });

test('1 aucun fournisseur inscrit = aucun onglet ; l\'ordre d\'inscription est gardé ; le retrait fait disparaître l\'onglet', () => {
  assert.deepEqual(P.ongletsDeAffaire('a1'), []);
  const r1 = P.inscrireOngletAffaire(() => onglet('un'));
  const r2 = P.inscrireOngletAffaire((id) => (id === 'a1' ? onglet('deux', { compteur: null }) : null));
  assert.deepEqual(P.ongletsDeAffaire('a1').map((o) => o.id), ['un', 'deux']);
  assert.deepEqual(P.ongletsDeAffaire('a2').map((o) => o.id), ['un']);
  r1();
  assert.deepEqual(P.ongletsDeAffaire('a1').map((o) => o.id), ['deux']);
  r2();
  assert.deepEqual(P.ongletsDeAffaire('a1'), []);
});

test('2 cas d\'erreur : un fournisseur qui plante est ignoré, les autres restent', () => {
  const avertissements = [];
  const avant = console.warn;
  console.warn = (...a) => avertissements.push(a);
  const r1 = P.inscrireOngletAffaire(() => { throw new Error('panne'); });
  const r2 = P.inscrireOngletAffaire(() => onglet('sain'));
  try {
    assert.deepEqual(P.ongletsDeAffaire('a1').map((o) => o.id), ['sain']);
    assert.equal(avertissements.length, 1);
  } finally { console.warn = avant; r1(); r2(); }
});

test('3 un id déjà pris (autre fournisseur ou onglet fixe) est ignoré : jamais deux onglets identiques', () => {
  const retraits = [
    P.inscrireOngletAffaire(() => onglet('devis')),
    P.inscrireOngletAffaire(() => onglet('devis', { libelle: 'Doublon' })),
    P.inscrireOngletAffaire(() => onglet('activite')),
    P.inscrireOngletAffaire(() => onglet('notes')),
    P.inscrireOngletAffaire(() => onglet('documents')),
  ];
  const liste = P.ongletsDeAffaire('a1');
  assert.deepEqual(liste.map((o) => o.id), ['devis']);
  assert.equal(liste[0].libelle, 'DEVIS');
  retraits.forEach((r) => r());
});

test('4 null, sans id, id avec espace, sans libellé ou élément invalide : ignorés', () => {
  const retraits = [
    () => null, () => undefined, () => ({}), () => onglet('', {}), () => onglet('a b'), () => onglet('sans-libelle', { libelle: '' }),
    () => onglet('sans-element', { element: null }), () => onglet('texte', { element: 'du texte' }), () => onglet('nombre', { id: 5 }),
    () => onglet('bon'),
  ].map((f) => P.inscrireOngletAffaire(f));
  assert.deepEqual(P.ongletsDeAffaire('a1').map((o) => o.id), ['bon']);
  retraits.forEach((r) => r());
});

test('5 signaler() prévient les abonnés existants (pas de deuxième système d\'abonnement)', () => {
  let appels = 0;
  const arret = P.surChangementPastilles(() => { appels += 1; });
  P.signaler();
  assert.equal(appels, 1);
  arret();
});

test('8 action d’en-tête d’un module : aucun fournisseur = null ; fournisseur qui plante ou réponse invalide ignorés ; le premier valide gagne ; le retrait la fait disparaître', () => {
  assert.equal(P.actionDeAffaire('a1'), null);
  const r1 = P.inscrireActionAffaire(() => { throw new Error('boum'); });
  const r2 = P.inscrireActionAffaire(() => ({ libelle: '', action: () => {} }));
  const r3 = P.inscrireActionAffaire(() => ({ libelle: 'Sans action' }));
  const r4 = P.inscrireActionAffaire((id) => (id === 'a1' ? { libelle: 'Créer un devis', action: () => {} } : null));
  const r5 = P.inscrireActionAffaire(() => ({ libelle: 'Autre', action: () => {} }));
  const avertir = console.warn; console.warn = () => {};
  try {
    assert.equal(P.actionDeAffaire('a1').libelle, 'Créer un devis');
    assert.equal(P.actionDeAffaire('a2').libelle, 'Autre');
  } finally { console.warn = avertir; }
  for (const r of [r1, r2, r3, r4, r5]) r();
  assert.equal(P.actionDeAffaire('a1'), null);
});
