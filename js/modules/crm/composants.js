// Composants du module CRM partagés par les listes et les fiches : sections repliables, propriétés à
// compléter ("+ Ajouter"), pastilles, liens, sélecteurs intelligents (organisation, personne, étiquettes…).
import { h, icone, remplir, champIntelligent, dialogue, lirePreference, ecrirePreference, toast } from '../../os/ui.js';
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
/**
 * Liens « personne » et « organisation » de l'en-tête d'une fiche (à côté de l'étiquette d'état).
 * `lire()` renvoie { personneId, organisationId } à jour. `maj()` ne redessine que ce bloc : on s'en sert quand la fiche n'est pas refaite
 * parce qu'une saisie est en cours (le choix dans le Résumé garde le focus), sinon le lien n'apparaissait qu'après un rechargement.
 */
export function liensEntete(lire) {
  const element = h('div', { class: 'fiche-liens', dataset: { zone: 'liens-entete' } });
  const maj = () => {
    const { personneId, organisationId } = lire() || {};
    const p = personneId ? D.personne(personneId) : null;
    const o = organisationId ? D.organisation(organisationId) : null;
    remplir(element,
      p ? h('span', {}, icone('user', { taille: 14 }), lienPersonne(p)) : null,
      o ? h('span', {}, icone('building-2', { taille: 14 }), lienOrganisation(o)) : null);
  };
  maj();
  return { element, maj };
}

/** Met à jour la valeur affichée d'un sélecteur (Personne, Organisation) sans rien écrire, sauf si on est en train de taper dedans. */
export function afficherSelecteur(selecteur, element, versChoix) {
  if (document.activeElement === selecteur.entree) return;
  const actuel = selecteur.choix();
  const voulu = element ? versChoix(element) : null;
  if ((actuel?.id ?? null) === (voulu?.id ?? null)) return;
  selecteur.afficher(voulu);
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
  return h('span', { class: 'pastille-etiquette', style: { '--couleur': e.couleur || L.COULEURS_ETIQUETTES[0] } }, e.nom);
}

export function pastillesEtiquettes(ids) {
  const liste = (ids || []).map((id) => D.etat.etiquettes.find((e) => e.id === id)).filter(Boolean);
  return liste.length ? h('span', { class: 'groupe-pastilles' }, liste.map(pastilleEtiquette)) : null;
}

export function pastilleStatut(statut) {
  const s = L.STATUTS.find((x) => x.id === statut);
  return h('span', { class: `pastille-statut statut-${statut}`, style: { '--couleur': s?.couleur || '#8d8993' } }, L.libelleStatut(statut));
}

/** Ce que veut dire l'étiquette d'état d'une affaire (icône « i » à côté, une seule fois sous le titre). */
export const EXPLICATION_STATUT_AFFAIRE = {
  ouverte: 'L’affaire est en cours : elle avance d’étape en étape.',
  gagnee: 'L’affaire est gagnée : la vente est conclue.',
  perdue: 'L’affaire est perdue : elle ne bouge plus. On peut la rouvrir.',
  en_pause: 'L’affaire est mise de côté jusqu’à sa date de réveil. On peut la rouvrir.',
};

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
  // Même comportement partout : la bulle s'affiche au survol (souris), au focus (clavier) et au toucher (téléphone) ; Échap ou un clic ailleurs la ferme.
  const bulle = h('span', { class: 'bulle-info', role: 'tooltip', dataset: { role: 'bulle-info' } }, t);
  const bouton = h('button', { type: 'button', class: 'bouton-info', 'aria-label': `Explication${nom ? ` : ${nom}` : ''} : ${t}`, 'data-role': 'info' }, icone('info', { taille: 14 }), bulle);
  const placer = () => { // la bulle reste dans l'écran (téléphone : l'icône peut être près d'un bord)
    const r = bouton.getBoundingClientRect();
    const largeur = Math.min(280, window.innerWidth - 24);
    bulle.style.width = `${largeur}px`;
    bulle.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - largeur / 2, window.innerWidth - largeur - 12))}px`;
    bulle.style.top = `${r.bottom + 8}px`;
  };
  // Au toucher, un appui ailleurs ferme la bulle (le « blur » n'arrive pas toujours sur un téléphone).
  const fermerSiAilleurs = (e) => { if (!bouton.contains(e.target)) fermer(); };
  const ouvrir = () => { placer(); bouton.classList.add('ouvert'); document.addEventListener('pointerdown', fermerSiAilleurs, true); };
  function fermer() { bouton.classList.remove('ouvert'); document.removeEventListener('pointerdown', fermerSiAilleurs, true); }
  bouton.addEventListener('mouseenter', ouvrir);
  bouton.addEventListener('mouseleave', () => { if (document.activeElement !== bouton) fermer(); });
  bouton.addEventListener('focus', ouvrir);
  bouton.addEventListener('blur', fermer);
  bouton.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } });
  bouton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (bouton.classList.contains('ouvert') && document.activeElement !== bouton) fermer(); else ouvrir(); });
  return bouton;
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
/**
 * La ligne « Étiquette  + Ajouter » (texte jaune sans cadre) : le style unique pour ajouter à une liste ou à un champ.
 * `fantome` (facultatif) : un texte gris d'exemple (ex. « 999 € ») affiché à la place de « + Ajouter » ; ce n'est jamais une vraie valeur.
 */
export function boutonAjouter({ libelleAria, surClic, fantome = null, action = null, attributs = {} }) {
  return h('button', { type: 'button', class: `prop-vide${fantome ? ' prop-fantome' : ''}`, onclick: surClic, 'aria-label': libelleAria, 'data-action': action, ...attributs },
    ...(fantome ? [fantome] : [icone('plus', { taille: 14 }), 'Ajouter']));
}
export function ligneAjouter({ libelle, libelleAria, surClic, action = null }) { // (sans icône « i » : voir liens-documents.js pour une ligne avec « i »)
  return h('div', { class: 'prop prop-ajouter' }, h('span', { class: 'prop-libelle' }, libelle),
    h('div', { class: 'prop-valeur' }, boutonAjouter({ libelleAria: libelleAria || `Ajouter : ${libelle}`, surClic, action })));
}

export function champPropriete({ libelle, valeur = '', type = 'texte', options = [], surEnregistrer, placeholder = '', formater = null, lienVers = null, fournir = null, pas = null, fantome = null, autoriserCreation = true, aideListeVide = '' }) {
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
      remplir(zone, boutonAjouter({ libelleAria: `Ajouter : ${libelle}`, surClic: ouvrirEdition, fantome }));
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
      // `autoriserCreation: false` (la Source) : on choisit seulement dans la liste des Réglages ; une ancienne valeur absente de la liste reste affichée,
      // grisée « (valeur à changer) », et n'est pas perdue tant qu'on ne choisit pas autre chose.
      const liste = fournir?.() ?? [];
      const exacte = courant ? liste.find((v) => v === courant) ?? (autoriserCreation ? undefined : liste.find((v) => L.normaliserNom(v) === L.normaliserNom(courant))) : undefined;
      const absente = autoriserCreation || !courant || exacte !== undefined ? null : courant;
      const choix = [...new Set([...liste, ...(courant && autoriserCreation ? [courant] : [])])];
      champ = h('select', { class: 'champ', 'aria-label': libelle }, h('option', { value: '' }, '—'),
        choix.map((v) => h('option', { value: v, selected: autoriserCreation ? v === courant : v === exacte }, v)),
        absente ? h('option', { value: absente, selected: true, disabled: true }, `${absente} (valeur à changer)`) : null,
        !autoriserCreation && !choix.length && aideListeVide ? h('option', { value: '', disabled: true }, aideListeVide) : null,
        autoriserCreation ? h('option', { value: NOUVEAU }, '+ Nouvelle valeur…') : null);
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
      champ = h('input', { class: 'champ', type: type === 'nombre' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text', step: pas, inputmode: type === 'nombre' ? 'decimal' : type === 'email' ? 'email' : type === 'tel' ? 'tel' : null, 'aria-label': libelle, value: courant, placeholder });
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

const MESSAGE_ETIQUETTE_NON_ENREGISTREE = 'Étiquette non enregistrée : vérifie ta connexion, puis réessaie.';

/**
 * Champ « Étiquettes » : les étiquettes choisies en pastilles (la croix retire de la fiche, sans toucher aux Réglages) et un bouton « Étiquettes »
 * qui ouvre la liste de TOUTES les étiquettes à cocher, avec « + Nouvelle étiquette » en bas. Chaque case s'enregistre toute seule : `surChoix(liste)`
 * est appelé à chaque changement avec les étiquettes choisies ([{ id, libelle, couleur }]) ; s'il échoue, le choix revient en arrière et un message le dit.
 * `creer(nom)` crée l'étiquette dans les Réglages et renvoie son id (D.creerEtiquette par défaut ; réglable pour les essais).
 * Renvoie { element, ids() }.
 */
export function selecteurEtiquettes({ valeurIds = [], surChoix = () => {}, creer = (nom) => D.creerEtiquette(nom) } = {}) {
  let ids = valeurIds.filter((id) => D.etat.etiquettes.some((e) => e.id === id));
  const zone = h('span', { class: 'etiquettes-choisies' });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'choisir-etiquettes', onclick: () => ouvrir() },
    icone('tag', { taille: 14 }), 'Étiquettes');
  const element = h('div', { class: 'selecteur-etiquettes' }, zone, bouton);
  let rafraichirFenetre = () => {};
  const creees = new Map(); // étiquettes créées depuis ce champ : { id, nom, couleur }
  const choisies = () => ids.map((id) => D.etat.etiquettes.find((e) => e.id === id) || creees.get(id)).filter(Boolean).map((e) => ({ id: e.id, libelle: e.nom, couleur: e.couleur }));

  function rendre() {
    remplir(zone, ...choisies().map((el) => h('span', { class: 'pastille-choix', 'data-etiquette': el.id, style: { '--couleur': el.couleur || L.COULEURS_ETIQUETTES[0] } },
      el.libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer ${el.libelle}`, onclick: () => appliquer(ids.filter((x) => x !== el.id)) }, icone('x', { taille: 12 })))));
  }
  /** Enregistre le nouveau choix tout de suite ; en cas d'échec, revient au choix d'avant et le dit. */
  async function appliquer(nouveaux) {
    const avant = ids;
    ids = nouveaux;
    rendre();
    try {
      await surChoix(choisies());
      return true;
    } catch {
      ids = avant;
      rendre();
      rafraichirFenetre();
      toast(MESSAGE_ETIQUETTE_NON_ENREGISTREE, { type: 'erreur' });
      return false;
    }
  }

  function ouvrir() {
    const zoneEcran = element.closest('#app') || document.body; // la fiche se refait : on retrouve le nouveau bouton dans l'écran, pas dans le document entier
    const liste = h('div', { class: 'liste-etiquettes', role: 'group', 'aria-label': 'Étiquettes' });
    const message = h('p', { class: 'erreur', role: 'alert' });
    const nom = h('input', { type: 'text', class: 'champ', 'aria-label': 'Nom de la nouvelle étiquette', placeholder: 'Nom de l’étiquette', autocomplete: 'off', maxlength: '60' });
    const creerBouton = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'creer-etiquette', disabled: true }, 'Créer');
    function rendreListe() {
      const toutes = D.etat.etiquettes;
      remplir(liste, ...(toutes.length
        ? toutes.map((e) => h('label', { class: 'case ligne-etiquette', 'data-etiquette': e.id },
          h('input', { type: 'checkbox', checked: ids.includes(e.id), onchange: (ev) => appliquer(ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id)) }),
          h('span', { class: 'puce-couleur', style: { background: e.couleur || L.COULEURS_ETIQUETTES[0] } }), e.nom))
        : [h('p', { class: 'vide-liste' }, 'Aucune étiquette pour le moment.')]));
    }
    rafraichirFenetre = rendreListe;
    rendreListe();
    nom.addEventListener('input', () => { creerBouton.disabled = !L.nettoyerEspaces(nom.value); message.textContent = ''; });
    let enCours = false;
    async function creerEtCocher() {
      const texte = L.nettoyerEspaces(nom.value);
      if (!texte || enCours) return;
      message.textContent = '';
      if (L.etiquetteEnDoublon(texte, D.etat.etiquettes)) { message.textContent = 'Cette étiquette existe déjà.'; return; }
      enCours = true;
      try {
        const couleur = L.couleurEtiquetteSuivante(D.etat.etiquettes);
        const id = await creer(texte);
        // L'étiquette qu'on vient de créer est connue d'ici même : on ne dépend pas du moment où la liste des Réglages se met à jour.
        creees.set(id, { id, nom: texte, couleur });
        nom.value = '';
        creerBouton.disabled = true;
        await appliquer([...ids, id]);
        rendreListe();
        nom.focus();
      } catch {
        message.textContent = 'Étiquette non créée : vérifie ta connexion, puis réessaie.';
      } finally {
        enCours = false;
      }
    }
    creerBouton.addEventListener('click', creerEtCocher);
    nom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); creerEtCocher(); } });
    const contenu = h('div', { class: 'pile' }, liste,
      h('div', { class: 'nouvelle-etiquette' }, h('span', { class: 'etiquette' }, '+ Nouvelle étiquette'),
        h('div', { class: 'ligne-creation' }, nom, creerBouton), message));
    dialogue({
      titre: 'Étiquettes', classe: 'dialogue-formulaire dialogue-etiquettes', contenu,
      boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
      // dialogue() gère Échap mais pas Tab : on garde le focus dans la fenêtre.
      auMontage: ({ boite }) => boite.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const cibles = [...boite.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && !x.hidden && x.getClientRects().length);
        if (!cibles.length) return;
        const premier = cibles[0];
        const dernier = cibles.at(-1);
        if (!boite.contains(document.activeElement)) { e.preventDefault(); premier.focus(); }
        else if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      }),
    }).then(() => {
      rafraichirFenetre = () => {};
      // La fiche se refait après chaque enregistrement : le bouton d'avant n'existe plus, le focus revient sur le nouveau.
      if (!bouton.isConnected) zoneEcran.querySelector('[data-action="choisir-etiquettes"]')?.focus();
    });
  }

  rendre();
  return { element, ids: () => [...ids] };
}

/** Suggestions pour un texte libre à partir de valeurs existantes (ville, secteur, source). */
export function fournisseurTexte(valeurs, { creer = false } = {}) {
  return (saisie) => {
    const uniques = [...new Map(valeurs().filter(Boolean).map((v) => [L.normaliserNom(v), v])).values()];
    return L.rechercherSuggestions(saisie, uniques.map((v) => ({ id: v, libelle: v })), { creer });
  };
}

export const villesConnues = () => [...D.etat.personnes.map((p) => p.ville), ...D.etat.organisations.map((o) => o.ville)];

/** Suggestions de villes déjà utilisées (même regroupement que le filtre : « manosque », « Manosque  » = une seule proposition) ; un nouveau nom reste possible (L4). */
export function fournisseurVilles() {
  return (saisie) => L.rechercherSuggestions(saisie, L.regrouperVilles(villesConnues()).map((v) => ({ id: v.libelle, libelle: v.libelle })), { creer: false });
}

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

/** Propriétaire d'une fiche : le compte qui l'a créée, modifiable. Ligne du Résumé (ou du premier bloc de champs), comme les autres propriétés. */
export function selectProprietaire({ valeur, surChoix }) {
  // Chez un client, les comptes Jérôme et Charles ne sont pas ses comptes : le propriétaire s'affiche, sans liste de choix.
  if (estChezClient()) {
    return valeur ? h('div', { class: 'prop', dataset: { prop: 'proprietaire' } }, h('span', { class: 'prop-libelle' }, 'Propriétaire'), h('div', { class: 'prop-valeur' }, valeur)) : null;
  }
  const options = !valeur || COMPTES.some((c) => c.email === valeur) ? COMPTES : [...COMPTES, { email: valeur, nom: valeur }];
  return h('div', { class: 'prop', dataset: { prop: 'proprietaire' } },
    h('span', { class: 'prop-libelle' }, 'Propriétaire'),
    h('div', { class: 'prop-valeur' },
      h('select', { class: 'champ', 'aria-label': 'Propriétaire',
        onchange: async (e) => {
          const avant = valeur;
          try { await surChoix(e.target.value); valeur = e.target.value; } catch (err) {
            console.warn(err);
            e.target.value = avant || '';
            toast('Enregistrement impossible : vérifie ta connexion, puis choisis de nouveau.', { type: 'erreur' });
          }
        } },
        // Sans propriétaire : une première ligne « — » sélectionnée mais non choisissable (on n'écrit jamais de propriétaire vide).
        valeur ? null : h('option', { value: '', selected: true, disabled: true }, '—'),
        options.map((c) => h('option', { value: c.email, selected: c.email === valeur }, c.nom)))));
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
