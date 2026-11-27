// Roue dentée de l'accueil « village » (27/11/2026, docs/accueil-village.md étape 1) : la fenêtre « Réglages de l'accueil », qui ne contient QUE des réglages
// de l'accueil (au début : « Animations »), jamais un réglage de l'application (ceux-là sont dans la Mairie, c'est-à-dire la page Réglages).
// Stockage : LOCAL au navigateur (localStorage, par lirePreference / ecrirePreference de js/os/ui.js), comme le thème : le choix vaut pour cet appareil et ce
// navigateur, pas d'un appareil à l'autre ni par compte. Pas de Firestore, pas de règle, pas de serveur. Le suivi « d'un appareil à l'autre » viendra avec les
// données par utilisateur de l'étape 2. Stockage indisponible : les animations restent allumées, le choix n'est pas gardé, aucune erreur.
// Aucun son. Textes posés par h() (nœuds texte), jamais par innerHTML. Pas d'attribut `title` (pas d'infobulle grise sur la page du village).
// Étape 2 (27/11/2026, village rangé par chaque utilisateur) : la même fenêtre gagne la partie « Afficher ou ajouter une maison » (besoins cachés ou hors du
// village de départ), seulement quand le rangement est possible (rangement lu) ; et la fenêtre d'une maison (double clic, ou appui long sur téléphone) :
// son nom (pour soi seul) et « Cacher cette maison ». Les écritures passent par l'écran (js/os/village-ecran.js), qui seul parle à js/os/village-donnees.js.
import { h, icone, dialogue, toast, lirePreference, ecrirePreference } from './ui.js';

export const CLE_ANIMATIONS = 'accueil-animations';
// Dernier choix fait pendant cette visite (null = aucun) : en navigation privée sans stockage, la case est quand même respectée jusqu'au rechargement.
let choixAnimations = null;

/** Vrai si l'utilisateur a coupé les animations de l'accueil sur cet appareil (absent = allumées). */
export function animationsCoupees() {
  return (choixAnimations ?? lirePreference(CLE_ANIMATIONS, 'oui')) === 'non';
}

const ECHEC = 'L’enregistrement a échoué. Réessaie.';

/**
 * Partie « Afficher ou ajouter une maison » de la fenêtre de la roue. `maisons()` rend null (rangement impossible : partie absente) ou
 * { cachees: [{ id, besoin, raison }], plein, telephone, dessin(batiment), surAfficher(entree) → Promise<bool> }.
 */
function partieMaisons(maisons) {
  if (!maisons?.()) return null;
  const zone = h('div', { class: 'village-a-ajouter', dataset: { role: 'maisons-a-ajouter' } });
  const remplirZone = () => {
    const e = maisons();
    if (!e) { zone.replaceChildren(); return; }
    const enfants = [h('strong', {}, 'Afficher ou ajouter une maison')];
    if (!e.cachees.length) enfants.push(h('p', { class: 'aide', dataset: { role: 'maisons-toutes-la' } }, 'Toutes les maisons de ton entreprise sont déjà dans ton village.'));
    else {
      if (e.plein) enfants.push(h('p', { class: 'aide', dataset: { role: 'village-plein' } }, 'Ton village est plein : cache une maison pour faire de la place.'));
      enfants.push(h('ul', { class: 'village-a-ajouter-liste' }, e.cachees.map((c) => {
        const libelle = c.raison === 'cache' ? 'Afficher' : 'Ajouter';
        const bouton = h('button', {
          type: 'button', class: 'bouton bouton-secondaire', disabled: e.plein, dataset: { role: 'afficher-maison', maison: c.id }, 'aria-label': `${libelle} ${c.besoin.nom}`,
          onclick: async () => {
            bouton.disabled = true;
            if (await e.surAfficher(c)) remplirZone();
            else { bouton.disabled = false; toast(ECHEC, { type: 'erreur' }); }
          },
        }, libelle);
        return h('li', { dataset: { maison: c.id } },
          h('span', { class: 'village-liste-vignette', 'aria-hidden': 'true' }, e.dessin(c.besoin.batiment)),
          h('span', { class: 'village-liste-textes' }, h('strong', {}, c.besoin.nom), c.besoin.phrase ? h('small', {}, c.besoin.phrase) : null),
          bouton);
      })));
    }
    enfants.push(h('p', { class: 'aide', dataset: { role: 'aide-gestes' } }, e.telephone ? 'Appui long sur une maison : ses réglages.' : 'Glisse une maison pour la déplacer. Double clic sur une maison : ses réglages.'));
    zone.replaceChildren(...enfants);
  };
  remplirZone();
  return zone;
}

/** Ouvre la fenêtre « Réglages de l'accueil ». Un changement s'applique tout de suite (pas de bouton « Enregistrer »). */
function ouvrirReglagesAccueil(surChangement, maisons) {
  const interrupteur = h('input', {
    type: 'checkbox', role: 'switch', checked: !animationsCoupees(), dataset: { role: 'animations-accueil' },
    onchange: (e) => { choixAnimations = e.target.checked ? 'oui' : 'non'; ecrirePreference(CLE_ANIMATIONS, choixAnimations); surChangement?.(); },
  });
  const contenu = h('div', { class: 'reglages-accueil' },
    h('label', { class: 'case' }, interrupteur, h('strong', {}, 'Animations')),
    h('p', { class: 'aide' }, 'Décoche pour couper les animations du village. Ton choix est gardé sur cet appareil.'),
    partieMaisons(maisons));
  return dialogue({ titre: 'Réglages de l’accueil', contenu, boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }] });
}

/**
 * Bouton roue dentée (en haut à droite du village). `surChangement()` : appelé après chaque changement d'un réglage de l'accueil ;
 * `maisons()` : l'état des maisons à afficher ou ajouter (voir partieMaisons), relu à chaque ouverture et après chaque ajout.
 */
export function boutonReglagesAccueil({ surChangement, maisons } = {}) {
  return h('button', {
    type: 'button', class: 'bouton-icone village-roue', 'aria-label': 'Réglages de l’accueil', dataset: { role: 'reglages-accueil' },
    onclick: () => ouvrirReglagesAccueil(surChangement, maisons),
  }, icone('settings'));
}

/**
 * Fenêtre d'une maison (double clic sur ordinateur, appui long sur téléphone) : « Nom » (pour soi seul ; vide = le nom d'origine), « Cacher cette maison »
 * (effet immédiat, puis « Maison cachée » avec « Annuler » pendant 8 secondes), « Enregistrer ». `surRenommer(nom)`, `surCacher()`, `surMontrer()` : Promise<bool>.
 * Échec d'écriture : la fenêtre reste ouverte avec « L’enregistrement a échoué. Réessaie. ».
 */
export function fenetreMaison(maison, { surRenommer, surCacher, surMontrer }) {
  const champ = h('input', { type: 'text', class: 'champ', value: maison.nom, maxlength: 40, dataset: { role: 'nom-maison' }, 'aria-describedby': 'aide-nom-maison' });
  const erreur = h('p', { class: 'village-erreur', role: 'alert', dataset: { role: 'erreur-maison' }, hidden: true }, ECHEC);
  let fermerFenetre = null;
  const cacher = h('button', {
    type: 'button', class: 'bouton bouton-secondaire', dataset: { role: 'cacher-maison' },
    onclick: async () => {
      cacher.disabled = true;
      const ok = await surCacher();
      cacher.disabled = false;
      if (!ok) { erreur.hidden = false; return; }
      fermerFenetre?.(null, true);
      toast('Maison cachée', {
        duree: 8000,
        action: { libelle: 'Annuler', surClic: async () => { if (!(await surMontrer())) toast(ECHEC, { type: 'erreur' }); } },
      });
    },
  }, icone('eye'), 'Cacher cette maison');
  const contenu = h('div', { class: 'reglages-maison-village' },
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nom'), champ),
    h('p', { class: 'aide', id: 'aide-nom-maison' }, 'Ce nom n’est que pour toi. Vide : le nom d’origine revient.'),
    h('div', { class: 'village-maison-actions' }, cacher),
    erreur);
  return dialogue({
    titre: 'Réglages de la maison',
    contenu,
    auMontage: ({ fermer, boutons }) => {
      fermerFenetre = fermer;
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); boutons.at(-1).click(); } });
    },
    boutons: [
      { libelle: 'Annuler', valeur: null },
      {
        libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: async () => {
          const ok = await surRenommer(champ.value);
          erreur.hidden = ok;
          return ok;
        },
      },
    ],
  });
}
