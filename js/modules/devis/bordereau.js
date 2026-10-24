// Écran Bordereau du module Devis : la liste des articles (code, libellé, unité, prix d'achat HT, TVA, état), la recherche, le filtre « Désactivés seulement »,
// « + Article », la modification sur place (clic sur une valeur), Désactiver / Réactiver. Le titre est le nom de bordereau choisi dans les réglages du module.
// Aucune règle métier ici : les règles (validation, plans) sont dans articles.js, exécutées par donnees.js.
import { h, icone, remplir, dialogue, toast, boutonSelonTexte } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { boutonFiltres as boutonFiltresCommun, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, planifier, saisieEnCours } from '../crm/composants.js';
import * as D from './donnees.js';
import * as A from './articles.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant, ou demande à un éditeur de l’espace.';
const ERREUR_LECTURE = 'La liste n’a pas pu être mise à jour. La dernière version reste affichée : vérifie ta connexion puis recharge la page.';

// Recherche et filtre conservés pendant la session (jusqu'au rechargement de la page, comme les autres listes).
let recherche = '';
let desactivesSeulement = false;

/** Les colonnes : `editable` = champ modifiable sur place ; `libelle` = en-tête (et libellé de la carte sur téléphone). */
const COLONNES = [
  { id: 'libelle', libelle: 'Libellé', editable: true },
  { id: 'code', libelle: 'Code', editable: true },
  { id: 'unite', libelle: 'Unité', editable: true },
  { id: 'prixAchat', libelle: 'Prix d’achat HT', editable: true },
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
    const champ = h('input', {
      type: 'text', class: 'champ', value: valeurPourSaisie(a, colonne.id), 'aria-label': `${colonne.libelle} : ${a.libelle}`,
      inputmode: colonne.id === 'prixAchat' || colonne.id === 'tauxTva' ? 'decimal' : 'text', autocomplete: 'off',
      list: colonne.id === 'unite' ? 'unites-bordereau' : null, dataset: { champ: colonne.id },
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
    champ.addEventListener('blur', () => { setTimeout(() => { if (!fini && !message.textContent) valider(); }, 0); });
    remplir(cellule, champ, message);
    champ.focus();
    champ.select();
  }
  return cellule;
}

/** Désactiver : fenêtre de confirmation (le texte du cadrage), puis « Article désactivé · Annuler » pendant 8 secondes. */
async function desactiver(a) {
  await retirerAvecAnnulation({
    titre: 'Désactiver cet article ?',
    message: `« ${a.libelle} » : ${A.MESSAGE_DESACTIVER}`,
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
export async function ouvrirCreationArticle() {
  const reglages = D.etat.reglages;
  const champ = (id, libelle, attrs = {}) => {
    const input = h('input', { type: 'text', class: 'champ', id: `article-${id}`, autocomplete: 'off', 'aria-label': libelle, dataset: { champ: id }, ...attrs });
    return { input, bloc: h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: `article-${id}` }, libelle), input, h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: id } })) };
  };
  const libelle = champ('libelle', 'Libellé', { placeholder: 'Exemple : Carrelage 60 x 60', autofocus: true });
  const unite = champ('unite', 'Unité', { value: A.UNITE_DEFAUT, list: 'unites-bordereau' });
  const prix = champ('prixAchat', 'Prix d’achat HT (en euros)', { inputmode: 'decimal', placeholder: 'Exemple : 12,50' });
  const code = champ('code', 'Code (facultatif)', { placeholder: 'Exemple : CAR-6060' });
  const tva = champ('tauxTva', 'TVA de cet article (facultatif)', { inputmode: 'decimal', placeholder: `Sinon, le taux du devis (${A.formaterTaux(reglages.tauxTvaDefaut)})`, list: 'taux-bordereau' });
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  const corps = h('div', { class: 'pile formulaire-creation' },
    libelle.bloc, h('div', { class: 'ligne-champs' }, unite.bloc, prix.bloc), code.bloc, tva.bloc, general,
    tauxListe(reglages));
  const champs = { libelle, unite, prixAchat: prix, code, tauxTva: tva };

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
    try {
      const r = await D.creerArticle({ libelle: libelle.input.value, unite: unite.input.value, prixAchat: prix.input.value, code: code.input.value, tauxTva: tva.input.value });
      const cles = Object.keys(r.erreurs);
      if (cles.length) {
        for (const cle of cles) {
          const c = champs[cle];
          if (c) { c.bloc.querySelector('[data-erreur]').textContent = r.erreurs[cle]; c.input.classList.add('invalide'); } else general.textContent = r.erreurs[cle];
        }
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
        if (await tenter()) fermer(true);
      });
    },
  });
  if (r && identifiant) { toast('Article ajouté'); return identifiant; }
  return null;
}

/** Liste d'unités proposées (le texte libre reste permis). Un seul exemplaire dans la page. */
function uniteListe() {
  return h('datalist', { id: 'unites-bordereau' }, A.UNITES_PROPOSEES.map((u) => h('option', { value: u })));
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
      controles: [{ cle: 'desactives', libelle: 'Désactivés seulement', type: 'oui' }],
      criteres: { desactives: desactivesSeulement },
      effacer: () => ({ desactives: false }),
    });
    if (r) { desactivesSeulement = !!r.desactives; rendre(); }
  } });
  const boutonAjout = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvel-article' }, onclick: () => ouvrirCreationArticle() }, icone('plus', { taille: 16 }), 'Article');

  function rendre() {
    const reglages = D.etat.reglages;
    remplir(titre, A.titreBordereau(reglages));
    filtres.majCompte(desactivesSeulement ? 1 : 0);
    avis.hidden = !D.etat.erreurLecture;
    avis.textContent = D.etat.erreurLecture ? ERREUR_LECTURE : '';
    const statut = desactivesSeulement ? 'desactives' : 'actifs';
    const lignes = A.filtrerArticles(D.etat.articles, { recherche, statut });
    const actifs = D.etat.articles.filter((a) => a.actif !== false).length;
    if (desactivesSeulement) remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'articles désactivés' : 'article désactivé'}`);
    else remplir(compteur, `${actifs} ${actifs > 1 ? 'articles actifs' : 'article actif'}`, lignes.length !== actifs ? ` · ${lignes.length} affiché${lignes.length > 1 ? 's' : ''}` : '');
    if (!D.estPret()) { remplir(zoneTableau, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!lignes.length) {
      const vraimentVide = !D.etat.articles.length;
      remplir(zoneTableau, etatVide(
        vraimentVide ? 'Aucun article. Un article est une ligne de ton bordereau de prix : un libellé, une unité et ton prix d’achat suffisent. Ajoute le premier.'
          : (desactivesSeulement ? 'Aucun article désactivé.' : 'Aucun article ne correspond.'),
        { action: vraimentVide ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvel-article-vide' }, onclick: () => ouvrirCreationArticle() }, icone('plus', { taille: 16 }), 'Article') : null }));
      return;
    }
    const entete = h('tr', {}, COLONNES.map((c) => h('th', { scope: 'col' }, h('span', { class: 'tri titre-colonne' }, c.libelle))), h('th', { class: 'col-actions', 'aria-label': 'Actions' }));
    const corps = lignes.map((a) => h('tr', { class: `ligne-liste ligne-article${a.actif === false ? ' article-desactive' : ''}`, dataset: { id: a.id } },
      COLONNES.map((c) => {
        if (c.editable) return celluleEditable(a, c, rendre);
        return h('td', { dataset: { colonne: c.id, libelle: c.libelle } }, a.actif === false ? h('span', { class: 'pastille-statut', style: { '--couleur': '#8d8993' } }, 'Désactivé') : h('span', { class: 'pastille-statut', style: { '--couleur': '#6ddba0' } }, 'Actif'));
      }),
      h('td', { class: 'col-actions' }, a.actif === false
        ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'reactiver' }, 'aria-label': `Réactiver : ${a.libelle}`, onclick: () => reactiver(a) }, icone('rotate-ccw', { taille: 14 }), 'Réactiver')
        : h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'desactiver' }, 'aria-label': `Désactiver : ${a.libelle}`, onclick: () => desactiver(a) }, 'Désactiver'))));
    remplir(zoneTableau, h('table', { class: 'tableau tableau-articles' }, h('thead', {}, entete), h('tbody', {}, corps)));
  }

  conteneur.append(h('div', { class: 'page page-liste page-devis' },
    h('header', { class: 'page-tete' },
      h('div', {}, titre, compteur),
      h('div', { class: 'page-actions' }, boutonAjout)),
    h('div', { class: 'barre-affaires' }, champRecherche, filtres.element),
    avis, zoneTableau, uniteListe()));

  // Pendant la frappe dans une cellule, on ne reconstruit pas (la saisie serait perdue) ; la liste se met à jour à la fin de la saisie.
  const rafraichir = planifier(() => { if (saisieEnCours(zoneTableau)) return; rendre(); });
  rendre();
  const arret = D.surChangement(rafraichir);
  return () => { arret(); };
}
