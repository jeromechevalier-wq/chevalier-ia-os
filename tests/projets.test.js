// Tests B (module Projets, étape 1 : socle) : logique pure de js/modules/projets/logique.js et intégrité des liens avec le CRM.
// node --test, sans navigateur ni Firebase. Les plans sont exécutés sur des données en mémoire (même méthode que logique.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import * as P from '../js/modules/projets/logique.js';

const JEROME = 'jerome.chevalier@gmail.com';
const ctx = (iso = '2026-10-15T08:00:00Z', extra = {}) => {
  let n = 0;
  return { maintenant: new Date(iso), auteur: JEROME, nouvelId: (nom) => `${nom}_${++n}`, ...extra };
};
const projet = (extra = {}) => ({ ...P.nouveauProjet({ titre: 'Audit Carrel' }, ctx('2026-10-01T08:00:00Z')), id: 'pr1', ...extra });
const cles = (ecritures) => ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`).sort();

/** Exécute des écritures de plan sur des collections en mémoire (comme l'écran et le serveur le font sur Firestore). */
function executer(base, ecritures, { maintenant, acteur = JEROME }) {
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

describe('B20 Projets : phases, statuts et création', () => {
  test('B20 quatre phases fixes, dans l’ordre, avec des identifiants stables', () => {
    assert.deepEqual(P.PHASES.map((p) => p.id), ['lancement', 'decouverte', 'livraison', 'cloture']);
    assert.deepEqual(P.PHASES.map((p) => p.libelle), ['Lancement', 'Découverte', 'Livraison', 'Clôture']);
    assert.deepEqual(P.STATUTS_PROJET.map((s) => s.id), ['actif', 'en_pause', 'termine']);
    assert.deepEqual(P.NATURES_PROJET.map((n) => n.id), ['livraison', 'extraction']);
    assert.equal(P.libellePhase('decouverte'), 'Découverte');
    assert.equal(P.libellePhase('inconnue'), 'inconnue', 'un identifiant inconnu s’affiche tel quel');
  });
  test('B20 le titre est le seul champ obligatoire', () => {
    assert.deepEqual(P.validerProjet({ titre: '  ' }), { titre: 'Le titre est obligatoire.' });
    assert.deepEqual(P.validerProjet({ titre: 'Site' }), {});
    assert.deepEqual(P.validerProjet({}), { titre: 'Le titre est obligatoire.' });
  });
  test('B20 dates : format AAAA-MM-JJ, la fin ne précède pas le début', () => {
    assert.ok(P.validerProjet({ titre: 'x', dateDebut: '15/10/2026' }).dateDebut);
    assert.ok(P.validerProjet({ titre: 'x', dateFin: '2026-13-40' }).dateFin);
    assert.match(P.validerProjet({ titre: 'x', dateDebut: '2026-10-15', dateFin: '2026-10-01' }).dateFin, /précéder/);
    assert.deepEqual(P.validerProjet({ titre: 'x', dateDebut: '2026-10-15', dateFin: '2026-10-15' }), {});
  });
  test('B20 phase et nature inconnues sont refusées', () => {
    assert.ok(P.validerProjet({ titre: 'x', phase: 'facturation' }).phase);
    assert.ok(P.validerProjet({ titre: 'x', nature: 'autre' }).nature);
  });
  test('B20 un projet créé avec le seul titre : Lancement, actif, livraison, début aujourd’hui, sans affaire ni lien', () => {
    const p = P.nouveauProjet({ titre: '  Site   chevalier-ia.fr ' }, ctx('2026-10-15T22:30:00Z'));
    assert.equal(p.titre, 'Site chevalier-ia.fr');
    assert.deepEqual([p.phase, p.statut, p.nature], ['lancement', 'actif', 'livraison']);
    assert.equal(p.dateDebut, '2026-10-16', 'le jour civil est celui de Paris');
    assert.equal(p.dateFin, null);
    assert.deepEqual([p.affaireId, p.personneId, p.organisationId, p.modeleId, p.offreId, p.projetSourceId], [null, null, null, null, null, null]);
    assert.deepEqual(p.documents, []);
    assert.equal(p.archive, false);
    assert.equal(p.proprietaire, JEROME);
    assert.deepEqual(Object.keys(p.datesPhases), ['lancement']);
    assert.equal(p.urlGithub, '');
    assert.equal(p.urlDossier, '');
  });
  test('B20 un projet repris d’une affaire garde ses liens ; une extraction garde sa source ; une adresse invalide est vidée', () => {
    const p = P.nouveauProjet({
      titre: 'Extraction', nature: 'extraction', affaireId: 'a1', personneId: 'p1', organisationId: 'o1', projetSourceId: 'pr9', offreId: 'off', modeleId: 'm',
      dateDebut: '2026-11-02', dateFin: '2026-11-30', phase: 'decouverte', urlGithub: 'https://github.com/jeromechevalier-wq/client-carrel', urlDossier: 'https://exemple.fr',
    }, ctx());
    assert.deepEqual([p.nature, p.affaireId, p.personneId, p.organisationId, p.projetSourceId, p.offreId, p.modeleId], ['extraction', 'a1', 'p1', 'o1', 'pr9', 'off', 'm']);
    assert.deepEqual([p.dateDebut, p.dateFin, p.phase], ['2026-11-02', '2026-11-30', 'decouverte']);
    assert.equal(p.urlGithub, 'https://github.com/jeromechevalier-wq/client-carrel');
    assert.equal(p.urlDossier, '', 'une adresse qui n’est pas un dossier Drive n’est pas gardée');
  });
  test('B20 ctx.proprietaire l’emporte sur l’acteur (agent MCP)', () => {
    assert.equal(P.nouveauProjet({ titre: 'x' }, ctx('2026-10-15T08:00:00Z', { auteur: 'hermes-bibliothecaire', proprietaire: JEROME })).proprietaire, JEROME);
  });
});

describe('B21 Projets : phase, pause, fin, archivage', () => {
  test('B21 changer de phase : patch, date d’entrée, première date de chaque phase gardée, événement avec projetId', () => {
    const c = ctx('2026-10-20T09:00:00Z');
    const p = projet({ affaireId: 'a1', personneId: 'p1', organisationId: 'o1' });
    const r = P.changementPhase(p, 'decouverte', c);
    assert.deepEqual(r.erreurs, {});
    assert.equal(r.patch.phase, 'decouverte');
    assert.equal(r.patch.dateEntreePhase, c.maintenant);
    assert.deepEqual(Object.keys(r.patch.datesPhases).sort(), ['decouverte', 'lancement']);
    assert.equal(r.evenements.length, 1);
    assert.equal(r.evenements[0].type, 'phase_changee');
    assert.equal(r.evenements[0].texte, 'Phase : Lancement → Découverte');
    assert.deepEqual([r.evenements[0].projetId, r.evenements[0].affaireId, r.evenements[0].personneId, r.evenements[0].organisationId], ['pr1', 'a1', 'p1', 'o1']);
    // retour en arrière : la première date de la phase est conservée
    const apres = { ...p, ...r.patch };
    const retour = P.changementPhase(apres, 'lancement', ctx('2026-10-25T09:00:00Z'));
    assert.equal(retour.patch.datesPhases.lancement, p.datesPhases.lancement);
    assert.equal(retour.evenements[0].texte, 'Phase : Découverte → Lancement');
  });
  test('B21 phase inconnue : erreur ; même phase : rien à faire', () => {
    assert.ok(P.changementPhase(projet(), 'facturation', ctx()).erreurs.phase);
    const rien = P.changementPhase(projet(), 'lancement', ctx());
    assert.deepEqual([rien.patch, rien.evenements], [{}, []]);
  });
  test('B21 changer la phase d’un projet terminé le rouvre (actif, désarchivé)', () => {
    const fini = projet({ phase: 'cloture', statut: 'termine', archive: true });
    const r = P.changementPhase(fini, 'livraison', ctx());
    assert.deepEqual([r.patch.phase, r.patch.statut, r.patch.archive], ['livraison', 'actif', false]);
    assert.deepEqual(r.evenements.map((e) => e.type), ['projet_rouvert', 'phase_changee']);
  });
  test('B21 pause et reprise ; un projet terminé ne se met pas en pause', () => {
    const p = projet();
    const pause = P.mettreProjetEnPause(p, ctx());
    assert.equal(pause.patch.statut, 'en_pause');
    assert.equal(pause.evenements[0].type, 'projet_en_pause');
    assert.deepEqual(P.mettreProjetEnPause({ ...p, statut: 'en_pause' }, ctx()).patch, {});
    const repris = P.reprendreProjet({ ...p, statut: 'en_pause' }, ctx());
    assert.equal(repris.patch.statut, 'actif');
    assert.equal(repris.evenements[0].type, 'projet_repris');
    assert.deepEqual(P.reprendreProjet(p, ctx()).patch, {}, 'un projet actif ne se « reprend » pas');
    assert.ok(P.mettreProjetEnPause({ ...p, statut: 'termine' }, ctx()).erreurs.statut);
  });
  test('B21 terminer : Clôture, Terminé, archivé, un événement ; rien ne bloque en 2.1 ; déjà terminé : rien à faire', () => {
    const c = ctx('2026-12-01T10:00:00Z');
    const r = P.terminerProjet(projet({ phase: 'livraison' }), c);
    assert.deepEqual([r.patch.phase, r.patch.statut, r.patch.archive], ['cloture', 'termine', true]);
    assert.equal(r.patch.dateEntreePhase, c.maintenant);
    assert.ok(r.patch.datesPhases.cloture);
    assert.deepEqual(r.evenements.map((e) => e.type), ['projet_termine']);
    const dejaEnCloture = P.terminerProjet(projet({ phase: 'cloture' }), c);
    assert.equal(dejaEnCloture.patch.phase, undefined, 'déjà en Clôture : la date d’entrée ne bouge pas');
    assert.equal(dejaEnCloture.patch.statut, 'termine');
    const encore = P.terminerProjet(projet({ statut: 'termine', archive: true }), c);
    assert.deepEqual([encore.patch, encore.evenements], [{}, []]);
  });
  test('B21 terminer un projet d’extraction ne crée rien d’autre (jamais de boucle) : un seul événement, aucune écriture hors du projet', () => {
    const plan = P.planTerminerProjet({ ...projet({ nature: 'extraction', affaireId: 'a1' }) }, ctx());
    assert.deepEqual(cles(plan.ecritures).map((k) => k.split('/')[0]), ['creer:crm_evenements', 'modifier:projets_projets']);
  });
  test('B21 rouvrir un projet terminé : actif, désarchivé, phase inchangée', () => {
    const r = P.rouvrirProjet(projet({ phase: 'cloture', statut: 'termine', archive: true }), ctx());
    assert.deepEqual(r.patch, { statut: 'actif', archive: false });
    assert.equal(r.evenements[0].type, 'projet_rouvert');
    assert.deepEqual(P.rouvrirProjet(projet(), ctx()).patch, {});
  });
  test('B21 archiver et désarchiver à la main, avec leur événement ; sans changement, rien', () => {
    const a = P.archiverProjet(projet(), true, ctx());
    assert.deepEqual(a.patch, { archive: true });
    assert.equal(a.evenements[0].type, 'projet_archive');
    assert.equal(P.archiverProjet(projet({ archive: true }), false, ctx()).evenements[0].type, 'projet_desarchive');
    assert.deepEqual(P.archiverProjet(projet(), false, ctx()).patch, {});
  });
});

describe('B22 Projets : avancement, retard, pastille', () => {
  const t = (fait, date) => ({ fait, date });
  test('B22 avancement : tâches faites sur tâches du projet ; aucun projet sans tâche à diviser par zéro', () => {
    assert.deepEqual(P.progressionProjet([t(true), t(false), t(true), t(false)]), { faites: 2, total: 4, ratio: 0.5 });
    assert.deepEqual(P.progressionProjet([]), { faites: 0, total: 0, ratio: 0 });
    assert.deepEqual(P.progressionProjet(), { faites: 0, total: 0, ratio: 0 });
  });
  test('B22 en retard : fin prévue dépassée, ou une tâche non faite dont la date est passée', () => {
    const ajd = '2026-10-15';
    assert.equal(P.estProjetEnRetard(projet({ dateFin: '2026-10-14' }), [], ajd), true);
    assert.equal(P.estProjetEnRetard(projet({ dateFin: '2026-10-15' }), [], ajd), false, 'le jour même, pas encore en retard');
    assert.equal(P.estProjetEnRetard(projet(), [t(false, '2026-10-14')], ajd), true);
    assert.equal(P.estProjetEnRetard(projet(), [t(true, '2026-10-14'), t(false, '2026-10-15'), t(false, null)], ajd), false);
  });
  test('B22 un projet terminé, archivé ou en pause n’est jamais en retard', () => {
    for (const etat of [{ statut: 'termine' }, { archive: true }, { statut: 'en_pause' }]) {
      assert.equal(P.estProjetEnRetard(projet({ dateFin: '2026-01-01', ...etat }), [t(false, '2026-01-01')], '2026-10-15'), false);
      assert.equal(P.pastilleProjet(projet({ dateFin: '2026-01-01', ...etat }), [t(false, '2026-01-01')], '2026-10-15'), 'grise');
    }
  });
  test('B22 pastille : rouge (en retard), verte (une tâche à faire), grise (rien)', () => {
    const ajd = '2026-10-15';
    assert.equal(P.pastilleProjet(projet(), [t(false, '2026-10-01')], ajd), 'rouge');
    assert.equal(P.pastilleProjet(projet(), [t(false, '2026-10-20'), t(true, '2026-10-01')], ajd), 'verte');
    assert.equal(P.pastilleProjet(projet(), [t(false, null)], ajd), 'verte', 'une tâche sans date est à faire');
    assert.equal(P.pastilleProjet(projet(), [t(true, '2026-10-01')], ajd), 'grise');
    assert.equal(P.pastilleProjet(projet(), [], ajd), 'grise');
  });
  test('B22 estProjetActif : ni archivé, ni en pause, ni terminé', () => {
    assert.equal(P.estProjetActif(projet()), true);
    assert.equal(P.estProjetActif(projet({ archive: true })), false);
    assert.equal(P.estProjetActif(projet({ statut: 'en_pause' })), false);
    assert.equal(P.estProjetActif(null), false);
  });
});

describe('B23 Projets : liens', () => {
  const projets = [projet({ id: 'p-a', affaireId: 'a1', personneId: 'p1' }), projet({ id: 'p-b', personneId: 'p1', organisationId: 'o1' }), projet({ id: 'p-c' })];
  test('B23 une affaire a au plus un projet ; sans lien, aucun', () => {
    assert.equal(P.projetDeAffaire(projets, 'a1').id, 'p-a');
    assert.equal(P.projetDeAffaire(projets, 'a9'), null);
    assert.equal(P.projetDeAffaire(projets, null), null, 'un projet sans affaire n’est pas « le projet de null »');
  });
  test('B23 projets d’une personne, d’une organisation, d’une affaire', () => {
    assert.deepEqual(P.projetsLies(projets, { personneId: 'p1' }).map((p) => p.id), ['p-a', 'p-b']);
    assert.deepEqual(P.projetsLies(projets, { organisationId: 'o1' }).map((p) => p.id), ['p-b']);
    assert.deepEqual(P.projetsLies(projets, { affaireId: 'a1' }).map((p) => p.id), ['p-a']);
    assert.deepEqual(P.projetsLies(projets, { personneId: null }), []);
  });
});

describe('B24 Projets : plans d’écriture', () => {
  test('B24 créer un projet : le document avec ses marques, puis l’événement du fil avec projetId', () => {
    const plan = P.planCreerProjet({ titre: ' Site vitrine ', personneId: 'p1', organisationId: 'o1' }, ctx());
    assert.equal(plan.id, 'projets_projets_1');
    assert.equal(plan.titre, 'Site vitrine');
    const [doc, ev] = plan.ecritures;
    assert.deepEqual([doc.type, doc.collection, doc.id], ['creer', 'projets_projets', 'projets_projets_1']);
    assert.deepEqual(doc.horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual(doc.signer, ['creePar', 'modifiePar']);
    assert.deepEqual([ev.collection, ev.donnees.type, ev.donnees.texte], ['crm_evenements', 'projet_cree', 'Projet créé : Site vitrine']);
    assert.deepEqual([ev.donnees.projetId, ev.donnees.personneId, ev.donnees.organisationId, ev.donnees.affaireId], ['projets_projets_1', 'p1', 'o1', null]);
  });
  test('B24 modifier : une écriture avec marque de modification, aucune si le patch est vide', () => {
    const [e] = P.planMajProjet('pr1', { titre: 'Nouveau' }).ecritures;
    assert.deepEqual([e.type, e.collection, e.id, e.patch, e.horodater, e.signer], ['modifier', 'projets_projets', 'pr1', { titre: 'Nouveau' }, ['modifieLe'], ['modifiePar']]);
    assert.deepEqual(P.planMajProjet('pr1', {}).ecritures, []);
  });
  test('B24 changer de phase, mettre en pause, terminer : le projet puis ses événements ; une erreur de règle n’écrit rien', () => {
    const plan = P.planChangerPhase(projet(), 'livraison', ctx());
    assert.deepEqual(plan.ecritures.map((e) => `${e.type}:${e.collection}`), ['modifier:projets_projets', 'creer:crm_evenements']);
    const erreur = P.planChangerPhase(projet(), 'nimporte', ctx());
    assert.deepEqual(erreur.ecritures, []);
    assert.ok(erreur.erreurs.phase);
    assert.deepEqual(P.planChangerPhase(projet(), 'lancement', ctx()).ecritures, []);
    assert.equal(P.planMettreProjetEnPause(projet(), ctx()).ecritures.length, 2);
    assert.equal(P.planTerminerProjet(projet(), ctx()).ecritures.length, 2);
  });
  test('B24 supprimer un projet : son fil, ses tâches puis lui ; l’affaire est détachée, les extractions perdent leur source ; rien aux autres', () => {
    const p = projet({ affaireId: 'a1' });
    const plan = P.planSupprimerProjet({
      projet: p,
      taches: [{ id: 't1', projetId: 'pr1' }, { id: 't2', projetId: 'pr1' }, { id: 't9', projetId: 'autre' }],
      liens: [
        { collection: 'crm_notes', id: 'n1', projetId: 'pr1' }, { collection: 'crm_notes', id: 'n1', projetId: 'pr1' },
        { collection: 'crm_evenements', id: 'ev1', projetId: 'pr1' }, { collection: 'crm_evenements', id: 'ev9', projetId: 'autre' },
      ],
      affaire: { id: 'a1', projetId: 'pr1' },
      extractions: [{ id: 'ex1', projetSourceId: 'pr1' }, { id: 'ex1', projetSourceId: 'pr1' }, { id: 'ex2', projetSourceId: 'autre' }],
    });
    assert.deepEqual(cles(plan.ecritures), [
      'modifier:crm_affaires/a1', 'modifier:projets_projets/ex1', 'supprimer:crm_evenements/ev1', 'supprimer:crm_notes/n1',
      'supprimer:projets_projets/pr1', 'supprimer:projets_taches/t1', 'supprimer:projets_taches/t2',
    ].sort());
    const a = plan.ecritures.find((e) => e.collection === 'crm_affaires');
    assert.deepEqual(a.patch, { projetId: null });
    assert.deepEqual(a.signer, ['modifiePar']);
    assert.equal(plan.ecritures.at(-1).id, 'pr1', 'le projet en dernier');
    assert.equal(plan.ecritures.findLastIndex((e) => e.type === 'modifier') < plan.ecritures.findIndex((e) => e.type === 'supprimer'), true, 'détachements avant suppressions');
  });
  test('B24 supprimer un projet : une affaire qui n’est pas liée à lui (autre projet) n’est pas touchée ; sans affaire, rien à détacher', () => {
    const plan = P.planSupprimerProjet({ projet: projet({ affaireId: 'a1' }), affaire: { id: 'a1', projetId: 'autre' } });
    assert.deepEqual(cles(plan.ecritures), ['supprimer:projets_projets/pr1']);
    assert.deepEqual(cles(P.planSupprimerProjet({ projet: projet() }).ecritures), ['supprimer:projets_projets/pr1']);
  });
  test('B24 la confirmation de suppression se fait en tapant le titre (accents et casse ignorés)', () => {
    assert.equal(L.confirmationValide('audit  CARREL', projet().titre), true);
    assert.equal(L.confirmationValide('autre', projet().titre), false);
  });
});

describe('B25 Intégrité des liens : une fiche du CRM disparaît, ses projets restent', () => {
  const c = ctx('2026-10-15T08:00:00Z');
  const exec = (base, ecritures) => executer(base, ecritures, { maintenant: c.maintenant });
  /** Une personne, son organisation, une affaire gagnée et son projet, avec le fil de chacun. */
  function monde() {
    let base = {};
    const org = L.planCreerOrganisation({ nom: 'Atelier Carrel' }, c);
    base = exec(base, org.ecritures);
    const per = L.planCreerPersonne({ nom: 'Camille Durand', organisationId: org.id }, c);
    base = exec(base, per.ecritures);
    const aff = L.planCreerAffaire({ titre: 'Audit Carrel', personneId: per.id, organisationId: org.id }, { personnes: base.crm_personnes, organisations: base.crm_organisations }, c);
    base = exec(base, aff.ecritures);
    const pr = P.planCreerProjet({ titre: 'Audit Carrel', affaireId: aff.id, personneId: per.id, organisationId: org.id }, c);
    base = exec(base, pr.ecritures);
    base = exec(base, L.planMajAffaire(aff.id, { projetId: pr.id }).ecritures);
    base = exec(base, P.planChangerPhase(base.projets_projets[0], 'decouverte', c).ecritures);
    return { base, org: org.id, per: per.id, aff: aff.id, pr: pr.id };
  }
  /** Les liens que l'écran et le serveur lisent dans le fil (activités, notes, événements), avec leur projetId. */
  const liensDe = (base, champ, id) => ['crm_activites', 'crm_notes', 'crm_evenements'].flatMap((nom) => (base[nom] || [])
    .filter((d) => d[champ] === id).map((d) => ({ collection: nom, id: d.id, personneId: d.personneId ?? null, organisationId: d.organisationId ?? null, affaireId: d.affaireId ?? null, projetId: d.projetId ?? null })));
  const lies = (base, champ, id) => (base.projets_projets || []).filter((p) => p[champ] === id)
    .map((p) => ({ id: p.id, affaireId: p.affaireId, personneId: p.personneId, organisationId: p.organisationId }));

  test('B25 supprimer l’affaire : le projet reste, son affaireId est vidé, les liens vers la personne et l’organisation restent ; son fil de projet aussi', () => {
    const { base, aff, pr, per, org } = monde();
    const evenementsProjet = base.crm_evenements.filter((e) => e.projetId === pr).length;
    assert.equal(evenementsProjet, 2, 'projet créé et phase changée');
    const plan = L.planSupprimerAffaire({ affaireId: aff, liens: liensDe(base, 'affaireId', aff), projets: lies(base, 'affaireId', aff) });
    const apres = exec(base, plan.ecritures);
    assert.equal(apres.crm_affaires.length, 0);
    assert.equal(apres.projets_projets.length, 1, 'le projet est conservé');
    assert.deepEqual([apres.projets_projets[0].affaireId, apres.projets_projets[0].personneId, apres.projets_projets[0].organisationId], [null, per, org]);
    const siens = apres.crm_evenements.filter((e) => e.projetId === pr);
    assert.equal(siens.length, 2, 'le fil du projet reste');
    assert.ok(siens.every((e) => e.affaireId === null && e.personneId === per), 'seul le lien vers l’affaire est vidé');
    assert.equal(apres.crm_evenements.filter((e) => !e.projetId && e.affaireId === aff).length, 0, 'le fil propre de l’affaire est supprimé');
  });
  test('B25 supprimer la personne avec ses affaires : projet gardé, affaireId et personneId vidés, une seule écriture par projet', () => {
    const { base, per, pr, org } = monde();
    const liens = liensDe(base, 'personneId', per);
    for (const a of base.crm_affaires.filter((x) => x.personneId === per)) liens.push(...liensDe(base, 'affaireId', a.id));
    const projets = [...lies(base, 'personneId', per), ...base.crm_affaires.flatMap((a) => lies(base, 'affaireId', a.id))];
    const plan = L.planSupprimerPersonne({ personneId: per, choix: 'affaires', affaires: base.crm_affaires, liens, projets });
    assert.equal(plan.ecritures.filter((e) => e.collection === 'projets_projets').length, 1, 'le projet apparaît deux fois dans `projets` mais n’est écrit qu’une fois');
    const apres = exec(base, plan.ecritures);
    assert.equal(apres.crm_personnes.length + apres.crm_affaires.length, 0);
    assert.deepEqual([apres.projets_projets[0].id, apres.projets_projets[0].affaireId, apres.projets_projets[0].personneId, apres.projets_projets[0].organisationId], [pr, null, null, org]);
    assert.equal(apres.crm_evenements.filter((e) => e.projetId === pr).length, 2, 'le fil du projet est gardé');
    assert.ok(apres.crm_evenements.filter((e) => e.projetId === pr).every((e) => e.personneId === null && e.affaireId === null));
  });
  test('B25 supprimer la personne en conservant ses affaires : l’affaire garde son projet, le projet perd la personne', () => {
    const { base, per, pr, aff } = monde();
    const plan = L.planSupprimerPersonne({
      personneId: per, choix: 'conserver', affaires: base.crm_affaires, liens: liensDe(base, 'personneId', per), projets: lies(base, 'personneId', per),
    });
    const apres = exec(base, plan.ecritures);
    assert.equal(apres.crm_affaires[0].projetId, pr);
    assert.deepEqual([apres.projets_projets[0].personneId, apres.projets_projets[0].affaireId], [null, aff]);
  });
  test('B25 supprimer l’organisation (vide de personnes et d’affaires) : le projet reste, organisationId vidé', () => {
    let { base, per, aff, org, pr } = monde();
    base = exec(base, L.planSupprimerAffaire({ affaireId: aff, liens: liensDe(base, 'affaireId', aff), projets: lies(base, 'affaireId', aff) }).ecritures);
    base = exec(base, L.planSupprimerPersonne({ personneId: per, choix: undefined, affaires: [], liens: liensDe(base, 'personneId', per), projets: lies(base, 'personneId', per) }).ecritures);
    const plan = L.planSupprimerOrganisation({ organisationId: org, personnes: base.crm_personnes, affaires: base.crm_affaires, liens: liensDe(base, 'organisationId', org), projets: lies(base, 'organisationId', org) });
    assert.equal(plan.refus, undefined);
    const apres = exec(base, plan.ecritures);
    assert.equal(apres.crm_organisations.length, 0);
    assert.equal(apres.projets_projets[0].id, pr);
    assert.deepEqual([apres.projets_projets[0].organisationId, apres.projets_projets[0].personneId, apres.projets_projets[0].affaireId], [null, null, null]);
  });
  test('B25 sans `projets` ni `projetId` (appelants d’avant les projets) : les plans de suppression font exactement ce qu’ils faisaient', () => {
    const liens = [{ collection: 'crm_notes', id: 'n1', affaireId: 'a1' }];
    assert.deepEqual(cles(L.planSupprimerAffaire({ affaireId: 'a1', liens }).ecritures), ['supprimer:crm_affaires/a1', 'supprimer:crm_notes/n1']);
  });
  test('B25 un projet sans affaire se supprime, ses tâches avec lui, sans toucher à aucune affaire', () => {
    const { base, pr } = monde();
    const sans = exec(base, P.planCreerProjet({ titre: 'Chantier interne' }, ctx('2026-10-16T08:00:00Z', { nouvelId: (n) => `${n}_x` })).ecritures);
    const interne = sans.projets_projets.find((p) => p.titre === 'Chantier interne');
    const plan = P.planSupprimerProjet({ projet: interne, taches: [{ id: 't1', projetId: interne.id }], liens: liensDe(sans, 'projetId', interne.id) });
    const apres = exec({ ...sans, projets_taches: [{ id: 't1', projetId: interne.id }] }, plan.ecritures);
    assert.equal(apres.projets_projets.length, 1);
    assert.equal(apres.projets_projets[0].id, pr);
    assert.equal(apres.projets_taches.length, 0);
    assert.equal(apres.crm_affaires[0].projetId, pr, 'l’affaire de l’autre projet n’est pas touchée');
  });
  test('B25 le Journal sait nommer les documents des projets', () => {
    assert.equal(L.libelleDocumentJournal('projets_projets'), 'projet');
    assert.equal(L.libelleDocumentJournal('projets_projets', true), 'projets');
    assert.equal(L.libelleDocumentJournal('projets_taches', true), 'tâches de projet');
    assert.equal(L.libelleDocumentJournal('projets_modeles'), 'modèle de projet');
  });
});

describe('B26 Projets : filtres et recherche de l’écran', () => {
  const personnes = [{ id: 'p1', nom: 'Camille Durand' }, { id: 'p2', nom: 'Élodie Martin' }];
  const organisations = [{ id: 'o1', nom: 'Atelier des Lilas' }];
  const projets = [
    projet({ id: 'a', titre: 'Audit Carrel', personneId: 'p1', organisationId: 'o1', phase: 'lancement' }),
    projet({ id: 'b', titre: 'Accompagnement Martin', personneId: 'p2', phase: 'livraison', dateFin: '2026-10-01' }),
    projet({ id: 'c', titre: 'Extraction Carrel', nature: 'extraction', phase: 'decouverte', statut: 'en_pause' }),
    projet({ id: 'd', titre: 'Ancien chantier', phase: 'cloture', statut: 'termine', archive: true }),
  ];
  const ids = (liste) => liste.map((p) => p.id);
  const contexte = { personnes, organisations, taches: [], aujourdhui: '2026-10-15' };

  test('B26 critères : les clés manquantes sont vides ; les filtres posés sont comptés, pas la recherche', () => {
    assert.deepEqual(P.criteresProjetsComplets(), { recherche: '', phases: [], statuts: [], natures: [], enRetard: false });
    assert.equal(P.filtresProjetsActifs({ recherche: 'x' }), 0);
    assert.equal(P.filtresProjetsActifs({ phases: ['lancement', 'livraison'], enRetard: true }), 2, 'un groupe de cases compte pour un filtre');
    assert.deepEqual(P.CRITERES_PROJETS_VIDES, P.criteresProjetsComplets({}));
  });
  test('B26 sans critère : les projets du tableau (non archivés) ; avec archives : les archivés', () => {
    assert.deepEqual(ids(P.filtrerProjets(projets, {}, contexte)), ['a', 'b', 'c']);
    assert.deepEqual(ids(P.filtrerProjets(projets, {}, { ...contexte, archives: true })), ['d']);
  });
  test('B26 phase, statut et nature se combinent (et)', () => {
    assert.deepEqual(ids(P.filtrerProjets(projets, { phases: ['lancement', 'livraison'] }, contexte)), ['a', 'b']);
    assert.deepEqual(ids(P.filtrerProjets(projets, { statuts: ['en_pause'] }, contexte)), ['c']);
    assert.deepEqual(ids(P.filtrerProjets(projets, { natures: ['extraction'] }, contexte)), ['c']);
    assert.deepEqual(ids(P.filtrerProjets(projets, { natures: ['livraison'], phases: ['livraison'] }, contexte)), ['b']);
    assert.deepEqual(ids(P.filtrerProjets(projets, { natures: ['extraction'], phases: ['livraison'] }, contexte)), []);
  });
  test('B26 un projet sans nature (document ancien) compte comme une livraison', () => {
    const sans = [{ ...projet({ id: 'z' }), nature: undefined }];
    assert.deepEqual(ids(P.filtrerProjets(sans, { natures: ['livraison'] }, contexte)), ['z']);
  });
  test('B26 en retard : fin dépassée ou tâche en retard ; jamais un projet en pause ou terminé', () => {
    assert.deepEqual(ids(P.filtrerProjets(projets, { enRetard: true }, contexte)), ['b']);
    const avecTache = { ...contexte, taches: [{ projetId: 'a', fait: false, date: '2026-10-02' }, { projetId: 'c', fait: false, date: '2026-10-02' }] };
    assert.deepEqual(ids(P.filtrerProjets(projets, { enRetard: true }, avecTache)), ['a', 'b'], 'c est en pause : jamais en retard');
  });
  test('B26 recherche : titre, personne, organisation, sans accents ni casse, tous les mots', () => {
    assert.deepEqual(ids(P.filtrerProjets(projets, { recherche: 'carrel' }, contexte)), ['a', 'c']);
    assert.deepEqual(ids(P.filtrerProjets(projets, { recherche: 'ELODIE' }, contexte)), ['b'], 'la personne, sans accent');
    assert.deepEqual(ids(P.filtrerProjets(projets, { recherche: 'lilas audit' }, contexte)), ['a'], 'organisation et titre ensemble');
    assert.deepEqual(ids(P.filtrerProjets(projets, { recherche: 'carrel martin' }, contexte)), []);
    assert.deepEqual(ids(P.filtrerProjets(projets, { recherche: '   ' }, contexte)), ['a', 'b', 'c']);
  });
  test('B26 le tableau : les projets d’une phase, sans les archivés', () => {
    assert.deepEqual(ids(P.projetsDePhase(projets, 'livraison')), ['b']);
    assert.deepEqual(ids(P.projetsDePhase(projets, 'cloture')), [], 'le projet terminé est archivé, il n’est plus dans le tableau');
  });
  test('B26 liens d’un projet : le projet et tout ce qu’il relie, pour ses notes et son fil', () => {
    assert.deepEqual(P.liensProjet(projet({ id: 'pr1', affaireId: 'a1', personneId: 'p1', organisationId: 'o1' })), { personneId: 'p1', organisationId: 'o1', affaireId: 'a1', projetId: 'pr1' });
    assert.deepEqual(P.liensProjet(projet({ id: 'pr2' })), { personneId: null, organisationId: null, affaireId: null, projetId: 'pr2' });
  });
  test('B26 une note de projet garde son projetId ; une note du CRM reste exactement comme avant (aucun champ en plus)', () => {
    const c = ctx();
    assert.equal(L.nouvelleNote('x', P.liensProjet(projet({ id: 'pr1', affaireId: 'a1' })), c).projetId, 'pr1');
    assert.deepEqual(Object.keys(L.nouvelleNote('x', { affaireId: 'a1' }, c)).sort(), ['affaireId', 'auteur', 'organisationId', 'personneId', 'texte']);
  });
});

describe('B27 Projets : filtres enregistrés', () => {
  test('B27 il y a quelque chose à enregistrer dès qu’il y a une recherche ou un filtre', () => {
    assert.equal(P.criteresProjetsActifs({}), false);
    assert.equal(P.criteresProjetsActifs({ recherche: '   ' }), false);
    assert.equal(P.criteresProjetsActifs({ recherche: 'carrel' }), true);
    assert.equal(P.criteresProjetsActifs({ enRetard: true }), true);
    assert.equal(P.criteresProjetsActifs({ phases: ['livraison'] }), true);
  });
  test('B27 seuls les filtres de projets sont retenus ; ceux du CRM (sans `liste` = affaires) restent à part', () => {
    const filtres = [{ id: 'a', liste: 'affaires' }, { id: 'b', liste: 'projets' }, { id: 'c' }, { id: 'd', liste: 'personnes' }];
    assert.deepEqual(P.filtresEnregistresProjets(filtres).map((f) => f.id), ['b']);
    assert.deepEqual(P.filtresEnregistresProjets(), []);
  });
  test('B27 nouveau filtre : nom nettoyé, liste « projets », critères complets, identifiant propre, rang à la suite', () => {
    const existants = [{ id: 'x', nom: 'Chaudes', liste: 'affaires', ordre: 1 }];
    const r = P.nouveauFiltreProjets('  Projets   en retard ', { enRetard: true, phases: ['livraison'] }, existants, 'ab12');
    assert.deepEqual(r.erreurs, {});
    assert.deepEqual(r.filtre, { id: 'projets_en_retard_ab12', nom: 'Projets en retard', liste: 'projets', criteres: { recherche: '', phases: ['livraison'], statuts: [], natures: [], enRetard: true }, ordre: 2 });
  });
  test('B27 nom vide ou déjà pris par un filtre de projets : refusé ; le même nom chez les affaires ne gêne pas', () => {
    const existants = [{ id: 'x', nom: 'Chaudes', liste: 'affaires' }, { id: 'y', nom: 'Extractions', liste: 'projets' }];
    assert.deepEqual(P.nouveauFiltreProjets('  ', {}, existants, 'z').erreurs, { nom: 'Le nom du filtre est obligatoire.' });
    assert.deepEqual(P.nouveauFiltreProjets('extractions', {}, existants, 'z').erreurs, { nom: 'Un filtre porte déjà ce nom.' });
    assert.equal(P.nouveauFiltreProjets('Chaudes', {}, existants, 'z').erreurs.nom, undefined);
  });
  test('B27 un filtre enregistré se réapplique tel quel (critères complets, même résultat)', () => {
    const projets = [projet({ id: 'a', phase: 'livraison', dateFin: '2026-10-01' }), projet({ id: 'b', phase: 'lancement' })];
    const { filtre } = P.nouveauFiltreProjets('En retard', { enRetard: true }, [], 'k');
    const contexte = { aujourdhui: '2026-10-15' };
    assert.deepEqual(P.filtrerProjets(projets, filtre.criteres, contexte).map((p) => p.id), ['a']);
  });
});
