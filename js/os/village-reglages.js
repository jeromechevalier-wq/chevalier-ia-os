// Roue dentée de l'accueil « village » (27/11/2026, docs/accueil-village.md étape 1) : la fenêtre « Réglages de l'accueil », qui ne contient QUE des réglages
// de l'accueil (au début : « Animations »), jamais un réglage de l'application (ceux-là sont dans la Mairie, c'est-à-dire la page Réglages).
// Stockage : LOCAL au navigateur (localStorage, par lirePreference / ecrirePreference de js/os/ui.js), comme le thème : le choix vaut pour cet appareil et ce
// navigateur, pas d'un appareil à l'autre ni par compte. Pas de Firestore, pas de règle, pas de serveur. Le suivi « d'un appareil à l'autre » viendra avec les
// données par utilisateur de l'étape 2. Stockage indisponible : les animations restent allumées, le choix n'est pas gardé, aucune erreur.
// Aucun son. Textes posés par h() (nœuds texte), jamais par innerHTML. Pas d'attribut `title` (pas d'infobulle grise sur la page du village).
import { h, icone, dialogue, lirePreference, ecrirePreference } from './ui.js';

export const CLE_ANIMATIONS = 'accueil-animations';
// Dernier choix fait pendant cette visite (null = aucun) : en navigation privée sans stockage, la case est quand même respectée jusqu'au rechargement.
let choixAnimations = null;

/** Vrai si l'utilisateur a coupé les animations de l'accueil sur cet appareil (absent = allumées). */
export function animationsCoupees() {
  return (choixAnimations ?? lirePreference(CLE_ANIMATIONS, 'oui')) === 'non';
}

/** Ouvre la fenêtre « Réglages de l'accueil ». Un changement s'applique tout de suite (pas de bouton « Enregistrer »). */
function ouvrirReglagesAccueil(surChangement) {
  const interrupteur = h('input', {
    type: 'checkbox', role: 'switch', checked: !animationsCoupees(), dataset: { role: 'animations-accueil' },
    onchange: (e) => { choixAnimations = e.target.checked ? 'oui' : 'non'; ecrirePreference(CLE_ANIMATIONS, choixAnimations); surChangement?.(); },
  });
  const contenu = h('div', { class: 'reglages-accueil' },
    h('label', { class: 'case' }, interrupteur, h('strong', {}, 'Animations')),
    h('p', { class: 'aide' }, 'Décoche pour couper les animations du village. Ton choix est gardé sur cet appareil.'));
  return dialogue({ titre: 'Réglages de l’accueil', contenu, boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }] });
}

/** Bouton roue dentée (en haut à droite du village). `surChangement()` : appelé après chaque changement d'un réglage de l'accueil. */
export function boutonReglagesAccueil({ surChangement } = {}) {
  return h('button', {
    type: 'button', class: 'bouton-icone village-roue', 'aria-label': 'Réglages de l’accueil', dataset: { role: 'reglages-accueil' },
    onclick: () => ouvrirReglagesAccueil(surChangement),
  }, icone('settings'));
}
