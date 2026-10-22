// Écran Journal (lecture seule) : ce qui a été créé, modifié ou supprimé, par l'appli ou par le serveur MCP (Claude Code, Hermes).
// Il lit directement Firestore, sans passer par le serveur MCP : il reste utilisable le jour où le MCP est en panne.
// Aucune écriture, aucun bouton de restauration ici : on lit, on comprend, puis on demande la restauration à Claude Code.
import { h, icone, remplir, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { etatVide } from './composants.js';
import { estChezClient } from '../../os/contexte.js';

const TAILLE_PAGE = 200;
const CHEMINS = { crm_personnes: 'personnes', crm_organisations: 'organisations', crm_affaires: 'affaires' };

let criteres = { canal: 'tous', aVerifier: false, depuis: '', texte: '' };

const TEXTES_STATUT = { averifier: 'À vérifier', echec: 'Échec' };

function pastilleStatut(statut) {
  return statut === 'succes' ? null : h('span', { class: `pastille-journal ${statut}` }, TEXTES_STATUT[statut]);
}

// ---------------------------------------------------------------- détail d'une opération

/** Tableau champ par champ : ce qui a changé entre la copie « avant » et la copie « après ». */
function tableauDifferences(copie) {
  const diffs = L.differencesJournal(copie.avant, copie.apres);
  if (!diffs.length) return h('p', { class: 'aide' }, 'Aucun champ ne diffère.');
  const documents = diffs.find((d) => d.champ === 'documents');
  const phrases = documents ? L.changementsDocumentsJournal(documents.avant, documents.apres) : [];
  const resume = phrases.length ? h('ul', { class: 'liste-simple journal-documents' }, phrases.map((t) => h('li', {}, t))) : null;
  const tableau = h('table', { class: 'tableau tableau-differences' },
    h('thead', {}, h('tr', {}, ['Champ', 'Avant', 'Après'].map((t) => h('th', { scope: 'col' }, h('span', { class: 'tri' }, t))))),
    h('tbody', {}, diffs.map((d) => h('tr', {},
      h('td', { class: 'diff-champ' }, d.champ),
      h('td', { class: 'diff-avant', dataset: { libelle: 'Avant' } }, L.formaterValeurJournal(d.avant)),
      h('td', { class: 'diff-apres', dataset: { libelle: 'Après' } }, L.formaterValeurJournal(d.apres))))));
  return resume ? h('div', { class: 'pile' }, resume, tableau) : tableau;
}

function blocLigne(ligne, ouvert) {
  const corps = h('div', { class: 'journal-copie' });
  const fiche = CHEMINS[ligne.collection] && D.etat[CHEMINS[ligne.collection]]?.some((x) => x.id === ligne.docId)
    ? h('a', { class: 'lien-fiche', href: `#/crm/${CHEMINS[ligne.collection]}/${ligne.docId}` }, 'Ouvrir la fiche') : null;
  let charge = false;
  async function charger() {
    if (charge || ligne.action === 'echec') return; // une ligne « échec » n'a pas de copie : son message suffit
    charge = true;
    remplir(corps, h('p', { class: 'aide' }, 'Chargement de la copie…'));
    try {
      const copie = await D.lireCopieJournal(ligne.id);
      remplir(corps, copie ? tableauDifferences(copie)
        : h('p', { class: 'aide' }, 'Pas de copie « avant / après » pour cette ligne.'));
    } catch (e) {
      console.warn(e);
      charge = false;
      remplir(corps, h('p', { class: 'message-refus', role: 'alert' }, 'Copie illisible pour le moment.'));
    }
  }
  const el = h('details', { class: 'journal-ligne', open: ouvert, dataset: { docId: ligne.docId } },
    h('summary', {}, h('strong', {}, L.libelleActionJournal(ligne.action)), ` · ${L.libelleDocumentJournal(ligne.collection)} `, h('code', {}, ligne.docId), ' ', pastilleStatut(L.statutOperationJournal([ligne]))),
    ligne.erreur ? h('p', { class: 'message-refus' }, ligne.erreur) : null,
    (ligne.champsModifies || []).length ? h('p', { class: 'aide' }, `Champs touchés : ${ligne.champsModifies.join(', ')}`) : null,
    fiche, corps);
  el.addEventListener('toggle', () => { if (el.open) charger(); });
  if (ouvert) charger();
  return el;
}

function ouvrirOperation(op) {
  const entete = h('dl', { class: 'journal-entete' },
    h('div', {}, h('dt', {}, 'Quand'), h('dd', {}, L.formatDateHeure(op.date))),
    h('div', {}, h('dt', {}, 'Qui'), h('dd', {}, `${op.acteur} (${op.canal})`)),
    h('div', {}, h('dt', {}, 'Action'), h('dd', {}, op.outil)),
    h('div', {}, h('dt', {}, 'Opération'), h('dd', {}, h('code', {}, op.operationId))));
  return dialogue({
    titre: op.resume,
    classe: 'dialogue-journal',
    contenu: h('div', { class: 'journal-detail' }, entete, op.lignes.map((l) => blocLigne(l, op.lignes.length <= 3))),
    boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
  });
}

// ---------------------------------------------------------------- écran

export function rendreJournal(conteneur) {
  let lignes = [];
  let curseur = null;
  let fini = false;
  let etat = 'chargement'; // chargement | pret | erreur
  let enCours = false;
  let vivant = true;

  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-tableau' });
  const pied = h('div', { class: 'journal-pied' });

  const champTexte = h('input', { class: 'champ', type: 'search', 'aria-label': 'Rechercher dans le journal', placeholder: 'Rechercher (qui, outil, identifiant…)', value: criteres.texte,
    oninput: (e) => { criteres = { ...criteres, texte: e.target.value }; rendre(); } });
  const choixCanal = h('select', { class: 'champ champ-petit', 'aria-label': 'Canal', dataset: { role: 'filtre-canal' },
    onchange: (e) => { criteres = { ...criteres, canal: e.target.value }; rendre(); } },
  [['tous', 'Tous les canaux'], ['ecran', 'Appli'], ['mcp', estChezClient() ? 'Assistant IA (MCP)' : 'MCP (Claude Code, Hermes)']].map(([v, t]) => h('option', { value: v, selected: criteres.canal === v }, t)));
  const choixDate = h('input', { class: 'champ champ-petit', type: 'date', 'aria-label': 'Depuis le', value: criteres.depuis, dataset: { role: 'filtre-depuis' },
    onchange: (e) => { criteres = { ...criteres, depuis: e.target.value }; rendre(); } });
  const caseAVerifier = h('input', { type: 'checkbox', checked: criteres.aVerifier, dataset: { role: 'filtre-a-verifier' },
    onchange: (e) => { criteres = { ...criteres, aVerifier: e.target.checked }; rendre(); } });

  const boutonActualiser = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'actualiser-journal', onclick: () => charger(true) },
    icone('refresh-cw', { taille: 16 }), 'Actualiser');

  async function charger(depuisLeDebut) {
    if (enCours) return;
    enCours = true;
    if (depuisLeDebut) { lignes = []; curseur = null; fini = false; etat = 'chargement'; rendre(); }
    try {
      const page = await D.lireJournal({ taille: TAILLE_PAGE, apres: curseur });
      if (!vivant) return;
      lignes = lignes.concat(page.lignes);
      curseur = page.curseur;
      fini = page.fini;
      etat = 'pret';
    } catch (e) {
      console.warn(e);
      if (!vivant) return;
      etat = 'erreur';
    } finally {
      enCours = false;
    }
    rendre();
  }

  function rendre() {
    if (etat === 'chargement') {
      remplir(compteur, '');
      remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' })));
      remplir(pied);
      return;
    }
    if (etat === 'erreur') {
      remplir(compteur, '');
      remplir(zone, etatVide('Le journal n’a pas pu être lu. Vérifie ta connexion, puis clique sur « Actualiser ».'));
      remplir(pied);
      return;
    }
    const toutes = L.grouperJournal(lignes);
    const operations = L.filtrerJournal(toutes, criteres);
    remplir(compteur, `${operations.length} ${operations.length > 1 ? 'opérations' : 'opération'}${operations.length !== toutes.length ? ` sur ${toutes.length} chargées` : ''}`);
    if (!operations.length) {
      remplir(zone, etatVide(toutes.length ? 'Aucune opération ne correspond à ces filtres.' : 'Le journal est vide : rien n’a encore été écrit.'));
    } else {
      const entete = h('tr', {}, ['Quand', 'Qui', 'Canal', 'Ce qui s’est passé', 'État'].map((t) => h('th', { scope: 'col' }, h('span', { class: 'tri' }, t))));
      const corps = operations.map((o) => h('tr', { class: 'ligne-liste', tabindex: '0', dataset: { operation: o.operationId },
        onclick: () => ouvrirOperation(o),
        onkeydown: (e) => { if (e.key === 'Enter') ouvrirOperation(o); } },
      h('td', { dataset: { libelle: 'Quand' } }, L.formatDateHeure(o.date)),
      h('td', { dataset: { libelle: 'Qui' } }, o.acteur),
      h('td', { dataset: { libelle: 'Canal' } }, o.canal),
      h('td', { dataset: { libelle: 'Ce qui s’est passé' } }, h('div', {}, o.resume), h('div', { class: 'journal-outil' }, o.outil)),
      h('td', { dataset: { libelle: 'État' } }, pastilleStatut(o.statut))));
      remplir(zone, h('table', { class: 'tableau tableau-journal' }, h('thead', {}, entete), h('tbody', {}, corps)));
    }
    remplir(pied, fini ? h('p', { class: 'aide' }, `Tout le journal est chargé (${lignes.length} lignes).`)
      : h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'journal-plus', disabled: enCours, onclick: () => charger(false) }, 'Charger les lignes plus anciennes'));
  }

  const barre = h('div', { class: 'barre-filtres' },
    h('div', { class: 'barre-filtres-ligne' }, h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), champTexte), choixCanal, choixDate,
      h('label', { class: 'case-seule' }, caseAVerifier, ' À vérifier seulement')));
  const entete = h('header', { class: 'page-tete' },
    h('div', {}, h('p', { class: 'etiquette' }, 'Lecture seule'), h('h1', {}, 'Journal des modifications'), compteur),
    h('div', { class: 'page-actions' }, boutonActualiser));
  conteneur.append(h('div', { class: 'page page-liste page-journal' }, entete,
    h('p', { class: 'aide' }, estChezClient()
      ? 'Chaque création, modification ou suppression faite dans l’appli ou par un assistant IA laisse une ligne ici, avec une copie du document avant et après (gardée sans limite de durée).'
      : 'Chaque création, modification ou suppression faite dans l’appli ou par Claude Code laisse une ligne ici, avec une copie du document avant et après (gardée sans limite de durée). Pour défaire une opération, demande-le à Claude Code (restaurer_depuis_audit).'),
    barre, zone, pied));
  rendre();
  charger(false);
  return () => { vivant = false; };
}
