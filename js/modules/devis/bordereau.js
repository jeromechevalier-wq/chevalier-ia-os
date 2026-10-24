// Écran Bordereau du module Devis : la liste des articles (code, libellé, unité, prix d'achat HT, TVA, état), la recherche, le filtre « Désactivés seulement »,
// « + Article », la modification sur place (clic sur une valeur), Désactiver / Réactiver. Le titre est le nom de bordereau choisi dans les réglages du module.
// Aucune règle métier ici : les règles (validation, plans) sont dans articles.js, exécutées par donnees.js.
import { h, icone, remplir, dialogue, toast, boutonSelonTexte } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { boutonFiltres as boutonFiltresCommun, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, planifier, saisieEnCours } from '../crm/composants.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import * as O from './ouvrages.js';
import { editeurOuvrage } from './editeur-ouvrage.js';
import { selectionFamille } from './selection-famille.js';
import { cheminFamille, familleEffective, typeDeFamille, arbreFamilles, idsAvecSousFamilles } from './familles.js';
import { menuUnite } from './menu-unite.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant, ou demande à un éditeur de l’espace.';
const ERREUR_LECTURE = 'La liste n’a pas pu être mise à jour. La dernière version reste affichée : vérifie ta connexion puis recharge la page.';

// Recherche et filtre conservés pendant la session (jusqu'au rechargement de la page, comme les autres listes).
let recherche = '';
let desactivesSeulement = false;
let famillesFiltrees = []; // familles cochées dans « Filtres » (vide = toutes ; une famille de premier niveau inclut ses sous-familles) ; « sans_famille » = articles sans famille
let champsRares = false; // « Plus… » montre les colonnes Référence et Marque

/** Les colonnes : `editable` = champ modifiable sur place ; `libelle` = en-tête (et libellé de la carte sur téléphone). */
const COLONNES = [
  { id: 'libelle', libelle: 'Libellé', editable: true },
  { id: 'famille', libelle: 'Famille', editable: false },
  { id: 'reference', libelle: 'Référence', editable: true, rare: true },
  { id: 'marque', libelle: 'Marque', editable: true, rare: true },
  { id: 'code', libelle: 'Code', editable: true },
  { id: 'unite', libelle: 'Unité', editable: true },
  { id: 'prixAchat', libelle: 'Prix d’achat HT', editable: true },
  { id: 'prixVente', libelle: 'Prix de vente HT', editable: false },
  { id: 'tauxTva', libelle: 'TVA', editable: true },
  { id: 'etat', libelle: 'État', editable: false },
];

const valeurPourSaisie = (a, champ) => {
  if (champ === 'prixAchat') return A.prixPourSaisie(a.prixAchat);
  if (champ === 'tauxTva') return a.tauxTva === null || a.tauxTva === undefined ? '' : String(a.tauxTva).replace('.', ',');
  return String(a[champ] ?? '');
};
const valeurAffichee = (a, champ) => {
  if (champ === 'prixAchat') return A.formaterPrix(a.prixAchat);
  if (champ === 'tauxTva') return A.formaterTaux(a.tauxTva);
  return String(a[champ] ?? '');
};

/** Bascule « valeur / champ » sur place : clic = champ ; Entrée ou sortie du champ = enregistre ; Échap = annule. Le message d'erreur reste sous le champ. */
function celluleEditable(a, colonne, surFin) {
  const cellule = h('td', { dataset: { colonne: colonne.id, libelle: colonne.libelle } });
  const texteBouton = valeurAffichee(a, colonne.id);
  const bouton = h('button', {
    type: 'button', class: `valeur-editable${texteBouton ? '' : ' valeur-vide'}`, dataset: { champ: colonne.id },
    'aria-label': `Modifier ${colonne.libelle.toLowerCase()} : ${a.libelle}`, onclick: ouvrir,
  }, texteBouton || '—');
  remplir(cellule, bouton);

  function ouvrir() {
    let fini = false;
    const message = h('p', { class: 'erreur erreur-cellule', role: 'alert', dataset: { erreur: colonne.id } });
    // L'unité se choisit dans un menu qui montre toujours toutes les unités (« Autre… » pour écrire la sienne) ; les autres champs sont des champs de texte.
    const champ = colonne.id === 'unite'
      ? menuUnite({ valeur: a.unite ?? '', libelle: `${colonne.libelle} : ${a.libelle}`, surChoix: () => valider() })
      : h('input', {
        type: 'text', class: 'champ', value: valeurPourSaisie(a, colonne.id), 'aria-label': `${colonne.libelle} : ${a.libelle}`,
        inputmode: colonne.id === 'prixAchat' || colonne.id === 'tauxTva' ? 'decimal' : 'text', autocomplete: 'off', dataset: { champ: colonne.id },
      });
    const retablir = () => { fini = true; remplir(cellule, bouton); surFin(); };
    async function valider() {
      if (fini) return;
      const saisie = champ.value;
      if (saisie.trim() === valeurPourSaisie(a, colonne.id).trim()) { retablir(); return; }
      fini = true;
      try {
        const r = await D.majArticle(a.id, { [colonne.id]: saisie });
        const erreur = r.erreurs[colonne.id] || r.erreurs.general;
        if (erreur) { fini = false; message.textContent = erreur; champ.classList.add('invalide'); champ.focus(); return; }
        surFin();
      } catch (e) {
        console.warn(e);
        fini = false;
        message.textContent = ERREUR_ECRITURE;
        champ.classList.add('invalide');
        champ.focus();
      }
    }
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); valider(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); retablir(); }
    });
    // Sortie du champ = enregistre (sauf si le focus passe du menu d'unités à son champ « Autre… »).
    champ.addEventListener('focusout', () => { setTimeout(() => { if (!fini && !message.textContent && !champ.contains(document.activeElement)) valider(); }, 0); });
    remplir(cellule, champ, message);
    champ.focus();
    champ.select?.();
  }
  return cellule;
}

/** Chemin de la famille d'un article : « Fournitures › Carrelage » (ou « Fournitures »). Un ancien article sans famille est rangé dans la famille de départ de son type. */
const cheminDe = (a) => cheminFamille(D.etat.familles, familleEffective(a));

/**
 * Cellule « Famille » : un bouton qui ouvre la fenêtre « Sélection de la famille » (texte simple si l'article est désactivé). Le type de l'article suit la famille ;
 * choisir « Ouvrages » ouvre la composition (un ouvrage a besoin de composants).
 */
function celluleFamille(a) {
  const cellule = h('td', { dataset: { colonne: 'famille', libelle: 'Famille' } });
  const nom = cheminDe(a);
  if (a.actif === false) { remplir(cellule, nom || '—'); return cellule; }
  remplir(cellule, h('button', {
    type: 'button', class: `valeur-editable${nom ? '' : ' valeur-vide'}`, dataset: { champ: 'familleId' }, 'aria-label': `Famille : ${a.libelle}`,
    onclick: async () => {
      const r = await selectionFamille({ courante: familleEffective(a) });
      if (!r || r.id === familleEffective(a)) return;
      if (a.type === 'ouvrage' && typeDeFamille(D.etat.familles, r.id) !== 'ouvrage') {
        toast('Un ouvrage reste dans la famille « Ouvrages » (ou une de ses sous-familles). Pour en faire une fourniture, crée un nouvel article.', { type: 'erreur', duree: 7000 });
        return;
      }
      if (typeDeFamille(D.etat.familles, r.id) === 'ouvrage' && a.type !== 'ouvrage') { await ouvrirComposition(a, { devenirOuvrage: true, familleId: r.id }); return; }
      try {
        const m = await D.majArticle(a.id, { familleId: r.id });
        const erreur = Object.values(m.erreurs)[0];
        if (erreur) toast(erreur, { type: 'erreur', duree: 7000 });
      } catch (e) { console.warn(e); toast(ERREUR_ECRITURE, { type: 'erreur', duree: 7000 }); }
    },
  }, nom || '—'));
  return cellule;
}

/** Cellule sans prix : une ligne de texte n'a ni prix d'achat ni prix de vente. */
const celluleSansPrix = (colonne) => h('td', { dataset: { colonne: colonne.id, libelle: colonne.libelle } }, h('span', { class: 'valeur-calculee valeur-vide' }, '—'));

/** Prix d'achat d'un ouvrage : non modifiable, c'est son déboursé sec (somme des coûts de ses composants). */
function cellulePrixAchatOuvrage(a) {
  const cellule = h('td', { dataset: { colonne: 'prixAchat', libelle: 'Prix d’achat HT' } });
  remplir(cellule, h('span', { class: 'valeur-calculee', title: 'Déboursé sec : la somme des coûts des composants' }, a.calcul ? A.formaterPrix(a.calcul.deboursSecHT) : '—'));
  return cellule;
}

function cellulePrixVente(a) {
  const pv = a.type === 'ouvrage' ? a.calcul?.prixVenteHT : O.prixVenteArticle(a, D.etat.reglages);
  const cellule = h('td', { dataset: { colonne: 'prixVente', libelle: 'Prix de vente HT' } });
  const incomplet = a.type === 'ouvrage' && (a.calcul?.erreurs ?? []).length > 0;
  remplir(cellule, h('span', {
    class: 'valeur-calculee', dataset: { valeur: 'prix-vente' },
    title: incomplet ? 'Un composant est désactivé ou introuvable : ce prix est incomplet. Ouvre « Composition » pour le corriger.' : null,
  }, typeof pv === 'number' ? `${A.formaterPrix(pv)}${incomplet ? ' ⚠' : ''}` : '—'));
  return cellule;
}

/** Fenêtre « Composition » d'un ouvrage (ou de l'article qui le devient). Enregistre type, composants et prix forcé ensemble. */
async function ouvrirComposition(a, { devenirOuvrage = false, familleId = null } = {}) {
  const editeur = editeurOuvrage({ composants: a.composants ?? [], prixVenteForce: a.prixVenteForce ?? null, id: a.id });
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  let fait = false;
  async function tenter() {
    general.textContent = '';
    editeur.montrerErreurs({});
    try {
      const v = editeur.valeurs();
      const r = await D.majArticle(a.id, { ...(devenirOuvrage ? { type: 'ouvrage', ...(familleId ? { familleId } : {}) } : {}), composants: v.composants, prixVenteForce: v.prixVenteForce === '' ? null : v.prixVenteForce });
      if (Object.keys(r.erreurs).length) {
        if (!editeur.montrerErreurs(r.erreurs)) general.textContent = Object.values(r.erreurs)[0];
        return false;
      }
      fait = true;
      return true;
    } catch (e) { console.warn(e); general.textContent = ERREUR_ECRITURE; return false; }
  }
  await dialogue({
    titre: `Composition : ${a.libelle}`,
    classe: 'dialogue-formulaire dialogue-ouvrage',
    contenu: h('div', { class: 'pile' }, editeur.element, general),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
  });
  if (fait) toast(devenirOuvrage ? 'Ouvrage enregistré' : 'Composition enregistrée');
}

/** Désactiver : fenêtre de confirmation (le texte du cadrage), puis « Article désactivé · Annuler » pendant 8 secondes. */
async function desactiver(a) {
  const ouvragesConcernes = D.etat.articles.filter((x) => x.type === 'ouvrage' && x.actif !== false && (x.composants ?? []).some((c) => c.articleId === a.id));
  const avertissement = ouvragesConcernes.length
    ? ` Attention : il compose ${ouvragesConcernes.length > 1 ? 'les ouvrages' : 'l’ouvrage'} ${ouvragesConcernes.map((x) => `« ${x.libelle} »`).join(', ')} : ${ouvragesConcernes.length > 1 ? 'leurs prix seront incomplets' : 'son prix sera incomplet'} tant que tu ne le remplaces pas.`
    : '';
  await retirerAvecAnnulation({
    titre: 'Désactiver cet article ?',
    message: `« ${a.libelle} » : ${A.MESSAGE_DESACTIVER}${avertissement}`,
    libelleOk: 'Désactiver',
    faire: async () => { const r = await D.activerArticle(a.id, false); if (Object.keys(r.erreurs).length) throw new Error(Object.values(r.erreurs)[0]); },
    defaire: async () => { const r = await D.activerArticle(a.id, true); if (Object.keys(r.erreurs).length) throw new Error(Object.values(r.erreurs)[0]); },
    messageFait: 'Article désactivé',
    messageErreur: 'Désactivation impossible : réessaie dans un instant, ou demande à un éditeur de l’espace.',
  });
}

async function reactiver(a) {
  try {
    const r = await D.activerArticle(a.id, true);
    const erreur = Object.values(r.erreurs)[0];
    if (erreur) { toast(erreur, { type: 'erreur', duree: 7000 }); return; }
    toast('Article réactivé');
  } catch (e) {
    console.warn(e);
    toast(ERREUR_ECRITURE, { type: 'erreur', duree: 7000 });
  }
}

// ---------------------------------------------------------------- fenêtre « Ajouter un article »

/**
 * Formulaire court : seul le libellé est obligatoire pour commencer à écrire ; le prix d'achat est exigé à l'enregistrement.
 * Entrée enregistre ; le bouton « Enregistrer » est grisé tant que le libellé est vide (Entrée dit alors quoi faire). Renvoie l'identifiant créé, ou null.
 */
const FAMILLE_DEFAUT = 'famille-1'; // « Fournitures »

export async function ouvrirCreationArticle() {
  const reglages = D.etat.reglages;
  const champ = (id, libelle, attrs = {}) => {
    const input = h('input', { type: 'text', class: 'champ', id: `article-${id}`, autocomplete: 'off', 'aria-label': libelle, dataset: { champ: id }, ...attrs });
    return { input, bloc: h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: `article-${id}` }, libelle), input, h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: id } })) };
  };
  const libelle = champ('libelle', 'Libellé', { placeholder: 'Exemple : Carrelage 60 x 60', autofocus: true });
  // Unité : un menu qui montre toujours toutes les unités, avec « Autre… » pour écrire la sienne.
  const uniteMenu = menuUnite({ valeur: A.UNITE_DEFAUT, id: 'article-unite', libelle: 'Unité' });
  const unite = { input: uniteMenu, bloc: h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'article-unite' }, 'Unité'), uniteMenu, h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'unite' } })) };
  const prix = champ('prixAchat', 'Prix d’achat HT (en euros)', { inputmode: 'decimal', placeholder: 'Exemple : 12,50' });
  const code = champ('code', 'Code (facultatif)', { placeholder: 'Exemple : CAR-6060' });
  const reference = champ('reference', 'Référence (facultatif)', { placeholder: 'Exemple : REF-4521' });
  const marque = champ('marque', 'Marque (facultatif)', { maxlength: 400 });
  // Famille (un seul champ : le type de l'article s'en déduit) : un champ en lecture seule qui ouvre la fenêtre « Sélection de la famille ». Proposée par défaut : Fournitures.
  let familleId = D.etat.familles.some((f) => f.id === FAMILLE_DEFAUT) ? FAMILLE_DEFAUT : '';
  const familleInput = h('input', { type: 'text', class: 'champ champ-famille', id: 'article-familleId', readonly: true, 'aria-label': 'Famille', placeholder: 'Choisis une famille', value: cheminFamille(D.etat.familles, familleId), dataset: { champ: 'familleId' },
    onclick: () => choisirFamille(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choisirFamille(); } } });
  async function choisirFamille() {
    const r = await selectionFamille({ courante: familleId });
    if (!r) return;
    familleId = r.id;
    familleInput.value = cheminFamille(D.etat.familles, familleId);
    majFamille();
  }
  const famille = { input: familleInput, bloc: h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'article-familleId' }, 'Famille'), familleInput, h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'familleId' } })) };
  // « Plus… » replie les champs rares (référence, marque).
  const rares = h('div', { class: 'pile champs-rares', hidden: true, dataset: { zone: 'rares' } }, reference.bloc, marque.bloc);
  const plus = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'plus-moins' }, 'aria-expanded': 'false', onclick: () => {
    rares.hidden = !rares.hidden;
    plus.textContent = rares.hidden ? 'Plus…' : 'Moins…';
    plus.setAttribute('aria-expanded', String(!rares.hidden));
  } }, 'Plus…');
  const tva = champ('tauxTva', 'TVA de cet article (facultatif)', { inputmode: 'decimal', placeholder: `Sinon, le taux du devis (${A.formaterTaux(reglages.tauxTvaDefaut)})`, list: 'taux-bordereau' });
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  const editeur = editeurOuvrage({});
  editeur.element.hidden = true;
  // Le type vient de la famille : « Ouvrages » remplace le prix d'achat par l'éditeur de composants, « Textes » n'a ni prix ni unité.
  const typeChoisi = () => typeDeFamille(D.etat.familles, familleId);
  function majFamille() { const ouvrage = typeChoisi() === 'ouvrage'; const texteLibre = typeChoisi() === 'texte'; editeur.element.hidden = !ouvrage; prix.bloc.hidden = ouvrage || texteLibre; unite.bloc.hidden = texteLibre; }
  majFamille();
  const corps = h('div', { class: 'pile formulaire-creation' },
    libelle.bloc, famille.bloc, h('div', { class: 'ligne-champs' }, unite.bloc, prix.bloc), editeur.element,
    h('div', { class: 'ligne-champs ligne-champs-egale' }, code.bloc, tva.bloc), plus, rares, general,
    tauxListe(reglages));
  const champs = { libelle, familleId: famille, type: famille, unite, prixAchat: prix, code, tauxTva: tva, reference, marque };

  let identifiant = null;
  let enCours = false; // deux Entrée rapides ne créent pas deux articles
  async function tenter() {
    if (enCours) return false;
    enCours = true;
    try { return await tenterCreation(); } finally { enCours = false; }
  }
  async function tenterCreation() {
    for (const c of Object.values(champs)) { c.bloc.querySelector('[data-erreur]').textContent = ''; c.input.classList.remove('invalide'); }
    general.textContent = '';
    editeur.montrerErreurs({});
    try {
      const ouvrage = typeChoisi() === 'ouvrage';
      const texteLibre = typeChoisi() === 'texte';
      const r = await D.creerArticle({
        libelle: libelle.input.value, unite: texteLibre ? '' : unite.input.value, prixAchat: ouvrage || texteLibre ? undefined : prix.input.value, code: code.input.value, tauxTva: tva.input.value,
        reference: reference.input.value, marque: marque.input.value, familleId,
        ...(ouvrage ? editeur.valeurs() : {}),
      });
      const cles = Object.keys(r.erreurs);
      if (cles.length) {
        for (const cle of cles) {
          const c = champs[cle];
          if (c) { c.bloc.querySelector('[data-erreur]').textContent = r.erreurs[cle]; c.input.classList.add('invalide'); if (cle === 'reference' || cle === 'marque') { rares.hidden = false; plus.textContent = 'Moins…'; } } else if (!ouvrage || (cle !== 'composants' && cle !== 'prixVenteForce')) general.textContent = r.erreurs[cle];
        }
        if (ouvrage) editeur.montrerErreurs(r.erreurs);
        (champs[cles.find((k) => champs[k])]?.input ?? libelle.input).focus();
        return false;
      }
      identifiant = r.id;
      return true;
    } catch (e) {
      console.warn(e);
      general.textContent = ERREUR_ECRITURE;
      return false;
    }
  }

  const r = await dialogue({
    titre: 'Ajouter un article',
    classe: 'dialogue-formulaire',
    contenu: corps,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      { libelle: 'Enregistrer', valeur: true, style: 'principal', desactive: true, avantFermeture: tenter },
    ],
    auMontage: ({ boite, boutons, fermer }) => {
      boutonSelonTexte(boutons.at(-1), libelle.input);
      boite.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || e.defaultPrevented || e.target.tagName !== 'INPUT') return;
        e.preventDefault();
        if (e.target.closest('.editeur-ouvrage')) return; // Entrée dans la recherche ou une quantité n'enregistre pas l'article
        if (await tenter()) fermer(true);
      });
    },
  });
  if (r && identifiant) { toast('Article ajouté'); return identifiant; }
  return null;
}

function tauxListe(reglages) {
  return h('datalist', { id: 'taux-bordereau' }, reglages.tauxProposes.map((t) => h('option', { value: String(t).replace('.', ',') })));
}

// ---------------------------------------------------------------- écran

export function rendreBordereau(conteneur) {
  const titre = h('h1', {});
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zoneTableau = h('div', { class: 'zone-tableau' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' }, hidden: true });
  const champRecherche = h('input', {
    class: 'champ', type: 'search', 'aria-label': 'Rechercher un article', placeholder: 'Rechercher un article', autocomplete: 'off', value: recherche,
    oninput: (e) => { recherche = e.target.value; rendre(); },
  });
  const filtres = boutonFiltresCommun({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'familles', libelle: 'Famille', type: 'cases', options: [...arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [f, ...enfants]).map((f) => ({ valeur: f.id, libelle: cheminFamille(D.etat.familles, f.id) })), { valeur: 'sans_famille', libelle: 'Sans famille' }] },
        { cle: 'desactives', libelle: 'Désactivés seulement', type: 'oui' },
      ],
      criteres: { desactives: desactivesSeulement, familles: famillesFiltrees },
      effacer: () => ({ desactives: false, familles: [] }),
    });
    if (r) { desactivesSeulement = !!r.desactives; famillesFiltrees = r.familles ?? []; rendre(); }
  } });
  const boutonPlus = h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'colonnes-rares' }, 'aria-pressed': 'false', onclick: () => { champsRares = !champsRares; rendre(); } }, 'Plus…');
  const boutonAjout = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvel-article' }, onclick: () => ouvrirCreationArticle() }, icone('plus', { taille: 16 }), 'Article');

  function rendre() {
    const reglages = D.etat.reglages;
    remplir(titre, A.titreBordereau(reglages));
    remplir(boutonPlus, champsRares ? 'Moins…' : 'Plus…');
    boutonPlus.setAttribute('aria-pressed', String(champsRares));
    filtres.majCompte((desactivesSeulement ? 1 : 0) + famillesFiltrees.length);
    avis.hidden = !D.etat.erreurLecture;
    avis.textContent = D.etat.erreurLecture ? ERREUR_LECTURE : '';
    const statut = desactivesSeulement ? 'desactives' : 'actifs';
    // Un ouvrage porte son calcul ; plusieurs familles cochées = l'une ou l'autre, et une famille de premier niveau inclut ses sous-familles.
    const avecCalcul = A.avecCalculOuvrage(D.etat.articles, D.etat.articles, D.etat.reglages);
    const idsCoches = famillesFiltrees.flatMap((id) => (id === 'sans_famille' ? [''] : idsAvecSousFamilles(D.etat.familles, id)));
    const lignes = A.filtrerArticles(avecCalcul, { recherche, statut }).filter((a) => !famillesFiltrees.length || idsCoches.includes(familleEffective(a)));
    const actifs = D.etat.articles.filter((a) => a.actif !== false).length;
    if (desactivesSeulement) remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'articles désactivés' : 'article désactivé'}`);
    else remplir(compteur, `${actifs} ${actifs > 1 ? 'articles actifs' : 'article actif'}`, lignes.length !== actifs ? ` · ${lignes.length} affiché${lignes.length > 1 ? 's' : ''}` : '');
    if (!D.estPret()) { remplir(zoneTableau, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!lignes.length) {
      const vraimentVide = !D.etat.articles.length;
      remplir(zoneTableau, etatVide(
        vraimentVide ? 'Aucun article. Un article est une ligne de ton bordereau de prix : un libellé, une unité et ton prix d’achat suffisent. Ajoute le premier.'
          : (desactivesSeulement ? 'Aucun article désactivé.' : (famillesFiltrees.length ? 'Aucun article dans cette famille. Retire le filtre « Famille » pour tout revoir.' : 'Aucun article ne correspond.')),
        { action: vraimentVide ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvel-article-vide' }, onclick: () => ouvrirCreationArticle() }, icone('plus', { taille: 16 }), 'Article') : null }));
      return;
    }
    const colonnes = COLONNES.filter((c) => !c.rare || champsRares);
    const entete = h('tr', {}, colonnes.map((c) => h('th', { scope: 'col' }, h('span', { class: 'tri titre-colonne' }, c.libelle))), h('th', { class: 'col-actions', 'aria-label': 'Actions' }));
    const corps = lignes.map((a) => h('tr', { class: `ligne-liste ligne-article${a.actif === false ? ' article-desactive' : ''}`, dataset: { id: a.id } },
      colonnes.map((c) => {
        if (c.id === 'famille') return celluleFamille(a);
        if ((c.id === 'prixVente' || c.id === 'prixAchat') && a.type === 'texte') return celluleSansPrix(c);
        if (c.id === 'prixVente') return cellulePrixVente(a);
        if (c.id === 'prixAchat' && a.type === 'ouvrage') return cellulePrixAchatOuvrage(a);
        if (c.editable) return celluleEditable(a, c, rendre);
        return h('td', { dataset: { colonne: c.id, libelle: c.libelle } }, a.actif === false ? h('span', { class: 'pastille-statut', style: { '--couleur': '#8d8993' } }, 'Désactivé') : h('span', { class: 'pastille-statut', style: { '--couleur': '#6ddba0' } }, 'Actif'));
      }),
      h('td', { class: 'col-actions' }, a.type === 'ouvrage' && a.actif !== false
        ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'composer' }, 'aria-label': `Composition : ${a.libelle}`, onclick: () => ouvrirComposition(a) }, 'Composition')
        : null, a.actif === false
        ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'reactiver' }, 'aria-label': `Réactiver : ${a.libelle}`, onclick: () => reactiver(a) }, icone('rotate-ccw', { taille: 14 }), 'Réactiver')
        : h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'desactiver' }, 'aria-label': `Désactiver : ${a.libelle}`, onclick: () => desactiver(a) }, 'Désactiver'))));
    remplir(zoneTableau, h('table', { class: 'tableau tableau-articles' }, h('thead', {}, entete), h('tbody', {}, corps)));
  }

  conteneur.append(h('div', { class: 'page page-liste page-devis' },
    h('header', { class: 'page-tete' },
      h('div', {}, titre, compteur),
      h('div', { class: 'page-actions' }, boutonAjout)),
    h('div', { class: 'barre-affaires' }, champRecherche, filtres.element, boutonPlus),
    avis, zoneTableau));

  // Pendant la frappe dans une cellule, on ne reconstruit pas (la saisie serait perdue) ; la liste se met à jour à la fin de la saisie.
  const rafraichir = planifier(() => { if (saisieEnCours(zoneTableau)) return; rendre(); });
  rendre();
  const arret = D.surChangement(rafraichir);
  return () => { arret(); };
}
