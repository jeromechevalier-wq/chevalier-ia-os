// Écran « Import » du module Réseaux sociaux : récupérer l'archive LinkedIn et la lire dans le navigateur pour mettre à jour les relations.
// Parcours en étapes, UN seul bouton jaune (en haut) = l'étape suivante :
//   1. « Vérifier la boîte mail » (la fonction du serveur dit seulement si le mail de LinkedIn est arrivé, et donne le lien) ;
//   2. « Ouvrir la page LinkedIn » (nouvel onglet : le téléchargement demande d'être connecté à LinkedIn, le serveur ne peut pas le faire) ;
//   3. « Choisir le fichier .zip » (ou glisser-déposer) : l'import s'enchaîne SANS validation, puis un compte rendu s'affiche ;
//   4. l'historique des imports (plus récent d'abord, trié dans le navigateur).
// Si la vérification de la boîte n'est pas branchée (ou en erreur), une phrase grise le dit et le parcours continue : on dépose l'archive à la main.
import { h, icone, remplir } from '../../os/ui.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etatVide } from '../crm/composants.js';
import { jourParis } from '../crm/logique.js';
import * as D from './donnees.js';
import * as I from './import-logique.js';
import { ongletsReseauxSociaux, chargement } from './commun.js';

/** Rien à mémoriser entre deux affichages : l'écran repart toujours de la première étape. */
export function oublierFiltresImport() {}

// Feuille de style propre à l'écran (le module charge déjà reseauxsociaux.css), ajoutée au premier affichage.
function ajouterFeuille(nom) {
  if (document.querySelector(`link[data-reseauxsociaux="${nom}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL(`../../../css/${nom}.css`, import.meta.url).href;
  l.dataset.reseauxsociaux = nom;
  document.head.append(l);
}

const phraseGrise = (texte, role = 'phrase-grise') => h('p', { class: 'aide', dataset: { role } }, texte);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/** Lignes du compte rendu : { cle, nombre, libelle } (jamais de nom de personne : seulement des compteurs). */
function lignesCompteRendu(r) {
  return [
    ['activitesCreees', r.activitesCreees, 'échanges ajoutés aux fiches'],
    ['personnesCreees', r.personnesCreees, 'nouvelles personnes créées'],
    ['personnesRattachees', r.personnesRattachees, 'personnes déjà connues rattachées'],
    ['ignoreesUneVoix', r.ignoreesUneVoix, 'conversations où une seule personne a écrit (ignorées)'],
    ['ignoreesGroupe', r.ignoreesGroupe, 'conversations de groupe (ignorées)'],
    ['ignoreesDejaVues', r.ignoreesDejaVues, 'échanges déjà importés (ignorés)'],
    ['ignoreesAmbigues', r.ignoreesAmbigues, 'échanges douteux, deux fiches possibles (ignorés)'],
    ['ignoreesSansProfil', r.ignoreesSansProfil, 'personnes sans adresse de profil (ignorées)'],
  ];
}

function carteCompteRendu(fin) {
  const r = fin.resultat;
  return h('section', { class: 'carte-section', dataset: { carte: 'compte-rendu' } },
    h('h2', {}, icone('inbox', { taille: 18 }), 'Import terminé'),
    h('dl', { class: 'rs-import-compteurs' }, lignesCompteRendu(r).map(([cle, nombre, libelle]) => h('div', { class: 'rs-import-compteur', dataset: { compteur: cle, nombre: String(nombre) } },
      h('dt', {}, String(nombre)), h('dd', {}, libelle)))),
    phraseGrise(`Lu dans l’archive : ${pluriel(fin.lu.messages, 'message', 'messages')}, ${pluriel(fin.lu.conversations, 'conversation', 'conversations')}, ${pluriel(fin.lu.connexions, 'relation', 'relations')}.`),
    fin.sansEtiquette && r.personnesCreees > 0 ? phraseGrise('Les nouvelles personnes n’ont pas de catégorie : l’étiquette « À classer » n’a pas pu être créée.', 'sans-etiquette') : null);
}

function ligneHistorique(i) {
  const ok = i.statut === 'termine';
  const r = i.resultat ?? {};
  const detail = ok
    ? `${pluriel(r.activitesCreees ?? 0, 'échange ajouté', 'échanges ajoutés')}, ${pluriel(r.personnesCreees ?? 0, 'personne créée', 'personnes créées')}`
    : (i.erreur || 'L’import n’a pas abouti.');
  return h('li', { class: 'rs-ligne', dataset: { import: i.id, statut: i.statut } },
    h('span', { class: 'rs-ligne-titre' }, `${I.dateImport(i) || 'Date inconnue'} · ${i.fichier || 'archive'}`),
    ok ? h('span', { class: 'pastille-etiquette', style: { '--couleur': 'var(--succes)' } }, 'Terminé') : h('span', { class: 'badge-retard' }, 'Échec'),
    h('span', { class: 'rs-ligne-detail' }, detail));
}

function carteHistorique() {
  const corps = !D.etat.pret ? [chargement()]
    : D.etat.imports.length ? [h('ul', { class: 'rs-liste', dataset: { role: 'historique' } }, I.historiqueImports(D.etat.imports).map(ligneHistorique))]
      : [etatVide('Aucun import pour le moment.'),
        h('ol', { class: 'aide rs-import-explication', dataset: { role: 'explication' } },
          h('li', {}, 'Demande ton archive dans LinkedIn (Paramètres, Confidentialité des données, « Obtenir une copie de vos données »).'),
          h('li', {}, 'Télécharge-la quand LinkedIn te prévient par mail.'),
          h('li', {}, 'Dépose ici le fichier .zip : tout est lu dans ton navigateur, rien n’est envoyé ailleurs.'))];
  return h('section', { class: 'carte-section', dataset: { carte: 'historique' } }, h('h2', {}, icone('list', { taille: 18 }), 'Imports précédents'), ...corps);
}

export function rendreImport(conteneur) {
  ajouterFeuille('reseauxsociaux-import');
  // État du parcours : étape en cours, résultat de la vérification de la boîte, import en cours ou terminé.
  const s = { etape: 'verifier', boite: { etat: 'repos', lien: null, recuLe: null, message: '' }, import: { etat: 'repos', phase: '', message: '', fin: null }, survol: false };
  let actions = null; // import-actions.js, chargé à la demande
  const chargerActions = async () => { actions ??= await import('./import-actions.js'); return actions; };
  let vivant = true;

  const entree = h('input', { type: 'file', accept: '.zip,application/zip', class: 'sr-only', tabindex: '-1', 'aria-label': 'Fichier .zip de l’archive LinkedIn', dataset: { role: 'fichier' },
    onchange: () => { const f = entree.files?.[0]; entree.value = ''; if (f) demarrerImport(f); } });
  const choisir = () => { if (s.import.etat !== 'encours') entree.click(); };

  const zoneEntete = h('div', { class: 'page-actions-zone' });
  const zoneParcours = h('div', {});
  const zoneResultat = h('div', {});
  const zoneHistorique = h('div', {});
  const occupe = () => s.boite.etat === 'verification' || s.import.etat === 'encours';

  async function verifier() {
    if (occupe()) return;
    s.boite = { etat: 'verification', lien: null, recuLe: null, message: '' };
    rendre();
    try {
      const a = await chargerActions();
      const r = await a.verifierBoite();
      if (!vivant) return;
      if (r.trouve) { s.boite = { etat: 'trouve', lien: r.lien, recuLe: r.recuLe, message: '' }; s.etape = r.lien ? 'ouvrir' : 'deposer'; } else { s.boite = { etat: 'rien', lien: null, recuLe: null, message: '' }; s.etape = 'verifier'; }
    } catch (e) {
      if (!vivant) return;
      s.boite = { etat: 'erreur', lien: null, recuLe: null, message: e?.message || 'La vérification de la boîte mail n’est pas encore branchée. Dépose l’archive à la main.' };
      s.etape = 'deposer'; // le parcours continue : on dépose l'archive à la main
    }
    rendre();
  }

  async function demarrerImport(fichier) {
    if (occupe()) return;
    s.import = { etat: 'encours', phase: 'lecture', message: '', fin: null };
    rendre();
    try {
      if (!/\.zip$/i.test(fichier.name)) throw Object.assign(new Error('Choisis un fichier .zip (l’archive téléchargée depuis LinkedIn).'), { saisie: true });
      const a = await chargerActions();
      const fin = await a.lancerImport(fichier, { surEtape: (phase) => { s.import.phase = phase; if (vivant) rendre(); } });
      s.import = { etat: 'fini', phase: '', message: '', fin };
      s.boite = { etat: 'repos', lien: null, recuLe: null, message: '' }; // le mail annoncé a servi : on repart de la première étape
      s.etape = 'verifier';
    } catch (e) {
      if (!e?.saisie) console.warn(e);
      s.import = { etat: 'erreur', phase: '', message: e?.saisie ? e.message : 'L’import n’a pas abouti. Recommence dans un instant.', fin: null };
    }
    if (vivant) rendre();
  }

  // ---- bouton jaune du haut : toujours l'étape suivante
  function boutonPrincipal() {
    if (occupe()) {
      return h('button', { type: 'button', class: 'bouton bouton-principal', disabled: true, dataset: { action: 'en-cours' } }, s.import.etat === 'encours' ? 'Import en cours…' : 'Vérification…');
    }
    if (s.etape === 'ouvrir' && s.boite.lien) {
      return h('a', { class: 'bouton bouton-principal', href: s.boite.lien, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-linkedin' },
        onclick: () => { s.etape = 'deposer'; setTimeout(() => { if (vivant) rendre(); }, 0); } }, icone('external-link', { taille: 16 }), 'Ouvrir la page LinkedIn');
    }
    if (s.etape === 'deposer') {
      return h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'choisir-fichier' }, onclick: choisir }, icone('upload', { taille: 16 }), 'Choisir le fichier .zip');
    }
    return h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'verifier-boite' }, onclick: verifier }, icone('mail', { taille: 16 }), 'Vérifier la boîte mail');
  }

  function etapes() {
    const b = s.boite;
    let phraseBoite = null;
    if (b.etat === 'verification') phraseBoite = phraseGrise('Je regarde dans la boîte mail…', 'etat-boite');
    else if (b.etat === 'trouve') phraseBoite = phraseGrise(b.lien ? `Le mail de LinkedIn est arrivé${b.recuLe ? ` le ${I.jourFrancais(jourParis(b.recuLe))}` : ''}.` : 'Le mail de LinkedIn est arrivé, mais son lien n’est pas sûr : ouvre-le toi-même depuis ta boîte mail.', 'etat-boite');
    else if (b.etat === 'rien') phraseBoite = phraseGrise('Le mail de LinkedIn n’est pas encore arrivé. Demande ton archive dans LinkedIn (Paramètres, Confidentialité des données), puis vérifie de nouveau.', 'etat-boite');
    else if (b.etat === 'erreur') phraseBoite = phraseGrise(b.message, 'etat-boite');
    const encours = s.import.etat === 'encours';
    const zone = h('div', { class: `rs-import-depot${s.survol ? ' survol' : ''}${encours ? ' occupe' : ''}`, dataset: { role: 'depot' },
      ondragover: (e) => { e.preventDefault(); if (!s.survol && !encours) { s.survol = true; zone.classList.add('survol'); } },
      ondragleave: () => { s.survol = false; zone.classList.remove('survol'); },
      ondrop: (e) => { e.preventDefault(); s.survol = false; zone.classList.remove('survol'); const f = e.dataTransfer?.files?.[0]; if (f) demarrerImport(f); } },
    encours ? h('p', { role: 'status', dataset: { role: 'progression' } }, s.import.phase === 'ecriture' ? 'J’écris dans tes fiches…' : 'Je lis l’archive…')
      : h('p', {}, 'Glisse ici le fichier .zip de LinkedIn, ou choisis-le.'),
    s.etape === 'deposer' || encours ? null : h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'choisir-fichier-secondaire' }, onclick: choisir }, icone('upload', { taille: 16 }), 'Choisir le fichier .zip'));
    return h('section', { class: 'carte-section', dataset: { carte: 'parcours' } },
      h('h2', {}, icone('refresh-cw', { taille: 18 }), 'Récupérer ton archive LinkedIn'),
      h('p', { class: 'aide' }, 'Tout est lu dans ton navigateur : rien n’est envoyé ailleurs, et le texte des messages n’est jamais gardé.'),
      phraseBoite, zone, entree,
      s.import.etat === 'erreur' ? h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-import' } }, s.import.message) : null);
  }

  function rendre() {
    remplir(zoneEntete, boutonPrincipal());
    remplir(zoneParcours, etapes());
    remplir(zoneResultat, s.import.etat === 'fini' && s.import.fin ? carteCompteRendu(s.import.fin) : null);
    remplir(zoneHistorique, carteHistorique());
  }
  function rendreHistorique() { remplir(zoneHistorique, carteHistorique()); }

  const entete = enteteListe({ titre: 'Import', actions: [zoneEntete] });
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-import' }, entete, ongletsReseauxSociaux('reseauxsociaux/import'), zoneParcours, zoneResultat, zoneHistorique));
  const arret = D.surChangement(rendreHistorique);
  rendre();
  return function quitter() { vivant = false; arret(); };
}
