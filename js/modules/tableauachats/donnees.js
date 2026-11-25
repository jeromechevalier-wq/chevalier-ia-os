// Module Achats « Tableau de bord 2 » : lectures dans la base de l'espace. AUCUNE écriture.
// Lecture : UNIQUEMENT par `clientBase().lire(...)` (vues nommées, colonnes nommées, tri, plafond de 20 pages DIT à l'écran). Aucun appel réseau n'est écrit ici.
// Trois lectures séparées, pour qu'une panne de l'une ne touche pas les autres onglets : les factures et les chantiers (onglets Dirigeant, Pilotage, Liste),
// les lignes d'achat (Prix et hausses, Lignes et articles, et les articles d'un fournisseur) et les fournisseurs et agences.
import { clientBase, connexionPrete } from '../../os/acces-base.js';
import { nombre } from './formats.js';
import { VUE_FACTURES, VUE_CHANTIERS, VUE_PRIX_LIGNES, VUE_PRIX_ARTICLES, VUE_PRIX_PONTS, VUE_FOURN_FICHES, VUE_FOURN_AGENCES, VUE_FOURN_FACTURES, COLONNES_FACTURES, COLONNES_CHANTIERS, COLONNES_PRIX_LIGNES, COLONNES_PRIX_ARTICLES, COLONNES_PRIX_PONTS, COLONNES_FOURN_FICHES, COLONNES_FOURN_AGENCES, COLONNES_FOURN_FACTURES, factureVisible, enLignePrix, enAttributs, enPont, enFactureTableau, messages } from './colonnes.js';
import { ORDRE_PRIX_LIGNES } from './prix.js';
import { enAgence, enFacture, enFiche } from './fournisseurs.js';

export * from './colonnes.js';

/** Factures (sans les refusées archivées) et chantiers. Renvoie { factures, chantiers, tronque, message }. Lève l'erreur de la couche d'accès. */
export async function lireDonnees() {
  await connexionPrete();
  const base = clientBase();
  const [f, c] = await Promise.all([
    base.lire(VUE_FACTURES, { colonnes: COLONNES_FACTURES, tri: [{ col: 'date_ref', asc: false }, 'facture_id'] }),
    base.lire(VUE_CHANTIERS, { colonnes: COLONNES_CHANTIERS, tri: ['chantier', 'chantier_id'] }),
  ]);
  return { factures: f.lignes.filter(factureVisible).map(enFactureTableau), chantiers: c.lignes.map((x) => ({ ...x, budget_ht: nombre(x.budget_ht), accepte_ht: nombre(x.accepte_ht), en_attente_ht: nombre(x.en_attente_ht), reste_ht: nombre(x.reste_ht), pct_budget_consomme: nombre(x.pct_budget_consomme), budget_renseigne: x.budget_renseigne === true })), tronque: f.tronque || c.tronque, message: messages(f, c) };
}

/** Lignes d'achat (les plus récentes d'abord), fiches des articles et ponts automatiques. Renvoie { lignes, attributs, ponts, tronque, message }. */
export async function lirePrix() {
  await connexionPrete();
  const base = clientBase();
  const [l, a, p] = await Promise.all([
    base.lire(VUE_PRIX_LIGNES, { colonnes: COLONNES_PRIX_LIGNES, tri: ORDRE_PRIX_LIGNES }),
    base.lire(VUE_PRIX_ARTICLES, { colonnes: COLONNES_PRIX_ARTICLES, tri: ['article_fournisseur_id'] }),
    base.lire(VUE_PRIX_PONTS, { colonnes: COLONNES_PRIX_PONTS, tri: ['article_source_id', 'article_cible_id'] }),
  ]);
  return { lignes: l.lignes.map(enLignePrix), attributs: a.lignes.map(enAttributs), ponts: p.lignes.map(enPont), tronque: l.tronque || a.tronque || p.tronque, message: messages(l, a, p) };
}

/** Fournisseurs, agences et factures acceptées par fournisseur. Renvoie { fiches, agences, factures, tronque, message }. */
export async function lireFournisseurs() {
  await connexionPrete();
  const base = clientBase();
  const [f, a, x] = await Promise.all([
    base.lire(VUE_FOURN_FICHES, { colonnes: COLONNES_FOURN_FICHES, tri: ['fournisseur_id'] }),
    base.lire(VUE_FOURN_AGENCES, { colonnes: COLONNES_FOURN_AGENCES, tri: ['etablissement_id'] }),
    base.lire(VUE_FOURN_FACTURES, { colonnes: COLONNES_FOURN_FACTURES, tri: [{ col: 'date_ref', asc: false }, 'facture_id'] }),
  ]);
  return { fiches: f.lignes.map(enFiche), agences: a.lignes.map(enAgence), factures: x.lignes.map(enFacture), tronque: f.tronque || a.tronque || x.tronque, message: messages(f, a, x) };
}
