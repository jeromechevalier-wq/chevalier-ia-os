// Écran Réglages > Mes tests (mode test, PR 4) : combien d'éléments de test existent, et un bouton pour tous les supprimer d'un coup.
// Le serveur calcule tout (aperçu puis suppression, js/os/mode-test-donnees.js) : l'écran n'écrit jamais dans Firestore.
// Section réservée aux éditeurs (registre.js, editeursSeulement). Une copie reste dans le Journal des modifications ; les devis de test finalisés (TEST-) ne se restaurent pas.
import { h, icone, remplir, toast, dialogue } from './ui.js';
import { appelerSuppressionTests, messageDErreurTests } from './mode-test-donnees.js';

const PHRASE_CONFIRMATION = 'supprimer mes tests';
const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const LIGNES = [
  ['devis', 'Devis', 'devis', 'devis', true],
  ['projets', 'Projets', 'projet', 'projets', true],
  ['taches', 'Tâches de projet', 'tâche', 'tâches', false],
  ['affaires', 'Affaires', 'affaire', 'affaires', true],
  ['personnes', 'Personnes', 'personne', 'personnes', true],
  ['organisations', 'Organisations', 'organisation', 'organisations', true],
  ['activites', 'Activités', 'activité', 'activités', true],
  ['notes', 'Notes', 'note', 'notes', true],
  ['evenements', 'Événements du fil', 'événement', 'événements', false],
];
const nombre = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const nElements = (n) => nombre(n, 'élément', 'éléments');

/** « 2 devis, 1 projet, 3 affaires » : seulement les types présents. */
export function resumeDesComptes(comptes = {}) {
  return LIGNES.filter(([id]) => comptes[id] > 0).map(([id, , un, plusieurs]) => nombre(comptes[id], un, plusieurs)).join(', ');
}

export function sectionMesTests(ctx, etat) {
  const page = { chargement: true, erreur: '', message: '', tests: null, enCours: false };
  const zone = h('div', { class: 'mes-tests-contenu' });
  const sec = h('section', { class: 'carte-section', id: 'reglages-tests' },
    h('h2', {}, icone('flask-conical', { taille: 18 }), 'Mes tests'),
    h('p', { class: 'aide' }, 'Les éléments marqués test (badge [TEST]) n’entrent dans aucun chiffre. Ici tu peux tous les supprimer d’un coup. Une copie reste dans le Journal des modifications ; les devis de test finalisés (numéro TEST-) ne se restaurent pas.'),
    zone);

  function rendre() {
    if (!etat.vivant) return;
    const t = page.tests;
    const total = t?.total ?? 0;
    const parts = [];
    if (page.chargement) parts.push(h('p', { class: 'aide', dataset: { role: 'chargement-tests' } }, 'Chargement…'));
    if (page.erreur) {
      parts.push(h('p', { class: 'aide', role: 'alert', dataset: { role: 'erreur-tests' } }, page.erreur),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-tests' }, onclick: () => charger() }, 'Réessayer'));
    }
    if (t && !page.chargement) {
      if (total === 0) parts.push(h('p', { class: 'aide', dataset: { role: 'vide-tests' } }, 'Aucun élément de test pour l’instant. Allume le mode test (menu de ton compte) ou dis « c’est un test » à ton assistant.'));
      else {
        for (const [id, etiquette, un, plusieurs, toujours] of LIGNES) {
          const n = t.comptes?.[id] ?? 0;
          if (n > 0 || toujours) parts.push(h('div', { class: 'reglages-info', dataset: { info: id } }, h('span', { class: 'reglages-info-etiquette' }, etiquette), h('span', { class: 'reglages-info-valeur' }, nombre(n, un, plusieurs))));
        }
        parts.push(h('ul', { class: 'aide', dataset: { role: 'noms-tests' } }, (t.noms ?? []).map((nom) => h('li', {}, nom))));
      }
      if ((t.relies ?? []).length) {
        parts.push(h('div', { dataset: { role: 'relies-tests' } },
          h('h3', {}, 'Reliés à un test, non supprimés'),
          h('ul', { class: 'aide' }, t.relies.map((r) => h('li', {}, `${r.libelle} : ${r.raison}`)))));
      }
    }
    if (page.message) parts.push(h('p', { class: 'aide', role: 'alert', dataset: { role: 'message-tests' } }, page.message));
    parts.push(h('div', { class: 'deploiement-tete' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'supprimer-tests' }, disabled: !t || total === 0 || page.enCours || page.chargement, onclick: () => demander() }, icone('trash-2', { taille: 16 }), 'Supprimer tous mes tests…'),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'actualiser-tests' }, disabled: page.enCours || page.chargement, onclick: () => charger() }, icone('refresh-cw', { taille: 16 }), 'Actualiser')));
    remplir(zone, ...parts);
  }

  async function charger({ garderMessage = false } = {}) {
    page.chargement = true; page.erreur = ''; if (!garderMessage) page.message = '';
    rendre();
    try {
      page.tests = await appelerSuppressionTests(ctx, { apercu: true });
    } catch (e) {
      page.erreur = messageDErreurTests(e);
      page.tests = null;
    }
    page.chargement = false;
    rendre();
  }

  async function demander() {
    const t = page.tests;
    if (!t || !t.total) return;
    const empreinte = t.empreinte;
    const saisie = h('input', { type: 'text', class: 'champ', 'aria-label': 'Tape : supprimer mes tests', autocomplete: 'off', placeholder: PHRASE_CONFIRMATION });
    const ok = await dialogue({
      titre: 'Supprimer tous mes tests ?',
      contenu: h('div', {},
        h('p', {}, `${nElements(t.total)} seront supprimés définitivement : ${resumeDesComptes(t.comptes)}.`),
        (t.relies ?? []).length ? h('div', { dataset: { role: 'relies-dialogue' } }, h('p', {}, 'Gardés (reliés à un test) :'), h('ul', {}, t.relies.map((r) => h('li', {}, `${r.libelle} : ${r.raison}`)))) : null,
        h('p', { class: 'aide' }, 'Les devis de test finalisés (TEST-) ne pourront pas être restaurés ; le reste se restaure depuis le Journal des modifications.'),
        h('p', {}, 'Pour confirmer, tape : ', h('strong', {}, PHRASE_CONFIRMATION)),
        saisie),
      boutons: [
        { libelle: 'Annuler', valeur: false },
        { libelle: `Supprimer ${nElements(t.total)}`, valeur: true, style: 'danger', desactive: true },
      ],
      auMontage: ({ boutons }) => {
        const maj = () => { boutons.at(-1).disabled = normaliser(saisie.value) !== PHRASE_CONFIRMATION; };
        saisie.addEventListener('input', maj);
        saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !boutons.at(-1).disabled) boutons.at(-1).click(); });
      },
    });
    if (ok !== true) return;
    page.enCours = true; page.message = '';
    rendre();
    try {
      const r = await appelerSuppressionTests(ctx, { apercu: false, empreinte });
      page.enCours = false;
      toast(`${nElements(r.total ?? 0)} supprimés · copie dans le Journal`);
      await charger();
    } catch (e) {
      page.enCours = false;
      page.message = messageDErreurTests(e);
      await charger({ garderMessage: true });
    }
  }

  charger();
  return sec;
}
