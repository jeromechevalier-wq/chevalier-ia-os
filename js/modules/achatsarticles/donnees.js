// Lecture des données du module Articles : LECTURE SEULE, par la couche d'accès à la base (js/os/acces-base.js, `clientBase().lire`).
// Colonnes nommées (jamais d'étoile), tri obligatoire dès la 2e page, plafond de 20 pages DIT à l'écran (`tronque`). Aucune écriture ici : tout passe par actions.js.
//
// La couche de lecture de l'OS ne sait pas joindre deux tables (pas de relation imbriquée) : les articles et les fournisseurs, puis les lignes et leurs factures,
// sont lus séparément et reliés ici, en JavaScript. Le résultat a la même forme que celui du code d'origine (voir la tête de logique.js).
import { lectureDeSecours, TEXTE_ERREUR_LECTURE } from './logique.js';
import { villesParArticle } from './association.js';

/** Tables et colonnes lues (noms de la base). */
export const COLONNES = Object.freeze({
  articles_fournisseur: ['id', 'fournisseur_id', 'reference', 'designation', 'unite', 'created_at'],
  fournisseurs: ['id', 'nom'],
  articles_reference: ['id', 'nom', 'unite_reference', 'actif'],
  rapprochements_articles: ['article_fournisseur_id', 'article_reference_id', 'coefficient', 'valide_le', 'valide_par', 'suggere_par_ia'],
  lignes_facture: ['id', 'article_fournisseur_id', 'quantite', 'montant_ht', 'facture_id'],
  factures: ['id', 'statut', 'type_document', 'date_facture', 'created_at'],
  suggestions_refusees: ['article_fournisseur_id', 'refuse_par', 'refuse_le', 'article_reference_id', 'coefficient'],
  v_td_prix_lignes: ['ligne_id', 'article_fournisseur_id', 'nom_agence', 'ville'],
});

/** Client de la base du navigateur (chargé à la demande : ce fichier se teste sans Firebase en lui donnant un faux client). */
async function clientParDefaut() {
  const { clientBase, connexionPrete } = await import('../../os/acces-base.js');
  await connexionPrete();
  return clientBase();
}

const nombreOuNul = (v) => (v === null || v === undefined ? null : Number(v));

/** Message de l'écran pour une lecture qui a échoué : « Reconnecte-toi » tel quel, sinon la phrase habituelle (le détail reste dans la console). */
export function messageLecture(e) {
  if (e && e.code === 'reconnexion' && e.message) return e.message;
  return TEXTE_ERREUR_LECTURE;
}

async function lireTable(client, table, tri, filtres = []) {
  try {
    return await client.lire(table, { colonnes: COLONNES[table], tri, filtres });
  } catch (e) {
    console.warn('Articles : lecture impossible', table, e?.code ?? e?.message);
    throw e;
  }
}

/**
 * Tout ce que l'écran affiche. Les lignes : seulement celles des factures acceptées, de type « facture », de quantité > 0
 * (le reste du tri est fait par la logique, comme dans les tableaux de bord). `client` se remplace dans les tests.
 * @returns {Promise<{ articles: object[], references: object[], rapprochements: object[], lignes: object[], refusees: object[], refuseesIndisponibles: boolean, tronque: boolean }>}
 */
export async function lireDonnees(client) {
  if (!client) client = await clientParDefaut();
  const [articles, fournisseurs, references, rapprochements, lignes, factures, refusees] = await Promise.all([
    lireTable(client, 'articles_fournisseur', ['id']),
    lireTable(client, 'fournisseurs', ['id']),
    // Toutes les références, actives ou non : une inactive ne se propose pas, mais son nom ne peut pas être recréé.
    lireTable(client, 'articles_reference', ['id']),
    lireTable(client, 'rapprochements_articles', ['article_fournisseur_id']),
    lireTable(client, 'lignes_facture', ['id'], [['quantite', 'gt', 0]]),
    lireTable(client, 'factures', ['id'], [['statut', 'eq', 'acceptee'], ['type_document', 'eq', 'facture']]),
    // Lecture de secours : si elle échoue (colonnes absentes, mise en ligne dans le mauvais ordre), le reste de l'écran charge quand même.
    lectureDeSecours(() => client.lire('suggestions_refusees', { colonnes: COLONNES.suggestions_refusees, tri: ['article_fournisseur_id'] })),
  ]);
  const nomFournisseur = new Map(fournisseurs.lignes.map((f) => [f.id, f.nom]));
  const factureParId = new Map(factures.lignes.map((f) => [f.id, f]));
  return {
    articles: articles.lignes.map((a) => ({ ...a, fournisseurs: nomFournisseur.has(a.fournisseur_id) ? { nom: nomFournisseur.get(a.fournisseur_id) } : null })),
    references: references.lignes,
    rapprochements: rapprochements.lignes,
    // Une ligne sans article, ou dont la facture n'est pas une facture acceptée, ne compte pas (même règle que la jointure interne d'origine).
    lignes: lignes.lignes
      .filter((l) => l.article_fournisseur_id && factureParId.has(l.facture_id))
      .map((l) => ({ id: l.id, article_fournisseur_id: l.article_fournisseur_id, quantite: nombreOuNul(l.quantite), montant_ht: nombreOuNul(l.montant_ht), factures: factureParId.get(l.facture_id) })),
    refusees: refusees.lignes,
    refuseesIndisponibles: refusees.indisponible,
    tronque: [articles, fournisseurs, references, rapprochements, lignes, factures, refusees].some((r) => r.tronque),
  };
}

/**
 * Villes (ou agences) d'achat de quelques articles, lues dans la vue `v_td_prix_lignes` : pour la fenêtre « Association ».
 * Lève une erreur si la lecture échoue : la fenêtre s'ouvre quand même et dit « Villes indisponibles ».
 */
export async function lireVilles(ids, client) {
  if (!ids || ids.length === 0) return {};
  if (!client) client = await clientParDefaut();
  const r = await client.lire('v_td_prix_lignes', { colonnes: COLONNES.v_td_prix_lignes, filtres: [['article_fournisseur_id', 'in', ids]], tri: ['ligne_id'] });
  return villesParArticle(r.lignes);
}
