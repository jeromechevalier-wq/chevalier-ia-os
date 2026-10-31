// Sélecteur du catalogue (PR C1 de docs/cadrage-vocabulaire-cibles.md) : un champ de recherche dès la première lettre (8 résultats) et, dessous, l'arbre
// famille › sous-famille › articles qui se déplie. Mode `article` : un seul article choisi (« Changer l'article » de l'écran Vocabulaire). Mode `articles` (PR C5b) : plusieurs articles au choix,
// des puces sous la recherche, 8 au plus (au-delà, les autres articles sont grisés avec un message) ; un clic sur un article choisi le retire.
// Mode `mixte` (PR C6b) : articles ET familles ; chaque famille de l'arbre a un bouton « Choisir cette famille », la recherche a deux groupes (« Familles », « Articles »), les choix sont des
// `{ genre: 'article' | 'famille', id, libelle }` (le libellé d'une famille est son chemin « Fournitures › Carrelage »).
// Aucune règle ici : l'arbre vient de selecteur-catalogue-logique.js, le filtre de articles.js.
import { h, icone, remplir } from '../../os/ui.js';
import * as A from './articles.js';
import { cheminFamille } from './familles.js';
import {
  arbreCatalogue, cheminDansArbre, rechercherFamilles, familleChoisissable, ID_SANS_FAMILLE,
  MESSAGE_CATALOGUE_VIDE, MESSAGE_FAMILLE_SANS_ARTICLE, MESSAGE_AUCUN_RESULTAT, MESSAGE_AUCUN_RESULTAT_MIXTE,
} from './selecteur-catalogue-logique.js';

export const MESSAGE_CATALOGUE_CHARGEMENT = 'Chargement du catalogue…';
export const MESSAGE_CATALOGUE_ILLISIBLE = 'La liste du catalogue n’a pas pu être mise à jour. Vérifie ta connexion puis recharge la page.';
const MAX_RESULTATS = 8;
export const MAX_CHOIX = 8; // même limite que `SEUILS.maxCibles` et les règles Firestore
export const MESSAGE_MAXIMUM = '8 au plus : retire-en un d’abord.';

/**
 * `source` : { articles(), familles(), estChoisissable(article), enErreur()?, pret()?, surChangement(rappel)? -> arrêt }. `initial` : l'article déjà choisi ou null (mode `articles` : la liste des articles déjà choisis ;
 * mode `mixte` : la liste des `{ genre, id, libelle }` déjà choisis). `surChoix(article)` est appelé à chaque choix (modes `articles` et `mixte` : `surChoix(liste)`, `valeur()` rend la liste).
 * Rend { element, valeur(), focus(), arreter() } : `arreter()` libère l'abonnement, à appeler quand la fenêtre est fermée.
 */
export function selecteurCatalogue({ source, mode = 'article', initial = null, surChoix = () => {} } = {}) {
  const mixte = mode === 'mixte';
  const plusieurs = mode === 'articles' || mixte;
  const genreDe = (x) => x?.genre ?? 'article'; // les articles du mode `articles` sont des articles du catalogue, sans `genre`
  /** En mode `mixte`, un article choisi devient `{ genre: 'article', id, libelle }` (comme une famille) : la liste ne garde pas l'objet du catalogue. */
  const choixArticle = (a) => (mixte ? { genre: 'article', id: a.id, libelle: a.libelle ?? '' } : a);
  const choixFamille = (f) => ({ genre: 'famille', id: f.id, libelle: f.chemin ?? cheminFamille(source.familles(), f.id) ?? f.nom ?? '' });
  let choisi = plusieurs ? null : initial;
  let liste = plusieurs ? [...(Array.isArray(initial) ? initial : initial ? [initial] : [])].slice(0, MAX_CHOIX) : [];
  const estChoisi = (id, genre = 'article') => (plusieurs ? liste.some((x) => x.id === id && genreDe(x) === genre) : choisi?.id === id);
  const complet = () => plusieurs && liste.length >= MAX_CHOIX;
  const ouverts = new Set();
  let touche = false; // dès que l'utilisateur agit dans l'arbre, on ne le fait plus défiler tout seul
  const dernier = () => (plusieurs ? liste.filter((x) => genreDe(x) === 'article').at(-1) ?? null : choisi); // seul un article se montre dans l'arbre
  const cheminChoisi = () => (dernier() ? cheminDansArbre(arbreCatalogue(source.articles(), source.familles(), source.estChoisissable), dernier().id) : []);
  const cheminOuvert = () => cheminChoisi().every((id) => ouverts.has(id));
  const ouvrirChemin = () => cheminChoisi().forEach((id) => ouverts.add(id));
  ouvrirChemin();
  const champ = h('input', {
    type: 'search', class: 'champ', autocomplete: 'off', 'aria-label': 'Chercher un article du catalogue', placeholder: mixte ? 'Chercher un article ou une famille' : 'Chercher un article du catalogue', dataset: { champ: 'recherche-article' },
    oninput: () => { dessinerResultats(); dessinerArbre(); },
  });
  const resultats = h('ul', { class: 'resultats-composants', role: 'listbox', 'aria-label': mixte ? 'Familles et articles trouvés' : 'Articles trouvés', hidden: true });
  const resume = h('p', { class: 'article-choisi', 'aria-live': 'polite', dataset: { role: 'article-choisi' } });
  const puces = h('ul', { class: 'puces-choix', 'aria-label': mixte ? 'Choix faits' : 'Articles choisis', hidden: true, dataset: { role: 'puces' } });
  const limite = h('p', { class: 'discret', role: 'status', hidden: true, dataset: { role: 'maximum' } }, MESSAGE_MAXIMUM);
  const arbre = h('div', {
    class: 'arbre-catalogue', 'aria-label': 'Catalogue par famille', dataset: { role: 'arbre-catalogue' },
    onpointerdown: () => { touche = true; }, onkeydown: () => { touche = true; }, onwheel: () => { touche = true; },
  });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'catalogue' } }, MESSAGE_CATALOGUE_ILLISIBLE);

  /** Ajoute ou retire un choix (article ou famille) en mode `articles` ou `mixte` ; `true` si la liste a changé. */
  function basculer(genre, id, fabriquer) {
    if (estChoisi(id, genre)) liste = liste.filter((x) => !(x.id === id && genreDe(x) === genre));
    else if (complet()) { limite.hidden = false; return false; } // 8 au plus : le message dit quoi faire, rien ne change
    else liste = [...liste, fabriquer()];
    return true;
  }
  function apresChoix() {
    const aLeFocus = resultats.contains(document.activeElement);
    champ.value = ''; dessinerResultats(); dessinerChoix(); dessinerArbre(); surChoix([...liste]);
    if (aLeFocus) champ.focus(); // on enchaîne 3 à 8 choix : le focus clavier revient dans la recherche
  }
  function choisir(a) {
    if (plusieurs) { if (basculer('article', a.id, () => choixArticle(a))) apresChoix(); return; }
    choisi = a; champ.value = ''; dessinerResultats(); dessinerChoix(); dessinerArbre(); surChoix(a);
  }
  function choisirFamille(f) { if (basculer('famille', f.id, () => choixFamille(f))) apresChoix(); }
  function retirer(x) { liste = liste.filter((y) => !(y.id === x.id && genreDe(y) === genreDe(x))); dessinerResultats(); dessinerChoix(); dessinerArbre(); surChoix([...liste]); }
  const phraseChoix = () => {
    const nf = liste.filter((x) => genreDe(x) === 'famille').length;
    const na = liste.length - nf;
    if (!nf) return liste.length === 1 ? h('span', {}, 'Article choisi : ', h('strong', {}, liste[0].libelle)) : h('span', {}, h('strong', {}, `${liste.length} articles au choix`), ` (${MAX_CHOIX} au plus)`);
    if (!na && nf === 1) return h('span', {}, 'Famille choisie : ', h('strong', {}, liste[0].libelle));
    return h('span', {}, h('strong', {}, [nf === 1 ? '1 famille' : `${nf} familles`, na ? `${na} ${na > 1 ? 'articles' : 'article'}` : ''].filter(Boolean).join(' + ')), ` (${MAX_CHOIX} choix au plus)`);
  };
  function dessinerChoix() {
    if (!plusieurs) {
      remplir(resume, choisi ? h('span', {}, 'Article choisi : ', h('strong', {}, choisi.libelle)) : h('span', { class: 'discret' }, 'Aucun article choisi.'));
      return;
    }
    remplir(resume, !liste.length ? h('span', { class: 'discret' }, mixte ? 'Rien de choisi.' : 'Aucun article choisi.') : phraseChoix());
    puces.hidden = liste.length < 1;
    remplir(puces, ...liste.map((x) => (genreDe(x) === 'famille'
      ? h('li', { class: 'puce-choix puce-famille', dataset: { puce: `famille:${x.id}` } }, h('span', {}, `Famille ${x.libelle}`),
        h('button', { type: 'button', class: 'bouton-icone puce-retirer', 'aria-label': `Retirer la famille « ${x.libelle} »`, dataset: { action: 'retirer-famille', familleId: x.id }, onclick: () => retirer(x) }, icone('x', { taille: 14 })))
      : h('li', { class: 'puce-choix', dataset: { puce: x.id } }, h('span', {}, x.libelle),
        h('button', { type: 'button', class: 'bouton-icone puce-retirer', 'aria-label': `Retirer « ${x.libelle} »`, dataset: { action: 'retirer-article', articleId: x.id }, onclick: () => retirer(x) }, icone('x', { taille: 14 }))))));
    limite.hidden = !complet();
  }
  const boutonResultatArticle = (a) => h('li', { role: 'option' }, h('button', { type: 'button', class: `resultat-composant${plusieurs && estChoisi(a.id) ? ' choisi' : ''}`, 'aria-disabled': plusieurs ? String(complet() && !estChoisi(a.id)) : undefined, 'aria-pressed': plusieurs ? String(estChoisi(a.id)) : undefined, dataset: { articleId: a.id }, onclick: () => choisir(a) },
    h('span', {}, a.libelle), h('span', { class: 'discret' }, a.unite ?? '')));
  const boutonResultatFamille = (f) => h('li', { role: 'option' }, h('button', { type: 'button', class: `resultat-composant resultat-famille${estChoisi(f.id, 'famille') ? ' choisi' : ''}`, 'aria-disabled': String(complet() && !estChoisi(f.id, 'famille')), 'aria-pressed': String(estChoisi(f.id, 'famille')), dataset: { familleId: f.id }, onclick: () => choisirFamille(f) },
    h('span', {}, f.chemin), h('span', { class: 'discret' }, 'Famille')));
  function dessinerResultats() {
    const texte = champ.value.trim();
    if (!texte) { remplir(resultats); resultats.hidden = true; return; }
    const trouves = A.filtrerArticles(source.articles(), { recherche: texte, statut: 'actifs' }).filter(source.estChoisissable).slice(0, MAX_RESULTATS);
    resultats.hidden = false;
    if (!mixte) {
      remplir(resultats, ...(trouves.length ? trouves.map(boutonResultatArticle) : [h('li', { class: 'discret', role: 'option', 'aria-disabled': 'true' }, MESSAGE_AUCUN_RESULTAT)]));
      return;
    }
    const famillesTrouvees = rechercherFamilles(source.familles(), texte, MAX_RESULTATS);
    if (!trouves.length && !famillesTrouvees.length) { remplir(resultats, h('li', { class: 'discret', role: 'option', 'aria-disabled': 'true' }, MESSAGE_AUCUN_RESULTAT_MIXTE)); return; }
    remplir(resultats,
      ...(famillesTrouvees.length ? [h('li', { class: 'groupe-resultats', role: 'presentation', dataset: { groupe: 'familles' } }, 'Familles'), ...famillesTrouvees.map(boutonResultatFamille)] : []),
      ...(trouves.length ? [h('li', { class: 'groupe-resultats', role: 'presentation', dataset: { groupe: 'articles' } }, 'Articles'), ...trouves.map(boutonResultatArticle)] : []));
  }

  function ligneArticle(a) {
    const coche = estChoisi(a.id);
    return h('li', {}, h('button', { type: 'button', class: `arbre-article${coche ? ' choisi' : ''}`, 'aria-pressed': String(coche), 'aria-disabled': plusieurs ? String(complet() && !coche) : undefined, dataset: { arbreArticle: a.id }, onclick: () => choisir(a) },
      h('span', {}, a.libelle), h('span', { class: 'discret' }, a.unite ?? '')));
  }
  function ligneFamille(f) {
    const ouvert = ouverts.has(f.id);
    const reelle = mixte && f.id !== ID_SANS_FAMILLE && familleChoisissable((source.familles() ?? []).find((x) => x.id === f.id)); // « Sans famille » n'est pas une famille qu'on peut choisir
    const coche = reelle && estChoisi(f.id, 'famille');
    const entete = h('button', { type: 'button', class: 'arbre-entete', 'aria-expanded': String(ouvert), dataset: { arbreFamille: f.id },
      onclick: () => { if (ouverts.has(f.id)) ouverts.delete(f.id); else ouverts.add(f.id); dessinerArbre(); } },
    icone(ouvert ? 'chevron-down' : 'chevron-right', { taille: 16 }), h('span', { class: 'arbre-nom' }, f.nom), h('span', { class: 'discret arbre-nombre' }, String(f.nombre)));
    const choisirCette = reelle ? h('button', { type: 'button', class: `bouton bouton-secondaire bouton-petit arbre-choisir-famille${coche ? ' choisi' : ''}`, 'aria-pressed': String(coche), 'aria-disabled': String(complet() && !coche),
      'aria-label': `${coche ? 'Retirer' : 'Choisir'} la famille ${f.nom}`, dataset: { choisirFamille: f.id }, onclick: () => choisirFamille({ id: f.id, nom: f.nom }) }, coche ? 'Famille choisie' : 'Choisir cette famille') : null;
    return h('li', { class: `arbre-famille niveau-${f.niveau}` },
      reelle ? h('div', { class: 'arbre-ligne-famille' }, entete, choisirCette) : entete,
      ouvert ? h('ul', { class: 'arbre-contenu' },
        f.enfants.map(ligneFamille), f.articles.map(ligneArticle),
        f.nombre === 0 ? h('li', { class: 'discret arbre-vide', dataset: { vide: 'famille' } }, MESSAGE_FAMILLE_SANS_ARTICLE) : null) : null);
  }
  function dessinerArbre() {
    erreur.hidden = !source.enErreur?.(); // la liste précédente reste affichée sous le message (comme l'écran Vocabulaire)
    arbre.hidden = champ.value.trim() !== ''; // pendant la recherche, la liste des résultats suffit
    if (arbre.hidden) return;
    const actif = arbre.contains(document.activeElement) ? { ...document.activeElement.dataset } : null; // un redessin ne fait pas perdre la place au clavier
    if (source.pret && !source.pret() && !source.articles().length) {
      remplir(arbre, h('p', { class: 'discret', dataset: { vide: 'chargement' } }, MESSAGE_CATALOGUE_CHARGEMENT));
      return;
    }
    const noeuds = arbreCatalogue(source.articles(), source.familles(), source.estChoisissable);
    // Catalogue sans article : le message et le lien vers le catalogue ; en mode `mixte` les familles restent sous le message (on peut choisir une famille qui se remplira demain).
    const sansArticle = noeuds.every((n) => n.nombre === 0);
    const messageVide = h('p', { class: 'discret', dataset: { vide: 'catalogue' } }, MESSAGE_CATALOGUE_VIDE, ' ', h('a', { href: '#/devis/bordereau' }, 'Ouvrir le catalogue'));
    if (!noeuds.length || (sansArticle && !mixte)) { remplir(arbre, messageVide); return; }
    remplir(arbre, sansArticle ? messageVide : null, h('ul', { class: 'arbre-racine' }, noeuds.map(ligneFamille)));
    if (actif?.arbreFamille) arbre.querySelector(`[data-arbre-famille="${actif.arbreFamille}"]`)?.focus();
    else if (actif?.choisirFamille) arbre.querySelector(`[data-choisir-famille="${actif.choisirFamille}"]`)?.focus();
    else if (actif?.arbreArticle) arbre.querySelector(`[data-arbre-article="${actif.arbreArticle}"]`)?.focus();
  }
  /** Montre l'article déjà choisi dans le cadre défilant de l'arbre. */
  const montrerChoisi = () => arbre.querySelector('.arbre-article.choisi')?.scrollIntoView?.({ block: 'nearest' });

  const element = h('div', { class: 'pile selecteur-article selecteur-catalogue', dataset: { mode } }, champ, resultats, resume, puces, limite, erreur, arbre);
  dessinerChoix();
  dessinerArbre();
  // Le catalogue peut arriver après l'ouverture de la fenêtre : l'arbre et les résultats se redessinent à chaque changement, jusqu'à `arreter()`.
  const arreterAbonnement = source.surChangement?.(() => {
    const aOuvrir = Boolean(dernier()) && !cheminOuvert();
    if (aOuvrir) ouvrirChemin();
    dessinerResultats(); dessinerArbre();
    if (dernier() && (aOuvrir || !touche)) requestAnimationFrame(montrerChoisi); // le catalogue arrivé tard peut pousser l'article hors du cadre
  });
  const arreter = () => arreterAbonnement?.();
  requestAnimationFrame(montrerChoisi);
  return { element, valeur: () => (plusieurs ? [...liste] : choisi), focus: () => champ.focus(), arreter };
}
