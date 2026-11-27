// Données de « l'application Factures » (27/11/2026) : ce que lisent le volet « Fournisseurs, Chantiers, Articles » et le tableau de bord des factures.
// LECTURES : seulement par le client de la base (tables nommées, colonnes nommées, tri obligatoire) ; aucune table nouvelle : ce sont celles que lisent déjà les écrans Achats.
// ÉCRITURES : seulement par la couche des actions métier, avec des actions qui EXISTENT déjà (`creer_agence`, `revoquer_iban`, `modifier_chantier`) : n8n garde les règles.
// Le fichier ne connaît pas la coque : `client` et `actions` lui sont donnés. Aucun appel réseau n'est écrit ici. Un module Achats n'importe pas un autre module : les lectures sont refaites ici.
import { creerDonnees, TABLE_AGENCES, TABLE_CHANTIERS } from './donnees.js';
import { corpsCreationAgence } from './agences.js';
import { COLONNES_AGENCES_EXAMINER, COLONNES_FOURNISSEURS, TABLE_FOURNISSEURS } from './donnees-examiner.js';
import { champsChantierModifies, preparerModeEmploi, OBJET_DU_VOLET } from './logique-appli.js';

export const COLONNES_CHANTIERS_VOLET = ['id', 'nom', 'code', 'client', 'statut', 'archive', 'adresse'];
export const TABLE_ARTICLES = 'articles_fournisseur';
export const COLONNES_ARTICLES = ['id', 'fournisseur_id', 'reference', 'designation', 'unite'];
/** Mode d'emploi de la base (migration 013) : lu par la porte comme les autres tables (liste LECTURES_NAVIGATEUR). */
export const TABLE_MODE_OBJETS = 'mode_emploi_objets';
export const TABLE_MODE_CHAMPS = 'mode_emploi_champs';
export const COLONNES_MODE_OBJETS = ['objet', 'creer', 'phrase_sans_creer'];
export const COLONNES_MODE_CHAMPS = ['objet', 'champ', 'modifiable', 'phrase_cadenas', 'archive_le'];
export const MOTIF_MIN = 3;
export const MOTIF_MAX = 500;

const valeur = (x) => (typeof x === 'function' ? x() : x);

/** @param {{ client: object | (() => object), actions: object | (() => object) }} dep */
export function creerDonneesAppli({ client, actions }) {
  const factures = creerDonnees({ client, actions });

  /**
   * Tout ce qu'il faut pour les fournisseurs : la table des fournisseurs (obligatoire : une erreur est levée), puis leurs agences, les confirmations d'IBAN et les factures
   * (facultatifs : un échec donne null, et la fiche dit « non lu » au lieu d'inventer). Une lecture coupée par le plafond est traitée comme un échec.
   */
  async function lireFournisseurs() {
    const c = valeur(client);
    const fo = await c.lire(TABLE_FOURNISSEURS, { colonnes: COLONNES_FOURNISSEURS, tri: ['id'] });
    if (fo.tronque) throw new Error(fo.message || 'Liste des fournisseurs incomplète.');
    const [ag, ib, fa] = await Promise.allSettled([
      c.lire(TABLE_AGENCES, { colonnes: COLONNES_AGENCES_EXAMINER, tri: ['id'] }),
      factures.chargerIbansConfirmes(),
      factures.chargerFactures(),
    ]);
    return {
      fournisseurs: fo.lignes,
      agences: ag.status === 'fulfilled' && !ag.value.tronque ? ag.value.lignes : [],
      ibans: ib.status === 'fulfilled' ? ib.value : null,
      factures: fa.status === 'fulfilled' && fa.value.complete ? fa.value.liste : null,
    };
  }

  /**
   * Le mode d'emploi de la base, pour les tables du volet seulement. TOUT échec (table absente dans l'ancienne base, migrations pas appliquées, porte pas republiée qui répond 403
   * « lecture refusée », réseau) donne null, sans message : l'écran reste alors exactement comme avant. Une lecture coupée par le plafond aussi (jamais un mode d'emploi partiel).
   * `{ essai: true }` : rend { mode, definitif } ; `definitif` est faux après une panne passagère (réseau, lecture coupée) : l'écran pourra réessayer.
   */
  async function lireModeEmploi({ essai = false } = {}) {
    const rendre = (mode, definitif) => (essai ? { mode, definitif } : mode);
    try {
      const c = valeur(client);
      const objets = Object.values(OBJET_DU_VOLET);
      const filtre = [['objet', 'in', objets]];
      const [o, ch] = await Promise.all([
        c.lire(TABLE_MODE_OBJETS, { colonnes: COLONNES_MODE_OBJETS, filtres: filtre, tri: ['objet'] }),
        c.lire(TABLE_MODE_CHAMPS, { colonnes: COLONNES_MODE_CHAMPS, filtres: filtre, tri: ['objet', 'champ'] }),
      ]);
      if (o.tronque || ch.tronque) return rendre(null, false);
      return rendre(preparerModeEmploi(o.lignes, ch.lignes), true);
    } catch (e) {
      // 403 (porte pas republiée), 404 / 400 (table ou colonne inconnue : ancienne base, migrations pas appliquées) : définitif ; le reste (réseau, 401…) : passager.
      const statut = e?.statut ?? e?.status ?? null;
      return rendre(null, [400, 403, 404].includes(statut)); // 401 (badge périmé), 408, 429 : passagers
    }
  }

  /** Chantiers non archivés, par nom. Lecture coupée par le plafond : erreur (jamais une liste tronquée présentée comme complète). */
  async function lireChantiers() {
    const r = await valeur(client).lire(TABLE_CHANTIERS, { colonnes: COLONNES_CHANTIERS_VOLET, tri: ['nom', 'id'] });
    if (r.tronque) throw new Error(r.message || 'Liste des chantiers incomplète.');
    return r.lignes.filter((x) => x.archive !== true);
  }

  /** Articles des fournisseurs, avec le nom de leur fournisseur (lu à part : le client ne lit qu'une table à la fois). */
  async function lireArticles() {
    const c = valeur(client);
    const [ar, fo] = await Promise.all([
      c.lire(TABLE_ARTICLES, { colonnes: COLONNES_ARTICLES, tri: ['designation', 'id'] }),
      c.lire(TABLE_FOURNISSEURS, { colonnes: COLONNES_FOURNISSEURS, tri: ['id'] }),
    ]);
    if (ar.tronque) throw new Error(ar.message || 'Liste des articles incomplète.');
    const nomDe = new Map(fo.lignes.map((x) => [x.id, x.nom]));
    return ar.lignes.map((a) => ({ ...a, fournisseur: nomDe.get(a.fournisseur_id) ?? null }));
  }

  /** Crée un fournisseur et sa première agence (action `creer_agence`, la même que la page Examiner). Réponse `{ ok, agence_id }`. */
  const creerFournisseur = (champs) => valeur(actions).appelerActionMetier('creer_agence', corpsCreationAgence(champs));

  /** Révoque la confirmation d'un IBAN (action `revoquer_iban`) : c'est ainsi qu'un IBAN « changé » est noté, avec son motif ; l'ancienne confirmation reste dans l'historique. */
  async function revoquerIban(id, motif) {
    const m = String(motif ?? '').trim();
    if (!id) throw new Error('Confirmation introuvable.');
    if (m.length < MOTIF_MIN || m.length > MOTIF_MAX) throw new Error(`Le motif doit faire de ${MOTIF_MIN} à ${MOTIF_MAX} caractères.`);
    return valeur(actions).appelerActionMetier('revoquer_iban', { id, motif: m });
  }

  /** Modifie les champs de texte d'un chantier (action `modifier_chantier`) : seulement ce qui a changé. Renvoie false si rien n'a changé (rien n'est envoyé). */
  async function enregistrerChantier(origine, champs) {
    const modifies = champsChantierModifies(origine, champs);
    if (Object.keys(modifies).length === 0) return false;
    await valeur(actions).appelerActionMetier('modifier_chantier', { id: origine.id, champs: modifies });
    return true;
  }

  return { lireFournisseurs, lireChantiers, lireArticles, lireModeEmploi, creerFournisseur, revoquerIban, enregistrerChantier, chargerFactures: factures.chargerFactures };
}
