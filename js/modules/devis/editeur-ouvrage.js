// Éditeur de la composition d'un ouvrage (écran du Bordereau) : recherche d'un article à ajouter, liste des composants (quantité, ordre, retrait),
// résumé en direct (prix de vente, déboursé sec, marge brute, taux de marge) et prix de vente forcé facultatif.
// Aucune règle métier ici : le calcul et les contrôles viennent de ouvrages.js et articles.js ; l'enregistrement est fait par l'appelant.
import { h, icone, remplir } from '../../os/ui.js';
import * as D from './donnees.js';
import * as A from './articles.js';
import * as O from './ouvrages.js';

const eur = (n) => (typeof n === 'number' ? A.formaterPrix(n) : '—');
const quantiteAffichee = (q) => (typeof q === 'number' ? String(q).replace('.', ',') : String(q ?? ''));

/**
 * `composants` : [{ articleId, quantite }] de départ ; `prixVenteForce` : nombre ou null ; `id` : l'ouvrage modifié (null pour un nouvel ouvrage).
 * Renvoie `{ element, valeurs(), montrerErreurs(erreurs) }` ; `valeurs()` donne `{ composants, prixVenteForce }` tels que saisis (à valider par les plans d'articles.js).
 */
export function editeurOuvrage({ composants = [], prixVenteForce = null, id = null } = {}) {
  const mot = O.motOuvrage(D.etat.reglages);
  let liste = composants.map((c) => ({ articleId: c.articleId, saisie: quantiteAffichee(c.quantite) }));
  const parId = () => O.articlesParId(D.etat.articles);

  const champRecherche = h('input', {
    type: 'search', class: 'champ', autocomplete: 'off', 'aria-label': 'Ajouter un composant', placeholder: 'Chercher un article à ajouter', dataset: { champ: 'recherche-composant' },
    oninput: () => dessinerResultats(),
  });
  const resultats = h('ul', { class: 'resultats-composants', role: 'listbox', 'aria-label': 'Articles trouvés' });
  const zoneListe = h('div', { class: 'liste-composants' });
  const resume = h('dl', { class: 'resume-ouvrage', 'aria-live': 'polite' });
  const erreurResume = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'composants' } });
  const champForce = h('input', {
    type: 'text', class: 'champ', id: 'article-prixVenteForce', autocomplete: 'off', inputmode: 'decimal', placeholder: 'Sinon, la somme des composants', 'aria-label': 'Prix de vente forcé (facultatif)',
    value: typeof prixVenteForce === 'number' ? A.prixPourSaisie(prixVenteForce) : '', dataset: { champ: 'prixVenteForce' }, oninput: () => dessinerResume(),
  });
  const erreurForce = h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'prixVenteForce' } });

  const ouvrageSaisi = () => ({
    composants: liste.map((c) => ({ articleId: c.articleId, quantite: A.lireNombre(c.saisie) ?? 0 })),
    prixVenteForce: A.lireNombre(champForce.value) ?? undefined,
  });

  function dessinerResume() {
    const calcul = O.calculerOuvrage(ouvrageSaisi(), parId(), D.etat.reglages);
    const ligne = (cle, libelle, valeur) => [h('dt', {}, libelle), h('dd', { dataset: { resume: cle } }, valeur)];
    remplir(resume, ...ligne('prix-vente', 'Prix de vente HT', eur(calcul.prixVenteHT)), ...ligne('debours', 'Déboursé sec HT', eur(calcul.deboursSecHT)),
      ...ligne('marge', 'Marge brute HT', eur(calcul.margeBruteHT)), ...ligne('taux', 'Taux de marge', calcul.tauxMarge === null ? '—' : `${String(calcul.tauxMarge).replace('.', ',')} %`));
    return calcul;
  }

  function ajouter(articleId) {
    if (liste.some((c) => c.articleId === articleId)) return;
    liste = [...liste, { articleId, saisie: '1' }];
    champRecherche.value = '';
    dessiner();
  }
  function deplacer(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= liste.length) return;
    const copie = [...liste];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    liste = copie;
    dessiner();
  }

  function dessinerResultats() {
    const texte = champRecherche.value.trim();
    if (!texte) { remplir(resultats); resultats.hidden = true; return; }
    const pris = new Set(liste.map((c) => c.articleId));
    const trouves = A.filtrerArticles(D.etat.articles, { recherche: texte, statut: 'actifs' })
      .filter((a) => a.type !== 'ouvrage' && a.id !== id && !pris.has(a.id)).slice(0, 8);
    resultats.hidden = false;
    remplir(resultats, ...(trouves.length
      ? trouves.map((a) => h('li', { role: 'option' }, h('button', { type: 'button', class: 'resultat-composant', dataset: { articleId: a.id }, onclick: () => ajouter(a.id) },
        h('span', {}, a.libelle), h('span', { class: 'discret' }, `${a.unite} · ${eur(O.prixVenteArticle(a, D.etat.reglages))}`))))
      : [h('li', { class: 'discret', role: 'option', 'aria-disabled': 'true' }, `Aucun article actif ne correspond (${mot.un} ${mot.singulier} ne peut pas en contenir ${mot.genre === 'feminin' ? 'une autre' : 'un autre'}).`)]));
  }

  function dessiner() {
    const calcul = O.calculerOuvrage(ouvrageSaisi(), parId(), D.etat.reglages);
    const lignes = liste.map((c, i) => {
      const article = parId()[c.articleId];
      const detail = calcul.composants[i];
      const probleme = !article ? 'article introuvable' : (article.actif === false ? 'article désactivé' : '');
      const quantite = h('input', {
        type: 'text', class: 'champ champ-quantite', inputmode: 'decimal', autocomplete: 'off', value: c.saisie, 'aria-label': `Quantité : ${article?.libelle ?? c.articleId}`, dataset: { champ: 'quantite-composant' },
        oninput: (e) => { c.saisie = e.target.value; dessinerResume(); majTotal(); },
      });
      const total = h('span', { class: 'total-composant' });
      const majTotal = () => { const d = O.calculerOuvrage({ composants: [{ articleId: c.articleId, quantite: A.lireNombre(c.saisie) ?? 0 }] }, parId(), D.etat.reglages).composants[0]; total.textContent = eur(d.totalVenteHT); };
      majTotal();
      return h('li', { class: 'composant', dataset: { articleId: c.articleId } },
        h('div', { class: 'composant-nom' }, h('span', {}, article?.libelle ?? '(article supprimé)'), probleme ? h('span', { class: 'erreur' }, ` (${probleme})`) : null),
        h('div', { class: 'composant-saisie' }, quantite, h('span', { class: 'discret' }, article?.unite ?? ''), total),
        h('div', { class: 'composant-actions' },
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Monter : ${article?.libelle ?? ''}`, disabled: i === 0, onclick: () => deplacer(i, -1) }, icone('arrow-up', { taille: 16 })),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Descendre : ${article?.libelle ?? ''}`, disabled: i === liste.length - 1, onclick: () => deplacer(i, 1) }, icone('arrow-down', { taille: 16 })),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${O.duMot(mot)} : ${article?.libelle ?? ''}`, dataset: { action: 'retirer-composant' },
            onclick: () => { liste = liste.filter((x) => x !== c); dessiner(); } }, icone('x', { taille: 16 }))));
    });
    remplir(zoneListe, liste.length
      ? h('ul', { class: 'composants' }, lignes)
      : h('p', { class: 'discret composants-vide', dataset: { vide: 'composants' } }, `Aucun composant. Cherche un article ci-dessus : ${mot.leMot} se calcule avec ce que tu ajoutes.`));
    dessinerResume();
    dessinerResultats();
  }

  const element = h('div', { class: 'editeur-ouvrage pile' },
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette' }, `Composants ${O.duMot(mot)}`), champRecherche, resultats),
    zoneListe, erreurResume, resume,
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'article-prixVenteForce' }, 'Prix de vente forcé HT (facultatif)'), champForce, erreurForce));
  dessiner();

  return {
    element,
    valeurs: () => ({
      composants: liste.map((c) => ({ articleId: c.articleId, quantite: A.lireNombre(c.saisie) })),
      prixVenteForce: champForce.value,
    }),
    /** Affiche les erreurs des plans (clés `composants` et `prixVenteForce`) ; renvoie true si l'une d'elles est ici. */
    montrerErreurs(erreurs) {
      erreurResume.textContent = erreurs.composants ?? '';
      erreurForce.textContent = erreurs.prixVenteForce ?? '';
      champForce.classList.toggle('invalide', !!erreurs.prixVenteForce);
      return !!(erreurs.composants || erreurs.prixVenteForce);
    },
    mettreAJour: dessiner,
  };
}
