// Éditeur de devis (route devis/editeur, devis/editeur/<id>) : choisir l'affaire, remplir le chantier, ajouter des lignes (Bordereau, ligne libre, section, sous-section, texte),
// régler la remise et l'acompte, voir le total en direct, l'aperçu, puis finaliser. Un brouillon s'enregistre tout seul (écriture directe, plans de brouillon.js) ;
// finaliser passe par la fonction du serveur. Aucune règle ni aucun calcul ici : les fonctions pures sont dans editeur-logique.js et logique.js.
// UN SEUL ÉCRAN pendant toute la vie du devis (décision de Jérôme, 26/10/2026) : onglets « Édition » et « Prévisualisation » toujours là, mêmes boutons, même feuille.
// Un devis qui n'est plus un brouillon s'ouvre en LECTURE SEULE : les champs restent lisibles et copiables, les boutons de modification sont grisés (aria-disabled, jamais retirés), et le moindre essai
// de modification affiche « Ce devis est … : il ne se modifie plus » avec « Créer une nouvelle version ». Un brouillon reste modifiable, même ouvert par « Voir le devis ».
// Routes : devis/editeur/<id> s'ouvre sur l'onglet Édition, devis/voir/<id> sur l'onglet Prévisualisation (c'est le même écran).
import { h, icone, remplir, dialogue, toast, ouvrirMenu, champIntelligent } from '../../os/ui.js';
import { naviguer, ajouterGardeSortie, routeCourante, lien } from '../../os/router.js';
import { lienRetour, retourner, routeRetour, ROUTE_LISTE } from './origine.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { etatVide, planifier, cheminPersonne, cheminOrganisation, cheminAffaire } from '../crm/composants.js';
import { adressesDe } from '../crm/logique.js';
import * as CL from '../crm/logique.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import { arbreFamilles, cheminFamille } from './familles.js';
import * as Ed from './editeur-logique.js';
import { etapePourAffaireCreee, etapeAPasser } from './affaire-depuis-devis.js';
import * as CD from './client-devis.js';
import { ouvrirCreationPersonne } from '../crm/personnes.js';
import { ouvrirCreationOrganisation } from '../crm/organisations.js';
import {
  TYPE_SAUT, totauxDevis, erreursFinalisation, erreursChantier, estExpire, UNITES_DUREE, MOMENTS_ACOMPTE, TYPES_ACOMPTE, detailAcomptes, erreursAcomptes, listeAcomptes, TAUX_TVA_DEFAUT, niveauSection, dureeEnTexte,
  affichageDe, ajustementActif, valeursAjustement, margeEffective, vueClient, MAX_COPIE, MAX_DESTINATAIRES, transitionPossible, TYPES_DECHETS, NOM_DEVIS_MAX, nettoyerNomDevis, MESSAGE_AFFAIRE_MANQUANTE, emetteurImprime, estErreurEntreprise, ROUTE_MON_ENTREPRISE,
} from './logique.js';
import { formaterMontant } from './document.js';
import { menuUnite } from './menu-unite.js';
import { ouvrirFenetreMenu, contenuMenu, caseMenu, donnees as donneesDe } from './menu-devis.js';
import { ouvrirBibliotheque } from './bibliotheque.js';
import { htmlDuDevis } from './html-devis.js';
import { editeurOuvrage } from './editeur-ouvrage.js';
import * as O from './ouvrages.js';
import { messageApresEnregistrement } from './pdf.js';
import { actionPdf } from './pdf-actions.js';
import { afficherAttentePdf, LIBELLE_PDF_FABRICATION } from './pdf-attente.js';
import { lancerPreparationEmail } from './email-preparer-ecran.js';
import { LIBELLE_PREPARER_EMAIL, MESSAGE_NON_BRANCHE } from './email-preparer.js';
import { emailPossible } from './email-brouillon.js';
import { boutonsEntete, MESSAGE_FINALISER_POUR_ENVOYER } from './entete-boutons.js';
import { ERREUR_ECRITURE, creerDevisSansAffaire, dupliquerDevis, supprimerBrouillon, entreesMenuDevis, changerStatut, creerNouvelleVersion } from './actions-devis.js';
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
const SANS_VERROU = '[data-action="replier"], [data-action="definir-ajustement"], [data-action="description"]'; // en lecture seule, replier une section, ouvrir « Marge et ajustement » et afficher / masquer la description restent possibles (ce n'est que regarder)
const LARGEUR_TELEPHONE = 700; // même seuil que le CSS (max-width: 700px)
const DELAI_INTROUVABLE_MS = 4000;
const DELAI_ENREGISTREMENT_MS = 900;
const DELAI_APERCU_MS = 250;

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');
const saisieNombre = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : '');
const saisiePrix = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '');
const nouvelId = () => CRM.ctx().nouvelId('devis_devis');

// ---------------------------------------------------------------- client et affaire (lus dans l'espace)
/** Organisation et personne proposées comme client d'une affaire. */
export function clientsDeAffaire(affaire) {
  const liste = [];
  const org = affaire?.organisationId ? CRM.organisation(affaire.organisationId) : null;
  const pers = affaire?.personneId ? CRM.personne(affaire.personneId) : null;
  if (org) liste.push({ type: 'organisation', fiche: org, nom: org.nom });
  if (pers) liste.push({ type: 'personne', fiche: pers, nom: pers.nom });
  return liste.map((c) => ({ ...c, adresse: (adressesDe(c.fiche).find((a) => a.parDefaut) ?? adressesDe(c.fiche)[0])?.adresse ?? '' }));
}
/** Le client d'un devis lu directement dans sa fiche (il n'a pas besoin d'une affaire), de même forme que `clientsDeAffaire` : { type, fiche, nom, adresse } ; null si la fiche n'existe plus. */
export function clientParCle(type, id) {
  const fiche = type === 'organisation' ? CRM.organisation(id) : type === 'personne' ? CRM.personne(id) : null;
  if (!fiche) return null;
  return { type, fiche, nom: fiche.nom, adresse: (adressesDe(fiche).find((a) => a.parDefaut) ?? adressesDe(fiche)[0])?.adresse ?? '' };
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
export const htmlImpressionDevis = (d) => htmlDuDevis(d, { clientNom: clientDuDevis(d) || null, client: infosClientDuDevis(d), emetteur: emetteurImprime(D.etat.reglages.entreprise, D.etat.reglages.mentionEmetteur) });
const affaires = () => CRM.etat.affaires.filter((a) => !a.archive).sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr'));
const libelleAffaire = (a) => {
  const c = clientsDeAffaire(a)[0]?.nom;
  return c ? `${a.titre} · ${c}` : a.titre;
};

// ---------------------------------------------------------------- création : devis/editeur sans identifiant
/** Ancienne page « Nouveau devis » (signets, menu « + » d'avant) : elle ne demande plus rien, elle crée le brouillon (sans affaire : elle se choisit dans le devis) et ouvre l'éditeur à sa place. */
function rendreCreation(conteneur) {
  const zone = h('div', { class: 'page page-devis page-editeur-devis page-nouveau-devis' });
  conteneur.append(zone);
  let fini = false;
  let arret = () => {};
  async function lancer() {
    remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' })));
    if (!D.estPretDevis()) { arret = D.surChangement(() => { if (D.estPretDevis() && !fini) { arret(); lancer(); } }); return; }
    fini = true;
    if (await creerDevisSansAffaire({ remplacer: true })) return;
    fini = false;
    remplir(zone, etatVide(ERREUR_ECRITURE, { action: h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-creation' }, onclick: lancer }, 'Réessayer') }));
  }
  lancer();
  return () => { fini = true; arret(); };
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
  let ouvreurRecherche = null; // le bouton qui a ouvert la boîte « Ajouter une ligne » : « Fermer » lui rend le focus
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
  // `acomptes` est la liste normalisée (un devis à l'ancien acompte unique en a un élément) et `acompte` vaut null : la base n'est écrite qu'à la prochaine vraie modification, la copie « enregistrée » est normalisée pareil.
  const copieDeTravail = (d) => { const c = { ...d, ...Ed.champsAEnregistrer(d), acomptes: structuredClone(listeAcomptes(d)), acompte: null }; if (c.sections) c.sections = Ed.convertirAnciensSauts(structuredClone(c.sections)); return c; };

  // ------------------------------------------------ chargement
  function charger() {
    const d = devisCourant();
    // Les réglages en font partie : le mot du métier s'écrit dans les boutons dès le premier affichage.
    if (!D.estPretDevis() || !D.etat.reglagesPrets || !CRM.estPret()) { remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!d) {
      if (D.etat.erreurLectureDevis) { remplir(racine, h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' } }, ERREUR_LECTURE)); return; }
      if (Date.now() - moment < DELAI_INTROUVABLE_MS) {
        remplir(racine, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' })));
        if (!delaiIntrouvable) delaiIntrouvable = setTimeout(() => { delaiIntrouvable = null; charger(); }, DELAI_INTROUVABLE_MS - (Date.now() - moment) + 50);
        return;
      }
      remplir(racine, etatVide(MESSAGE_INTROUVABLE, { action: h('a', { class: 'bouton bouton-secondaire', href: lien('devis/liste'), dataset: { action: 'retour-liste' } }, 'Retour aux devis') }));
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
    if (entreprise !== entrepriseAffichee) { entrepriseAffichee = entreprise; if (onglet === 'apercu' && ref.panneauApercu) rendreApercu(); if (ref.blocMethodes?.dataset.ouvert !== 'oui') dessinerMethodes(false); }
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
    if (!suite) rechercheEnLigne = false; // la boîte (si elle est ouverte) reste à la fin du devis
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
        type: 'button', class: 'onglet-editeur', role: 'tab', id: `devis-onglet-${cle}`, 'aria-controls': `devis-panneau-${cle}`, 'aria-selected': 'false', tabindex: '-1', dataset: { onglet: cle }, onclick: () => choisirOnglet(cle),
      }, icone(pictogramme, { taille: 16 }), libelle)));
    // Motif ARIA « tabs » : flèches gauche/droite et Début/Fin déplacent la sélection (l'activation suit le focus).
    onglets.addEventListener('keydown', (e) => {
      const boutons = [...onglets.querySelectorAll('[role="tab"]')];
      const i = boutons.indexOf(document.activeElement);
      if (i < 0) return;
      const suivant = { ArrowRight: (i + 1) % boutons.length, ArrowLeft: (i + boutons.length - 1) % boutons.length, Home: 0, End: boutons.length - 1 }[e.key];
      if (suivant === undefined) return;
      e.preventDefault();
      if (suivant === i) return; // déjà sur cet onglet : on ne refait pas l'aperçu
      choisirOnglet(boutons[suivant].dataset.onglet);
      boutons[suivant].focus();
    });
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
    ref.panneauEdition = h('div', { class: 'editeur-edition', id: 'devis-panneau-edition', role: 'tabpanel', 'aria-labelledby': 'devis-onglet-edition', dataset: { panneau: 'edition' } },
      h('article', { class: 'document-devis' }, enteteDocument(), blocLignes(), basDePage()));
    ref.panneauApercu = h('div', { class: 'editeur-apercu', id: 'devis-panneau-apercu', role: 'tabpanel', 'aria-labelledby': 'devis-onglet-apercu', dataset: { panneau: 'apercu' } });
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
      if (b.cle === 'signer') return boutonStatut({ action: 'accepter', libelle: b.libelle, pictogramme: b.icone, style, statutLibelle: 'Devis signé', nomAction: 'marquer-signe' });
      if (b.cle === 'refuser') return boutonStatut({ action: 'refuser', libelle: b.libelle, pictogramme: b.icone, style, statutLibelle: 'Devis refusé', nomAction: 'marquer-refuse' });
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
    // Ce qui ne dépend pas de l'étape : PDF, impression, e-mail (voir entete-boutons.js). Ce qu'un bouton actif du haut de page fait déjà n'est pas répété ; le reste (dont « Préparer l'e-mail » au brouillon, tant que « Envoyer » est grisé) est ici.
    const { menu } = regleEntete();
    // Pendant la fabrication, le menu le dit et ignore un second clic (pas de double génération).
    entrees.push({ libelle: 'Ouvrir le PDF', icone: 'external-link', cle: 'ouvrir-pdf', desactive: pdfEnCours, action: () => ouvrirPdf(ancre) },
      { libelle: pdfEnCours ? LIBELLE_PDF_FABRICATION : 'Télécharger le PDF', icone: 'download', cle: 'telecharger', desactive: pdfEnCours, action: () => telechargerPdf(ancre) },
      { libelle: 'Imprimer', icone: 'file-text', cle: 'imprimer', desactive: pdfEnCours, action: () => imprimer(ancre) });
    // Le « … » ne répète jamais un bouton visible (entete-boutons.js, clesMenuDejaVisibles).
    if (!menu.dejaVisibles.includes('preparer-email')) entrees.push(...entreePreparerEmail());
    entrees.push({ separateur: true });
    const apresSuppression = () => { verrou = true; clearTimeout(minuteur); if (travail) enregistre = structuredClone(travail); naviguer('devis/liste'); };
    entrees.push(...entreesMenuDevis(d, {
      // « Préparer l'e-mail » est ajouté plus haut (une seule entrée) ; ce qu'un bouton visible fait déjà n'est pas répété.
      // « Éditer le devis » et « Voir le devis » ne sont pas proposés ici : les onglets « Édition » et « Prévisualisation », toujours visibles, font la même chose (décision de Jérôme du 26/10/2026).
      exclure: [...new Set(['preparer_email', ...menu.dejaVisibles, 'editer', 'voir'])],
      apresSuppression,
      surcharges: {
        supprimer: async (x) => { if (!lecture && !(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le brouillon n’a pas été supprimé.`, { type: 'erreur', duree: 8000 }); return; } supprimerBrouillon(x, apresSuppression); }, // attend l'écriture en cours avant de supprimer
        dupliquer: async (x) => { if (!lecture && !(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le devis n’a pas été dupliqué.`, { type: 'erreur', duree: 8000 }); return; } dupliquerDevis(D.devisParId(x.id) ?? x); },
        dupliquer_prix_du_jour: async (x) => { if (!lecture && !(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le devis n’a pas été dupliqué.`, { type: 'erreur', duree: 8000 }); return; } dupliquerDevis(D.devisParId(x.id) ?? x, { prixDuJour: true }); },
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

  // ------------------------------------------------ PDF : UN SEUL, celui du serveur (devisPdf), rangé dans notre stockage et montré dans l'onglet Devis de l'affaire. Plus d'impression par le navigateur.
  let pdfEnCours = false;
  /**
   * « Ouvrir le PDF », « Télécharger le PDF » et « Imprimer » (menu « … ») : on ne quitte jamais le devis. `mode` : 'ouvrir' (nouvel onglet, aussi pour imprimer) ou 'telecharger' (fichier).
   * Brouillon : enregistre d'abord les changements en attente (le PDF reflète l'écran), demande au serveur le PDF « BROUILLON » filigrané, puis le livre.
   * Devis finalisé : livre directement son PDF (pdf-actions.js sait attendre ou relancer un PDF pas encore prêt).
   */
  async function livrerPdf(mode, ancre = null) {
    if (pdfEnCours || !travail) return;
    if (travail.statut !== 'brouillon') { await actionPdf(id, mode, { ancre: ancre ?? document.querySelector('[data-action="plus-actions"]') }); return; }
    pdfEnCours = true;
    const retirerAttente = afficherAttentePdf({ bouton: ancre ?? document.querySelector('[data-action="plus-actions"]') });
    try {
      if (!(await sauver())) { toast(`${messageEnreg || ERREUR_ECRITURE} Le PDF n’a pas été créé.`, { type: 'erreur', duree: 8000 }); return; }
      await D.pdfBrouillon(id);
      toast(messageApresEnregistrement(travail), { duree: 8000 });
      retirerAttente();
      await actionPdf(id, mode, { brouillon: true, ancre: ancre ?? document.querySelector('[data-action="plus-actions"]') });
    } catch (e) {
      console.warn(e);
      toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
    } finally {
      pdfEnCours = false;
      retirerAttente();
    }
  }
  const telechargerPdf = (ancre = null) => livrerPdf('telecharger', ancre);
  const ouvrirPdf = (ancre = null) => livrerPdf('ouvrir', ancre);

  // Flèche « ‹ Retour » tout à gauche de la barre, comme dans la fiche d'un projet : ramène à la page d'où l'on vient (fiche d'une affaire, même onglet), sinon à la liste des devis (même chemin que l'ancienne croix, donc même confirmation si des changements ne sont pas enregistrés).
  function boutonRetour() {
    return h('a', { class: 'lien-retour', href: lienRetour(), dataset: { action: 'fermer' }, 'aria-label': routeRetour() === ROUTE_LISTE ? 'Retour à la liste des devis' : 'Retour à l’affaire', onclick: (ev) => { ev.preventDefault(); retourner(); } }, icone('chevron-left', { taille: 16 }), 'Retour');
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
    majReste();
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
      const motMenu = O.motOuvrage(D.etat.reglages);
      return contenuMenu([
        { titre: 'Édition' },
        { noeud: c('Afficher le calcul des marges', 'afficherMarges') },
        { noeud: c('Afficher les références', 'afficherReferences') },
        { noeud: caseMenu({ libelle: 'Autoliquidation', cle: 'autoliquidation', coche: travail.autoliquidation === true, surChangement: (v) => { changer({ autoliquidation: v }); majTotaux(); } }) },
        { noeud: h('label', { class: 'menu-devis-champ' }, h('span', { class: 'menu-devis-libelle' }, 'Changer la TVA par défaut'), tva) },
        { noeud: c('Cacher la gestion des déchets', 'cacherDechets') },
        { noeud: bientot('Afficher les remises par ligne') }, { noeud: bientot('Afficher les stocks') },
        { noeud: bientot('Numérotation personnalisée') }, { noeud: bientot('Date visite préalable') },
        { separateur: true }, { titre: 'Document' },
        { noeud: c('Cacher les totaux des sections', 'cacherTotauxSections') },
        { noeud: c('Cacher les colonnes quantité et unité', 'cacherQuantiteUnite') },
        { noeud: c('Cacher la colonne TVA', 'cacherTva') },
        { noeud: c(`Cacher les éléments ${O.deMot(motMenu)}${motMenu.singulier}`, 'cacherElementsOuvrage') },
        { noeud: c(`Afficher les prix des éléments ${O.deMot(motMenu)}${motMenu.singulier}`, 'afficherPrixElementsOuvrage') },
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

  // L'entrée « Préparer l'e-mail », UNE fois pour le menu du bouton « Envoyer » (devis finalisé) et pour le menu « … » (les autres états). C'est le seul chemin de l'e-mail (27/10/2026) : un workflow n8n crée
  // un brouillon dans le Gmail du compte, PDF joint ; rien n'est envoyé. Voir email-preparer-ecran.js. Pas branché sur cet espace (réponse du serveur) : l'entrée reste là, grisée, avec la raison.
  const finaliserDAbord = { libelle: 'Finaliser d’abord', action: () => finaliser() };
  const grisEmail = () => ({ desactive: !emailPossible((devisCourant() ?? travail)?.statut).actif, titreInfo: emailPossible((devisCourant() ?? travail)?.statut).raison ?? null });
  const entreePreparerEmail = () => {
    const nonBranche = D.emailPreparable() === false;
    const entree = { libelle: LIBELLE_PREPARER_EMAIL, icone: 'mail-check', cle: 'preparer-email', ...(nonBranche ? { desactive: true, titreInfo: MESSAGE_NON_BRANCHE } : grisEmail()),
      action: () => lancerPreparationEmail({ devisId: id, getDevis: () => D.devisParId(id) ?? travail, finaliser: finaliserDAbord }) };
    return nonBranche ? [entree, { texte: MESSAGE_NON_BRANCHE }] : [entree]; // la phrase est AFFICHÉE sous l'entrée grisée (comme dans le menu de la liste), pas seulement en infobulle
  };
  /** Menu du bouton « Envoyer » (devis finalisé) : seulement l'e-mail. Le PDF et l'impression sont dans « … » (ils ne dépendent pas de l'envoi). */
  function ouvrirMenuEnvoyer(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu([
      ...entreePreparerEmail(),
    ], fermer), { nom: 'Envoyer' });
  }
  /** Imprimer : ouvre le PDF (un brouillon donne son PDF « BROUILLON » filigrané, jamais de fenêtre « Finaliser » ; un devis finalisé son PDF officiel) : on l'imprime depuis la visionneuse du navigateur. */
  const imprimer = (ancre = null) => ouvrirPdf(ancre);

  function choisirOnglet(cle) {
    onglet = cle;
    ref.onglets?.querySelectorAll('.onglet-editeur').forEach((b) => { const actif = b.dataset.onglet === cle; b.classList.toggle('actif', actif); b.setAttribute('aria-selected', String(actif)); b.tabIndex = actif ? 0 : -1; });
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

  // ------------------------------------------------ e-mail(s) du destinataire (« À ») et en copie (cc) : le même bloc, deux listes (titre en capitales, valeur dessous)
  // Plafonds MAX_DESTINATAIRES et MAX_COPIE (logique.js) : le serveur les applique aussi (erreursFinalisation). Les refus (adresse invalide, déjà dans la liste, dans l'autre liste, plafond) sont dans Ed.refusAjoutDestinataire / Ed.refusAjoutCopie.
  const BLOCS_ADRESSES = {
    destinataires: {
      titre: 'E-mail(s) du destinataire', bouton: 'E-mail du destinataire', vide: 'Aucun destinataire', zone: 'destinataires', mot: 'destinataire', max: MAX_DESTINATAIRES, autre: 'copie',
      classes: { zone: 'bloc-destinataires', liste: 'liste-destinataires', ligne: 'ligne-destinataire', vide: 'destinataires-vide' },
      retirer: (a) => `Retirer ${a} des destinataires`, plafond: `${MAX_DESTINATAIRES} destinataires : c’est le maximum.`,
      refus: (v, liste, autre) => Ed.refusAjoutDestinataire(v, liste, autre),
    },
    copie: {
      titre: 'E-mail(s) en copie', bouton: 'E-mail en copie', vide: 'Aucune adresse en copie', zone: 'copie', mot: 'copie', max: MAX_COPIE, autre: 'destinataires',
      classes: { zone: 'bloc-copie', liste: 'liste-copie', ligne: 'ligne-copie', vide: 'copie-vide' },
      retirer: (a) => `Retirer ${a} de la copie`, plafond: `${MAX_COPIE} adresses en copie : c’est le maximum.`,
      refus: (v, liste, autre) => Ed.refusAjoutCopie(v, liste, autre),
    },
  };
  /**
   * Titre fixe, puis soit « Aucun destinataire » / « Aucune adresse en copie » (grisé), soit une ligne par adresse avec sa croix ; « + E-mail du destinataire » / « + E-mail en copie » ouvre un champ.
   * Entrée ou sortie du champ ajoute ; tout refus s'affiche sous le champ, qui reste ouvert avec le texte tapé ; le message disparaît dès que le texte change, ou à Échap.
   * Après Entrée (ajout réussi) ou Échap, le focus revient sur le bouton « + ». La croix retire sans confirmation (exception à « Destructif », voir docs/consignes-ui.md).
   * Lecture seule : le bloc existe aussi (écran unique), il est verrouillé par `verrouiller()` : adresses lisibles, croix et « + » grisés (test C3), sans logique propre ici.
   * Après tout changement d'une liste, l'AUTRE bloc est redessiné (le message « déjà en copie » du destinataire suit la réalité).
   */
  function blocAdresses(cle) {
    const cfg = BLOCS_ADRESSES[cle];
    const zone = h('div', { class: `bloc-champ bloc-adresses ${cfg.classes.zone}`, dataset: { zone: cfg.zone }, role: 'group', 'aria-labelledby': `devis-${cle}-titre` });
    let saisie = false;
    let enCours = ''; // texte du champ en cours de saisie : gardé si la ligne est redessinée (retrait d'une autre adresse pendant la saisie)
    let refusEnCours = ''; // motif du dernier refus : gardé lui aussi quand la ligne est redessinée, jusqu'à ce que le texte change
    /** Après une saisie terminée au clavier : le focus revient sur « + » (au plafond, sur la dernière croix), jamais sur la page entière. */
    const rendreFocus = () => (zone.querySelector(`[data-action="ajouter-${cfg.mot}"]`) ?? [...zone.querySelectorAll(`[data-action="retirer-${cfg.mot}"]`)].pop())?.focus();
    const adresses = (k = cle) => Ed.adressesDeListe(travail[k]);
    let abandonnerSaisie = () => {};
    function dessiner() {
      abandonnerSaisie(); abandonnerSaisie = () => {}; // l'ancien champ disparaît : son « blur » éventuel ne doit plus rien valider
      ref.signatures = { ...(ref.signatures ?? {}), [cle]: signatureBloc(cle) };
      const liste = adresses();
      const parties = [h('span', { class: 'etiquette', id: `devis-${cle}-titre` }, cfg.titre)];
      if (liste.length) {
        parties.push(h('ul', { class: cfg.classes.liste }, liste.map((a, i) => h('li', { class: cfg.classes.ligne, dataset: { [cfg.mot]: a } },
          h('span', {}, a),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': cfg.retirer(a), dataset: { action: `retirer-${cfg.mot}` },
            // Pendant la saisie d'une autre adresse, un appui sur la croix ne doit pas faire perdre le focus au champ : sinon « blur » redessine la ligne avant le clic et la croix disparaît.
            onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(),
            onclick: () => { changer({ [cle]: adresses().filter((_, k) => k !== i) }); majBlocs(); if (!saisie) rendreFocus(); }, }, icone('x', { taille: 14 }))))));
      } else {
        parties.push(h('p', { class: cfg.classes.vide, dataset: { valeur: `${cfg.mot}-vide` } }, cfg.vide));
        // Le mail du client est déjà en copie : il n'est pas repris comme destinataire, et le bloc le dit (jamais la même adresse dans les deux listes).
        if (cle === 'destinataires' && ref.emailAuto && adresseDans('copie', ref.emailAuto)) parties.push(h('p', { class: 'erreur', id: 'devis-destinataire-erreur', role: 'alert', dataset: { erreur: 'destinataire-auto' } }, Ed.MESSAGE_DESTINATAIRE_DEJA_COPIE));
      }
      if (saisie) {
        const erreur = h('p', { class: 'erreur', id: `devis-${cle}-erreur`, role: 'alert', hidden: true, dataset: { erreur: cfg.mot } });
        let fini = false;
        abandonnerSaisie = () => { fini = true; };
        const montrer = (message) => { refusEnCours = message ?? ''; erreur.textContent = refusEnCours; erreur.hidden = !refusEnCours; champSaisie.setAttribute('aria-invalid', refusEnCours ? 'true' : 'false'); if (refusEnCours) champSaisie.setAttribute('aria-describedby', `devis-${cle}-erreur`); else champSaisie.removeAttribute('aria-describedby'); };
        // Renvoie vrai si la saisie est terminée (ajoutée, ou vide) ; sinon le champ reste ouvert avec son texte et le motif du refus.
        const valider = () => {
          const v = champSaisie.value.trim();
          if (!v) return true;
          const refus = cfg.refus(v, adresses(), adresses(cfg.autre));
          if (refus) { montrer(refus); return false; }
          changer({ [cle]: [...adresses(), v] });
          majBlocs(cle); // l'autre bloc se met à jour ; celui-ci est redessiné par `terminer`
          return true;
        };
        const terminer = (validerAvant, { focus = false } = {}) => {
          if (fini) return;
          if (validerAvant && !valider()) return;
          fini = true; saisie = false; enCours = ''; refusEnCours = '';
          dessiner();
          if (focus) rendreFocus();
        };
        const champSaisie = h('input', { class: 'champ', type: 'email', inputmode: 'email', autocomplete: 'off', placeholder: 'contact@exemple.fr', 'aria-label': cfg.bouton, dataset: { champ: cfg.mot }, value: enCours,
          oninput: (e) => { enCours = e.target.value; montrer(''); },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); terminer(true, { focus: true }); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminer(false, { focus: true }); } },
          onblur: () => terminer(Boolean(champSaisie.value.trim())) });
        parties.push(champSaisie, erreur);
        montrer(refusEnCours); // ligne redessinée pendant la saisie (croix d'une autre adresse) : le motif du refus reste affiché
        zone.replaceChildren(...parties);
        champSaisie.focus();
        return;
      }
      if (liste.length < cfg.max) parties.push(h('button', { type: 'button', class: 'prop-vide', dataset: { action: `ajouter-${cfg.mot}` }, onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(), onclick: () => { saisie = true; enCours = ''; refusEnCours = ''; dessiner(); } }, icone('plus', { taille: 14 }), cfg.bouton));
      else parties.push(h('p', { class: cfg.classes.vide, dataset: { valeur: `${cfg.mot}-plafond` } }, cfg.plafond)); // au plafond : une phrase grisée à la place du bouton
      zone.replaceChildren(...parties);
    }
    ref.blocs = { ...(ref.blocs ?? {}), [cle]: dessiner };
    dessiner();
    return zone;
  }
  /** Redessine les blocs d'adresses (sauf `sauf`, qui se redessine seul) : après un changement d'une liste, l'autre en dépend (message « déjà en copie », mail du client repris ou non). */
  function majBlocs(sauf = null) {
    // Un bloc n'est redessiné que si ce qu'il montre a changé : redessiner le bloc voisin pendant qu'on clique sur son « + » remplacerait le bouton avant la fin du clic (clic avalé).
    for (const [cle, dessiner] of Object.entries(ref.blocs ?? {})) if (cle !== sauf && (ref.signatures?.[cle] !== signatureBloc(cle))) dessiner();
  }
  /** Ce qu'un bloc d'adresses montre : sa liste, et pour les destinataires le message « déjà en copie » du mail du client. */
  const signatureBloc = (cle) => JSON.stringify([Ed.adressesDeListe(travail[cle]), cle === 'destinataires' && Boolean(ref.emailAuto) && adresseDans('copie', ref.emailAuto)]);
  /** Vrai si `v` est déjà dans la liste `cle` du devis (même règle que l'ajout : Ed.memeAdresse). */
  function adresseDans(cle, v) { return Ed.adressesDeListe(travail[cle]).some((a) => Ed.memeAdresse(a, v)); }

  // ------------------------------------------------ barre du haut
  const majTitreCompact = () => { if (ref.titreCompact) ref.titreCompact.textContent = ref.titre?.textContent ?? ''; };
  function majEntete() {
    if (!ref.titre) return;
    const d = travail;
    ref.titre.textContent = d.numero ? `Devis ${d.numero} · v${d.version ?? 1}` : (String(d.nom ?? '').trim() || String(d.objet ?? '').trim() || 'Nouveau devis'); // un brouillon porte son nom interne, sinon l'objet du devis (la pastille dit déjà « Brouillon »)
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
    majAideAffaire();
  }

  // ------------------------------------------------ calcul des marges : visible sur les lignes seulement avec la case « Afficher le calcul des marges » du menu Options (la marge du devis se règle dans « Marge et ajustement »)
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
    const clientActuel = ficheClient(d);
    ref.adresseAuto = clientActuel?.adresse ?? '';
    ref.emailAuto = emailAutoDe(d);
    ref.depart = d.personneId && !d.organisationId ? 'personne' : null; // d'où vient le client : « personne » pose la question « l'organisation / elle seule » ; sinon (organisation, affaire, devis déjà enregistré) la liste « à l'attention de »
    // Un brouillon enregistré avant la règle « l'e-mail suit le client » : on reprend l'e-mail de la fiche tant que rien n'est écrit.
    // Jamais une adresse déjà en copie : le destinataire reste vide et le champ le dit (voir appliquerClient).
    const emailAutoEnCopie = Boolean(ref.emailAuto) && adresseDans('copie', ref.emailAuto);
    if (!lecture && ref.emailAuto && !emailAutoEnCopie && !Ed.adressesDeListe(travail.destinataires).length) travail.destinataires = [ref.emailAuto];
    const ligne = (avant, zone, apres = '') => h('p', { class: 'ligne-entete' }, avant, zone, apres);
    ref.numeroDocument = h('h2', { class: 'titre-document', dataset: { valeur: 'numero-devis' } }, '');
    // Nom INTERNE du devis (distinct de la description, imprimée) : jamais sur le PDF ni dans l'e-mail. Trop long : tronqué, avec un message.
    ref.erreurNom = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'nom' }, hidden: true }, `Le nom est limité à ${NOM_DEVIS_MAX} caractères : la fin a été coupée.`);
    ref.nom = h('input', { class: 'champ', type: 'text', id: 'devis-nom', value: d.nom ?? '', autocomplete: 'off', placeholder: 'Exemple : Variante économique', dataset: { champ: 'nom' },
      oninput: (e) => {
        const trop = e.target.value.length > NOM_DEVIS_MAX;
        if (trop) e.target.value = e.target.value.slice(0, NOM_DEVIS_MAX);
        ref.erreurNom.hidden = !trop;
        changer({ nom: nettoyerNomDevis(e.target.value) }); // vide = '' (le champ enregistré est écrasé, un nom effacé ne revient pas)
        majEntete();
      } });
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
      h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'devis-nom' }, 'Nom du devis (interne, jamais imprimé)'), ref.nom),
      ref.erreurNom,
      ligne('En date du ', valeurSurPlace({ etiquette: 'En date du ', nom: 'dateEmission', texte: () => dateDuDevis(), champs: champDate('dateEmission', () => travail.dateEmission ?? jourIso(dateDuDevis()), (v) => { travail.dateEmission = v; }, 'Date du devis') })),
      ligne('Valable jusqu’au ', valeurSurPlace({ etiquette: 'Valable jusqu’au ', nom: 'expireLe', texte: () => jourFr(travail.expireLe), champs: champDate('expireLe', () => travail.expireLe, (v) => { travail.expireLe = v; }, 'Valable jusqu’au') })),
      ligne('Début des travaux le ', valeurSurPlace({ etiquette: 'Début des travaux le ', nom: 'debutTravaux', texte: () => jourFr(travail.chantier?.debutTravaux), champs: champDate('debutTravaux', () => travail.chantier?.debutTravaux, ecrireChantier('debutTravaux'), 'Début des travaux') })),
      ligne('Durée estimée à ', valeurSurPlace({ etiquette: 'Durée estimée à ', nom: 'duree', texte: () => dureeEnTexte(travail.chantier?.dureeEstimee) ?? '', champs: champsDuree })),
      ligne('Date limite de fin de chantier le ', valeurSurPlace({ etiquette: 'Date limite de fin de chantier le ', nom: 'finChantierAu', texte: () => jourFr(travail.chantier?.finChantierAu), champs: champDate('finChantierAu', () => travail.chantier?.finChantierAu, ecrireChantier('finChantierAu'), 'Date limite de fin de chantier') })),
      ref.erreursChantier,
      ref.lienDescription,
      ref.objet);

    // À droite : « Pour qui est ce devis ? » (un seul champ : personne, organisation ou affaire, comme la grande barre de recherche), puis la ligne Affaire (les affaires de ce client).
    // Facultatifs tant que le devis est un brouillon (l'affaire est exigée à la finalisation, qui peut la créer).
    ref.erreurAffaire = h('p', { class: 'texte-discret', id: 'devis-affaire-aide', role: 'status', dataset: { erreur: 'affaire' } });
    ref.messageAffaireVidee = h('p', { class: 'texte-discret', role: 'status', dataset: { info: 'affaire-videe' }, hidden: true });
    ref.zoneClient = h('div', { class: 'zone-client-devis', dataset: { zone: 'client-devis' } });
    ref.champClient = lecture ? texteSeul('client', clientDuDevis(d)) : champClientIntelligent();
    ref.champAffaire = lecture ? texteSeul('affaire', d.affaireId ? libelleAffaireDuDevis(d.affaireId) : '') : champAffaireIntelligent();
    const attentionLecture = lecture && d.organisationId && d.personneId ? CRM.personne(d.personneId)?.nom : '';
    ref.champAdresse = h('textarea', {
      class: 'champ', id: 'devis-chantier-adresse', rows: 3, dataset: { champ: 'chantier-adresse' }, value: Ed.texteDeAdresse(c.adresse) || Ed.texteDeAdresse(d.adresses?.chantier),
      oninput: (e) => { const t = e.target.value; travail.adresses = { ...(travail.adresses ?? {}), chantier: Ed.adresseTexteSimple(t) }; travail.chantier = Ed.chantierAvecAdresse(travail.chantier, t); marquerModifie(); majErreursChantier(); },
    });
    if (!lecture) { majZoneClient(); majAideAffaire(); }
    const droite = h('div', { class: 'entete-droite' },
      champ('Pour qui est ce devis ?', lecture ? ref.champClient : ref.champClient.element, { id: 'devis-client', aide: lecture ? null : ref.zoneClient }),
      attentionLecture ? champ('À l’attention de', texteSeul('attention', attentionLecture), { id: 'devis-attention' }) : null,
      champ('Affaire', lecture ? ref.champAffaire : ref.champAffaire.element, { id: 'devis-affaire', aide: lecture ? null : [ref.erreurAffaire, ref.messageAffaireVidee] }),
      champ('Adresse du chantier', ref.champAdresse, { id: 'devis-chantier-adresse' }),
      blocAdresses('destinataires'),
      blocAdresses('copie'));
    return h('div', { class: 'entete-document' }, gauche, droite);
  }

  const MAX_AFFAIRES_PROPOSEES = 30;
  const libelleAffaireDuDevis = (idAffaire) => { const a = CRM.affaire(idAffaire); return a ? libelleAffaire(a) : 'Affaire du devis'; };
  /** Lecture seule : la valeur en texte (champ copiable, jamais une liste qui s'ouvre). */
  const ETIQUETTES_TEXTE = { client: 'Pour qui est ce devis ?', affaire: 'Affaire', attention: 'À l’attention de' };
  const texteSeul = (nom, texte) => h('input', { class: 'champ champ-grand', type: 'text', value: texte, id: `devis-${nom}`, dataset: { champ: nom }, 'aria-label': ETIQUETTES_TEXTE[nom] });
  const valeurClient = () => (travail.organisationId ? `organisation:${travail.organisationId}` : travail.personneId ? `personne:${travail.personneId}` : '');
  const elementClient = () => (valeurClient() ? { id: valeurClient(), libelle: clientDuDevis(travail) || 'Client du devis' } : null); // un client déjà choisi dont la fiche a disparu reste affiché
  const elementAffaire = () => (travail.affaireId ? { id: travail.affaireId, libelle: libelleAffaireDuDevis(travail.affaireId) } : null); // une affaire archivée du devis reste affichée
  const personnesActives = () => CRM.etat.personnes.filter((p) => !p.archive);
  const clientActuel = () => ({ organisationId: travail.organisationId || null, personneId: travail.personneId || null });
  const existeFiche = (type, id) => Boolean(type === 'organisation' ? CRM.organisation(id) : type === 'affaire' ? CRM.affaire(id) : CRM.personne(id));
  let enCreationAffaire = false; // une création d'affaire est en cours : un second clic n'en crée pas une deuxième
  /** La fiche du client (organisation, sinon personne) et son adresse ; null sans client. */
  function ficheClient(d = travail) { return d.organisationId ? clientParCle('organisation', d.organisationId) : d.personneId ? clientParCle('personne', d.personneId) : null; }
  /** E-mail de la personne « à l'attention de » (seulement quand une organisation est le client). */
  const emailAttention = (d = travail) => (d.organisationId && d.personneId ? Ed.emailsDeFiche(CRM.personne(d.personneId) ?? {})[0] ?? '' : '');
  const emailAutoDe = (d = travail) => CD.emailDestinataire(emailAttention(d), ficheClient(d) ? Ed.emailsDeFiche(ficheClient(d).fiche)[0] ?? '' : '');
  /** Les affaires du client choisi (la sienne ET celles de son organisation, ou de l'organisation ET de ses personnes) ; null = pas de client. Jamais celles d'un autre client. */
  const affairesDuClient = () => CD.affairesDuClient(clientActuel(), affaires(), personnesActives());
  /** Taper pour chercher puis quitter le champ sans choisir : le champ remontre la valeur réellement enregistrée (rien n'a été retiré du devis). */
  function reprendreValeurEnQuittant(ci, valeurReelle) {
    ci.entree.addEventListener('blur', () => setTimeout(() => {
      if (!racine.isConnected || document.activeElement === ci.entree) return;
      const voulu = valeurReelle();
      if ((ci.choix()?.id ?? '') !== (voulu?.id ?? '') || (!ci.choix() && ci.texte() !== '')) ci.afficher(voulu);
    }, 250));
  }
  /** Même moteur que la grande barre de recherche (rechercherSuggestions, mêmes groupes dans le même ordre : Personnes, Organisations, Affaires). */
  function champClientIntelligent() {
    const personnes = () => personnesActives().map((p) => {
      const org = CRM.organisation(p.organisationId);
      return { id: `personne:${p.id}`, libelle: p.nom, sousTitre: org?.nom || CL.premierEmail(p), extra: [org?.nom, ...(p.emails || []).map((e) => e.valeur)].filter(Boolean) };
    });
    const organisations = () => CRM.etat.organisations.filter((o) => !o.archive).map((o) => ({ id: `organisation:${o.id}`, libelle: o.nom, sousTitre: o.ville || '' }));
    const affairesRecherche = () => affaires().map((a) => {
      const p = CRM.personne(a.personneId);
      const o = CRM.organisation(a.organisationId);
      return { id: `affaire:${a.id}`, libelle: a.titre, sousTitre: [o?.nom, p?.nom].filter(Boolean).join(' · '), extra: [o?.nom, p?.nom].filter(Boolean) };
    });
    const ci = champIntelligent({
      id: 'devis-client', etiquette: 'Pour qui est ce devis ?', placeholder: 'Personne, organisation ou affaire', classe: 'champ-grand', valeur: elementClient(), ouvrirAuFocus: false,
      fournir: (saisie) => {
        const groupes = [
          { titre: 'Personnes', resultats: CL.rechercherSuggestions(saisie, personnes()).resultats },
          { titre: 'Organisations', resultats: CL.rechercherSuggestions(saisie, organisations()).resultats },
          { titre: 'Affaires', resultats: CL.rechercherSuggestions(saisie, affairesRecherche()).resultats },
        ].filter((g) => g.resultats.length);
        const texte = saisie.trim().replace(/\s+/g, ' ');
        // Rien trouvé : deux lignes, rien n'est créé sans clic.
        if (!groupes.length && texte.length >= CL.MIN_LETTRES) {
          groupes.push({ titre: null, resultats: [
            { id: `creer:personne:${texte}`, libelle: `+ Créer la personne « ${texte} »` },
            { id: `creer:organisation:${texte}`, libelle: `+ Créer l’organisation « ${texte} »` },
          ] });
        }
        return { groupes };
      },
      surChoix: (el, info) => { if (el || info?.effacement) changerClient(el); }, // taper pour chercher n'efface rien : seule la croix retire le client (et l'affaire)
    });
    ci.entree.dataset.champ = 'client';
    reprendreValeurEnQuittant(ci, elementClient);
    return ci;
  }
  /** La ligne Affaire : les affaires du client seulement (jamais celles d'un autre) ; sans client, il faut taper quelques lettres. Dans la même liste : « + Créer l'affaire « nom » » (puis « Dans quelle étape ? » si le réglage ne le dit pas). */
  function champAffaireIntelligent() {
    const element = (a) => ({ id: a.id, libelle: libelleAffaire(a) });
    const nomCree = (saisie) => CD.nomAffaireCreee(saisie, travail, { organisation: travail.organisationId ? CRM.organisation(travail.organisationId) : null, personne: travail.personneId ? CRM.personne(travail.personneId) : null });
    const ligneCreer = (saisie) => {
      const nom = nomCree(saisie);
      return nom ? [{ titre: null, resultats: [{ id: `creer-affaire:${nom}`, libelle: `+ Créer l’affaire « ${nom} »` }] }] : [];
    };
    const ci = champIntelligent({
      id: 'devis-affaire', etiquette: 'Affaire', placeholder: CD.PLACEHOLDER_AFFAIRE, classe: 'champ-affaire-devis', ouvrirAuFocus: true, valeur: elementAffaire(),
      fournir: (saisie) => {
        if (ref.pasEtape && saisie.trim()) ref.pasEtape = null; // taper un texte abandonne le second pas (la réouverture de la liste se fait champ vide)
        if (ref.pasEtape) { // second pas : les étapes actives, dans la même liste
          const { actives } = etapePourAffaireCreee(null, CRM.etat.config);
          return { groupes: [{ titre: 'Dans quelle étape ?', resultats: actives.map((e) => ({ id: `etape:${e.id}`, libelle: e.libelle })) }] };
        }
        const duClient = affairesDuClient();
        const base = (duClient ?? affaires()).map(element);
        const trouvees = saisie.trim().length < CL.MIN_LETTRES ? (duClient ? base.slice(0, MAX_AFFAIRES_PROPOSEES) : []) : CL.rechercherSuggestions(saisie, base).resultats;
        return { groupes: [...(trouvees.length ? [{ titre: null, resultats: trouvees }] : []), ...ligneCreer(saisie)] };
      },
      messageVide: (saisie) => {
        if (ref.pasEtape) return 'Crée d’abord une étape dans le pipeline des affaires (Réglages), puis reviens créer l’affaire.';
        return saisie.trim().length < CL.MIN_LETTRES ? 'Tape un nom pour créer une affaire, ou au moins 2 lettres pour en retrouver une.' : 'Aucune affaire ne correspond.';
      },
      surChoix: (el, info) => { if (el || info?.effacement) changerAffaire(el); },
    });
    ci.entree.dataset.champ = 'affaire';
    ci.entree.addEventListener('input', () => effacerAffaireManquante());
    ci.entree.addEventListener('keydown', (e) => { if (e.key === 'Escape') ref.pasEtape = null; });
    ci.entree.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ci.entree) ref.pasEtape = null; }, 250));
    reprendreValeurEnQuittant(ci, elementAffaire);
    return ci;
  }
  /** Finaliser sans affaire : le champ s'affiche en rouge avec son message (comme les autres champs obligatoires) et prend le focus. */
  function montrerAffaireManquante() {
    if (lecture || !ref.erreurAffaire) return;
    if (onglet !== 'edition') choisirOnglet('edition');
    ref.erreurAffaire.textContent = CD.MESSAGE_FINALISER_SANS_AFFAIRE;
    ref.erreurAffaire.hidden = false;
    ref.erreurAffaire.classList.add('erreur');
    ref.champAffaire.entree.classList.add('invalide');
    ref.champAffaire.entree.setAttribute('aria-invalid', 'true');
    ref.champAffaire.entree.setAttribute('aria-describedby', 'devis-affaire-aide');
    ref.champAffaire.entree.focus();
    ref.champAffaire.fermer(); // la liste (ouverte par le focus) cacherait le message : elle s'ouvre au clic ou en tapant
  }
  function effacerAffaireManquante() {
    if (!ref.erreurAffaire?.classList.contains('erreur')) return;
    ref.erreurAffaire.classList.remove('erreur');
    ref.champAffaire.entree.classList.remove('invalide');
    ref.champAffaire.entree.setAttribute('aria-invalid', 'false');
    ref.champAffaire.entree.removeAttribute('aria-describedby');
    majAideAffaire();
  }
  /** « + Créer l'affaire » : crée tout de suite (même écriture que « + Affaire », même journal) et la lie au devis. L'étape vient du réglage ; sinon second pas dans la liste, jamais de repli automatique. */
  async function creerAffaireDeLaListe(titre, etapeChoisie = null) {
    if (lecture || enCreationAffaire || !String(titre).trim()) return; // double clic : une seule création ; jamais d'affaire sans nom
    const etape = etapeAPasser(D.etat.reglages.etapeAffaireCreee, etapeChoisie, CRM.etat.config);
    if (!etape) { // pas d'étape retenue : les étapes actives (ou le message « aucune étape ») s'affichent dans la même liste
      ref.pasEtape = { titre };
      ref.champAffaire.afficher(elementAffaire());
      ref.champAffaire.entree.focus();
      ref.champAffaire.entree.dispatchEvent(new Event('input'));
      return;
    }
    enCreationAffaire = true;
    ref.pasEtape = null;
    const clientDepart = clientActuel();
    try {
      const idCree = await CRM.creerAffaire({ titre, personneId: travail.personneId || null, organisationId: travail.organisationId || null, etape });
      await attendreFiche('affaire', idCree);
      if (!CD.memeClient(clientDepart, clientActuel())) toast('L’affaire est créée, mais le client du devis a changé entre-temps : choisis-la dans la liste Affaire si c’est bien celle-ci.', { duree: 8000 });
      else {
        afficherAffaireVidee(null);
        effacerAffaireManquante();
        changer({ affaireId: idCree });
        toast('Affaire créée', { duree: 5000 });
      }
    } catch (e) {
      console.warn(e);
      toast('L’affaire n’a pas pu être créée. Vérifie ta connexion puis réessaie : ton devis est intact.', { type: 'erreur', duree: 8000 });
    } finally { enCreationAffaire = false; }
    majChoix();
  }
  /** Le texte sous la ligne Affaire et son texte d'invitation, d'après le client et l'affaire du devis. */
  function majAideAffaire() {
    if (lecture || !ref.erreurAffaire || ref.erreurAffaire.classList.contains('erreur')) return;
    const nb = affairesDuClient()?.length ?? 0;
    const phrase = CD.aideAffaire({ client: clientActuel(), affaireId: travail.affaireId, nbAffaires: nb });
    ref.erreurAffaire.textContent = phrase;
    ref.erreurAffaire.hidden = !phrase; // simple invitation : un brouillon s'enregistre sans affaire, c'est la finalisation qui la crée ou l'exige
    if (ref.champAffaire?.entree) ref.champAffaire.entree.placeholder = CD.PLACEHOLDER_AFFAIRE;
  }
  /** Sous le champ unique : la question « l'organisation / elle seule » (client choisi parmi les personnes, qui a une organisation) ou la liste facultative « à l'attention de » (organisation, affaire). */
  function majZoneClient() {
    if (lecture || !ref.zoneClient) return;
    const p = travail.personneId ? CRM.personne(travail.personneId) : null;
    const orgDeP = p?.organisationId ? CRM.organisation(p.organisationId) : null;
    const contenu = [];
    if (ref.depart === 'personne' && p && orgDeP) {
      const radio = (valeur, texte, coche) => h('label', { class: 'choix-pour-qui' },
        h('input', { type: 'radio', name: 'devis-pour-qui', value: valeur, checked: coche, dataset: { choix: valeur }, onchange: () => basculerPourQui(valeur) }), h('span', {}, texte));
      contenu.push(h('fieldset', { class: 'question-client', dataset: { zone: 'question-client' } },
        h('legend', { class: 'texte-discret' }, 'Ce devis est pour :'),
        radio('organisation', `l’organisation ${orgDeP.nom}, à l’attention de ${p.nom}`, travail.organisationId === orgDeP.id),
        radio('personne', `${p.nom} seule`, !travail.organisationId)));
    } else if (travail.organisationId) {
      const gens = CD.personnesAttention(travail.organisationId, personnesActives(), travail.personneId, CRM.etat.personnes);
      if (gens.length) {
        contenu.push(h('div', { class: 'attention-devis' },
          h('label', { class: 'texte-discret', for: 'devis-attention' }, 'À l’attention de'),
          h('select', { class: 'champ', id: 'devis-attention', dataset: { champ: 'attention' }, onchange: (e) => changerAttention(e.target.value) },
            h('option', { value: '' }, 'Personne (facultatif)'),
            gens.map((g) => h('option', { value: g.id, selected: g.id === travail.personneId }, g.nom)))));
      }
    }
    remplir(ref.zoneClient, ...contenu);
  }
  /** La fiche d'un client modifiée ailleurs, ou un client posé par l'affaire : le champ suit le devis (sans rappeler `surChoix`). */
  function afficherClient(forcer = false) {
    if (lecture || !ref.champClient?.choix) return;
    const voulu = elementClient();
    const actuel = ref.champClient.choix();
    if (!forcer && document.activeElement === ref.champClient.entree) return; // on ne touche pas à ce qu'on est en train de taper
    if ((actuel?.id ?? '') !== (voulu?.id ?? '') || (actuel && actuel.libelle !== voulu?.libelle)) ref.champClient.afficher(voulu);
  }
  const majClients = () => { afficherClient(); majZoneClient(); majAideAffaire(); };
  /** Après tout changement de client ou d'affaire : tout ce que l'écran en montre suit le devis. */
  function majChoix() {
    afficherClient(true);
    ref.champAffaire?.afficher?.(elementAffaire());
    majZoneClient();
    majAideAffaire();
    majEntete();
  }
  function afficherAffaireVidee(a) {
    if (!ref.messageAffaireVidee) return;
    ref.messageAffaireVidee.textContent = a ? `L’affaire « ${a.titre} » a été retirée du devis : elle n’est pas celle de ce client.` : '';
    ref.messageAffaireVidee.hidden = !a;
  }
  /** Pose le client (organisation et personne ensemble, ou la personne seule) ; une affaire d'un autre client est vidée, avec un message. */
  function poserClient(client) {
    afficherAffaireVidee(null);
    Object.assign(travail, { organisationId: client.organisationId, personneId: client.personneId });
    if (travail.affaireId) {
      const a = CRM.affaire(travail.affaireId);
      if (!a || !CD.affaireDuClient(a, client, CRM.etat.affaires, CRM.etat.personnes)) { afficherAffaireVidee(a ?? { titre: 'Affaire du devis' }); travail.affaireId = null; }
    }
    appliquerClient(ficheClient(), false, emailAttention());
  }
  /** Remplissage d'une attente de fiche (le client vient d'être créé : l'état de l'espace la reçoit un instant après). */
  async function attendreFiche(type, id) {
    for (let i = 0; i < 30 && !existeFiche(type, id); i += 1) await new Promise((r) => setTimeout(r, 100));
    return existeFiche(type, id);
  }

  async function changerClient(el) {
    if (lecture) return;
    if (!el) { // la croix efface le client ET l'affaire
      if (!valeurClient() && !travail.affaireId) return;
      ref.depart = null;
      afficherAffaireVidee(null);
      Object.assign(travail, { organisationId: null, personneId: null, affaireId: null });
      appliquerClient(null, false, '');
      majChoix();
      return;
    }
    const choix = CD.lireChoix(el.id);
    if (choix.type === 'creer') { await creerPuisChoisir(choix); return; }
    if (choix.type === 'affaire') { if (CRM.affaire(choix.id)) changerAffaire({ id: choix.id }); else afficherClient(true); return; }
    if (choix.type === 'personne') {
      const p = CRM.personne(choix.id);
      if (!p) { afficherClient(true); return; } // fiche disparue entre-temps : le champ remontre le client enregistré
      ref.depart = 'personne';
      poserClient(CD.clientDePersonne(p, { organisationExiste: Boolean(CRM.organisation(p.organisationId)) }));
    } else if (choix.type === 'organisation' && CRM.organisation(choix.id)) {
      ref.depart = 'organisation';
      poserClient(CD.clientDOrganisation(choix.id));
    } else { afficherClient(true); return; }
    majChoix();
  }
  /** « + Créer la personne / l'organisation » : la fiche se crée avec la fenêtre habituelle (rien n'est créé sans ce clic), puis devient le client. */
  async function creerPuisChoisir({ genre, texte }) {
    const id = genre === 'organisation' ? await ouvrirCreationOrganisation({ nom: texte }) : await ouvrirCreationPersonne({ nom: texte });
    if (id && await attendreFiche(genre, id)) { await changerClient({ id: `${genre}:${id}` }); return; }
    afficherClient(true); // annulé (ou fiche introuvable) : le champ remontre le client enregistré
  }
  /** La question « l'organisation / elle seule » : un clic change, l'organisation est le choix par défaut. */
  function basculerPourQui(valeur) {
    const p = travail.personneId ? CRM.personne(travail.personneId) : null;
    if (!p) return;
    poserClient(CD.clientDePersonne(p, { seule: valeur === 'personne', organisationExiste: Boolean(CRM.organisation(p.organisationId)) }));
    majChoix();
  }
  function changerAttention(id) {
    if (lecture) return;
    travail.personneId = id || null;
    appliquerClient(ficheClient(), false, emailAttention());
    majZoneClient();
    majEntete();
  }
  function changerAffaire(el) {
    if (lecture) return;
    if (!el) ref.pasEtape = null;
    if (el && String(el.id).startsWith('creer-affaire:')) { creerAffaireDeLaListe(String(el.id).slice('creer-affaire:'.length)); return; }
    if (el && String(el.id).startsWith('etape:')) { creerAffaireDeLaListe(ref.pasEtape?.titre ?? '', String(el.id).slice('etape:'.length)); return; }
    const a = el ? CRM.affaire(el.id) : null;
    if (!a) { if (travail.affaireId) { changer({ affaireId: null }); } majAideAffaire(); majEntete(); return; }
    // Affaire et client se remplissent ensemble : le client est l'organisation de l'affaire (sinon sa personne), la personne de l'affaire est « à l'attention de ».
    afficherAffaireVidee(null);
    effacerAffaireManquante();
    const c = CD.clientDAffaire(a, existeFiche);
    if (c.organisationId && !c.personneId && travail.personneId && CRM.personne(travail.personneId)?.organisationId === c.organisationId) c.personneId = travail.personneId; // l'attention déjà choisie reste
    travail.affaireId = a.id;
    if ((c.organisationId || c.personneId) && !CD.memeClient(c, clientActuel())) {
      ref.depart = 'affaire';
      Object.assign(travail, c);
      appliquerClient(ficheClient(), true, emailAttention());
    } else marquerModifie();
    majChoix();
  }

  /** Reprend l'adresse du client et l'e-mail du destinataire (celui de la personne « à l'attention de » s'il existe, sinon le premier e-mail de la fiche), sans écraser une adresse de chantier ou un e-mail que l'utilisateur a écrits à la main. */
  function appliquerClient(c, remplacerEmail, mailPrefere = '') {
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
    // Remplacé seulement si la liste est vide ou ne contient que l'e-mail repris automatiquement : plusieurs destinataires, ou une adresse écrite à la main, ne sont jamais écrasés.
    const mail = CD.emailDestinataire(mailPrefere, c ? Ed.emailsDeFiche(c.fiche)[0] ?? '' : '');
    const actuels = Ed.adressesDeListe(travail.destinataires);
    if (!actuels.length || (actuels.length === 1 && Ed.memeAdresse(actuels[0], ref.emailAuto ?? ''))) {
      const enCopie = Boolean(mail) && adresseDans('copie', mail);
      const repris = enCopie ? '' : mail;
      travail.destinataires = repris ? [repris] : [];
    }
    ref.emailAuto = mail;
    majBlocs();
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
    pointInsertion = null; rechercheEnLigne = false; sensInsertion = 'apres'; ouvreurRecherche = null; // l'écran est reconstruit : la boîte repart fermée
    ref.rechercheBordereau = h('input', {
      class: 'champ', type: 'search', placeholder: 'Libellé, code ou référence', autocomplete: 'off', 'aria-label': 'Rechercher dans le catalogue', dataset: { champ: 'recherche-bordereau' },
      oninput: (e) => { rechercheBordereau = e.target.value; majResultats(); },
    });
    ref.filtreFamille = h('select', { class: 'champ', 'aria-label': 'Famille', dataset: { champ: 'filtre-famille' }, onchange: (e) => { filtreFamille = e.target.value; majResultats(); } },
      h('option', { value: '' }, 'Toutes les familles'), arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [f, ...enfants]).filter((f) => f.actif).map((f) => h('option', { value: f.id }, f.parentId ? `\u00a0\u00a0\u00a0\u00a0– ${f.nom}` : f.nom)), h('option', { value: 'sans_famille' }, 'Sans famille'));
    ref.resultats = h('ul', { class: 'resultats-bordereau', dataset: { zone: 'resultats' } });
    ref.panneauRecherche = h('div', { class: 'recherche-bordereau', hidden: true, role: 'group', 'aria-label': 'Ajouter une ligne', dataset: { zone: 'recherche' } },
      h('div', { class: 'ligne-champs' }, ref.rechercheBordereau, ref.filtreFamille,
        h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'fermer-recherche' }, onclick: fermerRecherche }, 'Fermer')),
      ref.resultats,
      // Les éléments sans article du Bordereau : ils se posent au même endroit que l'article qu'on chercherait ; la boîte reste ouverte (seul « Fermer » la ferme).
      h('div', { class: 'recherche-autres-ajouts', dataset: { zone: 'recherche-autres' } },
        [['Section', 'section'], ['Sous-section', 'sous-section'], ['Texte', 'texte'], ['Saut de page', 'saut']].map(([libelle, cle]) => {
          const b = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: `recherche-ajouter-${cle}` }, onclick: (ev) => ajouterSansArticle(cle, ev.currentTarget) }, libelle);
          if (cle === 'saut') ref.boutonSautRecherche = b;
          return b;
        })));
    ref.hoteRecherche = h('div', {}, ref.panneauRecherche);
    ref.corpsLignes = h('tbody', {});
    // La Bibliothèque ajoute à la fin de la section de la dernière ligne touchée.
    ref.corpsLignes.addEventListener('focusin', (e) => { const tr = e.target.closest?.('tr[data-id]'); if (tr) ligneActive = tr.dataset.id; });
    ref.enteteTableau = h('thead', {});
    rendreEntetesTableau();
    ref.vide = h('div', { class: 'etat-vide-ligne', dataset: { vide: 'lignes' } }, h('p', {}, 'Clique sur un des boutons ci-dessous pour ajouter un élément à ton devis.'));
    ref.zoneTableau = h('div', { class: 'zone-tableau zone-lignes-devis' }, h('table', { class: 'tableau-lignes-devis' }, ref.enteteTableau, ref.corpsLignes));
    const bouton = (libelle, action, onclick, { desactive = false, titre = null } = {}) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action }, disabled: desactive, title: titre ?? undefined, onclick }, libelle);
    const type = (libelle, familleId) => bouton([icone('plus', { taille: 14 }), libelle], `ajouter-${familleId}`, (ev) => ouvrirRecherche(familleId, { ouvreur: ev.currentTarget }));
    const barre = h('div', { class: 'barre-ajouts', dataset: { zone: 'ajouts' } },
      h('div', { class: 'ajouts-types' },
        type('Fourniture', 'famille-1'), type('Main d’œuvre', 'famille-2'), type(O.majuscule(O.motOuvrage(D.etat.reglages).singulier), 'famille-3'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'autres-ajouts' }, 'aria-haspopup': 'menu', 'aria-label': 'Autres types de lignes', onclick: (ev) => { const ouvreur = ev.currentTarget; ouvrirMenu(ouvreur, [
          { libelle: 'Sous-traitance', action: () => ouvrirRecherche('famille-4', { ouvreur }) },
          { libelle: 'Matériel', action: () => ouvrirRecherche('famille-5', { ouvreur }) },
          { libelle: 'Divers', action: () => ouvrirRecherche('famille-7', { ouvreur }) },
          { separateur: true },
          // Ligne libre : comme avant, elle suit la boîte « en ligne » ouverte, sinon va à la fin ; elle n'ouvre pas la boîte et ne la ferme pas.
          { libelle: 'Ligne libre', icone: 'plus', action: () => ajouterLigne(Ed.ligneLibre(nouvelId()), { suite: rechercheEnLigne && !ref.panneauRecherche.hidden }) },
        ]); } }, '…')),
      h('div', { class: 'ajouts-structure' },
        bouton('Section', 'ajouter-section', (ev) => ajouterEnFinEtOuvrir(Ed.sectionNeuve(nouvelId()), ev.currentTarget)),
        bouton('Sous-section', 'ajouter-sous-section', (ev) => ajouterEnFinEtOuvrir(Ed.sousSectionNeuve(nouvelId()), ev.currentTarget)),
        bouton('Texte', 'ajouter-texte', (ev) => ajouterEnFinEtOuvrir(Ed.ligneTexte(nouvelId()), ev.currentTarget)),
        (ref.boutonSaut = bouton('Saut de page', 'ajouter-saut', ajouterSautEnFin))));
    return [ref.vide, ref.zoneTableau, barre, ref.hoteRecherche];
  }

  /** Le bouton « Saut de page » du bas : un saut à la fin de la section où l'on travaille (à la fin du devis s'il n'y a pas de section) ; la boîte « Ajouter une ligne » s'ouvre en fin de devis et y reste.
   *  Décision prise seul : le saut peut donc tomber au milieu du devis alors que la boîte est en bas. */
  function ajouterSautEnFin(ev) {
    ouvrirBoiteEnFin(ev?.currentTarget);
    const saut = Ed.ligneSaut(nouvelId());
    const section = Ed.sectionDe(travail.sections, ligneActive);
    appliquer(section ? Ed.insererAutour(travail.sections, saut, section, 'fin') : Ed.ajouterElement(travail.sections, saut, null, nouvelId()), { focus: saut.id });
  }

  /** Section, Sous-section, Texte du bas : l'élément se pose TOUJOURS à la fin du devis, le curseur va dans son titre, et la boîte s'ouvre dessous (sans lui voler le focus) et reste ouverte. */
  function ajouterEnFinEtOuvrir(element, ouvreur) {
    if (lecture) return;
    ouvrirBoiteEnFin(ouvreur);
    ajouterLigne(element, { champ: 'libelle' });
  }

  /** Ouvre la boîte à la fin du devis sans changer son filtre si elle était déjà ouverte (« toutes les familles » sinon), sans prendre le focus. */
  function ouvrirBoiteEnFin(ouvreur) {
    ouvrirRecherche(ref.panneauRecherche.hidden ? '' : filtreFamille, { garderFiltre: !ref.panneauRecherche.hidden, focus: false, ouvreur });
  }

  /** Boutons Section, Sous-section, Texte, Saut de page de la boîte : l'élément se pose à l'endroit de la boîte (fin du devis, ou sous / sur la ligne choisie) ; la boîte reste ouverte et suit le nouvel élément, comme pour un article. */
  function ajouterSansArticle(cle, bouton) {
    if (lecture) return;
    const creer = { section: () => Ed.sectionNeuve(nouvelId()), 'sous-section': () => Ed.sousSectionNeuve(nouvelId()), texte: () => Ed.ligneTexte(nouvelId()), saut: () => Ed.ligneSaut(nouvelId()) }[cle];
    ajouterLigne(creer(), { champ: 'libelle', suite: rechercheEnLigne && !ref.panneauRecherche.hidden });
    if (document.activeElement === document.body && bouton?.isConnected) bouton.focus({ preventScroll: true }); // un saut n'a pas de champ : le focus reste sur le bouton de la boîte
  }

  /** « Fermer » : seule façon de fermer la boîte. Le texte et le filtre restent ; le focus va au bouton qui l'avait ouverte (sinon à la ligne de la boîte, sinon à la dernière ligne). */
  function fermerRecherche() {
    const ligne = rechercheEnLigne && pointInsertion ? ref.corpsLignes.querySelector(`tr[data-id="${pointInsertion}"]`) : null;
    ref.panneauRecherche.hidden = true; pointInsertion = null; rechercheEnLigne = false;
    placerPanneauRecherche();
    const dernieres = ref.corpsLignes.querySelectorAll('tr[data-id]');
    const cible = ouvreurRecherche?.isConnected ? ouvreurRecherche : (ligne?.querySelector('button:not(:disabled)') ?? dernieres[dernieres.length - 1]?.querySelector('button:not(:disabled)') ?? ref.boutonSaut);
    cible?.focus?.({ preventScroll: true });
  }

  /** Ouvre la recherche dans le Bordereau, déjà filtrée sur une famille (« + Fourniture » → les fournitures), à la fin du devis (dans le tableau, après la dernière ligne), sauf `enLigne`. */
  function ouvrirRecherche(familleId, { enLigne = false, garderFiltre = false, focus = true, ouvreur = null } = {}) {
    if (lecture) return;
    rechercheEnLigne = enLigne;
    if (!enLigne) pointInsertion = null;
    if (!garderFiltre) filtreFamille = familleId && D.etat.familles.some((f) => f.id === familleId && f.actif !== false) ? familleId : '';
    ouvreurRecherche = ouvreur;
    ref.filtreFamille.value = filtreFamille;
    ref.panneauRecherche.hidden = false;
    majResultats();
    placerPanneauRecherche();
    if (focus) {
      ref.rechercheBordereau.focus({ preventScroll: true });
      ref.panneauRecherche.scrollIntoView?.({ block: 'nearest' });
    }
  }

  /** Place la boîte « Ajouter une ligne » : dans le tableau, sous (ou sur) la ligne choisie dans un menu « Insérer », sinon après la dernière ligne du devis ; fermée, elle est rangée hors du tableau. */
  function placerPanneauRecherche() {
    if (!ref.hoteRecherche || !ref.corpsLignes) return;
    const ouverte = !ref.panneauRecherche.hidden;
    const vide = Ed.aplatir(travail.sections).length === 0;
    // Devis vide : le tableau n'existe que pour contenir la boîte (sans sa ligne de titres).
    ref.zoneTableau.hidden = vide && !ouverte;
    ref.zoneTableau.classList.toggle('sans-ligne', vide);
    if (!ouverte) {
      if (ref.panneauRecherche.parentElement !== ref.hoteRecherche) ref.hoteRecherche.append(ref.panneauRecherche);
      ref.trRecherche?.remove();
      return;
    }
    const ligneCible = rechercheEnLigne && pointInsertion ? ref.corpsLignes.querySelector(`tr[data-id="${pointInsertion}"]`) : null;
    ref.trRecherche ??= h('tr', { class: 'ligne-recherche', dataset: { zone: 'recherche-en-ligne' } }, h('td', {}));
    const cellule = ref.trRecherche.firstElementChild;
    cellule.setAttribute('colspan', String(colonnes().length)); // le nombre de colonnes change avec Options > affichage
    if (ref.panneauRecherche.parentElement !== cellule) cellule.append(ref.panneauRecherche);
    if (!ligneCible) { ref.corpsLignes.append(ref.trRecherche); return; } // fin du devis : après la dernière ligne
    let ancre = ligneCible;
    const avant = sensInsertion === 'avant';
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
      remplir(ref.resultats, h('li', { class: 'texte-discret', dataset: { vide: 'bordereau' } }, 'Ton catalogue est vide : crée tes articles dans le catalogue, ou utilise une ligne libre.', ' ', h('a', { href: lien('devis/bordereau') }, 'Ouvrir le catalogue')));
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
    if (ref.boutonSautRecherche) { ref.boutonSautRecherche.disabled = elements.length === 0; ref.boutonSautRecherche.title = elements.length === 0 ? 'Ajoute d’abord un élément au devis : un saut de page se place entre deux éléments.' : ''; }
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
      { libelle: O.majuscule(O.motOuvrage(D.etat.reglages).singulier), cle: `inserer-${ou}-ouvrage`, action: chercher('famille-3') },
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
    const editeur = editeurOuvrage({ composants: trouve.ligne.ouvrage.composants.map((c) => ({ articleId: c.articleId, quantite: c.quantite })), prixModifiable: false });
    const ok = await dialogue({
      titre: `Éléments ${O.duMot(O.motOuvrage(D.etat.reglages))}`, contenu: editeur.element,
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
        if (v === null || !Ed.prixVenteReglable(lig, v, travail.modeMarge)) { ev.target.classList.add('invalide'); ev.target.title = 'Ce prix de vente est impossible avec le prix d’achat de cette ligne et le calcul de la marge.'; return; }
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
    const configurer = l.ouvrage ? h('button', { type: 'button', class: 'bouton-lien bouton-configurer-ouvrage', dataset: { action: 'configurer-ouvrage' }, onclick: () => configurerOuvrage(l.id) }, `Configurer les éléments ${O.duMot(O.motOuvrage(D.etat.reglages))}`) : null;
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
    const texteLibre = h('textarea', { class: 'champ', id: 'devis-texte-libre', rows: 3, value: d.texteLibre ?? '', 'aria-label': 'Texte libre', hidden: !(d.texteLibre ?? '').trim(), dataset: { champ: 'texte-libre' }, oninput: (e) => changer({ texteLibre: e.target.value }) });
    const lienTexte = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'ajouter-texte-libre' }, hidden: !texteLibre.hidden, onclick: () => { texteLibre.hidden = false; lienTexte.hidden = true; texteLibre.focus(); } }, icone('plus', { taille: 14 }), 'Ajouter texte libre');
    const gauche = h('div', { class: 'bas-gauche' },
      (ref.blocPaiement = h('div', { class: 'bloc-paiement', dataset: { zone: 'paiement' } })),
      (ref.blocMethodes = h('div', { class: 'bloc-methodes', dataset: { zone: 'methodes' } })),
      texteLibre, lienTexte,
      (ref.blocDechets = h('div', { class: 'bloc-dechets', dataset: { zone: 'dechets' } })));
    dessinerPaiement(null);
    dessinerMethodes(false);
    dessinerDechets(false);
    const [totaux, net, taux] = blocTotaux();
    const notes = h('div', { class: 'notes-bas-page' },
      h('h3', { class: 'titre-bloc' }, 'Notes de bas de page'),
      h('textarea', { class: 'champ', id: 'devis-notes', rows: 4, maxlength: 2000, value: d.notesBasDePage ?? '', 'aria-label': 'Notes de bas de page', dataset: { champ: 'notes' }, oninput: (e) => changer({ notesBasDePage: e.target.value }) }));
    // Le bandeau « NET À PAYER » est un enfant direct de la feuille : il reste collé en bas de l'écran tant qu'on défile au-dessus de lui.
    return [h('div', { class: 'bas-devis' }, gauche, totaux), net, taux, notes];
  }

  // ------------------------------------------------ méthodes de paiement acceptées : celles des réglages, ou celles choisies pour ce devis
  const modesReglages = () => (Array.isArray(D.etat.reglages.entreprise?.paiement?.modes) ? D.etat.reglages.entreprise.paiement.modes : []);
  const modesPropres = () => (Array.isArray(travail.modesPaiement) ? travail.modesPaiement : []).filter((m) => typeof m === 'string' && m.trim());
  /** Ce que le PDF imprimera : les méthodes de ce devis si elles existent, sinon celles des réglages. */
  const modesAffiches = () => (modesPropres().length ? modesPropres() : modesReglages());
  /** Le bloc, fermé (la phrase + « Modifier pour ce devis ») ou ouvert (cases + « Revenir aux réglages »). Un choix s'enregistre avec le devis, comme le reste. */
  function dessinerMethodes(ouvert) {
    const bloc = ref.blocMethodes;
    if (!bloc) return;
    const phrase = h('p', { class: 'texte-discret', dataset: { valeur: 'methodes-paiement' } });
    const majPhrase = () => {
      const modes = modesAffiches();
      if (modes.length) { phrase.textContent = `Méthodes de paiement acceptées : ${modes.join(', ')}.`; return; }
      phrase.replaceChildren('Méthodes de paiement acceptées : aucune. ', h('a', { href: lien('reglages/devis/reglages-entreprise'), dataset: { lien: 'reglages-paiement' } }, 'Choisir les méthodes dans les réglages'), '.');
    };
    majPhrase();
    if (!ouvert) {
      bloc.dataset.ouvert = 'non';
      remplir(bloc, phrase, h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'modifier-methodes' }, onclick: () => { dessinerMethodes(true); bloc.querySelector('input')?.focus(); } }, icone('pencil', { taille: 14 }), 'Modifier pour ce devis'));
      verrouiller(bloc);
      return;
    }
    bloc.dataset.ouvert = 'oui';
    const courantes = modesAffiches();
    const choix = [...A.MODES_PAIEMENT, ...courantes.filter((m) => !A.MODES_PAIEMENT.includes(m))];
    const cases = choix.map((m) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: courantes.includes(m), dataset: { mode: m },
        onchange: () => { changer({ modesPaiement: cases.map((c) => c.querySelector('input')).filter((i) => i.checked).map((i) => i.dataset.mode) }); majPhrase(); revenir.hidden = modesPropres().length === 0; } }), m));
    const revenir = h('button', { type: 'button', class: 'bouton-lien', hidden: modesPropres().length === 0, dataset: { action: 'revenir-methodes' }, onclick: () => { changer({ modesPaiement: [] }); dessinerMethodes(false); } }, 'Revenir aux réglages');
    const fermer = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'fermer-methodes' }, onclick: () => { dessinerMethodes(false); bloc.querySelector('[data-action="modifier-methodes"]')?.focus(); } }, 'Fermer');
    remplir(bloc, phrase,
      h('fieldset', { class: 'cases', dataset: { zone: 'methodes-cases' } }, h('legend', { class: 'sr-only' }, 'Méthodes de paiement acceptées'), cases),
      h('p', { class: 'texte-discret' }, 'Ce choix ne concerne que ce devis. Sans case cochée, les méthodes de tes réglages s’appliquent.'),
      h('div', { class: 'ligne-boutons' }, revenir, fermer));
    verrouiller(bloc);
  }

  // ------------------------------------------------ gestion des déchets : une information du devis, jamais dans les totaux
  /** Les phrases du PDF (les mêmes), ou [] si rien n'est renseigné ou si les données sont invalides. */
  function lignesDechets() {
    try { return vueClient(travail, {}).dechets?.lignes ?? []; } catch { return []; }
  }
  /** Le bloc, fermé (phrases + « Définir » ou « Modifier ») ou ouvert (formulaire en place). */
  function dessinerDechets(ouvert) {
    const bloc = ref.blocDechets;
    if (!bloc) return;
    const titre = h('h3', { class: 'titre-bloc' }, 'Gestion des déchets');
    if (!ouvert) {
      const phrases = lignesDechets();
      const bouton = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'definir-dechets' }, onclick: () => dessinerDechets(true) }, phrases.length ? 'Modifier' : 'Définir');
      remplir(bloc, h('div', { class: 'titre-ligne' }, titre, bouton),
        phrases.length
          ? h('div', { class: 'dechets-phrases', dataset: { valeur: 'dechets' } }, phrases.map((l) => h('div', { dataset: { dechetsLigne: '' } }, l)))
          : h('p', { class: 'texte-discret', dataset: { vide: 'dechets' } }, 'Aucune information sur les déchets'));
      verrouiller(bloc);
      return;
    }
    const d = travail.dechets && typeof travail.dechets === 'object' ? travail.dechets : {};
    const depart = {
      type: Array.isArray(d.types) && d.types.length ? d.types[0] : '',
      point: typeof d.pointCollecte === 'string' ? d.pointCollecte.trim() : '',
      min: saisieNombre(d.volumeMin), max: saisieNombre(d.volumeMax), cout: saisiePrix(d.coutTtcParM3),
    };
    const erreur = (cle) => h('p', { class: 'erreur', role: 'alert', id: `dechets-erreur-${cle}`, dataset: { erreur: `dechets-${cle}` }, hidden: true });
    const err = { min: erreur('min'), max: erreur('max'), cout: erreur('cout') };
    const type = h('select', { class: 'champ', id: 'dechets-type', dataset: { champ: 'dechets-type' }, onchange: majEtat },
      h('option', { value: '' }, 'Aucun type choisi'), ...TYPES_DECHETS.map((t) => h('option', { value: t.id, selected: t.id === depart.type }, t.libelle)));
    const champ = (cle, id, valeurDepart, extra = {}) => h('input', { class: 'champ', id, type: 'text', autocomplete: 'off', value: valeurDepart, 'aria-describedby': cle === 'point' ? null : `dechets-erreur-${cle}`, dataset: { champ: `dechets-${cle}` }, oninput: majEtat, ...extra });
    const point = champ('point', 'dechets-point', depart.point, { maxlength: 200 });
    const min = champ('min', 'dechets-min', depart.min, { inputmode: 'decimal', placeholder: 'Ex. 5' });
    const max = champ('max', 'dechets-max', depart.max, { inputmode: 'decimal', placeholder: 'Ex. 10' });
    const cout = champ('cout', 'dechets-cout', depart.cout, { inputmode: 'decimal', placeholder: 'Ex. 85' });
    const saisies = () => ({ type: type.value, point: point.value.trim(), min: min.value.trim(), max: max.value.trim(), cout: cout.value.trim() });
    const modifie = () => JSON.stringify(saisies()) !== JSON.stringify(depart);
    const enregistrer = h('button', { type: 'button', class: 'bouton', disabled: true, dataset: { action: 'enregistrer-dechets' }, onclick: valider }, 'Enregistrer');
    function majEtat() { const m = modifie(); enregistrer.disabled = !m; enregistrer.classList.toggle('bouton-principal', m); }
    function fermer() { dessinerDechets(false); bloc.querySelector('[data-action="definir-dechets"]')?.focus(); }
    function valider() {
      if (lecture || !modifie()) return;
      const s = saisies();
      const message = { min: '', max: '', cout: '' };
      const nombre = (cle, brut, nom) => {
        if (brut === '') return null;
        const n = A.lireNombre(brut);
        if (n === null) { message[cle] = `${nom} : écris un nombre, par exemple 12,5.`; return null; }
        if (n < 0) { message[cle] = `${nom} ne peut pas être négatif.`; return null; }
        return n;
      };
      const vMin = nombre('min', s.min, 'Le volume minimum');
      const vMax = nombre('max', s.max, 'Le volume maximum');
      const vCout = nombre('cout', s.cout, 'Le coût');
      if (vMin !== null && vMax !== null && vMin > vMax) message.max = 'Le maximum doit être égal ou supérieur au minimum.';
      for (const [cle, el] of Object.entries(err)) { el.hidden = !message[cle]; el.textContent = message[cle]; }
      for (const [cle, el] of [['min', min], ['max', max], ['cout', cout]]) { el.classList.toggle('invalide', !!message[cle]); el.setAttribute('aria-invalid', message[cle] ? 'true' : 'false'); }
      if (message.min || message.max || message.cout) return; // rien n'est enregistré
      if (!s.type && !s.point && vMin === null && vMax === null && vCout === null) changer({ dechets: null }); // null, jamais undefined : sinon l'ancienne valeur resterait dans la base
      else {
        // Un devis qui a déjà plusieurs types (démo, ancien MCP) les garde tant que le choix de la liste n'a pas changé.
        const gardes = s.type === depart.type && Array.isArray(d.types) ? d.types.filter((x) => TYPES_DECHETS.some((y) => y.id === x)) : null;
        const valeur = { types: gardes ?? (s.type ? [s.type] : []), unite: 'm3' };
        if (s.point) valeur.pointCollecte = s.point;
        if (vMin !== null) valeur.volumeMin = vMin;
        if (vMax !== null) valeur.volumeMax = vMax;
        if (vCout !== null) valeur.coutTtcParM3 = vCout;
        changer({ dechets: valeur });
      }
      fermer();
    }
    const etiquette = (pour, texte) => h('label', { class: 'etiquette', for: pour }, texte);
    const telephone = window.innerWidth <= LARGEUR_TELEPHONE;
    const formulaire = h('div', {
      class: 'dechets-formulaire', role: 'group', 'aria-label': 'Gestion des déchets', tabindex: telephone ? '-1' : null, dataset: { zone: 'dechets-formulaire', ...(telephone ? { focusInitial: '' } : {}) },
      onkeydown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
        else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); valider(); }
      },
    },
    h('div', { class: 'bloc-champ' }, etiquette('dechets-type', 'Type de déchets'), type),
    h('div', { class: 'bloc-champ' }, etiquette('dechets-point', 'Point de collecte'), point),
    h('div', { class: 'dechets-volumes' },
      h('div', { class: 'bloc-champ' }, etiquette('dechets-min', 'Volume minimum (m³)'), min, err.min),
      h('div', { class: 'bloc-champ' }, etiquette('dechets-max', 'Volume maximum (m³)'), max, err.max)),
    h('div', { class: 'bloc-champ' }, etiquette('dechets-cout', 'Coût associé (€ TTC par m³)'), cout, err.cout),
    h('p', { class: 'texte-discret' }, 'Information imprimée sur le devis : elle ne change pas le prix.'),
    h('div', { class: 'dechets-actions' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'annuler-dechets' }, onclick: fermer }, 'Annuler'), enregistrer));
    remplir(bloc, h('div', { class: 'titre-ligne' }, titre), formulaire);
    (telephone ? formulaire : type).focus();
  }

  // ------------------------------------------------ conditions de paiement : la liste des acomptes, puis le reste à facturer
  /** « 30 % du total · à la signature », « 500,00 € HT · au début des travaux » : ce que l'acompte demande, sans le montant TTC (affiché à droite). */
  function texteAcompte(a) {
    const moment = a?.moment === 'libre' ? (String(a.texteMoment ?? '').trim() || 'moment à préciser') : (MOMENTS_ACOMPTE.find((m) => m.id === a?.moment)?.libelle ?? 'moment à choisir');
    const v = typeof a?.valeur === 'number' ? a.valeur : null;
    const quoi = v === null ? 'Acompte' : a.type === 'pourcentage' ? `${saisieNombre(v)} % du total` : a.type === 'montantHt' ? `${euros(v)} HT` : `${euros(v)} TTC`;
    return `${quoi} · ${moment}`;
  }
  /** Montre ou cache la ligne « Reste à facturer » : cachée sans acompte, ou quand l'option « Cacher le reste à facturer » est cochée. */
  function majReste() {
    const ligne = racine.querySelector('[data-ligne="reste"]');
    if (!ligne) return;
    let aDesAcomptes = false;
    try { aDesAcomptes = totauxDevis(travail).acompteTtc !== null; } catch { aDesAcomptes = false; }
    ligne.hidden = !aDesAcomptes || affichage().cacherResteAFacturer === true;
  }
  /** Remet à jour les montants TTC de la liste quand les totaux bougent, sans redessiner le bloc (un formulaire ouvert garde sa saisie). */
  function majMontantsAcomptes() {
    if (!ref.blocPaiement) return;
    let detail = [];
    try { detail = detailAcomptes(travail); } catch { detail = []; }
    detail.forEach((x, i) => {
      const el = ref.blocPaiement.querySelector(`[data-acompte-ligne="${i}"] [data-valeur="acompte-montant"]`);
      if (el) el.textContent = x.montantTtc === null ? '—' : euros(x.montantTtc);
    });
    // Un acompte déjà enregistré qui ne tient plus (remise ajoutée, ligne retirée) : le message est sous sa ligne.
    let erreurs = [];
    try { erreurs = erreursAcomptes(listeAcomptes(travail), totauxDevis(travail)); } catch { erreurs = []; }
    ref.blocPaiement.querySelectorAll('[data-acompte-ligne]').forEach((li, i) => {
      const p = li.querySelector(':scope > [data-erreur="acompte-ligne"]');
      if (!p) return;
      const m = erreurs.filter((e) => e.index === i).map((e) => e.message).join(' ');
      p.hidden = !m;
      p.textContent = m;
    });
  }
  function ouvrirMenuCondition(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu([
      { libelle: 'Acompte', cle: 'acompte', action: () => dessinerPaiement({ index: -1 }) },
      { libelle: 'Retenue de garantie', cle: 'retenue-garantie', bientot: true },
    ], fermer), { nom: 'Ajouter une condition' });
  }
  async function retirerAcompte(i) {
    const avant = structuredClone(listeAcomptes(travail));
    const a = avant[i];
    await retirerAvecAnnulation({
      titre: 'Retirer cet acompte ?', message: `L’acompte « ${texteAcompte(a)} » sera retiré du devis.`, libelleOk: 'Retirer', danger: true, messageFait: 'Acompte retiré',
      faire: () => { changer({ acomptes: avant.filter((_, k) => k !== i), acompte: null }); dessinerPaiement(null); },
      // Annuler ne remet que l'acompte retiré, à sa place : un acompte ajouté pendant les 8 secondes reste.
      defaire: () => { const l = structuredClone(listeAcomptes(travail)); l.splice(Math.min(i, l.length), 0, a); changer({ acomptes: l, acompte: null }); dessinerPaiement(null); },
    });
  }
  /** Le bloc : titre + « Ajouter une condition », la liste (ou « Aucun acompte »), le reste à facturer. `edition` = { index } (−1 : nouvel acompte) pour montrer le formulaire en place. */
  function dessinerPaiement(edition) {
    const bloc = ref.blocPaiement;
    if (!bloc) return;
    const liste = listeAcomptes(travail);
    let detail = [];
    try { detail = detailAcomptes(travail); } catch { detail = liste.map((acompte) => ({ acompte, montantTtc: null })); }
    const ajouter = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'ajouter-condition' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (ev) => ouvrirMenuCondition(ev.currentTarget) }, icone('plus', { taille: 14 }), 'Ajouter une condition');
    const ligne = (x, i) => {
      if (edition && edition.index === i) return h('li', { class: 'acompte-ligne acompte-ligne-edition', dataset: { acompteLigne: String(i) } }, formulaireAcompte(i));
      return h('li', { class: 'acompte-ligne', dataset: { acompteLigne: String(i) } },
        h('span', { class: 'acompte-texte', dataset: { valeur: 'acompte-texte' } }, texteAcompte(x.acompte)),
        h('span', { class: 'acompte-montant', dataset: { valeur: 'acompte-montant' } }, x.montantTtc === null ? '—' : euros(x.montantTtc)),
        h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'modifier-acompte' }, title: 'Modifier', 'aria-label': `Modifier l’acompte ${i + 1}`, onclick: () => dessinerPaiement({ index: i }) }, icone('pencil', { taille: 14 })),
        h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'retirer-acompte' }, title: 'Retirer', 'aria-label': `Retirer l’acompte ${i + 1}`, onclick: () => retirerAcompte(i) }, icone('x', { taille: 14 })),
        h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'acompte-ligne' } }));
    };
    const lignes = detail.map(ligne);
    if (edition && edition.index < 0) lignes.push(h('li', { class: 'acompte-ligne acompte-ligne-edition', dataset: { acompteLigne: 'nouveau' } }, formulaireAcompte(-1)));
    remplir(bloc,
      h('div', { class: 'titre-ligne' }, h('h3', { class: 'titre-bloc' }, 'Conditions de paiement'), ajouter),
      lignes.length ? h('ul', { class: 'acomptes-liste', dataset: { zone: 'acomptes' } }, lignes) : h('p', { class: 'texte-discret', dataset: { vide: 'acomptes' } }, 'Aucun acompte'),
      h('div', { class: 'acompte-reste', dataset: { ligne: 'reste' } }, h('span', { class: 'texte-discret' }, 'Reste à facturer'), h('span', { class: 'acompte-montant', dataset: { total: 'reste' } })));
    majTotaux();
    verrouiller(bloc);
  }
  /** Formulaire en place d'un acompte (même fonctionnement que les déchets) : rien n'entre dans le devis avant un Enregistrer valide. */
  function formulaireAcompte(index) {
    const liste = listeAcomptes(travail);
    const a = index >= 0 ? liste[index] : null;
    const depart = {
      valeur: saisieNombre(a?.valeur), type: TYPES_ACOMPTE.some((x) => x.id === a?.type) ? a.type : 'pourcentage',
      moment: MOMENTS_ACOMPTE.some((m) => m.id === a?.moment) ? a.moment : 'signature', texte: a?.moment === 'libre' ? String(a.texteMoment ?? '').trim() : '',
    };
    const pref = index >= 0 ? `acompte-${index}` : 'acompte-nouveau';
    const valeur = h('input', { class: 'champ', id: `${pref}-valeur`, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: depart.valeur, placeholder: 'Ex. 30', 'aria-describedby': `${pref}-erreur`, dataset: { champ: 'acompte-valeur' }, oninput: majEtat });
    const type = h('select', { class: 'champ', id: `${pref}-type`, dataset: { champ: 'acompte-type' }, onchange: majEtat },
      TYPES_ACOMPTE.map((x) => h('option', { value: x.id, selected: x.id === depart.type }, x.libelle)));
    const moment = h('select', { class: 'champ', id: `${pref}-moment`, dataset: { champ: 'acompte-moment' }, onchange: majEtat },
      MOMENTS_ACOMPTE.map((m) => h('option', { value: m.id, selected: m.id === depart.moment }, m.id === 'libre' ? 'Texte libre' : m.libelle)));
    const texte = h('input', { class: 'champ', id: `${pref}-texte`, type: 'text', autocomplete: 'off', value: depart.texte, placeholder: 'Quand ?', maxlength: 120, 'aria-describedby': `${pref}-erreur`, dataset: { champ: 'acompte-texte' }, oninput: majEtat });
    const blocTexte = h('div', { class: 'bloc-champ', hidden: depart.moment !== 'libre' }, h('label', { class: 'etiquette', for: `${pref}-texte` }, 'Moment (texte libre)'), texte);
    const erreur = h('p', { class: 'erreur', role: 'alert', id: `${pref}-erreur`, dataset: { erreur: 'acompte' }, hidden: true });
    const enregistrer = h('button', { type: 'button', class: 'bouton', disabled: true, dataset: { action: 'enregistrer-acompte' }, onclick: valider }, 'Enregistrer');
    const saisies = () => ({ valeur: valeur.value.trim(), type: type.value, moment: moment.value, texte: moment.value === 'libre' ? texte.value.trim() : '' });
    const modifie = () => JSON.stringify(saisies()) !== JSON.stringify({ ...depart, valeur: depart.valeur.trim() });
    function majEtat() {
      blocTexte.hidden = moment.value !== 'libre';
      const m = modifie();
      enregistrer.disabled = !m;
      enregistrer.classList.toggle('bouton-principal', m);
    }
    function fermer() {
      dessinerPaiement(null);
      (index >= 0 ? ref.blocPaiement.querySelector(`[data-acompte-ligne="${index}"] [data-action="modifier-acompte"]`) : ref.blocPaiement.querySelector('[data-action="ajouter-condition"]'))?.focus();
    }
    function valider() {
      if (lecture || !modifie()) return;
      const s = saisies();
      const acompte = { type: s.type, valeur: Ed.lireSaisie(s.valeur), moment: s.moment, ...(s.moment === 'libre' ? { texteMoment: s.texte } : {}) };
      const place = index >= 0 ? index : liste.length;
      const candidate = liste.map((x) => structuredClone(x));
      candidate[place] = acompte;
      // Les règles sont celles de la finalisation. Une erreur née de cette saisie (même sur un autre acompte, comme un total trop grand) s'affiche sous ce formulaire.
      const t = totauxDevis(travail);
      const avant = erreursAcomptes(liste, t);
      const messages = erreursAcomptes(candidate, t).filter((e) => e.index === place || !avant.some((b) => b.index === e.index && b.message === e.message)).map((e) => e.message);
      erreur.hidden = !messages.length;
      erreur.textContent = messages.join(' ');
      const surTexte = messages.length > 0 && messages.every((m) => /texte libre/.test(m)); // seul le champ concerné est marqué
      for (const [el, marque] of [[valeur, messages.length > 0 && !surTexte], [texte, surTexte]]) { el.classList.toggle('invalide', marque); el.setAttribute('aria-invalid', marque ? 'true' : 'false'); }
      if (messages.length) return; // rien n'est enregistré
      changer({ acomptes: candidate, acompte: null }); // null, jamais undefined : sinon l'ancien acompte resterait dans la base
      fermer();
    }
    const etiquette = (pour, t) => h('label', { class: 'etiquette', for: pour }, t);
    const telephone = window.innerWidth <= LARGEUR_TELEPHONE;
    const formulaire = h('div', {
      class: 'acompte-formulaire', role: 'group', 'aria-label': index >= 0 ? `Modifier l’acompte ${index + 1}` : 'Nouvel acompte', tabindex: telephone ? '-1' : null, dataset: { zone: 'acompte-formulaire' },
      onkeydown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
        else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); valider(); }
      },
    },
    h('div', { class: 'acompte-valeurs' },
      h('div', { class: 'bloc-champ' }, etiquette(`${pref}-valeur`, 'Valeur'), valeur),
      h('div', { class: 'bloc-champ' }, etiquette(`${pref}-type`, 'Type'), type)),
    h('div', { class: 'bloc-champ' }, etiquette(`${pref}-moment`, 'Moment'), moment),
    blocTexte, erreur,
    h('div', { class: 'acompte-actions' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'annuler-acompte' }, onclick: fermer }, 'Annuler'), enregistrer));
    queueMicrotask(() => (telephone ? formulaire : valeur).focus());
    return formulaire;
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
    const totaux = h('aside', { class: 'panneau-total', 'aria-label': 'Total du devis', dataset: { zone: 'total' } },
      h('dl', { class: 'liste-totaux' },
        h('div', { class: 'ligne-total ligne-ajustement', dataset: { ligne: 'ajustement' } }, h('dt', {}, 'Ajustement global'),
          h('dd', {}, (ref.lienAjustement = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'definir-ajustement' }, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (ev) => ouvrirAjustement(ev.currentTarget) }, 'Marge et ajustement')), h('span', { dataset: { total: 'ajustement' } }))),
        ligneT('brut', 'Total brut HT'),
        h('div', { class: 'ligne-total ligne-remise' }, h('dt', {}, 'Remise client'), h('dd', {}, h('div', { class: 'ligne-champs' }, valeurRemise, typeRemise), h('span', { dataset: { total: 'remise' } }))),
        ligneT('ht', 'Total net HT'),
        ligneT('tva', 'TVA'),
        ligneT('ttc', 'Total TTC')),
      ref.erreurRemise,
      (ref.avertissementsTotal = h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements' } })),
      h('p', { class: 'texte-discret' }, 'Primes : bientôt.'));
    const net = h('div', { class: 'bandeau-net', dataset: { ligne: 'net' } }, h('span', { class: 'bandeau-net-titre' }, 'NET À PAYER'), h('span', { class: 'bandeau-net-montant', dataset: { total: 'net' } }));
    const taux = h('table', { class: 'tableau-tva' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Taux TVA'), h('th', { scope: 'col', class: 'd' }, 'Base HT'), h('th', { scope: 'col', class: 'd' }, 'Total'))), ref.tva);
    return [totaux, net, taux];
  }

  let majPropresActuel = null;
  /** « Appliquer à toutes les lignes » : après confirmation (qui dit combien de lignes changent), les lignes et sections à marge propre suivent la marge du devis. Rien n'est supprimé : prix d'achat, quantités et lignes restent. */
  async function appliquerMargeATouteLesLignes() {
    if (lecture) return;
    const { sections, nombre } = Ed.appliquerMargeDuDevisAuxLignes(travail);
    if (nombre === 0) return;
    const ok = await dialogue({
      titre: 'Appliquer la marge du devis ?',
      contenu: h('p', {}, `${nombre} ${nombre > 1 ? 'lignes vont' : 'ligne va'} passer à la marge du devis (${saisieNombre(travail.marge ?? 0)} %). Leur marge propre ne sera plus utilisée ; les prix d’achat et les quantités ne changent pas.`),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Appliquer', valeur: true, style: 'principal' }],
    });
    // La confirmation ferme la fenêtre « Marge et ajustement » (un clic hors de la fenêtre) : on la rouvre, avec le compte à jour.
    if (ok === true) { appliquer(sections); majPrixAffiches(); }
    if (ref.lienAjustement?.isConnected) ouvrirAjustement(ref.lienAjustement);
  }

  // La fenêtre « Marge et ajustement » : trois blocs titrés, toujours ouverts, l'un sous l'autre (Ajustement global, Marge du devis, Remise client). Rien ne s'ouvre ni ne se ferme.
  function ouvrirAjustement(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => {
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
        oninput: (e) => { const vide = e.target.value.trim() === ''; const v = vide ? 0 : Ed.lireSaisie(e.target.value); e.target.classList.toggle('invalide', v === null); if (v !== null) { changer({ marge: v }); majPrixAffiches(); majPropresActuel?.(); const autre = racine.querySelector('[data-champ="marge"]'); if (autre) autre.value = e.target.value; } } });
      // Lignes qui gardent leur propre marge (article du catalogue, prix de vente modifié, ouvrage) : la marge du devis ne les touche pas. Aucune ligne concernée : ni phrase, ni bouton.
      const propres = h('p', { class: 'texte-discret', dataset: { zone: 'marges-propres' }, hidden: true });
      const boutonPropres = h('button', { type: 'button', class: 'bouton bouton-secondaire', hidden: true, dataset: { action: 'appliquer-marge-lignes' }, onclick: () => { fermer(); appliquerMargeATouteLesLignes(); } } /* la fenêtre se ferme avant la confirmation : sur téléphone elle la cacherait */, 'Appliquer à toutes les lignes');
      const majPropres = () => {
        const n = Ed.nombreLignesAvecMargePropre(travail);
        propres.hidden = n === 0; boutonPropres.hidden = n === 0;
        propres.textContent = n === 0 ? '' : (n > 1 ? `${n} lignes ont leur propre marge : la marge du devis ne les touche pas.` : '1 ligne a sa propre marge : la marge du devis ne la touche pas.');
      };
      majPropresActuel = majPropres;
      majPropres();
      const zoneMarge = h('section', { class: 'ajust-zone', dataset: { zone: 'marge-devis' }, 'aria-labelledby': 'ajust-titre-marge' },
        h('h3', { class: 'ajust-titre', id: 'ajust-titre-marge' }, 'Marge du devis'),
        h('div', { class: 'ajust-champ' }, h('label', { for: 'ajust-marge' }, 'Marge (%)'), margeChamp),
        h('p', { class: 'texte-discret' }, 'Elle s’applique aux lignes qui n’ont pas leur propre marge. Le client ne la voit jamais.'),
        propres, boutonPropres);
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
    if (ref.lienAjustement) ref.lienAjustement.textContent = ajustementActif(travail) ? `Marge et ajustement ${signe(aj.pourcentage)}${saisieNombre(Math.abs(aj.pourcentage))} %` : 'Marge et ajustement';
    mettre('ajustement', ajustementActif(travail) ? `${signe(aj.montant)}${euros(Math.abs(aj.montant))}` : '');
    mettre('brut', euros(t.totalBrutHt));
    mettre('remise', t.remiseHt > 0 ? `− ${euros(t.remiseHt)}` : '');
    mettre('ht', euros(t.totalHt));
    mettre('tva', euros(t.tva));
    mettre('ttc', euros(t.ttc));
    majTitreCompact();
    mettre('reste', t.resteAFacturerTtc === null ? '' : euros(t.resteAFacturerTtc));
    majReste();
    majMontantsAcomptes();
    mettre('net', euros(t.netAPayer));
    remplir(ref.tva, t.tvaParTaux.map((x) => h('tr', { dataset: { ligne: `tva-${x.taux}` } }, h('td', {}, `${saisieNombre(x.taux)} %`), h('td', { class: 'd' }, euros(x.baseHT)), h('td', { class: 'd', dataset: { total: `tva-${x.taux}` } }, euros(x.montant)))));
    if (t.mentions.length && !t.tvaParTaux.length) remplir(ref.tva, h('tr', {}, h('td', { colspan: 3, class: 'texte-discret' }, t.mentions.join(' · '))));
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
      if (marge && trouve) marge.textContent = `Achat ${euros(trouve.ligne.prixAchat)} · Marge de ce produit ${saisieNombre(Math.round(margeEffective({ devis: travail, section: trouve.section, ligne: trouve.ligne })))} % · Vente ${euros(base)}`;
    }
    for (const s of t.sections) {
      const el = racine.querySelector(`[data-sous-total="${CSS.escape(s.id)}"]`);
      if (el) el.textContent = euros(s.sousTotalHT);
    }
    // Message de saisie de la remise lu dans les règles de finalisation : jamais refait ici (celui des acomptes est sous le formulaire de l'acompte).
    const messages = erreursFinalisation(travail, { emetteur: D.etat.reglages.entreprise, aujourdhui: CRM.ctx().aujourdhui });
    const montrer = (el, motif) => { if (!el) return; const m = messages.filter((x) => motif.test(x)); el.hidden = !m.length; el.textContent = m.join(' '); };
    montrer(ref.erreurRemise, /remise/i);
    // Avertissements non bloquants.
    const avis = lecture ? [] : Ed.avertissements(travail);
    remplir(ref.avertissementsTotal, avis.map((a) => h('li', { dataset: { avertissement: a.code } }, icone('triangle-alert', { taille: 14 }), ' ', a.message)));
  }

  function majPrixAffiches() { majTotaux(); majResultats(); }

  // ------------------------------------------------ finaliser
  async function listeErreurs(titre, erreurs) {
    const versEntreprise = erreurs.some(estErreurEntreprise) ? [{ libelle: 'Ouvrir Mon entreprise', valeur: 'entreprise' }] : []; // le bouton n'existe que pour une erreur qui se règle là
    const choix = await dialogue({ titre, contenu: h('ul', { class: 'liste-erreurs-devis', dataset: { zone: 'erreurs-finalisation' } }, erreurs.map((e) => h('li', {}, e))), boutons: [...versEntreprise, { libelle: 'Compris', valeur: true, style: 'principal' }] });
    if (choix === 'entreprise') naviguer(ROUTE_MON_ENTREPRISE); // finaliser() a déjà enregistré ; sinon la garde de sortie du routeur propose Rester / Quitter / Enregistrer et quitter
  }

  async function finaliser() {
    clearTimeout(minuteur);
    if (!(await sauver())) { toast(messageEnreg || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 }); return; }
    const locales = erreursFinalisation(travail, { emetteur: D.etat.reglages.entreprise, aujourdhui: CRM.ctx().aujourdhui }); // l'affaire manquante y est (même phrase que la fonction du serveur et l'assistant)
    // L'affaire manque : comme tout champ obligatoire, le champ s'affiche en rouge avec son message et reçoit le focus (créer l'affaire se fait dans sa liste). Seule l'affaire manque : pas de fenêtre.
    const sansAffaire = locales.includes(MESSAGE_AFFAIRE_MANQUANTE);
    if (sansAffaire) montrerAffaireManquante();
    if (locales.length === 1 && sansAffaire) return;
    if (locales.length) { await listeErreurs('Ce devis ne peut pas encore être finalisé', locales); if (sansAffaire) { ref.champAffaire?.focus?.(); ref.champAffaire?.fermer?.(); } return; }
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
