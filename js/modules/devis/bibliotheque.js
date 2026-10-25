// Panneau « Bibliothèque » de l'éditeur de devis : à gauche l'arbre des familles du Bordereau (deux niveaux) et une recherche, à droite les articles actifs de la famille
// choisie (et de ses sous-familles) avec une case à cocher chacun, puis « Ajouter au devis (N) ». Le panneau reste ouvert à côté du devis : on continue d'éditer.
// Aucune règle ici : le filtrage vient de articles.js, la copie d'un article en ligne de editeur-logique.js (appelée par l'éditeur via `ajouter`).
import { h, icone, remplir } from '../../os/ui.js';
import * as A from './articles.js';
import { arbreFamilles } from './familles.js';

export const MESSAGE_FAMILLE_VIDE = 'Aucun article dans cette famille.';
export const MESSAGE_BORDEREAU_VIDE = 'Ton catalogue est vide : crée tes articles dans le catalogue, ou utilise une ligne libre.';

/**
 * `source` : { articles(), familles(), prixAffiche(article) -> texte, ajouter(articlesChoisis) }. Rend { fermer(), ouvert() }.
 * `racine` : l'élément de la page où poser le panneau (il est retiré à la fermeture).
 */
export function ouvrirBibliotheque(racine, source, { surFermeture = () => {}, retour = null } = {}) {
  let famille = ''; // '' = toutes les familles
  let recherche = '';
  const coches = new Set();

  const champRecherche = h('input', { type: 'search', class: 'champ', placeholder: 'Rechercher un article', autocomplete: 'off', 'aria-label': 'Rechercher dans le catalogue', dataset: { champ: 'recherche-bibliotheque' },
    oninput: (e) => { recherche = e.target.value; dessinerListe(); } });
  const arbre = h('nav', { class: 'bibliotheque-arbre', 'aria-label': 'Familles' });
  const liste = h('ul', { class: 'bibliotheque-liste', dataset: { zone: 'liste-bibliotheque' } });
  const message = h('p', { class: 'texte-discret bibliotheque-fin', dataset: { zone: 'fin-resultats' } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, dataset: { action: 'ajouter-bibliotheque' }, onclick: ajouterCoches }, 'Ajouter au devis (0)');
  const fermerBouton = h('button', { type: 'button', class: 'bouton-icone bibliotheque-fermer', dataset: { action: 'fermer-bibliotheque' }, 'aria-label': 'Fermer le catalogue', onclick: () => fermer() }, icone('x', { taille: 18 }));
  const panneau = h('aside', { class: 'bibliotheque-panneau', id: 'bibliotheque-devis', role: 'complementary', 'aria-label': 'Catalogue', dataset: { zone: 'bibliotheque' },
    onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } } },
  h('header', { class: 'bibliotheque-tete' },
    h('button', { type: 'button', class: 'bouton-icone bibliotheque-retour', 'aria-label': 'Retour au devis', dataset: { action: 'retour-bibliotheque' }, onclick: () => fermer() }, icone('chevron-left', { taille: 18 })),
    h('h2', { class: 'bibliotheque-titre' }, 'Catalogue'), fermerBouton),
  h('div', { class: 'bibliotheque-corps' },
    h('div', { class: 'bibliotheque-gauche' }, champRecherche, arbre),
    h('div', { class: 'bibliotheque-droite' }, liste, message)),
  h('footer', { class: 'bibliotheque-pied' }, bouton));

  function dessinerArbre() {
    const entree = (id, libelle, niveau) => h('button', { type: 'button', class: `bibliotheque-famille niveau-${niveau}${famille === id ? ' choisie' : ''}`, 'aria-current': famille === id ? 'true' : null,
      dataset: { famille: id || 'toutes' }, onclick: () => { famille = id; dessinerArbre(); dessinerListe(); } }, libelle);
    const groupes = arbreFamilles(source.familles()).filter(({ famille: f }) => f.actif !== false);
    remplir(arbre, entree('', 'Toutes les familles', 0),
      groupes.flatMap(({ famille: f, enfants }) => [entree(f.id, f.nom ?? f.id, 1), ...enfants.filter((e) => e.actif !== false).map((e) => entree(e.id, e.nom ?? e.id, 2))]),
      entree('sans_famille', 'Sans famille', 1));
  }

  function articlesAffiches() {
    return A.filtrerArticles(source.articles().filter((a) => a.actif !== false), { recherche, statut: 'actifs', familleId: famille, familles: source.familles() });
  }

  function dessinerListe() {
    const tous = source.articles().filter((a) => a.actif !== false);
    const trouves = articlesAffiches();
    if (!tous.length) {
      remplir(liste, h('li', { class: 'texte-discret', dataset: { vide: 'bordereau' } }, MESSAGE_BORDEREAU_VIDE, ' ', h('a', { href: '#/devis/bordereau' }, 'Ouvrir le catalogue')));
      message.textContent = '';
    } else if (!trouves.length) {
      remplir(liste, h('li', { class: 'texte-discret', dataset: { vide: 'famille' } }, recherche.trim() ? 'Aucun article ne correspond.' : MESSAGE_FAMILLE_VIDE));
      message.textContent = '';
    } else {
      remplir(liste, trouves.map((a) => {
        const case_ = h('input', { type: 'checkbox', checked: coches.has(a.id), 'aria-label': `Choisir ${a.libelle}`, dataset: { articleId: a.id },
          onchange: (e) => { if (e.target.checked) coches.add(a.id); else coches.delete(a.id); majBouton(); } });
        return h('li', { class: 'bibliotheque-article' }, h('label', { class: 'bibliotheque-ligne' }, case_,
          h('span', { class: 'bibliotheque-nom' }, a.libelle, a.code ? h('span', { class: 'texte-discret' }, ` · ${a.code}`) : null, a.type ? h('span', { class: 'texte-discret' }, ` · ${A.libelleType(a.type)}`) : null),
          h('span', { class: 'bibliotheque-prix' }, source.prixAffiche(a))));
      }));
      message.textContent = 'Fin des résultats';
    }
    majBouton();
  }

  function majBouton() {
    const n = coches.size;
    bouton.textContent = `Ajouter au devis (${n})`;
    bouton.disabled = n === 0;
    bouton.classList.toggle('bouton-principal', n > 0);
    bouton.classList.toggle('bouton-secondaire', n === 0);
  }

  function ajouterCoches() {
    // Dans l'ordre de la liste (alphabétique), quelle que soit la famille où chaque case a été cochée.
    const choisis = A.filtrerArticles(source.articles().filter((a) => coches.has(a.id)), { statut: 'actifs' });
    if (!choisis.length) return;
    source.ajouter(choisis);
    coches.clear();
    dessinerListe();
  }

  function fermer() {
    if (!panneau.isConnected) return;
    panneau.remove();
    racine.classList.remove('avec-bibliotheque');
    surFermeture();
    retour?.focus?.();
  }

  dessinerArbre();
  dessinerListe();
  racine.append(panneau);
  racine.classList.add('avec-bibliotheque');
  champRecherche.focus();
  return { fermer, ouvert: () => panneau.isConnected };
}
