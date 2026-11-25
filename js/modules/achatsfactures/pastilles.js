// Pastille de contrôle des cartes de factures (module Achats « Factures », 25/11/2026, PR 8a) : calcul PUR, sans appel réseau.
// Une seule vérité : on appelle exactement `controlerFacture` (celle de l'écran Examiner) ; aucune règle n'est recopiée ici.
// Les factures « liées » (doublon, IBAN) sont retrouvées dans la liste COMPLÈTE déjà chargée, avec les mêmes règles que l'écran Examiner.
import { alertesAffichees, controlerFacture, normaliserIban, problemeLecture, sirenDe } from './controles.js';

/** Nombre maximal de factures lues pour le même fournisseur : au-delà, l'historique est incomplet (contrôles « indisponibles », jamais verts). */
export const LIMITE_HISTORIQUE = 500;
/** Nombre maximal de factures lues pour « IBAN partagé » : au-delà, la recherche est incomplète (contrôle « indisponible », jamais vert). */
export const LIMITE_IBAN_AILLEURS = 50;
/** Garde-fou de la liste des factures : au-delà, la liste est incomplète et les factures liées sont inconnues. */
export const MAXIMUM_FACTURES = 10000;

const GRISE_ILLISIBLE = Object.freeze({ niveau: 'neutre', rouge: false, texte: 'Contrôles non faits : à regarder à la main' });
export const PASTILLE_INCONNUE = GRISE_ILLISIBLE;

/** Niveau et phrase d'après les contrôles de l'Examiner. `danger` = au moins un point affiché (`alertesAffichees`) ; `ok` = aucun point ET les neuf contrôles tous verts ; sinon `neutre`. */
export function niveauPastille(controles, facture) {
  if (facture.statut !== 'a_valider') return { niveau: 'neutre', rouge: false, texte: 'Facture déjà décidée : rien à contrôler' };
  const points = alertesAffichees(controles);
  if (points.length > 0) {
    const rouge = controles.some((c) => !c.bientot && c.etat === 'anomalie');
    const cites = points.slice(0, 2).map((p) => p.message).join(' ; ');
    const reste = points.length > 2 ? ` (et ${points.length - 2} autre${points.length - 2 > 1 ? 's' : ''})` : '';
    return { niveau: 'danger', rouge, texte: `${rouge ? 'Anomalie' : 'À vérifier'} : ${cites}${reste}` };
  }
  const actifs = controles.filter((c) => !c.bientot);
  if (actifs.length === 9 && actifs.every((c) => c.etat === 'ok')) return { niveau: 'ok', rouge: false, texte: 'Contrôles automatiques : tout va bien' };
  if (problemeLecture(facture)) return { ...GRISE_ILLISIBLE };
  return { niveau: 'neutre', rouge: false, texte: 'Rien de spécial' };
}

const versLiee = (f) => ({
  id: f.id, statut: f.statut, numero: f.numero, numero_normalise: f.numero_normalise ?? null, montant_ttc: f.montant_ttc, date_facture: f.date_facture,
  fournisseur: f.fournisseur, fournisseur_siren: f.fournisseur_siren ?? null, iban_normalise: f.iban_normalise ?? null, email_expediteur: f.email_expediteur ?? null, date_decision: f.date_decision,
});

const lignesFactices = (n) => Array.from({ length: n }, (_, i) => ({ position: i + 1 }));

/** Pastille de chaque facture, calculée une seule fois pour toute la liste (index par SIREN et par IBAN, pas de boucle n × n).
 *  `toutes` : la liste COMPLÈTE (archives comprises), jamais la liste filtrée. `analysesLues` : false si la lecture des analyses a échoué : les factures à valider restent grises (« Contrôles non faits »). `complete` : false si la liste lue est incomplète (factures liées inconnues : contrôles indisponibles, jamais verts).
 *  `ibansConfirmes` : les IBAN confirmés à la main (null = lecture échouée : jamais de vert sur les contrôles d'IBAN).
 *  `nombreLignes` : null si leur lecture a échoué : le contrôle « Lignes » est alors écarté (jamais vert, jamais de faux danger), et seul un vrai point des 8 autres contrôles donne un danger.
 *  `identite` : identité de l'espace pour le contrôle « Destinataire » (null = non vérifié, voir controles.js). */
export function calculerPastilles(toutes, nombreLignes, complete, analysesLues, ibansConfirmes, identite = null) {
  const resultat = {};
  const incomplete = !complete || toutes.length >= MAXIMUM_FACTURES;
  const parSiren = {};
  const parIban = {};
  for (const f of toutes) {
    const l = versLiee(f);
    if (l.fournisseur_siren) (parSiren[l.fournisseur_siren] ??= []).push(l);
    if (l.iban_normalise) (parIban[l.iban_normalise] ??= []).push(l);
  }
  for (const f of toutes) {
    try {
      if (f.statut !== 'a_valider') { resultat[f.id] = niveauPastille([], f); continue; }
      if (!analysesLues) { resultat[f.id] = { ...GRISE_ILLISIBLE }; continue; }
      const siren = f.fournisseur_siren ?? sirenDe(f.extraction);
      const iban = f.iban_normalise ?? normaliserIban(f.extraction?.iban);
      // Mêmes cas que l'Examiner : sans SIREN ou sans IBAN, liste vide ; groupe trop grand (ou liste incomplète) : null (contrôles indisponibles, jamais verts).
      let memes = [];
      if (siren) { const g = (parSiren[siren] ?? []).filter((a) => a.id !== f.id); memes = incomplete || g.length >= LIMITE_HISTORIQUE ? null : g; }
      let ailleurs = [];
      if (siren && iban) { const g = (parIban[iban] ?? []).filter((a) => a.id !== f.id && !!a.fournisseur_siren && a.fournisseur_siren !== siren); ailleurs = incomplete || g.length >= LIMITE_IBAN_AILLEURS ? null : g; }
      if (nombreLignes === null) {
        // Lignes illisibles : on ne passe pas `null` (cela compterait comme une alerte partout) ; on retire ce contrôle et on juge les 8 autres.
        const huit = controlerFacture(f, memes, ailleurs, [], ibansConfirmes, identite).filter((c) => c.id !== 'lignes');
        const p = niveauPastille(huit, f);
        resultat[f.id] = p.niveau === 'danger' ? p : { niveau: 'neutre', rouge: false, texte: 'Lignes non vérifiées dans la liste : ouvre la facture' };
        continue;
      }
      resultat[f.id] = niveauPastille(controlerFacture(f, memes, ailleurs, lignesFactices(nombreLignes[f.id] ?? 0), ibansConfirmes, identite), f);
    } catch {
      resultat[f.id] = { ...GRISE_ILLISIBLE }; // un calcul qui échoue ne casse jamais la liste, et n'est jamais vert
    }
  }
  return resultat;
}
