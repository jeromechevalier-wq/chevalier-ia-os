// Éditeur de devis (route devis/editeur, devis/editeur/<id>) : choisir l'affaire, remplir le chantier, ajouter des lignes (Bordereau, ligne libre, section, texte),
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
  totauxDevis, vueClient, erreursFinalisation, erreursChantier, STATUTS_DEVIS, MODES_MARGE, UNITES_DUREE, MOMENTS_ACOMPTE, transitionPossible, TAUX_TVA_DEFAUT,
} from './logique.js';
import { devisHtml, formaterMontant } from './document.js';

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
  let pointInsertion = null; // identifiant sous lequel s'ajoutera le prochain article du Bordereau
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
  const datalist = h('datalist', { id: 'unites-devis' }, A.UNITES_PROPOSEES.map((u) => h('option', { value: u })));

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
    const apres = pointInsertion && Ed.aplatir(travail.sections).some((x) => x.id === pointInsertion) ? pointInsertion : null;
    pointInsertion = null;
    majPointInsertion();
    appliquer(Ed.ajouterElement(travail.sections, element, apres), { focus: element.id, champ });
  }
  const changerLigne = (idLigne, patch) => { travail.sections = Ed.majElement(travail.sections, idLigne, patch); marquerModifie(); };

  // ------------------------------------------------ construction de la page
  function construire() {
    montre = true;
    for (const k of Object.keys(ref)) delete ref[k];
    const d = travail;
    const entete = h('header', { class: 'page-tete' },
      h('div', {},
        h('a', { class: 'lien-retour', href: '#/devis/liste' }, icone('chevron-left', { taille: 16 }), 'Devis'),
        h('div', { class: 'titre-devis' },
          (ref.titre = h('h1', {}, '')),
          (ref.pastille = h('span', { class: 'pastille-statut', dataset: { valeur: 'statut' } })),
          (ref.indicateur = h('span', { class: 'indicateur-enregistrement', role: 'status', 'aria-live': 'polite', dataset: { valeur: 'enregistrement' } })))),
      h('div', { class: 'page-actions' }, lecture ? boutonsLecture(d) : [
        (ref.boutonEnregistrer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'enregistrer' }, onclick: async () => { const ok = await sauver(); toast(ok ? 'Devis enregistré' : messageEnreg || ERREUR_ECRITURE, { type: ok ? 'info' : 'erreur', duree: ok ? 2500 : 8000 }); } })),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'finaliser' }, onclick: finaliser }, icone('check', { taille: 16 }), 'Finaliser'),
      ]));
    ref.bandeauConflit = h('p', { class: 'bandeau-lecture-seule', role: 'alert', hidden: !conflit, dataset: { valeur: 'conflit' } }, 'Ce devis a été modifié ailleurs. Tes changements ne sont pas enregistrés tant que tu n’as pas rechargé. ',
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'recharger' }, onclick: () => { conflit = false; charger(); } }, 'Recharger'));
    const erreurEnreg = (ref.erreurEnreg = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'enregistrement' }, hidden: true }));
    const onglets = h('div', { class: 'onglets-editeur', role: 'tablist', 'aria-label': 'Affichage du devis', hidden: lecture },
      [['edition', 'Édition'], ['apercu', 'Aperçu']].map(([cle, libelle]) => h('button', {
        type: 'button', class: 'onglet-editeur', role: 'tab', dataset: { onglet: cle }, onclick: () => choisirOnglet(cle),
      }, libelle)));
    ref.onglets = onglets;
    ref.panneauEdition = h('div', { class: 'editeur-grille', dataset: { panneau: 'edition' } }, lecture ? null : h('div', { class: 'editeur-principal' }, blocs()), panneauTotal());
    ref.panneauApercu = h('div', { class: 'editeur-apercu', dataset: { panneau: 'apercu' } });
    racine.classList.toggle('devis-lecture-seule', lecture);
    remplir(racine, datalist, entete, lecture ? h('p', { class: 'bandeau-lecture-seule', dataset: { valeur: 'lecture-seule' } }, MESSAGE_LECTURE_SEULE) : ref.bandeauConflit, erreurEnreg, onglets, ref.panneauEdition, ref.panneauApercu);
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
    ];
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
    try {
      const vue = vueClient(travail, { clientNom: clientDuDevis(travail) || null });
      corps = h('iframe', { class: 'apercu-devis', title: `Aperçu du devis ${travail.numero ?? ''}`.trim(), sandbox: '', srcdoc: devisHtml(vue, { brouillon: travail.statut === 'brouillon' }), dataset: { zone: 'apercu' } });
    } catch (e) {
      console.warn(e);
      corps = h('p', { class: 'erreur', role: 'alert' }, 'L’aperçu n’a pas pu être préparé : le devis est incomplet. Termine-le, puis rouvre l’aperçu.');
    }
    remplir(ref.panneauApercu, corps);
  }

  // ------------------------------------------------ en-tête
  function majEntete() {
    if (!ref.titre) return;
    const d = travail;
    ref.titre.textContent = d.numero ? `Devis ${d.numero}${d.version > 1 ? ` · v${d.version}` : ''}` : 'Brouillon de devis';
    ref.pastille.textContent = libelleStatut(d.statut);
    ref.pastille.dataset.statut = d.statut;
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

  // ------------------------------------------------ blocs de saisie
  const bloc = (titre, ...contenu) => h('section', { class: 'carte-editeur' }, h('h2', { class: 'titre-bloc' }, titre), ...contenu);
  const champ = (etiquette, controle, { id: idc = null, aide = null } = {}) => h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: idc }, etiquette), controle, aide);

  function blocs() {
    return [blocAffaire(), blocChantier(), blocLignes(), blocPrix(), blocConditions()];
  }

  function blocAffaire() {
    const d = travail;
    const liste = affaires();
    const courante = liste.some((a) => a.id === d.affaireId) || !d.affaireId ? liste : [...liste, CRM.affaire(d.affaireId)].filter(Boolean);
    ref.selectAffaire = h('select', { class: 'champ', id: 'devis-affaire', dataset: { champ: 'affaire' }, 'aria-required': 'true', onchange: (e) => changerAffaire(e.target.value) },
      h('option', { value: '' }, 'Choisis une affaire'), courante.map((a) => h('option', { value: a.id, selected: a.id === d.affaireId }, libelleAffaire(a))));
    ref.erreurAffaire = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'affaire' }, hidden: Boolean(d.affaireId) }, 'Choisis l’affaire de ce devis : sans elle, il ne sera rattaché à aucun client.');
    ref.selectClient = h('select', { class: 'champ', id: 'devis-client', dataset: { champ: 'client' }, onchange: (e) => changerClient(e.target.value) });
    majClients();
    const destinataire = h('input', {
      class: 'champ', id: 'devis-destinataire', type: 'email', inputmode: 'email', autocomplete: 'off', value: Ed.emailsDeFiche({ emails: d.destinataires })[0] ?? '', dataset: { champ: 'destinataire' },
      oninput: (e) => changer({ destinataires: e.target.value.trim() ? [e.target.value.trim()] : [] }),
    });
    return bloc('Affaire et client',
      h('div', { class: 'grille-champs' },
        champ('Affaire *', ref.selectAffaire, { id: 'devis-affaire', aide: ref.erreurAffaire }),
        champ('Client', ref.selectClient, { id: 'devis-client' }),
        champ('Numéro', h('input', { class: 'champ', id: 'devis-numero', readonly: true, value: d.numero ?? '', placeholder: 'Attribué à la finalisation', dataset: { champ: 'numero' }, 'aria-describedby': 'devis-numero-aide' }), { id: 'devis-numero', aide: h('p', { class: 'texte-discret', id: 'devis-numero-aide' }, d.numero ? 'Ce numéro ne change pas d’une version à l’autre.' : 'Le numéro est donné automatiquement quand tu finalises.') }),
        champ('Valable jusqu’au', h('input', { class: 'champ', id: 'devis-expire', type: 'date', value: d.expireLe ?? '', dataset: { champ: 'expireLe' }, oninput: (e) => changer({ expireLe: e.target.value || null }) }), { id: 'devis-expire' }),
        champ('Objet du devis', h('input', { class: 'champ', id: 'devis-objet', type: 'text', value: d.objet ?? '', placeholder: 'Exemple : Rénovation de la cuisine', dataset: { champ: 'objet' }, oninput: (e) => changer({ objet: e.target.value }) }), { id: 'devis-objet' }),
        champ('E-mail du destinataire', destinataire, { id: 'devis-destinataire' })));
  }

  function majClients() {
    const a = CRM.affaire(travail.affaireId);
    const clients = clientsDeAffaire(a);
    const valeur = travail.organisationId ? `organisation:${travail.organisationId}` : travail.personneId ? `personne:${travail.personneId}` : '';
    const options = [h('option', { value: '' }, clients.length ? 'Aucun' : 'Aucun client sur cette affaire')];
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

  function blocChantier() {
    const d = travail;
    const c = d.chantier ?? {};
    ref.adresseAuto = clientsDeAffaire(CRM.affaire(d.affaireId)).find((x) => (d.organisationId ? x.fiche.id === d.organisationId : x.fiche.id === d.personneId))?.adresse ?? '';
    ref.champAdresse = h('textarea', {
      class: 'champ', id: 'devis-chantier-adresse', rows: 3, dataset: { champ: 'chantier-adresse' }, value: Ed.texteDeAdresse(c.adresse) || Ed.texteDeAdresse(d.adresses?.chantier),
      oninput: (e) => { const t = e.target.value; travail.adresses = { ...(travail.adresses ?? {}), chantier: Ed.adresseTexteSimple(t) }; travail.chantier = Ed.chantierAvecAdresse(travail.chantier, t); marquerModifie(); majErreursChantier(); },
    });
    const date = (cle, etiquette, idc) => champ(etiquette, h('input', { class: 'champ', id: idc, type: 'date', value: c[cle] ?? '', dataset: { champ: cle }, oninput: (e) => { travail.chantier = { ...(travail.chantier ?? {}), [cle]: e.target.value || null }; marquerModifie(); majErreursChantier(); } }), { id: idc });
    const duree = h('input', {
      class: 'champ champ-court', id: 'devis-duree', type: 'text', inputmode: 'decimal', value: saisieNombre(c.dureeEstimee?.valeur), dataset: { champ: 'duree' }, 'aria-label': 'Durée estimée',
      oninput: () => majDuree(),
    });
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
    ref.erreursChantier = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'chantier' }, hidden: true });
    return bloc('Chantier',
      h('div', { class: 'grille-champs' },
        champ('Adresse du chantier', ref.champAdresse, { id: 'devis-chantier-adresse' }),
        date('debutTravaux', 'Début des travaux', 'devis-debut'),
        champ('Durée estimée', h('div', { class: 'ligne-champs' }, duree, unite), { id: 'devis-duree' }),
        date('finChantierAu', 'Fin de chantier au plus tard', 'devis-fin')),
      ref.erreursChantier);
  }
  function majErreursChantier() {
    if (!ref.erreursChantier) return;
    const e = erreursChantier(travail.chantier);
    ref.erreursChantier.hidden = !e.length;
    remplir(ref.erreursChantier, e.join(' '));
  }

  // ------------------------------------------------ lignes
  function blocLignes() {
    ref.rechercheBordereau = h('input', {
      class: 'champ', type: 'search', placeholder: 'Libellé, code ou référence', autocomplete: 'off', 'aria-label': 'Rechercher dans le Bordereau', dataset: { champ: 'recherche-bordereau' },
      oninput: (e) => { rechercheBordereau = e.target.value; majResultats(); },
    });
    ref.filtreFamille = h('select', { class: 'champ', 'aria-label': 'Famille', dataset: { champ: 'filtre-famille' }, onchange: (e) => { filtreFamille = e.target.value; majResultats(); } },
      h('option', { value: '' }, 'Toutes les familles'), arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [f, ...enfants]).filter((f) => f.actif).map((f) => h('option', { value: f.id }, cheminFamille(D.etat.familles, f.id))), h('option', { value: 'sans_famille' }, 'Sans famille'));
    ref.resultats = h('ul', { class: 'resultats-bordereau', dataset: { zone: 'resultats' } });
    ref.pointInsertion = h('p', { class: 'texte-discret', dataset: { valeur: 'point-insertion' }, hidden: true });
    ref.avertissements = h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements' } });
    ref.corpsLignes = h('tbody', {});
    ref.vide = h('div', { class: 'etat-vide-ligne', dataset: { vide: 'lignes' } }, h('p', {}, 'Ajoute une première ligne depuis ton Bordereau ou une ligne libre.'));
    return bloc('Lignes du devis',
      h('div', { class: 'recherche-bordereau' },
        h('div', { class: 'ligne-champs' }, ref.rechercheBordereau, ref.filtreFamille),
        ref.pointInsertion, ref.resultats),
      h('div', { class: 'barre-ajouts' },
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-libre' }, onclick: () => ajouterLigne(Ed.ligneLibre(nouvelId())) }, icone('plus', { taille: 16 }), 'Ligne libre'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-section' }, onclick: () => ajouterLigne(Ed.sectionNeuve(nouvelId())) }, icone('plus', { taille: 16 }), 'Section'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-texte' }, onclick: () => ajouterLigne(Ed.ligneTexte(nouvelId())) }, icone('plus', { taille: 16 }), 'Texte')),
      ref.vide,
      h('div', { class: 'zone-tableau zone-lignes-devis' }, h('table', { class: 'tableau-lignes-devis' },
        h('thead', {}, h('tr', {}, ['N°', 'Désignation', 'Qté', 'Unité', 'Prix de vente HT', 'TVA', 'Total HT', ''].map((t, i) => h('th', { scope: 'col', class: i > 1 && i < 7 && i !== 3 ? 'd' : '' }, t)))),
        ref.corpsLignes)));
  }

  function majPointInsertion() {
    if (!ref.pointInsertion) return;
    const e = pointInsertion ? Ed.aplatir(travail.sections).find((x) => x.id === pointInsertion) : null;
    ref.pointInsertion.hidden = !e;
    ref.pointInsertion.textContent = e ? `Le prochain article s’ajoutera sous « ${e.libelle || e.titre || 'cette ligne'} ».` : '';
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
    const numeros = Ed.numerotation(travail.sections);
    const elements = Ed.aplatir(travail.sections);
    ref.vide.hidden = elements.length > 0;
    ref.corpsLignes.closest('.zone-lignes-devis').hidden = elements.length === 0;
    remplir(ref.corpsLignes, elements.map((e) => (e.genre === 'section' ? ligneSection(e, numeros) : e.type === A.TYPE_TEXTE ? ligneDeTexte(e, numeros) : ligneDevis(e, numeros))));
    majPointInsertion();
  }

  function actionsLigne(e, numero) {
    const p = Ed.deplacementsPossibles(travail.sections, e.id);
    const nom = e.genre === 'section' ? `la section ${numero}` : `la ligne ${numero}`;
    return h('td', { class: 'col-actions-lignes' },
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'monter' }, disabled: !p.monter, 'aria-label': `Monter ${nom}`, onclick: () => appliquer(Ed.deplacerElement(travail.sections, e.id, -1)) }, icone('arrow-up', { taille: 16 })),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'descendre' }, disabled: !p.descendre, 'aria-label': `Descendre ${nom}`, onclick: () => appliquer(Ed.deplacerElement(travail.sections, e.id, 1)) }, icone('arrow-down', { taille: 16 })),
      h('button', { type: 'button', class: 'bouton-icone', dataset: { action: 'menu-ligne' }, 'aria-haspopup': 'menu', 'aria-label': `Actions pour ${nom}`, onclick: (ev) => ouvrirMenu(ev.currentTarget, menuLigne(e, nom)) }, icone('ellipsis', { taille: 16 })));
  }

  function menuLigne(e, nom) {
    return [
      { libelle: 'Chercher un article au-dessous', icone: 'search', action: () => { pointInsertion = e.id; majPointInsertion(); ref.rechercheBordereau.focus(); } },
      { libelle: 'Insérer une ligne libre au-dessous', icone: 'plus', action: () => appliquer(Ed.ajouterElement(travail.sections, Ed.ligneLibre(nouvelId()), e.id), { focus: null }) },
      { libelle: 'Insérer une section au-dessous', icone: 'plus', action: () => appliquer(Ed.ajouterElement(travail.sections, Ed.sectionNeuve(nouvelId()), e.id)) },
      { libelle: 'Insérer un texte au-dessous', icone: 'plus', action: () => appliquer(Ed.ajouterElement(travail.sections, Ed.ligneTexte(nouvelId()), e.id)) },
      { separateur: true },
      { libelle: 'Dupliquer', icone: 'copy', action: () => { const r = Ed.dupliquerElement(travail.sections, e.id, nouvelId); appliquer(r.sections); } },
      { libelle: 'Supprimer', icone: 'trash-2', danger: true, action: () => supprimer(e, nom) },
    ];
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

  function ligneSection(e, numeros) {
    const titre = h('input', { class: 'champ', type: 'text', value: e.titre ?? '', placeholder: 'Titre de la section (exemple : Cuisine)', 'aria-label': `Titre de la section ${numeros[e.id]}`, dataset: { champ: 'libelle' }, oninput: (ev) => changerLigne(e.id, { titre: ev.target.value }) });
    const saut = h('label', { class: 'case-saut' }, h('input', { type: 'checkbox', checked: e.sautDePageAvant === true, dataset: { champ: 'saut-de-page' }, onchange: (ev) => changerLigne(e.id, { sautDePageAvant: ev.target.checked || undefined }) }), ' Nouvelle page avant');
    const sous = h('span', { class: 'sous-total-section', dataset: { sousTotal: e.id } });
    return h('tr', { class: 'ligne-section-devis', dataset: { id: e.id, genre: 'section' } },
      h('td', { class: 'num', dataset: { libelle: 'N°' } }, numeros[e.id]),
      h('td', { colspan: 5, class: 'cellule-section', dataset: { libelle: 'Section' } }, h('div', { class: 'ligne-champs' }, titre, saut)),
      h('td', { class: 'd', dataset: { libelle: 'Sous-total HT' } }, sous),
      actionsLigne(e, numeros[e.id]));
  }

  function ligneDeTexte(e, numeros) {
    const zone = h('textarea', { class: 'champ', rows: 2, placeholder: 'Texte affiché sur le devis, sans prix', 'aria-label': `Texte ${numeros[e.id]}`, dataset: { champ: 'libelle' }, value: e.libelle ?? '', oninput: (ev) => changerLigne(e.id, { libelle: ev.target.value }) });
    return h('tr', { class: 'ligne-devis-edition ligne-texte-devis', dataset: { id: e.id, genre: 'texte' } },
      h('td', { class: 'num', dataset: { libelle: 'N°' } }, numeros[e.id]),
      h('td', { colspan: 6, dataset: { libelle: 'Texte' } }, zone),
      actionsLigne(e, numeros[e.id]));
  }

  function ligneDevis(e, numeros) {
    const l = e;
    const cellule = (libelle, ...contenu) => h('td', { dataset: { libelle } }, ...contenu);
    const libelle = h('input', { class: 'champ', type: 'text', value: l.libelle ?? '', placeholder: 'Désignation', 'aria-label': `Désignation ${numeros[l.id]}`, dataset: { champ: 'libelle' }, oninput: (ev) => changerLigne(l.id, { libelle: ev.target.value }) });
    const composition = l.ouvrage ? h('pre', { class: 'composition-ouvrage', dataset: { valeur: 'composition' } }, Ed.descriptionDeLigne(l)) : null;
    const quantite = h('input', {
      class: 'champ champ-nombre', type: 'text', inputmode: 'decimal', value: saisieNombre(l.quantite), 'aria-label': `Quantité ${numeros[l.id]}`, dataset: { champ: 'quantite' },
      oninput: (ev) => {
        const q = Ed.lireSaisie(ev.target.value);
        const patch = { quantite: q };
        if (l.ouvrage) { const lig = Ed.trouverLigne(travail.sections, l.id).ligne; patch.description = Ed.descriptionDeLigne({ ...lig, quantite: q ?? 1 }); if (composition) composition.textContent = patch.description; }
        ev.target.classList.toggle('invalide', ev.target.value.trim() !== '' && q === null);
        changerLigne(l.id, patch);
      },
    });
    const unite = h('input', { class: 'champ champ-unite', type: 'text', value: l.unite ?? '', list: 'unites-devis', 'aria-label': `Unité ${numeros[l.id]}`, dataset: { champ: 'unite' }, oninput: (ev) => changerLigne(l.id, { unite: ev.target.value }) });
    const prix = h('input', {
      class: 'champ champ-nombre', type: 'text', inputmode: 'decimal', value: '', 'aria-label': `Prix de vente HT ${numeros[l.id]}`, dataset: { champ: 'prix-vente' },
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
    const tva = h('select', { class: 'champ', 'aria-label': `TVA ${numeros[l.id]}`, dataset: { champ: 'tva' }, onchange: (ev) => changerLigne(l.id, { tauxTva: ev.target.value === '' ? undefined : Number(ev.target.value) }) },
      h('option', { value: '' }, `Défaut (${saisieNombre(travail.tauxTvaDefaut)} %)`), taux.map((t) => h('option', { value: String(t), selected: l.tauxTva === t }, `${saisieNombre(t)} %`)));
    return h('tr', { class: 'ligne-devis-edition', dataset: { id: l.id, genre: 'ligne' } },
      cellule('N°', numeros[l.id]),
      cellule('Désignation', libelle, composition),
      cellule('Qté', quantite),
      cellule('Unité', unite),
      cellule('Prix de vente HT', prix),
      cellule('TVA', tva),
      cellule('Total HT', h('span', { class: 'total-ligne', dataset: { total: l.id } })),
      actionsLigne(e, numeros[l.id]));
  }

  // ------------------------------------------------ prix, conditions
  function blocPrix() {
    const d = travail;
    const marge = h('input', { class: 'champ champ-court', id: 'devis-marge', type: 'text', inputmode: 'decimal', value: saisieNombre(d.marge), dataset: { champ: 'marge' }, 'aria-label': 'Marge du devis en pourcent',
      oninput: (e) => { const vide = e.target.value.trim() === ''; const v = vide ? 0 : Ed.lireSaisie(e.target.value); e.target.classList.toggle('invalide', v === null); if (v !== null) { changer({ marge: v }); majPrixAffiches(); } } });
    const mode = h('select', { class: 'champ', id: 'devis-mode', dataset: { champ: 'mode-marge' }, 'aria-label': 'Mode de calcul de la marge', onchange: (e) => { changer({ modeMarge: e.target.value }); majPrixAffiches(); } },
      MODES_MARGE.map((m) => h('option', { value: m.id, selected: d.modeMarge === m.id }, m.libelle)));
    const tva = h('select', { class: 'champ', id: 'devis-tva', dataset: { champ: 'tva-defaut' }, onchange: (e) => changer({ tauxTvaDefaut: Number(e.target.value) }) },
      [...new Set([...D.etat.reglages.tauxProposes, d.tauxTvaDefaut])].sort((a, b) => b - a).map((t) => h('option', { value: String(t), selected: d.tauxTvaDefaut === t }, `${saisieNombre(t)} %`)));
    return bloc('Prix et TVA',
      h('div', { class: 'grille-champs' },
        champ('Marge du devis (%)', h('div', { class: 'ligne-champs' }, marge), { id: 'devis-marge', aide: h('p', { class: 'texte-discret' }, 'Elle s’applique aux lignes qui n’ont pas leur propre marge. Le client ne la voit jamais.') }),
        champ('Mode de calcul', mode, { id: 'devis-mode' }),
        champ('TVA par défaut', tva, { id: 'devis-tva' })));
  }

  function blocConditions() {
    const d = travail;
    return bloc('Texte et notes',
      h('div', { class: 'grille-champs' },
        champ('Texte libre', h('textarea', { class: 'champ', id: 'devis-texte-libre', rows: 3, value: d.texteLibre ?? '', dataset: { champ: 'texte-libre' }, oninput: (e) => changer({ texteLibre: e.target.value }) }), { id: 'devis-texte-libre' }),
        champ('Notes de bas de page', h('textarea', { class: 'champ', id: 'devis-notes', rows: 3, value: d.notesBasDePage ?? '', dataset: { champ: 'notes' }, oninput: (e) => changer({ notesBasDePage: e.target.value }) }), { id: 'devis-notes' })));
  }

  // ------------------------------------------------ panneau Total
  function panneauTotal() {
    const d = travail;
    const ligneT = (cle, libelle) => h('div', { class: 'ligne-total', dataset: { ligne: cle } }, h('dt', {}, libelle), h('dd', { dataset: { total: cle } }));
    ref.tva = h('div', { class: 'tva-par-taux', dataset: { zone: 'tva' } });
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
    return h('aside', { class: 'panneau-total', 'aria-label': 'Total du devis', dataset: { zone: 'total' } },
      h('h2', { class: 'titre-bloc' }, 'Total'),
      h('dl', { class: 'liste-totaux' },
        ligneT('brut', 'Total brut HT'),
        h('div', { class: 'ligne-total ligne-remise' }, h('dt', {}, 'Remise'), h('dd', {}, h('div', { class: 'ligne-champs' }, valeurRemise, typeRemise), h('span', { dataset: { total: 'remise' } }))),
        ligneT('ht', 'Total HT'),
        ref.tva,
        ligneT('ttc', 'Total TTC'),
        h('div', { class: 'ligne-total ligne-acompte' }, h('dt', {}, 'Acompte'), h('dd', {}, h('div', { class: 'ligne-champs' }, typeAcompte, valeurAcompte, momentAcompte, texteMoment), h('span', { dataset: { total: 'acompte' } }))),
        ligneT('reste', 'Reste à facturer'),
        h('div', { class: 'ligne-total ligne-net', dataset: { ligne: 'net' } }, h('dt', {}, 'Net à payer'), h('dd', { dataset: { total: 'net' } }))),
      ref.erreurRemise, ref.erreurAcompte,
      (ref.avertissementsTotal = h('ul', { class: 'avertissements-devis', dataset: { zone: 'avertissements' } })),
      lecture ? null : h('p', { class: 'texte-discret' }, 'Primes, retenue de garantie et déchets viendront dans une prochaine version.'));
  }

  function majTotaux() {
    if (!ref.panneauEdition) return;
    let t;
    try { t = totauxDevis(travail); } catch (e) { console.warn(e); return; }
    const mettre = (cle, texte) => { const el = racine.querySelector(`[data-total="${cle}"]`); if (el) el.textContent = texte; };
    mettre('brut', euros(t.totalBrutHt));
    mettre('remise', t.remiseHt > 0 ? `− ${euros(t.remiseHt)}` : '');
    mettre('ht', euros(t.totalHt));
    mettre('ttc', euros(t.ttc));
    mettre('acompte', t.acompteTtc === null ? '' : euros(t.acompteTtc));
    mettre('reste', t.resteAFacturerTtc === null ? '—' : euros(t.resteAFacturerTtc));
    mettre('net', euros(t.netAPayer));
    remplir(ref.tva, t.tvaParTaux.map((x) => h('div', { class: 'ligne-total ligne-tva', dataset: { ligne: `tva-${x.taux}` } }, h('dt', {}, `TVA ${saisieNombre(x.taux)} % sur ${euros(x.baseHT)}`), h('dd', { dataset: { total: `tva-${x.taux}` } }, euros(x.montant)))));
    if (t.mentions.length && !t.tvaParTaux.length) remplir(ref.tva, h('p', { class: 'texte-discret' }, t.mentions.join(' · ')));
    // Totaux de chaque ligne et de chaque section.
    for (const l of t.lignes) {
      const el = racine.querySelector(`[data-total="${CSS.escape(l.id)}"]`);
      if (el) el.textContent = euros(l.totalHT);
      const champPrix = racine.querySelector(`tr[data-id="${CSS.escape(l.id)}"] [data-champ="prix-vente"]`);
      if (champPrix && document.activeElement !== champPrix) champPrix.value = saisiePrix(l.prixVenteUnitaire);
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
    } catch (e) {
      console.warn(e);
      verrou = false;
      toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
    }
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
