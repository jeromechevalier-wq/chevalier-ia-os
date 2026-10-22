// Décider d'une proposition de la file « À valider » (module Automatisations) : valider, refuser ou relancer.
// UN seul code pour les deux portes d'entrée : la fonction appelable `automatisationsDecider` (l'écran) et les outils MCP valider_proposition / refuser_proposition.
// Les règles (états, transitions, périmée, champs) viennent du fichier pur js/modules/automatisations/propositions.js (copié dans functions/partage/) : jamais recopiées ici.
// Lecture-modification-écriture ATOMIQUE (mettreAJour) : deux décisions en même temps, une seule gagne, l'autre reçoit « Déjà décidée par … ».
// `par` (le compte qui décide) vient TOUJOURS du jeton vérifié ou de la connexion MCP, jamais d'un paramètre de la demande.
import { COLLECTIONS as C } from './donnees.js';
import { valider, refuser, relancer, enMs, LONGUEUR_VALEUR_MAX, LONGUEUR_RAISON_MAX } from '../../partage/propositions.js';

export const DECISIONS = Object.freeze(['valider', 'refuser', 'relancer']);
export const MAX_CHAMPS = 40;
const MOTIF_ID = /^[a-z0-9_-]{1,100}$/;

/** code : demande_invalide | introuvable | deja_decidee | perimee | transition_interdite | champs_invalides */
export class ErreurDecision extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurDecision';
    this.code = code;
  }
}

/** Contrôle de forme de la demande (la règle sur le contenu des champs reste dans valider()). Rend { id, decision, champs, raison } nettoyés ou lève ErreurDecision. */
export function controlerDemande(d) {
  const invalide = (m) => { throw new ErreurDecision('demande_invalide', m); };
  if (!d || typeof d !== 'object' || Array.isArray(d)) invalide('Demande invalide.');
  if (typeof d.id !== 'string' || !MOTIF_ID.test(d.id)) invalide('Identifiant de proposition invalide.');
  if (!DECISIONS.includes(d.decision)) invalide('La décision doit être « valider », « refuser » ou « relancer ».');
  let champs;
  if (d.champs !== undefined && d.champs !== null) {
    if (d.decision !== 'valider') invalide('Les champs ne se corrigent qu\'en validant.');
    if (!Array.isArray(d.champs) || d.champs.length < 1 || d.champs.length > MAX_CHAMPS) invalide(`La liste des champs doit contenir de 1 à ${MAX_CHAMPS} éléments.`);
    champs = d.champs.map((c) => {
      if (!c || typeof c !== 'object' || typeof c.nom !== 'string' || typeof c.valeur !== 'string') invalide('Chaque champ doit avoir un nom et une valeur en texte.');
      if (c.nom.length > 40 || c.valeur.length > LONGUEUR_VALEUR_MAX) invalide(`Un champ est trop long (valeur : ${LONGUEUR_VALEUR_MAX} caractères au plus).`);
      return { nom: c.nom, valeur: c.valeur };
    });
  }
  let raison;
  if (d.raison !== undefined && d.raison !== null) {
    if (d.decision !== 'refuser') invalide('Une raison ne se donne qu\'en refusant.');
    if (typeof d.raison !== 'string' || d.raison.length > LONGUEUR_RAISON_MAX) invalide(`La raison doit tenir en ${LONGUEUR_RAISON_MAX} caractères.`);
    raison = d.raison;
  }
  return { id: d.id, decision: d.decision, champs, raison };
}

/**
 * Applique la décision. `donnees` : accès aux données (mettreAJour). `par` : e-mail vérifié. `canal` : 'interface' | 'mcp'. `maintenant` : ms ou Date.
 * Rend { id, decision, etat, proposition } (la proposition écrite) ou lève ErreurDecision.
 */
export async function decider({ donnees, par, canal, maintenant = Date.now(), demande }) {
  const { id, decision, champs, raison } = controlerDemande(demande);
  if (typeof par !== 'string' || par.trim() === '') throw new ErreurDecision('demande_invalide', 'Le compte qui décide est inconnu.');
  const t = enMs(maintenant);
  const r = await donnees.mettreAJour(C.propositions, id, (courant) => {
    if (!courant) return { ecrire: false, erreur: { code: 'introuvable', message: 'Proposition introuvable.' } };
    const { id: _ignore, ...proposition } = courant; // l'identifiant est le nom du document
    const suite = decision === 'valider' ? valider(proposition, { par, canal, champs, maintenant: t })
      : decision === 'refuser' ? refuser(proposition, { par, canal, raison, maintenant: t })
        : relancer(proposition, { maintenant: t });
    if (!suite.ok) return { ecrire: false, erreur: { code: suite.code, message: suite.message } };
    return { ecrire: true, donnees: suite.proposition, proposition: suite.proposition };
  });
  if (r.erreur) throw new ErreurDecision(r.erreur.code, r.erreur.message);
  return { id, decision, etat: r.proposition.etat, proposition: r.proposition };
}
