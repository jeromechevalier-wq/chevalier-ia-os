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

describe('B28 Affaire gagnée : créer ou lier un projet', () => {
  const gagnee = (extra = {}) => ({ ...L.nouvelleAffaire({ titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'gagne', offreId: 'off1', montant: 1200 }, ctx('2026-10-01T08:00:00Z')), id: 'a1', ...extra });
  const libre = (extra = {}) => projet({ id: 'pl', titre: 'Chantier libre', ...extra });
  const c = () => ctx('2026-10-20T09:00:00Z');
  const par = (ecritures) => Object.fromEntries(ecritures.map((e) => [`${e.type}:${e.collection}`, e]));

  test('B28 seule une affaire gagnée peut avoir un projet (en cours, perdue, en pause : refus)', () => {
    for (const a of [L.nouvelleAffaire({ titre: 'x' }, ctx()), gagnee({ statut: 'perdue' }), gagnee({ statut: 'en_pause' })]) {
      const plan = P.planCreerProjetDepuisAffaire({ affaire: { ...a, id: 'a1' } }, c());
      assert.deepEqual(plan.erreurs, { affaire: 'Seule une affaire gagnée peut avoir un projet.' });
      assert.deepEqual(plan.ecritures, []);
    }
    assert.deepEqual(P.validerLienAffaire({ affaire: gagnee() }), {});
  });
  test('B28 une affaire archivée mais gagnée (facture payée) peut encore avoir son projet', () => {
    assert.deepEqual(P.validerLienAffaire({ affaire: gagnee({ etape: 'gagne', archive: true }) }), {});
  });
  test('B28 créer : le projet reprend l’affaire, l’affaire reçoit projetId, un événement, tout dans le même plan', () => {
    const affaire = gagnee({ urlGithub: 'https://github.com/jeromechevalier-wq/client-lilas', urlDossier: 'https://drive.google.com/drive/folders/abc' });
    const plan = P.planCreerProjetDepuisAffaire({ affaire }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.id, 'projets_projets_1');
    assert.equal(plan.titre, 'Audit des Lilas');
    const e = par(plan.ecritures);
    assert.equal(plan.ecritures.length, 3);
    const doc = e['creer:projets_projets'].donnees;
    assert.deepEqual([doc.titre, doc.affaireId, doc.personneId, doc.organisationId, doc.offreId, doc.phase, doc.statut, doc.nature], ['Audit des Lilas', 'a1', 'p1', 'o1', 'off1', 'lancement', 'actif', 'livraison']);
    assert.deepEqual([doc.urlGithub, doc.urlDossier], ['https://github.com/jeromechevalier-wq/client-lilas', 'https://drive.google.com/drive/folders/abc']);
    assert.deepEqual([e['modifier:crm_affaires'].id, e['modifier:crm_affaires'].patch], ['a1', { projetId: 'projets_projets_1' }]);
    assert.deepEqual(e['modifier:crm_affaires'].signer, ['modifiePar']);
    const ev = e['creer:crm_evenements'].donnees;
    assert.deepEqual([ev.type, ev.projetId, ev.affaireId, ev.personneId, ev.organisationId], ['projet_cree', 'projets_projets_1', 'a1', 'p1', 'o1']);
  });
  test('B28 créer : les valeurs données l’emportent sur celles de l’affaire', () => {
    const plan = P.planCreerProjetDepuisAffaire({ affaire: gagnee(), valeurs: { titre: 'Autre titre', dateFin: '2026-12-31' } }, c());
    const doc = par(plan.ecritures)['creer:projets_projets'].donnees;
    assert.deepEqual([doc.titre, doc.dateFin, doc.affaireId], ['Autre titre', '2026-12-31', 'a1']);
  });
  test('B28 une affaire n’a qu’un projet : refus si un projet la cite, ou si elle cite un projet qui existe ; un lien resté dans le vide ne bloque pas', () => {
    const deja = P.planCreerProjetDepuisAffaire({ affaire: gagnee(), projets: [projet({ id: 'x', affaireId: 'a1' })] }, c());
    assert.deepEqual(deja.erreurs, { affaire: 'Cette affaire a déjà un projet.' });
    const cite = P.planCreerProjetDepuisAffaire({ affaire: gagnee({ projetId: 'y' }), projets: [projet({ id: 'y' })] }, c());
    assert.deepEqual(cite.erreurs, { affaire: 'Cette affaire a déjà un projet.' });
    const vide = P.planCreerProjetDepuisAffaire({ affaire: gagnee({ projetId: 'disparu' }), projets: [] }, c());
    assert.deepEqual(vide.erreurs, {});
  });
  test('B28 le projet d’une affaire se retrouve par le lien de l’un ou de l’autre côté', () => {
    const projets = [projet({ id: 'x', affaireId: 'a1' }), projet({ id: 'y' })];
    assert.equal(P.projetLieAAffaire(projets, { id: 'a1' }).id, 'x');
    assert.equal(P.projetLieAAffaire(projets, { id: 'a2', projetId: 'y' }).id, 'y');
    assert.equal(P.projetLieAAffaire(projets, { id: 'a3' }), null);
    assert.equal(P.projetLieAAffaire(projets, null), null);
  });
  test('B28 lier : le projet reçoit l’affaire et complète ce qui lui manque sans écraser ce qu’il a ; l’affaire reçoit projetId', () => {
    const affaire = gagnee({ urlGithub: 'https://github.com/jeromechevalier-wq/depot-affaire' });
    const plan = P.planLierProjet({ affaire, projet: libre({ personneId: 'p9', urlGithub: 'https://github.com/jeromechevalier-wq/depot-projet' }), projets: [] }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual(plan.patch, { affaireId: 'a1', organisationId: 'o1', offreId: 'off1' });
    const e = par(plan.ecritures);
    assert.deepEqual(e['modifier:projets_projets'].patch, plan.patch);
    assert.deepEqual(e['modifier:projets_projets'].signer, ['modifiePar']);
    assert.deepEqual(e['modifier:crm_affaires'].patch, { projetId: 'pl' });
    const ev = e['creer:crm_evenements'].donnees;
    assert.deepEqual([ev.type, ev.texte, ev.projetId, ev.affaireId, ev.personneId], ['projet_lie', 'Projet lié à l’affaire : Audit des Lilas', 'pl', 'a1', 'p9']);
  });
  test('B28 lier : refus si le projet a déjà une affaire, s’il est archivé, ou si l’affaire a déjà un projet', () => {
    assert.deepEqual(P.planLierProjet({ affaire: gagnee(), projet: libre({ affaireId: 'a7' }) }, c()).erreurs, { projet: 'Ce projet est déjà lié à une affaire.' });
    assert.match(P.planLierProjet({ affaire: gagnee(), projet: libre({ archive: true }) }, c()).erreurs.projet, /archivé/);
    assert.deepEqual(P.planLierProjet({ affaire: gagnee({ projetId: 'x' }), projet: libre(), projets: [projet({ id: 'x' })] }, c()).erreurs, { affaire: 'Cette affaire a déjà un projet.' });
    assert.deepEqual(P.planLierProjet({ affaire: gagnee({ statut: 'perdue' }), projet: libre() }, c()).ecritures, []);
  });
  test('B28 projets liables : sans affaire, pas archivés, par ordre alphabétique', () => {
    const l = P.projetsLiables([projet({ id: 'b', titre: 'Zèbre' }), projet({ id: 'a', titre: 'Abeille' }), projet({ id: 'c', affaireId: 'a1' }), projet({ id: 'd', archive: true })]);
    assert.deepEqual(l.map((p) => p.id), ['a', 'b']);
  });
  test('B28 détacher : le lien disparaît des deux côtés, rien n’est supprimé, un événement garde la trace', () => {
    const p = projet({ id: 'pr1', affaireId: 'a1', personneId: 'p1' });
    const plan = P.planDelierProjet({ projet: p, affaire: gagnee({ projetId: 'pr1' }) }, c());
    assert.deepEqual(plan.erreurs, {});
    const e = par(plan.ecritures);
    assert.deepEqual(e['modifier:projets_projets'].patch, { affaireId: null });
    assert.deepEqual(e['modifier:crm_affaires'].patch, { projetId: null });
    assert.deepEqual(plan.ecritures.filter((x) => x.type === 'supprimer'), []);
    const ev = e['creer:crm_evenements'].donnees;
    assert.deepEqual([ev.type, ev.projetId, ev.affaireId, ev.personneId], ['projet_delie', 'pr1', 'a1', 'p1'], 'l’événement reste dans le fil de l’affaire et du projet');
  });
  test('B28 détacher : un projet sans affaire ou une autre affaire est refusé ; une affaire disparue n’empêche pas de détacher', () => {
    assert.ok(P.planDelierProjet({ projet: projet() }, c()).erreurs.projet);
    assert.ok(P.planDelierProjet({ projet: projet({ affaireId: 'a1' }), affaire: gagnee({ id: 'a2' }) }, c()).erreurs.projet);
    const sans = P.planDelierProjet({ projet: projet({ id: 'pr1', affaireId: 'disparue' }), affaire: null }, c());
    assert.deepEqual(sans.ecritures.map((e) => `${e.type}:${e.collection}`), ['modifier:projets_projets', 'creer:crm_evenements']);
  });
  test('B28 créer, lier puis détacher sur des données : on retrouve les deux fiches, liées puis libres', () => {
    const cx = c();
    const exec = (base, plan) => executer(base, plan.ecritures, { maintenant: cx.maintenant });
    let base = { crm_affaires: [gagnee()], projets_projets: [] };
    const cree = P.planCreerProjetDepuisAffaire({ affaire: base.crm_affaires[0], projets: base.projets_projets }, cx);
    base = exec(base, cree);
    assert.equal(base.crm_affaires[0].projetId, cree.id);
    assert.equal(base.projets_projets[0].affaireId, 'a1');
    base = exec(base, P.planDelierProjet({ projet: base.projets_projets[0], affaire: base.crm_affaires[0] }, cx));
    assert.deepEqual([base.crm_affaires[0].projetId, base.projets_projets[0].affaireId], [null, null]);
    base = exec(base, P.planLierProjet({ affaire: base.crm_affaires[0], projet: base.projets_projets[0], projets: base.projets_projets }, cx));
    assert.deepEqual([base.crm_affaires[0].projetId, base.projets_projets[0].affaireId], [cree.id, 'a1']);
  });
  test('B28 notes d’un projet : les siennes, plus celles de son affaire marquées « de l’affaire », chacune une seule fois', () => {
    const notesProjet = [{ id: 'n1', projetId: 'pr1', affaireId: 'a1' }];
    const notesAffaire = [{ id: 'n1', projetId: 'pr1', affaireId: 'a1' }, { id: 'n2', affaireId: 'a1' }, { id: 'n3', projetId: 'autre', affaireId: 'a1' }];
    const r = P.notesDuProjet(notesProjet, notesAffaire, 'pr1');
    assert.deepEqual(r.map((n) => [n.id, !!n.deAffaire]), [['n1', false], ['n2', true], ['n3', true]]);
    assert.equal(notesAffaire[1].deAffaire, undefined, 'les notes d’origine ne sont pas modifiées');
    assert.deepEqual(P.notesDuProjet(undefined, undefined, 'pr1'), []);
  });
});

describe('B29 Tâches d’un projet', () => {
  const c = (iso = '2026-10-20T09:00:00Z') => ctx(iso);
  const tache = (extra = {}) => ({ ...P.nouvelleTache({ titre: 'Écrire le rapport', projetId: 'pr1', phase: 'livraison', ordre: 1 }, c()), id: 't1', ...extra });

  test('B29 le titre est le seul champ obligatoire ; date, heure, phase et assigné sont contrôlés s’ils sont donnés', () => {
    assert.deepEqual(P.validerTache({ titre: ' ' }), { titre: 'Le titre est obligatoire.' });
    assert.deepEqual(P.validerTache({ titre: 'x' }), {});
    assert.ok(P.validerTache({ titre: 'x', date: '12/10/2026' }).date);
    assert.ok(P.validerTache({ titre: 'x', heure: '25:00' }).heure);
    assert.deepEqual(P.validerTache({ titre: 'x', heure: '09:30', date: '2026-10-21' }), {});
    assert.ok(P.validerTache({ titre: 'x', phase: 'facturation' }).phase);
    assert.ok(P.validerTache({ titre: 'x', assigneA: 'paul' }).assigneA);
  });
  test('B29 une nouvelle tâche : à faire, à Jérôme, sans date, dans la phase donnée', () => {
    const t = P.nouvelleTache({ titre: '  Interview   Carrel ', projetId: 'pr1', phase: 'decouverte', ordre: 3 }, c());
    assert.deepEqual(t, { titre: 'Interview Carrel', projetId: 'pr1', phase: 'decouverte', ordre: 3, date: null, heure: '', fait: false, dateFait: null, assigneA: 'jerome', auteur: JEROME });
    assert.equal(P.nouvelleTache({ titre: 'x', projetId: 'pr1', phase: 'inconnue', assigneA: 'charles', date: '2026-10-21', heure: '09:30' }, c()).phase, 'lancement');
  });
  test('B29 créer : à la fin de la phase, avec son projet ; la phase du projet par défaut ; refus sans titre', () => {
    const existantes = [tache({ id: 'a', ordre: 1 }), tache({ id: 'b', ordre: 4 }), tache({ id: 'z', phase: 'lancement', ordre: 9 }), tache({ id: 'x', projetId: 'autre', ordre: 7 })];
    const plan = P.planCreerTache({ projet: projet({ id: 'pr1', phase: 'livraison' }), taches: existantes, valeurs: { titre: 'Débriefing' } }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.id, 'projets_taches_1');
    const [e] = plan.ecritures;
    assert.deepEqual([e.type, e.collection, e.donnees.projetId, e.donnees.phase, e.donnees.ordre, e.horodater], ['creer', 'projets_taches', 'pr1', 'livraison', 5, ['creeLe']]);
    const autre = P.planCreerTache({ projet: projet({ id: 'pr1', phase: 'livraison' }), taches: existantes, valeurs: { titre: 'Brief', phase: 'lancement' } }, c());
    assert.equal(autre.ecritures[0].donnees.ordre, 10);
    const refus = P.planCreerTache({ projet: projet({ id: 'pr1' }), valeurs: { titre: '' } }, c());
    assert.deepEqual([refus.erreurs.titre, refus.ecritures], ['Le titre est obligatoire.', []]);
  });
  test('B29 modifier : seuls les champs qui changent sont écrits ; changer de phase met la tâche à la fin de la nouvelle phase', () => {
    const t = tache({ date: '2026-10-21' });
    const plan = P.planMajTache({ tache: t, patch: { titre: ' Nouveau  titre ', date: '2026-10-21', assigneA: 'charles' }, taches: [t] });
    assert.deepEqual(plan.patch, { titre: 'Nouveau titre', assigneA: 'charles' });
    assert.deepEqual(plan.ecritures.map((e) => [e.type, e.collection, e.id]), [['modifier', 'projets_taches', 't1']]);
    const ailleurs = P.planMajTache({ tache: t, patch: { phase: 'cloture' }, taches: [t, tache({ id: 'k', phase: 'cloture', ordre: 6 })] });
    assert.deepEqual(ailleurs.patch, { phase: 'cloture', ordre: 7 });
    assert.deepEqual(P.planMajTache({ tache: t, patch: { date: '' }, taches: [t] }).patch, { date: null });
    assert.deepEqual(P.planMajTache({ tache: t, patch: {}, taches: [t] }).ecritures, [], 'rien à écrire');
    assert.ok(P.planMajTache({ tache: t, patch: { titre: '  ' }, taches: [t] }).erreurs.titre);
  });
  test('B29 cocher : fait + date, un événement dans le fil du projet ; déjà faite : rien ; décocher : à faire', () => {
    const p = projet({ id: 'pr1', affaireId: 'a1', personneId: 'p1' });
    const plan = P.planTacheFaite({ tache: tache(), projet: p }, c());
    assert.deepEqual(plan.ecritures.map((e) => `${e.type}:${e.collection}`), ['modifier:projets_taches', 'creer:crm_evenements']);
    assert.deepEqual(plan.ecritures[0].patch, { fait: true, dateFait: c().maintenant });
    const ev = plan.ecritures[1].donnees;
    assert.deepEqual([ev.type, ev.texte, ev.projetId, ev.affaireId, ev.personneId], ['tache_faite', 'Tâche faite : Écrire le rapport', 'pr1', 'a1', 'p1']);
    assert.deepEqual(P.planTacheFaite({ tache: tache({ fait: true }), projet: p }, c()).ecritures, []);
    assert.deepEqual(P.planTacheNonFaite({ tache: tache({ fait: true, dateFait: new Date() }) }).ecritures[0].patch, { fait: false, dateFait: null });
    assert.deepEqual(P.planTacheNonFaite({ tache: tache() }).ecritures, []);
  });
  test('B29 supprimer une tâche : une seule suppression', () => {
    assert.deepEqual(P.planSupprimerTache('t1').ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`), ['supprimer:projets_taches/t1']);
  });
  test('B29 monter ou descendre : la phase est remise en ordre 1, 2, 3 et seules les tâches qui changent de place sont écrites ; au bord, rien', () => {
    const taches = [tache({ id: 'a', ordre: 1 }), tache({ id: 'b', ordre: 2 }), tache({ id: 'c', ordre: 3 }), tache({ id: 'd', phase: 'lancement', ordre: 1 })];
    const monte = P.planDeplacerTache({ tache: taches[2], taches, sens: -1 });
    assert.deepEqual(monte.ecritures.map((e) => [e.id, e.patch.ordre]).sort(), [['b', 3], ['c', 2]]);
    assert.deepEqual(P.planDeplacerTache({ tache: taches[0], taches, sens: -1 }).ecritures, []);
    assert.deepEqual(P.planDeplacerTache({ tache: taches[2], taches, sens: 1 }).ecritures, []);
    assert.deepEqual(P.planDeplacerTache({ tache: taches[3], taches, sens: 1 }).ecritures, [], 'la seule tâche de sa phase');
    const trous = [tache({ id: 'a', ordre: 2 }), tache({ id: 'b', ordre: 2 }), tache({ id: 'c', ordre: 9 })];
    const r = P.planDeplacerTache({ tache: trous[2], taches: trous, sens: -1 });
    const apres = trous.map((t) => ({ ...t, ordre: r.ecritures.find((e) => e.id === t.id)?.patch.ordre ?? t.ordre }));
    assert.deepEqual(P.tachesDuProjet(apres, 'pr1').map((t) => t.id).sort(), ['a', 'b', 'c']);
    assert.equal(new Set(apres.map((t) => t.ordre)).size, 3, 'des places toutes différentes après le déplacement');
  });
  test('B29 tâches par phase : les quatre phases dans l’ordre, par ordre dans chaque phase, et le nombre de faites', () => {
    const taches = [
      tache({ id: 'a', phase: 'livraison', ordre: 2, fait: true }), tache({ id: 'b', phase: 'livraison', ordre: 1 }), tache({ id: 'c', phase: 'lancement', ordre: 1 }),
      tache({ id: 'x', projetId: 'autre' }),
    ];
    const r = P.tachesParPhase(taches, 'pr1');
    assert.deepEqual(r.map((g) => g.phase.id), ['lancement', 'decouverte', 'livraison', 'cloture']);
    assert.deepEqual(r.map((g) => g.taches.map((t) => t.id)), [['c'], [], ['b', 'a'], []]);
    assert.deepEqual(r.map((g) => g.faites), [0, 0, 1, 0]);
    assert.deepEqual(P.tachesDuProjet(taches, 'pr1').map((t) => t.id), ['c', 'b', 'a']);
    assert.deepEqual(P.progressionProjet(P.tachesDuProjet(taches, 'pr1')), { faites: 1, total: 3, ratio: 1 / 3 });
  });
  test('B29 Accueil : tâches datées, non faites, de projets vivants ; en retard et du jour, par date et heure, avec leur projet', () => {
    const projets = [projet({ id: 'pr1' }), projet({ id: 'pause', statut: 'en_pause' }), projet({ id: 'fini', statut: 'termine', archive: true }), projet({ id: 'rangé', archive: true })];
    const t = (id, projetId, date, extra = {}) => tache({ id, projetId, date, ...extra });
    const taches = [
      t('r2', 'pr1', '2026-10-10'), t('r1', 'pr1', '2026-10-01'), t('j2', 'pr1', '2026-10-15', { heure: '15:00' }), t('j1', 'pr1', '2026-10-15', { heure: '09:00' }),
      t('futur', 'pr1', '2026-10-16'), t('sans', 'pr1', null), t('faite', 'pr1', '2026-10-01', { fait: true }),
      t('p', 'pause', '2026-10-01'), t('f', 'fini', '2026-10-01'), t('a', 'rangé', '2026-10-01'), t('orpheline', 'disparu', '2026-10-01'),
    ];
    const r = P.tachesPointsCles(taches, projets, '2026-10-15');
    assert.deepEqual(r.enRetard.map((x) => x.id), ['r1', 'r2']);
    assert.deepEqual(r.aujourdhui.map((x) => x.id), ['j1', 'j2']);
    assert.equal(r.enRetard[0].projet.id, 'pr1');
    assert.deepEqual(P.tachesPointsCles(undefined, undefined, '2026-10-15'), { enRetard: [], aujourdhui: [] });
  });
  test('B29 le retard d’un projet suit ses tâches (pastille rouge) et le filtre « en retard » aussi', () => {
    const p = projet({ id: 'pr1' });
    const taches = [tache({ date: '2026-10-01' })];
    assert.equal(P.pastilleProjet(p, taches, '2026-10-15'), 'rouge');
    assert.deepEqual(P.filtrerProjets([p], { enRetard: true }, { taches, aujourdhui: '2026-10-15' }).map((x) => x.id), ['pr1']);
    assert.deepEqual(P.filtrerProjets([p], { enRetard: true }, { taches: [tache({ date: '2026-10-20' })], aujourdhui: '2026-10-15' }), []);
  });
  test('B29 supprimer le projet supprime ses tâches (celles qu’on lui passe)', () => {
    const plan = P.planSupprimerProjet({ projet: projet({ id: 'pr1' }), taches: [tache({ id: 't1' }), tache({ id: 't2', projetId: 'autre' })] });
    assert.deepEqual(plan.ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`), ['supprimer:projets_taches/t1', 'supprimer:projets_projets/pr1']);
  });
});

describe('B30 Modèles de projet', () => {
  const c = () => ctx('2026-10-20T09:00:00Z');
  const modele = (extra = {}) => ({ ...P.nouveauModele({ nom: 'Mon modèle' }, c()), id: 'm1', ...extra });
  const exec = (base, plan) => executer(base, plan.ecritures, { maintenant: c().maintenant });

  test('B30 trois modèles de départ : Audit, Accompagnement, Extraction, avec le contenu de Jérôme', () => {
    const [audit, accompagnement, extraction] = P.MODELES_DEPART;
    assert.deepEqual(P.MODELES_DEPART.map((m) => [m.id, m.nom, m.offreId, m.nature]), [['audit', 'Audit', 'audit', 'livraison'], ['accompagnement', 'Accompagnement', 'accompagnement', 'livraison'], ['extraction', 'Extraction', null, 'extraction']]);
    assert.deepEqual(P.tachesDuModele(audit).map((t) => [t.titre, t.phase]), [['Interview', 'decouverte'], ['Créer le rapport', 'livraison'], ['Débriefing avec le client', 'livraison']]);
    assert.deepEqual(accompagnement.taches.map((t) => t.titre), ['Rendez-vous de lancement'], 'un seul rendez-vous au départ, les suivants s’ajoutent au fil de l’eau');
    assert.deepEqual(P.tachesDuModele(extraction).map((t) => t.titre), ['Tirer les règles', 'Comprendre les erreurs', 'Repérer ce qui est automatisable', 'Créer la documentation marketing']);
    assert.ok(extraction.taches.every((t) => t.delaiJours === 7), 'sept jours après la création');
    assert.ok(P.MODELES_DEPART.every((m) => Object.keys(P.validerModele(m)).length === 0 && m.taches.every((t) => Object.keys(P.validerTacheModele(t)).length === 0)));
    assert.equal(new Set(P.MODELES_DEPART.flatMap((m) => m.taches.map((t) => t.id))).size, 8, 'identifiants de tâches uniques');
  });
  test('B30 initialiser : trois créations aux identifiants fixes, sans champ vide, sans toucher aux modèles de départ eux-mêmes', () => {
    const plan = P.planInitialiserModeles();
    assert.deepEqual(plan.ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`), ['creer:projets_modeles/audit', 'creer:projets_modeles/accompagnement', 'creer:projets_modeles/extraction']);
    assert.ok(plan.ecritures.every((e) => !('id' in e.donnees) && Object.values(e.donnees).every((v) => v !== undefined)));
    plan.ecritures[0].donnees.taches.push({ id: 'x' });
    assert.equal(P.MODELES_DEPART[0].taches.length, 3, 'les modèles de départ ne sont pas modifiés');
  });
  test('B30 validations : nom obligatoire ; titre, phase et délai (entier de 0 à 3650, ou vide) d’une tâche type', () => {
    assert.deepEqual(P.validerModele({ nom: ' ' }), { nom: 'Le nom est obligatoire.' });
    assert.ok(P.validerModele({ nom: 'x', nature: 'autre' }).nature);
    assert.deepEqual(P.validerTacheModele({ titre: 'x', delaiJours: '' }), {});
    assert.deepEqual(P.validerTacheModele({ titre: 'x', delaiJours: 0 }), {});
    assert.deepEqual(P.validerTacheModele({ titre: 'x', delaiJours: '14' }), {});
    for (const d of [-1, 1.5, 'abc', 4000]) assert.ok(P.validerTacheModele({ titre: 'x', delaiJours: d }).delaiJours, String(d));
    assert.ok(P.validerTacheModele({ titre: '' }).titre);
    assert.ok(P.validerTacheModele({ titre: 'x', phase: 'facturation' }).phase);
  });
  test('B30 créer un modèle : à la suite des autres, sans tâche, actif, nature livraison par défaut ; refus sans nom', () => {
    const plan = P.planCreerModele({ valeurs: { nom: '  Site   vitrine ', offreId: 'off' }, modeles: [{ ordre: 3 }] }, c());
    assert.equal(plan.id, 'projets_modeles_1');
    const d = plan.ecritures[0].donnees;
    assert.deepEqual([d.nom, d.offreId, d.nature, d.taches, d.actif, d.ordre], ['Site vitrine', 'off', 'livraison', [], true, 4]);
    assert.deepEqual(plan.ecritures[0].horodater, ['creeLe', 'modifieLe']);
    assert.deepEqual(P.planCreerModele({ valeurs: { nom: '' } }, c()).ecritures, []);
  });
  test('B30 modifier un modèle : seuls les champs changés ; nom vide refusé ; offre vide = aucune', () => {
    const m = modele({ offreId: 'audit' });
    assert.deepEqual(P.planMajModele({ modele: m, patch: { nom: ' Nouveau nom ', offreId: 'audit', actif: false } }).patch, { nom: 'Nouveau nom', actif: false });
    assert.deepEqual(P.planMajModele({ modele: m, patch: { offreId: '' } }).patch, { offreId: null });
    assert.ok(P.planMajModele({ modele: m, patch: { nom: '' } }).erreurs.nom);
    assert.deepEqual(P.planMajModele({ modele: m, patch: { nom: 'Mon modèle' } }).ecritures, []);
  });
  test('B30 tâches types : ajouter à la fin de la phase, modifier, changer de phase, supprimer', () => {
    let m = modele();
    let n = 0;
    const cx = { ...c(), nouvelId: () => `tm${++n}` };
    const ajout = (valeurs) => { const plan = P.planAjouterTacheModele({ modele: m, valeurs }, cx); assert.deepEqual(plan.erreurs, {}); m = { ...m, taches: plan.ecritures[0].patch.taches }; return plan; };
    ajout({ titre: ' Interview ', phase: 'decouverte', delaiJours: '3' });
    ajout({ titre: 'Entretien 2', phase: 'decouverte' });
    ajout({ titre: 'Rapport', phase: 'livraison', delaiJours: 10 });
    assert.deepEqual(m.taches.map((t) => [t.id, t.titre, t.phase, t.delaiJours, t.ordre]), [['tm1', 'Interview', 'decouverte', 3, 1], ['tm2', 'Entretien 2', 'decouverte', null, 2], ['tm3', 'Rapport', 'livraison', 10, 1]]);
    assert.deepEqual(P.planAjouterTacheModele({ modele: m, valeurs: { titre: '' } }, cx).erreurs, { titre: 'Le titre est obligatoire.' });
    const maj = P.planMajTacheModele({ modele: m, tacheId: 'tm2', patch: { titre: 'Entretien deux', delaiJours: '', phase: 'livraison' } });
    assert.deepEqual(maj.ecritures[0].patch.taches.find((t) => t.id === 'tm2'), { id: 'tm2', titre: 'Entretien deux', phase: 'livraison', delaiJours: null, ordre: 2 });
    assert.deepEqual(P.planMajTacheModele({ modele: m, tacheId: 'tm2', patch: {} }).ecritures, []);
    assert.ok(P.planMajTacheModele({ modele: m, tacheId: 'inconnue', patch: { titre: 'x' } }).erreurs.tache);
    assert.ok(P.planMajTacheModele({ modele: m, tacheId: 'tm1', patch: { delaiJours: -2 } }).erreurs.delaiJours);
    const sans = P.planSupprimerTacheModele({ modele: m, tacheId: 'tm1' });
    assert.deepEqual(sans.ecritures[0].patch.taches.map((t) => t.id), ['tm2', 'tm3']);
    assert.deepEqual(sans.ecritures[0].signer, ['modifiePar']);
  });
  test('B30 monter / descendre une tâche type dans sa phase ; au bord, rien', () => {
    const m = modele({ taches: [
      { id: 'a', titre: 'A', phase: 'livraison', delaiJours: null, ordre: 1 }, { id: 'b', titre: 'B', phase: 'livraison', delaiJours: null, ordre: 2 },
      { id: 'c', titre: 'C', phase: 'livraison', delaiJours: null, ordre: 3 }, { id: 'z', titre: 'Z', phase: 'lancement', delaiJours: null, ordre: 1 },
    ] });
    const r = P.planDeplacerTacheModele({ modele: m, tacheId: 'c', sens: -1 });
    assert.deepEqual(P.tachesDuModele({ taches: r.ecritures[0].patch.taches }).map((t) => t.id), ['z', 'a', 'c', 'b']);
    assert.deepEqual(P.planDeplacerTacheModele({ modele: m, tacheId: 'a', sens: -1 }).ecritures, []);
    assert.deepEqual(P.planDeplacerTacheModele({ modele: m, tacheId: 'c', sens: 1 }).ecritures, []);
    assert.deepEqual(P.planDeplacerTacheModele({ modele: m, tacheId: 'z', sens: 1 }).ecritures, [], 'seule dans sa phase');
    assert.deepEqual(P.tachesModeleParPhase(m).map((g) => g.taches.length), [1, 0, 3, 0]);
  });
  test('B30 supprimer un modèle : une suppression, rien d’autre', () => {
    assert.deepEqual(P.planSupprimerModele('m1').ecritures.map((e) => `${e.type}:${e.collection}/${e.id}`), ['supprimer:projets_modeles/m1']);
  });
  test('B30 le modèle proposé pour une offre : le premier modèle actif qui y est lié, sinon aucun', () => {
    const modeles = [modele({ id: 'inactif', offreId: 'audit', actif: false, ordre: 1 }), modele({ id: 'b', offreId: 'audit', ordre: 3 }), modele({ id: 'a', offreId: 'audit', ordre: 2 }), modele({ id: 'x', offreId: 'autre', ordre: 1 })];
    assert.equal(P.modeleParOffre(modeles, 'audit').id, 'a');
    assert.equal(P.modeleParOffre(modeles, 'inconnue'), null);
    assert.equal(P.modeleParOffre(modeles, null), null);
    assert.deepEqual(P.modelesActifs(modeles).map((m) => m.id), ['x', 'a', 'b']);
  });
  test('B30 créer un projet depuis un modèle : ses tâches, dates = début + délai, ordre par phase, nature et modeleId du modèle', () => {
    const m = P.MODELES_DEPART.find((x) => x.id === 'extraction');
    const plan = P.planCreerProjet({ titre: 'Extraction Carrel', dateDebut: '2026-10-20' }, c(), { modele: m });
    const projetDoc = plan.ecritures.find((e) => e.collection === 'projets_projets').donnees;
    assert.deepEqual([projetDoc.modeleId, projetDoc.nature, projetDoc.dateDebut], ['extraction', 'extraction', '2026-10-20']);
    const taches = plan.ecritures.filter((e) => e.collection === 'projets_taches').map((e) => e.donnees);
    assert.deepEqual(taches.map((t) => [t.titre, t.phase, t.ordre, t.date]), [
      ['Tirer les règles', 'decouverte', 1, '2026-10-27'], ['Comprendre les erreurs', 'decouverte', 2, '2026-10-27'],
      ['Repérer ce qui est automatisable', 'livraison', 1, '2026-10-27'], ['Créer la documentation marketing', 'livraison', 2, '2026-10-27'],
    ]);
    assert.ok(taches.every((t) => t.projetId === plan.id && t.fait === false && t.assigneA === 'jerome'));
    assert.equal(new Set(plan.ecritures.map((e) => `${e.collection}/${e.id}`)).size, plan.ecritures.length, 'chaque document apparaît une seule fois');
  });
  test('B30 depuis un modèle sans délai : pas de date ; sans modèle : un projet vide comme avant', () => {
    const audit = P.planCreerProjet({ titre: 'Audit' }, c(), { modele: P.MODELES_DEPART[0] });
    assert.deepEqual(audit.ecritures.filter((e) => e.collection === 'projets_taches').map((e) => e.donnees.date), [null, null, null]);
    assert.equal(audit.ecritures.find((e) => e.collection === 'projets_projets').donnees.nature, 'livraison');
    const vide = P.planCreerProjet({ titre: 'Chantier' }, c());
    assert.deepEqual(vide.ecritures.map((e) => e.collection), ['projets_projets', 'crm_evenements']);
    assert.equal(vide.ecritures[0].donnees.modeleId, null);
  });
  test('B30 depuis une affaire gagnée : le modèle ajoute ses tâches dans le même plan, l’affaire reçoit toujours son projetId', () => {
    const affaire = { ...L.nouvelleAffaire({ titre: 'Audit des Lilas', etape: 'gagne', offreId: 'audit' }, c()), id: 'a1' };
    const plan = P.planCreerProjetDepuisAffaire({ affaire, modele: P.MODELES_DEPART[0] }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual(plan.ecritures.map((e) => `${e.type}:${e.collection}`), ['creer:projets_projets', 'creer:projets_taches', 'creer:projets_taches', 'creer:projets_taches', 'modifier:crm_affaires', 'creer:crm_evenements']);
    assert.equal(plan.ecritures[0].donnees.modeleId, 'audit');
    assert.equal(plan.ecritures.filter((e) => e.collection === 'projets_taches').every((e) => e.donnees.projetId === plan.id), true);
    const refus = P.planCreerProjetDepuisAffaire({ affaire: { ...affaire, statut: 'perdue' }, modele: P.MODELES_DEPART[0] }, c());
    assert.deepEqual(refus.ecritures, [], 'refusé : aucune tâche non plus');
  });
  test('B30 de bout en bout sur des données : créer un modèle, y ajouter des tâches, créer un projet, supprimer le projet : tâches supprimées, modèle intact', () => {
    let base = {};
    const cx = c();
    const pm = P.planCreerModele({ valeurs: { nom: 'Atelier' }, modeles: [] }, cx);
    base = exec(base, pm);
    base = exec(base, P.planAjouterTacheModele({ modele: base.projets_modeles[0], valeurs: { titre: 'Préparer', phase: 'lancement', delaiJours: 2 } }, cx));
    const pp = P.planCreerProjet({ titre: 'Atelier IA', dateDebut: '2026-11-01' }, cx, { modele: base.projets_modeles[0] });
    base = exec(base, pp);
    assert.equal(base.projets_taches[0].date, '2026-11-03');
    base = exec(base, P.planSupprimerProjet({ projet: base.projets_projets[0], taches: base.projets_taches }));
    assert.deepEqual([base.projets_projets.length, base.projets_taches.length, base.projets_modeles.length], [0, 0, 1]);
  });
});

describe('B31 Extraction de valeur : création automatique', () => {
  const c = (iso = '2026-10-20T09:00:00Z') => ctx(iso);
  const affaire = (extra = {}) => ({
    ...L.nouvelleAffaire({ titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', offreId: 'audit', urlGithub: 'https://github.com/jeromechevalier-wq/client-lilas', urlDossier: 'https://drive.google.com/drive/folders/abc' }, c('2026-10-01T08:00:00Z')),
    id: 'a1', ...extra,
  });
  const extractions = (ecritures) => ecritures.filter((e) => e.collection === 'projets_projets' && e.type === 'creer').map((e) => e.donnees);
  const exec = (base, plan) => executer(base, plan.ecritures, { maintenant: c().maintenant });

  test('B31 affaire perdue : un projet d’extraction, avec la raison de la perte, le dossier et le dépôt de l’affaire, les quatre tâches à J + 7', () => {
    const plan = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: 'Prix', detail: ' Trop cher pour eux ' } }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.patch.statut, 'perdue');
    assert.equal(plan.extraction.titre, 'Extraction : Audit des Lilas');
    const [e] = extractions(plan.ecritures);
    assert.deepEqual([e.nature, e.affaireId, e.projetSourceId, e.phase, e.statut, e.modeleId], ['extraction', 'a1', null, 'lancement', 'actif', 'extraction']);
    assert.deepEqual([e.personneId, e.organisationId, e.offreId], ['p1', 'o1', 'audit']);
    assert.deepEqual([e.urlGithub, e.urlDossier], ['https://github.com/jeromechevalier-wq/client-lilas', 'https://drive.google.com/drive/folders/abc']);
    assert.deepEqual([e.raisonPerdue, e.raisonPerdueDetail], ['Prix', 'Trop cher pour eux']);
    const taches = plan.ecritures.filter((x) => x.collection === 'projets_taches').map((x) => x.donnees);
    assert.deepEqual(taches.map((t) => [t.titre, t.phase, t.date]), [
      ['Tirer les règles', 'decouverte', '2026-10-27'], ['Comprendre les erreurs', 'decouverte', '2026-10-27'],
      ['Repérer ce qui est automatisable', 'livraison', '2026-10-27'], ['Créer la documentation marketing', 'livraison', '2026-10-27'],
    ]);
    assert.ok(taches.every((t) => t.projetId === plan.extraction.id));
    // l'affaire est marquée perdue comme avant, et rien d'autre n'est touché
    assert.deepEqual(plan.ecritures.filter((x) => x.collection === 'crm_affaires').map((x) => x.id), ['a1']);
    assert.equal(new Set(plan.ecritures.map((x) => `${x.collection}/${x.id}`)).size, plan.ecritures.length);
    const ev = plan.ecritures.find((x) => x.collection === 'crm_evenements' && x.donnees.type === 'projet_cree').donnees;
    assert.deepEqual([ev.projetId, ev.affaireId], [plan.extraction.id, 'a1'], 'l’événement est aussi dans le fil de l’affaire');
  });
  test('B31 perdue sans raison : refusée comme avant, aucune extraction ; une seconde fois : pas de seconde extraction', () => {
    const refus = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: '' } }, c());
    assert.deepEqual([Object.keys(refus.erreurs), refus.ecritures, refus.extraction], [['raison'], [], null]);
    const premiere = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: 'Prix' } }, c());
    const base = exec({ crm_affaires: [affaire()], projets_projets: [] }, premiere);
    const deuxieme = P.planMarquerPerdueAvecExtraction({ affaire: base.crm_affaires[0], saisie: { raison: 'Concurrent' }, projets: base.projets_projets }, c());
    assert.equal(deuxieme.extraction, null);
    assert.equal(extractions(deuxieme.ecritures).length, 0);
    assert.equal(deuxieme.patch.raisonPerdue, 'Concurrent', 'la perte, elle, est bien enregistrée');
  });
  test('B31 affaire gagnée sans projet : extraction à Gagné ; les anciennes étapes « Facture envoyée / payée » n’existent plus : refusées, rien ne se crée', () => {
    for (const etape of ['gagne']) {
      const plan = P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'proposition_envoyee', statut: 'ouverte' }), etape }, c());
      assert.deepEqual(plan.erreurs, {}, etape);
      assert.equal(extractions(plan.ecritures).length, 1, etape);
      assert.equal(extractions(plan.ecritures)[0].affaireId, 'a1');
      assert.equal(plan.extraction.titre, 'Extraction : Audit des Lilas');
    }
    for (const retiree of ['facture_envoyee', 'facture_payee']) {
      const plan = P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'proposition_envoyee', statut: 'ouverte' }), etape: retiree }, c());
      assert.ok(plan.erreurs.etape, retiree);
      assert.equal(extractions(plan.ecritures).length, 0, retiree);
    }
  });
  test('B31 pas d’extraction : étape qui ne gagne rien, étape inconnue, passage entre étapes déjà gagnées, affaire qui a déjà un projet, extraction déjà là', () => {
    const rien = (plan) => { assert.equal(plan.extraction, null); assert.equal(extractions(plan.ecritures).length, 0); };
    rien(P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'premier_contact', statut: 'ouverte' }), etape: 'rdv_fixe' }, c()));
    const inconnue = P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'rdv_fixe', statut: 'ouverte' }), etape: 'nimporte' }, c());
    assert.ok(inconnue.erreurs.etape); rien(inconnue);
    rien(P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'gagne', statut: 'gagnee' }), etape: 'gagne' }, c()));
    rien(P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'rdv_fixe', statut: 'ouverte' }), etape: 'gagne', projets: [projet({ id: 'pr1', affaireId: 'a1' })] }, c()));
    rien(P.planChangerEtapeAvecExtraction({ affaire: affaire({ etape: 'rdv_fixe', statut: 'ouverte' }), etape: 'gagne', projets: [projet({ id: 'ex', nature: 'extraction', affaireId: 'a1' })] }, c()));
  });
  test('B31 une affaire perdue qui est rouverte puis gagnée : l’extraction faite à Perdu suffit, pas de seconde', () => {
    let base = { crm_affaires: [affaire({ etape: 'rdv_fixe', statut: 'ouverte' })], projets_projets: [] };
    base = exec(base, P.planMarquerPerdueAvecExtraction({ affaire: base.crm_affaires[0], saisie: { raison: 'Prix' }, projets: base.projets_projets }, c()));
    assert.equal(base.projets_projets.length, 1);
    base = exec(base, L.planRouvrirAffaire(base.crm_affaires[0], c()));
    const gagne = P.planChangerEtapeAvecExtraction({ affaire: base.crm_affaires[0], etape: 'gagne', projets: base.projets_projets }, c());
    assert.equal(gagne.extraction, null);
    base = exec(base, gagne);
    assert.deepEqual([base.projets_projets.length, base.crm_affaires[0].statut], [1, 'gagnee']);
  });
  test('B31 projet terminé : un projet d’extraction pour ce projet (avec ou sans affaire), qui reprend son dossier et son dépôt', () => {
    const p = projet({ id: 'pr1', titre: 'Site vitrine', personneId: 'p1', organisationId: 'o1', affaireId: 'a1', urlGithub: 'https://github.com/jeromechevalier-wq/site', urlDossier: 'https://drive.google.com/drive/folders/xyz', phase: 'livraison' });
    for (const source of [p, { ...p, affaireId: null }]) {
      const plan = P.planTerminerProjetAvecExtraction({ projet: source }, c());
      assert.equal(plan.patch.statut, 'termine');
      const [e] = extractions(plan.ecritures);
      assert.deepEqual([e.nature, e.projetSourceId, e.affaireId, e.titre], ['extraction', 'pr1', null, 'Extraction : Site vitrine']);
      assert.deepEqual([e.urlGithub, e.urlDossier, e.personneId, e.organisationId], ['https://github.com/jeromechevalier-wq/site', 'https://drive.google.com/drive/folders/xyz', 'p1', 'o1']);
      assert.equal(e.raisonPerdue, undefined);
      assert.equal(plan.ecritures.filter((x) => x.collection === 'projets_taches').length, 4);
      assert.deepEqual(plan.ecritures.filter((x) => x.collection === 'projets_projets' && x.type === 'modifier').map((x) => x.id), ['pr1']);
    }
  });
  test('B31 jamais de boucle : terminer un projet d’extraction ne crée rien ; terminer deux fois ou rouvrir puis terminer ne crée qu’une extraction', () => {
    const ext = projet({ id: 'ex1', nature: 'extraction', projetSourceId: 'pr1', phase: 'livraison' });
    const fin = P.planTerminerProjetAvecExtraction({ projet: ext }, c());
    assert.deepEqual([fin.patch.statut, fin.extraction, extractions(fin.ecritures).length], ['termine', null, 0]);
    const deja = P.planTerminerProjetAvecExtraction({ projet: projet({ id: 'pr1', statut: 'termine', archive: true }) }, c());
    assert.deepEqual([deja.ecritures, deja.extraction], [[], null]);
    let base = { projets_projets: [projet({ id: 'pr1', phase: 'livraison' })] };
    base = exec(base, P.planTerminerProjetAvecExtraction({ projet: base.projets_projets[0], projets: base.projets_projets }, c()));
    assert.equal(base.projets_projets.length, 2);
    base = exec(base, P.planRouvrirProjet(base.projets_projets[0], c()));
    const encore = P.planTerminerProjetAvecExtraction({ projet: base.projets_projets[0], projets: base.projets_projets }, c());
    assert.equal(encore.patch.statut, 'termine');
    assert.equal(encore.extraction, null, 'une seule extraction par projet');
    base = exec(base, encore);
    assert.equal(base.projets_projets.length, 2);
  });
  test('B31 le modèle d’extraction de la base fait foi, la copie livrée avec l’appli sert de repli', () => {
    const personnalise = { id: 'extraction', nom: 'Extraction', nature: 'extraction', actif: false, ordre: 3, taches: [{ id: 'x1', titre: 'Une seule leçon', phase: 'cloture', delaiJours: 2, ordre: 1 }] };
    const avec = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: 'Prix' }, modeles: [personnalise] }, c());
    assert.deepEqual(avec.ecritures.filter((x) => x.collection === 'projets_taches').map((x) => [x.donnees.titre, x.donnees.phase, x.donnees.date]), [['Une seule leçon', 'cloture', '2026-10-22']]);
    assert.equal(P.modeleExtraction([]).id, 'extraction');
    assert.equal(P.modeleExtraction([{ id: 'autre', nom: 'Mon extraction', nature: 'extraction', actif: true, taches: [] }]).id, 'autre');
    assert.equal(P.modeleExtraction([{ id: 'livraison', nom: 'x', nature: 'livraison', actif: true }]).id, 'extraction', 'un modèle de livraison n’est pas pris');
    const sans = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: 'Prix' }, modeles: [] }, c());
    assert.equal(sans.ecritures.filter((x) => x.collection === 'projets_taches').length, 4, 'sans modèle en base : la copie livrée avec l’appli');
    const natureForcee = P.planMarquerPerdueAvecExtraction({ affaire: affaire(), saisie: { raison: 'Prix' }, modeles: [{ ...personnalise, nature: 'livraison' }] }, c());
    assert.equal(extractions(natureForcee.ecritures)[0].nature, 'extraction', 'toujours un projet d’extraction');
  });
  test('B31 l’extraction n’est jamais « le projet de l’affaire » : elle ne bloque pas la création ni la liaison d’un vrai projet, et n’est pas proposée à lier', () => {
    const ext = projet({ id: 'ex', nature: 'extraction', affaireId: 'a1' });
    assert.equal(P.projetDeAffaire([ext], 'a1'), null);
    assert.equal(P.projetLieAAffaire([ext], affaire({ etape: 'gagne', statut: 'gagnee' })), null);
    assert.deepEqual(P.validerLienAffaire({ affaire: affaire({ etape: 'gagne', statut: 'gagnee' }), projets: [ext] }), {});
    assert.equal(P.extractionDeLAffaire([ext], 'a1').id, 'ex');
    assert.equal(P.extractionDuProjet([projet({ id: 'e2', nature: 'extraction', projetSourceId: 'pr1' })], 'pr1').id, 'e2');
    assert.deepEqual(P.projetsLiables([ext, projet({ id: 'e3', nature: 'extraction' }), projet({ id: 'ok' })]).map((p) => p.id), ['ok']);
  });
  test('B31 un projet créé ou lié pour une affaire qui a son extraction (faite à Gagné) : l’extraction est rangée tant que rien n’y a été fait', () => {
    const gagnee = affaire({ etape: 'gagne', statut: 'gagnee' });
    const ext = projet({ id: 'ex', titre: 'Extraction : Audit des Lilas', nature: 'extraction', affaireId: 'a1' });
    const rangee = (plan) => plan.ecritures.filter((x) => x.collection === 'projets_projets' && x.type === 'modifier' && x.id === 'ex');
    const creation = P.planCreerProjetDepuisAffaire({ affaire: gagnee, projets: [ext], taches: [{ projetId: 'ex', fait: false }] }, c());
    assert.deepEqual(creation.erreurs, {});
    assert.deepEqual(rangee(creation).map((x) => x.patch), [{ archive: true }]);
    assert.equal(creation.ecritures.find((x) => x.collection === 'crm_evenements' && x.donnees.type === 'extraction_rangee').donnees.projetId, 'ex');
    const liaison = P.planLierProjet({ affaire: gagnee, projet: projet({ id: 'libre' }), projets: [ext], taches: [] }, c());
    assert.deepEqual(rangee(liaison).map((x) => x.patch), [{ archive: true }]);
    // elle a avancé : elle reste vivante ; déjà rangée ou absente : rien
    assert.deepEqual(rangee(P.planCreerProjetDepuisAffaire({ affaire: gagnee, projets: [ext], taches: [{ projetId: 'ex', fait: true }] }, c())), []);
    assert.deepEqual(rangee(P.planCreerProjetDepuisAffaire({ affaire: gagnee, projets: [{ ...ext, archive: true }], taches: [] }, c())), []);
    assert.deepEqual(rangee(P.planCreerProjetDepuisAffaire({ affaire: gagnee, projets: [], taches: [] }, c())), []);
    assert.deepEqual(rangee(P.planCreerProjetDepuisAffaire({ affaire: gagnee, projets: [{ ...ext, affaireId: 'autre' }], taches: [] }, c())), [], 'l’extraction d’une autre affaire n’est pas touchée');
  });
  test('B31 de bout en bout : gagnée sans projet → extraction ; projet créé → extraction rangée ; fin du projet → la vraie extraction ; supprimer l’affaire garde tout', () => {
    const cx = c();
    let base = { crm_affaires: [affaire({ etape: 'rdv_fixe', statut: 'ouverte' })], projets_projets: [], projets_taches: [] };
    base = exec(base, P.planChangerEtapeAvecExtraction({ affaire: base.crm_affaires[0], etape: 'gagne', projets: base.projets_projets }, cx));
    assert.deepEqual(base.projets_projets.map((p) => [p.nature, p.archive]), [['extraction', false]]);
    assert.equal(base.crm_affaires[0].projetId, null, 'l’extraction n’est pas le projet de l’affaire');
    base = exec(base, P.planCreerProjetDepuisAffaire({ affaire: base.crm_affaires[0], projets: base.projets_projets, taches: base.projets_taches }, cx));
    assert.deepEqual(base.projets_projets.map((p) => [p.nature, p.archive]), [['extraction', true], ['livraison', false]]);
    const livraison = base.projets_projets.find((p) => p.nature === 'livraison');
    assert.equal(base.crm_affaires[0].projetId, livraison.id);
    base = exec(base, P.planTerminerProjetAvecExtraction({ projet: livraison, projets: base.projets_projets }, cx));
    const vives = base.projets_projets.filter((p) => p.nature === 'extraction' && !p.archive);
    assert.equal(vives.length, 1, 'un seul projet d’extraction vivant');
    assert.equal(vives[0].projetSourceId, livraison.id);
    // supprimer l'affaire : les projets restent, leur lien vers elle est vidé
    const liens = (base.crm_evenements || []).map((d) => ({ collection: 'crm_evenements', id: d.id, affaireId: d.affaireId ?? null, projetId: d.projetId ?? null, personneId: d.personneId ?? null, organisationId: d.organisationId ?? null }));
    const sup = L.planSupprimerAffaire({ affaireId: 'a1', liens, projets: base.projets_projets.filter((p) => p.affaireId === 'a1') });
    base = exec(base, sup);
    assert.equal(base.projets_projets.length, 3);
    assert.ok(base.projets_projets.every((p) => p.affaireId !== 'a1'));
  });
});

describe('B32 Extraction déclenchée à la main', () => {
  const c = () => ctx('2026-10-20T09:00:00Z');
  const pr = (extra = {}) => projet({ id: 'pr1', titre: 'Site vitrine', personneId: 'p1', affaireId: 'a1', urlGithub: 'https://github.com/jeromechevalier-wq/site', urlDossier: 'https://drive.google.com/drive/folders/xyz', phase: 'livraison', ...extra });

  test('B32 extraire un projet en cours : un projet d’extraction avec ses quatre tâches, le projet lui-même n’est pas touché', () => {
    const plan = P.planExtraireProjet({ projet: pr() }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.dejaExistante, false);
    const crees = plan.ecritures.filter((e) => e.collection === 'projets_projets' && e.type === 'creer');
    assert.equal(crees.length, 1);
    assert.deepEqual([crees[0].donnees.nature, crees[0].donnees.projetSourceId, crees[0].donnees.titre, crees[0].donnees.affaireId], ['extraction', 'pr1', 'Extraction : Site vitrine', null]);
    assert.equal(crees[0].donnees.urlDossier, 'https://drive.google.com/drive/folders/xyz');
    assert.equal(plan.ecritures.filter((e) => e.collection === 'projets_taches').length, 4);
    assert.equal(plan.ecritures.some((e) => e.collection === 'projets_projets' && e.id === 'pr1'), false);
    assert.deepEqual(plan.extraction, { id: crees[0].id, titre: 'Extraction : Site vitrine' });
  });
  test('B32 une seule extraction par projet : si elle existe, rien n’est créé et on rend celle qui existe', () => {
    const base = executer({ projets_projets: [pr()], projets_taches: [] }, P.planExtraireProjet({ projet: pr() }, c()).ecritures, { maintenant: c().maintenant });
    const encore = P.planExtraireProjet({ projet: pr(), projets: base.projets_projets }, c());
    assert.deepEqual([encore.ecritures.length, encore.dejaExistante, encore.extraction.id], [0, true, base.projets_projets.find((p) => p.nature === 'extraction').id]);
  });
  test('B32 « Terminer » après une extraction manuelle ne crée pas de seconde extraction', () => {
    const base = executer({ projets_projets: [pr()], projets_taches: [] }, P.planExtraireProjet({ projet: pr() }, c()).ecritures, { maintenant: c().maintenant });
    const fin = P.planTerminerProjetAvecExtraction({ projet: pr(), projets: base.projets_projets }, c());
    assert.equal(fin.extraction, null);
    assert.equal(fin.ecritures.filter((e) => e.collection === 'projets_projets' && e.type === 'creer').length, 0);
    assert.equal(fin.patch.statut, 'termine');
  });
  test('B32 un projet d’extraction ne s’extrait pas ; un projet introuvable est refusé ; un projet terminé ou archivé peut l’être', () => {
    assert.ok(P.planExtraireProjet({ projet: pr({ nature: 'extraction' }) }, c()).erreurs.projet);
    assert.ok(P.planExtraireProjet({ projet: null }, c()).erreurs.projet);
    assert.equal(P.planExtraireProjet({ projet: pr({ statut: 'termine' }) }, c()).extraction !== null, true);
    assert.equal(P.planExtraireProjet({ projet: pr({ archive: true }) }, c()).extraction !== null, true);
  });
  test('B32 le modèle d’extraction de la base fait foi', () => {
    const modeles = [{ id: 'extraction', nom: 'Extraction', nature: 'extraction', actif: true, taches: [{ id: 'x', titre: 'Seule tâche', phase: 'decouverte', delaiJours: 3 }] }];
    const plan = P.planExtraireProjet({ projet: pr(), modeles }, c());
    assert.deepEqual(plan.ecritures.filter((e) => e.collection === 'projets_taches').map((e) => e.donnees.titre), ['Seule tâche']);
  });
});

describe('B33 Factures du projet (2.2) : liste, paiements partiels, blocage de la Clôture, sortie « impayé »', () => {
  const c = (iso = '2026-10-20T09:00:00Z') => ctx(iso);
  const exec = (base, plan) => executer(base, plan.ecritures, { maintenant: c().maintenant });
  /** Applique un plan sur le projet en mémoire (le patch seulement) et rend le projet à jour. */
  const appliquer = (p, plan) => ({ ...p, ...plan.patch });
  const avec = (...factures) => ({ ...projet(), factures });
  const f = (extra = {}) => ({ id: 'f1', libelle: '', montant: 300, dateEnvoi: null, datePaiement: null, statut: 'a_payer', ...extra });

  test('B33 un nouveau projet a une liste de factures vide ; un ancien projet sans le champ est lu comme vide', () => {
    assert.deepEqual(projet().factures, []);
    assert.deepEqual(P.facturesDe({ titre: 'Ancien' }), []);
    assert.equal(P.blocageCloture({ titre: 'Ancien' }), null);
  });
  test('B33 validation : montant > 0 obligatoire (virgule acceptée), dates au bon format, paiement jamais avant l’envoi', () => {
    assert.ok(P.validerFacture({}).montant);
    assert.ok(P.validerFacture({ montant: 0 }).montant);
    assert.ok(P.validerFacture({ montant: -5 }).montant);
    assert.ok(P.validerFacture({ montant: 'abc' }).montant);
    assert.ok(P.validerFacture({ montant: 99_999_999 }).montant);
    assert.deepEqual(P.validerFacture({ montant: '1 200,50' }), {});
    assert.ok(P.validerFacture({ montant: 10, dateEnvoi: '12/10/2026' }).dateEnvoi);
    assert.ok(P.validerFacture({ montant: 10, datePaiement: '2026-13-45' }).datePaiement);
    assert.ok(P.validerFacture({ montant: 10, dateEnvoi: '2026-10-10', datePaiement: '2026-10-01' }).datePaiement);
  });
  test('B33 ajouter une facture : À payer, montant arrondi au centime, un événement ; refus sans montant', () => {
    const plan = P.planAjouterFacture(projet(), { libelle: ' Acompte 30 % ', montant: '300,456', dateEnvoi: '2026-10-15' }, c());
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual(plan.facture, { id: 'factures_1', libelle: 'Acompte 30 %', montant: 300.46, dateEnvoi: '2026-10-15', datePaiement: null, statut: 'a_payer' });
    assert.deepEqual(plan.evenements.map((e) => e.type), ['facture_ajoutee']);
    assert.deepEqual(cles(plan.ecritures).filter((k) => k.includes('projets_projets')), ['modifier:projets_projets/pr1']);
    const refus = P.planAjouterFacture(projet(), { libelle: 'x' }, c());
    assert.ok(refus.erreurs.montant);
    assert.deepEqual(refus.ecritures, []);
  });
  test('B33 une facture ajoutée déjà payée : statut Payée et encaissement dans le fil', () => {
    const plan = P.planAjouterFacture(projet(), { montant: 500, datePaiement: '2026-10-03' }, c());
    assert.equal(plan.facture.statut, 'payee');
    assert.deepEqual(plan.evenements.map((e) => e.type), ['facture_ajoutee', 'encaissement']);
  });
  test('B33 30 % + 30 % + 40 % : trois factures, des paiements successifs, totaux justes à chaque étape', () => {
    let p = projet();
    const cx = c(); // un seul contexte : les identifiants des factures se suivent (comme en vrai)
    for (const [lib, m] of [['Acompte 30 %', 300], ['En cours 30 %', 300], ['Solde 40 %', 400]]) p = appliquer(p, P.planAjouterFacture(p, { libelle: lib, montant: m }, cx));
    assert.deepEqual(P.totauxFactures(p), { facture: 1000, paye: 0, aPayer: 1000, abandonne: 0 });
    p = appliquer(p, P.planMarquerFacturePayee(p, p.factures[0].id, { datePaiement: '2026-10-05' }, c()));
    assert.deepEqual(P.totauxFactures(p), { facture: 1000, paye: 300, aPayer: 700, abandonne: 0 });
    p = appliquer(p, P.planMarquerFacturePayee(p, p.factures[1].id, {}, c('2026-11-02T10:00:00Z')));
    assert.equal(p.factures[1].datePaiement, '2026-11-02');
    assert.deepEqual(P.totauxFactures(p), { facture: 1000, paye: 600, aPayer: 400, abandonne: 0 });
    assert.equal(P.facturesAPayer(p).length, 1);
  });
  test('B33 marquer payée : date du jour par défaut, montant corrigé si le client a payé autre chose, un encaissement ; deux fois = sans effet', () => {
    const p = avec(f({ dateEnvoi: '2026-10-10' }));
    const plan = P.planMarquerFacturePayee(p, 'f1', { montant: 280 }, c());
    assert.deepEqual([plan.facture.statut, plan.facture.montant, plan.facture.datePaiement], ['payee', 280, '2026-10-20']);
    assert.deepEqual(plan.evenements.map((e) => e.type), ['encaissement']);
    assert.match(plan.evenements[0].texte, /280/);
    const deja = P.planMarquerFacturePayee(appliquer(p, plan), 'f1', {}, c());
    assert.deepEqual(deja.ecritures, []);
    assert.ok(P.planMarquerFacturePayee(p, 'f1', { datePaiement: '2026-10-01' }, c()).erreurs.datePaiement, 'avant l’envoi');
    assert.ok(P.planMarquerFacturePayee(p, 'nope', {}, c()).erreurs.facture);
  });
  test('B33 modifier : libellé, montant, date d’envoi ; une facture abandonnée ne se modifie pas ; sans changement, rien n’est écrit', () => {
    const p = avec(f(), f({ id: 'f2', statut: 'abandonnee', raison: 'x' }));
    const plan = P.planModifierFacture(p, 'f1', { libelle: 'Solde', montant: '450' }, c());
    assert.deepEqual([plan.facture.libelle, plan.facture.montant], ['Solde', 450]);
    assert.deepEqual(P.planModifierFacture(p, 'f1', { montant: 300 }, c()).ecritures, []);
    assert.ok(P.planModifierFacture(p, 'f1', { montant: 0 }, c()).erreurs.montant);
    assert.ok(P.planModifierFacture(p, 'f2', { montant: 10 }, c()).erreurs.facture);
  });
  test('B33 la Clôture est bloquée tant qu’une facture est À payer : « Terminer » et le passage en phase Clôture, avec le message qui nomme les factures', () => {
    const p = avec(f({ libelle: 'Solde 40 %', montant: 400 }), f({ id: 'f2', statut: 'payee', datePaiement: '2026-10-01' }));
    const fin = P.planTerminerProjet(p, c());
    assert.deepEqual(fin.ecritures, []);
    assert.match(fin.erreurs.factures, /Clôture bloquée.*Solde 40 %.*400/);
    assert.deepEqual(fin.facturesBloquantes.map((x) => x.id), ['f1']);
    const phase = P.planChangerPhase(p, 'cloture', c());
    assert.deepEqual(phase.ecritures, []);
    assert.ok(phase.erreurs.factures);
    assert.deepEqual(P.planChangerPhase(p, 'livraison', c()).erreurs, {}, 'les autres phases ne sont pas bloquées');
  });
  test('B33 pas de facture, ou toutes réglées : « Terminer » comme avant (projet interne, extraction, tout payé, tout abandonné)', () => {
    for (const p of [projet(), avec(f({ statut: 'payee', datePaiement: '2026-10-02' })), avec(f({ statut: 'abandonnee', raison: 'x' }))]) {
      const fin = P.planTerminerProjet(p, c());
      assert.deepEqual(fin.erreurs, {});
      assert.equal(fin.patch.statut, 'termine');
    }
  });
  test('B33 sortie « clôturer avec impayé » : chaque facture restante passe à Abandonnée avec la raison, les payées ne bougent pas, le projet se termine', () => {
    const p = avec(f({ id: 'f1', libelle: 'Solde', montant: 400 }), f({ id: 'f2', statut: 'payee', datePaiement: '2026-10-01', montant: 300 }), f({ id: 'f3', montant: 100 }));
    const fin = P.planTerminerProjet(p, c(), { impaye: { raison: ' Client injoignable ' } });
    assert.deepEqual(fin.erreurs, {});
    assert.deepEqual(fin.patch.factures.map((x) => x.statut), ['abandonnee', 'payee', 'abandonnee']);
    assert.equal(fin.patch.factures[0].raison, 'Client injoignable');
    assert.equal(fin.patch.factures[1].datePaiement, '2026-10-01');
    assert.equal(fin.patch.statut, 'termine');
    assert.deepEqual(fin.evenements.map((e) => e.type), ['facture_abandonnee', 'facture_abandonnee', 'projet_termine']);
    assert.ok(P.aUnImpaye({ ...p, ...fin.patch }));
    assert.deepEqual(P.totauxFactures({ ...p, ...fin.patch }), { facture: 300, paye: 300, aPayer: 0, abandonne: 500 });
    // la raison est obligatoire
    const sans = P.planTerminerProjet(p, c(), { impaye: { raison: '  ' } });
    assert.ok(sans.erreurs.raison);
    assert.deepEqual(sans.ecritures, []);
  });
  test('B33 l’extraction suit : un projet bloqué n’en crée pas ; clôturé avec impayé, il en crée une, une seule', () => {
    const p = avec(f());
    const bloque = P.planTerminerProjetAvecExtraction({ projet: p }, c());
    assert.equal(bloque.extraction, null);
    assert.deepEqual(bloque.ecritures, []);
    assert.ok(bloque.erreurs.factures);
    const sortie = P.planTerminerProjetAvecExtraction({ projet: p, impaye: { raison: 'Faillite' } }, c());
    assert.equal(sortie.extraction.titre, 'Extraction : Audit Carrel');
    assert.equal(sortie.ecritures.filter((e) => e.collection === 'projets_projets' && e.type === 'creer').length, 1);
  });
  test('B33 abandonner une facture à la main : raison obligatoire, une payée ne s’abandonne pas ; la remettre à payer efface la raison', () => {
    const p = avec(f(), f({ id: 'f2', statut: 'payee', datePaiement: '2026-10-01' }));
    assert.ok(P.planAbandonnerFacture(p, 'f1', ' ', c()).erreurs.raison);
    assert.ok(P.planAbandonnerFacture(p, 'f2', 'x', c()).erreurs.facture);
    const ab = appliquer(p, P.planAbandonnerFacture(p, 'f1', 'Geste commercial', c()));
    assert.deepEqual([ab.factures[0].statut, ab.factures[0].raison], ['abandonnee', 'Geste commercial']);
    assert.equal(P.facturesAPayer(ab).length, 0, 'plus rien ne bloque');
    const retour = appliquer(ab, P.planRemettreFactureAPayer(ab, 'f1', c()));
    assert.deepEqual([retour.factures[0].statut, retour.factures[0].raison, retour.factures[0].datePaiement], ['a_payer', undefined, null]);
    const payeeAnnulee = appliquer(p, P.planRemettreFactureAPayer(p, 'f2', c()));
    assert.deepEqual([payeeAnnulee.factures[1].statut, payeeAnnulee.factures[1].datePaiement], ['a_payer', null]);
  });
  test('B33 rouvrir un projet clôturé avec impayé : possible, le client finit par payer, on reclôture sans blocage', () => {
    const p = avec(f({ montant: 400 }));
    let cl = appliquer(p, P.planTerminerProjet(p, c(), { impaye: { raison: 'Retard' } }));
    assert.equal(cl.statut, 'termine');
    cl = appliquer(cl, P.planRouvrirProjet(cl, c()));
    assert.equal(cl.statut, 'actif');
    cl = appliquer(cl, P.planRemettreFactureAPayer(cl, 'f1', c()));
    cl = appliquer(cl, P.planMarquerFacturePayee(cl, 'f1', {}, c('2026-12-01T10:00:00Z')));
    const fin = P.planTerminerProjet(cl, c('2026-12-01T10:00:00Z'));
    assert.deepEqual(fin.erreurs, {});
    assert.equal(P.aUnImpaye({ ...cl, ...fin.patch }), false);
  });
  test('B33 supprimer une facture : elle sort de la liste, un événement', () => {
    const p = avec(f(), f({ id: 'f2' }));
    const plan = P.planSupprimerFacture(p, 'f1', c());
    assert.deepEqual(plan.patch.factures.map((x) => x.id), ['f2']);
    assert.deepEqual(plan.evenements.map((e) => e.type), ['facture_supprimee']);
  });
  test('B33 de bout en bout sur la base : les factures sont écrites avec le projet, le fil garde les encaissements, l’audit les couvre', () => {
    let base = { projets_projets: [projet()], projets_taches: [] };
    base = exec(base, P.planAjouterFacture(base.projets_projets[0], { libelle: 'Acompte', montant: 300 }, c()));
    base = exec(base, P.planMarquerFacturePayee(base.projets_projets[0], 'factures_1', { datePaiement: '2026-10-05' }, c()));
    assert.deepEqual(base.projets_projets[0].factures.map((x) => [x.statut, x.datePaiement, x.montant]), [['payee', '2026-10-05', 300]]);
    assert.deepEqual((base.crm_evenements || []).map((e) => e.type).sort(), ['encaissement', 'facture_ajoutee']);
    assert.ok((base.crm_evenements || []).every((e) => e.projetId === 'pr1'));
  });
});

describe('B34 Objectif « chiffre d’affaires encaissé » : les factures PAYÉES des projets comptent, par mois de paiement', () => {
  const projetAvec = (factures) => ({ id: 'pr1', factures });
  const fac = (extra) => ({ id: 'f', montant: 100, statut: 'payee', datePaiement: '2026-10-05', ...extra });
  test('B34 seules les factures payées comptent, dans le mois du paiement ; ni à payer ni abandonnées', () => {
    const projets = [projetAvec([fac({ montant: 300 }), fac({ montant: 200, datePaiement: '2026-11-02' }), fac({ montant: 50, statut: 'a_payer', datePaiement: null }), fac({ montant: 70, statut: 'abandonnee', datePaiement: null })])];
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires: [], projets }, '2026-10'), 300);
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires: [], projets }, '2026-11'), 200);
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires: [], projets }, '2026-09'), 0);
  });
  test('B34 les encaissements des affaires (avant migration) comptent toujours, en plus ; sans projets, comme avant', () => {
    const affaires = [{ encaissements: [{ date: new Date('2026-10-12T10:00:00Z'), montant: 500 }] }];
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires }, '2026-10'), 500);
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires, projets: [projetAvec([fac({ montant: 300 })])] }, '2026-10'), 800);
  });
  test('B34 caParMois lit aussi les projets (graphique de l’Accueil)', () => {
    const r = L.caParMois([], ['2026-09', '2026-10'], [projetAvec([fac({ montant: 300 })])]);
    assert.deepEqual(r.map((m) => m.montant), [0, 300]);
  });
});

describe('B35 Migration 2.2 : les étapes « Facture envoyée » et « Facture payée » disparaissent', () => {
  const c = (iso = '2026-10-20T09:00:00Z') => ctx(iso);
  const exec = (base, plan) => executer(base, plan.ecritures, { maintenant: c().maintenant });
  const aff = (extra = {}) => ({ ...L.nouvelleAffaire({ titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', montant: 1200 }, c('2026-09-01T08:00:00Z')), id: 'a1', ...extra });

  test('B35 une affaire « Facture payée » passe à Gagné : archivée, encaissements intacts, statut gagnée, un événement', () => {
    const payee = aff({ etape: 'facture_payee', statut: 'gagnee', archive: true, encaissements: [{ date: new Date('2026-09-20T10:00:00Z'), montant: 1200 }],
      datesEtapes: { gagne: new Date('2026-09-05T10:00:00Z'), facture_payee: new Date('2026-09-20T10:00:00Z') } });
    const plan = P.planMigrerEtapesRetirees({ affaires: [payee], projets: [] }, c());
    assert.deepEqual(plan.migrees, [{ affaireId: 'a1', titre: 'Audit des Lilas', de: 'Facture payée', facture: null }]);
    assert.deepEqual(plan.aTraiterAMain, []);
    const base = exec({ crm_affaires: [payee], projets_projets: [] }, plan);
    const apres = base.crm_affaires[0];
    assert.deepEqual([apres.etape, apres.statut, apres.archive], ['gagne', 'gagnee', true]);
    assert.equal(apres.encaissements.length, 1);
    assert.equal(apres.encaissements[0].montant, 1200);
    assert.equal(apres.datesEtapes.gagne.toISOString(), '2026-09-05T10:00:00.000Z', 'la date d’arrivée à Gagné d’origine est gardée');
    assert.deepEqual((base.crm_evenements || []).map((e) => e.type), ['etape_changee']);
    assert.match(base.crm_evenements[0].texte, /Facture payée → Gagné/);
    // le chiffre d'affaires du mois du paiement ne bouge pas
    assert.equal(L.CALCULS.ca_encaisse.calculer({ affaires: [payee] }, '2026-09'), L.CALCULS.ca_encaisse.calculer({ affaires: [apres] }, '2026-09'));
  });
  test('B35 une affaire « Facture envoyée » avec un projet : passe à Gagné et le projet reçoit une facture À payer de son montant', () => {
    const envoyee = aff({ etape: 'facture_envoyee', statut: 'gagnee', projetId: 'pr1', datesEtapes: { gagne: new Date('2026-09-05T10:00:00Z'), facture_envoyee: new Date('2026-09-18T10:00:00Z') } });
    const pr = projet({ id: 'pr1', affaireId: 'a1' });
    const plan = P.planMigrerEtapesRetirees({ affaires: [envoyee], projets: [pr] }, c());
    assert.deepEqual(plan.migrees[0].facture, { projetId: 'pr1', montant: 1200 });
    const base = exec({ crm_affaires: [envoyee], projets_projets: [pr] }, plan);
    assert.equal(base.crm_affaires[0].etape, 'gagne');
    assert.deepEqual(base.projets_projets[0].factures.map((f) => [f.statut, f.montant, f.dateEnvoi]), [['a_payer', 1200, '2026-09-18']]);
    assert.ok(P.blocageCloture(base.projets_projets[0]), 'la clôture du projet attend ce paiement');
  });
  test('B35 « Facture envoyée » sans projet, sans montant ou avec une simple extraction : passe à Gagné et est listée « à traiter à la main », aucun projet créé', () => {
    const sansProjet = aff({ id: 'a1', etape: 'facture_envoyee', statut: 'gagnee' });
    const sansMontant = aff({ id: 'a2', etape: 'facture_envoyee', statut: 'gagnee', montant: null, projetId: 'pr2' });
    const extraction = aff({ id: 'a3', etape: 'facture_envoyee', statut: 'gagnee' });
    const projets = [projet({ id: 'pr2', affaireId: 'a2' }), projet({ id: 'ex3', affaireId: 'a3', nature: 'extraction' })];
    const plan = P.planMigrerEtapesRetirees({ affaires: [sansProjet, sansMontant, extraction], projets }, c());
    assert.deepEqual(plan.aTraiterAMain.map((m) => m.affaireId), ['a1', 'a2', 'a3']);
    assert.ok(plan.aTraiterAMain.every((m) => m.raison.length > 10));
    assert.deepEqual(plan.migrees.map((m) => m.facture), [null, null, null]);
    const base = exec({ crm_affaires: [sansProjet, sansMontant, extraction], projets_projets: projets }, plan);
    assert.deepEqual(base.crm_affaires.map((a) => a.etape), ['gagne', 'gagne', 'gagne']);
    assert.equal(base.projets_projets.length, 2, 'aucun projet créé');
    assert.ok(base.projets_projets.every((p) => !(p.factures || []).length));
    assert.ok((base.crm_evenements || []).every((e) => /à suivre à la main/.test(e.texte)));
  });
  test('B35 idempotent : une fois migrées, les affaires ne sont plus concernées ; les autres affaires ne bougent pas', () => {
    const payee = aff({ id: 'a1', etape: 'facture_payee', statut: 'gagnee', archive: true });
    const ouverte = aff({ id: 'a2', etape: 'rdv_fixe', statut: 'ouverte' });
    const gagnee = aff({ id: 'a3', etape: 'gagne', statut: 'gagnee' });
    let base = { crm_affaires: [payee, ouverte, gagnee], projets_projets: [] };
    const plan = P.planMigrerEtapesRetirees({ affaires: base.crm_affaires, projets: [] }, c());
    assert.deepEqual(plan.migrees.map((m) => m.affaireId), ['a1']);
    base = exec(base, plan);
    const encore = P.planMigrerEtapesRetirees({ affaires: base.crm_affaires, projets: base.projets_projets }, c());
    assert.deepEqual([encore.migrees, encore.aTraiterAMain, encore.ecritures], [[], [], []]);
    assert.deepEqual(base.crm_affaires.map((a) => a.etape), ['gagne', 'rdv_fixe', 'gagne']);
  });
  test('B35 deux affaires « Facture envoyée » sur le même projet : les deux factures s’ajoutent, sans écraser la première', () => {
    const a = aff({ id: 'a1', etape: 'facture_envoyee', statut: 'gagnee', projetId: 'pr1', montant: 300 });
    const b = aff({ id: 'a2', etape: 'facture_envoyee', statut: 'gagnee', projetId: 'pr1', montant: 400 });
    const pr = projet({ id: 'pr1' });
    const plan = P.planMigrerEtapesRetirees({ affaires: [a, b], projets: [pr] }, c());
    const dernier = plan.ecritures.filter((e) => e.collection === 'projets_projets').at(-1);
    assert.deepEqual(dernier.patch.factures.map((f) => f.montant), [300, 400]);
  });
});
