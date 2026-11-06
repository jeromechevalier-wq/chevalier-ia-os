// Pastille « état du devis » montrée sur la carte et la fiche d'une affaire (fonctions PURES, testées dans tests/devis-pastille-affaire.test.js).
// On montre le devis le plus RÉCENT de l'affaire (dernière version), avec les libellés et couleurs de la liste des devis. Aucune pastille si l'affaire n'a pas de devis.
import { COULEURS_STATUT, libelleStatut, statutAffiche, enMs } from './liste.js';

const JOUR_MS = 86400000;

/** Le devis le plus récent de l'affaire : on écarte les versions « Remplacé » (une version plus récente existe), puis on prend la dernière créée. null si aucun. */
export function devisRecentDeAffaire(devis, affaireId) {
  if (!affaireId) return null;
  const candidats = (devis ?? []).filter((d) => d?.affaireId === affaireId && d.statut !== 'remplace');
  if (!candidats.length) return null;
  const date = (d) => enMs(d.creeLe) ?? enMs(d.finaliseLe) ?? 0;
  return candidats.reduce((a, b) => (date(b) > date(a) || (date(b) === date(a) && (b.version ?? 1) > (a.version ?? 1)) ? b : a));
}

/** « Envoyé aujourd'hui » / « Envoyé il y a 1 jour » / « Envoyé il y a 3 jours » (jours entiers, jamais négatifs). */
export function texteEnvoye(envoyeLe, maintenantMs) {
  const ms = enMs(envoyeLe);
  if (ms === null) return 'Envoyé';
  const n = Math.max(0, Math.floor((maintenantMs - ms) / JOUR_MS));
  if (n === 0) return 'Envoyé aujourd’hui';
  return `Envoyé il y a ${n} jour${n > 1 ? 's' : ''}`;
}

/** `{ texte, couleur, statut, lien }` de la pastille (`lien` : la route du devis, pour que la pastille l'ouvre), ou null. `aujourdhui` : AAAA-MM-JJ (pour « Expiré »). */
export function pastilleDevisDeAffaire(devis, affaireId, { aujourdhui, maintenantMs = Date.now() } = {}) {
  const d = devisRecentDeAffaire(devis, affaireId);
  if (!d) return null;
  const statut = statutAffiche(d, aujourdhui);
  const texte = statut === 'envoye' ? texteEnvoye(d.envoyeLe, maintenantMs) : libelleStatut(statut);
  const archive = d.archive === true; // un devis archivé compte dans le montant : on le montre, avec « (archivé) » dans la pastille (la fiche porte déjà « Archivée » pour l'affaire)
  const base = texte.startsWith('Devis') ? texte : `Devis : ${texte}`;
  return { texte: archive ? `${base} (archivé)` : base, ...(archive ? { archive: true } : {}), couleur: COULEURS_STATUT[statut] ?? '#8d8993', statut, lien: d.statut === 'brouillon' ? `devis/editeur/${d.id}` : `devis/voir/${d.id}` }; // un devis finalisé s’ouvre sur l’écran unique du devis, sur la Prévisualisation (en lecture seule)
}

/**
 * Le mot d'état du devis (numéro + version) d'une affaire, pour la ligne d'origine du montant : « finalisé », « signé »… (libellé de la liste, minuscules, sans « Devis »).
 * Rend { mot, archive } ou null si le devis est introuvable.
 */
export function etatDevisDeAffaire(devis, affaireId, numero, version, { aujourdhui } = {}) {
  const d = (devis ?? []).find((x) => x?.affaireId === affaireId && x.numero === numero && (x.version ?? 1) === (version ?? 1));
  if (!d) return null;
  const mot = libelleStatut(statutAffiche(d, aujourdhui)).replace(/^Devis\s+/i, '').toLowerCase();
  return { mot, archive: d.archive === true };
}
