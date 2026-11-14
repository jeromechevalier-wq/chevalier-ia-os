// Écran « Rendez-vous » : Kanban (4 colonnes), Liste (tableau) et Archives. Aucune règle métier ici : elles sont dans logique.js.
import { h, icone, remplir, ouvrirMenu, toast, lirePreference, ecrirePreference } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { fenetreFiltres, boutonFiltres as boutonFiltresCommun, controleTests } from '../crm/filtres.js';
import { enteteListe, basculeVues, barreListe } from '../crm/barre-liste.js';
import { selecteurTri, planifier, badgeTest } from '../crm/composants.js';
import * as T from '../crm/tri.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as R from './logique.js';

let criteres = R.criteresVides();
let tri = T.lireTriMemorise('rdv', lirePreference);
// Kanban et Liste sont mémorisés ; Archives n'est jamais mémorisée (on y arrive par son bouton, on en repart par Kanban ou Liste).
const vueMemorisee = () => (lirePreference('vue.rdv', 'kanban') === 'liste' ? 'liste' : 'kanban');

/** Remet à zéro les filtres mémorisés (déconnexion ou changement de compte). */
export function oublierFiltresRdv() {
  criteres = R.criteresVides();
  tri = T.triParDefaut('rdv');
}

const participantsParRdv = () => {
  const m = {};
  for (const p of D.etat.participants) (m[p.rendezVousId] ||= []).push(p);
  return m;
};

const CLES_TRI = {
  date: (r) => R.dateDuRendezVous(r),
  client: (r) => L.normaliser(r.client),
  creation: T.cleCreation,
  commune: (r) => L.normaliser(r.commune),
  reponses: (r) => D.participantsDe(r.id).filter((p) => p.etatReponse === 'comprise' || p.etatReponse === 'saisie').length,
  etat: (r) => R.ETATS.indexOf(r.etat || 'en_attente'),
};

/** Chemin de la fiche d'un rendez-vous. */
export const cheminRdv = (id) => `rdv/liste/${id}`;

function phraseEtat(r, parts) {
  const base = R.ligneEtat({ rdv: r, participants: parts, parametres: D.parametres(), messages: D.messagesDe(r.id), maintenant: new Date() });
  return r.envoiDemandeLe || r.etat === 'confirme' ? base : `Pas encore envoyé · ${base}`;
}

export function menuRdv(r) {
  return [
    { libelle: 'Ouvrir', icone: 'calendar-check', action: () => naviguer(cheminRdv(r.id)) },
    { libelle: r.archive ? 'Désarchiver' : 'Archiver', icone: r.archive ? 'archive-restore' : 'archive',
      action: async () => { try { await D.archiver(r.id, !r.archive); toast(r.archive ? 'Rendez-vous désarchivé' : 'Rendez-vous archivé'); } catch (e) { console.warn(e); toast(D.messageErreur(e, 'Action impossible'), { type: 'erreur' }); } } },
  ];
}

function carte(r, parts) {
  const menu = h('button', { type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${r.client || 'rendez-vous'}`,
    onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, menuRdv(r)); } }, icone('ellipsis', { taille: 16 }));
  const el = h('article', { class: `carte-rdv carte-affaire rdv-etat-${r.etat || 'en_attente'}`, tabindex: '0', dataset: { rdv: r.id }, 'aria-label': r.client || 'Rendez-vous',
    onclick: (e) => { if (!e.target.closest('a, button')) naviguer(cheminRdv(r.id)); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) naviguer(cheminRdv(r.id)); } },
  h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, r.client || 'Sans nom', badgeTest(r)), menu),
  r.commune ? h('span', { class: 'carte-sous' }, icone('map-pin', { taille: 12 }), r.commune) : null,
  h('span', { class: 'carte-sous carte-etat-rdv', dataset: { role: 'etat-rdv' } }, phraseEtat(r, parts)));
  return el;
}

function colonne(etatId, rdvs, parParRdv) {
  return h('section', { class: 'colonne', dataset: { colonne: etatId }, 'aria-label': R.LIBELLES_ETATS[etatId] },
    h('header', { class: 'colonne-tete' }, h('h2', {}, R.LIBELLES_ETATS[etatId]), h('span', { class: 'colonne-totaux' }, `${rdvs.length} rendez-vous`)),
    h('div', { class: 'colonne-corps' }, rdvs.map((r) => carte(r, parParRdv[r.id] || []))));
}

const nomEtat = (e) => R.LIBELLES_ETATS[e] || e;

export function rendreListeRdv(conteneur, { archives: surArchives = false } = {}) {
  let vue = surArchives ? 'archives' : vueMemorisee();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-affaires zone-rdv' });
  const zoneBascule = h('div', { class: 'zone-bascule' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });

  function majCriteres(nouveaux) { criteres = { ...R.criteresVides(), ...nouveaux }; rendre(); }
  const bascule = () => basculeVues({ vues: [['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ['archives', 'Archives', 'archive']], courante: vue,
    surChangement: (id) => {
      if (id === 'archives') { naviguer('rdv/archives'); return; }
      ecrirePreference('vue.rdv', id);
      if (vue === 'archives') { naviguer('rdv/liste'); return; }
      vue = id; rendre();
    } });

  const filtres = boutonFiltresCommun({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [{ cle: 'etats', libelle: 'État', type: 'cases', options: R.ETATS.map((e) => ({ valeur: e, libelle: nomEtat(e) })) }, controleTests()],
      criteres, effacer: () => ({ ...R.criteresVides(), recherche: criteres.recherche }),
    });
    if (r) majCriteres({ ...criteres, ...r });
  } });
  const choixTri = selecteurTri({ options: T.optionsMenu('rdv', tri.critere), valeur: tri.critere, sens: tri.sens, surChangement: (n) => changerTri(n) });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher un rendez-vous', valeur: criteres.recherche, surSaisie: (v) => majCriteres({ ...criteres, recherche: v }) },
    elements: { filtres: filtres.element, vues: zoneBascule, pastilles: zonePastilles }, tri: choixTri.element,
  });

  function changerTri(nouveau) { tri = nouveau; ecrirePreference('tri.rdv', T.texteTri(tri)); rendre(); }

  function majFiltres() {
    const pastilles = [
      ...criteres.etats.map((e) => ({ libelle: `État : ${nomEtat(e)}`, retirer: () => ({ ...criteres, etats: criteres.etats.filter((x) => x !== e) }) })),
      ...(criteres.tests !== 'inclure' ? [{ libelle: L.libelleFiltreTests(criteres.tests), retirer: () => ({ ...criteres, tests: 'inclure' }) }] : []),
    ];
    filtres.majCompte(pastilles.length);
    remplir(zonePastilles, pastilles.map((a) => h('span', { class: 'pastille-filtre' }, a.libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${a.libelle}`, onclick: () => majCriteres(a.retirer()) }, icone('x', { taille: 12 })))));
    if (barre.champ.value !== criteres.recherche && document.activeElement !== barre.champ) barre.champ.value = criteres.recherche;
  }

  const trier = (liste) => T.trierSelon(liste, tri, CLES_TRI);
  const phrase = (n, archive) => `${n} rendez-vous${archive ? ' archivés' : ''}`;

  function videAvecBouton(message) {
    return h('div', { class: 'etat-vide', dataset: { role: 'vide-rdv' } }, h('p', {}, message),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'creer-premier-rdv', onclick: () => naviguer('rdv/nouveau') }, icone('plus', { taille: 16 }), 'Créer un rendez-vous'));
  }

  function rendreKanban() {
    const par = participantsParRdv();
    const rdvs = trier(R.filtrerRendezVous(D.etat.rendezVous, criteres, par));
    remplir(compteur, phrase(rdvs.length, false));
    if (!D.etat.rendezVous.some((r) => !r.archive)) {
      remplir(zone, videAvecBouton('Aucun rendez-vous pour l’instant. Crée le premier pour proposer des créneaux par SMS.'));
      return;
    }
    remplir(zone, h('div', { class: 'kanban kanban-rdv' }, R.ETATS.map((e) => colonne(e, rdvs.filter((r) => (r.etat || 'en_attente') === e), par))));
  }

  const COLONNES = [{ id: 'client', libelle: 'Client' }, { id: 'commune', libelle: 'Commune' }, { id: 'date', libelle: 'Créneau' }, { id: 'reponses', libelle: 'Réponses' }, { id: 'etat', libelle: 'État' }];

  function rendreTableau(archives) {
    const par = participantsParRdv();
    const rdvs = trier(R.filtrerRendezVous(D.etat.rendezVous, criteres, par, { archives }));
    remplir(compteur, phrase(rdvs.length, archives));
    if (!rdvs.length) {
      const vide = archives ? 'Aucun rendez-vous archivé.' : (D.etat.rendezVous.some((r) => !r.archive) ? 'Aucun rendez-vous ne correspond.' : null);
      remplir(zone, vide ? h('div', { class: 'etat-vide' }, h('p', {}, vide)) : videAvecBouton('Aucun rendez-vous pour l’instant. Crée le premier pour proposer des créneaux par SMS.'));
      return;
    }
    const entete = h('tr', {}, COLONNES.map((c) => h('th', { scope: 'col', 'aria-sort': c.id && tri.critere === c.id ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      c.id ? h('button', { type: 'button', class: 'tri', onclick: () => changerTri(T.triApresClicColonne('rdv', tri, c.id)) }, c.libelle, tri.critere === c.id ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null) : c.libelle)),
    h('th', { class: 'col-actions' }));
    const corps = rdvs.map((r) => {
      const parts = par[r.id] || [];
      const b = R.bilanReponses(parts, (r.creneaux || []).length || R.MAX_CRENEAUX);
      const date = R.dateDuRendezVous(r);
      return h('tr', { class: 'ligne-liste', dataset: { id: r.id }, onclick: (e) => { if (!e.target.closest('a, button')) naviguer(cheminRdv(r.id)); } },
        h('td', { dataset: { libelle: 'Client' } }, h('a', { class: 'cellule-nom', href: `#/${cheminRdv(r.id)}` }, h('span', {}, r.client || 'Sans nom'), badgeTest(r))),
        h('td', { dataset: { libelle: 'Commune' } }, r.commune || ''),
        h('td', { dataset: { libelle: 'Créneau' } }, Number.isFinite(date) ? R.formaterCreneau(date) : ''),
        h('td', { dataset: { libelle: 'Réponses' } }, `${b.reponses} sur ${b.total}`),
        h('td', { dataset: { libelle: 'État' } }, h('span', { class: `pastille-statut rdv-etat-${r.etat || 'en_attente'}` }, nomEtat(r.etat || 'en_attente'))),
        h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${r.client || 'rendez-vous'}`, onclick: (e) => ouvrirMenu(e.currentTarget, menuRdv(r)) }, icone('ellipsis', { taille: 18 }))));
    });
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-rdv' }, h('thead', {}, entete), h('tbody', {}, corps))));
  }

  function rendre() {
    remplir(zoneBascule, bascule());
    majFiltres();
    choixTri.maj(T.optionsMenu('rdv', tri.critere), tri.critere, tri.sens);
    if (!(D.estPret() && CRM.estPret())) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (vue === 'kanban') rendreKanban(); else rendreTableau(vue === 'archives');
  }

  conteneur.append(h('div', { class: 'page page-affaires page-rdv' },
    enteteListe({ titre: 'Rendez-vous', compteur, actions: [
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouveau-rdv', onclick: () => naviguer('rdv/nouveau') }, icone('plus', { taille: 16 }), 'Rendez-vous')] }),
    barre.element, zone));
  const planifie = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(planifie), CRM.surChangement(planifie)];
  return () => arrets.forEach((f) => f());
}
