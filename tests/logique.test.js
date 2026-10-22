// Tests B : logique métier pure (node --test, sans navigateur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const JEROME = 'jerome.chevalier@gmail.com';
const ctx = (iso = '2026-10-15T08:00:00Z', extra = {}) => ({ maintenant: new Date(iso), auteur: JEROME, config: L.CONFIG_JEROME, ...extra });

function personne(p = {}) {
  return { ...L.nouvellePersonne({ nom: 'Test Personne' }, ctx('2026-10-01T08:00:00Z')), id: p.id || 'p', creeLe: new Date('2026-10-01T08:00:00Z'), ...p };
}
function organisation(o = {}) {
  return { ...L.nouvelleOrganisation({ nom: 'Test Org' }, ctx('2026-10-01T08:00:00Z')), id: o.id || 'o', creeLe: new Date('2026-10-01T08:00:00Z'), ...o };
}
function affaire(a = {}) {
  return { ...L.nouvelleAffaire({ titre: 'Test affaire' }, ctx('2026-10-01T08:00:00Z')), id: a.id || 'a', creeLe: new Date('2026-10-01T08:00:00Z'), ...a };
}
function activite(a = {}) {
  return { ...L.nouvelleActivite({ type: 'tache', date: '2026-10-15', affaireId: 'a' }, ctx()), id: a.id || 'x', ...a };
}

describe('B1 Nom : prénom et nom de famille', () => {
  test('B1 deux mots : premier espace', () => {
    assert.deepEqual(L.decouperNom('Marie Durand'), { prenom: 'Marie', nomFamille: 'Durand' });
  });
  test('B1 plusieurs mots : tout le reste va au nom de famille', () => {
    assert.deepEqual(L.decouperNom('Jean Pierre Martin'), { prenom: 'Jean', nomFamille: 'Pierre Martin' });
  });
  test('B1 un seul mot : nom de famille seul', () => {
    assert.deepEqual(L.decouperNom('Madonna'), { prenom: '', nomFamille: 'Madonna' });
  });
  test('B1 espaces en trop ignorés ; vide reste vide', () => {
    assert.deepEqual(L.decouperNom('   Marie    Durand  '), { prenom: 'Marie', nomFamille: 'Durand' });
    assert.deepEqual(L.decouperNom('   '), { prenom: '', nomFamille: '' });
  });
  test('B1 le nom affiché est recalculé après modification du détail', () => {
    assert.deepEqual(L.patchNomDetaille('Marie ', ' Dupont'), { prenom: 'Marie', nomFamille: 'Dupont', nom: 'Marie Dupont' });
    assert.equal(L.patchNomDetaille('', 'Madonna').nom, 'Madonna');
  });
  test('B1 modifier le nom affiché redécoupe prénom et nom de famille', () => {
    assert.deepEqual(L.patchNomAffiche('Paul  Martin'), { nom: 'Paul Martin', prenom: 'Paul', nomFamille: 'Martin' });
  });
  test('B1 le nom est le seul champ obligatoire d’une personne', () => {
    assert.deepEqual(L.validerPersonne({ nom: '' }), { nom: 'Le nom est obligatoire.' });
    assert.deepEqual(L.validerPersonne({ nom: 'Léa' }), {});
    const p = L.nouvellePersonne({ nom: 'Léa' }, ctx());
    assert.equal(p.roles, undefined);
    assert.equal(p.organisationId, null);
    assert.equal(p.proprietaire, JEROME);
    assert.equal(p.archive, false);
  });
  test("B1 l'organisation et l'affaire n'exigent que le nom ou le titre", () => {
    assert.deepEqual(L.validerOrganisation({ nom: ' ' }), { nom: 'Le nom est obligatoire.' });
    assert.deepEqual(L.validerOrganisation({ nom: 'Fleurs' }), {});
    assert.deepEqual(L.validerAffaire({ titre: '' }), { titre: 'Le titre est obligatoire.' });
    assert.deepEqual(L.validerAffaire({ titre: 'x' }), {});
  });
  test("B1 un email invalide est signalé, pas un email vide", () => {
    assert.ok(L.validerPersonne({ nom: 'A', emails: [{ valeur: 'pas-un-email', type: 'travail' }] }).emails);
    assert.deepEqual(L.validerPersonne({ nom: 'A', emails: [{ valeur: '', type: 'travail' }] }), {});
  });
});

describe('B2 Doublons', () => {
  const liste = [
    personne({ id: '1', nom: 'Marie Durand', emails: [{ valeur: 'Marie@Exemple.fr ', type: 'travail' }], emailsNormalises: ['marie@exemple.fr'] }),
    personne({ id: '2', nom: 'Éric Léon', emails: [], emailsNormalises: [] }),
    personne({ id: '3', nom: 'Marie Durand', archive: true }),
  ];
  test('B2 même email (casse et espaces ignorés)', () => {
    const r = L.trouverDoublonsPersonne(liste, { nom: 'Autre Nom', emails: [{ valeur: ' marie@exemple.FR' }] });
    assert.deepEqual(r.map((p) => p.id), ['1']);
  });
  test('B2 même nom (accents, casse, espaces ignorés)', () => {
    assert.deepEqual(L.trouverDoublonsPersonne(liste, { nom: 'eric  LEON' }).map((p) => p.id), ['2']);
  });
  test('B2 aucune alerte pour deux personnes différentes ni pour une personne archivée', () => {
    assert.deepEqual(L.trouverDoublonsPersonne(liste, { nom: 'Paul Martin', emails: [{ valeur: 'paul@x.fr' }] }), []);
    assert.equal(L.trouverDoublonsPersonne(liste, { nom: 'Marie Durand' }).some((p) => p.id === '3'), false);
  });
  test('B2 la personne en cours de modification est exclue', () => {
    assert.deepEqual(L.trouverDoublonsPersonne(liste, { nom: 'Marie Durand' }, { sauf: '1' }), []);
  });
  test('B2 doublon d’organisation par nom', () => {
    const orgs = [organisation({ id: 'o1', nom: 'Fleurs de Provence' })];
    assert.equal(L.trouverDoublonsOrganisation(orgs, ' fleurs  de provence ').length, 1);
    assert.equal(L.trouverDoublonsOrganisation(orgs, 'Autre').length, 0);
  });
  test('B2 la liste des emails normalisés est dédoublonnée', () => {
    assert.deepEqual(L.emailsNormalises([{ valeur: 'A@b.fr' }, { valeur: ' a@B.fr' }, { valeur: '' }]), ['a@b.fr']);
    assert.deepEqual(L.patchEmails([{ valeur: 'X@y.fr', type: 'perso' }]).emailsNormalises, ['x@y.fr']);
  });
});

describe('B3 Recherche intelligente', () => {
  const el = [
    { id: '1', libelle: 'Marie Durand', sousTitre: 'Fleurs de Provence' },
    { id: '2', libelle: 'Charles Martin' },
    { id: '3', libelle: 'Bar des Arts' },
    { id: '4', libelle: 'Éloïse Parent' },
    { id: '5', libelle: 'Zoé Lemaire', extra: ['Boulangerie Arnaud'] },
  ];
  test('B3 moins de 2 lettres : aucune suggestion', () => {
    assert.deepEqual(L.rechercherSuggestions('a', el).resultats, []);
    assert.deepEqual(L.rechercherSuggestions(' ', el).resultats, []);
  });
  test('B3 la saisie peut se trouver n’importe où dans le texte', () => {
    const ids = L.rechercherSuggestions('ar', el).resultats.map((r) => r.id);
    assert.deepEqual([...ids].sort(), ['1', '2', '3', '4', '5']);
  });
  test('B3 accents et casse ignorés', () => {
    assert.deepEqual(L.rechercherSuggestions('ELOI', el).resultats.map((r) => r.id), ['4']);
    assert.deepEqual(L.rechercherSuggestions('éloïse', el).resultats.map((r) => r.id), ['4']);
  });
  test('B3 les débuts de mot passent avant les autres', () => {
    const r = L.rechercherSuggestions('ar', el).resultats.map((r) => r.id);
    // "Arts" (début de mot) avant "Marie" (au milieu d'un mot)
    assert.ok(r.indexOf('3') < r.indexOf('1'));
    assert.equal(L.rechercherSuggestions('mar', el).resultats[0].libelle.startsWith('Mar'), true);
  });
  test('B3 8 résultats au plus', () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => ({ id: String(i), libelle: `Marc ${i}` }));
    const r = L.rechercherSuggestions('marc', beaucoup);
    assert.equal(r.resultats.length, 8);
    assert.equal(r.total, 20);
  });
  test('B3 recherche aussi dans les informations liées (organisation, email)', () => {
    assert.deepEqual(L.rechercherSuggestions('boulang', el).resultats.map((r) => r.id), ['5']);
  });
  test('B3 plusieurs mots : tous doivent être présents', () => {
    assert.deepEqual(L.rechercherSuggestions('marie dur', el).resultats.map((r) => r.id), ['1']);
    assert.deepEqual(L.rechercherSuggestions('marie zzz', el).resultats, []);
  });
  test('B3 option "Créer" seulement si aucune valeur identique', () => {
    assert.equal(L.rechercherSuggestions('Nouvelle Org', el, { creer: true }).creer, 'Nouvelle Org');
    assert.equal(L.rechercherSuggestions('bar des arts', el, { creer: true }).creer, null);
    assert.equal(L.rechercherSuggestions('Nouvelle Org', el).creer, null);
    assert.equal(L.rechercherSuggestions('n', el, { creer: true }).creer, null);
  });
  test('B3 lettres trouvées en gras', () => {
    const segs = L.surligner('Marie Durand', 'dur');
    assert.deepEqual(segs, [{ texte: 'Marie ', fort: false }, { texte: 'Dur', fort: true }, { texte: 'and', fort: false }]);
    assert.deepEqual(L.surligner('Éloïse', 'eloi'), [{ texte: 'Éloï', fort: true }, { texte: 'se', fort: false }]);
  });
});

describe('B4 Statut dérivé de l’étape', () => {
  test('B4 seule l’étape qui porte le rôle « vente gagnée » donne le statut gagnée', () => {
    for (const e of ['premier_contact', 'rdv_fixe', 'proposition_envoyee']) assert.equal(L.statutPourEtape(e, L.CONFIG_JEROME), 'ouverte');
    assert.equal(L.statutPourEtape('gagne', L.CONFIG_JEROME), 'gagnee');
    assert.equal(L.statutPourEtape('etape_5', L.CONFIG_NEUTRE), 'gagnee', 'neutre : le rôle est porté par la 5e étape');
    assert.equal(L.statutPourEtape('etape_4', L.CONFIG_NEUTRE), 'ouverte');
  });
  test('B4 nouvelle affaire : valeurs automatiques', () => {
    const a = L.nouvelleAffaire({ titre: ' Atelier ', montant: '1200' }, ctx());
    assert.equal(a.etape, 'premier_contact');
    assert.equal(a.statut, 'ouverte');
    assert.equal(a.priorite, 'tiede');
    assert.equal(a.montant, 1200);
    assert.equal(a.titre, 'Atelier');
    assert.equal('encaissements' in a, false, 'plus de champ encaissements sur une nouvelle affaire (restes de la 2.2 supprimés)');
    assert.equal(a.projetId, null);
    assert.ok(a.datesEtapes.premier_contact);
  });
  test('B4 le titre est prérempli : organisation, sinon personne', () => {
    assert.equal(L.titreParDefaut({ organisation: { nom: 'Fleurs' }, personne: { nom: 'Marie' } }), 'Fleurs');
    assert.equal(L.titreParDefaut({ personne: { nom: 'Marie' } }), 'Marie');
    assert.equal(L.titreParDefaut({}), '');
  });
  test('B4 changement d’étape : statut dérivé, dates d’étapes conservées', () => {
    const a = affaire();
    const r = L.changementEtape(a, 'rdv_fixe', ctx('2026-10-16T08:00:00Z'));
    assert.equal(r.patch.etape, 'rdv_fixe');
    assert.equal(r.patch.statut, 'ouverte');
    assert.ok(r.patch.datesEtapes.premier_contact);
    assert.ok(r.patch.datesEtapes.rdv_fixe);
    assert.equal(r.evenements[0].type, 'etape_changee');
    const retour = L.changementEtape({ ...a, ...r.patch }, 'premier_contact', ctx('2026-10-17T08:00:00Z'));
    assert.equal(retour.patch.datesEtapes.rdv_fixe.getTime(), r.patch.datesEtapes.rdv_fixe.getTime());
  });
  test('B4 passer en Gagné : statut gagnée et événement', () => {
    const r = L.changementEtape(affaire({ etape: 'proposition_envoyee' }), 'gagne', ctx());
    assert.equal(r.patch.statut, 'gagnee');
    assert.ok(r.evenements.some((e) => e.type === 'affaire_gagnee'));
  });
  test('B4 même étape : rien à faire', () => {
    const r = L.changementEtape(affaire(), 'premier_contact', ctx());
    assert.deepEqual(r.patch, {});
    assert.deepEqual(r.evenements, []);
  });
  test('B4 étape inconnue refusée', () => {
    assert.ok(L.changementEtape(affaire(), 'nimporte', ctx()).erreurs.etape);
  });
});

describe('B5 Perdue, en pause, réouverture', () => {
  test('B5 perdue : raison obligatoire, étape conservée', () => {
    const a = affaire({ etape: 'proposition_envoyee' });
    assert.ok(L.marquerPerdue(a, { raison: '' }, ctx()).erreurs.raison);
    const r = L.marquerPerdue(a, { raison: 'Prix', detail: ' trop cher ' }, ctx());
    assert.equal(r.patch.statut, 'perdue');
    assert.equal(r.patch.raisonPerdue, 'Prix');
    assert.equal(r.patch.raisonPerdueDetail, 'trop cher');
    assert.equal('etape' in r.patch, false);
    assert.equal(r.evenements[0].type, 'affaire_perdue');
  });
  test('B5 en pause : date de réveil obligatoire, étape conservée', () => {
    const a = affaire({ etape: 'rdv_fixe' });
    assert.ok(L.mettreEnPause(a, { dateReveil: '' }, ctx()).erreurs.dateReveil);
    const r = L.mettreEnPause(a, { dateReveil: '2027-01-15' }, ctx());
    assert.equal(r.patch.statut, 'en_pause');
    assert.equal(r.patch.dateReveil, '2027-01-15');
    assert.equal('etape' in r.patch, false);
  });
  test('B5 date de réveil proposée : +3 mois, fin de mois respectée', () => {
    assert.equal(L.dateReveilParDefaut('2026-10-15'), '2027-01-15');
    assert.equal(L.dateReveilParDefaut('2026-11-30'), '2027-02-28');
    assert.equal(L.dateReveilParDefaut('2026-11-30').slice(0, 7), '2027-02');
  });
  test('B5 rouvrir : statut redérivé de l’étape, raison et réveil effacés', () => {
    const perdue = affaire({ etape: 'gagne', statut: 'perdue', raisonPerdue: 'Prix', raisonPerdueDetail: 'x' });
    const r = L.rouvrirAffaire(perdue, ctx());
    assert.equal(r.patch.statut, 'gagnee');
    assert.equal(r.patch.raisonPerdue, '');
    assert.equal(r.evenements[0].type, 'affaire_rouverte');
    assert.deepEqual(L.rouvrirAffaire(affaire(), ctx()).patch, {});
  });
  test('B5 déplacer une affaire perdue la rouvre à la nouvelle étape', () => {
    const perdue = affaire({ etape: 'rdv_fixe', statut: 'perdue', raisonPerdue: 'Prix' });
    const r = L.changementEtape(perdue, 'rdv_fixe', ctx());
    assert.equal(r.patch.statut, 'ouverte');
    assert.equal(r.evenements[0].type, 'affaire_rouverte');
  });
});

describe('B6 Étapes retirées en 2.2 et historique des encaissements', () => {
  test('B6 la vente s’arrête à Gagné : plus d’étape « Facture envoyée » ni « Facture payée » ; ces étapes sont refusées', () => {
    assert.deepEqual(L.etapesActives(L.CONFIG_JEROME).map((e) => e.id), ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne']);
    assert.equal(L.etapeGagnee(L.CONFIG_JEROME), 'gagne');
    const r = L.changementEtape(affaire({ etape: 'gagne', statut: 'gagnee' }), 'facture_payee', ctx());
    assert.ok(r.erreurs.etape);
    assert.deepEqual(r.patch, {});
  });
  test('B6 une affaire qui devient gagnée n’encaisse rien et n’est pas archivée', () => {
    const r = L.changementEtape(affaire({ etape: 'proposition_envoyee' }), 'gagne', ctx());
    assert.equal(r.patch.archive, false);
    assert.equal('encaissements' in r.patch, false);
    assert.equal(r.patch.statut, 'gagnee');
    assert.equal(r.evenements.some((e) => e.type === 'encaissement'), false);
  });
  test('B6 les restes de la 2.2 sont supprimés : ni étapes retirées, ni migration', () => {
    assert.equal(L.ETAPES_RETIREES, undefined);
    assert.equal(L.ETAPES, undefined);
    assert.equal(L.libelleEtape('facture_payee', L.CONFIG_JEROME), 'facture_payee', 'un identifiant inconnu s’affiche tel quel');
  });
  test('B6 l’ajout d’un encaissement sur l’affaire n’existe plus (la facturation se saisit sur les projets)', () => {
    assert.equal(L.ajouterEncaissement, undefined);
    assert.equal(L.planEncaisser, undefined);
    assert.equal(L.payeesDuMois, undefined);
  });
  test('B6 une nouvelle affaire ne supprime rien : les anciennes restent', () => {
    const ancienne = affaire({ id: 'a1', etape: 'facture_payee', archive: true, personneId: 'p' });
    const nouvelle = L.nouvelleAffaire({ titre: 'Suite', personneId: 'p' }, ctx());
    assert.equal(nouvelle.personneId, 'p');
    assert.equal(L.affairesDeLaPersonne([ancienne, { ...nouvelle, id: 'a2' }], 'p').length, 2);
  });
  test('B6 documents : adresse http obligatoire', () => {
    assert.ok(L.ajouterDocument(affaire(), 'Devis', 'devis.pdf').erreurs.url);
    const r = L.ajouterDocument(affaire(), 'Devis', 'https://drive.google.com/x');
    assert.equal(r.patch.documents[0].libelle, 'Devis');
    assert.deepEqual(L.supprimerDocument({ documents: [{ a: 1 }, { b: 2 }] }, 0).documents, [{ b: 2 }]);
  });
  test('Favoris : l’étoile se pose, se retire, et l’accueil rassemble affaires et projets', () => {
    assert.equal(L.ajouterDocument(affaire(), 'Suivi', 'https://claude.ai/x').patch.documents[0].favori, undefined);
    assert.equal(L.ajouterDocument(affaire(), 'Suivi', 'https://claude.ai/x', true).patch.documents[0].favori, true);
    const docs = [{ libelle: 'Devis', url: 'https://a' }, { libelle: 'Suivi', url: 'https://b' }];
    const pose = L.basculerFavoriDocument({ documents: docs }, 1).documents;
    assert.deepEqual(pose, [docs[0], { libelle: 'Suivi', url: 'https://b', favori: true }]);
    assert.deepEqual(L.basculerFavoriDocument({ documents: pose }, 1).documents, docs, 'retirer l’étoile efface le champ');
    const affaires = [{ id: 'a1', titre: 'Affaire 1', documents: [{ libelle: 'Zèbre', url: 'https://z', favori: true }, docs[0]] }, { id: 'a2', titre: 'Archivée', archive: true, documents: [{ libelle: 'X', url: 'https://x', favori: true }] }];
    const projets = [{ id: 'p1', titre: 'Projet 1', documents: [{ libelle: 'Agenda', url: 'https://g', favori: true }] }];
    const f = L.documentsFavoris(affaires, projets);
    assert.deepEqual(f.map((x) => x.libelle), ['Agenda', 'Zèbre'], 'triés par libellé, éléments archivés ignorés');
    assert.deepEqual(f[1].source, { type: 'affaire', id: 'a1', titre: 'Affaire 1' });
    assert.equal(f[1].index, 0);
    assert.deepEqual(L.documentsFavoris([], []), []);
  });
  test('Journal : les changements de documents sont écrits en phrases (favori ajouté ou retiré, document joint ou retiré)', () => {
    const devis = { libelle: 'Devis', url: 'https://a' };
    const suivi = { libelle: 'Suivi', url: 'https://b' };
    assert.deepEqual(L.changementsDocumentsJournal([devis, suivi], [devis, { ...suivi, favori: true }]), ['Favori ajouté : Suivi']);
    assert.deepEqual(L.changementsDocumentsJournal([devis, { ...suivi, favori: true }], [devis, suivi]), ['Favori retiré : Suivi']);
    assert.deepEqual(L.changementsDocumentsJournal([devis], [devis, suivi]), ['Document joint : Suivi']);
    assert.deepEqual(L.changementsDocumentsJournal([devis, suivi], [devis]), ['Document retiré : Suivi']);
    assert.deepEqual(L.changementsDocumentsJournal(undefined, [{ ...suivi, favori: true }]), ['Document joint (en favori) : Suivi']);
    assert.deepEqual(L.changementsDocumentsJournal([devis], [devis]), []);
  });
});

describe('B7 Retard, sans action, pastille', () => {
  const auj = '2026-10-15';
  test('B7 activité en retard : date passée, pas faite', () => {
    assert.equal(L.estActiviteEnRetard(activite({ date: '2026-10-14' }), auj), true);
    assert.equal(L.estActiviteEnRetard(activite({ date: '2026-10-15' }), auj), false);
    assert.equal(L.estActiviteEnRetard(activite({ date: '2026-10-16' }), auj), false);
  });
  test('B7 une activité faite n’est jamais en retard', () => {
    assert.equal(L.estActiviteEnRetard(activite({ date: '2026-10-01', fait: true }), auj), false);
  });
  test('B7 pastille : rouge, verte, grise', () => {
    assert.equal(L.pastilleActivite([activite({ date: '2026-10-14' })], auj), 'rouge');
    assert.equal(L.pastilleActivite([activite({ date: '2026-10-15' })], auj), 'verte');
    assert.equal(L.pastilleActivite([activite({ date: '2026-10-20' }), activite({ id: 'y', date: '2026-10-01' })], auj), 'rouge');
    assert.equal(L.pastilleActivite([], auj), 'grise');
    assert.equal(L.pastilleActivite([activite({ date: '2026-10-01', fait: true })], auj), 'grise');
  });
  test('B7 sans action prévue : affaire active sans activité à venir', () => {
    const a = affaire();
    assert.equal(L.estSansAction(a, []), true);
    assert.equal(L.estSansAction(a, [activite({ affaireId: 'a' })]), false);
    assert.equal(L.estSansAction(a, [activite({ affaireId: 'a', fait: true })]), true);
    assert.equal(L.estSansAction(a, [activite({ affaireId: 'autre' })]), true);
  });
  test('B7 sans action : perdue, en pause et archivée exclues', () => {
    assert.equal(L.estSansAction(affaire({ statut: 'perdue' }), []), false);
    assert.equal(L.estSansAction(affaire({ statut: 'en_pause' }), []), false);
    assert.equal(L.estSansAction(affaire({ archive: true, statut: 'gagnee' }), []), false);
  });
  test('B7 points clés : retard, aujourd’hui, réveil, sans action', () => {
    const affaires = [
      affaire({ id: 'a', titre: 'A' }),
      affaire({ id: 'b', titre: 'B' }),
      affaire({ id: 'c', statut: 'en_pause', dateReveil: '2026-10-15' }),
      affaire({ id: 'd', statut: 'en_pause', dateReveil: '2026-12-01' }),
      affaire({ id: 'e', statut: 'perdue' }),
    ];
    const activites = [
      activite({ id: '1', affaireId: 'a', date: '2026-10-10' }),
      activite({ id: '2', affaireId: 'a', date: '2026-10-15' }),
      activite({ id: '3', affaireId: 'a', date: '2026-10-30' }),
      activite({ id: '4', affaireId: 'e', date: '2026-10-01' }),
      activite({ id: '5', affaireId: null, personneId: 'p', date: '2026-10-14' }),
      activite({ id: '6', affaireId: 'a', date: '2026-10-01', fait: true }),
    ];
    const pc = L.pointsCles({ activites, affaires }, auj);
    assert.deepEqual(pc.enRetard.map((x) => x.id), ['1', '5']);
    assert.deepEqual(pc.aujourdhui.map((x) => x.id), ['2']);
    assert.deepEqual(pc.reveils.map((x) => x.id), ['c']);
    assert.deepEqual(pc.sansAction.map((x) => x.id), ['b']);
  });
  test('B7 points clés d’une fiche : états et tri', () => {
    const r = L.pointsClesFiche([activite({ id: '1', date: '2026-10-20' }), activite({ id: '2', date: '2026-10-10' }), activite({ id: '3', date: '2026-10-15' })], auj);
    assert.deepEqual(r.map((x) => [x.id, x.etat]), [['2', 'retard'], ['3', 'aujourdhui'], ['1', 'avenir']]);
  });
  test('B7 prochaine activité : la plus proche, heure comprise', () => {
    const p = L.prochaineActivite([activite({ id: '1', date: '2026-10-20' }), activite({ id: '2', date: '2026-10-18', heure: '16:00' }), activite({ id: '3', date: '2026-10-18', heure: '09:00' })]);
    assert.equal(p.id, '3');
    assert.equal(L.prochaineActivite([]), null);
  });
});

describe('B8 Boutons de date', () => {
  test('B8 Demain, +3 jours, +1 semaine, +2 semaines', () => {
    assert.equal(L.dateRapide('demain', '2026-10-15'), '2026-10-16');
    assert.equal(L.dateRapide('3j', '2026-10-15'), '2026-10-18');
    assert.equal(L.dateRapide('1sem', '2026-10-15'), '2026-10-22');
    assert.equal(L.dateRapide('2sem', '2026-10-15'), '2026-10-29');
  });
  test('B8 changement de mois et d’année', () => {
    assert.equal(L.dateRapide('3j', '2026-10-30'), '2026-11-02');
    assert.equal(L.dateRapide('2sem', '2026-12-25'), '2027-01-08');
    assert.equal(L.dateRapide('demain', '2028-02-28'), '2028-02-29');
  });
  test("B8 passage à l'heure d'hiver et d'été (Europe/Paris)", () => {
    assert.equal(L.aujourdhuiParis(new Date('2026-10-24T22:30:00Z')), '2026-10-25');
    assert.equal(L.dateRapide('demain', '2026-10-24'), '2026-10-25');
    assert.equal(L.dateRapide('3j', '2026-10-24'), '2026-10-27');
    assert.equal(L.dateRapide('3j', '2027-03-27'), '2027-03-30');
    assert.equal(L.aujourdhuiParis(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  });
  test('B8 dimanche de la semaine', () => {
    assert.equal(L.dimancheDeLaSemaine('2026-10-15'), '2026-10-18');
    assert.equal(L.dimancheDeLaSemaine('2026-10-18'), '2026-10-18');
    assert.equal(L.dimancheDeLaSemaine('2026-10-19'), '2026-10-25');
  });
  test('B8 heure interprétée à Paris, été comme hiver', () => {
    assert.equal(L.dateHeureParisVersDate('2026-07-01T10:00').toISOString(), '2026-07-01T08:00:00.000Z');
    assert.equal(L.dateHeureParisVersDate('2026-12-01T10:00').toISOString(), '2026-12-01T09:00:00.000Z');
  });
});

describe('B9 Action suggérée par l’étape (aucune règle en dur)', () => {
  const auj = '2026-10-15';
  const avecAction = (etapeId, action) => ({ ...L.CONFIG_JEROME, etapes: L.CONFIG_JEROME.etapes.map((e) => (e.id === etapeId ? { ...e, action } : e)) });
  test('B9 aucune suggestion par défaut, chez Jérôme comme chez un client (les deux règles en dur ont disparu)', () => {
    for (const e of L.CONFIG_JEROME.etapes) assert.equal(L.suggestionPourEtape(e.id, auj, L.CONFIG_JEROME), null);
    for (const e of L.CONFIG_NEUTRE.etapes) assert.equal(L.suggestionPourEtape(e.id, auj, L.CONFIG_NEUTRE), null);
    assert.equal(L.suggestionPourEtape('proposition_envoyee', auj, L.CONFIG_JEROME), null);
    assert.equal(L.suggestionPourEtape('gagne', auj, L.CONFIG_JEROME), null);
  });
  test('B9 une étape peut porter une action suggérée : type, titre, délai', () => {
    const c = avecAction('rdv_fixe', { type: 'appel', titre: 'Confirmer le rendez-vous', delaiJours: 2 });
    assert.deepEqual(L.suggestionPourEtape('rdv_fixe', auj, c), { type: 'appel', titre: 'Confirmer le rendez-vous', date: '2026-10-17' });
    assert.equal(L.suggestionPourEtape('gagne', auj, c), null, 'les autres étapes n’en ont pas');
  });
  test('B9 le changement d’étape fournit la suggestion de l’étape d’arrivée (jamais créée toute seule : aucune écriture d’activité)', () => {
    const c = avecAction('gagne', { type: 'tache', titre: 'Planifier le démarrage', delaiJours: 0 });
    const r = L.changementEtape(affaire({ etape: 'proposition_envoyee' }), 'gagne', ctx('2026-10-15T08:00:00Z', { config: c }));
    assert.deepEqual(r.suggestion, { type: 'tache', titre: 'Planifier le démarrage', date: '2026-10-15' });
    const plan = L.planChangerEtape(affaire({ etape: 'proposition_envoyee' }), 'gagne', ctx('2026-10-15T08:00:00Z', { nouvelId: (n) => `${n}_1`, config: c }));
    assert.equal(plan.ecritures.some((e) => e.collection === 'crm_activites'), false);
    assert.equal(L.changementEtape(affaire({ etape: 'proposition_envoyee' }), 'gagne', ctx()).suggestion, null);
  });
  test('B9 la configuration normalise l’action suggérée (titre vide = aucune, délai borné)', () => {
    const c = L.construireConfig({ etapes: { items: [{ action: { type: 'email', titre: '  ', delaiJours: 3 } }, { action: { type: 'inconnu', titre: 'Relance', delaiJours: -4 } }] } }, { racine: true });
    assert.equal(c.etapes[0].action, null);
    assert.deepEqual(c.etapes[1].action, { type: 'tache', titre: 'Relance', delaiJours: 0 });
  });
});

describe('B10 Activités, notes, historique', () => {
  test('B10 rattachement d’une activité : affaire, sinon personne, sinon organisation, sinon rien', () => {
    const fiches = { a1: { id: 'a1' }, p1: { id: 'p1' }, o1: { id: 'o1' } };
    const trouver = { affaire: (id) => fiches[id] ?? null, personne: (id) => fiches[id] ?? null, organisation: (id) => fiches[id] ?? null };
    const r = (liens) => L.rattachementActivite(activite(liens), trouver);
    assert.equal(r({ affaireId: 'a1', personneId: 'p1', organisationId: 'o1' }).type, 'affaire');
    assert.equal(r({ personneId: 'p1', organisationId: 'o1' }).type, 'personne');
    assert.equal(r({ organisationId: 'o1' }).type, 'organisation');
    assert.deepEqual(r({ personneId: 'p1' }).fiche, { id: 'p1' });
    assert.equal(r({}), null);
    assert.equal(r({ affaireId: 'supprimee', personneId: 'p1' }).type, 'personne'); // fiche supprimée ignorée
  });
  test('B10 activité : titre prérempli, date du jour par défaut', () => {
    const a = L.nouvelleActivite({ type: 'appel' }, ctx());
    assert.equal(a.titre, 'Appel');
    assert.equal(a.date, '2026-10-15');
    assert.equal(a.fait, false);
    assert.equal(L.nouvelleActivite({ type: 'rendez_vous', titre: ' Café ' }, ctx()).titre, 'Café');
    assert.equal(L.nouvelleActivite({ type: 'inconnu' }, ctx()).type, 'tache');
  });
  test('B10 activité de projet : le projet est gardé ; une activité ordinaire n’a pas ce champ', () => {
    assert.equal(L.nouvelleActivite({ type: 'appel', projetId: 'pr1', personneId: 'p1' }, ctx()).projetId, 'pr1');
    assert.equal('projetId' in L.nouvelleActivite({ type: 'appel', personneId: 'p1' }, ctx()), false);
  });
  test('B10 "Fait" : enregistre la date et crée l’événement', () => {
    const r = L.activiteFaite(activite({ type: 'rendez_vous', titre: 'Café', personneId: 'p', affaireId: 'a' }), ctx('2026-10-15T09:00:00Z'));
    assert.equal(r.patch.fait, true);
    assert.equal(r.patch.dateFait.toISOString(), '2026-10-15T09:00:00.000Z');
    assert.equal(r.evenements[0].type, 'activite_faite');
    assert.equal(r.evenements[0].personneId, 'p');
    assert.deepEqual(L.activiteFaite(activite({ fait: true }), ctx()).patch, {});
  });
  test('B10 une note sur une affaire porte aussi la personne et l’organisation', () => {
    const a = affaire({ id: 'a9', personneId: 'p1', organisationId: 'o1' });
    const n = L.nouvelleNote('  Rappeler jeudi ', L.liensAffaire(a), ctx());
    assert.deepEqual([n.personneId, n.organisationId, n.affaireId], ['p1', 'o1', 'a9']);
    assert.equal(n.texte, 'Rappeler jeudi');
    assert.deepEqual(L.validerNote('   '), { texte: 'La note est vide.' });
  });
  test('B10 historique : mêle activités faites, notes, événements, du plus récent au plus ancien', () => {
    const entrees = L.entreesHistorique({
      activites: [activite({ id: 'f', fait: true, dateFait: new Date('2026-10-12T10:00:00Z') }), activite({ id: 'nf', fait: false })],
      notes: [{ id: 'n', texte: 'x', creeLe: new Date('2026-10-14T10:00:00Z') }],
      evenements: [{ id: 'e', type: 'etape_changee', texte: 'y', date: new Date('2026-10-13T10:00:00Z') }, { id: 'e2', type: 'email_envoye', texte: 'z', date: new Date('2026-10-15T10:00:00Z') }],
    });
    assert.deepEqual(entrees.map((e) => e.element.id), ['e2', 'n', 'e', 'f']);
  });
  test('B10 historique : les cinq filtres', () => {
    const donnees = {
      activites: [activite({ id: 'f', fait: true, dateFait: new Date('2026-10-12T10:00:00Z') })],
      notes: [{ id: 'n', texte: 'x', creeLe: new Date('2026-10-14T10:00:00Z') }],
      evenements: [
        { id: 'e', type: 'etape_changee', date: new Date('2026-10-13T10:00:00Z') },
        { id: 'e2', type: 'email_envoye', date: new Date('2026-10-15T10:00:00Z') },
      ],
    };
    const ids = (f) => L.entreesHistorique(donnees, f).map((x) => x.element.id).sort();
    assert.deepEqual(ids('tous'), ['e', 'e2', 'f', 'n']);
    assert.deepEqual(ids('activites'), ['f']);
    assert.deepEqual(ids('notes'), ['n']);
    assert.deepEqual(ids('affaires'), ['e']);
    assert.deepEqual(ids('evenements'), ['e', 'e2']);
  });
  test('B10 historique limité aux 500 lignes les plus récentes', () => {
    const notes = Array.from({ length: 600 }, (_, i) => ({ id: `n${i}`, texte: `Note ${i}`, creeLe: new Date(2026, 0, 1, 0, i) }));
    const r = L.entreesHistorique({ notes });
    assert.equal(r.length, 500);
    assert.equal(r[0].element.id, 'n599');
  });
  test('B10 email : actif sauf opposition ou adresse absente', () => {
    assert.equal(L.emailActif(personne({ emails: [{ valeur: 'a@b.fr', type: 'travail' }] })), true);
    assert.equal(L.emailActif(personne({ emails: [{ valeur: 'a@b.fr', type: 'travail' }], oppositionProspection: true })), false);
    assert.equal(L.emailActif(personne({ emails: [] })), false);
    assert.equal(L.premierEmail(personne({ emails: [{ valeur: 'x', type: 'travail' }, { valeur: 'a@b.fr', type: 'perso' }] })), 'a@b.fr');
    assert.equal(L.marquerOpposition(true, ctx()).oppositionProspection, true);
    assert.equal(L.marquerOpposition(false, ctx()).dateOpposition, null);
  });
});

describe('B11 Objectifs', () => {
  const mois = '2026-10';
  test('B11 nouveaux contacts : personnes créées dans le mois (fuseau Paris)', () => {
    const personnes = [
      personne({ id: '1', creeLe: new Date('2026-10-01T08:00:00Z') }),
      personne({ id: '2', creeLe: new Date('2026-09-30T22:30:00Z') }), // 1er octobre 00:30 à Paris
      personne({ id: '3', creeLe: new Date('2026-10-31T22:30:00Z') }), // 31 octobre 23:30 à Paris
      personne({ id: '4', creeLe: new Date('2026-10-31T23:30:00Z') }), // 1er novembre à Paris
    ];
    assert.equal(L.CALCULS.nouveaux_contacts.calculer({ personnes }, mois), 3);
  });
  test('B11 rendez vous tenus : activités rendez vous faites dans le mois', () => {
    const activites = [
      activite({ id: '1', type: 'rendez_vous', fait: true, dateFait: new Date('2026-10-10T10:00:00Z') }),
      activite({ id: '2', type: 'rendez_vous', fait: false }),
      activite({ id: '3', type: 'appel', fait: true, dateFait: new Date('2026-10-10T10:00:00Z') }),
      activite({ id: '4', type: 'rendez_vous', fait: true, dateFait: new Date('2026-11-02T10:00:00Z') }),
    ];
    assert.equal(L.CALCULS.rdv_tenus.calculer({ activites }, mois), 1);
  });
  test('B11 propositions envoyées : première date de l’étape dans le mois', () => {
    const affaires = [
      affaire({ id: '1', datesEtapes: { proposition_envoyee: new Date('2026-10-12T10:00:00Z') } }),
      affaire({ id: '2', datesEtapes: { proposition_envoyee: new Date('2026-09-12T10:00:00Z') } }),
      affaire({ id: '3', datesEtapes: {} }),
    ];
    assert.equal(L.CALCULS.propositions_envoyees.calculer({ affaires }, mois), 1);
  });
  test('B11 chiffre d’affaires : somme des encaissements du mois', () => {
    const affaires = [
      affaire({ id: '1', encaissements: [{ date: new Date('2026-10-12T10:00:00Z'), montant: 500 }, { date: new Date('2026-09-12T10:00:00Z'), montant: 300 }] }),
      affaire({ id: '2', encaissements: [{ date: new Date('2026-10-20T10:00:00Z'), montant: 250.5 }] }),
    ];
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires }, mois), 750.5);
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires }, '2026-09'), 300);
  });
  test('B11 objectifs de Jérôme (sa base) : les cinq, dont Flyers qui reste chez lui seulement', () => {
    assert.deepEqual(L.OBJECTIFS_JEROME.map((o) => [o.id, o.cible]), [
      ['nouveaux_contacts', 10], ['rdv_tenus', 4], ['propositions_envoyees', 3], ['ca_encaisse', 1000], ['flyers', 100],
    ]);
    const flyers = L.OBJECTIFS_JEROME.find((o) => o.id === 'flyers');
    assert.equal(L.valeurObjectif(flyers, { saisies: [{ objectifId: 'flyers', mois, valeur: 40 }], mois }), 40);
    assert.equal(L.valeurObjectif(flyers, { saisies: [], mois }), 0);
  });
  test('B11 progression et objectifs franchis', () => {
    assert.equal(L.progression(5, 10), 50);
    assert.equal(L.progression(12, 10), 120);
    const o = [{ id: 'a', cible: 10 }, { id: 'b', cible: 10 }];
    assert.deepEqual(L.objectifsFranchis({ a: 9, b: 12 }, { a: 10, b: 13 }, o).map((x) => x.id), ['a']);
  });
});

describe('B12 Graphique du chiffre d’affaires depuis le début d’activité', () => {
  const debut = '2026-10';
  test('B12 en octobre 2026 : un seul mois', () => {
    assert.deepEqual(L.fenetreCa(debut, '2026-10'), ['2026-10']);
  });
  test('B12 en décembre 2026 : trois mois', () => {
    assert.deepEqual(L.fenetreCa(debut, '2026-12'), ['2026-10', '2026-11', '2026-12']);
  });
  test('B12 en mars 2027 : six mois', () => {
    assert.deepEqual(L.fenetreCa(debut, '2027-03'), ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  });
  test('B12 en avril 2027 : la fenêtre de six mois glisse', () => {
    assert.deepEqual(L.fenetreCa(debut, '2027-04'), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  });
  test('B12 aucun mois antérieur au début n’apparaît jamais', () => {
    for (const m of ['2026-10', '2026-11', '2027-01', '2027-06', '2028-01']) {
      assert.ok(L.fenetreCa(debut, m).every((x) => x >= debut), m);
    }
  });
  test('B12 avant le début, un seul mois (le début) ; début invalide : mois courant', () => {
    assert.deepEqual(L.fenetreCa(debut, '2026-08'), ['2026-10']);
    assert.deepEqual(L.fenetreCa('n’importe quoi', '2026-12'), ['2026-12']);
  });
  test('B12 changer le début d’activité change la fenêtre', () => {
    assert.deepEqual(L.fenetreCa('2026-12', '2027-01'), ['2026-12', '2027-01']);
  });
  test('B12 chiffre d’affaires par mois', () => {
    const affaires = [affaire({ encaissements: [{ date: new Date('2026-11-12T10:00:00Z'), montant: 400 }] })];
    const r = L.caParMois(affaires, ['2026-10', '2026-11']);
    assert.deepEqual(r.map((x) => x.montant), [0, 400]);
    assert.equal(r[0].libelle, 'oct.');
  });
  test('B12 totaux de colonne et comptage par étape (la colonne « Facture payée » n’existe plus)', () => {
    const affaires = [
      affaire({ id: '1', etape: 'gagne', statut: 'gagnee', montant: 100 }),
      affaire({ id: '3', etape: 'gagne', statut: 'gagnee', montant: 70 }),
    ];
    assert.deepEqual(L.totauxColonne(affaires), { nombre: 2, montant: 170 });
    assert.equal(L.compterParEtape(affaires, L.CONFIG_JEROME).find((e) => e.id === 'gagne').nombre, 2);
    assert.equal(L.compterParEtape(affaires, L.CONFIG_JEROME).length, 4, 'toutes les étapes actives, même vides');
    assert.equal(L.compterParEtape(affaires, L.CONFIG_JEROME).find((e) => e.id === 'rdv_fixe').nombre, 0);
  });
});

describe('B13 Filtres', () => {
  const orgs = [organisation({ id: 'o1', nom: 'Fleurs de Provence', secteur: 'Commerce local', ville: 'Manosque', etiquettes: ['commercant_local'] }), organisation({ id: 'o2', nom: 'Atelier Bois', ville: 'Digne', archive: true })];
  const pers = [
    personne({ id: '1', nom: 'Marie Durand', organisationId: 'o1', etiquettes: ['prospect_chaud'], ville: 'Manosque', source: 'Flyer', emails: [{ valeur: 'marie@fleurs.fr', type: 'travail' }] }),
    personne({ id: '2', nom: 'Éric Léon', ville: 'Digne' }),
    personne({ id: '3', nom: 'Paul Martin', etiquettes: ['partenaire'] }),
    personne({ id: '4', nom: 'Vieux Contact', archive: true }),
  ];
  const ids = (l) => l.map((x) => x.id);
  test('B13 personnes : les archivées sont masquées sauf avec le filtre Archivés', () => {
    assert.deepEqual(ids(L.filtrerPersonnes(pers, {}, { organisations: orgs })), ['1', '2', '3']);
    assert.deepEqual(ids(L.filtrerPersonnes(pers, { archives: true })), ['4']);
  });
  test('B13 personnes : chaque filtre seul', () => {
    const f = (c) => ids(L.filtrerPersonnes(pers, c, { organisations: orgs }));
    assert.deepEqual(f({ etiquettes: ['prospect_chaud'] }), ['1']);
    assert.deepEqual(f({ organisations: ['o1'] }), ['1']);
    assert.deepEqual(f({ etiquettes: ['partenaire'] }), ['3']);
    assert.deepEqual(f({ sources: ['Flyer'] }), ['1']);
    assert.deepEqual(f({ villes: ['Digne'] }), ['2']);
  });
  test('B13 personnes : recherche insensible aux accents, dans nom, organisation, email', () => {
    const f = (r) => ids(L.filtrerPersonnes(pers, { recherche: r }, { organisations: orgs }));
    assert.deepEqual(f('eric'), ['2']);
    assert.deepEqual(f('provence'), ['1']);
    assert.deepEqual(f('marie@fleurs'), ['1']);
    assert.deepEqual(f('marie zzz'), []);
  });
  test('B13 personnes : filtres combinés', () => {
    assert.deepEqual(ids(L.filtrerPersonnes(pers, { etiquettes: ['partenaire'], recherche: 'paul' }, { organisations: orgs })), ['3']);
  });
  test('B13 organisations : filtres seuls et combinés', () => {
    assert.deepEqual(ids(L.filtrerOrganisations(orgs, {})), ['o1']);
    assert.deepEqual(ids(L.filtrerOrganisations(orgs, { archives: true })), ['o2']);
    assert.deepEqual(ids(L.filtrerOrganisations(orgs, { secteurs: ['Commerce local'], villes: ['Manosque'] })), ['o1']);
    assert.deepEqual(ids(L.filtrerOrganisations(orgs, { etiquettes: ['commercant_local'] })), ['o1']);
    assert.deepEqual(ids(L.filtrerOrganisations(orgs, { recherche: 'fleurs' })), ['o1']);
  });
  const auj = '2026-10-15';
  const affs = [
    affaire({ id: 'a', titre: 'Atelier IA', personneId: '1', organisationId: 'o1', etape: 'rdv_fixe', priorite: 'chaud', source: 'Flyer', offreId: 'audit' }),
    affaire({ id: 'b', titre: 'Audit', etape: 'gagne', statut: 'gagnee' }),
    affaire({ id: 'c', titre: 'Vieille', statut: 'perdue' }),
    affaire({ id: 'd', titre: 'Payée', etape: 'facture_payee', statut: 'gagnee', archive: true }),
  ];
  const acts = [activite({ id: '1', affaireId: 'a', date: '2026-10-10' }), activite({ id: '2', affaireId: 'b', date: '2026-10-30' })];
  const fa = (c) => ids(L.filtrerAffaires(affs, c, { activites: acts, personnes: pers, organisations: orgs, aujourdhui: auj }));
  test('B13 affaires : archivées masquées sauf avec le filtre', () => {
    assert.deepEqual(fa({}), ['a', 'b', 'c']);
    assert.deepEqual(fa({ archives: true }), ['d']);
  });
  test('B13 affaires : chaque filtre seul', () => {
    assert.deepEqual(fa({ etapes: ['rdv_fixe'] }), ['a']);
    assert.deepEqual(fa({ statuts: ['perdue'] }), ['c']);
    assert.deepEqual(fa({ priorites: ['chaud'] }), ['a']);
    assert.deepEqual(fa({ offres: ['audit'] }), ['a']);
    assert.deepEqual(fa({ sources: ['Flyer'] }), ['a']);
    assert.deepEqual(fa({ personnes: ['1'] }), ['a']);
    assert.deepEqual(fa({ organisations: ['o1'] }), ['a']);
    assert.deepEqual(fa({ recherche: 'marie' }), ['a']);
    assert.deepEqual(fa({ enRetard: true }), ['a']);
    assert.deepEqual(fa({ sansAction: true }), []);
  });
  test('B13 affaires : sans action prévue', () => {
    assert.deepEqual(ids(L.filtrerAffaires([affaire({ id: 'z' })], { sansAction: true }, { activites: [], aujourdhui: auj })), ['z']);
  });
  test('B13 affaires : à relancer cette semaine (retards inclus, jusqu’à dimanche)', () => {
    assert.deepEqual(fa({ semaine: true }), ['a']); // 'b' est le 30 octobre : hors semaine
    assert.deepEqual(ids(L.filtrerAffaires(affs, { semaine: true }, { activites: [...acts, activite({ id: '9', affaireId: 'b', date: '2026-10-18' })], aujourdhui: auj })), ['a', 'b']);
  });
  test('B13 affaires : filtres combinés', () => {
    assert.deepEqual(fa({ etapes: ['rdv_fixe', 'gagne'], enRetard: true }), ['a']);
  });
  test('B13 filtres enregistrés de départ (Jérôme : trois ; un nouvel espace : deux, sans filtre propre à Jérôme)', () => {
    assert.deepEqual(L.FILTRES_JEROME.map((f) => [f.id, f.liste]), [
      ['relancer_semaine', 'affaires'], ['chaudes', 'affaires'], ['reseau_entrepreneuses', 'affaires'],
    ]);
    assert.deepEqual(L.FILTRES_NEUTRES.map((f) => f.id), ['relancer_semaine', 'chaudes']);
    const chaudes = L.FILTRES_JEROME.find((f) => f.id === 'chaudes').criteres;
    assert.deepEqual(fa(chaudes), ['a']);
    const reseau = L.FILTRES_JEROME.find((f) => f.id === 'reseau_entrepreneuses').criteres;
    assert.deepEqual(fa(reseau), []);
  });
  test('B13 pastilles supprimables', () => {
    const c = { etapes: ['rdv_fixe'], enRetard: true };
    const p = L.pastillesFiltres('affaires', c, { config: L.CONFIG_JEROME });
    assert.deepEqual(p.map((x) => x.libelle), ['Étape : Rendez vous fixé', 'En retard']);
    const sans = L.retirerCritere('affaires', c, 'etapes', 'rdv_fixe');
    assert.deepEqual(sans.etapes, []);
    assert.equal(L.retirerCritere('affaires', c, 'enRetard').enRetard, false);
    assert.equal(L.criteresActifs('affaires', c), true);
    assert.equal(L.criteresActifs('affaires', {}), false);
  });
  test('B13 tri : valeurs vides en dernier, accents au tri français', () => {
    const l = [{ n: 'zoé' }, { n: '' }, { n: 'Éric' }, { n: 'adam' }];
    assert.deepEqual(L.trier(l, (x) => x.n).map((x) => x.n), ['adam', 'Éric', 'zoé', '']);
    assert.deepEqual(L.trier(l, (x) => x.n, 'desc').map((x) => x.n), ['zoé', 'Éric', 'adam', '']);
  });
});

describe('B14 Intégrité des liens', () => {
  const personnes = [personne({ id: 'p1', organisationId: 'o1' }), personne({ id: 'p2', organisationId: 'o2' })];
  const affaires = [affaire({ id: 'a1', personneId: 'p1', organisationId: 'o1' }), affaire({ id: 'a2', personneId: 'p1' }), affaire({ id: 'a3', personneId: 'p2', organisationId: 'o3' })];
  test('B14 suppression d’une organisation refusée si elle a des personnes ou des affaires', () => {
    const r = L.verifierSuppressionOrganisation('o1', { personnes, affaires });
    assert.equal(r.ok, false);
    assert.equal(r.personnes, 1);
    assert.equal(r.affaires, 1);
    assert.match(r.raison, /1 personne et 1 affaire/);
    assert.equal(L.verifierSuppressionOrganisation('o3', { personnes, affaires }).ok, false);
  });
  test('B14 suppression d’une organisation vide autorisée', () => {
    assert.equal(L.verifierSuppressionOrganisation('o9', { personnes, affaires }).ok, true);
  });
  test('B14 suppression d’une personne : choisir le sort de ses affaires', () => {
    assert.deepEqual(L.planSuppressionPersonne('p1', affaires, 'affaires'), { supprimerAffaires: ['a1', 'a2'], detacherAffaires: [] });
    assert.deepEqual(L.planSuppressionPersonne('p1', affaires, 'conserver'), { supprimerAffaires: [], detacherAffaires: ['a1', 'a2'] });
    assert.throws(() => L.planSuppressionPersonne('p1', affaires, undefined));
    assert.deepEqual(L.planSuppressionPersonne('inconnu', affaires, undefined), { supprimerAffaires: [], detacherAffaires: [] });
  });
  test('B14 confirmation par le nom : sans accents ni casse', () => {
    assert.equal(L.confirmationValide('eric  leon', 'Éric Léon'), true);
    assert.equal(L.confirmationValide('eric', 'Éric Léon'), false);
    assert.equal(L.confirmationValide('', ''), false);
  });
  test('B14 les liens du fil suivent l’affaire', () => {
    assert.deepEqual(L.liensAffaire(affaire({ id: 'z', personneId: 'p', organisationId: 'o' })), { personneId: 'p', organisationId: 'o', affaireId: 'z' });
  });
});

describe('B15 Export JSON', () => {
  const orgs = [organisation({ id: 'o1', nom: 'Fleurs; "de" Provence' })];
  const pers = [personne({ id: 'p1', nom: 'Marie Durand', organisationId: 'o1', emails: [{ valeur: 'marie@x.fr', type: 'perso' }], etiquettes: ['partenaire'] })];
  const affs = [affaire({ id: 'a1', titre: 'Atelier\nIA', personneId: 'p1', organisationId: 'o1', montant: 1200.5, offreId: 'audit' })];
  test('B15 JSON complet : toutes les collections, identifiants présents, dates en ISO', () => {
    const texte = L.exportJson({
      crm_personnes: pers, crm_organisations: orgs, crm_affaires: affs,
      crm_activites: [], crm_notes: [], crm_evenements: [{ id: 'e', date: { seconds: 1760000000, nanoseconds: 0 } }],
      crm_parametres: [{ id: 'general', delaiPaiementJours: 30 }],
    }, new Date('2026-10-20T10:00:00Z'));
    const j = JSON.parse(texte);
    assert.equal(j.version, '2.0.0');
    assert.equal(j.exporteLe, '2026-10-20T10:00:00.000Z');
    assert.deepEqual(Object.keys(j.collections).sort(), ['crm_activites', 'crm_affaires', 'crm_evenements', 'crm_notes', 'crm_organisations', 'crm_parametres', 'crm_personnes']);
    assert.equal(j.collections.crm_personnes[0].id, 'p1');
    assert.equal(j.collections.crm_personnes[0].creeLe, '2026-10-01T08:00:00.000Z');
    assert.equal(j.collections.crm_evenements[0].date, '2025-10-09T08:53:20.000Z');
  });
  test('B15 noms de fichiers datés (jour de Paris)', () => {
    assert.equal(L.nomFichierExport(new Date('2026-10-20T10:00:00Z')), 'chevalier-ia-os-2026-10-20.json');
    assert.equal(L.nomFichierExport(new Date('2026-10-20T22:30:00Z'), 'contacts'), 'chevalier-ia-contacts-2026-10-21.vcf');
  });
  test('B15 rappel d’export : affiché sans export ou après plus de 30 jours', () => {
    const maintenant = new Date('2026-11-20T10:00:00Z');
    assert.equal(L.rappelExportVisible(null, maintenant), true);
    assert.equal(L.rappelExportVisible(new Date('2026-11-10T10:00:00Z'), maintenant), false);
    assert.equal(L.rappelExportVisible(new Date('2026-10-20T10:00:00Z'), maintenant), true);
    assert.equal(L.rappelExportVisible({ seconds: Math.floor(new Date('2026-11-15T10:00:00Z').getTime() / 1000), nanoseconds: 0 }, maintenant), false);
  });
});

describe('B16 Formats et réglages de départ', () => {
  test('B16 euros et nombres à la française', () => {
    assert.equal(L.formatEuros(1000), '1 000 €');
    assert.equal(L.formatEuros(1234.5), '1 234,50 €');
    assert.equal(L.formatNombre(12.5), '12,5');
  });
  test('B16 jours et mois', () => {
    assert.equal(L.formatJour('2026-10-05'), '05/10/2026');
    assert.equal(L.formatJourCourt('2026-10-16', '2026-10-15'), 'Demain');
    assert.equal(L.formatJourCourt('2026-10-14', '2026-10-15'), 'Hier');
    assert.equal(L.formatJourCourt('2026-10-20', '2026-10-15'), '20 oct.');
    assert.equal(L.libelleMois('2026-10'), 'octobre 2026');
    assert.equal(L.decalerMois('2026-12', 1), '2027-01');
  });
  test('B16 réglages de départ : Jérôme garde ses valeurs, un client part sur du neutre', () => {
    assert.deepEqual(L.REGLAGES_JEROME, {
      debutActivite: '2026-10', dernierExport: null, dernierExportContacts: null,
      proprietaireGithub: 'jeromechevalier-wq',
      cheminProjets: '~/Library/CloudStorage/GoogleDrive-jerome.chevalier@gmail.com/Mon Drive/Chevalier-AI/Projets',
      dossierParentDrive: null, sousDossiersDrive: [],
      suiviPaiements: true, clotureBloquee: true, boutonsDepot: true, celebrations: true,
      prenomCelebration: 'Jérôme', imageCelebration: 'assets/charles-portrait.png',
    });
    assert.deepEqual(L.REGLAGES_NEUTRES, {
      debutActivite: null, dernierExport: null, dernierExportContacts: null, proprietaireGithub: '', cheminProjets: '',
      dossierParentDrive: null, sousDossiersDrive: [],
      suiviPaiements: false, clotureBloquee: true, boutonsDepot: true, celebrations: true,
      prenomCelebration: '', imageCelebration: '',
    });
    assert.equal('delaiPaiementJours' in L.REGLAGES_JEROME, false, 'le réglage « Délai de paiement » (2.2) est supprimé');
  });
  test('B16 valeurs de départ : Jérôme (étiquettes, offres, secteurs, sources) et un nouvel espace neutre', () => {
    assert.deepEqual(L.ETIQUETTES_JEROME.map((e) => e.nom), ['Prospect chaud', 'Réseau entrepreneuses', 'Commerçant local', 'Partenaire']);
    assert.deepEqual(L.OFFRES_JEROME.map((o) => o.nom), ['Audit', 'Accompagnement']);
    assert.equal(L.SECTEURS_JEROME.length, 7);
    assert.equal(L.SOURCES_JEROME.length, 8);
    const neutre = L.parametresDepart({ racine: false, moisCourant: '2027-02' });
    assert.deepEqual(neutre.offres.items, []);
    assert.ok(!JSON.stringify(neutre).match(/Audit|Accompagnement|Réseau entrepreneuses|Flyer|jeromechevalier|Charles|Prospect chaud|Commerçant local/), 'rien de Jérôme dans le jeu neutre');
    assert.equal(neutre.reglages.debutActivite, '2027-02');
    assert.equal(neutre.etapes.roleGagnee, 'etape_5');
    assert.equal(neutre.phases.roleCloture, 'phase_4');
    assert.deepEqual(neutre.modeles_affaire.items.map((m) => m.id), ['affaire-type']);
    const jerome = L.parametresDepart({ racine: true });
    assert.deepEqual(jerome.etapes.items.map((e) => e.id), ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6']);
    assert.deepEqual(jerome.modeles_affaire.items, []);
  });
  test('B16 quatre étapes de vente actives chez Jérôme, couleurs de la charte', () => {
    assert.deepEqual(L.etapesActives(L.CONFIG_JEROME).map((e) => e.id), ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne']);
    assert.equal(L.couleurEtape('gagne', L.CONFIG_JEROME), '#ecbc06');
    assert.equal(L.libelleEtape('rdv_fixe', L.CONFIG_JEROME), 'Rendez vous fixé');
  });
});

// ---------------------------------------------------------------- B17 plans d'écriture (écran ET serveur MCP)

/** Petit « exécuteur » en mémoire : applique les écritures d'un plan comme l'écran (horodater -> date, signer -> acteur). */
function executerPlan(base, ecritures, { maintenant, acteur }) {
  const sortie = structuredClone(base);
  for (const e of ecritures) {
    const liste = (sortie[e.collection] ||= []);
    const marques = {};
    for (const c of e.horodater || []) marques[c] = maintenant;
    for (const c of e.signer || []) marques[c] = acteur;
    const i = liste.findIndex((d) => d.id === e.id);
    if (e.type === 'creer') liste.push({ ...e.donnees, ...marques, id: e.id });
    else if (e.type === 'modifier') Object.assign(liste[i], e.patch, marques);
    else liste.splice(i, 1);
  }
  return sortie;
}
const ctxPlan = (extra = {}) => {
  let n = 0;
  return { ...ctx('2026-10-15T08:00:00Z'), nouvelId: (nom) => `${nom}_${++n}`, ...extra };
};
const par = (ecritures, type) => ecritures.filter((e) => e.type === type);

describe('B17 Plans d’écriture : créations', () => {
  test('B17 personne : le document, ses marques de création, et l’événement du fil', () => {
    const plan = L.planCreerPersonne({ nom: ' Marie  Durand ', organisationId: 'o' }, ctxPlan());
    assert.equal(plan.id, 'crm_personnes_1');
    const [p, ev] = plan.ecritures;
    assert.deepEqual([p.type, p.collection, p.id], ['creer', 'crm_personnes', 'crm_personnes_1']);
    assert.equal(p.donnees.nom, 'Marie Durand');
    assert.equal(p.donnees.proprietaire, JEROME);
    assert.deepEqual(p.horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual(p.signer, ['creePar', 'modifiePar']);
    assert.equal(ev.collection, 'crm_evenements');
    assert.equal(ev.donnees.type, 'personne_creee');
    assert.equal(ev.donnees.texte, 'Personne créée : Marie Durand');
    assert.equal(ev.donnees.personneId, 'crm_personnes_1');
    assert.equal(ev.donnees.organisationId, 'o');
    assert.equal(ev.donnees.auteur, JEROME);
  });
  test('B17 propriétaire : ctx.proprietaire l’emporte sur l’acteur (agent MCP), pour personne, organisation et affaire', () => {
    const c = ctxPlan({ auteur: 'hermes-bibliothecaire', proprietaire: JEROME });
    assert.equal(L.planCreerPersonne({ nom: 'A B' }, c).ecritures[0].donnees.proprietaire, JEROME);
    assert.equal(L.planCreerOrganisation({ nom: 'Org' }, c).ecritures[0].donnees.proprietaire, JEROME);
    assert.equal(L.planCreerAffaire({ titre: 'T' }, {}, c).ecritures[0].donnees.proprietaire, JEROME);
    assert.equal(L.planCreerPersonne({ nom: 'A B' }, c).ecritures[1].donnees.auteur, 'hermes-bibliothecaire', 'le fil garde l’acteur');
    assert.equal(L.planCreerPersonne({ nom: 'A B' }, ctxPlan()).ecritures[0].donnees.proprietaire, JEROME, 'sans proprietaire : l’acteur, comme avant');
  });
  test('B17 organisation : document, marques de création et événement', () => {
    const plan = L.planCreerOrganisation({ nom: 'Atelier' }, ctxPlan());
    assert.deepEqual(plan.ecritures.map((e) => [e.collection, e.donnees.type ?? e.donnees.nom]), [['crm_organisations', 'Atelier'], ['crm_evenements', 'organisation_creee']]);
    assert.deepEqual(plan.ecritures[0].signer, ['creePar', 'modifiePar']);
  });
  test('B17 affaire : titre par défaut (organisation puis personne), organisation héritée de la personne, événement lié', () => {
    const personnes = [personne({ id: 'p1', nom: 'Camille Durand', organisationId: 'o1' })];
    const organisations = [organisation({ id: 'o1', nom: 'Atelier des Lilas' })];
    const plan = L.planCreerAffaire({ personneId: 'p1', montant: '1500' }, { personnes, organisations }, ctxPlan());
    const [a, ev] = plan.ecritures;
    assert.equal(plan.titre, 'Atelier des Lilas');
    assert.equal(a.donnees.titre, 'Atelier des Lilas');
    assert.equal(a.donnees.organisationId, 'o1');
    assert.equal(a.donnees.montant, 1500);
    assert.equal(a.donnees.etape, 'premier_contact');
    assert.deepEqual(ev.donnees.affaireId, plan.id);
    assert.equal(ev.donnees.texte, 'Affaire créée : Atelier des Lilas');
  });
  test('B17 affaire : une personne que l’appelant ne connaît pas encore (créée à l’instant) ne bloque pas, comme avant', () => {
    const plan = L.planCreerAffaire({ titre: 'Nouvelle', personneId: 'tout-neuf' }, { personnes: [], organisations: [] }, ctxPlan());
    assert.equal(plan.ecritures[0].donnees.personneId, 'tout-neuf');
    assert.equal(plan.ecritures[0].donnees.organisationId, null);
  });
  test('B17 activité et note : seules les marques d’avant (créeLe ; creeLe et modifieLe), jamais d’acteur signé', () => {
    const act = L.planCreerActivite({ type: 'appel', date: '2026-10-20', affaireId: 'a' }, ctxPlan()).ecritures[0];
    assert.deepEqual(act.horodater, ['creeLe']);
    assert.equal(act.signer, undefined);
    assert.equal(act.donnees.auteur, JEROME);
    const note = L.planCreerNote('  Bonjour ', { affaireId: 'a' }, ctxPlan()).ecritures[0];
    assert.deepEqual(note.horodater, ['creeLe', 'modifieLe']);
    assert.equal(note.signer, undefined);
    assert.equal(note.donnees.texte, 'Bonjour');
  });
});

describe('B17 Plans d’écriture : modifications', () => {
  test('B17 un patch vide ne produit aucune écriture ; sinon patch + marques de modification', () => {
    assert.deepEqual(L.planMajPersonne('p', {}).ecritures, []);
    const [e] = L.planMajAffaire('a', { montant: 10 }).ecritures;
    assert.deepEqual([e.type, e.collection, e.patch, e.horodater, e.signer], ['modifier', 'crm_affaires', { montant: 10 }, ['modifieLe'], ['modifiePar']]);
    assert.equal(L.planMajActivite('x', { titre: 'T' }).ecritures[0].signer, undefined);
    assert.deepEqual(L.planMajNote('n', '  texte ').ecritures[0].patch, { texte: 'texte' });
  });
  test('B17 documents joints ou retirés : le fil le dit (« Document joint : X »), sans ligne pour un favori ; rien sans `suite` ni sans `documents` dans le patch', () => {
    const c = ctxPlan();
    const avant = { id: 'a1', personneId: 'p1', organisationId: 'o1', documents: [{ libelle: 'Vieux', url: 'https://x.fr/vieux' }] };
    const apres = [{ libelle: 'Vieux', url: 'https://x.fr/vieux', favori: true }, { libelle: 'Devis', url: 'https://x.fr/devis' }];
    const ecritures = L.planMajAffaire('a1', { documents: apres }, { avant, ctx: c }).ecritures;
    assert.equal(ecritures.length, 2); // la modification + UN événement (le favori n'en fait pas)
    assert.deepEqual([ecritures[1].type, ecritures[1].collection, ecritures[1].donnees.type, ecritures[1].donnees.texte], ['creer', 'crm_evenements', 'document', 'Document joint : Devis']);
    assert.deepEqual([ecritures[1].donnees.affaireId, ecritures[1].donnees.personneId, ecritures[1].donnees.organisationId], ['a1', 'p1', 'o1']);
    const retrait = L.planMajAffaire('a1', { documents: [] }, { avant, ctx: c }).ecritures;
    assert.equal(retrait[1].donnees.texte, 'Document retiré : Vieux');
    assert.equal(L.planMajAffaire('a1', { documents: apres }).ecritures.length, 1); // sans `suite`
    assert.equal(L.planMajAffaire('a1', { montant: 5 }, { avant, ctx: c }).ecritures.length, 1); // pas de documents dans le patch
    assert.deepEqual(L.entreesHistorique({ evenements: [{ type: 'document', texte: 'Document joint : Devis', date: new Date() }, { type: 'etape_changee', texte: 'Étape', date: new Date() }] }, 'documents').map((e) => e.element.type), ['document']);
  });
  test('B17 épingler une note : patch { epinglee } + date de modification ; notesEpinglees garde les épinglées, la plus récente d’abord', () => {
    const e = L.planEpinglerNote('n', true).ecritures[0];
    assert.deepEqual([e.type, e.collection, e.patch, e.horodater], ['modifier', 'crm_notes', { epinglee: true }, ['modifieLe']]);
    assert.deepEqual(L.planEpinglerNote('n', 0).ecritures[0].patch, { epinglee: false });
    const notes = [{ id: 'a', texte: 'A', epinglee: true, creeLe: new Date('2026-10-01') }, { id: 'b', texte: 'B', creeLe: new Date('2026-10-05') }, { id: 'c', texte: 'C', epinglee: true, creeLe: new Date('2026-10-03') }];
    assert.deepEqual(L.notesEpinglees(notes).map((n) => n.id), ['c', 'a']);
    assert.deepEqual(L.notesEpinglees([]), []);
  });
  test('B17 changement d’étape : même patch et mêmes événements que la règle, dans le plan ; une erreur n’écrit rien', () => {
    const a = affaire({ id: 'a1', etape: 'premier_contact' });
    const c = ctxPlan();
    const regle = L.changementEtape(a, 'rdv_fixe', c);
    const plan = L.planChangerEtape(a, 'rdv_fixe', ctxPlan());
    assert.deepEqual(plan.ecritures[0].patch, regle.patch);
    assert.equal(plan.ecritures.length, 1 + regle.evenements.length);
    assert.deepEqual(plan.ecritures.slice(1).map((e) => e.donnees.type), regle.evenements.map((e) => e.type));
    assert.deepEqual(plan.suggestion, regle.suggestion);
    const mauvais = L.planChangerEtape(a, 'étape-bidon', ctxPlan());
    assert.deepEqual(mauvais.ecritures, []);
    assert.ok(mauvais.erreurs.etape);
  });
  test('B17 perdue, pause, rouvrir : une écriture sur l’affaire puis les événements ; erreurs de saisie sans écriture', () => {
    const a = affaire({ id: 'a1' });
    assert.equal(L.planMarquerPerdue(a, { raison: 'Prix' }, ctxPlan()).ecritures.length, 2);
    assert.deepEqual(L.planMarquerPerdue(a, { raison: 'Inconnue' }, ctxPlan()).ecritures, []);
    assert.equal(L.planMettreEnPause(a, { dateReveil: '2027-01-15' }, ctxPlan()).ecritures[0].patch.statut, 'en_pause');
    assert.deepEqual(L.planMettreEnPause(a, { dateReveil: '' }, ctxPlan()).ecritures, []);
    assert.deepEqual(L.planRouvrirAffaire(a, ctxPlan()).ecritures, [], 'une affaire ouverte ne se rouvre pas');
    assert.equal(L.planRouvrirAffaire(affaire({ id: 'a1', statut: 'perdue' }), ctxPlan()).ecritures.length, 2);
  });
  test('B17 activité faite : patch sans marque + événement ; déjà faite : rien', () => {
    const plan = L.planActiviteFaite(activite({ id: 'x', affaireId: 'a', type: 'appel', titre: 'Appeler' }), ctxPlan());
    assert.equal(plan.ecritures[0].patch.fait, true);
    assert.equal(plan.ecritures[0].signer, undefined);
    assert.equal(plan.ecritures[1].donnees.type, 'activite_faite');
    assert.deepEqual(L.planActiviteFaite(activite({ fait: true }), ctxPlan()).ecritures, []);
  });
  test('B17 opposition à la prospection : coche = patch + événement ; décoche = patch seul', () => {
    const p = personne({ id: 'p1', organisationId: 'o1' });
    const coche = L.planOppositionPersonne(p, true, ctxPlan());
    assert.equal(coche.ecritures[0].patch.oppositionProspection, true);
    assert.equal(coche.ecritures[1].donnees.type, 'opposition');
    assert.equal(coche.ecritures[1].donnees.organisationId, 'o1');
    assert.equal(L.planOppositionPersonne(p, false, ctxPlan()).ecritures.length, 1);
  });
});

describe('B17 Écriture par lots : une opération coupée à moitié le dit', () => {
  test('B17 la ligne « échec » du Journal se lit en français : « Échec · opération », sans nom interne', () => {
    assert.equal(L.libelleActionJournal('echec'), 'Échec');
    assert.equal(L.libelleDocumentJournal('crm_audit'), 'opération');
    assert.equal(L.statutOperationJournal([{ statut: 'succes' }, { statut: 'echec' }]), 'echec');
  });
  test('B17 tous les lots passent : 300 actions par lots de 130 = trois lots, aucun signalement', async () => {
    const lots = []; const signales = [];
    await L.ecrireParLots(300, 130, async (d, f) => { lots.push([d, f]); }, async (n) => { signales.push(n); });
    assert.deepEqual(lots, [[0, 130], [130, 260], [260, 300]]);
    assert.deepEqual(signales, []);
  });
  test('B17 le premier lot échoue : rien n’est écrit, l’erreur d’origine est rendue telle quelle, aucun signalement', async () => {
    const origine = new Error('réseau'); const signales = [];
    await assert.rejects(L.ecrireParLots(300, 130, async () => { throw origine; }, async (n) => { signales.push(n); }), (e) => e === origine);
    assert.deepEqual(signales, []);
  });
  test('B17 un lot échoue après d’autres : le Journal est prévenu (actions déjà faites), le message dit « à moitié » et peut être montré à l’écran', async () => {
    const origine = new Error('quota'); const signales = [];
    let n = 0;
    await assert.rejects(
      L.ecrireParLots(300, 130, async () => { if (++n === 2) throw origine; }, async (faites, e) => { signales.push([faites, e]); }),
      (e) => e.saisie === true && e.cause === origine && /130 éléments sur 300 ont été traités/.test(e.message) && /Recommence/.test(e.message),
    );
    assert.deepEqual(signales, [[130, origine]]);
  });
  test('B17 si le signalement lui-même échoue, l’erreur « à moitié » est quand même rendue', async () => {
    let n = 0;
    await assert.rejects(
      L.ecrireParLots(300, 130, async () => { if (++n === 3) throw new Error('x'); }, async () => { throw new Error('journal indisponible'); }),
      (e) => e.saisie === true && /260 éléments sur 300 ont été traités/.test(e.message),
    );
  });
});

describe('B17 Plans d’écriture : suppressions', () => {
  const affaires = [affaire({ id: 'a1', personneId: 'p1' }), affaire({ id: 'a2', personneId: 'p1' }), affaire({ id: 'a3', personneId: 'p2' })];
  const liens = [
    { collection: 'crm_activites', id: 'ac-a1', personneId: 'p1', affaireId: 'a1' },
    { collection: 'crm_notes', id: 'n-a1', personneId: 'p1', affaireId: 'a1' },
    { collection: 'crm_activites', id: 'ac-libre', personneId: 'p1', affaireId: null },
    { collection: 'crm_evenements', id: 'ev-a2', personneId: 'p1', affaireId: 'a2' },
    { collection: 'crm_activites', id: 'ac-a3', personneId: 'p2', affaireId: 'a3' },
  ];
  const cles = (ecritures) => ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`).sort();

  test('B17 supprimer une personne avec ses affaires : leurs fils, ses documents libres, les affaires puis la personne ; rien aux autres', () => {
    const doublons = [...liens, liens[0]]; // un document trouvé par deux requêtes ne doit être supprimé qu’une fois
    const plan = L.planSupprimerPersonne({ personneId: 'p1', choix: 'affaires', affaires, liens: doublons });
    assert.deepEqual(cles(plan.ecritures), cles([
      ...['crm_activites/ac-a1', 'crm_notes/n-a1', 'crm_activites/ac-libre', 'crm_evenements/ev-a2', 'crm_affaires/a1', 'crm_affaires/a2', 'crm_personnes/p1'].map((c) => ({ type: 'supprimer', collection: c.split('/')[0], id: c.split('/')[1] })),
    ]));
    assert.equal(plan.ecritures.at(-1).id, 'p1', 'la personne en dernier');
  });
  test('B17 supprimer une personne en conservant ses affaires : détachées (avec marque de modification), son fil rattaché aux affaires détaché, le reste supprimé', () => {
    const plan = L.planSupprimerPersonne({ personneId: 'p1', choix: 'conserver', affaires, liens });
    const details = Object.fromEntries(plan.ecritures.map((e) => [`${e.type}:${e.collection}/${e.id}`, e]));
    assert.deepEqual(details['modifier:crm_affaires/a1'].patch, { personneId: null });
    assert.deepEqual(details['modifier:crm_affaires/a1'].signer, ['modifiePar']);
    assert.deepEqual(details['modifier:crm_activites/ac-a1'].patch, { personneId: null });
    assert.equal(details['modifier:crm_activites/ac-a1'].signer, undefined, 'les documents du fil sont détachés sans marque, comme avant');
    assert.ok(details['supprimer:crm_activites/ac-libre'], 'une activité sans affaire disparaît avec la personne');
    assert.ok(details['supprimer:crm_personnes/p1']);
    assert.equal(par(plan.ecritures, 'supprimer').length, 2);
    assert.equal(plan.ecritures.findIndex((e) => e.type === 'supprimer') > plan.ecritures.findLastIndex((e) => e.type === 'modifier'), true, 'détachements avant suppressions');
  });
  test('B17 supprimer une personne : le fil d’une affaire passée à quelqu’un d’autre est gardé (détaché de la personne), seul le fil de la personne seule disparaît', () => {
    const affs = [affaire({ id: 'a1', personneId: 'p2' })]; // a1 a été réattribuée de p1 à p2 : ses anciens éléments portent encore personneId p1
    const lens = [
      { collection: 'crm_activites', id: 'ac-ancien', personneId: 'p1', affaireId: 'a1' },
      { collection: 'crm_notes', id: 'n-ancien', personneId: 'p1', affaireId: 'a1' },
      { collection: 'crm_notes', id: 'n-libre', personneId: 'p1', affaireId: null },
    ];
    const plan = L.planSupprimerPersonne({ personneId: 'p1', choix: 'conserver', affaires: affs, liens: lens });
    const d = Object.fromEntries(plan.ecritures.map((e) => [`${e.type}:${e.collection}/${e.id}`, e]));
    assert.deepEqual(d['modifier:crm_activites/ac-ancien'].patch, { personneId: null });
    assert.deepEqual(d['modifier:crm_notes/n-ancien'].patch, { personneId: null });
    assert.equal(d['supprimer:crm_activites/ac-ancien'], undefined);
    assert.equal(d['supprimer:crm_notes/n-ancien'], undefined);
    assert.ok(d['supprimer:crm_notes/n-libre'], 'le fil de la personne seule disparaît avec elle');
    assert.ok(d['supprimer:crm_personnes/p1']);
  });
  test('B17 supprimer une organisation vide : ce qui porte encore une personne ou une affaire (qui ont changé d’organisation) est gardé, seul le fil de l’organisation seule est supprimé', () => {
    const lo = [
      { collection: 'crm_notes', id: 'n-seule', organisationId: 'o1' },
      { collection: 'crm_notes', id: 'n-perso', personneId: 'p1', organisationId: 'o1' },
      { collection: 'crm_activites', id: 'ac-affaire', affaireId: 'a1', organisationId: 'o1' },
    ];
    const plan = L.planSupprimerOrganisation({ organisationId: 'o1', personnes: [personne({ id: 'p1', organisationId: 'o2' })], affaires: [affaire({ id: 'a1', organisationId: 'o2' })], liens: lo });
    const d = Object.fromEntries(plan.ecritures.map((e) => [`${e.type}:${e.collection}/${e.id}`, e]));
    assert.deepEqual(d['modifier:crm_notes/n-perso'].patch, { organisationId: null });
    assert.deepEqual(d['modifier:crm_activites/ac-affaire'].patch, { organisationId: null });
    assert.equal(d['supprimer:crm_notes/n-perso'], undefined);
    assert.equal(d['supprimer:crm_activites/ac-affaire'], undefined);
    assert.ok(d['supprimer:crm_notes/n-seule'] && d['supprimer:crm_organisations/o1']);
    assert.equal(plan.ecritures.findIndex((e) => e.type === 'supprimer') > plan.ecritures.findLastIndex((e) => e.type === 'modifier'), true, 'détachements avant suppressions');
  });
  test('B17 personne avec des affaires : le choix est obligatoire ; sans affaire, il ne sert pas', () => {
    assert.throws(() => L.planSupprimerPersonne({ personneId: 'p1', choix: undefined, affaires, liens }), /Choisis/);
    assert.deepEqual(cles(L.planSupprimerPersonne({ personneId: 'p9', choix: undefined, affaires, liens: [] }).ecritures), ['supprimer:crm_personnes/p9']);
  });
  test('B17 supprimer une affaire : son fil puis elle ; supprimer une organisation vide : son fil puis elle', () => {
    assert.deepEqual(cles(L.planSupprimerAffaire({ affaireId: 'a1', liens }).ecritures), ['supprimer:crm_activites/ac-a1', 'supprimer:crm_affaires/a1', 'supprimer:crm_notes/n-a1']);
    const lo = [{ collection: 'crm_notes', id: 'n-o', organisationId: 'o9' }];
    assert.deepEqual(cles(L.planSupprimerOrganisation({ organisationId: 'o9', personnes: [], affaires: [], liens: lo }).ecritures), ['supprimer:crm_notes/n-o', 'supprimer:crm_organisations/o9']);
  });
  test('B17 supprimer une organisation qui a des personnes ou des affaires : refus avec le message, aucune écriture', () => {
    const plan = L.planSupprimerOrganisation({ organisationId: 'o1', personnes: [personne({ id: 'p1', organisationId: 'o1' })], affaires: [], liens: [] });
    assert.match(plan.refus, /1 personne/);
    assert.deepEqual(plan.ecritures, []);
  });
  test('B17 supprimer note et activité : une seule suppression', () => {
    assert.deepEqual(cles(L.planSupprimerNote('n1').ecritures), ['supprimer:crm_notes/n1']);
    assert.deepEqual(cles(L.planSupprimerActivite('x1').ecritures), ['supprimer:crm_activites/x1']);
  });
});

describe('B17 Plans d’écriture : exécutés sur des données', () => {
  test('B17 créer une personne puis son affaire, changer l’étape, supprimer la personne avec ses affaires : on retrouve la base de départ', () => {
    const c = ctxPlan();
    const exec = (base, plan) => executerPlan(base, plan.ecritures, { maintenant: c.maintenant, acteur: JEROME });
    let base = {};
    const pp = L.planCreerPersonne({ nom: 'Camille Durand' }, c);
    base = exec(base, pp);
    const pa = L.planCreerAffaire({ titre: 'Site', personneId: pp.id }, { personnes: base.crm_personnes, organisations: [] }, c);
    base = exec(base, pa);
    const a = base.crm_affaires[0];
    base = exec(base, L.planChangerEtape(a, 'rdv_fixe', c));
    base = exec(base, L.planCreerNote('Une note', { affaireId: a.id, personneId: pp.id }, c));
    assert.equal(base.crm_affaires[0].etape, 'rdv_fixe');
    assert.equal(base.crm_affaires[0].modifiePar, JEROME);
    assert.equal(base.crm_evenements.length, 3);
    const liens = [...base.crm_evenements, ...base.crm_notes].map((d) => ({ collection: base.crm_evenements.includes(d) ? 'crm_evenements' : 'crm_notes', id: d.id, personneId: d.personneId, organisationId: d.organisationId, affaireId: d.affaireId }));
    base = exec(base, L.planSupprimerPersonne({ personneId: pp.id, choix: 'affaires', affaires: base.crm_affaires, liens }));
    assert.deepEqual(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.length])), { crm_personnes: 0, crm_affaires: 0, crm_evenements: 0, crm_notes: 0 });
  });
});

describe('B18 Fil : canal de l’auteur', () => {
  test('B18 un élément créé par le serveur MCP affiche « · via MCP » ; un élément de l’écran, ou sans canal, n’affiche rien', () => {
    assert.equal(L.mentionCanal({ auteur: 'hermes-bibliothecaire', via: 'mcp' }), ' · via MCP');
    assert.equal(L.mentionCanal({ auteur: JEROME }), '');
    assert.equal(L.mentionCanal({ via: 'autre' }), '');
    assert.equal(L.mentionCanal(null), '');
  });
});

describe('B19 Liens et documents, dossier de travail (affaires et projets)', () => {
  test("B19 ancienne adresse GitHub : https://github.com/compte/nom, vide permise ; toute autre adresse est refusée (le champ n'est plus affiché, les outils MCP le lisent encore)", () => {
    assert.deepEqual(L.validerUrlGithub(''), {});
    assert.deepEqual(L.validerUrlGithub('https://github.com/jeromechevalier-wq/eliot-devis-depannage'), {});
    assert.deepEqual(L.validerUrlGithub('https://github.com/jeromechevalier-wq/eliot-devis-depannage/pull/12'), {});
    assert.deepEqual(L.validerUrlGithub('  https://github.com/a/b  '), {});
    for (const mauvaise of ['http://github.com/a/b', 'https://github.com/a', 'https://github.com/', 'https://gitlab.com/a/b', 'github.com/a/b', 'https://github.com.evil.fr/a/b', 'https://exemple.fr/https://github.com/a/b', 'n importe quoi']) {
      assert.ok(L.validerUrlGithub(mauvaise).url, `refusée : ${mauvaise}`);
    }
    assert.deepEqual(L.majUrlGithub('https://github.com/a/b'), { erreurs: {}, patch: { urlGithub: 'https://github.com/a/b' } });
    assert.deepEqual(L.majUrlGithub(''), { erreurs: {}, patch: { urlGithub: '' } });
    assert.ok(L.majUrlGithub('x').erreurs.url);
    assert.deepEqual(L.majUrlGithub('x').patch, {});
  });

  test('B19 dossier de travail : n\'importe quel lien complet (Drive, serveur, NAS, site), vide permis ; jamais javascript:, data: ni un texte libre', () => {
    assert.deepEqual(L.validerUrlDossier(''), {});
    for (const bonne of [
      'https://drive.google.com/drive/folders/1AbC_dEf-123', 'https://drive.google.com/drive/u/0/folders/1AbC_dEf-123?usp=sharing',
      'https://exemple.fr/dossier', 'http://nas.local:5000/partage/clients', 'smb://nas/clients/carrel', 'file:///Volumes/Clients/carrel',
      'https://www.dropbox.com/home/Clients', '  https://exemple.fr/x  ',
    ]) assert.deepEqual(L.validerUrlDossier(bonne), {}, `acceptée : ${bonne}`);
    for (const mauvaise of ['javascript:alert(1)', 'javascript://%0aalert(1)', 'data:text/html,<b>x</b>', 'vbscript://x', 'Mon Drive/Chevalier-AI/Projets/x', 'exemple.fr/dossier', 'https://', 'https://a b.fr']) {
      assert.ok(L.validerUrlDossier(mauvaise).url, `refusée : ${mauvaise}`);
    }
    assert.deepEqual(L.majUrlDossier('smb://nas/clients'), { erreurs: {}, patch: { urlDossier: 'smb://nas/clients' } });
    assert.deepEqual(L.majUrlDossier(''), { erreurs: {}, patch: { urlDossier: '' } });
    assert.ok(L.majUrlDossier('pas un lien').erreurs.url);
  });

  test('B19 une nouvelle affaire a les deux champs vides ; une adresse valide est gardée, une invalide est écartée', () => {
    const vide = L.nouvelleAffaire({ titre: 'Atelier' }, ctx());
    assert.equal(vide.urlGithub, '');
    assert.equal(vide.urlDossier, '');
    const avec = L.nouvelleAffaire({ titre: 'Atelier', urlGithub: 'https://github.com/a/b', urlDossier: 'smb://nas/atelier' }, ctx());
    assert.equal(avec.urlGithub, 'https://github.com/a/b');
    assert.equal(avec.urlDossier, 'smb://nas/atelier');
    const invalide = L.nouvelleAffaire({ titre: 'Atelier', urlGithub: 'https://gitlab.com/a/b', urlDossier: 'n importe quoi' }, ctx());
    assert.equal(invalide.urlGithub, '');
    assert.equal(invalide.urlDossier, '');
  });

  test('B19 « Liens et documents » : les documents, puis l\'ancienne adresse GitHub (libellé « GitHub ») sans rien écrire ; pas de doublon', () => {
    const projet = { documents: [{ libelle: 'Devis', url: 'https://drive.google.com/file/d/abc/view', favori: true }, { url: 'https://exemple.fr/x' }], urlGithub: 'https://github.com/a/b' };
    assert.deepEqual(L.liensEtDocuments(projet), [
      { libelle: 'Devis', url: 'https://drive.google.com/file/d/abc/view', note: '', favori: true, ajouteLe: '', index: 0 },
      { libelle: 'exemple.fr', url: 'https://exemple.fr/x', note: '', favori: false, ajouteLe: '', index: 1 }, // sans nom : le nom du site
      { libelle: 'GitHub', url: 'https://github.com/a/b', note: '', favori: false, ajouteLe: '', index: -1 },
    ]);
    assert.equal(projet.urlGithub, 'https://github.com/a/b', 'la donnée ancienne n\'est pas modifiée');
    assert.deepEqual(L.liensEtDocuments({ documents: [{ libelle: 'Dépôt', url: 'https://github.com/a/b' }], urlGithub: 'https://github.com/a/b' }).map((l) => l.libelle), ['Dépôt'], 'déjà dans la liste : pas deux fois');
    assert.deepEqual(L.liensEtDocuments({}), []);
    assert.deepEqual(L.liensEtDocuments({ urlGithub: 'n importe quoi' }), [], 'une valeur écrite hors de l\'écran n\'est un lien que si elle est valide');
  });

  test('B19 retirer ou mettre en favori une ligne : l\'ancienne adresse GitHub est vidée ou passe dans la liste, sans perte', () => {
    const projet = { documents: [{ libelle: 'Devis', url: 'https://d.fr/1' }], urlGithub: 'https://github.com/a/b' };
    const [devis, github] = L.liensEtDocuments(projet);
    assert.deepEqual(L.retirerLien(projet, devis), { documents: [] });
    assert.deepEqual(L.retirerLien(projet, github), { urlGithub: '' });
    assert.deepEqual(L.basculerFavoriLien(projet, devis), { documents: [{ libelle: 'Devis', url: 'https://d.fr/1', favori: true }] });
    assert.deepEqual(L.basculerFavoriLien(projet, github), { documents: [{ libelle: 'Devis', url: 'https://d.fr/1' }, { libelle: 'GitHub', url: 'https://github.com/a/b', favori: true }], urlGithub: '' });
  });

  test('B19 nom et note facultatifs : sans nom, le nom du site ; note de 300 caractères au plus ; anciens documents inchangés', () => {
    assert.equal(L.nomCourtLien('https://www.exemple.fr/chemin/long?x=1'), 'exemple.fr');
    assert.equal(L.nomCourtLien('http://nas.local:5000/partage'), 'nas.local');
    assert.equal(L.nomCourtLien('pas un lien'), 'pas un lien');
    const sans = L.ajouterDocument({ documents: [{ libelle: 'Ancien', url: 'https://a.fr/1' }] }, '', 'https://www.exemple.fr/devis');
    assert.deepEqual(sans.patch.documents, [{ libelle: 'Ancien', url: 'https://a.fr/1' }, { libelle: 'exemple.fr', url: 'https://www.exemple.fr/devis' }]);
    const avec = L.ajouterDocument({}, '  Portrait   Chantal ', 'https://drive.google.com/file/d/1/view', false, '  envoyé  au client ');
    assert.deepEqual(avec.patch.documents, [{ libelle: 'Portrait Chantal', url: 'https://drive.google.com/file/d/1/view', note: 'envoyé au client' }]);
    assert.equal(L.ajouterDocument({}, 'x', 'https://a.fr', false, 'n'.repeat(500)).patch.documents[0].note.length, 300);
    assert.equal('note' in L.ajouterDocument({}, 'x', 'https://a.fr', false, '   ').patch.documents[0], false);
    assert.deepEqual(L.liensEtDocuments(avec.patch).map((l) => l.note), ['envoyé au client']);
  });

  test('B19 modifier le nom et la note d\'une ligne : nom vide = nom du site, note vide = champ effacé, étoile gardée ; l\'ancien GitHub passe dans la liste', () => {
    const e = { documents: [{ libelle: 'Devis', url: 'https://www.d.fr/1', note: 'v1', favori: true }, { libelle: 'Autre', url: 'https://a.fr' }], urlGithub: 'https://github.com/a/b' };
    const [devis, , github] = L.liensEtDocuments(e);
    assert.deepEqual(L.modifierLien(e, devis, { libelle: 'Devis signé', note: ' v2 ' }).documents[0], { libelle: 'Devis signé', url: 'https://www.d.fr/1', note: 'v2', favori: true });
    assert.deepEqual(L.modifierLien(e, devis, { libelle: '', note: '' }).documents[0], { libelle: 'd.fr', url: 'https://www.d.fr/1', favori: true });
    assert.deepEqual(L.modifierLien(e, devis, { libelle: 'x', note: '' }).documents[1], { libelle: 'Autre', url: 'https://a.fr' }, 'les autres lignes ne bougent pas');
    assert.deepEqual(L.modifierLien(e, github, { libelle: 'Dépôt', note: 'code' }), { documents: [...e.documents, { libelle: 'Dépôt', url: 'https://github.com/a/b', note: 'code' }], urlGithub: '' });
  });

  test('B19 plus de convention de nommage ni de prompt Claude Code : ces fonctions n\'existent plus', () => {
    for (const nom of ['promptCreationGithub', 'promptCreationDossier', 'nomDossierSuggere', 'validerNomDossier', 'nomDepotSuggere', 'adresseDepotSuggeree', 'lireDepotGithub', 'PREFIXES_DOSSIER']) {
      assert.equal(nom in L, false, nom);
    }
  });
});

describe('B20 Journal : regroupement, filtres et comparaison avant / après', () => {
  const t = (iso) => new Date(iso);
  const ligne = (id, o) => ({ id, operationId: 'op1', ordre: 1, acteur: 'jerome.chevalier@gmail.com', via: 'ecran', outil: 'supprimerAffaire', collection: 'crm_affaires', docId: 'a1', action: 'supprimer', statut: 'succes', date: t('2026-10-04T10:00:00Z'), ...o });
  const lignes = [
    ligne('l1', {}),
    ligne('l2', { ordre: 2, collection: 'crm_evenements', docId: 'e1' }),
    ligne('l3', { operationId: 'op2', acteur: 'claude-code-jerome', via: 'mcp', outil: 'creer_personne', collection: 'crm_personnes', docId: 'p1', action: 'creer', date: t('2026-10-04T12:00:00Z') }),
    ligne('l4', { operationId: 'op3', via: 'ecran', outil: 'modifierNote', collection: 'crm_notes', docId: 'n1', action: 'modifier', statut: 'en_cours', date: t('2026-10-03T09:00:00Z') }),
  ];

  test('B20 les lignes sont regroupées par opération, la plus récente d’abord, dans l’ordre d’écriture', () => {
    const ops = L.grouperJournal(lignes);
    assert.deepEqual(ops.map((o) => o.operationId), ['op2', 'op1', 'op3']);
    assert.deepEqual(ops[1].lignes.map((l) => l.id), ['l1', 'l2']);
    assert.equal(ops[1].resume, 'Suppression de 1 affaire, 1 événement');
    assert.equal(ops[1].acteur, 'Jérôme');
    assert.equal(ops[1].canal, 'Appli');
    assert.equal(ops[0].acteur, 'claude-code-jerome');
    assert.equal(ops[0].canal, 'MCP');
    assert.equal(ops[0].resume, 'Création de 1 personne');
  });

  test('B20 le résumé pluralise et ordonne création, modification, suppression', () => {
    const r = L.resumeOperationJournal([{ action: 'supprimer', collection: 'crm_activites' }, { action: 'supprimer', collection: 'crm_activites' }, { action: 'creer', collection: 'crm_notes' }, { action: 'modifier', collection: 'crm_affaires' }]);
    assert.equal(r, 'Création de 1 note · Modification de 1 affaire · Suppression de 2 activités');
  });

  test('B20 une restauration (action « restaurer » écrite par le serveur) a son résumé', () => {
    assert.equal(L.resumeOperationJournal([{ action: 'restaurer', collection: 'crm_affaires' }, { action: 'restaurer', collection: 'crm_evenements' }]), 'Restauration de 1 affaire, 1 événement');
    assert.equal(L.resumeOperationJournal([{ action: 'inconnue', collection: 'crm_notes' }]), '', 'une action inconnue ne casse rien');
  });

  test('B20 l’état d’une opération : « à vérifier » si une ligne est restée en cours, « échec » l’emporte', () => {
    const ops = L.grouperJournal(lignes);
    assert.equal(ops.find((o) => o.operationId === 'op3').statut, 'averifier');
    assert.equal(ops.find((o) => o.operationId === 'op1').statut, 'succes');
    assert.equal(L.statutOperationJournal([{ statut: 'en_cours' }, { statut: 'echec' }]), 'echec');
  });

  test('B20 une ligne sans operationId reste visible (regroupée seule)', () => {
    const ops = L.grouperJournal([{ id: 'seule', acteur: 'x', via: 'mcp', action: 'creer', collection: 'crm_notes', date: t('2026-10-04T10:00:00Z') }]);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].operationId, 'seule');
  });

  test('B20 filtres : canal, à vérifier, date de début (minuit de Paris), texte (accents et casse ignorés)', () => {
    const ops = L.grouperJournal(lignes);
    assert.deepEqual(L.filtrerJournal(ops, { canal: 'mcp' }).map((o) => o.operationId), ['op2']);
    assert.deepEqual(L.filtrerJournal(ops, { canal: 'ecran' }).map((o) => o.operationId), ['op1', 'op3']);
    assert.deepEqual(L.filtrerJournal(ops, { aVerifier: true }).map((o) => o.operationId), ['op3']);
    assert.deepEqual(L.filtrerJournal(ops, { depuis: '2026-10-04' }).map((o) => o.operationId), ['op2', 'op1']);
    assert.deepEqual(L.filtrerJournal(ops, { texte: 'EVENEMENT' }).map((o) => o.operationId), ['op1']);
    assert.deepEqual(L.filtrerJournal(ops, { texte: 'claude code' }).map((o) => o.operationId), ['op2'], 'chaque mot est cherché séparément');
    assert.deepEqual(L.filtrerJournal(ops, { texte: 'claude jerome appli' }).map((o) => o.operationId), []);
    assert.deepEqual(L.filtrerJournal(ops, { texte: 'claude-code-jerome' }).map((o) => o.operationId), ['op2']);
    assert.deepEqual(L.filtrerJournal(ops, { texte: 'n1' }).map((o) => o.operationId), ['op3'], 'identifiant du document');
    assert.equal(L.filtrerJournal(ops, {}).length, 3);
  });

  test('H2 filtres du Journal en cases : canaux en OU (tableau), vide = tous, ET avec « à vérifier »', () => {
    const ops = L.grouperJournal(lignes);
    assert.deepEqual(L.filtrerJournal(ops, { canaux: ['mcp'] }).map((o) => o.operationId), ['op2']);
    assert.deepEqual(L.filtrerJournal(ops, { canaux: ['mcp', 'ecran'] }).map((o) => o.operationId).sort(), ['op1', 'op2', 'op3']);
    assert.equal(L.filtrerJournal(ops, { canaux: [] }).length, 3);
    assert.deepEqual(L.filtrerJournal(ops, { canaux: ['ecran'], aVerifier: true }).map((o) => o.operationId), ['op3']);
  });

  test('B20 comparaison avant / après : seuls les champs qui diffèrent, dates comparées par valeur, document absent géré', () => {
    const d = new Date('2026-10-04T10:00:00Z');
    const diffs = L.differencesJournal(
      { nom: 'A', etape: 'x', modifieLe: d, tags: ['a'], meta: { b: 1, a: 2 } },
      { nom: 'A', etape: 'y', modifieLe: { seconds: d.getTime() / 1000, nanoseconds: 0 }, tags: ['a'], meta: { a: 2, b: 1 }, neuf: 1 });
    assert.deepEqual(diffs.map((x) => x.champ), ['etape', 'neuf']);
    assert.deepEqual(L.differencesJournal(null, { a: 1, b: null }).map((x) => x.champ), ['a']);
    assert.deepEqual(L.differencesJournal({ a: 1 }, null).map((x) => x.champ), ['a']);
    assert.deepEqual(L.differencesJournal(null, null), []);
  });

  test('B20 valeurs affichées : vide, booléen, date de Paris, liste, texte long tronqué', () => {
    assert.equal(L.formaterValeurJournal(undefined), '—');
    assert.equal(L.formaterValeurJournal(null), '—');
    assert.equal(L.formaterValeurJournal(true), 'oui');
    assert.equal(L.formaterValeurJournal(new Date('2026-10-04T10:00:00Z')), '04/10/2026 12:00');
    assert.equal(L.formaterValeurJournal(['a', 'b']), '["a","b"]');
    const long = L.formaterValeurJournal('x'.repeat(500));
    assert.equal(long.length, 301);
    assert.ok(long.endsWith('…'));
  });
});

describe('Export des contacts pour le téléphone (.vcf)', () => {
  const orgs = [{ id: 'o1', nom: 'Fleurs; de Provence' }];
  const a = personne({ id: 'a', nom: 'Marie Dupont', prenom: 'Marie', nomFamille: 'Dupont', organisationId: 'o1', creeLe: new Date('2026-10-01T08:00:00Z'),
    telephones: [{ valeur: '06 12 34 56 78', type: 'perso' }], emails: [{ valeur: 'marie@x.fr', type: 'travail' }] });
  const b = personne({ id: 'b', nom: 'Paul Martin', creeLe: new Date('2026-10-10T08:00:00Z') });
  const c = personne({ id: 'c', nom: 'Archivée', archive: true, creeLe: new Date('2026-10-12T08:00:00Z') });
  test('premier export : toutes les personnes non archivées, toutes « nouvelles »', () => {
    const r = L.personnesAExporterVcf([a, b, c], null);
    assert.deepEqual(r.nouvelles.map((p) => p.id), ['a', 'b']);
    assert.deepEqual(r.modifiees, []);
  });
  test('export suivant : nouvelles = créées depuis, modifiées = anciennes retouchées depuis', () => {
    const a2 = { ...a, modifieLe: new Date('2026-10-11T08:00:00Z') };
    const r = L.personnesAExporterVcf([a2, b, c], new Date('2026-10-05T00:00:00Z'));
    assert.deepEqual(r.nouvelles.map((p) => p.id), ['b']);
    assert.deepEqual(r.modifiees.map((p) => p.id), ['a']);
    const rien = L.personnesAExporterVcf([a, b], new Date('2026-10-11T00:00:00Z'));
    assert.deepEqual([rien.nouvelles, rien.modifiees], [[], []]);
  });
  test('une personne créée puis retouchée avant l’export reste « nouvelle » (une seule fois)', () => {
    const d = { ...b, modifieLe: new Date('2026-10-11T08:00:00Z') };
    const r = L.personnesAExporterVcf([d], new Date('2026-10-05T00:00:00Z'));
    assert.deepEqual([r.nouvelles.length, r.modifiees.length], [1, 0]);
  });
  test('fichier vCard 3.0 : champs, échappements, fins de ligne CRLF', () => {
    const v = L.vcardPersonnes([a, b], { organisations: orgs });
    assert.ok(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
    assert.equal((v.match(/BEGIN:VCARD/g) || []).length, 2);
    assert.ok(v.includes('UID:chevalier-ia-os-a'));
    assert.ok(v.includes('N:Dupont;Marie;;;'));
    assert.ok(v.includes('FN:Marie Dupont'));
    assert.ok(v.includes('ORG:Fleurs\\; de Provence'));
    assert.ok(v.includes('TEL;TYPE=HOME:06 12 34 56 78'));
    assert.ok(v.includes('EMAIL;TYPE=WORK:marie@x.fr'));
    assert.equal(L.vcardPersonnes([], {}), '');
    assert.equal(L.nomFichierExport(new Date('2026-10-20T10:00:00Z'), 'contacts'), 'chevalier-ia-contacts-2026-10-20.vcf');
  });
});
