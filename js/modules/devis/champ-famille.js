// Champ « Famille » d'un article : le champ intelligent de l'application (on tape, on choisit dans la liste, flèches et Entrée), comme la recherche d'une personne
// ou d'une organisation. Il propose les familles avec leur chemin (« Fournitures › Carrelage et revêtements »), groupées par famille de premier niveau.
// On ne crée aucune famille ici (comme la « Source » d'une personne) : elles se gèrent dans Réglages > Familles d'articles.
import { h, champIntelligent } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { normaliserNom, surligner } from '../crm/logique.js';
import * as D from './donnees.js';
import { arbreFamilles, cheminFamille } from './familles.js';

/** Familles proposées pour une saisie : `[{ titre, resultats: [{ id, libelle, segments }] }]`, une famille de premier niveau par groupe. Les familles désactivées ne sont pas proposées. */
export function groupesDeFamilles(familles, saisie = '') {
  const mots = normaliserNom(saisie).split(' ').filter(Boolean);
  const groupes = [];
  for (const { famille, enfants } of arbreFamilles(familles)) {
    if (famille.actif === false) continue;
    const resultats = [famille, ...enfants.filter((e) => e.actif !== false)]
      .map((f) => ({ id: f.id, libelle: cheminFamille(familles, f.id) }))
      .filter((r) => { const n = normaliserNom(r.libelle); return mots.every((m) => n.includes(m)); })
      .map((r) => ({ ...r, segments: mots.length ? surligner(r.libelle, saisie) : null }));
    if (resultats.length) groupes.push({ titre: famille.nom, resultats });
  }
  return groupes;
}

const aideReglages = () => h('span', {}, 'Aucune famille de ce nom. Les familles se gèrent dans ',
  h('a', { href: lien('reglages/devis'), dataset: { lien: 'reglages-familles' }, onclick: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) }, 'Réglages > Familles d’articles'), '.');

/**
 * - valeur : l'identifiant de la famille actuelle ('' = aucune) ; surChoix(id) : appelé quand on choisit une famille ('' quand on l'efface avec la croix)
 * - id, etiquette, placeholder : comme champIntelligent. Renvoie le même objet que champIntelligent (element, entree, choix, focus…).
 */
export function champFamille({ valeur = '', surChoix = () => {}, id = null, etiquette = 'Famille', placeholder = 'Choisis une famille', classe = '' } = {}) {
  const element = (familleId) => {
    const chemin = familleId ? cheminFamille(D.etat.familles, familleId) : '';
    return chemin ? { id: familleId, libelle: chemin } : null;
  };
  let courant = element(valeur);
  const ci = champIntelligent({
    etiquette, placeholder, icone: 'tag', id, classe, valeur: courant, ouvrirAuFocus: true,
    fournir: (saisie) => ({ groupes: groupesDeFamilles(D.etat.familles, saisie) }),
    messageVide: aideReglages,
    surChoix: (el, info) => {
      if (el) { courant = el; surChoix(el.id); } else if (info?.effacement) { courant = null; surChoix(''); }
    },
  });
  // Un texte tapé qui ne correspond à aucune famille ne reste pas dans le champ : on remet la famille choisie.
  ci.entree.addEventListener('blur', () => setTimeout(() => { if (!ci.choix() && !ci.entree.matches(':focus')) ci.afficher(courant); }, 250));
  return ci;
}
