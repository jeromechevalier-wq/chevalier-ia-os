// Adresse de l'écran d'un devis, calculée par le serveur (jamais par l'assistant) : même règle que l'écran (liste-ecran.js : brouillon -> editeur, sinon -> voir).
import { ESPACE_JEROME } from './n8n-sortie.js';
import { FORMAT_CLIENT } from '../clients/config.js';

export const CONSIGNE_LIEN_ECRAN = 'Renvoie aussi lienEcran : l’adresse de l’écran du devis dans l’application (il faut y être connecté). Quand l’utilisateur veut voir, ouvrir ou corriger le devis, donne-lui ce lien tel quel ; ne construis jamais une adresse toi-même. Si lienEcran est absent, ne donne aucun lien.';

/** `{ baseLien, espace }` : base de l'appli et identifiant d'espace ('interne' ou vide chez Jérôme, l'identifiant du client sinon). Rend undefined si la base est inconnue ou l'espace mal formé : l'appelant n'écrit alors pas la clé. */
export function lienEcranDevis({ baseLien, espace }, devis) {
  const base = String(baseLien ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(base) || !devis?.id) return undefined;
  const client = espace && espace !== ESPACE_JEROME ? espace : '';
  if (client && !FORMAT_CLIENT.test(client)) return undefined;
  const ecran = devis.statut === 'brouillon' ? 'editeur' : 'voir';
  return `${base}/#/${client ? `espace/${client}/` : ''}devis/${ecran}/${encodeURIComponent(devis.id)}`;
}

/** Raccourci pour le contexte d'un outil MCP (gestionnaire.js : baseLien, espaceN8n). */
export const lienEcranDepuisContexte = (c, devis) => lienEcranDevis({ baseLien: c?.baseLien, espace: c?.espaceN8n }, devis);

/** `{ lienEcran }` ou `{}` : à étaler dans une réponse. */
export const champLienEcran = (c, devis) => { const l = lienEcranDepuisContexte(c, devis); return l ? { lienEcran: l } : {}; };
