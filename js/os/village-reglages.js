// Roue dentée de l'accueil « village » (27/11/2026, docs/accueil-village.md étape 1) : la fenêtre « Réglages de l'accueil », qui ne contient QUE des réglages
// de l'accueil (au début : « Animations »), jamais un réglage de l'application (ceux-là sont dans la Mairie, c'est-à-dire la page Réglages).
// Stockage : LOCAL au navigateur (localStorage, par lirePreference / ecrirePreference de js/os/ui.js), comme le thème : le choix vaut pour cet appareil et ce
// navigateur, pas d'un appareil à l'autre ni par compte. Pas de Firestore, pas de règle, pas de serveur. Le suivi « d'un appareil à l'autre » viendra avec les
// données par utilisateur de l'étape 2. Stockage indisponible : les animations restent allumées, le choix n'est pas gardé, aucune erreur.
// Aucun son. Textes posés par h() (nœuds texte), jamais par innerHTML. Pas d'attribut `title` (pas d'infobulle grise sur la page du village).
// Étape 2 (27/11/2026, village rangé par chaque utilisateur) : la même fenêtre gagne la partie « Afficher ou ajouter une maison » (besoins cachés ou hors du
// village de départ), seulement quand le rangement est possible (rangement lu) ; et la fenêtre d'une maison (double clic, ou appui long sur téléphone) :
// son nom (pour soi seul) et « Cacher cette maison ». Les écritures passent par l'écran (js/os/village-ecran.js), qui seul parle à js/os/village-donnees.js.
// Étape 3b (27/11/2026, liens externes) : la roue gagne « Ajouter un lien externe » (6 au plus) et la fenêtre d'un lien (nom, adresse, image prise SEULEMENT
// dans le catalogue des dessins, aucun envoi de fichier ; « Retirer du village »). L'adresse passe par adresseExterne (js/os/village-damier.js).
import { h, icone, dialogue, confirmer, toast, lirePreference, ecrirePreference } from './ui.js';
import { BATIMENTS, CATALOGUE, BATIMENT_PAR_DEFAUT } from './village-batiments.js';
import { adresseExterne, nomCourt, LIENS_MAX } from './village-damier.js';

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
 * { cachees: [{ id, besoin, raison }], plein, telephone, dessin(batiment), surAfficher(entree) → Promise<bool>,
 *   liens (nombre de liens externes), surAjouterLien({ nom, url, batiment }) → Promise<bool> }.
 * `fermerRoue()` : ferme la fenêtre de la roue (après l'ajout d'un lien, pour voir la nouvelle maison).
 */
function partieMaisons(maisons, fermerRoue) {
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
    enfants.push(partieLiens(e, fermerRoue));
    enfants.push(h('p', { class: 'aide', dataset: { role: 'aide-gestes' } }, e.telephone ? 'Appui long sur une maison : ses réglages.' : 'Glisse une maison pour la déplacer. Double clic sur une maison : ses réglages.'));
    zone.replaceChildren(...enfants);
  };
  remplirZone();
  return zone;
}

/** Bouton « Ajouter un lien externe » de la roue : grisé avec « 6 liens au plus. » à la limite, et avec la phrase du village plein. */
function partieLiens(e, fermerRoue) {
  const limite = e.liens >= LIENS_MAX;
  const raison = limite ? `${LIENS_MAX} liens au plus.` : e.plein ? 'Ton village est plein : cache une maison pour faire de la place.' : null;
  const bouton = h('button', {
    type: 'button', class: 'bouton bouton-secondaire', disabled: Boolean(raison), dataset: { role: 'ajouter-lien' },
    onclick: () => {
      fenetreLien(null, {
        dessin: e.dessin,
        surEnregistrer: (valeurs) => e.surAjouterLien(valeurs),
      }).then((ok) => { if (ok) fermerRoue?.(); });
    },
  }, icone('external-link'), 'Ajouter un lien externe');
  return h('div', { class: 'village-liens', dataset: { role: 'partie-liens' } },
    h('strong', {}, 'Liens externes'),
    h('p', { class: 'aide' }, 'Une maison qui ouvre un site (le tien, celui d’un fournisseur…) dans un nouvel onglet.'),
    bouton,
    raison ? h('p', { class: 'aide', dataset: { role: 'liens-raison' } }, raison) : null);
}

/** Ouvre la fenêtre « Réglages de l'accueil ». Un changement s'applique tout de suite (pas de bouton « Enregistrer »). */
function ouvrirReglagesAccueil(surChangement, maisons) {
  let fermerRoue = null;
  const interrupteur = h('input', {
    type: 'checkbox', role: 'switch', checked: !animationsCoupees(), dataset: { role: 'animations-accueil' },
    onchange: (e) => { choixAnimations = e.target.checked ? 'oui' : 'non'; ecrirePreference(CLE_ANIMATIONS, choixAnimations); surChangement?.(); },
  });
  const contenu = h('div', { class: 'reglages-accueil' },
    h('label', { class: 'case' }, interrupteur, h('strong', {}, 'Animations')),
    h('p', { class: 'aide' }, 'Décoche pour couper les animations du village. Ton choix est gardé sur cet appareil.'),
    partieMaisons(maisons, () => fermerRoue?.(true, true)));
  return dialogue({
    titre: 'Réglages de l’accueil', contenu, auMontage: ({ fermer }) => { fermerRoue = fermer; },
    boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
  });
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

/**
 * Fenêtre d'un lien externe : « Nom », « Adresse du site », « Image » (vignettes du catalogue BATIMENTS, rien d'autre : aucun envoi de fichier), « Enregistrer »
 * (« Ajouter » pour un nouveau lien). `maison` : le lien à modifier, ou null pour en ajouter un. `surEnregistrer({ nom, url, batiment })` → Promise<bool | phrase de refus> ;
 * `surRetirer()` → Promise<bool> (lien existant seulement : « Retirer du village », après confirmation, puis « Lien retiré » avec « Annuler » pendant 8 secondes,
 * qui appelle `surRemettre()` → Promise<bool> : le lien est recréé). Rend une promesse : vrai si le lien est enregistré.
 * Une adresse refusée par adresseExterne : son message sous le champ, la fenêtre reste ouverte.
 */
export function fenetreLien(maison, { dessin, surEnregistrer, surRetirer, surRemettre }) {
  const nouveau = !maison;
  const nom = h('input', { type: 'text', class: 'champ', value: maison?.nom ?? '', maxlength: 40, dataset: { role: 'nom-lien' }, 'aria-describedby': 'erreur-nom-lien' });
  const adresse = h('input', {
    type: 'text', inputmode: 'url', autocomplete: 'url', spellcheck: 'false', class: 'champ', value: maison?.url ?? '', placeholder: 'monsite.fr', maxlength: 300,
    dataset: { role: 'adresse-lien' }, 'aria-describedby': 'erreur-adresse-lien',
  });
  const erreurNom = h('p', { class: 'village-erreur', id: 'erreur-nom-lien', role: 'alert', dataset: { role: 'erreur-nom-lien' }, hidden: true }, 'Donne un nom à ce lien.');
  const erreurAdresse = h('p', { class: 'village-erreur', id: 'erreur-adresse-lien', role: 'alert', dataset: { role: 'erreur-adresse-lien' }, hidden: true });
  const erreur = h('p', { class: 'village-erreur', role: 'alert', dataset: { role: 'erreur-lien' }, hidden: true }, ECHEC);
  const choisi = BATIMENTS.includes(maison?.besoin?.batiment) ? maison.besoin.batiment : BATIMENT_PAR_DEFAUT;
  const images = h('div', { class: 'village-images', role: 'radiogroup', 'aria-label': 'Image', dataset: { role: 'images-lien' } },
    BATIMENTS.map((id) => h('label', { class: 'village-image', dataset: { batiment: id } },
      h('input', { type: 'radio', name: 'image-lien', value: id, checked: id === choisi, 'aria-label': CATALOGUE[id].nom }),
      h('span', { class: 'village-liste-vignette', 'aria-hidden': 'true' }, dessin(id)))));
  let fermerFenetre = null;
  const retirer = !nouveau && surRetirer ? h('button', {
    type: 'button', class: 'bouton bouton-secondaire', dataset: { role: 'retirer-lien' },
    onclick: async () => {
      if (!(await confirmer('Retirer ce lien ?', `La maison « ${maison.nom} » quitte ton village.`, { libelleOk: 'Retirer', danger: true }))) return;
      retirer.disabled = true;
      const ok = await surRetirer();
      retirer.disabled = false;
      if (!ok) { erreur.hidden = false; return; }
      fermerFenetre?.(false, true);
      toast('Lien retiré', {
        duree: 8000,
        action: {
          libelle: 'Annuler',
          surClic: async () => { const r = await surRemettre?.(); if (r !== true) toast(typeof r === 'string' ? r : ECHEC, { type: 'erreur' }); },
        },
      });
    },
  }, icone('trash-2'), 'Retirer du village') : null;
  const contenu = h('div', { class: 'reglages-lien-village' },
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nom'), nom),
    erreurNom,
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Adresse du site'), adresse),
    erreurAdresse,
    h('p', { class: 'aide' }, 'Le site s’ouvre dans un nouvel onglet. Exemple : monsite.fr (https:// est ajouté tout seul)'),
    h('span', { class: 'etiquette' }, 'Image'),
    images,
    retirer ? h('div', { class: 'village-maison-actions' }, retirer) : null,
    erreur);
  return dialogue({
    titre: nouveau ? 'Ajouter un lien externe' : 'Réglages du lien',
    contenu,
    classe: 'dialogue-lien-village',
    auMontage: ({ fermer, boutons }) => {
      fermerFenetre = fermer;
      for (const c of [nom, adresse]) c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); boutons.at(-1).click(); } });
    },
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: nouveau ? 'Ajouter' : 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: async () => {
          const propre = nomCourt(nom.value);
          const controle = adresseExterne(adresse.value);
          erreurNom.hidden = Boolean(propre);
          erreurAdresse.hidden = controle.ok;
          erreurAdresse.textContent = controle.ok ? '' : controle.message;
          erreur.hidden = true;
          if (!propre || !controle.ok) return false;
          const batiment = images.querySelector('input:checked')?.value || BATIMENT_PAR_DEFAUT;
          const r = await surEnregistrer({ nom: propre, url: controle.url, batiment });
          // vrai : enregistré ; une phrase : refus expliqué (6 liens au plus, village plein) ; sinon l'échec habituel
          erreur.textContent = typeof r === 'string' ? r : ECHEC;
          erreur.hidden = r === true;
          return r === true;
        },
      },
    ],
  });
}
