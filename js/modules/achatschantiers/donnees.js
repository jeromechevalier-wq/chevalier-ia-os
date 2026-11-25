// Données du module Achats « Chantiers » (24/11/2026, PR 6) : les LECTURES passent seulement par le client de la base (js/os/supabase.js : tables ou vues nommées, colonnes nommées,
// tri obligatoire, plafond de pages dit à l'écran) ; les ACTIONS qui comptent (créer, modifier, archiver, désarchiver) seulement par la couche des actions (js/os/actions-metier.js :
// ticket neuf à usage unique, n8n garde les règles) ; les FAVORIS par les deux fonctions de la base (lister_favoris_os, basculer_favori_os). Aucun appel réseau n'est écrit ici.
// Le fichier ne connaît pas la coque : `client` et `actions` lui sont donnés (l'écran les prend dans js/os/acces-base.js ; les tests, un faux réseau).
import { corpsCreationChantier, champsModifies, indexerChiffres, COLONNES_CHIFFRES } from './logique.js';
import { favorisDeChantiers } from './favoris.js';

/** Colonnes lues dans la table des chantiers (jamais d'étoile). */
export const COLONNES_CHANTIERS = ['id', 'nom', 'code', 'client', 'statut', 'archive', 'adresse', 'budget_ht', 'date_debut', 'date_fin_prevue', 'date_fin_reelle'];
export const TABLE_CHANTIERS = 'chantiers';
/** Vue de la base qui donne, par chantier : budget, accepté, en attente, reste et part du budget (les avoirs comptent en négatif). */
export const VUE_CHIFFRES = 'v_td_chantiers';

const valeur = (x) => (typeof x === 'function' ? x() : x);

/** @param {{ client: object | (() => object), actions: object | (() => object) }} dep */
export function creerDonnees({ client, actions }) {
  /** Tous les chantiers (archivés compris : l'écran sépare les vues). Renvoie { chantiers, tronque, message } ; le tri par nom puis identifiant rend les pages stables. */
  async function chargerChantiers() {
    const r = await valeur(client).lire(TABLE_CHANTIERS, { colonnes: COLONNES_CHANTIERS, tri: ['nom', 'id'] });
    return { chantiers: r.lignes, tronque: r.tronque, message: r.message };
  }

  /** Chiffres du budget par chantier (Map : identifiant -> ligne). */
  async function chargerChiffres() {
    const r = await valeur(client).lire(VUE_CHIFFRES, { colonnes: COLONNES_CHIFFRES, tri: ['chantier_id'] });
    return { chiffres: indexerChiffres(r.lignes), tronque: r.tronque, message: r.message };
  }

  /** Favoris de chantier de la personne connectée. */
  async function chargerFavoris() {
    return favorisDeChantiers(await valeur(client).appeler('lister_favoris_os', {}));
  }

  /** Met ou retire le favori ; renvoie l'état APRÈS (true = en favori). */
  async function basculerFavori(genre, cle) {
    const r = await valeur(client).appeler('basculer_favori_os', { p_genre: genre, p_cle: cle });
    return r === true;
  }

  /** Crée un chantier (le code vide est attribué par la base). Réponse `{ ok, chantier_id }`. */
  const creerChantier = (champs) => valeur(actions).appelerActionMetier('creer_chantier', corpsCreationChantier(champs));

  /** Modifie un chantier : seulement les champs changés. Archiver = `{ archive: true }`, désarchiver = `{ archive: false }`. */
  const modifierChantier = (id, champs) => valeur(actions).appelerActionMetier('modifier_chantier', { id, champs });

  /** Modification depuis la fenêtre : calcule ce qui a changé ; renvoie false (rien envoyé) s'il n'y a aucun changement. */
  async function enregistrerChantier(origine, champs) {
    const modifies = champsModifies(origine, champs);
    if (Object.keys(modifies).length === 0) return false;
    await modifierChantier(origine.id, modifies);
    return true;
  }

  const archiver = (id) => modifierChantier(id, { archive: true });
  const desarchiver = (id) => modifierChantier(id, { archive: false });

  return { chargerChantiers, chargerChiffres, chargerFavoris, basculerFavori, creerChantier, modifierChantier, enregistrerChantier, archiver, desarchiver };
}
