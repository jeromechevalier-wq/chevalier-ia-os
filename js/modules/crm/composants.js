// Composants du module CRM partagés par les listes et les fiches : sections repliables, propriétés à
// compléter ("+ Ajouter"), pastilles, liens, sélecteurs intelligents (organisation, personne, étiquettes…).
import { h, icone, remplir, champIntelligent, lirePreference, ecrirePreference, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { estChezClient } from '../../os/contexte.js';

// ---------------------------------------------------------------- liens et pastilles

export const cheminPersonne = (id) => `#/crm/personnes/${id}`;
export const cheminOrganisation = (id) => `#/crm/organisations/${id}`;
export const cheminAffaire = (id) => `#/crm/affaires/${id}`;

export function lien(chemin, texte, classe = 'lien-fiche') {
  return h('a', { class: classe, href: chemin }, texte);
}

/** Étoile d'un document : jaune et pleine quand le document est en favori, vide sinon. Un clic appelle `surBascule`. */
export function boutonEtoile({ favori, libelle, surBascule }) {
  return h('button', {
    type: 'button', class: `bouton-icone bouton-etoile${favori ? ' est-favori' : ''}`, 'data-action': 'basculer-favori',
    'aria-pressed': favori ? 'true' : 'false',
    'aria-label': favori ? `Retirer ${libelle} des favoris` : `Mettre ${libelle} en favori`,
    title: favori ? 'Retirer des favoris' : 'Mettre en favori',
    onclick: surBascule,
  }, icone('star', { taille: 16 }));
}

export function lienPersonne(p) {
  return p ? lien(cheminPersonne(p.id), p.nom) : null;
}
export function lienOrganisation(o) {
  return o ? lien(cheminOrganisation(o.id), o.nom) : null;
}
export function lienAffaire(a) {
  return a ? lien(cheminAffaire(a.id), a.titre) : null;
}

export function initiales(nom) {
  const mots = L.nettoyerEspaces(nom).split(' ').filter(Boolean);
  return ((mots[0]?.[0] ?? '?') + (mots.length > 1 ? mots.at(-1)[0] : '')).toUpperCase();
}

export function avatar(nom, taille = 36, classe = '') {
  return h('span', { class: `avatar-initiales ${classe}`, style: { '--taille': `${taille}px` }, 'aria-hidden': 'true' }, initiales(nom));
}

export function pastilleEtiquette(e) {
  return h('span', { class: 'pastille-etiquette', style: { '--couleur': e.couleur || '#b98ee0' } }, e.nom);
}

export function pastillesEtiquettes(ids) {
  const liste = (ids || []).map((id) => D.etat.etiquettes.find((e) => e.id === id)).filter(Boolean);
  return liste.length ? h('span', { class: 'groupe-pastilles' }, liste.map(pastilleEtiquette)) : null;
}

export function pastilleStatut(statut) {
  const s = L.STATUTS.find((x) => x.id === statut);
  return h('span', { class: `pastille-statut statut-${statut}`, style: { '--couleur': s?.couleur || '#8d8993' } }, L.libelleStatut(statut));
}

export function pastilleEtape(etape) {
  return h('span', { class: 'pastille-statut', style: { '--couleur': L.couleurEtape(etape, D.etat.config) } }, L.libelleEtape(etape, D.etat.config));
}

/**
 * Petite icône « i » qui explique une étape ou une phase (le texte écrit dans les Réglages) : au survol sur ordinateur, au toucher sur téléphone
 * (un clic affiche le texte). Rien si l'explication est vide.
 */
export function iconeInfo(texte, nom = '') {
  const t = L.nettoyerEspaces(texte);
  if (!t) return null;
  return h('button', { type: 'button', class: 'bouton-info', title: t, 'aria-label': `Explication${nom ? ` : ${nom}` : ''} : ${t}`, 'data-role': 'info',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); toast(t, { duree: 7000 }); } }, icone('info', { taille: 14 }));
}

export function pastilleActivite(couleur) {
  const libelles = { rouge: 'Activité en retard', verte: 'Activité prévue', grise: 'Aucune activité' };
  return h('span', { class: `pastille-activite ${couleur}`, role: 'img', 'aria-label': libelles[couleur], title: libelles[couleur] });
}

export function iconeTypeActivite(type) {
  const icones = { appel: 'phone', rendez_vous: 'calendar', email: 'mail', tache: 'circle-check' };
  return icone(icones[type] || 'circle-check', { taille: 16 });
}

export function etatVide(message, { action = null } = {}) {
  return h('div', { class: 'etat-vide' },
    D.etat.reglages.imageCelebration ? h('img', { class: 'charles-vide', src: D.etat.reglages.imageCelebration, alt: '', width: '110', height: '82' }) : null,
    h('p', {}, message), action);
}

export function nomCompte(email) {
  if (email === 'jeromebot.chevalierbot@gmail.com') return 'Charles';
  if (email === 'jerome.chevalier@gmail.com') return 'Jérôme';
  return email || '';
}

// ---------------------------------------------------------------- sections repliables

/** Section à en-tête cliquable. L'état ouvert ou replié est mémorisé sur l'appareil. */
export function sectionRepliable({ id, titre, contenu, actions = [], ouverte = true, compteur = null }) {
  const cle = `section.${id}`;
  let ouvert = lirePreference(cle, ouverte ? '1' : '0') === '1';
  const corps = h('div', { class: 'section-corps' }, contenu);
  const chevron = h('span', { class: 'section-chevron' }, icone('chevron-up', { taille: 16 }));
  const entete = h('button', { type: 'button', class: 'section-bascule', 'aria-expanded': String(ouvert),
    onclick: () => { ouvert = !ouvert; ecrirePreference(cle, ouvert ? '1' : '0'); appliquer(); } },
  chevron, h('h2', {}, titre), compteur !== null ? h('span', { class: 'section-compteur' }, String(compteur)) : null);
  const racine = h('section', { class: 'section', dataset: { section: id } }, h('div', { class: 'section-tete' }, entete, h('div', { class: 'section-actions' }, actions)), corps);
  function appliquer() {
    corps.hidden = !ouvert;
    entete.setAttribute('aria-expanded', String(ouvert));
    racine.classList.toggle('replie', !ouvert);
  }
  appliquer();
  return { element: racine, corps };
}

// ---------------------------------------------------------------- propriétés à compléter ("+ Ajouter")

/**
 * Ligne de propriété d'une fiche. Valeur vide : un "+ Ajouter" discret ; un clic ouvre le champ ; la valeur
 * s'enregistre en quittant le champ (Entrée ou clic ailleurs), Échap annule.
 *  type : texte | url | nombre | date | select | zone | intelligent (texte libre avec suggestions : fournir)
 *         | liste (liste fermée de textes donnée par `fournir`, dont la dernière ligne « + Nouvelle valeur… » ouvre un champ avec un bouton Créer)
 */
export function champPropriete({ libelle, valeur = '', type = 'texte', options = [], surEnregistrer, placeholder = '', formater = null, lienVers = null, fournir = null, pas = null }) {
  let courant = valeur ?? '';
  let enEdition = false;
  let creation = false;
  const NOUVEAU = '__nouveau__';
  const zone = h('div', { class: 'prop-valeur' });
  const racine = h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, libelle), zone);

  function texteAffiche() {
    if (formater) return formater(courant);
    if (type === 'select') return options.find((o) => o.valeur === courant)?.libelle ?? courant;
    if (type === 'date') return L.formatJour(courant);
    return String(courant);
  }
  function afficher() {
    enEdition = false;
    const vide = courant === '' || courant === null || courant === undefined;
    const ouvrirEdition = () => editer();
    if (vide) {
      remplir(zone, h('button', { type: 'button', class: 'prop-vide', onclick: ouvrirEdition, 'aria-label': `Ajouter : ${libelle}` }, icone('plus', { taille: 14 }), 'Ajouter'));
      return;
    }
    const texte = texteAffiche();
    const contenu = lienVers
      ? h('a', { class: 'prop-lien', href: lienVers(courant), target: type === 'url' ? '_blank' : null, rel: type === 'url' ? 'noopener noreferrer' : null }, texte)
      : h('span', {}, texte);
    remplir(zone, contenu, h('button', { type: 'button', class: 'prop-modifier bouton-icone', 'aria-label': `Modifier : ${libelle}`, onclick: ouvrirEdition }, icone('pencil', { taille: 14 })));
  }
  function editer() {
    enEdition = true;
    let champ;
    let lire;
    let fini = false;
    if (type === 'select') {
      champ = h('select', { class: 'champ', 'aria-label': libelle }, h('option', { value: '' }, '—'), options.map((o) => h('option', { value: o.valeur, selected: o.valeur === courant }, o.libelle)));
      lire = () => champ.value;
    } else if (type === 'zone') {
      champ = h('textarea', { class: 'champ', rows: 3, 'aria-label': libelle, value: courant });
      lire = () => champ.value.trim();
    } else if (type === 'liste') {
      const choix = [...new Set([...(fournir?.() ?? []), ...(courant ? [courant] : [])])];
      champ = h('select', { class: 'champ', 'aria-label': libelle }, h('option', { value: '' }, '—'),
        choix.map((v) => h('option', { value: v, selected: v === courant }, v)), h('option', { value: NOUVEAU }, '+ Nouvelle valeur…'));
      lire = () => champ.value;
      champ.addEventListener('change', () => {
        if (champ.value !== NOUVEAU) { valider(); return; }
        creation = true;
        const saisie = h('input', { class: 'champ', type: 'text', 'aria-label': `Nouvelle valeur : ${libelle}`, placeholder: 'Nouvelle valeur' });
        const creer = () => {
          const t = L.nettoyerEspaces(saisie.value);
          if (!t) return;
          const existante = choix.find((v) => L.normaliserNom(v) === L.normaliserNom(t));
          lire = () => existante ?? t;
          creation = false;
          valider();
        };
        saisie.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); creer(); }
          if (e.key === 'Escape') { e.stopPropagation(); fini = true; creation = false; afficher(); }
        });
        zone.replaceChildren(h('div', { class: 'ligne-creation' }, saisie, h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'creer-valeur', onclick: creer }, 'Créer')));
        saisie.focus();
      });
    } else if (type === 'intelligent') {
      const ci = champIntelligent({ etiquette: libelle, placeholder, libre: true, texteInitial: String(courant), fournir, surChoix: () => {} });
      champ = ci.entree;
      zone.replaceChildren(ci.element);
      lire = () => ci.texte();
    } else {
      champ = h('input', { class: 'champ', type: type === 'nombre' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : 'text', step: pas, inputmode: type === 'nombre' ? 'decimal' : null, 'aria-label': libelle, value: courant, placeholder });
      lire = () => champ.value.trim();
    }
    if (type !== 'intelligent') zone.replaceChildren(champ);
    champ.focus();
    const valider = async () => {
      if (fini || creation) return;
      fini = true;
      const v = lire();
      if (String(v) === String(courant ?? '')) { afficher(); return; }
      try {
        await surEnregistrer(type === 'nombre' ? (v === '' ? null : Number(v)) : v);
        courant = type === 'nombre' ? (v === '' ? '' : Number(v)) : v;
      } catch (e) {
        console.warn(e);
        // Une saisie refusée par une règle (erreur marquée `saisie`) montre son message ; la valeur affichée reste celle qui est enregistrée.
        toast(e?.saisie ? e.message : "Enregistrement impossible", { type: 'erreur' });
      }
      afficher();
    };
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && type !== 'zone') { e.preventDefault(); valider(); }
      if (e.key === 'Escape') { e.stopPropagation(); fini = true; afficher(); }
    });
    champ.addEventListener('blur', () => setTimeout(valider, type === 'intelligent' ? 200 : 0));
    if (type === 'select' || type === 'date') champ.addEventListener('change', () => { if (type === 'select') valider(); });
  }
  afficher();
  return {
    element: racine,
    enEdition: () => enEdition,
    maj(v) { if (!enEdition) { courant = v ?? ''; afficher(); } },
  };
}

// ---------------------------------------------------------------- sélecteurs intelligents

const elementsOrganisations = () => D.etat.organisations.filter((o) => !o.archive).map((o) => ({ id: o.id, libelle: o.nom, sousTitre: o.ville || o.secteur || '' }));
const elementsPersonnes = () => D.etat.personnes.filter((p) => !p.archive).map((p) => {
  const org = D.organisation(p.organisationId);
  return { id: p.id, libelle: p.nom, sousTitre: org?.nom || L.premierEmail(p), extra: [org?.nom, ...(p.emails || []).map((e) => e.valeur)].filter(Boolean) };
});
const elementsEtiquettes = () => D.etat.etiquettes.map((e) => ({ id: e.id, libelle: e.nom, couleur: e.couleur }));

/** Champ "Organisation" : choisir une existante ou la créer à la volée. */
export function selecteurOrganisation({ valeurId = null, surChoix = () => {}, etiquette = 'Organisation', placeholder = 'Organisation' } = {}) {
  const org = valeurId ? D.organisation(valeurId) : null;
  return champIntelligent({
    etiquette, placeholder, icone: 'building-2',
    valeur: org ? { id: org.id, libelle: org.nom } : null,
    fournir: (saisie) => L.rechercherSuggestions(saisie, elementsOrganisations(), { creer: true }),
    surCreation: async (texte) => {
      const id = await D.creerOrganisation({ nom: texte });
      return { id, libelle: L.nettoyerEspaces(texte) };
    },
    surChoix,
  });
}

/**
 * Au moment d'enregistrer : l'organisation choisie, sinon celle dont le nom tapé est identique, sinon une nouvelle
 * (créée avec le texte tapé), sinon null.
 */
export async function organisationChoisieOuSaisie(selecteur) {
  const choix = selecteur.choix();
  if (choix) return choix.id;
  const texte = selecteur.texte();
  if (!texte) return null;
  const existante = L.trouverDoublonsOrganisation(D.etat.organisations, texte)[0];
  if (existante) return existante.id;
  return D.creerOrganisation({ nom: texte });
}

/** Champ "Personne". */
export function selecteurPersonne({ valeurId = null, surChoix = () => {}, etiquette = 'Personne', placeholder = 'Personne' } = {}) {
  const p = valeurId ? D.personne(valeurId) : null;
  return champIntelligent({
    etiquette, placeholder, icone: 'user',
    valeur: p ? { id: p.id, libelle: p.nom } : null,
    fournir: (saisie) => L.rechercherSuggestions(saisie, elementsPersonnes(), { creer: true }),
    surCreation: async (texte) => {
      const id = await D.creerPersonne({ nom: texte });
      return { id, libelle: L.nettoyerEspaces(texte) };
    },
    surChoix,
  });
}

/** Champ "Étiquettes" à choix multiple, avec création à la volée. */
export function selecteurEtiquettes({ valeurIds = [], surChoix = () => {} } = {}) {
  const valeur = valeurIds.map((id) => elementsEtiquettes().find((e) => e.id === id)).filter(Boolean);
  return champIntelligent({
    etiquette: 'Étiquettes', placeholder: 'Ajouter des étiquettes', icone: 'tag', multiple: true, valeur,
    fournir: (saisie) => {
      const r = L.rechercherSuggestions(saisie, elementsEtiquettes(), { creer: true });
      return r;
    },
    surCreation: async (texte) => {
      const id = await D.creerEtiquette(texte);
      const e = D.etat.etiquettes.find((x) => x.id === id);
      return { id, libelle: L.nettoyerEspaces(texte), couleur: e?.couleur };
    },
    surChoix,
  });
}

/** Suggestions pour un texte libre à partir de valeurs existantes (ville, secteur, source). */
export function fournisseurTexte(valeurs, { creer = false } = {}) {
  return (saisie) => {
    const uniques = [...new Map(valeurs().filter(Boolean).map((v) => [L.normaliserNom(v), v])).values()];
    return L.rechercherSuggestions(saisie, uniques.map((v) => ({ id: v, libelle: v })), { creer });
  };
}

export const villesConnues = () => [...D.etat.personnes.map((p) => p.ville), ...D.etat.organisations.map((o) => o.ville)];

/** Contacts à plusieurs lignes (téléphones, emails) : valeur + type, "+ Ajouter". */
export function listeContacts({ libelle, ajout, valeurs = [], type = 'texte', surChangement, placeholder = '' }) {
  let lignes = valeurs.length ? valeurs.map((v) => ({ ...v })) : [{ valeur: '', type: 'travail' }];
  const zone = h('div', { class: 'liste-contacts' });
  function rendre() {
    remplir(zone, lignes.map((l, i) => h('div', { class: 'ligne-contact' },
      h('input', { class: 'champ', type: type === 'email' ? 'email' : 'tel', inputmode: type === 'email' ? 'email' : 'tel', autocomplete: 'off', 'aria-label': `${libelle} ${i + 1}`, placeholder: i === 0 ? placeholder : '', value: l.valeur,
        oninput: (e) => { l.valeur = e.target.value; surChangement?.(lignes); } }),
      h('select', { class: 'champ champ-type', 'aria-label': `Type de ${libelle.toLowerCase()} ${i + 1}`, onchange: (e) => { l.type = e.target.value; surChangement?.(lignes); } },
        L.TYPES_CONTACT.map((t) => h('option', { value: t.id, selected: t.id === l.type }, t.libelle))))),
    h('button', { type: 'button', class: 'lien-ajout', onclick: () => { lignes.push({ valeur: '', type: 'travail' }); rendre(); zone.querySelectorAll('input').item(lignes.length - 1)?.focus(); } }, icone('plus', { taille: 14 }), ajout));
  }
  rendre();
  return { element: zone, valeurs: () => lignes.map((l) => ({ ...l })).filter((l) => L.nettoyerEspaces(l.valeur)) };
}

// ---------------------------------------------------------------- cartes d'affaire

/** Barre de progression par étape (une case par étape, colorée jusqu'à l'étape actuelle). */
export function barreEtapes(affaire) {
  const etapes = L.etapesActives(D.etat.config);
  const index = etapes.findIndex((e) => e.id === affaire.etape);
  return h('span', { class: `barre-etapes statut-${affaire.statut}`, role: 'img', 'aria-label': `Étape : ${L.libelleEtape(affaire.etape, D.etat.config)}` },
    etapes.map((e, i) => h('span', { class: `segment${i <= index ? ' plein' : ''}`, style: { '--couleur': e.couleur } })));
}

/** Petite carte d'une affaire (sections "Affaires" des fiches). */
export function carteAffaireMini(a) {
  return h('a', { class: 'carte-affaire-mini', href: cheminAffaire(a.id), dataset: { affaire: a.id } },
    h('span', { class: 'carte-affaire-titre' }, a.titre),
    h('span', { class: 'carte-affaire-meta' }, a.montant !== null && a.montant !== undefined ? L.formatEuros(a.montant) : '—', ' · ', a.statut === 'ouverte' || a.statut === 'gagnee' ? L.libelleEtape(a.etape, D.etat.config) : L.libelleStatut(a.statut)),
    barreEtapes(a));
}

// ---------------------------------------------------------------- éléments communs des fiches

export const COMPTES = [
  { email: 'jerome.chevalier@gmail.com', nom: 'Jérôme' },
  { email: 'jeromebot.chevalierbot@gmail.com', nom: 'Charles' },
];

/** Titre de fiche modifiable en place (enregistré en quittant le champ). */
export function titreEditable({ valeur, libelle, surEnregistrer }) {
  const champ = h('input', { class: 'titre-editable', type: 'text', value: valeur, 'aria-label': libelle, autocomplete: 'off',
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); champ.blur(); } if (e.key === 'Escape') { champ.value = valeur; champ.blur(); } },
    onblur: async () => {
      const v = L.nettoyerEspaces(champ.value);
      if (!v) { champ.value = valeur; return; }
      if (v === valeur) return;
      try { await surEnregistrer(v); valeur = v; } catch (e) { console.warn(e); champ.value = valeur; toast('Enregistrement impossible', { type: 'erreur' }); }
    } });
  return champ;
}

/** Propriétaire d'une fiche : le compte qui l'a créée, modifiable. */
export function selectProprietaire({ valeur, surChoix }) {
  // Chez un client, les comptes Jérôme et Charles ne sont pas ses comptes : le propriétaire s'affiche, sans liste de choix.
  if (estChezClient()) return valeur ? h('p', { class: 'proprietaire' }, h('span', { class: 'etiquette' }, 'Propriétaire'), ' ', valeur) : null;
  const options = COMPTES.some((c) => c.email === valeur) ? COMPTES : [...COMPTES, { email: valeur, nom: valeur }];
  return h('label', { class: 'proprietaire' },
    h('span', { class: 'etiquette' }, 'Propriétaire'),
    h('select', { class: 'champ champ-petit', 'aria-label': 'Propriétaire', onchange: (e) => surChoix(e.target.value) },
      options.map((c) => h('option', { value: c.email, selected: c.email === valeur }, c.nom))));
}

/** Gabarit commun : en tête, colonne de gauche (sections), colonne de droite (activité, notes, historique). */
export function gabaritFiche({ entete, gauche, droite }) {
  return h('div', { class: 'page fiche' }, entete,
    h('div', { class: 'fiche-grille' }, h('div', { class: 'fiche-gauche' }, gauche), h('aside', { class: 'fiche-droite', 'aria-label': 'Activité et historique' }, droite)));
}

/** Retour vers la liste, affiché en haut des fiches. */
export function lienRetour(chemin, libelle) {
  return h('a', { class: 'lien-retour', href: chemin }, icone('chevron-left', { taille: 16 }), libelle);
}

/**
 * Vrai quand le focus est dans un champ de saisie du conteneur : on ne reconstruit pas pendant la frappe.
 * Les boutons d'un formulaire marqué `data-saisie` comptent aussi (ex. « Demain » du formulaire d'ajout de tâche) : sinon un rafraîchissement
 * qui arrive juste après le clic vide ce qui vient d'être tapé.
 */
export function saisieEnCours(conteneur) {
  const a = document.activeElement;
  if (!a || !conteneur.contains(a)) return false;
  if (a.closest('[data-saisie]')) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName) && !['checkbox', 'radio', 'button'].includes(a.type);
}

/** Ligne "Email" ou "Téléphone" d'un résumé : liens avec leur type. */
export function lignesContact(liste, genre) {
  return (liste || []).map((c) => h('div', { class: 'contact-ligne' }, icone(genre === 'email' ? 'mail' : 'phone', { taille: 15 }),
    h('a', { href: genre === 'email' ? `mailto:${c.valeur}` : `tel:${c.valeur.replace(/\s+/g, '')}` }, c.valeur),
    h('span', { class: 'contact-type' }, `(${L.libelleTypeContact(c.type)})`),
    genre === 'email' ? h('button', { type: 'button', class: 'bouton-icone bouton-copier', 'aria-label': `Copier ${c.valeur}`, title: 'Copier l’adresse',
      onclick: async () => {
        try { await navigator.clipboard.writeText(c.valeur); toast('Adresse copiée'); } catch (e) { console.warn(e); toast('Copie impossible', { type: 'erreur' }); }
      } }, icone('copy', { taille: 14 })) : null));
}

// ---------------------------------------------------------------- aides diverses

/** Anime ou non le téléchargement d'un texte (export). */
export function telecharger(nom, contenu, type) {
  const blob = new Blob([contenu], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: nom });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Évite les rafraîchissements en rafale : un seul rendu par image. */
export function planifier(fonction) {
  let attente = false;
  return () => {
    if (attente) return;
    attente = true;
    requestAnimationFrame(() => { attente = false; fonction(); });
  };
}
