// Éditeur de devis (route devis/editeur, devis/editeur/<id>) : choisir l'affaire, remplir le chantier, ajouter des lignes (Bordereau, ligne libre, section, sous-section, texte),
// régler la remise et l'acompte, voir le total en direct, l'aperçu, puis finaliser. Un brouillon s'enregistre tout seul (écriture directe, plans de brouillon.js) ;
// finaliser passe par la fonction du serveur. Aucune règle ni aucun calcul ici : les fonctions pures sont dans editeur-logique.js et logique.js.
// UN SEUL ÉCRAN pendant toute la vie du devis (décision de Jérôme, 26/10/2026) : onglets « Édition » et « Prévisualisation » toujours là, mêmes boutons, même feuille.
// Un devis qui n'est plus un brouillon s'ouvre en LECTURE SEULE : les champs restent lisibles et copiables, les boutons de modification sont grisés (aria-disabled, jamais retirés), et le moindre essai
// de modification affiche « Ce devis est … : il ne se modifie plus » avec « Créer une nouvelle version ». Un brouillon reste modifiable, même ouvert par « Voir le devis ».
// Routes : devis/editeur/<id> s'ouvre sur l'onglet Édition, devis/voir/<id> sur l'onglet Prévisualisation (c'est le même écran).
import { h, icone, remplir, dialogue, toast, ouvrirMenu } from '../../os/ui.js';
import { naviguer, ajouterGardeSortie, routeCourante } from '../../os/router.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { etatVide, planifier, cheminPersonne, cheminOrganisation, cheminAffaire } from '../crm/composants.js';
import { adressesDe } from '../crm/logique.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import { arbreFamilles, cheminFamille } from './familles.js';
import * as Ed from './editeur-logique.js';
import {
  TYPE_SAUT, totauxDevis, erreursFinalisation, erreursChantier, estExpire, UNITES_DUREE, MOMENTS_ACOMPTE, TAUX_TVA_DEFAUT, niveauSection, dureeEnTexte,
  affichageDe, ajustementActif, valeursAjustement, margeEffective, vueClient, MAX_COPIE, transitionPossible,
} from './logique.js';
import { formaterMontant } from './document.js';
import { menuUnite } from './menu-unite.js';
import { ouvrirFenetreMenu, contenuMenu, caseMenu, donnees as donneesDe } from './menu-devis.js';
import { ouvrirBibliotheque } from './bibliotheque.js';
import { htmlDuDevis } from './html-devis.js';
import { editeurOuvrage } from './editeur-ouvrage.js';
import * as O from './ouvrages.js';
import { routePdf, messageApresEnregistrement } from './pdf.js';
import { afficherAttentePdf, LIBELLE_PDF_FABRICATION } from './pdf-attente.js';
import { lancerEnvoiEmail } from './email-ecran.js';
import { lancerPreparationEmail } from './email-preparer-ecran.js';
import { LIBELLE_PREPARER_EMAIL } from './email-preparer.js';
import { emailPossible } from './email-brouillon.js';
import { boutonsEntete, MESSAGE_FINALISER_POUR_ENVOYER } from './entete-boutons.js';
import { ERREUR_ECRITURE, dupliquerDevis, supprimerBrouillon, entreesMenuDevis, changerStatut, creerNouvelleVersion } from './actions-devis.js';
import { pastilleStatutDevis, appliquerPastilleStatut } from './pastille-statut.js';
import { ouvrirPanneauLateral } from './panneau-lateral.js';
import { contenuHistorique } from './historique-logique.js';

const ERREUR_LECTURE = 'Les devis n’ont pas pu être lus. Vérifie ta connexion puis recharge la page.';
const MESSAGE_INTROUVABLE = 'Ce devis est introuvable : il a peut-être été retiré, ou le lien n’est pas le bon.';
const MOT_STATUT = { en_attente_envoi: 'finalisé', envoye: 'envoyé', accepte: 'signé', refuse: 'refusé', remplace: 'remplacé' }; // le mot du message « Ce devis est … : il ne se modifie plus »
/** Le mot qui suit le statut (« finalisé », « envoyé », « signé », « refusé », « remplacé », « archivé ») et si une nouvelle version est possible : bandeau du haut et message de refus disent la même chose. */
const motDuStatut = (d) => (d?.archive === true ? 'archivé' : (MOT_STATUT[d?.statut] ?? 'finalisé'));
const versionPossible = (d) => transitionPossible(d?.statut, 'nouvelle_version');
/** Bandeau du haut d'un devis en lecture seule : une phrase ; il ne parle de nouvelle version que si elle est possible. */
const messageLectureSeule = (d) => (versionPossible(d)
  ? `Ce devis est ${motDuStatut(d)} : pour le corriger, crée une nouvelle version (menu « … »).`
  : `Ce devis est ${motDuStatut(d)} : il ne se modifie plus.`);
const infobulleCatalogueLecture = (d) => `Ajouter un article, c’est modifier le devis : il est ${motDuStatut(d)}, ${versionPossible(d) ? 'crée une nouvelle version pour le corriger.' : 'il ne se modifie plus.'}`;
const SANS_VERROU = '[data-action="replier"], [data-action="definir-ajustement"], [data-action="description"]'; // en lecture seule, replier une section, ouvrir « Définir un ajustement » et afficher / masquer la description restent possibles (ce n'est que regarder)
const DELAI_INTROUVABLE_MS = 4000;
const DELAI_ENREGISTREMENT_MS = 900;
const DELAI_APERCU_MS = 250;

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');
const saisieNombre = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : '');
const saisiePrix = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '');
const nouvelId = () => CRM.ctx().nouvelId('devis_devis');

// ---------------------------------------------------------------- client et affaire (lus dans l'espace)
/** Organisation et personne proposées comme client d'une affaire. */
function clientsDeAffaire(affaire) {
  const liste = [];
  const org = affaire?.organisationId ? CRM.organisation(affaire.organisationId) : null;
  const pers = affaire?.personneId ? CRM.personne(affaire.personneId) : null;
  if (org) liste.push({ type: 'organisation', fiche: org, nom: org.nom });
  if (pers) liste.push({ type: 'personne', fiche: pers, nom: pers.nom });
  return liste.map((c) => ({ ...c, adresse: (adressesDe(c.fiche).find((a) => a.parDefaut) ?? adressesDe(c.fiche)[0])?.adresse ?? '' }));
}
const clientDuDevis = (d) => (d.organisationId ? CRM.organisation(d.organisationId)?.nom : d.personneId ? CRM.personne(d.personneId)?.nom : '') || '';
/** Coordonnées du client lues dans sa fiche (pour les cases « Afficher le téléphone… » du menu Options) ; une donnée absente de la fiche reste absente. */
export function infosClientDuDevis(d) {
  const fiche = d.organisationId ? CRM.organisation(d.organisationId) : d.personneId ? CRM.personne(d.personneId) : null;
  if (!fiche) return null;
  const telephone = (Array.isArray(fiche.telephones) ? fiche.telephones[0]?.valeur : '') || fiche.telephone || '';
  return { telephone, email: Ed.emailsDeFiche(fiche)[0] ?? '', numeroTva: fiche.numeroTva ?? fiche.tva ?? '', siren: fiche.siren ?? '' };
}
/** Document complet du devis, pour l'aperçu de l'éditeur. */
export const htmlImpressionDevis = (d) => htmlDuDevis(d, { clientNom: clientDuDevis(d) || null, client: infosClientDuDevis(d), emetteur: D.etat.reglages.entreprise });
const affaires = () => CRM.etat.affaires.filter((a) => !a.archive).sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr'));
const libelleAffaire = (a) => {
  const c = clientsDeAffaire(a)[0]?.nom;
  return c ? `${a.titre} · ${c}` : a.titre;
};

// ---------------------------------------------------------------- création : choisir l'affaire
function rendreCreation(conteneur) {
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'creation' }, hidden: true });
  const select = h('select', { class: 'champ', id: 'nouveau-devis-affaire', dataset: { champ: 'affaire' }, 'aria-required': 'true', onchange: () => { select.classList.remove('invalide'); erreur.hidden = true; majClient(); } });
  const client = h('p', { class: 'texte-discret', dataset: { valeur: 'client' } });
  const zone = h('div', { class: 'formulaire-devis' });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'creer-brouillon' }, onclick: creer }, 'Créer le brouillon');

  function majClient() {
    const a = CRM.affaire(select.value);
    const c = a ? clientsDeAffaire(a)[0] : null;
    client.textContent = a ? (c ? `Client : ${c.nom}` : 'Cette affaire n’a pas encore de client : tu pourras le choisir dans le devis.') : '';
  }
  function rendre() {
    const liste = affaires();
    if (!CRM.estPret()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!liste.length) {
      remplir(zone, etatVide('Aucune affaire pour l’instant. Un devis se fait pour une affaire : crée d’abord l’affaire, puis reviens ici.', {
        action: h('a', { class: 'bouton bouton-secondaire', href: '#/crm/affaires' }, 'Voir les affaires'),
      }));
      return;
    }
    const courante = select.value;
    remplir(select, h('option', { value: '' }, 'Choisis une affaire'), liste.map((a) => h('option', { value: a.id, selected: a.id === courante }, libelleAffaire(a))));
    remplir(zone,
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'nouveau-devis-affaire' }, 'Affaire *'), select, client, erreur),
      h('div', { class: 'page-actions' }, bouton));
    majClient();
  }
  async function creer() {
    const a = CRM.affaire(select.value);
    if (!a) { select.classList.add('invalide'); erreur.textContent = 'Choisis l’affaire de ce devis.'; erreur.hidden = false; select.focus(); return; }
    bouton.disabled = true;
    try {
      const r = await D.creerBrouillon(Ed.valeursDeCreation(a, clientsDeAffaire(a)[0] ?? null));
      if (!r.id) throw new Error(Object.values(r.erreurs)[0] || ERREUR_ECRITURE);
      naviguer(`devis/editeur/${r.id}`, { remplacer: true });
    } catch (e) {
      console.warn(e);
      bouton.disabled = false;
      erreur.textContent = ERREUR_ECRITURE;
      erreur.hidden = false;
    }
  }

  conteneur.append(h('div', { class: 'page page-devis page-editeur-devis page-nouveau-devis' },
    h('header', { class: 'page-tete' }, h('div', {}, h('a', { class: 'lien-retour', href: '#/devis/liste' }, icone('chevron-left', { taille: 16 }), 'Devis'), h('h1', {}, 'Nouveau devis'))),
    zone));
  const rafraichir = planifier(rendre);
  rendre();
  const arrets = [CRM.surChangement(rafraichir)];
  return () => arrets.forEach((f) => f());
}

// ---------------------------------------------------------------- l'éditeur d'un devis
/** `voir` : ouvrir sur l'onglet Prévisualisation (devis/voir/<id>) ; sinon sur l'onglet Édition. */
export function rendreEditeurDevis(conteneur, id, { voir = false } = {}) {
  if (!id) return rendreCreation(conteneur);

  const racine = h('div', { class: 'page page-devis page-editeur-devis', dataset: { devis: id } });
  conteneur.append(racine);

  D.emailPreparable(); // question posée au serveur dès l'ouverture (« Préparer l'e-mail » est-il branché ?) : la réponse est prête quand on ouvre le menu « Envoyer »
  let travail = null; // copie de travail du devis (ce qui est à l'écran)
  let enregistre = null; // ce qui est enregistré (pour savoir s'il y a des changements)
  let lecture = false; // vrai dès que le devis n'est plus un brouillon (calculé au chargement et à chaque mise à jour)
  let historiqueOuvert = null; // le panneau « Historique » ouvert, ou null : { fermer() }
  let etatEnreg = 'enregistre';
  let messageEnreg = '';
  let enCours = null;
  let minuteur = null;
  let minuteurApercu = null;
  let onglet = voir ? 'apercu' : 'edition';
  let pointInsertion = null; // identifiant sous lequel (ou au-dessus duquel, voir sensInsertion) s'ajoutera le prochain article du Bordereau
  let rechercheEnLigne = false; // la recherche du Bordereau est ouverte juste sous (ou sur) la ligne choisie dans un menu « Insérer », pas en bas du devis
  let sensInsertion = 'apres'; // 'apres' (en dessous), 'avant' (au-dessus), 'debut' ou 'fin' (dans la section)
  let rechercheBordereau = '';
  let filtreFamille = '';
  let moment = Date.now();
  let conflit = false; // le devis a changé ailleurs : rien n'est écrasé tant que l'utilisateur n'a pas tranché
  let verrou = false; // finalisation en cours : plus aucun enregistrement automatique
  let enVol = null; // ce qu'un enregistrement en cours est en train d'écrire
  let montre = false; // la page est construite
  let empreinteVue = null; // le devis tel qu'il était à la dernière construction de l'écran (visualisation : évite de tout reconstruire pour rien)
  let arretGarde = () => {};
  let observerBarre = null;
  let delaiIntrouvable = null;
  const ref = {}; // éléments à mettre à jour sans tout redessiner
  const replies = new Set(); // sections et sous-sections repliées (à l'écran seulement : rien n'est enregistré)
  let bibliotheque = null; // le panneau « Bibliothèque » ouvert, ou null
  let optionsOuvertes = null; // le panneau « Options » ouvert, ou null : { fermer() }
  let ligneActive = null; // la dernière ligne où l'utilisateur a cliqué ou écrit : la Bibliothèque ajoute à la fin de sa section
  const affichage = () => affichageDe(travail);

  const devisCourant = () => D.devisParId(id);
  // Copie de travail : un ancien réglage « Nouvelle page avant » est montré comme un saut de page (enregistré ainsi au premier enregistrement).
  const copieDeTravail = (d) => { const c = { ...d, ...Ed.champsAEnregistrer(d) }; if (c.sections) c.sections = Ed.convertirAnciensSauts(structuredClone(c.sections)); return c; };

  // ------------------------------------------------ chargement
  function charger() {
    const d = devisCourant();
    if (!D.estPretDevis() || !CRM.estPret()) { remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!d) {
      if (D.etat.erreurLectureDevis) { remplir(racine, h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' } }, ERREUR_LECTURE)); return; }
      if (Date.now() - moment < DELAI_INTROUVABLE_MS) {
        remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' })));
        if (!delaiIntrouvable) delaiIntrouvable = setTimeout(() => { delaiIntrouvable = null; charger(); }, DELAI_INTROUVABLE_MS - (Date.now() - moment) + 50);
        return;
      }
      remplir(racine, etatVide(MESSAGE_INTROUVABLE, { action: h('a', { class: 'bouton bouton-secondaire', href: '#/devis/liste', dataset: { action: 'retour-liste' } }, 'Retour aux devis') }));
      racine.dataset.etat = 'introuvable';
      return;
    }
    delete racine.dataset.etat;
    lecture = Ed.estLectureSeule(d); // un devis finalisé s'ouvre sur le même écran, en lecture seule
    travail = copieDeTravail(d);
    enregistre = copieDeTravail(d);
    etatEnreg = 'enregistre';
    construire();
  }

  // Les mises à jour du serveur : lecture seule dès que le devis n'est plus un brouillon ; en lecture seule on suit toujours la dernière version.
  function surDonnees() {
    if (!montre) { charger(); return; }
    // « Mon entreprise » modifiée ailleurs : l'aperçu ouvert se met à jour.
    const entreprise = JSON.stringify(D.etat.reglages.entreprise);
    if (entreprise !== entrepriseAffichee) { entrepriseAffichee = entreprise; if (onglet === 'apercu' && ref.panneauApercu) rendreApercu(); }
    const d = devisCourant();
    if (!d) return;
    if (!lecture && d.statut === 'brouillon' && !conflit && !Ed.memeContenu(d, enregistre) && !(enVol && Ed.memeContenu(d, enVol))) {
      conflit = true;
      clearTimeout(minuteur);
      if (ref.bandeauConflit) ref.bandeauConflit.hidden = false;
      return;
    }
    if (!lecture && d.statut !== 'brouillon') { clearTimeout(minuteur); lecture = true; travail = copieDeTravail(d); enregistre = structuredClone(travail); construire(); return; }
    if (lecture) {
      // Visualisation : on ne reconstruit l'écran que si le devis a changé ; sinon seul l'en-tête se met à jour (le focus, un menu ouvert et la position de l'aperçu restent).
      const empreinte = JSON.stringify(d);
      if (empreinte === empreinteVue) { majEntete(); return; }
      travail = copieDeTravail(d); enregistre = structuredClone(travail); construire();
    }
  }

  // ------------------------------------------------ enregistrement
  function marquerModifie() {
    if (lecture) return;
    etatEnreg = 'attente';
    messageEnreg = '';
    clearTimeout(minuteur);
    if (!conflit && !verrou) minuteur = setTimeout(() => { sauver(); }, DELAI_ENREGISTREMENT_MS);
    majEntete();
    majTotaux();
    planifierApercu();
  }

  /** Aperçu ouvert pendant qu'on modifie le devis (ex. ajout depuis le Catalogue, ouvert à côté) : il se met à jour tout seul, après une courte pause, en gardant la position de lecture. */
  function planifierApercu() {
    if (onglet !== 'apercu' || !ref.panneauApercu) return;
    clearTimeout(minuteurApercu);
    minuteurApercu = setTimeout(() => { if (onglet === 'apercu' && racine.isConnected) rendreApercu({ garderDefilement: true }); }, DELAI_APERCU_MS);
  }

  /** Enregistre le brouillon. Rend true si tout est enregistré. */
  async function sauver() {
    clearTimeout(minuteur);
    minuteur = null;
    if (lecture || !travail) return true;
    if (conflit) { messageEnreg = 'Ce devis a été modifié ailleurs : recharge-le avant d’enregistrer.'; return false; }
    if (enCours) await enCours;
    if (!Ed.aDesChangements(enregistre, travail)) { if (etatEnreg !== 'erreur') etatEnreg = 'enregistre'; majEntete(); return etatEnreg !== 'erreur'; }
    const instantane = Ed.champsAEnregistrer(travail);
    etatEnreg = 'enCours';
    enVol = instantane;
    majEntete();
    enCours = (async () => {
      try {
        const r = await D.modifierBrouillon(id, instantane);
        const erreur = r.erreurs.general || Object.values(r.erreurs)[0];
        if (erreur) { messageEnreg = erreur; throw new Error(erreur); }
        enregistre = { ...enregistre, ...structuredClone(instantane) };
        messageEnreg = '';
        etatEnreg = Ed.aDesChangements(enregistre, travail) ? 'attente' : 'enregistre';
        return true;
      } catch (e) {
        console.warn(e);
        if (!messageEnreg) messageEnreg = ERREUR_ECRITURE;
        etatEnreg = 'erreur';
        return false;
      }
    })();
    const ok = await enCours;
    enCours = null;
    enVol = null;
    majEntete();
    if (ok && etatEnreg === 'attente' && !verrou && !conflit) { minuteur = setTimeout(() => { sauver(); }, DELAI_ENREGISTREMENT_MS); }
    return ok;
  }

  // ------------------------------------------------ lecture seule : même feuille, rien ne se modifie
  /** Le message de refus : « Ce devis est finalisé : il ne se modifie plus. Crée une nouvelle version pour le corriger. » (le mot suit le statut), avec le bouton « Créer une nouvelle version » quand c'est possible. */
  let dernierRefus = 0;
  function refuserModification() {
    const maintenant = Date.now();
    if (maintenant - dernierRefus < 1500) return; // un clic suivi de son relâchement, ou une rafale de touches : un seul message
    dernierRefus = maintenant;
    const d = devisCourant() ?? travail;
    const version = versionPossible(d);
    toast(`Ce devis est ${motDuStatut(d)} : il ne se modifie plus.${version ? ' Crée une nouvelle version pour le corriger.' : ''}`,
      { duree: 8000, action: version ? { libelle: 'Créer une nouvelle version', surClic: () => creerNouvelleVersion(d) } : null });
  }
  /**
   * Lecture seule : rend non modifiable tout ce que `zone` contient, SANS changer son apparence ni retirer quoi que ce soit.
   * Champs texte : `readOnly` (lisibles, copiables) ; listes et cases : bloquées par la garde ci-dessous ; boutons : aria-disabled (grisés, jamais retirés, un clic explique).
   * Rend `zone` (pour s'écrire en une ligne). Ne fait rien si le devis est un brouillon.
   */
  function verrouiller(zone) {
    if (!lecture || !zone) return zone;
    for (const el of zone.querySelectorAll('input, textarea, select, button')) {
      if (el.matches(SANS_VERROU) || el.disabled) continue;
      el.dataset.lecture = 'verrou';
      if (el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.type === 'checkbox') el.setAttribute('aria-disabled', 'true');
      else el.readOnly = true;
      if (el.tagName === 'SELECT') valeursFigees.set(el, el.value);
    }
    return zone;
  }
  const valeursFigees = new WeakMap(); // liste verrouillée → sa valeur affichée (remise en place si un choix passe quand même : toucher, outil d'accessibilité, script)
  /** Une liste verrouillée a changé malgré tout : on remet la valeur d'origine, le changement ne va pas plus loin, et le message dit pourquoi. */
  const annulerChoix = (e) => {
    const el = verrouDe(e);
    if (el?.tagName !== 'SELECT') return;
    e.stopImmediatePropagation();
    if (valeursFigees.has(el)) el.value = valeursFigees.get(el);
    refuserModification();
  };
  const verrouDe = (e) => (e.target instanceof Element ? e.target.closest('[data-lecture="verrou"]') : null);
  const estChampTexte = (el) => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox');
  const gardes = {
    // Un bouton grisé, une case, une liste : refus. Un champ texte : refus seulement si on clique sans sélectionner (sélectionner pour copier reste libre).
    click: (e) => { const el = verrouDe(e); if (!el) return; if (estChampTexte(el) && el.selectionStart !== null && el.selectionStart !== el.selectionEnd) return; e.preventDefault(); e.stopImmediatePropagation(); refuserModification(); },
    mousedown: (e) => { const el = verrouDe(e); if (el?.tagName === 'SELECT') { e.preventDefault(); refuserModification(); } }, // la liste ne s'ouvre pas
    keydown: (e) => {
      const el = verrouDe(e);
      if (!el || e.key === 'Tab' || e.key === 'Escape' || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      // Une liste : TOUTE autre touche est refusée, avec ou sans Alt, Ctrl ou Cmd (Alt+↓ ou F4 ouvrent la liste, les flèches changent son choix).
      if (el.tagName === 'SELECT') { e.preventDefault(); refuserModification(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // un champ texte : copier, tout sélectionner… restent libres (il est en readOnly : rien ne s'y écrit)
      if (estChampTexte(el) && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || (e.key === 'Enter' && el.tagName === 'TEXTAREA'))) { e.preventDefault(); refuserModification(); }
    },
    paste: (e) => { if (verrouDe(e)) { e.preventDefault(); refuserModification(); } },
    cut: (e) => { if (verrouDe(e)) { e.preventDefault(); refuserModification(); } },
    drop: (e) => { if (verrouDe(e)) { e.preventDefault(); refuserModification(); } },
    // Filet : un choix fait malgré tout dans une liste (au toucher la liste native peut s'ouvrir, un outil peut choisir sans clavier) est annulé avant d'atteindre l'écran.
    input: annulerChoix,
    change: annulerChoix,
  };
  for (const [type, f] of Object.entries(gardes)) document.addEventListener(type, f, true);

  // ------------------------------------------------ changements
  function changer(patch) { if (lecture) return; Object.assign(travail, patch); marquerModifie(); }
  /** Reconstruit les lignes sans que la page saute : on garde la position de défilement de tous les parents qui défilent. */
  function sansSaut(fn) {
    const defilements = [];
    for (let el = ref.corpsLignes; el; el = el.parentElement) if (el.scrollTop > 0) defilements.push([el, el.scrollTop]);
    const x = window.scrollX, y = window.scrollY;
    fn();
    for (const [el, haut] of defilements) el.scrollTop = haut;
    window.scrollTo(x, y);
  }
  /** Déplace un élément d'un cran avec les flèches : la page reste là où elle est, la ligne reste visible et le clavier reste sur la même flèche. */
  function deplacer(e, sens) {
    appliquer(Ed.deplacerElement(travail.sections, e.id, sens));
    const ligne = racine.querySelector(`tr[data-id="${e.id}"]`);
    const voulu = sens < 0 ? 'monter' : 'descendre';
    const bouton = ligne?.querySelector(`[data-action="${voulu}"]:not(:disabled)`) ?? ligne?.querySelector('.bouton-poignee:not(:disabled)');
    bouton?.focus({ preventScroll: true });
    ligne?.scrollIntoView?.({ block: 'nearest' });
  }
  function appliquer(sections, { focus = null, champ = 'libelle' } = {}) {
    if (lecture) return;
    // Ajouter, supprimer, dupliquer, déplacer : l'écran reste où il est (seule la ligne visée peut le faire défiler, pour rester visible).
    sansSaut(() => { travail.sections = sections; rendreLignes(); });
    marquerModifie();
    if (focus) {
      const champFocus = racine.querySelector(`tr[data-id="${focus}"] [data-champ="${champ}"]`);
      champFocus?.focus();
      (champFocus ?? racine.querySelector(`tr[data-id="${focus}"]`))?.scrollIntoView?.({ block: 'nearest' });
    }
  }
  function ajouterLigne(element, { champ = 'libelle', suite = false } = {}) {
    const cible = pointInsertion && Ed.aplatir(travail.sections).some((x) => x.id === pointInsertion) ? pointInsertion : null;
    const sens = sensInsertion;
    // Recherche ouverte sous une ligne : le prochain article se met juste sous celui qu'on vient d'ajouter.
    pointInsertion = suite ? element.id : null;
    sensInsertion = 'apres';
    appliquer(cible ? Ed.insererAutour(travail.sections, element, cible, sens, nouvelId()) : Ed.ajouterElement(travail.sections, element, null, nouvelId()), { focus: element.id, champ });
  }
  const changerLigne = (idLigne, patch) => { if (lecture) return; travail.sections = Ed.majElement(travail.sections, idLigne, patch); marquerModifie(); };

  // ------------------------------------------------ construction de la page
  // Disposition d'un devis papier (barre d'actions fixe, en-tête à deux colonnes, tableau à trois niveaux, boutons d'ajout, bas de page) : css/devis.css, bloc « Éditeur de devis ».
  function construire() {
    montre = true;
    try { empreinteVue = JSON.stringify(devisCourant()); } catch { empreinteVue = null; }
    for (const k of Object.keys(ref)) delete ref[k];
    const d = travail;
    ref.titre = h('h1', { class: 'titre-barre-devis' }, '');
    ref.pastille = pastilleStatutDevis(d, CRM.ctx().aujourdhui);
    ref.indicateur = h('span', { class: 'indicateur-enregistrement', role: 'status', 'aria-live': 'polite', dataset: { valeur: 'enregistrement' } });
    // L'enregistrement est automatique : il n'y a plus de bouton « Enregistrer ». Le nombre de champs obligatoires à remplir et le bouton « Réessayer » (seulement après un échec) prennent sa place.
    ref.lienClient = h('a', { class: 'lien-entite', dataset: { valeur: 'lien-client' }, hidden: true });
    ref.lienAffaire = h('a', { class: 'lien-entite', dataset: { valeur: 'lien-affaire' }, hidden: true });
    ref.titreCompact = h('span', { class: 'titre-compact', 'aria-hidden': 'true' }); // montré seulement quand la barre est collée en haut
    ref.compteurManquants = h('span', { class: 'indicateur-manquants', hidden: true, dataset: { valeur: 'manquants' }, title: 'Champs obligatoires à remplir' });
    ref.boutonReessayer = h('button', { type: 'button', class: 'bouton-lien', hidden: true, dataset: { action: 'reessayer-enregistrement' }, onclick: async () => { const ok = await sauver(); if (!ok) toast(messageEnreg || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 }); } }, 'Réessayer');
    const onglets = h('div', { class: 'onglets-editeur', role: 'tablist', 'aria-label': 'Affichage du devis' },
      [['edition', 'Édition', 'pencil'], ['apercu', 'Prévisualisation', 'eye']].map(([cle, libelle, pictogramme]) => h('button', {
        type: 'button', class: 'onglet-editeur', role: 'tab', dataset: { onglet: cle }, onclick: () => choisirOnglet(cle),
      }, icone(pictogramme, { taille: 16 }), libelle)));
    ref.onglets = onglets;
    // En-tête : le MÊME que celui des fiches Affaires et Projets (mêmes classes) : flèche de retour, titre, pastille de statut, client et affaire ; les boutons à droite.
    // Les boutons (Catalogue, Options, Historique, étape, « … ») sont dans la barre collée en haut, en édition comme en lecture seule (le Catalogue y est grisé).
    const entete = h('header', { class: 'fiche-tete entete-devis' },
      boutonRetour(),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, ref.titre,
          h('div', { class: 'fiche-sous' }, ref.pastille, ref.indicateur, ref.boutonReessayer, ref.compteurManquants, ref.lienClient, ref.lienAffaire))));
    // Barre d'actions de l'édition : reste collée en haut de l'écran quand on défile (onglets, Catalogue, Options, Envoyer).
    ref.sentinelle = h('div', { class: 'sentinelle-barre-devis', 'aria-hidden': 'true' });
    ref.barre = h('div', { class: 'barre-devis' },
      h('div', { class: 'barre-devis-gauche' }, ref.titreCompact, onglets),
      h('div', { class: 'barre-devis-droite' }, boutonsEdition()));
    observerBarre?.disconnect();
    observerBarre = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => { ref.barre?.classList.toggle('epinglee', !e.isIntersecting && e.boundingClientRect.top < 0); }) : null;
    if (ref.sentinelle) observerBarre?.observe(ref.sentinelle);
    ref.bandeauConflit = h('p', { class: 'bandeau-lecture-seule', role: 'alert', hidden: !conflit, dataset: { valeur: 'conflit' } }, 'Ce devis a été modifié ailleurs. Tes changements ne sont pas enregistrés tant que tu n’as pas rechargé. ',
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'recharger' }, onclick: () => { conflit = false; charger(); } }, 'Recharger'));
    ref.erreurEnreg = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'enregistrement' }, hidden: true });
    // L'onglet Édition existe toujours : en lecture seule c'est la même feuille, que `verrouiller` rend non modifiable.
    ref.panneauEdition = h('div', { class: 'editeur-edition', dataset: { panneau: 'edition' } },
      h('article', { class: 'document-devis' }, enteteDocument(), blocLignes(), basDePage()));
    ref.panneauApercu = h('div', { class: 'editeur-apercu', dataset: { panneau: 'apercu' } });
    bibliotheque?.fermer();
    bibliotheque = null;
    // Une mise à jour des données reconstruit l'écran : les panneaux ouverts sont refermés sans bouger le focus, puis rouverts avec le contenu à jour.
    const rouvrir = { options: Boolean(optionsOuvertes), historique: Boolean(historiqueOuvert) };
    optionsOuvertes?.fermer({ rendreFocus: false });
    historiqueOuvert?.fermer({ rendreFocus: false });
    racine.classList.toggle('devis-lecture-seule', lecture);
    remplir(racine, entete, ref.sentinelle, ref.barre, lecture ? h('p', { class: 'bandeau-lecture-seule', dataset: { valeur: 'lecture-seule' } }, messageLectureSeule(d)) : ref.bandeauConflit, ref.erreurEnreg, ref.panneauEdition, ref.panneauApercu);
    rendreLignes(); majResultats();
    verrouiller(ref.panneauEdition);
    arretGarde();
    arretGarde = ajouterGardeSortie(
      () => racine.isConnected && Ed.sortieAConfirmer({ enregistre, courant: travail, enCours: Boolean(enCours), lectureSeule: lecture }),
      { message: 'Les changements de ce devis ne sont pas enregistrés.', enregistrer: sauver, messageEchec: 'L’enregistrement a échoué : tu restes sur le devis.' },
    );
    choisirOnglet(onglet);
    majEntete();
    majTotaux();
    if (rouvrir.options) ouvrirOptions(null, { silencieux: true });
    if (rouvrir.historique) ouvrirHistorique(null, { silencieux: true });
  }

  // ------------------------------------------------ boutons du haut de page : la règle est dans entete-boutons.js (pur, testé) ; ici on ne fait que les dessiner.
  const regleEntete = () => {
    const d = devisCourant() ?? travail;
    return boutonsEntete({ statut: d?.statut, expire: estExpire(d, CRM.ctx().aujourdhui), archive: d?.archive === true, lecture, emailPossible: emailPossible(d?.statut).actif });
  };
  /** Un bouton qui change le statut par la fonction du serveur (même appel que le menu de la liste). Verrou : grisé pendant l'appel (un double clic ne fait qu'un appel), réactivé si l'écran est resté (refus du serveur). */
  function boutonStatut({ action, libelle, pictogramme, style, statutLibelle, nomAction }) {
    const bouton = h('button', { type: 'button', class: `bouton ${style}`, dataset: { action: nomAction }, onclick: async () => {
      if (bouton.disabled) return;
      bouton.disabled = true; bouton.setAttribute('aria-busy', 'true');
      try { await changerStatut(devisCourant() ?? travail, action, statutLibelle); } finally { bouton.disabled = false; bouton.removeAttribute('aria-busy'); }
    } }, icone(pictogramme, { taille: 16 }), libelle);
    return bouton;
  }
  /** « Envoyer » : bouton à menu (e-mail). Sur un brouillon il est grisé (aria-disabled, jamais `disabled` : il reste focusable) et un clic dit quoi faire. */
  function boutonEnvoyer({ principal, grise }) {
    if (grise) {
      // Infobulle au survol et au focus clavier (le texte est dans la page, relié au bouton par aria-describedby) ; Échap la masque ; le message du clic reste.
      const idBulle = 'bulle-envoyer-grise';
      const bulle = h('span', { class: 'bulle-info', role: 'tooltip', id: idBulle, dataset: { role: 'bulle-envoyer' } }, MESSAGE_FINALISER_POUR_ENVOYER);
      const enveloppe = h('span', { class: 'avec-bulle', onkeydown: (ev) => { if (ev.key === 'Escape') enveloppe.classList.add('bulle-masquee'); }, onmouseleave: () => enveloppe.classList.remove('bulle-masquee'), onfocusout: () => enveloppe.classList.remove('bulle-masquee') },
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'envoyer' }, 'aria-disabled': 'true', 'aria-describedby': idBulle,
          onclick: () => toast(MESSAGE_FINALISER_POUR_ENVOYER, { duree: 6000 }) }, icone('mail', { taille: 16 }), 'Envoyer'), bulle);
      return enveloppe;
    }
    return h('button', { type: 'button', class: `bouton ${principal ? 'bouton-principal' : 'bouton-secondaire'}`, dataset: { action: 'envoyer' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (ev) => ouvrirMenuEnvoyer(ev.currentTarget) },
    icone('mail', { taille: 16 }), 'Envoyer', icone('chevron-down', { taille: 14 }));
  }
  /** Les un ou deux boutons d'étape du haut de page (le jaune d'abord, puis l'autre en contour ou grisé ; « Devis signé » (jaune) passe à droite, après « Devis refusé »). */
  function boutonsEtape() {
    const { jaune, autre } = regleEntete();
    const rendre = (b, principal) => {
      if (!b) return null;
      if (b.cle === 'finaliser') return h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'finaliser' }, onclick: () => finaliser() }, icone('check', { taille: 16 }), 'Finaliser');
      if (b.cle === 'envoyer') return boutonEnvoyer({ principal, grise: b.grise === true });
      const style = principal ? 'bouton-principal' : 'bouton-secondaire';
      if (b.cle === 'signer') return boutonStatut({ action: 'accepter', libelle: b.libelle, pictogramme: b.icone, style, statutLibelle: 'Signé', nomAction: 'marquer-signe' });
      if (b.cle === 'refuser') return boutonStatut({ action: 'refuser', libelle: b.libelle, pictogramme: b.icone, style, statutLibelle: 'Refusé', nomAction: 'marquer-refuse' });
      return boutonStatut({ action: 'marquer_envoye', libelle: b.libelle, pictogramme: b.icone, style, statutLibelle: 'Envoyé', nomAction: 'passer-envoye' });
    };
    // Brouillon et Finalisé : le jaune d'abord, puis à sa droite le bouton qui annonce l'étape d'après (« Envoyer » grisé, « Devis envoyé »). Envoyé : « Devis signé » (jaune) tout à droite.
    return jaune && jaune.cle === 'signer' ? [rendre(autre, false), rendre(jaune, true)] : [rendre(jaune, true), rendre(autre, false)];
  }
  function boutonHistorique() {
    ref.boutonHistorique = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-historique', dataset: { action: 'historique' }, 'aria-controls': 'historique-devis', 'aria-expanded': 'false',
      onclick: (ev) => (historiqueOuvert ? historiqueOuvert.fermer() : ouvrirHistorique(ev.currentTarget)) }, icone('history', { taille: 16 }), 'Historique');
    return ref.boutonHistorique;
  }
  /** Bouton « … » (Autres actions) à côté d'« Envoyer » : les mêmes actions que le menu de la liste (actions-devis.js), sauf celles qui ont déjà leur bouton ou leur onglet ici. Sur téléphone, Options et Historique y passent aussi (leurs boutons y sont cachés, ce n'est donc pas un doublon). */
  function boutonPlusActions() {
    return h('button', { type: 'button', class: 'bouton-icone bouton-plus-actions', dataset: { action: 'plus-actions' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Autres actions', onclick: (ev) => ouvrirMenuPlus(ev.currentTarget) }, icone('ellipsis', { taille: 16 }));
  }
  function ouvrirMenuPlus(ancre) {
    const d = devisCourant() ?? travail;
    const surTelephone = window.innerWidth <= 700;
    const entrees = [];
    if (surTelephone) {
      entrees.push({ libelle: 'Options', icone: 'settings', action: () => ouvrirOptions(ancre) }, { libelle: 'Historique', icone: 'history', action: () => ouvrirHistorique(ancre) }, { separateur: true });
    }
    // Ce qui ne dépend pas de l'étape : PDF, impression, e-mail (voir entete-boutons.js). Ce qu'un bouton actif du haut de page fait déjà n'est pas répété ; le reste (dont « Envoyer par e-mail » au brouillon, tant que « Envoyer » est grisé) est ici.
    const { menu } = regleEntete();
    // Pendant la fabrication, le menu le dit et ignore un second clic (pas de double génération).
    entrees.push({ libelle: pdfEnCours ? LIBELLE_PDF_FABRICATION : 'Télécharger le PDF', icone: 'download', cle: 'telecharger', desactive: pdfEnCours, action: () => telechargerPdf(ancre) },
      { libelle: 'Imprimer', icone: 'file-text', cle: 'imprimer', desactive: pdfEnCours, action: () => imprimer(ancre) });
    // Le « … » ne répète jamais un bouton visible (entete-boutons.js, clesMenuDejaVisibles).
    if (menu.envoyerANouveau.present) entrees.push({ libelle: menu.envoyerANouveau.libelle, icone: 'mail', cle: 'envoyer-a-nouveau', desactive: !menu.envoyerANouveau.actif, titreInfo: grisEmail().titreInfo, action: () => lancerEmail() });
    if (!menu.dejaVisibles.includes('preparer-email')) entrees.push(...entreePreparerEmail());
    entrees.push({ separateur: true });
    const apresSuppression = () => { verrou = true; clearTimeout(minuteur); if (travail) enregistre = structuredClone(travail); naviguer('devis/liste'); };
    entrees.push(...entreesMenuDevis(d, {
      // « Envoyer par e-mail » est remplacé par le bouton ou par « Envoyer à nouveau » ; ce qu'un bouton visible fait déjà n'est pas répété.
      // « Éditer le devis » et « Voir le devis » ne sont pas proposés ici : les onglets « Édition » et « Prévisualisation », toujours visibles, font la même chose (décision de Jérôme du 26/10/2026).
      exclure: [...new Set(['envoyer_email', ...menu.dejaVisibles, 'editer', 'voir'])],
      apresSuppression,
      surcharges: {
        supprimer: async (x) => { if (!lecture && !(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le brouillon n’a pas été supprimé.`, { type: 'erreur', duree: 8000 }); return; } supprimerBrouillon(x, apresSuppression); }, // attend l'écriture en cours avant de supprimer
        dupliquer: async (x) => { if (!lecture && !(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le devis n’a pas été dupliqué.`, { type: 'erreur', duree: 8000 }); return; } dupliquerDevis(D.devisParId(x.id) ?? x); },
      },
    }));
    ouvrirMenu(ancre, entrees);
  }

  // Barre d'actions : Catalogue, Options, Historique (panneaux collés à droite), Envoyer (bouton à menu), « … » (autres actions). Pas de bouton Enregistrer : l'enregistrement est automatique.
  // En lecture seule, Options et Historique se consultent ; Catalogue est grisé (ajouter un article, c'est modifier).
  function boutonsEdition() {
    ref.boutonOptions = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-options', dataset: { action: 'options' }, 'aria-controls': 'options-devis', 'aria-expanded': 'false', onclick: (ev) => (optionsOuvertes ? optionsOuvertes.fermer() : ouvrirOptions(ev.currentTarget)) }, 'Options');
    // Le bouton jaune suit l'étape du devis (entete-boutons.js) : « Finaliser » tant que c'est un brouillon.
    return [boutonCatalogue(), ref.boutonOptions, boutonHistorique(), ...boutonsEtape(), boutonPlusActions()];
  }

  // ------------------------------------------------ PDF : UN SEUL, celui du serveur (devisPdf), rangé dans les Documents de l'affaire. Plus d'impression par le navigateur.
  let pdfEnCours = false;
  /**
   * « Télécharger le PDF » (menu Envoyer). Brouillon : enregistre d'abord les changements en attente (le PDF reflète l'écran), demande au serveur le PDF « BROUILLON »
   * filigrané, puis ouvre l'écran qui l'affiche. Devis finalisé : ouvre directement son PDF (l'écran sait attendre ou relancer un PDF pas encore prêt).
   */
  async function telechargerPdf(ancre = null) {
    if (pdfEnCours || !travail) return;
    if (lecture && travail.statut !== 'brouillon') { naviguer(routePdf(id)); return; } // devis finalisé : son PDF ; un brouillon (même en visualisation) : le PDF « BROUILLON »
    pdfEnCours = true;
    const retirerAttente = afficherAttentePdf({ bouton: ancre ?? document.querySelector('[data-action="plus-actions"]') });
    try {
      if (!(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le PDF n’a pas été créé.`, { type: 'erreur', duree: 8000 }); return; }
      await D.pdfBrouillon(id);
      toast(messageApresEnregistrement(travail), { duree: 8000 });
      naviguer(routePdf(id, true));
    } catch (e) {
      console.warn(e);
      toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
    } finally {
      pdfEnCours = false;
      retirerAttente();
    }
  }

  // Flèche « ‹ Devis » tout à gauche de la barre, comme dans la fiche d'un projet : retour à la liste des devis (même chemin que l'ancienne croix, donc même confirmation si des changements ne sont pas enregistrés).
  function boutonRetour() {
    return h('a', { class: 'lien-retour', href: '#/devis/liste', dataset: { action: 'fermer' }, 'aria-label': 'Retour à la liste des devis', onclick: (ev) => { ev.preventDefault(); naviguer('devis/liste'); } }, icone('chevron-left', { taille: 16 }), 'Devis');
  }

  // Les trois groupes de cases du menu « Options » : Édition, Document, Clients (enregistrées dans `devis.affichage`), puis Import / Export (pas encore là).
  function basculerAffichage(cle, valeur) {
    if (lecture) return;
    travail.affichage = { ...affichageDe(travail), [cle]: valeur };
    marquerModifie();
    appliquerAffichage();
  }
  function appliquerAffichage() {
    if (!ref.corpsLignes) return;
    rendreEntetesTableau();
    rendreLignes();
    majMarges();
    const ligneReste = racine.querySelector('[data-ligne="reste"]');
    if (ligneReste) ligneReste.hidden = affichage().cacherResteAFacturer === true;
    if (onglet === 'apercu') rendreApercu({ garderDefilement: true });
  }
  // Panneau collé à droite (comme la Bibliothèque) : le devis se décale, les cases agissent en direct ; seule la croix ou Échap le ferme. Jamais ouvert en même temps que la Bibliothèque.
  function ouvrirOptions(ancre, { silencieux = false } = {}) {
    if (optionsOuvertes) return;
    bibliotheque?.fermer();
    historiqueOuvert?.fermer();
    const construire = (fermer) => {
      const aff = affichage();
      const c = (libelle, cle, extra = {}) => caseMenu({ libelle, cle, coche: aff[cle], surChangement: (v) => basculerAffichage(cle, v), ...extra });
      const bientot = (libelle) => caseMenu({ libelle, bientot: true });
      const taux = [...new Set([...D.etat.reglages.tauxProposes, ...TAUX_TVA_DEFAUT, travail.tauxTvaDefaut])].sort((a, b) => b - a);
      const tva = h('select', { class: 'champ', id: 'devis-tva', dataset: { champ: 'tva-defaut' }, 'aria-label': 'Changer la TVA par défaut', onchange: (e) => { changer({ tauxTvaDefaut: Number(e.target.value) }); majTotaux(); } },
        taux.map((t) => h('option', { value: String(t), selected: travail.tauxTvaDefaut === t }, `${saisieNombre(t)} %`)));
      return contenuMenu([
        { titre: 'Édition' },
        { noeud: c('Afficher le calcul des marges', 'afficherMarges') },
        { noeud: c('Afficher les références', 'afficherReferences') },
        { noeud: caseMenu({ libelle: 'Attestation TVA', cle: 'attestationTva', coche: true, desactive: true, info: 'automatique' }) },
        { noeud: caseMenu({ libelle: 'Autoliquidation', cle: 'autoliquidation', coche: travail.autoliquidation === true, surChangement: (v) => { changer({ autoliquidation: v }); majTotaux(); } }) },
        { noeud: h('label', { class: 'menu-devis-champ' }, h('span', { class: 'menu-devis-libelle' }, 'Changer la TVA par défaut'), tva) },
        { noeud: c('Cacher la gestion des déchets', 'cacherDechets') },
        { noeud: bientot('Afficher les remises par ligne') }, { noeud: bientot('Afficher les stocks') },
        { noeud: bientot('Numérotation personnalisée') }, { noeud: bientot('Date visite préalable') },
        { separateur: true }, { titre: 'Document' },
        { noeud: c('Cacher les totaux des sections', 'cacherTotauxSections') },
        { noeud: c('Cacher les colonnes quantité et unité', 'cacherQuantiteUnite') },
        { noeud: c('Cacher la colonne TVA', 'cacherTva') },
        { noeud: c('Cacher les éléments d’ouvrage', 'cacherElementsOuvrage') },
        { noeud: c('Afficher les prix des éléments d’ouvrage', 'afficherPrixElementsOuvrage') },
        { noeud: bientot('Cacher l’annexe photos') }, { noeud: c('Cacher le reste à facturer', 'cacherResteAFacturer') },
        { separateur: true }, { titre: 'Clients' },
        { noeud: c('Afficher le téléphone', 'afficherTelephone') }, { noeud: c('Afficher l’e-mail', 'afficherEmail') },
        { noeud: c('Afficher le numéro de TVA', 'afficherNumeroTva') }, { noeud: c('Afficher le SIREN', 'afficherSiren') },
        { separateur: true }, { titre: 'Import / Export' },
        { libelle: 'Importer un devis', bientot: true, cle: 'importer' }, { libelle: 'Exporter des lignes', bientot: true, cle: 'exporter' },
      ], fermer);
    };
    optionsOuvertes = ouvrirPanneauLateral(racine, {
      id: 'options-devis', titre: 'Options', nom: 'Options du devis', zone: 'options', actionFermer: 'fermer-options', nomCroix: 'Fermer les options',
      contenu: verrouiller(h('div', {}, construire(() => optionsOuvertes?.fermer()))), bouton: ref.boutonOptions, ancre, focus: !silencieux, surFermeture: () => { optionsOuvertes = null; },
    });
  }

  // Panneau « Historique » : même mécanisme que « Options » (panneau-lateral.js). Versions du devis (on passe de l'une à l'autre en visualisation), envois par e-mail, dates.
  function ouvrirHistorique(ancre, { silencieux = false } = {}) {
    if (historiqueOuvert) return;
    bibliotheque?.fermer();
    optionsOuvertes?.fermer();
    const d = devisCourant() ?? travail;
    const contenu = contenuHistorique(d, D.versionsDe(d.racineId ?? d.id));
    const versions = h('section', { dataset: { bloc: 'versions' } }, h('h3', {}, 'Versions'),
      h('ul', {}, contenu.versions.map((v) => h('li', {}, h('button', {
        type: 'button', class: 'historique-version', dataset: { version: String(v.version), versionId: v.id }, 'aria-current': v.courante ? 'true' : null,
        onclick: () => { if (!v.courante) { historiqueOuvert?.fermer(); naviguer(v.statut === 'brouillon' ? `devis/editeur/${v.id}` : `devis/voir/${v.id}`); } }, // comme la liste : un brouillon s'ouvre en édition
      }, h('strong', {}, `Version ${v.version}`), h('span', {}, [v.numero, v.libelleStatut, [v.jour, v.heure].filter(Boolean).join(' ')].filter(Boolean).join(' · ')), v.courante ? h('span', { class: 'badge-courante' }, 'Affichée') : null)))));
    const envois = h('section', { dataset: { bloc: 'envois' } }, h('h3', {}, 'Envois par e-mail'),
      contenu.envois.length
        ? h('ul', { class: 'historique-envois', dataset: { valeur: 'envois' } }, contenu.envois.map((l) => h('li', { class: 'historique-envoi', dataset: { envoi: String(l.ms) } }, l.texte)))
        : h('p', { class: 'historique-vide', dataset: { valeur: 'aucun-envoi' } }, d.statut === 'brouillon' ? 'Un brouillon n’a pas encore pu être envoyé.' : 'Pas encore envoyé'),
      // « E-mail préparé dans Gmail le … » : écrit par le serveur quand le workflow a créé le brouillon (ce n'est PAS un envoi : l'envoi reste dans la liste ci-dessus).
      contenu.emailPrepare ? h('p', { class: `historique-email-prepare${contenu.emailPrepare.statut === 'echec' ? ' historique-email-prepare-echec' : ''}`, dataset: { valeur: 'email-prepare', statut: contenu.emailPrepare.statut } }, contenu.emailPrepare.texte) : null);
    const dates = h('section', { dataset: { bloc: 'dates' } }, h('h3', {}, 'Dates'),
      h('ul', { dataset: { valeur: 'dates' } }, contenu.dates.map((l) => h('li', { dataset: { date: l.cle } }, l.jour ? `${l.libelle} ${l.jour}${l.heure ? ` (${l.heure})` : ''}` : l.libelle))));
    historiqueOuvert = ouvrirPanneauLateral(racine, {
      id: 'historique-devis', titre: 'Historique', nom: 'Historique du devis', zone: 'historique', actionFermer: 'fermer-historique', nomCroix: 'Fermer l’historique',
      contenu: h('div', { class: 'historique-devis' }, versions, envois, dates), bouton: ref.boutonHistorique, ancre, focus: !silencieux, surFermeture: () => { historiqueOuvert = null; },
    });
  }

  // Les deux entrées « e-mail », UNE fois pour le menu du bouton « Envoyer » (devis finalisé) et pour le menu « … » (« Envoyer à nouveau »).
  const finaliserDAbord = { libelle: 'Finaliser d’abord', action: () => finaliser() };
  const grisEmail = () => ({ desactive: !emailPossible((devisCourant() ?? travail)?.statut).actif, titreInfo: emailPossible((devisCourant() ?? travail)?.statut).raison ?? null });
  // Crée un brouillon dans le Gmail de l'utilisateur (PDF en pièce jointe) ; l'utilisateur l'envoie lui-même. Voir email-ecran.js.
  const lancerEmail = () => lancerEnvoiEmail({ devisId: id, getDevis: () => D.devisParId(id) ?? travail, finaliser: finaliserDAbord });
  // Seulement si le serveur dit que c'est branché (D.emailPreparable). Un workflow n8n crée un brouillon dans le Gmail du compte, PDF joint ; rien n'est envoyé. Voir email-preparer-ecran.js.
  const entreePreparerEmail = () => (D.emailPreparable() === true ? [{ libelle: LIBELLE_PREPARER_EMAIL, icone: 'mail-check', cle: 'preparer-email', ...grisEmail(),
    action: () => lancerPreparationEmail({ devisId: id, getDevis: () => D.devisParId(id) ?? travail, finaliser: finaliserDAbord }) }] : []);
  /** Menu du bouton « Envoyer » (devis finalisé) : seulement l'e-mail. Le PDF et l'impression sont dans « … » (ils ne dépendent pas de l'envoi). */
  function ouvrirMenuEnvoyer(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu([
      { libelle: 'Envoyer par e-mail', icone: 'mail', cle: 'envoyer-email', ...grisEmail(), action: () => lancerEmail() },
      ...entreePreparerEmail(),
    ], fermer), { nom: 'Envoyer' });
  }
  /** Imprimer : un brouillon donne son PDF « BROUILLON » filigrané (jamais de fenêtre « Finaliser »), un devis finalisé son PDF officiel. */
  const imprimer = (ancre = null) => (travail?.statut === 'brouillon' ? telechargerPdf(ancre) : naviguer(routePdf(id)));

  function choisirOnglet(cle) {
    onglet = cle;
    ref.onglets?.querySelectorAll('.onglet-editeur').forEach((b) => { const actif = b.dataset.onglet === cle; b.classList.toggle('actif', actif); b.setAttribute('aria-selected', String(actif)); });
    if (ref.panneauEdition) ref.panneauEdition.hidden = cle === 'apercu';
    ref.panneauApercu.hidden = cle !== 'apercu';
    if (cle === 'apercu') rendreApercu();
    // Les zones de texte qui grandissent avec leur contenu n'ont pas pu se mesurer tant que l'onglet Édition était caché (ouverture sur la Prévisualisation) : on les mesure à l'affichage.
    else requestAnimationFrame(() => ref.corpsLignes?.querySelectorAll('textarea.champ-surplace').forEach((z) => { z.style.height = 'auto'; if (z.scrollHeight) z.style.height = `${z.scrollHeight}px`; }));
  }

  function rendreApercu({ garderDefilement = false } = {}) {
    const haut = garderDefilement ? ref.iframeApercu?.contentWindow?.scrollY ?? 0 : 0;
    let corps;
    let html = '';
    try {
      html = htmlImpressionDevis(travail);
      // Le document est pur (aucun script) : l'aperçu n'a aucun droit (pas d'impression : le PDF vient du serveur, par « Envoyer »).
      corps = h('iframe', { class: 'apercu-devis', title: `Prévisualisation du devis ${travail.numero ?? ''}`.trim(), sandbox: 'allow-same-origin', srcdoc: html, dataset: { zone: 'apercu' } });
    } catch (e) {
      console.warn(e);
      corps = h('p', { class: 'erreur', role: 'alert' }, 'L’aperçu n’a pas pu être préparé : le devis est incomplet. Termine-le, puis rouvre l’aperçu.');
    }
    if (haut && corps.tagName === 'IFRAME') corps.addEventListener('load', () => corps.contentWindow?.scrollTo(0, haut));
    ref.iframeApercu = corps.tagName === 'IFRAME' ? corps : null;
    ref.htmlApercu = html;
    remplir(ref.panneauApercu, corps);
  }

  // ------------------------------------------------ e-mail(s) en copie (cc) : un champ comme les autres (titre en capitales, valeur dessous)
  // Plafond MAX_COPIE (logique.js) : le serveur l'applique aussi (erreursFinalisation). Les refus (adresse invalide, déjà en copie, déjà destinataire, plafond) sont dans Ed.refusAjoutCopie.
  /**
   * Titre fixe « E-mail(s) en copie », puis soit « Aucune adresse en copie » (grisé), soit une ligne par adresse avec sa croix ; « + E-mail en copie » ouvre un champ.
   * Entrée ou sortie du champ ajoute ; tout refus s'affiche sous le champ, qui reste ouvert avec le texte tapé ; le message disparaît dès que le texte change, ou à Échap.
   * Après Entrée (ajout réussi) ou Échap, le focus revient sur « + E-mail en copie ». La croix retire sans confirmation (exception à « Destructif », voir docs/consignes-ui.md).
   * Lecture seule : le bloc existe aussi (écran unique), il est verrouillé par `verrouiller()` : adresses lisibles, croix et « + E-mail en copie » grisés (test C3), sans logique propre ici.
   * Après tout changement de la liste, l'état du champ destinataire est recalculé (`majErreurDestinataire`).
   */
  function blocCopie() {
    const zone = h('div', { class: 'bloc-champ bloc-copie', dataset: { zone: 'copie' }, role: 'group', 'aria-labelledby': 'devis-copie-titre' });
    let saisie = false;
    let enCours = ''; // texte du champ en cours de saisie : gardé si la ligne est redessinée (retrait d'une autre adresse pendant la saisie)
    let refusEnCours = ''; // motif du dernier refus : gardé lui aussi quand la ligne est redessinée, jusqu'à ce que le texte change
    /** Après une saisie terminée au clavier : le focus revient sur « + E-mail en copie » (au plafond, sur la dernière croix), jamais sur la page entière. */
    const rendreFocus = () => (zone.querySelector('[data-action="ajouter-copie"]') ?? [...zone.querySelectorAll('[data-action="retirer-copie"]')].pop())?.focus();
    const adresses = () => (Array.isArray(travail.copie) ? travail.copie : []);
    let abandonnerSaisie = () => {};
    function dessiner() {
      abandonnerSaisie(); abandonnerSaisie = () => {}; // l'ancien champ disparaît : son « blur » éventuel ne doit plus rien valider
      const liste = adresses();
      const parties = [h('span', { class: 'etiquette', id: 'devis-copie-titre' }, 'E-mail(s) en copie')];
      if (liste.length) {
        parties.push(h('ul', { class: 'liste-copie' }, liste.map((a, i) => h('li', { class: 'ligne-copie', dataset: { copie: a } },
          h('span', {}, a),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${a} de la copie`, dataset: { action: 'retirer-copie' },
            // Pendant la saisie d'une autre adresse, un appui sur la croix ne doit pas faire perdre le focus au champ : sinon « blur » redessine la ligne avant le clic et la croix disparaît.
            onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(),
            onclick: () => { changer({ copie: adresses().filter((_, k) => k !== i) }); majErreurDestinataire(); dessiner(); } }, icone('x', { taille: 14 }))))));
      } else {
        parties.push(h('p', { class: 'copie-vide', dataset: { valeur: 'copie-vide' } }, 'Aucune adresse en copie'));
      }
      if (saisie) {
        const erreur = h('p', { class: 'erreur', id: 'devis-copie-erreur', role: 'alert', hidden: true, dataset: { erreur: 'copie' } });
        let fini = false;
        abandonnerSaisie = () => { fini = true; };
        const montrer = (message) => { refusEnCours = message ?? ''; erreur.textContent = refusEnCours; erreur.hidden = !refusEnCours; champSaisie.setAttribute('aria-invalid', refusEnCours ? 'true' : 'false'); if (refusEnCours) champSaisie.setAttribute('aria-describedby', 'devis-copie-erreur'); else champSaisie.removeAttribute('aria-describedby'); };
        // Renvoie vrai si la saisie est terminée (ajoutée, ou vide) ; sinon le champ reste ouvert avec son texte et le motif du refus.
        const valider = () => {
          const v = champSaisie.value.trim();
          if (!v) return true;
          const refus = Ed.refusAjoutCopie(v, adresses(), travail.destinataires ?? []);
          if (refus) { montrer(refus); return false; }
          changer({ copie: [...adresses(), v] });
          majErreurDestinataire();
          return true;
        };
        const terminer = (validerAvant, { focus = false } = {}) => {
          if (fini) return;
          if (validerAvant && !valider()) return;
          fini = true; saisie = false; enCours = ''; refusEnCours = '';
          dessiner();
          if (focus) rendreFocus();
        };
        const champSaisie = h('input', { class: 'champ', type: 'email', inputmode: 'email', autocomplete: 'off', placeholder: 'contact@exemple.fr', 'aria-label': 'E-mail en copie', dataset: { champ: 'copie' }, value: enCours,
          oninput: (e) => { enCours = e.target.value; montrer(''); },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); terminer(true, { focus: true }); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminer(false, { focus: true }); } },
          onblur: () => terminer(Boolean(champSaisie.value.trim())) });
        parties.push(champSaisie, erreur);
        montrer(refusEnCours); // ligne redessinée pendant la saisie (croix d'une autre adresse) : le motif du refus reste affiché
        zone.replaceChildren(...parties);
        champSaisie.focus();
        return;
      }
      if (liste.length < MAX_COPIE) parties.push(h('button', { type: 'button', class: 'prop-vide', dataset: { action: 'ajouter-copie' }, onclick: () => { saisie = true; enCours = ''; refusEnCours = ''; dessiner(); } }, icone('plus', { taille: 14 }), 'E-mail en copie'));
      else parties.push(h('p', { class: 'copie-vide', dataset: { valeur: 'copie-plafond' } }, `${MAX_COPIE} adresses en copie : c’est le maximum.`)); // au plafond : une phrase grisée à la place du bouton
      zone.replaceChildren(...parties);
    }
    dessiner();
    return zone;
  }

  // ------------------------------------------------ barre du haut
  const majTitreCompact = () => { if (ref.titreCompact) ref.titreCompact.textContent = ref.titre?.textContent ?? ''; };
  function majEntete() {
    if (!ref.titre) return;
    const d = travail;
    ref.titre.textContent = d.numero ? `Devis ${d.numero} · v${d.version ?? 1}` : (String(d.objet ?? '').trim() || 'Nouveau devis'); // un brouillon porte l'objet du devis (la pastille dit déjà « Brouillon »)
    majTitreCompact();
    appliquerPastilleStatut(ref.pastille, d, CRM.ctx().aujourdhui); // mêmes mots et mêmes couleurs que la liste des devis
    if (ref.numeroDocument) ref.numeroDocument.textContent = d.numero ? `Devis n° ${d.numero}${d.version > 1 ? ` · v${d.version}` : ''}` : 'Devis n° Brouillon';
    const nomClient = clientDuDevis(d);
    const lienDe = (el, texte, chemin, pictogramme) => { el.hidden = !texte; if (texte) { el.href = chemin; el.replaceChildren(icone(pictogramme, { taille: 14 }), texte); } };
    lienDe(ref.lienClient, nomClient, d.organisationId ? cheminOrganisation(d.organisationId) : cheminPersonne(d.personneId), d.organisationId ? 'building-2' : 'user');
    const affaire = d.affaireId ? CRM.affaire(d.affaireId) : null;
    lienDe(ref.lienAffaire, affaire?.titre, cheminAffaire(d.affaireId), 'briefcase');
    ref.indicateur.hidden = lecture; // lecture seule : rien à enregistrer
    if (lecture) { ref.indicateur.replaceChildren(); return; }
    if (ref.indicateur.dataset.etat !== etatEnreg) { // une icône de taille fixe : la barre ne bouge pas ; les mots restent pour l'infobulle et les lecteurs d'écran, et s'affichent seulement en cas d'échec
      const libelle = Ed.libelleEnregistrement(etatEnreg);
      const pictogramme = { enCours: 'refresh-cw', erreur: 'triangle-alert' }[etatEnreg] || 'check';
      ref.indicateur.replaceChildren(icone(pictogramme, { taille: 16 }), h('span', { class: etatEnreg === 'erreur' ? '' : 'sr-only' }, libelle));
      ref.indicateur.title = etatEnreg === 'erreur' ? '' : libelle;
      ref.indicateur.dataset.etat = etatEnreg;
    }
    ref.erreurEnreg.hidden = etatEnreg !== 'erreur';
    ref.erreurEnreg.textContent = etatEnreg === 'erreur' ? messageEnreg : '';
    const manquants = Ed.champsManquants(d).length;
    ref.compteurManquants.hidden = !manquants;
    ref.compteurManquants.textContent = manquants ? `${manquants} champ${manquants > 1 ? 's' : ''} à remplir` : '';
    ref.boutonReessayer.hidden = etatEnreg !== 'erreur';
    if (ref.selectAffaire) ref.selectAffaire.classList.toggle('invalide', !d.affaireId);
    if (ref.erreurAffaire) { ref.erreurAffaire.hidden = Boolean(d.affaireId); }
  }

  // ------------------------------------------------ calcul des marges : visible sur les lignes seulement avec la case « Afficher le calcul des marges » du menu Options (la marge du devis se règle dans « Définir un ajustement »)
  const majMarges = () => { racine.dataset.marges = affichage().afficherMarges ? 'oui' : 'non'; };

  // ------------------------------------------------ Catalogue (ancienne « Bibliothèque ») : le bouton dans la barre, à gauche d'Options ; le panneau à droite
  function boutonCatalogue() {
    // Lecture seule : grisé (aria-disabled, jamais retiré, reste focusable) avec une infobulle qui explique pourquoi ; un clic dit « il ne se modifie plus ».
    ref.boutonBibliotheque = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'bibliotheque' }, 'aria-expanded': 'false', 'aria-controls': 'bibliotheque-devis',
      'aria-disabled': lecture ? 'true' : null, title: lecture ? infobulleCatalogueLecture(travail) : null,
      onclick: () => { if (lecture) { refuserModification(); return; } if (bibliotheque?.ouvert()) bibliotheque.fermer(); else ouvrirLaBibliotheque(); } }, icone('list', { taille: 16 }), 'Catalogue');
    return ref.boutonBibliotheque;
  }
  /** `remplacer` : identifiant d'une ligne (bouton « Catalogue » de sa désignation) : l'article choisi prend la place de cette ligne au lieu d'être ajouté à la fin. */
  function ouvrirLaBibliotheque(remplacer = null) {
    if (bibliotheque?.ouvert()) bibliotheque.fermer();
    optionsOuvertes?.fermer();
    historiqueOuvert?.fermer();
    bibliotheque = ouvrirBibliotheque(racine, {
      articles: () => D.etat.articles,
      familles: () => D.etat.familles,
      prixAffiche: (a) => {
        if (a.type === A.TYPE_TEXTE) return '';
        const pv = Ed.prixVenteAffiche(travail, {}, Ed.ligneDepuisArticle(a, { id: 'essai', articles: D.etat.articles, devis: travail }));
        return pv === null ? '' : `${euros(pv)} / ${a.unite || 'u'}`;
      },
      ajouter: (choisis) => {
        if (remplacer) {
          const nouvelle = Ed.ligneDepuisArticle(choisis[0], { id: remplacer, articles: D.etat.articles, devis: travail });
          delete nouvelle.genre;
          appliquer(travail.sections.map((sec) => ({ ...sec, lignes: (sec.lignes ?? []).map((x) => (x.id === remplacer ? nouvelle : x)) })));
          bibliotheque?.fermer();
          toast('Ligne remplie depuis le catalogue', { duree: 2500 });
          return;
        }
        const lignes = choisis.map((a) => Ed.ligneDepuisArticle(a, { id: nouvelId(), articles: D.etat.articles, devis: travail }));
        const section = Ed.sectionDe(travail.sections, ligneActive);
        appliquer(Ed.ajouterFinDeSection(travail.sections, lignes, section));
        toast(`${lignes.length} ligne${lignes.length > 1 ? 's' : ''} ajoutée${lignes.length > 1 ? 's' : ''} au devis`, { duree: 2500 });
      },
    }, { surFermeture: () => { ref.boutonBibliotheque?.setAttribute('aria-expanded', 'false'); }, retour: ref.boutonBibliotheque });
    ref.boutonBibliotheque?.setAttribute('aria-expanded', 'true');
  }

  const champ = (etiquette, controle, { id: idc = null, aide = null } = {}) => h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: idc }, etiquette), controle, aide);

  // ------------------------------------------------ en-tête du document : à gauche les dates, à droite le client et l'affaire
  const jourFr = (j) => (/^\d{4}-\d{2}-\d{2}/.test(j ?? '') ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : '');
  const jourIso = (fr) => (/^\d{2}\/\d{2}\/\d{4}$/.test(fr) ? `${fr.slice(6)}-${fr.slice(3, 5)}-${fr.slice(0, 2)}` : '');
  function dateDuDevis() {
    if (/^\d{4}-\d{2}-\d{2}$/.test(travail.dateEmission ?? '')) return jourFr(travail.dateEmission);
    const v = travail.finaliseLe ?? travail.creeLe;
    const date = v?.toDate ? v.toDate() : v instanceof Date ? v : new Date();
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Une valeur qui s'écrit sur place : un lien « définir » (ou la valeur déjà saisie) ; un clic le remplace par le champ, qui redevient lien quand on le quitte.
   * Les champs ne sont jamais retirés de la page, seulement cachés (retirer une liste au moment où elle perd le focus fait une erreur dans le navigateur).
   */
  function valeurSurPlace({ nom, texte, champs, etiquette = '' }) {
    const lien = h('button', { type: 'button', class: 'bouton-lien lien-definir', dataset: { definir: nom } });
    const saisie = h('span', { class: 'valeur-saisie', hidden: true }, champs());
    const zone = h('span', { class: 'valeur-sur-place' }, lien, saisie);
    const montrerLien = () => { const t = texte(); lien.textContent = t || 'définir'; if (etiquette) lien.setAttribute('aria-label', `${etiquette.trim()} : ${t || 'à définir'}`); lien.classList.toggle('lien-renseigne', Boolean(t)); saisie.hidden = true; lien.hidden = false; };
    lien.addEventListener('click', () => { lien.hidden = true; saisie.hidden = false; saisie.querySelector('input, select')?.focus(); });
    // On referme un peu après avoir quitté le champ : le champ qui disparaît tout de suite décalerait la page entre l'appui et le relâchement d'un clic (le clic sur le lien voisin serait perdu).
    let minuteurFermeture = null;
    zone.addEventListener('focusout', (e) => {
      if (e.target === lien || saisie.hidden || (e.relatedTarget && zone.contains(e.relatedTarget))) return;
      clearTimeout(minuteurFermeture);
      minuteurFermeture = setTimeout(() => { if (!saisie.hidden && !zone.contains(document.activeElement)) montrerLien(); }, 250);
    });
    // Entrée ou Échap referme la saisie (la valeur est déjà prise en compte à chaque frappe) et rend le focus au lien.
    zone.addEventListener('keydown', (e) => { if (!saisie.hidden && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); montrerLien(); lien.focus(); } });
    montrerLien();
    return zone;
  }
  const champDate = (nom, lire, ecrire, etiquette) => () => [h('input', {
    class: 'champ champ-date', type: 'date', value: lire() ?? '', 'aria-label': etiquette, dataset: { champ: nom },
    oninput: (e) => { ecrire(e.target.value || null); marquerModifie(); majErreursChantier(); },
  })];
  const ecrireChantier = (cle) => (v) => { travail.chantier = { ...(travail.chantier ?? {}), [cle]: v }; };

  function champsDuree() {
    const c = travail.chantier ?? {};
    const duree = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', value: saisieNombre(c.dureeEstimee?.valeur), dataset: { champ: 'duree' }, 'aria-label': 'Durée estimée', oninput: () => majDuree() });
    const unite = h('select', { class: 'champ', dataset: { champ: 'duree-unite' }, 'aria-label': 'Unité de la durée', onchange: () => majDuree() },
      UNITES_DUREE.map((u) => h('option', { value: u.id, selected: (c.dureeEstimee?.unite ?? 'jour') === u.id }, u.pluriel)));
    function majDuree() {
      const v = Ed.lireSaisie(duree.value);
      const base = { ...(travail.chantier ?? {}) };
      if (!duree.value.trim()) delete base.dureeEstimee; else base.dureeEstimee = { valeur: v === null ? duree.value : v, unite: unite.value };
      travail.chantier = base;
      marquerModifie();
      majErreursChantier();
    }
    return [duree, unite];
  }

  function enteteDocument() {
    const d = travail;
    const c = d.chantier ?? {};
    const clientActuel = clientsDeAffaire(CRM.affaire(d.affaireId)).find((x) => (d.organisationId ? x.fiche.id === d.organisationId : x.fiche.id === d.personneId));
    ref.adresseAuto = clientActuel?.adresse ?? '';
    ref.emailAuto = clientActuel ? Ed.emailsDeFiche(clientActuel.fiche)[0] ?? '' : '';
    // Un brouillon enregistré avant la règle « l'e-mail suit le client » : on reprend l'e-mail de la fiche tant que rien n'est écrit.
    // Jamais une adresse déjà en copie : le destinataire reste vide et le champ le dit (voir appliquerClient).
    const emailAutoEnCopie = Boolean(ref.emailAuto) && adresseEnCopie(ref.emailAuto);
    if (!lecture && ref.emailAuto && !emailAutoEnCopie && !(travail.destinataires ?? []).length) travail.destinataires = [ref.emailAuto];
    const ligne = (avant, zone, apres = '') => h('p', { class: 'ligne-entete' }, avant, zone, apres);
    ref.numeroDocument = h('h2', { class: 'titre-document', dataset: { valeur: 'numero-devis' } }, '');
    ref.objet = h('textarea', { class: 'champ', id: 'devis-objet', rows: 2, value: d.objet ?? '', placeholder: 'Exemple : Rénovation de la cuisine', 'aria-label': 'Description du devis', hidden: !(d.objet ?? '').trim(), dataset: { champ: 'objet' }, oninput: (e) => changer({ objet: e.target.value }) });
    ref.lienDescription = h('button', { type: 'button', class: 'bouton-lien lien-description', dataset: { action: 'description' }, 'aria-expanded': String(!ref.objet.hidden), onclick: () => {
      ref.objet.hidden = !ref.objet.hidden;
      majLienDescription();
      if (!ref.objet.hidden) ref.objet.focus();
    } });
    function majLienDescription() { remplir(ref.lienDescription, icone(ref.objet.hidden ? 'plus' : 'minus', { taille: 14 }), ref.objet.hidden ? 'Ajouter une description' : 'Masquer la description'); ref.lienDescription.setAttribute('aria-expanded', String(!ref.objet.hidden)); }
    majLienDescription();
    ref.erreursChantier = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'chantier' }, hidden: true });
    const gauche = h('div', { class: 'entete-gauche' },
      ref.numeroDocument,
      ligne('En date du ', valeurSurPlace({ etiquette: 'En date du ', nom: 'dateEmission', texte: () => dateDuDevis(), champs: champDate('dateEmission', () => travail.dateEmission ?? jourIso(dateDuDevis()), (v) => { travail.dateEmission = v; }, 'Date du devis') })),
      ligne('Valable jusqu’au ', valeurSurPlace({ etiquette: 'Valable jusqu’au ', nom: 'expireLe', texte: () => jourFr(travail.expireLe), champs: champDate('expireLe', () => travail.expireLe, (v) => { travail.expireLe = v; }, 'Valable jusqu’au') })),
      ligne('Début des travaux le ', valeurSurPlace({ etiquette: 'Début des travaux le ', nom: 'debutTravaux', texte: () => jourFr(travail.chantier?.debutTravaux), champs: champDate('debutTravaux', () => travail.chantier?.debutTravaux, ecrireChantier('debutTravaux'), 'Début des travaux') })),
      ligne('Durée estimée à ', valeurSurPlace({ etiquette: 'Durée estimée à ', nom: 'duree', texte: () => dureeEnTexte(travail.chantier?.dureeEstimee) ?? '', champs: champsDuree })),
      ligne('Date limite de fin de chantier le ', valeurSurPlace({ etiquette: 'Date limite de fin de chantier le ', nom: 'finChantierAu', texte: () => jourFr(travail.chantier?.finChantierAu), champs: champDate('finChantierAu', () => travail.chantier?.finChantierAu, ecrireChantier('finChantierAu'), 'Date limite de fin de chantier') })),
      ref.erreursChantier,
      ref.lienDescription,
      ref.objet);

    // À droite : le client puis l'affaire (deux grandes listes), puis l'adresse du chantier et l'e-mail du destinataire.
    const liste = affaires();
    const courante = liste.some((a) => a.id === d.affaireId) || !d.affaireId ? liste : [...liste, CRM.affaire(d.affaireId)].filter(Boolean);
    ref.selectAffaire = h('select', { class: 'champ champ-grand', id: 'devis-affaire', dataset: { champ: 'affaire' }, 'aria-required': 'true', 'aria-label': 'Affaire', onchange: (e) => changerAffaire(e.target.value) },
      h('option', { value: '' }, 'Choisis une affaire'), courante.map((a) => h('option', { value: a.id, selected: a.id === d.affaireId }, libelleAffaire(a))));
    ref.erreurAffaire = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'affaire' }, hidden: Boolean(d.affaireId) }, 'Choisis l’affaire de ce devis : sans elle, il ne sera rattaché à aucun client.');
    ref.selectClient = h('select', { class: 'champ champ-grand', id: 'devis-client', dataset: { champ: 'client' }, 'aria-label': 'Client', onchange: (e) => changerClient(e.target.value) });
    majClients();
    ref.champAdresse = h('textarea', {
      class: 'champ', id: 'devis-chantier-adresse', rows: 3, dataset: { champ: 'chantier-adresse' }, value: Ed.texteDeAdresse(c.adresse) || Ed.texteDeAdresse(d.adresses?.chantier),
      oninput: (e) => { const t = e.target.value; travail.adresses = { ...(travail.adresses ?? {}), chantier: Ed.adresseTexteSimple(t) }; travail.chantier = Ed.chantierAvecAdresse(travail.chantier, t); marquerModifie(); majErreursChantier(); },
    });
    // Une adresse ne peut pas être à la fois destinataire et en copie : on le dit tout de suite, et la valeur n'est pas enregistrée tant qu'elle est en double.
    const erreurDestinataire = h('p', { class: 'erreur', id: 'devis-destinataire-erreur', role: 'alert', hidden: true, dataset: { erreur: 'destinataire' } });
    ref.erreurDestinataire = erreurDestinataire;
    const destinataire = h('input', {
      class: 'champ', id: 'devis-destinataire', type: 'email', inputmode: 'email', autocomplete: 'off', value: Ed.emailsDeFiche({ emails: d.destinataires })[0] ?? '', dataset: { champ: 'destinataire' },
      oninput: (e) => {
        const v = e.target.value.trim();
        const doublon = v !== '' && adresseEnCopie(v);
        erreurDestinataire.textContent = doublon ? Ed.MESSAGE_DESTINATAIRE_DEJA_COPIE : '';
        erreurDestinataire.hidden = !doublon;
        e.target.setAttribute('aria-invalid', doublon ? 'true' : 'false');
        if (doublon) e.target.setAttribute('aria-describedby', 'devis-destinataire-erreur'); else e.target.removeAttribute('aria-describedby');
        if (doublon) return;
        changer({ destinataires: v ? [v] : [] });
      },
      onblur: (e) => { // en quittant le champ avec un doublon : on remet l'adresse enregistrée
        if (e.target.getAttribute('aria-invalid') !== 'true') return;
        e.target.value = (travail.destinataires ?? [])[0] ?? '';
        e.target.setAttribute('aria-invalid', 'false');
        e.target.removeAttribute('aria-describedby');
        erreurDestinataire.hidden = true;
      },
    });
    if (emailAutoEnCopie && !(travail.destinataires ?? []).length) montrerDestinataireDejaEnCopie();
    const droite = h('div', { class: 'entete-droite' },
      champ('Affaire *', ref.selectAffaire, { id: 'devis-affaire', aide: ref.erreurAffaire }),
      champ('Client', ref.selectClient, { id: 'devis-client' }),
      champ('Adresse du chantier', ref.champAdresse, { id: 'devis-chantier-adresse' }),
      champ('E-mail du destinataire', destinataire, { id: 'devis-destinataire', aide: erreurDestinataire }),
      blocCopie());
    return h('div', { class: 'entete-document' }, gauche, droite);
  }

  function majClients() {
    if (!ref.selectClient) return;
    const a = CRM.affaire(travail.affaireId);
    const clients = clientsDeAffaire(a);
    const valeur = travail.organisationId ? `organisation:${travail.organisationId}` : travail.personneId ? `personne:${travail.personneId}` : '';
    const options = [h('option', { value: '' }, clients.length ? 'Sélectionner un client' : 'Aucun client sur cette affaire')];
    for (const c of clients) options.push(h('option', { value: `${c.type}:${c.fiche.id}`, selected: valeur === `${c.type}:${c.fiche.id}` }, `${c.type === 'organisation' ? 'Organisation' : 'Personne'} : ${c.nom}`));
    // Un client déjà choisi qui n'est plus sur l'affaire reste affiché (il ne disparaît pas en silence).
    if (valeur && !clients.some((c) => `${c.type}:${c.fiche.id}` === valeur)) options.push(h('option', { value: valeur, selected: true }, clientDuDevis(travail) || 'Client du devis'));
    remplir(ref.selectClient, options);
    ref.selectClient.value = valeur;
    if (valeursFigees.has(ref.selectClient)) valeursFigees.set(ref.selectClient, valeur); // lecture seule : la valeur à remettre suit la liste redessinée
  }

  function changerAffaire(valeur) {
    if (lecture) return;
    const a = CRM.affaire(valeur);
    if (!a) { changer({ affaireId: null }); majEntete(); return; }
    const clients = clientsDeAffaire(a);
    const c = clients[0] ?? null;
    const patch = { affaireId: a.id, organisationId: c?.type === 'organisation' ? c.fiche.id : null, personneId: c?.type === 'personne' ? c.fiche.id : null };
    Object.assign(travail, patch);
    appliquerClient(c, true);
    majClients();
    majEntete();
  }
  function changerClient(valeur) {
    if (lecture) return;
    const [type, cid] = valeur.split(':');
    const c = clientsDeAffaire(CRM.affaire(travail.affaireId)).find((x) => x.type === type && x.fiche.id === cid) ?? null;
    Object.assign(travail, { organisationId: type === 'organisation' ? cid : null, personneId: type === 'personne' ? cid : null });
    appliquerClient(c, false);
  }
  /** Vrai si `v` est déjà dans les e-mails en copie (même règle que l'ajout en copie : Ed.memeAdresse). */
  function adresseEnCopie(v) { return (Array.isArray(travail.copie) ? travail.copie : []).some((a) => Ed.memeAdresse(a, v)); }
  function montrerDestinataireDejaEnCopie() {
    if (!ref.erreurDestinataire) return;
    ref.erreurDestinataire.textContent = Ed.MESSAGE_DESTINATAIRE_DEJA_COPIE;
    ref.erreurDestinataire.hidden = false;
    const champMail = racine.querySelector('[data-champ="destinataire"]');
    champMail?.setAttribute('aria-invalid', 'true');
    champMail?.setAttribute('aria-describedby', 'devis-destinataire-erreur');
  }
  /** Après un changement des e-mails en copie : le message « déjà en copie » du destinataire suit la réalité (disparaît si l'adresse n'est plus en copie ; l'adresse tapée alors valable est enregistrée). */
  function majErreurDestinataire() {
    const champMail = racine.querySelector('[data-champ="destinataire"]');
    if (!champMail || !ref.erreurDestinataire) return;
    const v = champMail.value.trim();
    if (v) {
      if (adresseEnCopie(v)) { montrerDestinataireDejaEnCopie(); return; }
      cacherErreurDestinataire();
      if (((travail.destinataires ?? [])[0] ?? '') !== v) changer({ destinataires: [v] });
    } else if (!ref.erreurDestinataire.hidden && !(ref.emailAuto && adresseEnCopie(ref.emailAuto))) cacherErreurDestinataire();
  }
  function cacherErreurDestinataire() {
    if (!ref.erreurDestinataire) return;
    ref.erreurDestinataire.textContent = '';
    ref.erreurDestinataire.hidden = true;
    const champMail = racine.querySelector('[data-champ="destinataire"]');
    champMail?.setAttribute('aria-invalid', 'false');
    champMail?.removeAttribute('aria-describedby');
  }
  /** Reprend l'adresse et le premier e-mail du client, sans écraser une adresse de chantier ou un e-mail que l'utilisateur a écrits à la main. */
  function appliquerClient(c, remplacerEmail) {
    if (lecture) return;
    const adresse = c?.adresse ?? '';
    const adresseActuelle = Ed.texteDeAdresse(travail.chantier?.adresse) || Ed.texteDeAdresse(travail.adresses?.chantier);
    const precedente = ref.adresseAuto ?? '';
    const aRemplacer = !adresseActuelle || adresseActuelle === precedente;
    ref.adresseAuto = adresse;
    const a = Ed.adresseTexteSimple(adresse);
    travail.adresses = { ...(travail.adresses ?? {}), commanditaire: a, facturation: a };
    if (aRemplacer) {
      travail.adresses.chantier = a;
      travail.chantier = Ed.chantierAvecAdresse(travail.chantier, adresse);
      if (ref.champAdresse) ref.champAdresse.value = adresse;
    }
    // L'e-mail du destinataire suit le client choisi, tant que l'utilisateur ne l'a pas écrit lui-même (même règle que l'adresse du chantier).
    // Si cet e-mail est déjà en copie, il n'est pas repris (pas de doublon destinataire / copie) : le destinataire reste vide et le champ dit pourquoi.
    const mail = c ? Ed.emailsDeFiche(c.fiche)[0] ?? '' : '';
    const actuel = (travail.destinataires ?? [])[0] ?? '';
    if (!actuel || actuel === (ref.emailAuto ?? '')) {
      const enCopie = Boolean(mail) && adresseEnCopie(mail);
      const repris = enCopie ? '' : mail;
      travail.destinataires = repris ? [repris] : [];
      const champMail = racine.querySelector('[data-champ="destinataire"]');
      if (champMail) champMail.value = repris;
      if (enCopie) montrerDestinataireDejaEnCopie(); else cacherErreurDestinataire();
    }
    ref.emailAuto = mail;
    marquerModifie();
  }

  function majErreursChantier() {
    if (!ref.erreursChantier) return;
    const e = erreursChantier(travail.chantier);
    ref.erreursChantier.hidden = !e.length;
    remplir(ref.erreursChantier, e.join(' '));
  }

  // ------------------------------------------------ lignes
  // Colonnes du tableau (celles que le menu Options cache disparaissent) ; « Prix U. HT ajusté » quand un ajustement global est actif.
  function colonnes() {
    const aff = affichage();
    return [
      { cle: 'poi', texte: '' }, { cle: 'num', texte: 'N°' }, { cle: 'des', texte: 'Désignation' },
      ...(aff.cacherQuantiteUnite ? [] : [{ cle: 'qte', texte: 'Qté', d: true }, { cle: 'uni', texte: 'Unité' }]),
      { cle: 'pri', texte: ajustementActif(travail) ? 'Prix U. HT ajusté' : 'Prix U. HT', d: true },
      ...(aff.cacherTva ? [] : [{ cle: 'tva', texte: 'TVA' }]),
      { cle: 'tot', texte: 'Total HT', d: true }, { cle: 'act', texte: '' },
    ];
  }
  /** Nombre de colonnes que la cellule de désignation d'une section (le total reste à part) ou d'un texte (il enjambe aussi le total) occupe. */
  const colonnesDeLaDesignation = (totalAPart) => colonnes().length - 3 - (totalAPart ? 1 : 0);
  function rendreEntetesTableau() {
    if (!ref.enteteTableau) return;
    remplir(ref.enteteTableau, h('tr', {}, colonnes().map((c) => h('th', { scope: 'col', class: `col-${c.cle}${c.d ? ' d' : ''}`, 'aria-label': c.texte || undefined }, c.texte))));
  }
  function blocLignes() {
    ref.rechercheBordereau = h('input', {
      class: 'champ', type: 'search', placeholder: 'Libellé, code ou référence', autocomplete: 'off', 'aria-label': 'Rechercher dans le catalogue', dataset: { champ: 'recherche-bordereau' },
      oninput: (e) => { rechercheBordereau = e.target.value; majResultats(); },
    });
    ref.filtreFamille = h('select', { class: 'champ', 'aria-label': 'Famille', dataset: { champ: 'filtre-famille' }, onchange: (e) => { filtreFamille = e.target.value; majResultats(); } },
      h('option', { value: '' }, 'Toutes les familles'), arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [f, ...enfants]).filter((f) => f.actif).map((f) => h('option', { value: f.id }, f.parentId ? `\u00a0\u00a0\u00a0\u00a0– ${f.nom}` : f.nom)), h('option', { value: 'sans_famille' }, 'Sans famille'));
    ref.resultats = h('ul', { class: 'resultats-bordereau', dataset: { zone: 'resultats' } });
    ref.panneauRecherche = h('div', { class: 'recherche-bordereau', hidden: true, dataset: { zone: 'recherche' } },
      h('div', { class: 'ligne-champs' }, ref.rechercheBordereau, ref.filtreFamille,
        h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'fermer-recherche' }, onclick: () => { ref.panneauRecherche.hidden = true; pointInsertion = null; rechercheEnLigne = false; placerPanneauRecherche(); } }, 'Fermer')),
      ref.resultats,
      // Les éléments sans article du Bordereau : ils se posent au même endroit que l'article qu'on chercherait, puis la boîte se ferme.
      h('div', { class: 'recherche-autres-ajouts', dataset: { zone: 'recherche-autres' } },
        [['Section', 'section'], ['Sous-section', 'sous-section'], ['Texte', 'texte'], ['Saut de page', 'saut']].map(([libelle, cle]) => h('button', {
          type: 'button', class: 'bouton bouton-secondaire', dataset: { action: `recherche-ajouter-${cle}` }, onclick: () => ajouterSansArticle(cle),
        }, libelle))));
    ref.hoteRecherche = h('div', {}, ref.panneauRecherche);
    ref.corpsLignes = h('tbody', {});
    // La Bibliothèque ajoute à la fin de la section de la dernière ligne touchée.
    ref.corpsLignes.addEventListener('focusin', (e) => { const tr = e.target.closest?.('tr[data-id]'); if (tr) ligneActive = tr.dataset.id; });
    ref.enteteTableau = h('thead', {});
    rendreEntetesTableau();
    ref.vide = h('div', { class: 'etat-vide-ligne', dataset: { vide: 'lignes' } }, h('p', {}, 'Clique sur un des boutons ci-dessous pour ajouter un élément à ton devis.'));
    ref.zoneTableau = h('div', { class: 'zone-tableau zone-lignes-devis' }, h('table', { class: 'tableau-lignes-devis' }, ref.enteteTableau, ref.corpsLignes));
    const bouton = (libelle, action, onclick, { desactive = false, titre = null } = {}) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action }, disabled: desactive, title: titre ?? undefined, onclick }, libelle);
    const type = (libelle, familleId) => bouton([icone('plus', { taille: 14 }), libelle], `ajouter-${familleId}`, () => ouvrirRecherche(familleId));
    const barre = h('div', { class: 'barre-ajouts', dataset: { zone: 'ajouts' } },
      h('div', { class: 'ajouts-types' },
        type('Fourniture', 'famille-1'), type('Main d’œuvre', 'famille-2'), type('Ouvrage', 'famille-3'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'autres-ajouts' }, 'aria-haspopup': 'menu', 'aria-label': 'Autres types de lignes', onclick: (ev) => ouvrirMenu(ev.currentTarget, [
          { libelle: 'Sous-traitance', action: () => ouvrirRecherche('famille-4') },
          { libelle: 'Matériel', action: () => ouvrirRecherche('famille-5') },
          { libelle: 'Divers', action: () => ouvrirRecherche('famille-7') },
          { separateur: true },
          { libelle: 'Ligne libre', icone: 'plus', action: () => ajouterLigne(Ed.ligneLibre(nouvelId())) },
        ]) }, '…')),
      h('div', { class: 'ajouts-structure' },
        bouton('Section', 'ajouter-section', () => ajouterLigne(Ed.sectionNeuve(nouvelId()))),
        bouton('Sous-section', 'ajouter-sous-section', () => ajouterLigne(Ed.sousSectionNeuve(nouvelId()))),
        bouton('Texte', 'ajouter-texte', () => ajouterLigne(Ed.ligneTexte(nouvelId()))),
        (ref.boutonSaut = bouton('Saut de page', 'ajouter-saut', ajouterSautEnFin))));
    return [ref.vide, ref.zoneTableau, barre, ref.hoteRecherche];
  }

  /** Le bouton « Saut de page » du bas : un saut à la fin de la section où l'on travaille (à la fin du devis s'il n'y a pas de section). */
  function ajouterSautEnFin() {
    const saut = Ed.ligneSaut(nouvelId());
    const section = Ed.sectionDe(travail.sections, ligneActive);
    appliquer(section ? Ed.insererAutour(travail.sections, saut, section, 'fin') : Ed.ajouterElement(travail.sections, saut, null, nouvelId()), { focus: saut.id });
  }

  /** Boutons Section, Sous-section, Texte, Saut de page de la boîte de recherche : posés sous (ou sur) la ligne choisie, sinon à la fin du devis ; puis la boîte se ferme. */
  function ajouterSansArticle(cle) {
    const cible = pointInsertion ? Ed.aplatir(travail.sections).find((x) => x.id === pointInsertion) : null;
    const creer = { section: () => Ed.sectionNeuve(nouvelId()), 'sous-section': () => Ed.sousSectionNeuve(nouvelId()), texte: () => Ed.ligneTexte(nouvelId()), saut: () => Ed.ligneSaut(nouvelId()) }[cle];
    const element = creer();
    const sens = sensInsertion;
    ref.panneauRecherche.hidden = true; pointInsertion = null; sensInsertion = 'apres'; rechercheEnLigne = false;
    placerPanneauRecherche();
    if (cible) appliquer(Ed.insererAutour(travail.sections, element, cible.id, sens, nouvelId()), { focus: element.id });
    else if (cle === 'saut') ajouterSautEnFin();
    else ajouterLigne(element, { champ: 'libelle' });
  }

  /** Ouvre la recherche dans le Bordereau, déjà filtrée sur une famille (« + Fourniture » → les fournitures). */
  function ouvrirRecherche(familleId, { enLigne = false } = {}) {
    rechercheEnLigne = enLigne;
    if (!enLigne) pointInsertion = null;
    filtreFamille = familleId && D.etat.familles.some((f) => f.id === familleId && f.actif !== false) ? familleId : '';
    ref.filtreFamille.value = filtreFamille;
    ref.panneauRecherche.hidden = false;
    majResultats();
    placerPanneauRecherche();
    ref.rechercheBordereau.focus({ preventScroll: true });
    ref.panneauRecherche.scrollIntoView?.({ block: 'nearest' });
  }

  /** Place la recherche du Bordereau : sous (ou sur) la ligne choisie dans un menu « Insérer », sinon en bas du devis. */
  function placerPanneauRecherche() {
    if (!ref.hoteRecherche || !ref.corpsLignes) return;
    const ligneCible = rechercheEnLigne && !ref.panneauRecherche.hidden && pointInsertion ? ref.corpsLignes.querySelector(`tr[data-id="${pointInsertion}"]`) : null;
    if (!ligneCible) {
      if (ref.panneauRecherche.parentElement !== ref.hoteRecherche) ref.hoteRecherche.append(ref.panneauRecherche);
      ref.trRecherche?.remove();
      return;
    }
    ref.trRecherche ??= h('tr', { class: 'ligne-recherche', dataset: { zone: 'recherche-en-ligne' } }, h('td', { colspan: 8 }));
    const cellule = ref.trRecherche.firstElementChild;
    if (ref.panneauRecherche.parentElement !== cellule) cellule.append(ref.panneauRecherche);
    let ancre = ligneCible;
    let avant = sensInsertion === 'avant';
    if (!avant && ligneCible.dataset.genre === 'section' && sensInsertion === 'fin') {
      // À la fin d'une section : après sa dernière ligne (les sous-sections d'une section de niveau 1 en font partie).
      const niveau = Number(ligneCible.dataset.niveau);
      for (let suivante = ligneCible.nextElementSibling; suivante; suivante = suivante.nextElementSibling) {
        if (suivante === ref.trRecherche) continue;
        if (suivante.dataset.genre === 'section' && Number(suivante.dataset.niveau) <= niveau) break;
        ancre = suivante;
      }
    }
    if (avant) ancre.before(ref.trRecherche); else ancre.after(ref.trRecherche);
  }

  function majResultats() {
    if (!ref.resultats) return;
    const actifs = D.etat.articles.filter((a) => a.actif !== false);
    if (!actifs.length) {
      remplir(ref.resultats, h('li', { class: 'texte-discret', dataset: { vide: 'bordereau' } }, 'Ton catalogue est vide : crée tes articles dans le catalogue, ou utilise une ligne libre.', ' ', h('a', { href: '#/devis/bordereau' }, 'Ouvrir le catalogue')));
      return;
    }
    if (!rechercheBordereau.trim() && !filtreFamille) { remplir(ref.resultats, h('li', { class: 'texte-discret' }, 'Tape un mot pour chercher dans ton catalogue, ou choisis une famille.')); return; }
    const trouves = A.avecCalculOuvrage(A.filtrerArticles(actifs, { recherche: rechercheBordereau, statut: 'actifs', familleId: filtreFamille, familles: D.etat.familles }), D.etat.articles, D.etat.reglages).slice(0, 8);
    if (!trouves.length) { remplir(ref.resultats, h('li', { class: 'texte-discret', dataset: { vide: 'resultats' } }, 'Aucun article ne correspond.')); return; }
    remplir(ref.resultats, trouves.map((a) => {
      const ligne = Ed.ligneDepuisArticle(a, { id: 'essai', articles: D.etat.articles, devis: travail });
      const pv = a.type === A.TYPE_TEXTE ? null : Ed.prixVenteAffiche(travail, {}, ligne);
      return h('li', {}, h('button', { type: 'button', class: 'resultat-bordereau', dataset: { action: 'ajouter-article', articleId: a.id }, onclick: () => ajouterArticle(a) },
        h('span', { class: 'resultat-nom' }, a.libelle, a.code ? h('span', { class: 'texte-discret' }, ` · ${a.code}`) : null, a.type ? h('span', { class: 'texte-discret' }, ` · ${A.libelleType(a.type)}`) : null),
        h('span', { class: 'resultat-prix' }, pv === null ? '' : `${euros(pv)} / ${a.unite || 'u'}`)));
    }));
    verrouiller(ref.resultats); // lecture seule : les résultats redessinés sont grisés aussi, un clic affiche le message
  }

  function ajouterArticle(a) {
    ajouterLigne(Ed.ligneDepuisArticle(a, { id: nouvelId(), articles: D.etat.articles, devis: travail }), { champ: 'quantite', suite: rechercheEnLigne && !ref.panneauRecherche.hidden });
  }

  function rendreLignes() {
    if (!ref.corpsLignes) return;
    majMarges();
    const numeros = Ed.numerotation(travail.sections);
    const niveaux = Object.fromEntries(travail.sections.map((s, i) => [s.id, niveauSection(travail.sections, i)]));
    const elements = Ed.aplatir(travail.sections);
    ref.vide.hidden = elements.length > 0;
    ref.zoneTableau.hidden = elements.length === 0;
    if (ref.boutonSaut) { ref.boutonSaut.disabled = elements.length === 0; ref.boutonSaut.title = elements.length === 0 ? 'Ajoute d’abord un élément au devis : un saut de page se place entre deux éléments.' : ''; }
    // Une section repliée cache ses lignes ; une section de niveau 1 repliée cache aussi ses sous-sections.
    let replie1 = false;
    let replie2 = false;
    remplir(ref.corpsLignes, elements.map((e) => {
      let masque;
      if (e.genre === 'section') {
        if (niveaux[e.id] === 1) { replie1 = replies.has(e.id); replie2 = false; masque = false; } else { masque = replie1; replie2 = replies.has(e.id); }
        return ligneSection(e, numeros, niveaux[e.id], masque);
      }
      masque = replie1 || replie2;
      if (e.type === TYPE_SAUT) return ligneDeSaut(e, masque);
      return e.type === A.TYPE_TEXTE ? ligneDeTexte(e, numeros, masque) : ligneDevis(e, numeros, masque);
    }));
    placerPanneauRecherche();
    majTotaux();
    verrouiller(ref.corpsLignes);
  }

  const nomDe = (e, numero) => (e.genre === 'section' ? `la section ${numero}` : e.type === TYPE_SAUT ? 'le saut de page' : `la ligne ${numero}`);

  // Poignée à gauche : les deux flèches qui déplacent la ligne ou la section (le glisser-déposer n'est pas encore là).
  function celluleDeplacement(e, numero) {
    const p = Ed.deplacementsPossibles(travail.sections, e.id);
    const nom = nomDe(e, numero);
    return h('td', { class: 'c-poi poignee-devis' },
      h('button', { type: 'button', class: 'bouton-poignee', dataset: { action: 'monter' }, disabled: !p.monter, 'aria-label': `Monter ${nom}`, onclick: () => deplacer(e, -1) }, icone('chevron-up', { taille: 14 })),
      h('button', { type: 'button', class: 'bouton-poignee', dataset: { action: 'descendre' }, disabled: !p.descendre, 'aria-label': `Descendre ${nom}`, onclick: () => deplacer(e, 1) }, icone('chevron-down', { taille: 14 })));
  }

  // Petit bouton rond à droite : les actions de la ligne (le menu complet viendra ensuite).
  function celluleActions(e, numero) {
    const nom = nomDe(e, numero);
    return h('td', { class: 'c-act col-actions-lignes' },
      h('button', { type: 'button', class: 'bouton-icone bouton-rond', dataset: { action: 'menu-ligne' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Actions pour ${nom}`, onclick: (ev) => { ligneActive = e.id; ouvrirMenuLigne(ev.currentTarget, e, nom); } }, icone('chevron-down', { taille: 16 })));
  }

  /** Niveau (1 ou 2) de la section qui contient cet élément, ou qui est cet élément. */
  function niveauDeSection(e) {
    const idS = e.genre === 'section' ? e.id : Ed.sectionDe(travail.sections, e.id);
    const k = travail.sections.findIndex((x) => x.id === idS);
    return k === -1 ? 1 : niveauSection(travail.sections, k);
  }

  /**
   * Le sous-menu « Insérer… » : les neuf choix. `ou` : 'avant' (au dessus), 'apres' (en dessous), 'debut' ou 'fin' (dans la section). Les six premiers ouvrent la recherche du Bordereau
   * déjà filtrée ; « Section » crée une sous-section quand on insère DANS une section de niveau 1 (ou autour d'une sous-section), une section sinon.
   */
  function entreesInsertion(e, ou) {
    const niveau = niveauDeSection(e);
    const sousSection = e.genre === 'section' ? (niveau === 2 || ou === 'debut' || ou === 'fin') : niveau === 2;
    const poser = (creer) => () => {
      const element = creer();
      appliquer(Ed.insererAutour(travail.sections, element, e.id, ou, nouvelId()), { focus: element.id });
    };
    const chercher = (familleId) => () => { pointInsertion = e.id; sensInsertion = ou; ouvrirRecherche(familleId, { enLigne: true }); };
    return [
      { libelle: 'Fourniture', cle: `inserer-${ou}-fourniture`, action: chercher('famille-1') },
      { libelle: 'Main d’œuvre', cle: `inserer-${ou}-main-oeuvre`, action: chercher('famille-2') },
      { libelle: 'Ouvrage', cle: `inserer-${ou}-ouvrage`, action: chercher('famille-3') },
      { libelle: 'Sous-traitance', cle: `inserer-${ou}-sous-traitance`, action: chercher('famille-4') },
      { libelle: 'Matériel', cle: `inserer-${ou}-materiel`, action: chercher('famille-5') },
      { libelle: 'Divers', cle: `inserer-${ou}-divers`, action: chercher('famille-7') },
      { libelle: 'Section', cle: `inserer-${ou}-section`, action: poser(() => (sousSection ? Ed.sousSectionNeuve(nouvelId()) : Ed.sectionNeuve(nouvelId()))) },
      { libelle: 'Texte', cle: `inserer-${ou}-texte`, action: poser(() => Ed.ligneTexte(nouvelId())) },
      { libelle: 'Saut de page', cle: `inserer-${ou}-saut`, action: poser(() => Ed.ligneSaut(nouvelId())) },
    ];
  }

  /** Menu de la flèche : une section ou sous-section (6 entrées), une ligne, un texte ou un saut de page (insérer, dupliquer, monter, descendre, supprimer). */
  function ouvrirMenuLigne(ancre, e, nom) {
    const p = Ed.deplacementsPossibles(travail.sections, e.id);
    const dupliquer = { libelle: 'Dupliquer', icone: 'copy', cle: 'dupliquer', action: () => { const r = Ed.dupliquerElement(travail.sections, e.id, nouvelId); appliquer(r.sections); } };
    const supprimerEntree = { libelle: 'Supprimer', icone: 'trash-2', cle: 'supprimer', danger: true, action: () => supprimer(e, nom) };
    const entrees = e.genre === 'section' ? [
      { libelle: 'Insérer au début', cle: 'inserer-debut', sous: entreesInsertion(e, 'debut') },
      { libelle: 'Insérer à la fin', cle: 'inserer-fin', sous: entreesInsertion(e, 'fin') },
      { libelle: 'Insérer au dessus', cle: 'inserer-avant', sous: entreesInsertion(e, 'avant') },
      { libelle: 'Insérer en dessous', cle: 'inserer-apres', sous: entreesInsertion(e, 'apres') },
      dupliquer, supprimerEntree,
    ] : [
      { libelle: 'Insérer au dessus', cle: 'inserer-avant', sous: entreesInsertion(e, 'avant') },
      { libelle: 'Insérer en dessous', cle: 'inserer-apres', sous: entreesInsertion(e, 'apres') },
      dupliquer,
      { libelle: 'Monter', icone: 'arrow-up', cle: 'monter', desactive: !p.monter, action: () => appliquer(Ed.deplacerElement(travail.sections, e.id, -1)) },
      { libelle: 'Descendre', icone: 'arrow-down', cle: 'descendre', desactive: !p.descendre, action: () => appliquer(Ed.deplacerElement(travail.sections, e.id, 1)) },
      { separateur: true },
      supprimerEntree,
    ];
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu(entrees, fermer), { classe: 'menu-devis-ligne', nom: `Actions pour ${nom}` });
  }

  /** Reconfigure les éléments d'une ligne d'ouvrage : la composition figée s'ouvre dans le même éditeur que celui du Bordereau, puis le prix et la description sont recalculés. */
  async function configurerOuvrage(idLigne) {
    const trouve = Ed.trouverLigne(travail.sections, idLigne);
    if (!trouve?.ligne?.ouvrage) return;
    const editeur = editeurOuvrage({ composants: trouve.ligne.ouvrage.composants.map((c) => ({ articleId: c.articleId, quantite: c.quantite })) });
    const ok = await dialogue({
      titre: 'Éléments de l’ouvrage', contenu: editeur.element,
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Appliquer', valeur: true, style: 'principal' }],
    });
    if (ok !== true) return;
    const valeurs = editeur.valeurs();
    const ouvrage = { composants: valeurs.composants.map((c) => ({ articleId: c.articleId, quantite: c.quantite ?? 0 })), prixVenteForce: A.lireNombre(valeurs.prixVenteForce) ?? undefined };
    const erreurs = O.erreursOuvrage(ouvrage, O.articlesParId(D.etat.articles));
    if (erreurs.length) { toast(erreurs[0], { type: 'erreur', duree: 8000 }); return; }
    const nouvelle = Ed.ligneAvecComposants(trouve.ligne, ouvrage, { articles: D.etat.articles, devis: travail });
    appliquer(Ed.majElement(travail.sections, idLigne, { ouvrage: nouvelle.ouvrage, prixAchat: nouvelle.prixAchat, marge: nouvelle.marge, description: nouvelle.description }));
  }

  async function supprimer(e, nom) {
    const avant = travail.sections;
    const n = Ed.lignesEmportees(avant, e.id);
    const lourd = e.genre === 'section' && n > 0;
    await retirerAvecAnnulation({
      titre: e.genre === 'section' ? 'Supprimer cette section ?' : e.type === TYPE_SAUT ? 'Supprimer ce saut de page ?' : 'Supprimer cette ligne ?',
      message: lourd ? `La section et ses ${n} ligne${n > 1 ? 's' : ''} seront retirées du devis.` : `Retirer ${nom} du devis.`,
      libelleOk: 'Supprimer', danger: true, messageFait: lourd ? 'Section retirée' : e.type === TYPE_SAUT ? 'Saut de page retiré' : 'Ligne retirée',
      faire: () => { appliquer(Ed.supprimerElement(travail.sections, e.id)); },
      defaire: () => { appliquer(avant); },
    });
  }

  /** Zone de texte qui grandit avec son contenu (une désignation s'écrit sur plusieurs lignes). */
  function ajusterHauteur(zone) {
    const regler = () => { zone.style.height = 'auto'; if (zone.scrollHeight) zone.style.height = `${zone.scrollHeight}px`; };
    zone.addEventListener('input', regler);
    requestAnimationFrame(regler);
    return zone;
  }

  function ligneSection(e, numeros, niveau, masque) {
    const sous = niveau === 2;
    const repliee = replies.has(e.id);
    const replier = h('button', { type: 'button', class: 'bouton-icone bouton-replier', dataset: { action: 'replier' }, 'aria-expanded': String(!repliee), 'aria-label': `${repliee ? 'Déplier' : 'Replier'} ${sous ? 'la sous-section' : 'la section'} ${numeros[e.id]}`,
      onclick: () => { if (replies.has(e.id)) replies.delete(e.id); else replies.add(e.id); rendreLignes(); document.querySelector(`tr[data-id="${e.id}"] [data-action="replier"]`)?.focus(); } }, icone(repliee ? 'plus' : 'minus', { taille: 14 }));
    const titre = h('input', { class: 'champ champ-surplace titre-section', type: 'text', value: e.titre ?? '', placeholder: sous ? 'Titre de la sous-section (exemple : Coin bar)' : 'Titre de la section (exemple : Cuisine)', 'aria-label': `Titre de ${sous ? 'la sous-section' : 'la section'} ${numeros[e.id]}`, dataset: { champ: 'libelle' }, oninput: (ev) => changerLigne(e.id, { titre: ev.target.value }) });
    return h('tr', { class: `ligne-section-devis ${sous ? 'sous-section-devis' : ''}`, hidden: masque, dataset: { id: e.id, genre: 'section', niveau: String(niveau) } },
      celluleDeplacement(e, numeros[e.id]),
      h('td', { class: 'c-num num', dataset: { libelle: 'N°' } }, numeros[e.id]),
      h('td', { colspan: colonnesDeLaDesignation(true), class: 'c-des cellule-section', dataset: { libelle: sous ? 'Sous-section' : 'Section' } }, h('div', { class: 'ligne-champs' }, replier, titre)),
      h('td', { class: 'c-tot d', dataset: { libelle: 'Sous-total HT' } }, affichage().cacherTotauxSections ? null : [h('span', { class: 'etiquette-sous-total' }, 'Sous-total : '), h('span', { class: 'sous-total-section', dataset: { sousTotal: e.id } })]),
      celluleActions(e, numeros[e.id]));
  }

  /** Un saut de page : une bande rayée en pointillés sur toute la largeur, sans numéro ni prix ; la poignée et le menu restent aux deux bouts. */
  function ligneDeSaut(e, masque) {
    return h('tr', { class: 'ligne-saut-devis', hidden: masque, dataset: { id: e.id, genre: 'saut' } },
      celluleDeplacement(e, ''),
      h('td', { colspan: colonnes().length - 2, class: 'c-des c-saut' }, h('div', { class: 'bande-saut', role: 'separator', 'aria-label': 'Saut de page' }, h('span', {}, 'Saut de page'))),
      celluleActions(e, ''));
  }

  function ligneDeTexte(e, numeros, masque) {
    const zone = ajusterHauteur(h('textarea', { class: 'champ champ-surplace', rows: 2, placeholder: 'Texte affiché sur le devis, sans prix', 'aria-label': `Texte ${numeros[e.id]}`, dataset: { champ: 'libelle' }, value: e.libelle ?? '', oninput: (ev) => changerLigne(e.id, { libelle: ev.target.value }) }));
    return h('tr', { class: 'ligne-devis-edition ligne-texte-devis', hidden: masque, dataset: { id: e.id, genre: 'texte' } },
      celluleDeplacement(e, numeros[e.id]),
      h('td', { class: 'c-num num', dataset: { libelle: 'N°' } }, numeros[e.id]),
      h('td', { colspan: colonnesDeLaDesignation(false), class: 'c-des', dataset: { libelle: 'Texte' } }, zone),
      celluleActions(e, numeros[e.id]));
  }

  function ligneDevis(e, numeros, masque) {
    const l = e;
    const cellule = (classe, libelle, ...contenu) => h('td', { class: classe, dataset: { libelle } }, ...contenu);
    const libelle = ajusterHauteur(h('textarea', { class: 'champ champ-surplace', rows: 1, value: l.libelle ?? '', placeholder: 'Désignation', 'aria-label': `Désignation ${numeros[l.id]}`, dataset: { champ: 'libelle' }, oninput: (ev) => changerLigne(l.id, { libelle: ev.target.value }) }));
    // Petit bouton « Catalogue » à côté de la désignation d'une ligne qui ne vient pas encore d'un article : il remplit la ligne avec un article du Bordereau.
    const catalogue = !l.articleId && !l.ouvrage && !masque
      ? h('button', { type: 'button', class: 'bouton-lien bouton-catalogue-ligne', dataset: { action: 'catalogue-ligne' }, 'aria-label': `Choisir ${numeros[l.id]} dans le catalogue`, title: 'Choisir dans le catalogue', onclick: () => ouvrirLaBibliotheque(l.id) }, icone('list', { taille: 14 })) : null;
    const composition = l.ouvrage ? h('pre', { class: 'composition-ouvrage', dataset: { valeur: 'composition' } }, Ed.descriptionDeLigne(l)) : null;
    // Une description écrite à la main (hors ouvrage) se lit et se corrige sous la désignation, en petit.
    const description = !l.ouvrage && typeof l.description === 'string' && l.description.trim()
      ? ajusterHauteur(h('textarea', { class: 'champ champ-surplace description-ligne', rows: 1, value: l.description, 'aria-label': `Description ${numeros[l.id]}`, dataset: { champ: 'description' }, oninput: (ev) => changerLigne(l.id, { description: ev.target.value }) })) : null;
    const quantite = h('input', {
      class: 'champ champ-surplace champ-nombre', type: 'text', inputmode: 'decimal', value: saisieNombre(l.quantite), 'aria-label': `Quantité ${numeros[l.id]}`, dataset: { champ: 'quantite' },
      oninput: (ev) => {
        const q = Ed.lireSaisie(ev.target.value);
        const patch = { quantite: q };
        if (l.ouvrage) { const lig = Ed.trouverLigne(travail.sections, l.id).ligne; patch.description = Ed.descriptionDeLigne({ ...lig, quantite: q ?? 1 }); if (composition) composition.textContent = patch.description; }
        ev.target.classList.toggle('invalide', ev.target.value.trim() !== '' && q === null);
        changerLigne(l.id, patch);
      },
    });
    // Ligne libre : l'unité se choisit dans la liste (ou « Autre… »). Ligne venue d'un article : l'unité est celle de l'article, verrouillée.
    const unite = menuUnite({ valeur: l.unite ?? '', libelle: `Unité ${numeros[l.id]}`, champ: 'unite', verrouille: Boolean(l.articleId) });
    unite.addEventListener('input', () => changerLigne(l.id, { unite: unite.value }));
    const prix = h('input', {
      class: 'champ champ-surplace champ-nombre', type: 'text', inputmode: 'decimal', value: '', 'aria-label': `Prix de vente HT ${numeros[l.id]}`, dataset: { champ: 'prix-vente' },
      onchange: (ev) => {
        const v = Ed.lireSaisie(ev.target.value);
        const lig = Ed.trouverLigne(travail.sections, l.id).ligne;
        if (v === null || !Ed.prixVenteReglable(lig, v, travail.modeMarge)) { ev.target.classList.add('invalide'); ev.target.title = 'Ce prix de vente est impossible avec le prix d’achat de cette ligne et ce mode de marge.'; return; }
        ev.target.classList.remove('invalide');
        ev.target.removeAttribute('title');
        const nouvelle = Ed.avecPrixVente(lig, v, travail.modeMarge);
        changerLigne(l.id, { prixAchat: nouvelle.prixAchat, marge: nouvelle.marge });
        ev.target.value = saisiePrix(v);
      },
    });
    const taux = [...new Set([...D.etat.reglages.tauxProposes, ...TAUX_TVA_DEFAUT])].sort((a, b) => b - a);
    const tva = h('select', { class: 'champ champ-surplace', 'aria-label': `TVA ${numeros[l.id]}`, dataset: { champ: 'tva' }, onchange: (ev) => changerLigne(l.id, { tauxTva: ev.target.value === '' ? undefined : Number(ev.target.value) }) },
      h('option', { value: '' }, `Défaut (${saisieNombre(travail.tauxTvaDefaut)} %)`), taux.map((t) => h('option', { value: String(t), selected: l.tauxTva === t }, `${saisieNombre(t)} %`)));
    const aff = affichage();
    // L'ouvrage se reconfigure depuis sa désignation (le bouton apparaît quand on y écrit) ; le calcul des marges et la référence sont de petites lignes sous la désignation.
    const configurer = l.ouvrage ? h('button', { type: 'button', class: 'bouton-lien bouton-configurer-ouvrage', dataset: { action: 'configurer-ouvrage' }, onclick: () => configurerOuvrage(l.id) }, 'Configurer les éléments de l’ouvrage') : null;
    const calculMarge = h('div', { class: 'calcul-marge', dataset: { calculMarge: l.id } });
    const reference = aff.afficherReferences && (l.reference || l.code) ? h('div', { class: 'reference-ligne texte-discret', dataset: { valeur: 'reference' } }, `Réf. : ${l.reference || l.code}`) : null;
    const prixAjuste = ajustementActif(travail) ? h('div', { class: 'prix-ajuste', dataset: { prixAjuste: l.id } }) : null;
    return h('tr', { class: 'ligne-devis-edition', hidden: masque, dataset: { id: l.id, genre: 'ligne' } },
      celluleDeplacement(e, numeros[l.id]),
      cellule('c-num num', 'N°', numeros[l.id]),
      cellule('c-des', 'Désignation', libelle, catalogue, description, composition, configurer, reference, calculMarge),
      aff.cacherQuantiteUnite ? null : cellule('c-qte', 'Qté', quantite),
      aff.cacherQuantiteUnite ? null : cellule('c-uni', 'Unité', unite),
      cellule('c-pri', ajustementActif(travail) ? 'Prix U. HT ajusté' : 'Prix U. HT', prix, prixAjuste),
      aff.cacherTva ? null : cellule('c-tva', 'TVA', tva),
      cellule('c-tot d', 'Total HT', h('span', { class: 'total-ligne', dataset: { total: l.id } })),
      celluleActions(e, numeros[l.id]));
  }

  // ------------------------------------------------ bas de page : conditions à gauche, totaux à droite, puis les notes
  function basDePage() {
    const d = travail;
    ref.attestation = h('p', { class: 'attestation-tva', dataset: { valeur: 'attestation-tva' }, hidden: true });
    const texteLibre = h('textarea', { class: 'champ', id: 'devis-texte-libre', rows: 3, value: d.texteLibre ?? '', 'aria-label': 'Texte libre', hidden: !(d.texteLibre ?? '').trim(), dataset: { champ: 'texte-libre' }, oninput: (e) => changer({ texteLibre: e.target.value }) });
    const lienTexte = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'ajouter-texte-libre' }, hidden: !texteLibre.hidden, onclick: () => { texteLibre.hidden = false; lienTexte.hidden = true; texteLibre.focus(); } }, icone('plus', { taille: 14 }), 'Ajouter texte libre');
    // Les vraies conditions de paiement (plusieurs échéances) ne sont pas encore faites : le bouton le dit au lieu de ne rien faire.
    const lienCondition = h('button', { type: 'button', class: 'bouton-lien', disabled: true, title: 'Bientôt disponible : en attendant, utilise « Acompte demandé » dans les totaux.', dataset: { action: 'ajouter-condition' } }, icone('plus', { taille: 14 }), 'Ajouter une condition (bientôt)');
    const gauche = h('div', { class: 'bas-gauche' },
      h('div', { class: 'titre-ligne' }, h('h3', { class: 'titre-bloc' }, 'Conditions de paiement'), lienCondition),
      ref.attestation,
      h('p', { class: 'texte-discret', dataset: { valeur: 'methodes-paiement' } }, 'Méthodes de paiement acceptées : celles de ton entreprise (réglages).'),
      texteLibre, lienTexte,
      h('div', { class: 'titre-ligne' }, h('h3', { class: 'titre-bloc' }, 'Gestion des déchets'), h('button', { type: 'button', class: 'bouton-lien', disabled: true, title: 'Bientôt disponible', dataset: { action: 'definir-dechets' } }, 'Définir (bientôt)')));
    const [totaux, net, taux] = blocTotaux();
    const notes = h('div', { class: 'notes-bas-page' },
      h('h3', { class: 'titre-bloc' }, 'Notes de bas de page'),
      h('textarea', { class: 'champ', id: 'devis-notes', rows: 4, maxlength: 2000, value: d.notesBasDePage ?? '', 'aria-label': 'Notes de bas de page', dataset: { champ: 'notes' }, oninput: (e) => changer({ notesBasDePage: e.target.value }) }));
    // Le bandeau « NET À PAYER » est un enfant direct de la feuille : il reste collé en bas de l'écran tant qu'on défile au-dessus de lui.
    return [h('div', { class: 'bas-devis' }, gauche, totaux), net, taux, notes];
  }

  // ------------------------------------------------ totaux : [totaux, NET À PAYER, tableau de TVA]
  function blocTotaux() {
    const d = travail;
    const ligneT = (cle, libelle) => h('div', { class: 'ligne-total', dataset: { ligne: cle } }, h('dt', {}, libelle), h('dd', { dataset: { total: cle } }));
    ref.tva = h('tbody', { dataset: { zone: 'tva' } });
    const typeRemise = h('select', { class: 'champ', 'aria-label': 'Type de remise', dataset: { champ: 'remise-type' }, onchange: () => majRemise() },
      h('option', { value: 'pourcentage', selected: d.remise?.type !== 'montant' }, '%'), h('option', { value: 'montant', selected: d.remise?.type === 'montant' }, '€'));
    const valeurRemise = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', value: saisieNombre(d.remise?.valeur), placeholder: '0', 'aria-label': 'Valeur de la remise', dataset: { champ: 'remise-valeur' }, oninput: () => majRemise() });
    ref.erreurRemise = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'remise' }, hidden: true });
    function majRemise() {
      const txt = valeurRemise.value.trim();
      const v = Ed.lireSaisie(txt);
      valeurRemise.classList.toggle('invalide', txt !== '' && v === null);
      changer({ remise: txt === '' || v === null ? null : { type: typeRemise.value, valeur: v } });
    }
    const typeAcompte = h('select', { class: 'champ', 'aria-label': 'Type d’acompte', dataset: { champ: 'acompte-type' }, onchange: () => majAcompte() },
      h('option', { value: '' }, 'Aucun'), h('option', { value: 'pourcentage', selected: d.acompte?.type === 'pourcentage' }, 'Pourcentage'), h('option', { value: 'montant', selected: d.acompte?.type === 'montant' }, 'Montant'));
    const valeurAcompte = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', value: saisieNombre(d.acompte?.valeur), 'aria-label': 'Valeur de l’acompte', dataset: { champ: 'acompte-valeur' }, oninput: () => majAcompte() });
    const momentAcompte = h('select', { class: 'champ', 'aria-label': 'Moment de l’acompte', dataset: { champ: 'acompte-moment' }, onchange: () => majAcompte() },
      MOMENTS_ACOMPTE.map((m) => h('option', { value: m.id, selected: (d.acompte?.moment ?? 'signature') === m.id }, m.libelle)));
    const texteMoment = h('input', { class: 'champ', type: 'text', value: d.acompte?.texteMoment ?? '', placeholder: 'Quand ?', 'aria-label': 'Moment libre de l’acompte', dataset: { champ: 'acompte-texte' }, oninput: () => majAcompte() });
    ref.erreurAcompte = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'acompte' }, hidden: true });
    function majAcompte() {
      const type = typeAcompte.value;
      valeurAcompte.hidden = momentAcompte.hidden = !type;
      texteMoment.hidden = !type || momentAcompte.value !== 'libre';
      if (!type) { changer({ acompte: null }); return; }
      const v = Ed.lireSaisie(valeurAcompte.value);
      valeurAcompte.classList.toggle('invalide', valeurAcompte.value.trim() !== '' && v === null);
      changer({ acompte: { type, valeur: v, moment: momentAcompte.value, ...(momentAcompte.value === 'libre' ? { texteMoment: texteMoment.value } : {}) } });
    }
    valeurAcompte.hidden = momentAcompte.hidden = !d.acompte;
    texteMoment.hidden = !d.acompte || (d.acompte?.moment ?? 'signature') !== 'libre';
    const totaux = h('aside', { class: 'panneau-total', 'aria-label': 'Total du devis', dataset: { zone: 'total' } },
      h('dl', { class: 'liste-totaux' },
        h('div', { class: 'ligne-total ligne-ajustement', dataset: { ligne: 'ajustement' } }, h('dt', {}, 'Ajustement global'),
          h('dd', {}, (ref.lienAjustement = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'definir-ajustement' }, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (ev) => ouvrirAjustement(ev.currentTarget) }, 'Définir un ajustement')), h('span', { dataset: { total: 'ajustement' } }))),
        ligneT('brut', 'Total brut HT'),
        h('div', { class: 'ligne-total ligne-remise' }, h('dt', {}, 'Remise client'), h('dd', {}, h('div', { class: 'ligne-champs' }, valeurRemise, typeRemise), h('span', { dataset: { total: 'remise' } }))),
        ligneT('ht', 'Total net HT'),
        ligneT('tva', 'TVA'),
        ligneT('ttc', 'Total TTC'),
        h('div', { class: 'ligne-total ligne-acompte' }, h('dt', {}, 'Acompte demandé'), h('dd', {}, h('div', { class: 'ligne-champs' }, typeAcompte, valeurAcompte, momentAcompte, texteMoment), h('span', { dataset: { total: 'acompte' } }))),
        Object.assign(ligneT('reste', 'Reste à facturer'), { hidden: affichage().cacherResteAFacturer === true })),
      ref.erreurRemise, ref.erreurAcompte,
      (ref.avertissementsTotal = h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements' } })),
      h('p', { class: 'texte-discret' }, 'Primes, retenue de garantie et déchets viendront dans une prochaine version.'));
    const net = h('div', { class: 'bandeau-net', dataset: { ligne: 'net' } }, h('span', { class: 'bandeau-net-titre' }, 'NET À PAYER'), h('span', { class: 'bandeau-net-montant', dataset: { total: 'net' } }));
    const taux = h('table', { class: 'tableau-tva' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Taux TVA'), h('th', { scope: 'col', class: 'd' }, 'Base HT'), h('th', { scope: 'col', class: 'd' }, 'Total'))), ref.tva);
    return [totaux, net, taux];
  }

  // La fenêtre « Définir un ajustement » : trois blocs titrés, toujours ouverts, l'un sous l'autre (Ajustement global, Marge du devis, Remise client). Rien ne s'ouvre ni ne se ferme.
  function ouvrirAjustement(ancre) {
    ouvrirFenetreMenu(ancre, () => {
      const champs = {};
      const erreurs = {};
      const fabriquer = (cle, libelle, unite) => {
        champs[cle] = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', autocomplete: 'off', id: `ajust-${cle}`, 'aria-label': libelle, 'aria-describedby': `ajust-erreur-${cle}`, dataset: { champ: `ajust-${cle}` },
          oninput: (e) => saisir(cle, e.target.value) });
        erreurs[cle] = h('p', { class: 'erreur erreur-champ', role: 'alert', id: `ajust-erreur-${cle}`, hidden: true, dataset: { erreur: `ajust-${cle}` } });
        return h('div', { class: 'ajust-champ' }, h('label', { for: `ajust-${cle}` }, libelle, unite ? ` (${unite})` : ''), champs[cle], erreurs[cle]);
      };
      // Chaque champ qu'on change recalcule les deux autres ; un texte illisible ou un coefficient ≤ 0 affiche un message sous le champ et n'enregistre rien.
      function saisir(cle, texte) {
        const r = Ed.ajustementDepuisSaisie(travail, cle, texte);
        champs[cle].classList.toggle('invalide', Boolean(r.erreur));
        erreurs[cle].hidden = !r.erreur;
        erreurs[cle].textContent = r.erreur ?? '';
        if (r.erreur) return;
        for (const k of Object.keys(erreurs)) if (k !== cle) { erreurs[k].hidden = true; champs[k].classList.remove('invalide'); }
        changer({ ajustement: Ed.ajustementAEnregistrer(r.coefficient) });
        appliquerAffichage();
        remplirAutres(cle);
      }
      function remplirAutres(sauf) {
        const v = valeursAjustement(travail);
        const valeurs = { pourcentage: saisiePrix(v.pourcentage), montant: saisiePrix(v.montant), coefficient: v.coefficient.toFixed(4).replace('.', ',') };
        for (const k of Object.keys(champs)) if (k !== sauf) champs[k].value = valeurs[k];
      }
      const zone = h('section', { class: 'ajust-zone', dataset: { zone: 'ajustement-global' }, 'aria-labelledby': 'ajust-titre-global' },
        h('h3', { class: 'ajust-titre', id: 'ajust-titre-global' }, 'Ajustement global'),
        fabriquer('pourcentage', 'Pourcentage', '%'), fabriquer('montant', 'Montant', '€'), fabriquer('coefficient', 'Coefficient', 'coef.'),
        h('button', { type: 'button', class: 'bouton-lien ajust-retirer', dataset: { action: 'retirer-ajustement' }, onclick: () => { changer({ ajustement: null }); appliquerAffichage(); remplirAutres(null); Object.values(erreurs).forEach((p) => { p.hidden = true; }); } }, 'Retirer l’ajustement'));
      remplirAutres(null);
      // La marge et la remise se règlent ici (comme dans un logiciel du marché) ; les champs de la remise reprennent ceux des totaux et les pilotent.
      const margeChamp = h('input', { class: 'champ champ-court', id: 'ajust-marge', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: saisieNombre(travail.marge), 'aria-label': 'Marge du devis en pourcent', dataset: { champ: 'marge-menu' },
        oninput: (e) => { const vide = e.target.value.trim() === ''; const v = vide ? 0 : Ed.lireSaisie(e.target.value); e.target.classList.toggle('invalide', v === null); if (v !== null) { changer({ marge: v }); majPrixAffiches(); const autre = racine.querySelector('[data-champ="marge"]'); if (autre) autre.value = e.target.value; } } });
      const zoneMarge = h('section', { class: 'ajust-zone', dataset: { zone: 'marge-devis' }, 'aria-labelledby': 'ajust-titre-marge' },
        h('h3', { class: 'ajust-titre', id: 'ajust-titre-marge' }, 'Marge du devis'),
        h('div', { class: 'ajust-champ' }, h('label', { for: 'ajust-marge' }, 'Marge (%)'), margeChamp),
        h('p', { class: 'texte-discret' }, 'Elle s’applique aux lignes qui n’ont pas leur propre marge. Le client ne la voit jamais.'));
      const remiseTotaux = { type: racine.querySelector('[data-champ="remise-type"]'), valeur: racine.querySelector('[data-champ="remise-valeur"]') };
      const remiseType = h('select', { class: 'champ', 'aria-label': 'Type de remise', dataset: { champ: 'remise-type-menu' }, onchange: (e) => { if (remiseTotaux.type) { remiseTotaux.type.value = e.target.value; remiseTotaux.type.dispatchEvent(new Event('change', { bubbles: true })); } } },
        h('option', { value: 'pourcentage', selected: remiseTotaux.type?.value !== 'montant' }, '%'), h('option', { value: 'montant', selected: remiseTotaux.type?.value === 'montant' }, '€'));
      const remiseValeur = h('input', { class: 'champ champ-court', id: 'ajust-remise', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', value: remiseTotaux.valeur?.value ?? '', 'aria-label': 'Valeur de la remise', dataset: { champ: 'remise-valeur-menu' },
        oninput: (e) => { if (remiseTotaux.valeur) { remiseTotaux.valeur.value = e.target.value; remiseTotaux.valeur.dispatchEvent(new Event('input', { bubbles: true })); } } });
      const zoneRemise = h('section', { class: 'ajust-zone', dataset: { zone: 'remise-devis' }, 'aria-labelledby': 'ajust-titre-remise' },
        h('h3', { class: 'ajust-titre', id: 'ajust-titre-remise' }, 'Remise client'),
        h('div', { class: 'ajust-champ ajust-champ-remise' }, h('label', { for: 'ajust-remise' }, 'Remise'), h('div', { class: 'ajust-remise-champs' }, remiseValeur, remiseType)));
      verrouiller(zone); verrouiller(zoneMarge); verrouiller(zoneRemise); // lecture seule : les réglages se voient, rien ne se modifie
      return h('div', { class: 'ajust-fenetre', tabindex: '-1', dataset: { focusInitial: '' } }, zone, zoneMarge, zoneRemise); // le focus entre sur la fenêtre, pas sur un champ : sur téléphone le clavier ne masque pas les blocs à l'ouverture
    }, { classe: 'menu-devis-ajustement', nom: 'Ajustement du devis', role: 'dialog' });
  }

  function majTotaux() {
    if (!ref.panneauEdition) return;
    let t;
    try { t = totauxDevis(travail); } catch (e) { console.warn(e); return; }
    const mettre = (cle, texte) => { const el = racine.querySelector(`[data-total="${cle}"]`); if (el) el.textContent = texte; };
    const aj = valeursAjustement(travail);
    const signe = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
    if (ref.lienAjustement) ref.lienAjustement.textContent = ajustementActif(travail) ? `Ajustement ${signe(aj.pourcentage)}${saisieNombre(Math.abs(aj.pourcentage))} %` : 'Définir un ajustement';
    mettre('ajustement', ajustementActif(travail) ? `${signe(aj.montant)}${euros(Math.abs(aj.montant))}` : '');
    mettre('brut', euros(t.totalBrutHt));
    mettre('remise', t.remiseHt > 0 ? `− ${euros(t.remiseHt)}` : '');
    mettre('ht', euros(t.totalHt));
    mettre('tva', euros(t.tva));
    mettre('ttc', euros(t.ttc));
    majTitreCompact();
    mettre('acompte', t.acompteTtc === null ? '' : euros(t.acompteTtc));
    mettre('reste', t.resteAFacturerTtc === null ? '—' : euros(t.resteAFacturerTtc));
    mettre('net', euros(t.netAPayer));
    remplir(ref.tva, t.tvaParTaux.map((x) => h('tr', { dataset: { ligne: `tva-${x.taux}` } }, h('td', {}, `${saisieNombre(x.taux)} %`), h('td', { class: 'd' }, euros(x.baseHT)), h('td', { class: 'd', dataset: { total: `tva-${x.taux}` } }, euros(x.montant)))));
    if (t.mentions.length && !t.tvaParTaux.length) remplir(ref.tva, h('tr', {}, h('td', { colspan: 3, class: 'texte-discret' }, t.mentions.join(' · '))));
    // Attestation de TVA réduite : le texte du devis imprimé, montré ici quand elle s'applique.
    if (ref.attestation) {
      let attestation = null;
      try { attestation = vueClient(travail, {}).attestationTvaReduite ?? null; } catch { attestation = null; }
      ref.attestation.hidden = !attestation;
      ref.attestation.textContent = attestation ?? '';
    }
    // Totaux de chaque ligne et de chaque section.
    for (const l of t.lignes) {
      const el = racine.querySelector(`[data-total="${CSS.escape(l.id)}"]`);
      if (el) el.textContent = euros(l.totalHT);
      const champPrix = racine.querySelector(`tr[data-id="${CSS.escape(l.id)}"] [data-champ="prix-vente"]`);
      // Le champ montre le prix de vente de la ligne (celui qu'on règle) ; avec un ajustement global, le prix ajusté s'affiche dessous.
      const trouve = Ed.trouverLigne(travail.sections, l.id);
      const base = trouve ? Ed.prixVenteAffiche(travail, trouve.section, trouve.ligne) : l.prixVenteUnitaire;
      if (champPrix && document.activeElement !== champPrix) champPrix.value = saisiePrix(base);
      const ajuste = racine.querySelector(`[data-prix-ajuste="${CSS.escape(l.id)}"]`);
      if (ajuste) ajuste.textContent = typeof l.prixVenteUnitaire === 'number' ? `ajusté : ${euros(l.prixVenteUnitaire)}` : '';
      const marge = racine.querySelector(`[data-calcul-marge="${CSS.escape(l.id)}"]`);
      if (marge && trouve) marge.textContent = `Achat ${euros(trouve.ligne.prixAchat)} · Marge ${saisieNombre(Math.round(margeEffective({ devis: travail, section: trouve.section, ligne: trouve.ligne })))} % · Vente ${euros(base)}`;
    }
    for (const s of t.sections) {
      const el = racine.querySelector(`[data-sous-total="${CSS.escape(s.id)}"]`);
      if (el) el.textContent = euros(s.sousTotalHT);
    }
    // Messages de saisie (remise, acompte) lus dans les règles de finalisation : jamais refaits ici.
    const messages = erreursFinalisation(travail);
    const montrer = (el, motif) => { if (!el) return; const m = messages.filter((x) => motif.test(x)); el.hidden = !m.length; el.textContent = m.join(' '); };
    montrer(ref.erreurRemise, /remise/i);
    montrer(ref.erreurAcompte, /acompte|moment/i);
    // Avertissements non bloquants.
    const avis = lecture ? [] : Ed.avertissements(travail);
    remplir(ref.avertissementsTotal, avis.map((a) => h('li', { dataset: { avertissement: a.code } }, icone('triangle-alert', { taille: 14 }), ' ', a.message)));
  }

  function majPrixAffiches() { majTotaux(); majResultats(); }

  // ------------------------------------------------ finaliser
  async function listeErreurs(titre, erreurs) {
    await dialogue({ titre, contenu: h('ul', { class: 'liste-erreurs-devis', dataset: { zone: 'erreurs-finalisation' } }, erreurs.map((e) => h('li', {}, e))), boutons: [{ libelle: 'Compris', valeur: true, style: 'principal' }] });
  }

  async function finaliser() {
    clearTimeout(minuteur);
    if (!(await sauver())) { toast(messageEnreg || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 }); return; }
    const locales = [...(travail.affaireId ? [] : ['Choisis l’affaire du devis.']), ...erreursFinalisation(travail)];
    if (locales.length) { await listeErreurs('Ce devis ne peut pas encore être finalisé', locales); return; }
    const avis = Ed.avertissements(travail);
    const ok = await dialogue({
      titre: 'Finaliser ce devis ?',
      contenu: h('div', {}, h('p', {}, 'Les prix, la TVA et les totaux seront figés et le devis recevra son numéro. Pour le corriger ensuite, tu créeras une nouvelle version.'),
        avis.length ? h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements-finalisation' } }, avis.map((a) => h('li', {}, icone('triangle-alert', { taille: 14 }), ' ', a.message))) : null),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Finaliser', valeur: true, style: 'principal' }],
    });
    if (ok !== true) return;
    verrou = true; // plus aucun enregistrement automatique pendant et après la finalisation
    clearTimeout(minuteur);
    if (Ed.aDesChangements(enregistre, travail)) { verrou = false; if (!(await sauver())) { toast(messageEnreg || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 }); return; } verrou = true; }
    try {
      const r = await D.finaliser(id);
      if (r?.ok === false) {
        verrou = false; await listeErreurs('Ce devis ne peut pas encore être finalisé', r.erreurs ?? []); return; }
      toast(`Devis finalisé${r?.numero ? ` : ${r.numero}` : ''}`);
      clearTimeout(minuteur);
      lecture = true; // plus rien à enregistrer ni à confirmer en quittant
      travail = { ...travail, statut: r?.statut ?? 'en_attente_envoi', numero: r?.numero ?? travail.numero };
      enregistre = structuredClone(travail);
      // Un devis finalisé se regarde sur la Prévisualisation (devis/voir/<id>). Depuis devis/editeur/<id>, le changement d'adresse reconstruit l'écran (une seule fois) ;
      // déjà sur devis/voir/<id> (brouillon ouvert par « Voir »), l'adresse ne change pas : on reconstruit ici, en lecture seule.
      const route = `devis/voir/${id}`;
      if (routeCourante() !== route) naviguer(route, { remplacer: true });
      else construire();
    } catch (e) {
      console.warn(e);
      verrou = false;
      toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
    }
  }

  // ------------------------------------------------ démarrage
  let entrepriseAffichee = JSON.stringify(D.etat.reglages.entreprise);
  charger();
  const rafraichir = planifier(surDonnees);
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(() => { if (montre) { majClients(); } else if (!montre) rafraichir(); })];
  return () => {
    arrets.forEach((f) => f());
    for (const [type, f] of Object.entries(gardes)) document.removeEventListener(type, f, true);
    optionsOuvertes?.fermer({ rendreFocus: false });
    historiqueOuvert?.fermer({ rendreFocus: false });
    bibliotheque?.fermer();
    clearTimeout(minuteur);
    clearTimeout(minuteurApercu);
    clearTimeout(delaiIntrouvable);
    arretGarde();
    observerBarre?.disconnect();
  };
}
