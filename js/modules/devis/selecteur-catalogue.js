// Sélecteur du catalogue (PR C1 de docs/cadrage-vocabulaire-cibles.md) : un champ de recherche dès la première lettre (8 résultats) et, dessous, l'arbre
// famille › sous-famille › articles qui se déplie. Mode `article` : un seul article choisi (création d'un mot et « Changer l'article » de l'écran Vocabulaire).
// Aucune règle ici : l'arbre vient de selecteur-catalogue-logique.js, le filtre de articles.js.
import { h, icone, remplir } from '../../os/ui.js';
import * as A from './articles.js';
import { arbreCatalogue, cheminDansArbre, MESSAGE_CATALOGUE_VIDE, MESSAGE_FAMILLE_SANS_ARTICLE, MESSAGE_AUCUN_RESULTAT } from './selecteur-catalogue-logique.js';

export const MESSAGE_CATALOGUE_CHARGEMENT = 'Chargement du catalogue…';
export const MESSAGE_CATALOGUE_ILLISIBLE = 'La liste du catalogue n’a pas pu être mise à jour. Vérifie ta connexion puis recharge la page.';
const MAX_RESULTATS = 8;

/**
 * `source` : { articles(), familles(), estChoisissable(article), enErreur()?, pret()?, surChangement(rappel)? -> arrêt }. `initial` : l'article déjà choisi ou null. `surChoix(article)` est appelé à chaque choix.
 * Rend { element, valeur(), focus(), arreter() } : `arreter()` libère l'abonnement, à appeler quand la fenêtre est fermée.
 */
export function selecteurCatalogue({ source, mode = 'article', initial = null, surChoix = () => {} } = {}) {
  let choisi = initial;
  const ouverts = new Set();
  let touche = false; // dès que l'utilisateur agit dans l'arbre, on ne le fait plus défiler tout seul
  const cheminChoisi = () => (choisi ? cheminDansArbre(arbreCatalogue(source.articles(), source.familles(), source.estChoisissable), choisi.id) : []);
  const cheminOuvert = () => cheminChoisi().every((id) => ouverts.has(id));
  const ouvrirChemin = () => cheminChoisi().forEach((id) => ouverts.add(id));
  ouvrirChemin();
  const champ = h('input', {
    type: 'search', class: 'champ', autocomplete: 'off', 'aria-label': 'Chercher un article du catalogue', placeholder: 'Chercher un article du catalogue', dataset: { champ: 'recherche-article' },
    oninput: () => { dessinerResultats(); dessinerArbre(); },
  });
  const resultats = h('ul', { class: 'resultats-composants', role: 'listbox', 'aria-label': 'Articles trouvés', hidden: true });
  const resume = h('p', { class: 'article-choisi', 'aria-live': 'polite', dataset: { role: 'article-choisi' } });
  const arbre = h('div', {
    class: 'arbre-catalogue', 'aria-label': 'Catalogue par famille', dataset: { role: 'arbre-catalogue' },
    onpointerdown: () => { touche = true; }, onkeydown: () => { touche = true; }, onwheel: () => { touche = true; },
  });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'catalogue' } }, MESSAGE_CATALOGUE_ILLISIBLE);

  function choisir(a) {
    choisi = a; champ.value = ''; dessinerResultats(); dessinerChoix(); dessinerArbre(); surChoix(a);
  }
  function dessinerChoix() {
    remplir(resume, choisi ? h('span', {}, 'Article choisi : ', h('strong', {}, choisi.libelle)) : h('span', { class: 'discret' }, 'Aucun article choisi.'));
  }
  function dessinerResultats() {
    const texte = champ.value.trim();
    if (!texte) { remplir(resultats); resultats.hidden = true; return; }
    const trouves = A.filtrerArticles(source.articles(), { recherche: texte, statut: 'actifs' }).filter(source.estChoisissable).slice(0, MAX_RESULTATS);
    resultats.hidden = false;
    remplir(resultats, ...(trouves.length
      ? trouves.map((a) => h('li', { role: 'option' }, h('button', { type: 'button', class: 'resultat-composant', dataset: { articleId: a.id }, onclick: () => choisir(a) },
        h('span', {}, a.libelle), h('span', { class: 'discret' }, a.unite ?? ''))))
      : [h('li', { class: 'discret', role: 'option', 'aria-disabled': 'true' }, MESSAGE_AUCUN_RESULTAT)]));
  }

  function ligneArticle(a) {
    const coche = choisi?.id === a.id;
    return h('li', {}, h('button', { type: 'button', class: `arbre-article${coche ? ' choisi' : ''}`, 'aria-pressed': String(coche), dataset: { arbreArticle: a.id }, onclick: () => choisir(a) },
      h('span', {}, a.libelle), h('span', { class: 'discret' }, a.unite ?? '')));
  }
  function ligneFamille(f) {
    const ouvert = ouverts.has(f.id);
    return h('li', { class: `arbre-famille niveau-${f.niveau}` },
      h('button', { type: 'button', class: 'arbre-entete', 'aria-expanded': String(ouvert), dataset: { arbreFamille: f.id },
        onclick: () => { if (ouverts.has(f.id)) ouverts.delete(f.id); else ouverts.add(f.id); dessinerArbre(); } },
      icone(ouvert ? 'chevron-down' : 'chevron-right', { taille: 16 }), h('span', { class: 'arbre-nom' }, f.nom), h('span', { class: 'discret arbre-nombre' }, String(f.nombre))),
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
    if (!noeuds.length || noeuds.every((n) => n.nombre === 0)) {
      remplir(arbre, h('p', { class: 'discret', dataset: { vide: 'catalogue' } }, MESSAGE_CATALOGUE_VIDE, ' ', h('a', { href: '#/devis/bordereau' }, 'Ouvrir le catalogue')));
      return;
    }
    remplir(arbre, h('ul', { class: 'arbre-racine' }, noeuds.map(ligneFamille)));
    if (actif?.arbreFamille) arbre.querySelector(`[data-arbre-famille="${actif.arbreFamille}"]`)?.focus();
    else if (actif?.arbreArticle) arbre.querySelector(`[data-arbre-article="${actif.arbreArticle}"]`)?.focus();
  }
  /** Montre l'article déjà choisi dans le cadre défilant de l'arbre. */
  const montrerChoisi = () => arbre.querySelector('.arbre-article.choisi')?.scrollIntoView?.({ block: 'nearest' });

  const element = h('div', { class: 'pile selecteur-article selecteur-catalogue', dataset: { mode } }, champ, resultats, resume, erreur, arbre);
  dessinerChoix();
  dessinerArbre();
  // Le catalogue peut arriver après l'ouverture de la fenêtre : l'arbre et les résultats se redessinent à chaque changement, jusqu'à `arreter()`.
  const arreterAbonnement = source.surChangement?.(() => {
    const aOuvrir = Boolean(choisi) && !cheminOuvert();
    if (aOuvrir) ouvrirChemin();
    dessinerResultats(); dessinerArbre();
    if (choisi && (aOuvrir || !touche)) requestAnimationFrame(montrerChoisi); // le catalogue arrivé tard peut pousser l'article hors du cadre
  });
  const arreter = () => arreterAbonnement?.();
  requestAnimationFrame(montrerChoisi);
  return { element, valeur: () => choisi, focus: () => champ.focus(), arreter };
}
