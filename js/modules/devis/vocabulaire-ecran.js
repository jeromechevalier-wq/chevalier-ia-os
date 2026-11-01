// Écran « Vocabulaire » du module Devis (docs/proposition-dictionnaire-vocabulaire.md, section 8) : les mots appris par l'assistant (« prises doubles » -> l'article du catalogue),
// la revue (activer, désactiver, changer l'article, noter, ajouter à la main), l'essai d'une phrase et l'export CSV.
// Aucune règle ici : les plans d'écriture, les filtres, le tri et le CSV sont dans vocabulaire-plans.js (pur), exécutés par donnees.js ; la correspondance est le moteur vocabulaire.js.
import { h, icone, remplir, dialogue, toast, ouvrirMenu, iconeInfo } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { lien } from '../../os/router.js';
import { boutonFiltres as boutonFiltresCommun, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, ligneAjouter, selecteurTri, planifier, telecharger } from '../crm/composants.js';
import { nomFichierExport } from '../crm/logique.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import * as V from './vocabulaire-plans.js';
import { motOuvrage } from './ouvrages.js';
import { selecteurCatalogue } from './selecteur-catalogue.js';
import { cleDeExpression, identifiantDeRegle, interpreter, suggestionEnAttente } from './vocabulaire.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant, ou demande à un éditeur de l’espace.';
const ERREUR_LECTURE = 'La liste des mots appris n’a pas pu être mise à jour. La dernière version reste affichée : vérifie ta connexion puis appuie sur « Réessayer ».';
const MESSAGE_DESACTIVER = 'Ce mot ne sera plus proposé à ChatGPT.';
const MESSAGE_VIDE = 'Aucun mot appris pour l’instant. Les mots apparaissent quand ChatGPT te pose une question, ou ajoute-en un ici.';

// Recherche, filtres et tri conservés pendant la session (jusqu'au rechargement de la page, comme les autres listes).
let recherche = '';
let criteres = { ...V.CRITERES_VOCABULAIRE_VIDES };
let tri = { ...V.TRI_PAR_DEFAUT };
const exemplesOuverts = new Set(); // mots dont les phrases d'exemple sont développées
const erreursLigne = new Map(); // id du mot -> message sous sa ligne (écriture refusée)
let essai = '';

// `cleTropGenerale` parcourt le catalogue : la mémoire est gardée d'un dessin à l'autre tant que le catalogue (même liste) ne change pas.
let memoireTropGeneral = { articles: null, fonction: null };
function tropGeneralPour(articles) {
  if (memoireTropGeneral.articles !== articles) memoireTropGeneral = { articles, fonction: V.tropGeneralMemoire(articles) };
  return memoireTropGeneral.fonction;
}

const ciblesOuvertes = new Set(); // mots à plusieurs articles dont la liste est dépliée
const articleDuMot = (r) => D.article(designeDe(r).articles[0]?.id ?? r.articleId); // `articleId`, ou l'unique cible d'un mot à une seule cible
/** Ce que désigne le mot (un ou plusieurs articles, vivants ou non) et « mort » = aucun article vivant. */
const designeDe = (r) => V.designation(r, D.etat.articles, D.etat.familles);
const libelleArticle = (r) => (designeDe(r).multiple ? designeDe(r).articles.map((c) => c.libelle).join(' / ') : (articleDuMot(r)?.libelle ?? r.articleLibelle ?? ''));
/** Ce que le sélecteur sait montrer d'un mot : ses articles et familles encore vivants, `{ genre, id, libelle }` (un article ou une famille supprimé n'est pas dans la fenêtre : il n'y est plus choisissable). */
const choixVivants = (r) => designeDe(r).cibles.filter((c) => c.vivant).map(({ genre, id, libelle }) => ({ genre, id, libelle }));
/** Le mot tel que l'export CSV le lit : les libellés des articles sont ceux du catalogue d'aujourd'hui (un article renommé depuis n'y reste pas sous son ancien nom). */
const motPourExport = (r) => ({ ...r, articleLibelle: designeDe(r).multiple ? '' : libelleArticle(r), cibles: designeDe(r).multiple ? designeDe(r).cibles.map((c) => ({ genre: c.genre, id: c.id, libelle: c.libelle })) : r.cibles }); // familles : leur chemin d'aujourd'hui

// ---------------------------------------------------------------- choisir un article du catalogue (champ de recherche + arbre des familles : selecteur-catalogue.js)

/** `valeur()` : l'article choisi ou null (modes `articles` et `mixte` : la liste des choix, 8 au plus ; `mixte` : des `{ genre, id, libelle }`, articles et familles). `surChoix(article)` est appelé à chaque choix (avec la liste dans ces deux modes). */
const selecteurArticle = ({ initial = null, surChoix = () => {}, mode = 'article' } = {}) => selecteurCatalogue({
  mode, initial, surChoix,
  source: { articles: () => D.etat.articles, familles: () => D.etat.familles, estChoisissable: V.articleChoisissable, enErreur: () => D.etat.erreurLecture, pret: () => D.etat.pret, surChangement: D.surChangement },
});

// ---------------------------------------------------------------- fenêtres

/** Un bouton « Enregistrer » grisé par `aria-disabled` (jamais `disabled` : il reste atteignable au clavier) tant que `pret()` est faux. */
function griserSelon(bouton, pret) {
  const ok = pret();
  bouton.setAttribute('aria-disabled', String(!ok));
  bouton.classList.toggle('bouton-principal', ok);
  bouton.classList.toggle('bouton-secondaire', !ok);
}

/** Ajouter un mot à la main. Renvoie 'modifier' (avec le mot existant dans `existant`) si le mot existe déjà et que l'utilisateur choisit de le modifier. */
async function ouvrirCreation() {
  const expression = h('input', {
    type: 'text', class: 'champ', id: 'mot-expression', autocomplete: 'off', maxlength: V.MAX_EXPRESSION, placeholder: 'Exemple : prises doubles', 'aria-label': 'Expression', dataset: { champ: 'expression' },
  });
  const apercu = h('p', { class: 'discret apercu-cle', 'aria-live': 'polite', dataset: { role: 'cle' } });
  const erreurExpression = h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'expression' } });
  const zoneExistant = h('div', { dataset: { role: 'existant' } });
  const erreurArticle = h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'articleId' } });
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  const choix = selecteurArticle({ mode: 'mixte', surChoix: () => { erreurArticle.textContent = ''; } }); // un article, plusieurs au choix, ou une famille (8 choix au plus)
  let existant = null;
  let fermerFenetre = () => {};
  let bouton = null;
  const existantPour = () => {
    const id = identifiantDeRegle(cleDeExpression(expression.value));
    return id ? (D.etat.vocabulaire.find((r) => r.id === id) ?? null) : null;
  };
  const pret = () => /\S/.test(expression.value) && !existant;
  function majExpression() {
    const texte = expression.value.trim();
    const cle = cleDeExpression(texte);
    existant = existantPour();
    erreurExpression.textContent = '';
    remplir(zoneExistant);
    if (!texte) remplir(apercu);
    else if (!cle) remplir(apercu, V.MESSAGE_NON_ENREGISTRABLE);
    else remplir(apercu, 'ChatGPT le reconnaîtra comme : ', h('strong', {}, `« ${cle} »`));
    if (existant) {
      erreurExpression.textContent = `Ce mot existe déjà (« ${existant.expression ?? existant.cle} »). Modifie-le plutôt que de le doubler.`;
      remplir(zoneExistant, h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'modifier-existant' }, onclick: () => fermerFenetre('modifier') }, 'Modifier ce mot'));
    }
    if (bouton) griserSelon(bouton, pret);
  }
  expression.addEventListener('input', majExpression);
  let enCours = false; // deux clics rapides ne créent pas deux fois le mot
  async function tenter() {
    if (enCours) return false;
    erreurExpression.textContent = ''; erreurArticle.textContent = ''; general.textContent = '';
    if (!pret()) { majExpression(); if (!expression.value.trim()) erreurExpression.textContent = 'Écris le mot ou l’expression que tu veux faire reconnaître.'; return false; }
    enCours = true;
    try {
      const r = await D.creerMotVocabulaire({ expression: expression.value, cibles: choix.valeur().map(({ genre, id }) => ({ genre, id })) });
      if (Object.keys(r.erreurs).length) {
        if (r.erreurs.expression) erreurExpression.textContent = r.erreurs.expression;
        if (r.erreurs.articleId) erreurArticle.textContent = choix.valeur().length ? r.erreurs.articleId : 'Choisis l’article du catalogue que ce mot désigne.';
        const autre = Object.entries(r.erreurs).find(([k]) => k !== 'expression' && k !== 'articleId');
        if (autre) general.textContent = autre[1];
        return false;
      }
      return true;
    } catch (e) {
      console.warn(e);
      general.textContent = ERREUR_ECRITURE;
      return false;
    } finally { enCours = false; }
  }
  const corps = h('div', { class: 'pile formulaire-creation' },
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'mot-expression' }, 'Mot ou expression'), expression, apercu, erreurExpression, zoneExistant),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Ce que le mot désigne : un article, plusieurs au choix, ou une famille'), choix.element, erreurArticle),
    general);
  const r = await dialogue({
    titre: 'Ajouter un mot appris',
    classe: 'dialogue-formulaire dialogue-vocabulaire',
    contenu: corps,
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
    auMontage: ({ boite, boutons, fermer }) => {
      fermerFenetre = fermer;
      bouton = boutons.at(-1);
      griserSelon(bouton, pret);
      boite.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || e.defaultPrevented || e.target !== expression) return;
        e.preventDefault();
        if (await tenter()) fermer(true);
      });
    },
  });
  choix.arreter();
  if (r === true) toast('Mot ajouté');
  return r === 'modifier' ? { modifier: existant } : null;
}

/** Changer l'article d'un mot : liste de recherche du catalogue. */
async function ouvrirChangerArticle(regle) {
  const actuel = articleDuMot(regle);
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  let bouton = null;
  const choix = selecteurArticle({ initial: V.articleChoisissable(actuel) ? actuel : null, surChoix: () => { general.textContent = ''; if (bouton) griserSelon(bouton, pret); } });
  const pret = () => Boolean(choix.valeur()) && choix.valeur().id !== regle.articleId;
  async function tenter() {
    general.textContent = '';
    if (!pret()) { general.textContent = 'Choisis un autre article du catalogue.'; return false; }
    try {
      const r = await D.changerArticleMot(regle.id, choix.valeur().id);
      const message = Object.values(r.erreurs)[0];
      if (message) { general.textContent = message; return false; }
      return true;
    } catch (e) { console.warn(e); general.textContent = ERREUR_ECRITURE; return false; }
  }
  const r = await dialogue({
    titre: 'Changer l’article',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('p', {}, 'Mot : ', h('strong', {}, `« ${regle.expression ?? regle.cle} »`)), choix.element, general),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); griserSelon(bouton, pret); },
  });
  choix.arreter();
  if (r === true) toast('Article changé');
  return r === true;
}

/** Changer ce que désigne un mot : plusieurs articles au choix (8 au plus). Un seul article choisi = le mot désigne cet article, comme avant. */
async function ouvrirChangerCibles(regle) {
  const actuels = choixVivants(regle);
  const cleDe = (c) => `${c.genre}:${c.id}`;
  const avant = designeDe(regle).cibles.map(cleDe).join('|'); // TOUTES les cibles, mortes comprises : les désactivées ne sont pas dans la fenêtre, donc enregistrer les retire ; « Enregistrer » reste grisé tant que rien n'a changé
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  let bouton = null;
  const choix = selecteurArticle({ mode: 'mixte', initial: actuels, surChoix: () => { general.textContent = ''; if (bouton) griserSelon(bouton, pret); } });
  const pret = () => choix.valeur().length > 0 && choix.valeur().map(cleDe).join('|') !== avant;
  async function tenter() {
    general.textContent = '';
    if (!pret()) { general.textContent = choix.valeur().length ? 'Choisis autre chose : c’est déjà ce que désigne le mot.' : 'Choisis au moins un article ou une famille du catalogue.'; return false; }
    try {
      const r = await D.changerCiblesMot(regle.id, choix.valeur().map(({ genre, id }) => ({ genre, id })));
      const message = Object.values(r.erreurs)[0];
      if (message) { general.textContent = message; return false; }
      return true;
    } catch (e) { console.warn(e); general.textContent = ERREUR_ECRITURE; return false; }
  }
  const r = await dialogue({
    titre: 'Changer ce que le mot désigne',
    classe: 'dialogue-formulaire dialogue-vocabulaire',
    contenu: h('div', { class: 'pile' }, h('p', {}, 'Mot : ', h('strong', {}, `« ${regle.expression ?? regle.cle} »`)), h('p', { class: 'discret' }, 'Plusieurs articles, ou une famille : ChatGPT demande lequel, seulement parmi eux.'), choix.element, general),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); griserSelon(bouton, pret); },
  });
  choix.arreter();
  if (r === true) toast('Ce que le mot désigne a changé');
  return r === true;
}

/** La note d'un mot (remarque pour la revue). */
async function ouvrirNote(regle) {
  const champ = h('textarea', { class: 'champ', rows: 4, maxlength: V.MAX_NOTE, 'aria-label': 'Note', placeholder: 'Exemple : le client dit « tableau » pour le 2 rangées, jamais le 4 rangées.', dataset: { champ: 'note' } });
  champ.value = regle.note ?? '';
  const general = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'general' } });
  async function tenter() {
    general.textContent = '';
    try {
      const r = await D.noterMot(regle.id, champ.value);
      const message = Object.values(r.erreurs)[0];
      if (message) { general.textContent = message; return false; }
      return true;
    } catch (e) { console.warn(e); general.textContent = ERREUR_ECRITURE; return false; }
  }
  const r = await dialogue({
    titre: 'Note',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('p', {}, 'Mot : ', h('strong', {}, `« ${regle.expression ?? regle.cle} »`)), champ, general),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
  });
  if (r === true) toast('Note enregistrée');
}

// ---------------------------------------------------------------- écran
const pastille = (libelle, couleur, attrs = {}) => h('span', { class: 'pastille-statut', style: { '--couleur': couleur }, ...attrs }, libelle);

/** Ce que ton assistant comprendrait d'une phrase : calcul local avec le moteur (même code que le serveur), rien n'est enregistré. */
function resultatEssai(phrase) {
  if (!phrase.trim()) return [];
  const r = interpreter(phrase, { regles: D.etat.vocabulaire, articles: D.etat.articles, reglages: D.etat.reglages, usages: D.etat.usages, familles: D.etat.familles }); // le même moteur que le serveur, usage et familles compris
  const premier = r.candidats[0];
  const nombreFr = (n) => String(n).replace('.', ',');
  const lignes = [];
  if (r.cle) lignes.push(h('p', { dataset: { role: 'essai-cle' } }, 'Mot cherché : ', h('strong', {}, `« ${r.cle} »`), ` · quantité ${nombreFr(r.quantite)}`, r.prixVente != null ? ` · prix dit ${nombreFr(r.prixVente)} €` : ''));
  if (r.portee) lignes.push(h('p', { dataset: { role: 'essai-portee' } }, V.phrasePortee(r.portee, D.etat.familles, D.etat.articles)));
  if (r.decision === 'utiliser') {
    const prix = r.prixVente ?? premier?.prixVenteHT;
    lignes.push(h('p', { dataset: { role: 'essai-decision' } }, 'ChatGPT l’ajouterait tout de suite : ', h('strong', {}, `${nombreFr(r.quantite)} × « ${premier.libelle} »`), typeof prix === 'number' ? ` à ${A.formaterPrix(prix)} HT l’unité` : '', '.'));
  } else {
    lignes.push(h('p', { dataset: { role: 'essai-decision' } }, r.decision === 'proposer' ? 'ChatGPT poserait la question : ' : 'ChatGPT demanderait : ', h('strong', {}, r.question)));
  }
  return lignes;
}

export function rendreVocabulaire(conteneur) {
  const titre = h('h1', {}, 'Vocabulaire');
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite', dataset: { role: 'phrase-etat' } });
  const zone = h('div', { class: 'zone-liste-vocabulaire' });
  const avis = h('div', { class: 'avis-lecture', hidden: true });
  const champRecherche = h('input', {
    class: 'champ', type: 'search', 'aria-label': 'Rechercher un mot appris', placeholder: 'Rechercher un mot appris', autocomplete: 'off', value: recherche,
    oninput: (e) => { recherche = e.target.value; rendre(); },
  });
  const filtres = boutonFiltresCommun({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'statuts', libelle: 'Statut', type: 'cases', options: V.STATUTS.map((s) => ({ valeur: s.id, libelle: s.libelle })) },
        { cle: 'origines', libelle: 'Origine', type: 'cases', options: V.ORIGINES.map((o) => ({ valeur: o.id, libelle: o.libelle })) },
        { cle: 'aTrancher', libelle: 'À trancher seulement', type: 'oui' },
        { cle: 'tropGeneral', libelle: 'Mot trop général', type: 'oui' },
      ],
      criteres,
      effacer: () => ({ ...V.CRITERES_VOCABULAIRE_VIDES }),
    });
    if (r) { criteres = { statuts: r.statuts ?? [], origines: r.origines ?? [], aTrancher: !!r.aTrancher, tropGeneral: !!r.tropGeneral }; rendre(); }
  } });
  const choixTri = selecteurTri({ options: V.CRITERES_TRI, valeur: tri.critere, sens: tri.sens, surChangement: (t) => { tri = { critere: t.critere, sens: t.sens }; rendre(); } });
  const boutonRetour = h('a', { class: 'lien-retour', href: lien('devis/liste'), dataset: { action: 'retour-devis' } }, icone('chevron-left', { taille: 16 }), 'Devis');
  const boutonMenu = h('button', {
    type: 'button', class: 'bouton-icone', 'aria-label': 'Autres actions', 'aria-haspopup': 'menu', dataset: { action: 'menu-vocabulaire' },
    onclick: (e) => ouvrirMenu(e.currentTarget, [{
      libelle: 'Exporter le vocabulaire (CSV)', icone: 'download', desactive: !D.etat.vocabulaire.length, titreInfo: D.etat.vocabulaire.length ? null : 'Aucun mot à exporter pour l’instant.',
      action: () => { telecharger(nomFichierExport(new Date(), 'vocabulaire'), V.construireCsv(D.etat.vocabulaire.map(motPourExport)), 'text/csv;charset=utf-8'); toast('Fichier téléchargé'); },
    }]),
  }, icone('ellipsis', { taille: 20 }));
  const ajout = ligneAjouter({ libelle: 'Mot appris', libelleAria: 'Ajouter un mot appris', action: 'ajouter-mot', surClic: async () => {
    const r = await ouvrirCreation();
    if (r?.modifier) await (designeDe(r.modifier).multiple ? ouvrirChangerCibles : ouvrirChangerArticle)(r.modifier); // un mot à plusieurs articles s'ouvre avec ses puces, jamais remplacé en silence par un seul article
  } });

  // Essayer une phrase : calcul local, rien n'est enregistré.
  const resultat = h('div', { class: 'essai-resultat', 'aria-live': 'polite', dataset: { role: 'essai-resultat' } });
  const champEssai = h('input', {
    type: 'text', class: 'champ', id: 'vocabulaire-essai', autocomplete: 'off', placeholder: 'Exemple : mets 3 prises doubles à 25 €', value: essai, dataset: { champ: 'essai' },
    oninput: (e) => { essai = e.target.value; remplir(resultat, ...resultatEssai(essai)); },
  });
  const blocEssai = h('div', { class: 'bloc-essai' },
    h('div', { class: 'ligne-etiquette-info' }, h('label', { class: 'etiquette', for: 'vocabulaire-essai' }, 'Essayer une phrase'), iconeInfo('Montre ce que ChatGPT comprendrait. Rien n’est enregistré.', 'Essayer une phrase')),
    champEssai, resultat);

  const noteMotMetier = h('p', { class: 'aide', dataset: { zone: 'mot-metier' } });
  const rendreNoteMotMetier = () => remplir(noteMotMetier, 'Le mot « ', motOuvrage(D.etat.reglages).singulier, ' » (le nom de tes articles composés) se choisit dans ',
    h('a', { href: lien('reglages/devis/reglages-devis') }, 'Réglages > Devis'), '.'); // refait à chaque changement : les réglages arrivent après l'écran

  const aucunFiltre = () => !recherche.trim() && V.nombreFiltres(criteres) === 0;
  function toutEffacer() { recherche = ''; champRecherche.value = ''; criteres = { ...V.CRITERES_VOCABULAIRE_VIDES }; rendre(); }

  async function agir(regle, faire, messageSucces = null) {
    erreursLigne.delete(regle.id);
    try {
      const r = await faire();
      const message = Object.values(r?.erreurs ?? {})[0];
      if (message) erreursLigne.set(regle.id, message);
      else if (messageSucces) toast(messageSucces);
    } catch (e) {
      console.warn(e);
      erreursLigne.set(regle.id, ERREUR_ECRITURE);
    }
    rendre();
  }
  const activer = (r) => agir(r, () => D.changerStatutMot(r.id, 'active'), V.estATrancher(r) ? 'Article gardé' : 'Mot activé');
  async function desactiver(r) {
    erreursLigne.delete(r.id);
    const avant = r.statut;
    await retirerAvecAnnulation({
      titre: 'Désactiver ce mot ?',
      message: MESSAGE_DESACTIVER,
      libelleOk: 'Désactiver',
      faire: async () => { const x = await D.changerStatutMot(r.id, 'desactivee'); if (Object.keys(x.erreurs).length) throw new Error(Object.values(x.erreurs)[0]); },
      defaire: async () => { const x = await D.changerStatutMot(r.id, avant, { restaurer: true }); if (Object.keys(x.erreurs).length) throw new Error(Object.values(x.erreurs)[0]); },
      messageFait: 'Mot retiré',
      messageErreur: 'Désactivation impossible : réessaie dans un instant, ou demande à un éditeur de l’espace.',
    });
  }
  const menuMot = (r) => {
    const d = designeDe(r);
    const mort = d.mort;
    return [
      ...(V.estATrancher(r) || r.statut !== 'active' ? [{ libelle: V.estATrancher(r) ? 'Garder cet article' : 'Activer', icone: 'check', desactive: mort, titreInfo: mort ? (d.multiple ? V.MESSAGE_CIBLES_INDISPONIBLES : 'L’article de ce mot est désactivé : change d’abord l’article.') : null, action: () => activer(r) }] : []),
      ...(r.statut !== 'desactivee' ? [{ libelle: 'Désactiver', icone: 'archive', action: () => desactiver(r) }] : []),
      ...(mort ? [] : d.multiple
        ? [{ libelle: 'Changer ce que le mot désigne', icone: 'pencil', action: () => ouvrirChangerCibles(r).then(() => rendre()) }]
        : [{ libelle: 'Changer l’article', icone: 'pencil', action: () => ouvrirChangerArticle(r).then(() => rendre()) },
          { libelle: 'Désigner une famille ou plusieurs articles', icone: 'plus', action: () => ouvrirChangerCibles(r).then(() => rendre()) }]),
      { libelle: r.note ? 'Modifier la note' : 'Ajouter une note', icone: 'sticky-note', action: () => ouvrirNote(r) },
    ];
  };

  function celluleMot(r, tropGeneral) {
    const message = erreursLigne.get(r.id);
    const suggestion = r.statut === 'desactivee' ? null : suggestionEnAttente(r);
    return h('td', { dataset: { colonne: 'mot', libelle: 'Mot' } },
      h('strong', { class: 'mot-expression' }, r.expression ?? r.cle),
      r.note ? h('p', { class: 'mot-note discret', dataset: { role: 'note' } }, r.note) : null,
      suggestion ? h('p', { class: 'mot-suggestion discret', dataset: { role: 'suggestion' } }, `ChatGPT propose : ${suggestion.articleLibelle || 'un autre article'}${suggestion.contradictions ? ` (${suggestion.contradictions} ${suggestion.contradictions > 1 ? 'contradictions' : 'contradiction'})` : ''}`) : null,
      tropGeneral ? h('p', { class: 'mot-general' }, pastille('Mot trop général', '#8d8993', { dataset: { role: 'trop-general' } })) : null,
      message ? h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'ligne' } }, message) : null);
  }
  function celluleArticle(r) {
    const d = designeDe(r);
    const cellule = h('td', { dataset: { colonne: 'article', libelle: 'Désigne' } });
    if (!d.multiple) {
      const mort = d.mort;
      remplir(cellule,
        h('a', { class: 'lien-article', href: lien('devis/bordereau') }, libelleArticle(r) || '—'),
        mort ? h('div', { class: 'article-mort' }, pastille('Article désactivé', '#8d8993', { dataset: { role: 'article-desactive' } }),
          h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'changer-article' }, 'aria-label': `Changer l’article : ${r.expression ?? r.cle}`, onclick: () => ouvrirChangerArticle(r).then(() => rendre()) }, 'Changer l’article')) : null);
      return cellule;
    }
    // Plusieurs articles au choix, une famille, ou un mélange : « 3 articles au choix », « Famille Prises (12 articles) », « Famille Prises + 2 articles » se déplient en liste.
    // Aucune cible vivante = « Aucun article disponible » ; des cibles vivantes mais aucun article (une famille vide) = « Famille vide ».
    const ouvert = ciblesOuvertes.has(r.id);
    const resume = V.resumeDesigne(d);
    const nomCible = (c) => (c.genre === 'famille'
      ? (c.vivant ? h('span', {}, `Famille ${c.libelle} (${c.nombreArticles ? `${c.nombreArticles} ${c.nombreArticles > 1 ? 'articles' : 'article'}` : 'vide'})`) : h('span', { class: 'discret' }, `Famille ${c.libelle || '—'} (désactivée)`))
      : (c.vivant ? h('a', { class: 'lien-article', href: lien('devis/bordereau') }, c.libelle) : h('span', { class: 'discret' }, `${c.libelle || '—'} (désactivé)`)));
    remplir(cellule,
      h('button', { type: 'button', class: 'bouton-lien', 'aria-expanded': String(ouvert), dataset: { action: 'cibles' }, 'aria-label': `${resume} : ${r.expression ?? r.cle}`, onclick: () => {
        if (ciblesOuvertes.has(r.id)) ciblesOuvertes.delete(r.id); else ciblesOuvertes.add(r.id);
        rendre();
        document.querySelector(`tr[data-id="${CSS.escape(r.id)}"] [data-action="cibles"]`)?.focus();
      } }, resume),
      ouvert ? h('ul', { class: 'liste-cibles', dataset: { role: 'cibles' } }, d.cibles.map((c) => h('li', { dataset: c.genre === 'article' ? { articleId: c.id } : { familleId: c.id } }, nomCible(c)))) : null,
      d.mort ? h('div', { class: 'article-mort' }, pastille('Aucun article disponible', '#8d8993', { dataset: { role: 'aucun-article-disponible' } }),
        h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'changer-article' }, 'aria-label': `Changer ce que le mot désigne : ${r.expression ?? r.cle}`, onclick: () => ouvrirChangerCibles(r).then(() => rendre()) }, 'Changer ce que le mot désigne'))
        : d.vide ? h('div', { class: 'article-mort' }, pastille('Famille vide', '#8d8993', { dataset: { role: 'famille-vide' } })) : null);
    return cellule;
  }
  function celluleExemples(r) {
    const liste = r.exemples ?? [];
    const cellule = h('td', { dataset: { colonne: 'exemples', libelle: 'Exemples' } });
    if (!liste.length) { remplir(cellule, h('span', { class: 'discret' }, '—')); return cellule; }
    function dessiner() {
      const ouvert = exemplesOuverts.has(r.id);
      remplir(cellule,
        h('button', { type: 'button', class: 'bouton-lien', 'aria-expanded': String(ouvert), dataset: { action: 'exemples' }, onclick: () => {
          if (exemplesOuverts.has(r.id)) exemplesOuverts.delete(r.id); else exemplesOuverts.add(r.id);
          dessiner();
          cellule.querySelector('[data-action="exemples"]')?.focus();
        } }, `${liste.length} ${liste.length > 1 ? 'phrases' : 'phrase'}`),
        ouvert ? h('ul', { class: 'exemples-vocabulaire', dataset: { role: 'exemples' } }, liste.map((p) => h('li', {}, p))) : null);
    }
    dessiner();
    return cellule;
  }
  function ligneMot(r, tropGeneral) {
    const statut = V.STATUTS.find((s) => s.id === r.statut);
    const validation = V.validationDe(r);
    return h('tr', { class: `ligne-liste ligne-mot${r.statut === 'desactivee' ? ' mot-desactive' : ''}`, dataset: { id: r.id, statut: r.statut } },
      celluleMot(r, tropGeneral),
      celluleArticle(r),
      h('td', { dataset: { colonne: 'origine', libelle: 'Origine' } }, V.libelleOrigine(r.origine)),
      h('td', { dataset: { colonne: 'confirmations', libelle: 'Confirmations' } }, V.compteursAffiches(r)),
      h('td', { dataset: { colonne: 'utilisation', libelle: 'Dernière utilisation' } }, V.jourAffiche(r)),
      celluleExemples(r),
      h('td', { dataset: { colonne: 'statut', libelle: 'Statut' } },
        pastille(statut?.libelle ?? V.libelleStatut(r.statut), statut?.couleur ?? '#8d8993', { dataset: { role: 'statut' } }),
        V.estATrancher(r) ? pastille('À trancher', '#e5484d', { dataset: { role: 'a-trancher' } }) : null,
        validation && validation.id !== 'a_valider' ? h('p', { class: 'mot-validation discret', dataset: { role: 'validation', validation: validation.id } }, validation.libelle) : null),
      h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${r.expression ?? r.cle}`, 'aria-haspopup': 'menu', dataset: { action: 'menu-mot' }, onclick: (e) => ouvrirMenu(e.currentTarget, menuMot(r)) }, icone('ellipsis', { taille: 18 }))));
  }

  function rendre() {
    rendreNoteMotMetier();
    const tous = D.etat.vocabulaire;
    filtres.majCompte(V.nombreFiltres(criteres));
    choixTri.maj(V.CRITERES_TRI, tri.critere, tri.sens);
    const enErreur = D.etat.erreurLectureVocabulaire;
    remplir(avis, enErreur ? h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' } }, ERREUR_LECTURE) : null,
      enErreur ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => D.relancerVocabulaire() }, icone('refresh-cw', { taille: 16 }), 'Réessayer') : null);
    avis.hidden = !enErreur;
    if (!D.estPretVocabulaire()) { remplir(compteur); remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    const tropGeneral = tropGeneralPour(D.etat.articles);
    const lignes = V.trierMots(V.filtrerMots(tous, criteres, recherche, tropGeneral), tri);
    remplir(compteur, V.phraseEtat(tous), lignes.length !== tous.length ? ` · ${lignes.length} affiché${lignes.length > 1 ? 's' : ''}` : '');
    if (!lignes.length) {
      if (!tous.length) { remplir(zone, enErreur ? null : etatVide(MESSAGE_VIDE)); return; }
      remplir(zone, etatVide('Aucun mot ne correspond à ces filtres.', { action: h('button', { type: 'button', class: 'bouton-lien', dataset: { action: 'tout-effacer' }, onclick: toutEffacer }, 'Tout effacer') }));
      return;
    }
    const colonnes = ['Mot', 'Désigne', 'Origine', 'Confirmations', 'Dernière utilisation', 'Exemples', 'Statut'];
    const entete = h('tr', {}, colonnes.map((c) => h('th', { scope: 'col' }, h('span', { class: 'tri titre-colonne' }, c))), h('th', { class: 'col-actions', 'aria-label': 'Actions' }));
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-vocabulaire' }, h('thead', {}, entete),
      h('tbody', {}, lignes.map((r) => ligneMot(r, r.statut === 'a_confirmer' && tropGeneral(r)))))));
  }

  conteneur.append(h('div', { class: 'page page-liste page-devis page-vocabulaire' },
    h('header', { class: 'page-tete' }, h('div', {}, boutonRetour, titre, compteur), h('div', { class: 'page-actions' }, boutonMenu)),
    h('div', { class: 'barre-affaires' }, champRecherche, filtres.element, choixTri.element),
    ajout, blocEssai, noteMotMetier, avis, zone));

  remplir(resultat, ...resultatEssai(essai));
  const rafraichir = planifier(() => { rendre(); remplir(resultat, ...resultatEssai(essai)); });
  rendre();
  const arret = D.surChangement(rafraichir);
  return () => { arret(); };
}
