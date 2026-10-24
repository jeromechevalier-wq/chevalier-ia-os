// Éditeur de devis (route devis/editeur, devis/editeur/<id>) : choisir l'affaire, remplir le chantier, ajouter des lignes (Bordereau, ligne libre, section, sous-section, texte),
// régler la remise et l'acompte, voir le total en direct, l'aperçu, puis finaliser. Un brouillon s'enregistre tout seul (écriture directe, plans de brouillon.js) ;
// finaliser passe par la fonction du serveur. Aucune règle ni aucun calcul ici : les fonctions pures sont dans editeur-logique.js et logique.js.
// Un devis qui n'est plus un brouillon s'ouvre en lecture seule (aperçu + totaux) avec l'invitation à créer une variante.
import { h, icone, remplir, dialogue, toast, confirmer, ouvrirMenu } from '../../os/ui.js';
import { naviguer, ajouterGardeSortie } from '../../os/router.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { etatVide, planifier } from '../crm/composants.js';
import { adressesDe } from '../crm/logique.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import { arbreFamilles, cheminFamille } from './familles.js';
import * as Ed from './editeur-logique.js';
import {
  totauxDevis, erreursFinalisation, erreursChantier, STATUTS_DEVIS, MODES_MARGE, UNITES_DUREE, MOMENTS_ACOMPTE, transitionPossible, TAUX_TVA_DEFAUT, niveauSection, dureeEnTexte,
  affichageDe, ajustementActif, valeursAjustement, margeEffective, vueClient,
} from './logique.js';
import { formaterMontant } from './document.js';
import { menuUnite } from './menu-unite.js';
import { ouvrirFenetreMenu, contenuMenu, caseMenu, donnees as donneesDe } from './menu-devis.js';
import { ouvrirBibliotheque } from './bibliotheque.js';
import { imprimerDevis, htmlDuDevis } from './imprimer.js';
import { editeurOuvrage } from './editeur-ouvrage.js';
import * as O from './ouvrages.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant.';
const ERREUR_LECTURE = 'Les devis n’ont pas pu être lus. Vérifie ta connexion puis recharge la page.';
const MESSAGE_INTROUVABLE = 'Ce devis est introuvable : il a peut-être été retiré, ou le lien n’est pas le bon.';
const MESSAGE_LECTURE_SEULE = 'Ce devis n’est plus un brouillon : on ne peut plus le modifier. Pour le corriger, crée une variante (une nouvelle version qui garde le même numéro).';
const DELAI_INTROUVABLE_MS = 4000;
const DELAI_ENREGISTREMENT_MS = 900;

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');
const saisieNombre = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : '');
const saisiePrix = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '');
const nouvelId = () => CRM.ctx().nouvelId('devis_devis');
const libelleStatut = (id) => STATUTS_DEVIS.find((s) => s.id === id)?.libelle ?? '';

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
/** Document complet du devis (le même pour l'aperçu, l'impression de l'éditeur et celle de la fiche). */
export const htmlImpressionDevis = (d) => htmlDuDevis(d, { clientNom: clientDuDevis(d) || null, client: infosClientDuDevis(d) });
/** Imprime le devis (ou l'enregistre en PDF) sans serveur. À appeler directement dans un clic. Rend { ok, erreur }. */
export function imprimerLeDevis(d) { return imprimerDevis({ html: htmlImpressionDevis(d) }); }
const affaires = () => CRM.etat.affaires.filter((a) => !a.archive).sort((a, b) => String(a.titre).localeCompare(String(b.titre), 'fr'));
const libelleAffaire = (a) => {
  const c = clientsDeAffaire(a)[0]?.nom;
  return c ? `${a.titre} · ${c}` : a.titre;
};

// ---------------------------------------------------------------- actions partagées avec la liste
function attendreDevis(id, ms = 4000) {
  return new Promise((resoudre) => {
    if (D.devisParId(id)) { resoudre(true); return; }
    let arret = () => {};
    const fin = setTimeout(() => { arret(); resoudre(false); }, ms);
    arret = D.surChangement(() => { if (D.devisParId(id)) { clearTimeout(fin); arret(); resoudre(true); } });
  });
}

/** Crée un brouillon qui copie un devis (même affaire, mêmes lignes) et ouvre l'éditeur. */
export async function dupliquerDevis(source) {
  try {
    const contenu = Ed.copieDeDevis(source, nouvelId);
    const r = await D.creerBrouillon({
      affaireId: source.affaireId, organisationId: source.organisationId, personneId: source.personneId, adresses: source.adresses,
      destinataires: source.destinataires, copie: source.copie, modeMarge: source.modeMarge, marge: source.marge, tauxTvaDefaut: source.tauxTvaDefaut,
    });
    if (!r.id) throw new Error(Object.values(r.erreurs)[0] || ERREUR_ECRITURE);
    let copie = false;
    try {
      if (await attendreDevis(r.id)) { const m = await D.modifierBrouillon(r.id, contenu); copie = Object.keys(m.erreurs).length === 0; }
    } catch (e) { console.warn(e); }
    // Le brouillon existe même si la copie du contenu a échoué : on l'ouvre et on le dit.
    if (!copie) toast('Le brouillon est créé, mais son contenu n’a pas pu être copié : ajoute les lignes à la main, ou réessaie depuis la liste.', { type: 'erreur', duree: 10000 });
    naviguer(`devis/editeur/${r.id}`);
  } catch (e) {
    console.warn(e);
    toast(e?.message || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 });
  }
}

/** Crée le brouillon suivant d'un devis finalisé, envoyé ou refusé (fonction du serveur) et ouvre l'éditeur. */
export async function creerVariante(d) {
  try {
    const r = await D.nouvelleVersion(d.id);
    if (r?.ok === false || !r?.devisId) throw new Error('La variante n’a pas pu être créée.');
    naviguer(`devis/editeur/${r.devisId}`);
  } catch (e) {
    console.warn(e);
    toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
  }
}

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
export function rendreEditeurDevis(conteneur, id) {
  if (!id) return rendreCreation(conteneur);

  const racine = h('div', { class: 'page page-devis page-editeur-devis', dataset: { devis: id } });
  conteneur.append(racine);

  let travail = null; // copie de travail du devis (ce qui est à l'écran)
  let enregistre = null; // ce qui est enregistré (pour savoir s'il y a des changements)
  let lecture = false;
  let etatEnreg = 'enregistre';
  let messageEnreg = '';
  let enCours = null;
  let minuteur = null;
  let onglet = 'edition';
  let pointInsertion = null; // identifiant sous lequel (ou au-dessus duquel, voir sensInsertion) s'ajoutera le prochain article du Bordereau
  let sensInsertion = 'apres'; // 'apres' (en dessous) ou 'avant' (au-dessus)
  let rechercheBordereau = '';
  let filtreFamille = '';
  let moment = Date.now();
  let conflit = false; // le devis a changé ailleurs : rien n'est écrasé tant que l'utilisateur n'a pas tranché
  let verrou = false; // finalisation en cours : plus aucun enregistrement automatique
  let enVol = null; // ce qu'un enregistrement en cours est en train d'écrire
  let montre = false; // la page est construite
  let arretGarde = () => {};
  let delaiIntrouvable = null;
  const ref = {}; // éléments à mettre à jour sans tout redessiner
  const replies = new Set(); // sections et sous-sections repliées (à l'écran seulement : rien n'est enregistré)
  let bibliotheque = null; // le panneau « Bibliothèque » ouvert, ou null
  let ligneActive = null; // la dernière ligne où l'utilisateur a cliqué ou écrit : la Bibliothèque ajoute à la fin de sa section
  const affichage = () => affichageDe(travail);

  const devisCourant = () => D.devisParId(id);

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
    lecture = Ed.estLectureSeule(d);
    travail = { ...d, ...Ed.champsAEnregistrer(d) };
    enregistre = { ...d, ...Ed.champsAEnregistrer(d) };
    etatEnreg = 'enregistre';
    construire();
  }

  // Les mises à jour du serveur : lecture seule dès que le devis n'est plus un brouillon ; en lecture seule on suit toujours la dernière version.
  function surDonnees() {
    if (!montre) { charger(); return; }
    const d = devisCourant();
    if (!d) return;
    if (!lecture && d.statut === 'brouillon' && !conflit && !Ed.memeContenu(d, enregistre) && !(enVol && Ed.memeContenu(d, enVol))) {
      conflit = true;
      clearTimeout(minuteur);
      if (ref.bandeauConflit) ref.bandeauConflit.hidden = false;
      return;
    }
    if (!lecture && d.statut !== 'brouillon') { clearTimeout(minuteur); lecture = true; travail = { ...d, ...Ed.champsAEnregistrer(d) }; enregistre = structuredClone(travail); construire(); return; }
    if (lecture) { travail = { ...d, ...Ed.champsAEnregistrer(d) }; enregistre = structuredClone(travail); construire(); }
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

  // ------------------------------------------------ changements
  function changer(patch) { Object.assign(travail, patch); marquerModifie(); }
  function appliquer(sections, { focus = null, champ = 'libelle' } = {}) {
    travail.sections = sections;
    rendreLignes();
    marquerModifie();
    if (focus) {
      const champFocus = racine.querySelector(`tr[data-id="${focus}"] [data-champ="${champ}"]`);
      champFocus?.focus();
      champFocus?.scrollIntoView?.({ block: 'nearest' });
    }
  }
  function ajouterLigne(element, { champ = 'libelle' } = {}) {
    const cible = pointInsertion && Ed.aplatir(travail.sections).some((x) => x.id === pointInsertion) ? pointInsertion : null;
    const avant = sensInsertion === 'avant' && cible;
    pointInsertion = null;
    sensInsertion = 'apres';
    majPointInsertion();
    appliquer(avant ? Ed.ajouterAvant(travail.sections, element, cible, nouvelId()) : Ed.ajouterElement(travail.sections, element, cible, nouvelId()), { focus: element.id, champ });
  }
  const changerLigne = (idLigne, patch) => { travail.sections = Ed.majElement(travail.sections, idLigne, patch); marquerModifie(); };

  // ------------------------------------------------ construction de la page
  // Disposition d'un devis papier (barre d'actions fixe, en-tête à deux colonnes, tableau à trois niveaux, boutons d'ajout, bas de page) : css/devis.css, bloc « Éditeur de devis ».
  function construire() {
    montre = true;
    for (const k of Object.keys(ref)) delete ref[k];
    const d = travail;
    ref.titre = h('h1', { class: 'titre-barre-devis' }, '');
    ref.pastille = h('span', { class: 'pastille-statut', dataset: { valeur: 'statut' } });
    ref.indicateur = h('span', { class: 'indicateur-enregistrement', role: 'status', 'aria-live': 'polite', dataset: { valeur: 'enregistrement' } });
    const onglets = h('div', { class: 'onglets-editeur', role: 'tablist', 'aria-label': 'Affichage du devis', hidden: lecture },
      [['edition', 'Édition'], ['apercu', 'Prévisualisation']].map(([cle, libelle]) => h('button', {
        type: 'button', class: 'onglet-editeur', role: 'tab', dataset: { onglet: cle }, onclick: () => choisirOnglet(cle),
      }, libelle)));
    ref.onglets = onglets;
    const barre = h('header', { class: 'barre-devis' },
      h('div', { class: 'barre-devis-gauche' }, h('div', { class: 'titre-devis' }, ref.titre, ref.pastille, ref.indicateur), onglets),
      h('div', { class: 'barre-devis-droite' }, lecture ? boutonsLecture(d) : boutonsEdition()));
    ref.bandeauConflit = h('p', { class: 'bandeau-lecture-seule', role: 'alert', hidden: !conflit, dataset: { valeur: 'conflit' } }, 'Ce devis a été modifié ailleurs. Tes changements ne sont pas enregistrés tant que tu n’as pas rechargé. ',
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'recharger' }, onclick: () => { conflit = false; charger(); } }, 'Recharger'));
    ref.erreurEnreg = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'enregistrement' }, hidden: true });
    ref.panneauEdition = h('div', { class: 'editeur-edition', dataset: { panneau: 'edition' } },
      lecture
        ? h('article', { class: 'document-devis' }, blocTotaux())
        : [(ref.marges = blocMarges()), rangeeBibliotheque(), h('article', { class: 'document-devis' }, enteteDocument(), blocLignes(), basDePage())]);
    ref.panneauApercu = h('div', { class: 'editeur-apercu', dataset: { panneau: 'apercu' } });
    bibliotheque?.fermer();
    bibliotheque = null;
    racine.classList.toggle('devis-lecture-seule', lecture);
    remplir(racine, barre, lecture ? h('p', { class: 'bandeau-lecture-seule', dataset: { valeur: 'lecture-seule' } }, MESSAGE_LECTURE_SEULE) : ref.bandeauConflit, ref.erreurEnreg, ref.panneauEdition, ref.panneauApercu);
    if (!lecture) { rendreLignes(); majResultats(); }
    arretGarde();
    arretGarde = ajouterGardeSortie(
      () => racine.isConnected && Ed.sortieAConfirmer({ enregistre, courant: travail, enCours: Boolean(enCours), lectureSeule: lecture }),
      { message: 'Les changements de ce devis ne sont pas enregistrés.', enregistrer: sauver, messageEchec: 'L’enregistrement a échoué : tu restes sur le devis.' },
    );
    choisirOnglet(lecture ? 'apercu' : onglet);
    majEntete();
    majTotaux();
  }

  function boutonsLecture(d) {
    return [
      transitionPossible(d.statut, 'nouvelle_version') ? h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'creer-variante' }, onclick: () => creerVariante(d) }, icone('pencil', { taille: 16 }), 'Créer une variante') : null,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'dupliquer' }, onclick: () => dupliquerDevis(d) }, icone('copy', { taille: 16 }), 'Dupliquer'),
      h('a', { class: 'bouton bouton-secondaire', href: '#/devis/liste', dataset: { action: 'fermer-lecture' } }, 'Fermer'),
    ];
  }

  // Barre d'actions : Options (menu à cases à cocher), Annuler, Enregistrer, Finaliser (bouton à menu). Sur téléphone, Options passe dans le bouton « … ».
  function boutonsEdition() {
    ref.boutonOptions = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-options', dataset: { action: 'options' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (ev) => ouvrirOptions(ev.currentTarget) }, 'Options', icone('chevron-down', { taille: 14 }));
    return [
      ref.boutonOptions,
      h('button', { type: 'button', class: 'bouton-icone bouton-plus-actions', dataset: { action: 'plus-actions' }, 'aria-haspopup': 'menu', 'aria-label': 'Autres actions', onclick: (ev) => { const ancre = ev.currentTarget; ouvrirMenu(ancre, [{ libelle: 'Options', icone: 'settings', action: () => ouvrirOptions(ancre) }]); } }, icone('ellipsis', { taille: 16 })),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'annuler' }, onclick: () => naviguer('devis/liste') }, 'Annuler'),
      (ref.boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'enregistrer' }, onclick: async () => { const ok = await sauver(); toast(ok ? 'Devis enregistré' : messageEnreg || ERREUR_ECRITURE, { type: ok ? 'info' : 'erreur', duree: ok ? 2500 : 8000 }); } })),
      h('div', { class: 'bouton-groupe' },
        h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'finaliser' }, onclick: () => finaliser() }, icone('check', { taille: 16 }), 'Finaliser'),
        h('button', { type: 'button', class: 'bouton bouton-principal bouton-groupe-menu', dataset: { action: 'menu-finaliser' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Autres façons de finaliser', onclick: (ev) => ouvrirMenuFinaliser(ev.currentTarget) }, icone('chevron-down', { taille: 14 }))),
    ];
  }

  // Les trois groupes de cases du menu « Options » : Édition, Document, Clients (enregistrées dans `devis.affichage`), puis Import / Export (pas encore là).
  function basculerAffichage(cle, valeur) {
    travail.affichage = { ...affichageDe(travail), [cle]: valeur };
    marquerModifie();
    appliquerAffichage();
  }
  function appliquerAffichage() {
    if (!ref.corpsLignes) return;
    rendreEntetesTableau();
    rendreLignes();
    majMarges();
    if (onglet === 'apercu') rendreApercu();
  }
  function ouvrirOptions(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => {
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
        { noeud: bientot('Cacher l’annexe photos') }, { noeud: bientot('Cacher le reste à facturer') },
        { separateur: true }, { titre: 'Clients' },
        { noeud: c('Afficher le téléphone', 'afficherTelephone') }, { noeud: c('Afficher l’e-mail', 'afficherEmail') },
        { noeud: c('Afficher le numéro de TVA', 'afficherNumeroTva') }, { noeud: c('Afficher le SIREN', 'afficherSiren') },
        { separateur: true }, { titre: 'Import / Export' },
        { libelle: 'Importer un devis', bientot: true, cle: 'importer' }, { libelle: 'Exporter des lignes', bientot: true, cle: 'exporter' },
      ], fermer);
    }, { classe: 'menu-devis-options', nom: 'Options du devis' });
  }

  function ouvrirMenuFinaliser(ancre) {
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu([
      { libelle: 'Finaliser', icone: 'check', cle: 'finaliser-seul', action: () => finaliser() },
      { libelle: 'Finaliser et imprimer', icone: 'file-text', cle: 'finaliser-imprimer', action: () => finaliser({ imprimer: true }) },
      { libelle: 'Finaliser et télécharger', icone: 'download', cle: 'finaliser-telecharger', bientot: true },
      { libelle: 'Finaliser et envoyer par e-mail', icone: 'mail', cle: 'finaliser-envoyer', bientot: true },
    ], fermer), { nom: 'Finaliser' });
  }

  function choisirOnglet(cle) {
    onglet = cle;
    ref.onglets?.querySelectorAll('.onglet-editeur').forEach((b) => { const actif = b.dataset.onglet === cle; b.classList.toggle('actif', actif); b.setAttribute('aria-selected', String(actif)); });
    // En lecture seule, l'aperçu et les totaux restent visibles ensemble (rien à éditer).
    ref.panneauEdition.hidden = cle === 'apercu' && !lecture;
    ref.panneauApercu.hidden = cle !== 'apercu';
    if (cle === 'apercu') rendreApercu();
  }

  function rendreApercu() {
    let corps;
    let html = '';
    try {
      html = htmlImpressionDevis(travail);
      // Le document est pur (aucun script) : « allow-same-origin » laisse l'application lancer son impression ; « allow-modals » ouvre la boîte d'impression.
      corps = h('iframe', { class: 'apercu-devis', title: `Aperçu du devis ${travail.numero ?? ''}`.trim(), sandbox: 'allow-same-origin allow-modals', srcdoc: html, dataset: { zone: 'apercu' } });
    } catch (e) {
      console.warn(e);
      corps = h('p', { class: 'erreur', role: 'alert' }, 'L’aperçu n’a pas pu être préparé : le devis est incomplet. Termine-le, puis rouvre l’aperçu.');
    }
    ref.iframeApercu = corps.tagName === 'IFRAME' ? corps : null;
    ref.htmlApercu = html;
    const imprimer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'imprimer' }, disabled: !html,
      onclick: () => imprimerDepuisApercu() }, icone('file-text', { taille: 16 }), 'Imprimer / Enregistrer en PDF');
    remplir(ref.panneauApercu, h('div', { class: 'barre-apercu' }, h('p', { class: 'texte-discret' }, 'Pour un PDF : choisis « Enregistrer au format PDF » et décoche « En-têtes et pieds de page ».'), imprimer), corps);
  }

  /** Clic sur « Imprimer / Enregistrer en PDF » : aucun `await` avant (le navigateur bloquerait l'onglet de repli de Safari). */
  function imprimerDepuisApercu(options = {}) {
    const r = imprimerDevis({ iframe: ref.iframeApercu, html: ref.htmlApercu, ...options });
    if (r.erreur) toast(r.erreur, { type: 'erreur', duree: 8000 });
    return r;
  }

  // ------------------------------------------------ barre du haut
  function majEntete() {
    if (!ref.titre) return;
    const d = travail;
    ref.titre.textContent = d.numero ? `Devis ${d.numero}${d.version > 1 ? ` · v${d.version}` : ''}` : 'Brouillon';
    ref.pastille.textContent = libelleStatut(d.statut);
    ref.pastille.dataset.statut = d.statut;
    ref.pastille.hidden = d.statut === 'brouillon' && !d.numero; // le titre dit déjà « Brouillon »
    if (ref.numeroDocument) ref.numeroDocument.textContent = d.numero ? `Devis n° ${d.numero}${d.version > 1 ? ` · v${d.version}` : ''}` : 'Devis n° Brouillon';
    if (lecture) { ref.indicateur.textContent = ''; return; }
    ref.indicateur.textContent = Ed.libelleEnregistrement(etatEnreg);
    ref.indicateur.dataset.etat = etatEnreg;
    ref.erreurEnreg.hidden = etatEnreg !== 'erreur';
    ref.erreurEnreg.textContent = etatEnreg === 'erreur' ? messageEnreg : '';
    const manquants = Ed.champsManquants(d).length;
    const modifie = etatEnreg !== 'enregistre';
    ref.boutonEnregistrer.disabled = !modifie && !manquants;
    ref.boutonEnregistrer.classList.toggle('bouton-principal', modifie);
    ref.boutonEnregistrer.classList.toggle('bouton-secondaire', !modifie);
    remplir(ref.boutonEnregistrer, 'Enregistrer', manquants ? h('span', { class: 'compteur-manquants', dataset: { valeur: 'manquants' }, title: 'Champs obligatoires à remplir', 'aria-label': `${manquants} champ obligatoire à remplir` }, String(manquants)) : null);
    if (ref.selectAffaire) ref.selectAffaire.classList.toggle('invalide', !d.affaireId);
    if (ref.erreurAffaire) { ref.erreurAffaire.hidden = Boolean(d.affaireId); }
  }

  // ------------------------------------------------ marges du devis : visibles seulement avec la case « Afficher le calcul des marges » du menu Options
  const majMarges = () => { if (ref.marges) ref.marges.hidden = !affichage().afficherMarges; racine.dataset.marges = affichage().afficherMarges ? 'oui' : 'non'; };

  function blocMarges() {
    const d = travail;
    const marge = h('input', { class: 'champ champ-court', id: 'devis-marge', type: 'text', inputmode: 'decimal', value: saisieNombre(d.marge), dataset: { champ: 'marge' }, 'aria-label': 'Marge du devis en pourcent',
      oninput: (e) => { const vide = e.target.value.trim() === ''; const v = vide ? 0 : Ed.lireSaisie(e.target.value); e.target.classList.toggle('invalide', v === null); if (v !== null) { changer({ marge: v }); majPrixAffiches(); } } });
    const mode = h('select', { class: 'champ', id: 'devis-mode', dataset: { champ: 'mode-marge' }, 'aria-label': 'Mode de calcul de la marge', onchange: (e) => { changer({ modeMarge: e.target.value }); majPrixAffiches(); } },
      MODES_MARGE.map((m) => h('option', { value: m.id, selected: d.modeMarge === m.id }, m.libelle)));
    return h('section', { class: 'carte-editeur panneau-options', id: 'options-devis', hidden: !affichage().afficherMarges, dataset: { zone: 'marges' } },
      h('h2', { class: 'titre-bloc' }, 'Marges du devis'),
      h('div', { class: 'grille-champs' },
        champ('Marge du devis (%)', h('div', { class: 'ligne-champs' }, marge), { id: 'devis-marge', aide: h('p', { class: 'texte-discret' }, 'Elle s’applique aux lignes qui n’ont pas leur propre marge. Le client ne la voit jamais.') }),
        champ('Mode de calcul', mode, { id: 'devis-mode' })));
  }

  // ------------------------------------------------ Bibliothèque : le bouton sous la barre, le panneau à droite
  function rangeeBibliotheque() {
    ref.boutonBibliotheque = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'bibliotheque' }, 'aria-expanded': 'false', 'aria-controls': 'bibliotheque-devis',
      onclick: () => (bibliotheque?.ouvert() ? bibliotheque.fermer() : ouvrirLaBibliotheque()) }, icone('list', { taille: 16 }), 'Bibliothèque');
    return h('div', { class: 'rangee-bibliotheque' }, ref.boutonBibliotheque);
  }
  function ouvrirLaBibliotheque() {
    bibliotheque = ouvrirBibliotheque(racine, {
      articles: () => D.etat.articles,
      familles: () => D.etat.familles,
      prixAffiche: (a) => {
        if (a.type === A.TYPE_TEXTE) return '';
        const pv = Ed.prixVenteAffiche(travail, {}, Ed.ligneDepuisArticle(a, { id: 'essai', articles: D.etat.articles, devis: travail }));
        return pv === null ? '' : `${euros(pv)} / ${a.unite || 'u'}`;
      },
      ajouter: (choisis) => {
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
  function dateDuDevis() {
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
    ref.adresseAuto = clientsDeAffaire(CRM.affaire(d.affaireId)).find((x) => (d.organisationId ? x.fiche.id === d.organisationId : x.fiche.id === d.personneId))?.adresse ?? '';
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
      h('p', { class: 'ligne-entete' }, `En date du ${dateDuDevis()}`),
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
    const destinataire = h('input', {
      class: 'champ', id: 'devis-destinataire', type: 'email', inputmode: 'email', autocomplete: 'off', value: Ed.emailsDeFiche({ emails: d.destinataires })[0] ?? '', dataset: { champ: 'destinataire' },
      oninput: (e) => changer({ destinataires: e.target.value.trim() ? [e.target.value.trim()] : [] }),
    });
    const droite = h('div', { class: 'entete-droite' },
      champ('Client', ref.selectClient, { id: 'devis-client' }),
      champ('Affaire *', ref.selectAffaire, { id: 'devis-affaire', aide: ref.erreurAffaire }),
      champ('Adresse du chantier', ref.champAdresse, { id: 'devis-chantier-adresse' }),
      champ('E-mail du destinataire', destinataire, { id: 'devis-destinataire' }));
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
  }

  function changerAffaire(valeur) {
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
    const [type, cid] = valeur.split(':');
    const c = clientsDeAffaire(CRM.affaire(travail.affaireId)).find((x) => x.type === type && x.fiche.id === cid) ?? null;
    Object.assign(travail, { organisationId: type === 'organisation' ? cid : null, personneId: type === 'personne' ? cid : null });
    appliquerClient(c, false);
  }
  /** Reprend l'adresse et le premier e-mail du client, sans écraser une adresse de chantier ou un e-mail que l'utilisateur a écrits à la main. */
  function appliquerClient(c, remplacerEmail) {
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
    if (c && remplacerEmail) {
      const mail = Ed.emailsDeFiche(c.fiche)[0];
      if (mail && !(travail.destinataires ?? []).length) { travail.destinataires = [mail]; const champ_ = racine.querySelector('[data-champ="destinataire"]'); if (champ_) champ_.value = mail; }
    }
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
      class: 'champ', type: 'search', placeholder: 'Libellé, code ou référence', autocomplete: 'off', 'aria-label': 'Rechercher dans le Bordereau', dataset: { champ: 'recherche-bordereau' },
      oninput: (e) => { rechercheBordereau = e.target.value; majResultats(); },
    });
    ref.filtreFamille = h('select', { class: 'champ', 'aria-label': 'Famille', dataset: { champ: 'filtre-famille' }, onchange: (e) => { filtreFamille = e.target.value; majResultats(); } },
      h('option', { value: '' }, 'Toutes les familles'), arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [f, ...enfants]).filter((f) => f.actif).map((f) => h('option', { value: f.id }, cheminFamille(D.etat.familles, f.id))), h('option', { value: 'sans_famille' }, 'Sans famille'));
    ref.resultats = h('ul', { class: 'resultats-bordereau', dataset: { zone: 'resultats' } });
    ref.pointInsertion = h('p', { class: 'texte-discret', dataset: { valeur: 'point-insertion' }, hidden: true });
    ref.panneauRecherche = h('div', { class: 'recherche-bordereau', hidden: true, dataset: { zone: 'recherche' } },
      h('div', { class: 'ligne-champs' }, ref.rechercheBordereau, ref.filtreFamille,
        h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'fermer-recherche' }, onclick: () => { ref.panneauRecherche.hidden = true; pointInsertion = null; majPointInsertion(); } }, 'Fermer')),
      ref.pointInsertion, ref.resultats);
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
        // Le saut de page se règle déjà par la case « Nouvelle page avant » d'une section ; un élément « Saut de page » à part viendra ensuite.
        bouton('Saut de page', 'ajouter-saut', () => {}, { desactive: true, titre: 'Bientôt disponible : en attendant, coche « Nouvelle page avant » sur une section.' })));
    return [ref.vide, ref.zoneTableau, barre, ref.panneauRecherche];
  }

  /** Ouvre la recherche dans le Bordereau, déjà filtrée sur une famille (« + Fourniture » → les fournitures). */
  function ouvrirRecherche(familleId) {
    filtreFamille = familleId && D.etat.familles.some((f) => f.id === familleId && f.actif !== false) ? familleId : '';
    ref.filtreFamille.value = filtreFamille;
    ref.panneauRecherche.hidden = false;
    majResultats();
    ref.rechercheBordereau.focus();
    ref.panneauRecherche.scrollIntoView?.({ block: 'nearest' });
  }

  function majPointInsertion() {
    if (!ref.pointInsertion) return;
    const e = pointInsertion ? Ed.aplatir(travail.sections).find((x) => x.id === pointInsertion) : null;
    ref.pointInsertion.hidden = !e;
    ref.pointInsertion.textContent = e ? `Le prochain article s’ajoutera ${sensInsertion === 'avant' ? 'au-dessus de' : 'sous'} « ${e.libelle || e.titre || 'cette ligne'} ».` : '';
  }

  function majResultats() {
    if (!ref.resultats) return;
    const actifs = D.etat.articles.filter((a) => a.actif !== false);
    if (!actifs.length) {
      remplir(ref.resultats, h('li', { class: 'texte-discret', dataset: { vide: 'bordereau' } }, 'Ton Bordereau est vide : crée tes articles dans le Bordereau, ou utilise une ligne libre.', ' ', h('a', { href: '#/devis/bordereau' }, 'Ouvrir le Bordereau')));
      return;
    }
    if (!rechercheBordereau.trim() && !filtreFamille) { remplir(ref.resultats, h('li', { class: 'texte-discret' }, 'Tape un mot pour chercher dans ton Bordereau, ou choisis une famille.')); return; }
    const trouves = A.avecCalculOuvrage(A.filtrerArticles(actifs, { recherche: rechercheBordereau, statut: 'actifs', familleId: filtreFamille, familles: D.etat.familles }), D.etat.articles, D.etat.reglages).slice(0, 8);
    if (!trouves.length) { remplir(ref.resultats, h('li', { class: 'texte-discret', dataset: { vide: 'resultats' } }, 'Aucun article ne correspond.')); return; }
    remplir(ref.resultats, trouves.map((a) => {
      const ligne = Ed.ligneDepuisArticle(a, { id: 'essai', articles: D.etat.articles, devis: travail });
      const pv = a.type === A.TYPE_TEXTE ? null : Ed.prixVenteAffiche(travail, {}, ligne);
      return h('li', {}, h('button', { type: 'button', class: 'resultat-bordereau', dataset: { action: 'ajouter-article', articleId: a.id }, onclick: () => ajouterArticle(a) },
        h('span', { class: 'resultat-nom' }, a.libelle, a.code ? h('span', { class: 'texte-discret' }, ` · ${a.code}`) : null, a.type ? h('span', { class: 'texte-discret' }, ` · ${A.libelleType(a.type)}`) : null),
        h('span', { class: 'resultat-prix' }, pv === null ? '' : `${euros(pv)} / ${a.unite || 'u'}`)));
    }));
  }

  function ajouterArticle(a) {
    ajouterLigne(Ed.ligneDepuisArticle(a, { id: nouvelId(), articles: D.etat.articles, devis: travail }), { champ: 'quantite' });
  }

  function rendreLignes() {
    if (!ref.corpsLignes) return;
    majMarges();
    const numeros = Ed.numerotation(travail.sections);
    const niveaux = Object.fromEntries(travail.sections.map((s, i) => [s.id, niveauSection(travail.sections, i)]));
    const elements = Ed.aplatir(travail.sections);
    ref.vide.hidden = elements.length > 0;
    ref.zoneTableau.hidden = elements.length === 0;
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
      return e.type === A.TYPE_TEXTE ? ligneDeTexte(e, numeros, masque) : ligneDevis(e, numeros, masque);
    }));
    majPointInsertion();
    majTotaux();
  }

  // Poignée à gauche : les deux flèches qui déplacent la ligne ou la section (le glisser-déposer n'est pas encore là).
  function celluleDeplacement(e, numero) {
    const p = Ed.deplacementsPossibles(travail.sections, e.id);
    const nom = e.genre === 'section' ? `la section ${numero}` : `la ligne ${numero}`;
    return h('td', { class: 'c-poi poignee-devis' },
      h('button', { type: 'button', class: 'bouton-poignee', dataset: { action: 'monter' }, disabled: !p.monter, 'aria-label': `Monter ${nom}`, onclick: () => appliquer(Ed.deplacerElement(travail.sections, e.id, -1)) }, icone('chevron-up', { taille: 14 })),
      h('button', { type: 'button', class: 'bouton-poignee', dataset: { action: 'descendre' }, disabled: !p.descendre, 'aria-label': `Descendre ${nom}`, onclick: () => appliquer(Ed.deplacerElement(travail.sections, e.id, 1)) }, icone('chevron-down', { taille: 14 })));
  }

  // Petit bouton rond à droite : les actions de la ligne (le menu complet viendra ensuite).
  function celluleActions(e, numero) {
    const nom = e.genre === 'section' ? `la section ${numero}` : `la ligne ${numero}`;
    return h('td', { class: 'c-act col-actions-lignes' },
      h('button', { type: 'button', class: 'bouton-icone bouton-rond', dataset: { action: 'menu-ligne' }, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Actions pour ${nom}`, onclick: (ev) => { ligneActive = e.id; ouvrirMenuLigne(ev.currentTarget, e, nom); } }, icone('chevron-down', { taille: 16 })));
  }

  /** Les entrées « Insérer au-dessus » / « Insérer en dessous » : un sous-menu avec les types d'éléments. `sens` : 'avant' ou 'apres'. */
  function entreesInsertion(e, sens) {
    const poser = (creer) => () => {
      const element = creer();
      const sections = sens === 'avant' ? Ed.ajouterAvant(travail.sections, element, e.id, nouvelId()) : Ed.ajouterElement(travail.sections, element, e.id, nouvelId());
      appliquer(sections, { focus: element.id });
    };
    const chercher = (familleId) => () => { pointInsertion = e.id; sensInsertion = sens; ouvrirRecherche(familleId); majPointInsertion(); };
    return [
      { libelle: 'Fourniture', cle: `inserer-${sens}-fourniture`, action: chercher('famille-1') },
      { libelle: 'Main d’œuvre', cle: `inserer-${sens}-main-oeuvre`, action: chercher('famille-2') },
      { libelle: 'Ouvrage', cle: `inserer-${sens}-ouvrage`, action: chercher('famille-3') },
      { libelle: 'Section', cle: `inserer-${sens}-section`, action: poser(() => Ed.sectionNeuve(nouvelId())) },
      { libelle: 'Sous-section', cle: `inserer-${sens}-sous-section`, action: poser(() => Ed.sousSectionNeuve(nouvelId())) },
      { libelle: 'Texte', cle: `inserer-${sens}-texte`, action: poser(() => Ed.ligneTexte(nouvelId())) },
      { libelle: 'Ligne libre', cle: `inserer-${sens}-libre`, action: poser(() => Ed.ligneLibre(nouvelId())) },
    ];
  }

  function ouvrirMenuLigne(ancre, e, nom) {
    const p = Ed.deplacementsPossibles(travail.sections, e.id);
    ouvrirFenetreMenu(ancre, (fermer) => contenuMenu([
      { libelle: 'Insérer au-dessus', cle: 'inserer-avant', sous: entreesInsertion(e, 'avant') },
      { libelle: 'Insérer en dessous', cle: 'inserer-apres', sous: entreesInsertion(e, 'apres') },
      ...(e.genre === 'section' ? [] : [{ libelle: 'Ajouter des photos', cle: 'photos', bientot: true }]),
      { libelle: 'Dupliquer', icone: 'copy', cle: 'dupliquer', action: () => { const r = Ed.dupliquerElement(travail.sections, e.id, nouvelId); appliquer(r.sections); } },
      { libelle: 'Monter', icone: 'arrow-up', cle: 'monter', desactive: !p.monter, action: () => appliquer(Ed.deplacerElement(travail.sections, e.id, -1)) },
      { libelle: 'Descendre', icone: 'arrow-down', cle: 'descendre', desactive: !p.descendre, action: () => appliquer(Ed.deplacerElement(travail.sections, e.id, 1)) },
      { separateur: true },
      { libelle: 'Supprimer', icone: 'trash-2', cle: 'supprimer', danger: true, action: () => supprimer(e, nom) },
    ], fermer), { classe: 'menu-devis-ligne', nom: `Actions pour ${nom}` });
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
      titre: e.genre === 'section' ? 'Supprimer cette section ?' : 'Supprimer cette ligne ?',
      message: lourd ? `La section et ses ${n} ligne${n > 1 ? 's' : ''} seront retirées du devis.` : `Retirer ${nom} du devis.`,
      libelleOk: 'Supprimer', danger: true, messageFait: lourd ? 'Section retirée' : 'Ligne retirée',
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
    const saut = h('label', { class: 'case-saut' }, h('input', { type: 'checkbox', checked: e.sautDePageAvant === true, dataset: { champ: 'saut-de-page' }, onchange: (ev) => changerLigne(e.id, { sautDePageAvant: ev.target.checked || undefined }) }), ' Nouvelle page avant');
    return h('tr', { class: `ligne-section-devis ${sous ? 'sous-section-devis' : ''}`, hidden: masque, dataset: { id: e.id, genre: 'section', niveau: String(niveau) } },
      celluleDeplacement(e, numeros[e.id]),
      h('td', { class: 'c-num num', dataset: { libelle: 'N°' } }, numeros[e.id]),
      h('td', { colspan: colonnesDeLaDesignation(true), class: 'c-des cellule-section', dataset: { libelle: sous ? 'Sous-section' : 'Section' } }, h('div', { class: 'ligne-champs' }, replier, titre, saut)),
      h('td', { class: 'c-tot d', dataset: { libelle: 'Sous-total HT' } }, affichage().cacherTotauxSections ? null : [h('span', { class: 'etiquette-sous-total' }, 'Sous-total : '), h('span', { class: 'sous-total-section', dataset: { sousTotal: e.id } })]),
      celluleActions(e, numeros[e.id]));
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
    // L'unité se choisit dans la liste du Bordereau (ou « Autre… » pour écrire la sienne).
    const unite = menuUnite({ valeur: l.unite ?? '', libelle: `Unité ${numeros[l.id]}`, champ: 'unite' });
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
      cellule('c-des', 'Désignation', libelle, description, composition, configurer, reference, calculMarge),
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
    const lienCondition = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'ajouter-condition' }, onclick: () => { const c = racine.querySelector('[data-champ="acompte-type"]'); c?.scrollIntoView?.({ block: 'center' }); c?.focus(); } }, icone('plus', { taille: 14 }), 'Ajouter une condition');
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
    const typeRemise = h('select', { class: 'champ', 'aria-label': 'Type de remise', dataset: { champ: 'remise-type' }, disabled: lecture, onchange: () => majRemise() },
      h('option', { value: 'pourcentage', selected: d.remise?.type !== 'montant' }, '%'), h('option', { value: 'montant', selected: d.remise?.type === 'montant' }, '€'));
    const valeurRemise = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', value: saisieNombre(d.remise?.valeur), placeholder: '0', disabled: lecture, 'aria-label': 'Valeur de la remise', dataset: { champ: 'remise-valeur' }, oninput: () => majRemise() });
    ref.erreurRemise = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'remise' }, hidden: true });
    function majRemise() {
      const txt = valeurRemise.value.trim();
      const v = Ed.lireSaisie(txt);
      valeurRemise.classList.toggle('invalide', txt !== '' && v === null);
      changer({ remise: txt === '' || v === null ? null : { type: typeRemise.value, valeur: v } });
    }
    const typeAcompte = h('select', { class: 'champ', 'aria-label': 'Type d’acompte', dataset: { champ: 'acompte-type' }, disabled: lecture, onchange: () => majAcompte() },
      h('option', { value: '' }, 'Aucun'), h('option', { value: 'pourcentage', selected: d.acompte?.type === 'pourcentage' }, 'Pourcentage'), h('option', { value: 'montant', selected: d.acompte?.type === 'montant' }, 'Montant'));
    const valeurAcompte = h('input', { class: 'champ champ-court', type: 'text', inputmode: 'decimal', value: saisieNombre(d.acompte?.valeur), disabled: lecture, 'aria-label': 'Valeur de l’acompte', dataset: { champ: 'acompte-valeur' }, oninput: () => majAcompte() });
    const momentAcompte = h('select', { class: 'champ', 'aria-label': 'Moment de l’acompte', dataset: { champ: 'acompte-moment' }, disabled: lecture, onchange: () => majAcompte() },
      MOMENTS_ACOMPTE.map((m) => h('option', { value: m.id, selected: (d.acompte?.moment ?? 'signature') === m.id }, m.libelle)));
    const texteMoment = h('input', { class: 'champ', type: 'text', value: d.acompte?.texteMoment ?? '', placeholder: 'Quand ?', disabled: lecture, 'aria-label': 'Moment libre de l’acompte', dataset: { champ: 'acompte-texte' }, oninput: () => majAcompte() });
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
          h('dd', {}, (ref.lienAjustement = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'definir-ajustement' }, disabled: lecture, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (ev) => ouvrirAjustement(ev.currentTarget) }, 'Définir un ajustement')), h('span', { dataset: { total: 'ajustement' } }))),
        ligneT('brut', 'Total brut HT'),
        h('div', { class: 'ligne-total ligne-remise' }, h('dt', {}, 'Remise client'), h('dd', {}, h('div', { class: 'ligne-champs' }, valeurRemise, typeRemise), h('span', { dataset: { total: 'remise' } }))),
        ligneT('ht', 'Total net HT'),
        ligneT('tva', 'TVA'),
        ligneT('ttc', 'Total TTC'),
        h('div', { class: 'ligne-total ligne-acompte' }, h('dt', {}, 'Acompte demandé'), h('dd', {}, h('div', { class: 'ligne-champs' }, typeAcompte, valeurAcompte, momentAcompte, texteMoment), h('span', { dataset: { total: 'acompte' } }))),
        ligneT('reste', 'Reste à facturer')),
      ref.erreurRemise, ref.erreurAcompte,
      (ref.avertissementsTotal = h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements' } })),
      lecture ? null : h('p', { class: 'texte-discret' }, 'Primes, retenue de garantie et déchets viendront dans une prochaine version.'));
    const net = h('div', { class: 'bandeau-net', dataset: { ligne: 'net' } }, h('span', { class: 'bandeau-net-titre' }, 'NET À PAYER'), h('span', { class: 'bandeau-net-montant', dataset: { total: 'net' } }));
    const taux = h('table', { class: 'tableau-tva' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Taux TVA'), h('th', { scope: 'col', class: 'd' }, 'Base HT'), h('th', { scope: 'col', class: 'd' }, 'Total'))), ref.tva);
    return [totaux, net, taux];
  }

  // Le menu « Définir un ajustement » : « Ajustement global » (trois champs liés : %, €, coefficient), puis « Poste HT » (Remise, et deux choix pas encore là).
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
      const zone = h('div', { class: 'ajust-zone', dataset: { zone: 'ajustement-global' } },
        fabriquer('pourcentage', 'Pourcentage', '%'), fabriquer('montant', 'Montant', '€'), fabriquer('coefficient', 'Coefficient', 'coef.'),
        h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'retirer-ajustement' }, onclick: () => { changer({ ajustement: null }); appliquerAffichage(); remplirAutres(null); Object.values(erreurs).forEach((p) => { p.hidden = true; }); } }, 'Retirer l’ajustement'));
      remplirAutres(null);
      const bloc = contenuMenu([
        { libelle: 'Ajustement global', cle: 'ajustement-global', icone: 'arrow-up-down', reste: true, action: () => { zone.hidden = !zone.hidden; } },
      ], fermer);
      const reste = contenuMenu([
        { titre: 'Poste HT' },
        { libelle: 'Remise', cle: 'remise', action: () => { const c = racine.querySelector('[data-champ="remise-valeur"]'); c?.scrollIntoView?.({ block: 'center' }); c?.focus(); } },
        { libelle: 'Compte prorata', cle: 'prorata', bientot: true },
        { libelle: 'Poste libre HT', cle: 'poste-libre', bientot: true },
      ], fermer);
      return h('div', { class: 'menu-devis-liste' }, bloc, zone, reste);
    }, { classe: 'menu-devis-ajustement', nom: 'Ajustement du devis' });
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
      if (marge && trouve) marge.textContent = `Achat ${euros(trouve.ligne.prixAchat)} · Marge ${saisieNombre(margeEffective({ devis: travail, section: trouve.section, ligne: trouve.ligne }))} % · Vente ${euros(base)}`;
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

  async function finaliser({ imprimer = false } = {}) {
    clearTimeout(minuteur);
    if (!(await sauver())) { toast(messageEnreg || ERREUR_ECRITURE, { type: 'erreur', duree: 8000 }); return; }
    const locales = [...(travail.affaireId ? [] : ['Choisis l’affaire du devis.']), ...erreursFinalisation(travail)];
    if (locales.length) { await listeErreurs('Ce devis ne peut pas encore être finalisé', locales); return; }
    const avis = Ed.avertissements(travail);
    const ok = await dialogue({
      titre: 'Finaliser ce devis ?',
      contenu: h('div', {}, h('p', {}, 'Les prix, la TVA et les totaux seront figés et le devis recevra son numéro. Pour le corriger ensuite, tu créeras une variante.'),
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
      lecture = true;
      travail = { ...travail, statut: r?.statut ?? 'en_attente_envoi', numero: r?.numero ?? travail.numero };
      enregistre = structuredClone(travail);
      construire();
      if (imprimer) imprimerApresFinalisation();
    } catch (e) {
      console.warn(e);
      verrou = false;
      toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
    }
  }

  /** « Finaliser et imprimer » : une fois le devis finalisé, l'aperçu (déjà à l'écran en lecture seule) est imprimé. Sans clic en cours, aucun onglet ne peut s'ouvrir : on le dit. */
  async function imprimerApresFinalisation() {
    // L'écran peut être reconstruit juste après la finalisation (le serveur vient d'écrire) : on attend un aperçu en place et chargé.
    for (let i = 0; i < 30; i += 1) {
      const cadre = ref.iframeApercu;
      if (cadre?.isConnected && cadre.contentDocument?.body?.childElementCount) break;
      await new Promise((fin) => { setTimeout(fin, 100); });
    }
    const r = imprimerDepuisApercu({ autoriserOnglet: false });
    if (!r.ok) toast('Le devis est finalisé. Clique sur « Imprimer / Enregistrer en PDF » pour l’imprimer.', { duree: 8000 });
  }

  // ------------------------------------------------ démarrage
  charger();
  const rafraichir = planifier(surDonnees);
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(() => { if (montre && !lecture) { majClients(); } else if (!montre) rafraichir(); })];
  return () => {
    arrets.forEach((f) => f());
    clearTimeout(minuteur);
    clearTimeout(delaiIntrouvable);
    arretGarde();
  };
}
