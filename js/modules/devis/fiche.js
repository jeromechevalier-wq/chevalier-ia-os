// Fiche d'un devis (panneau latéral ouvert depuis la liste) : fonctions PURES. Aucun accès à Firebase ni au navigateur :
// l'écran (fiche-ecran.js) les appelle, `node --test` les vérifie (tests/devis-liste-fiche.test.js).
// Les montants viennent de logique.js (totauxDevis, vueClient, totalLigne) : rien n'est recalculé à la main ici.
import { totauxDevis, vueClient, totalLigne, adresseEnTexte, transitionPossible, peutArchiver } from './logique.js';
import { familleEffective, estPremierNiveau } from './familles.js';
import { depuis, modifieMs, dateFr, dateDuDevis, EDITEUR_DISPONIBLE, SUPPRESSION_DISPONIBLE, MESSAGE_BIENTOT } from './liste.js';

export const MESSAGE_INTROUVABLE_FICHE = 'Ce devis n’existe plus ou n’est pas accessible.';
export const MESSAGE_PDF_ABSENT = 'PDF pas encore généré';
export const NOM_SANS_FAMILLE = 'Sans famille';

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const texte = (v) => (typeof v === 'string' ? v.trim() : '');

// ---------------------------------------------------------------- identité

/** « Modifié il y a 5 min » ; « Modifié à l’instant » ; texte vide si la date est inconnue. */
export function libelleModifie(d, maintenant) {
  const t = depuis(modifieMs(d), maintenant);
  return t ? `Modifié ${t}` : '';
}

/** Adresse du chantier en une ligne (chantier.adresse, sinon adresses.chantier) ; vide si aucune. */
export function adresseChantier(d) {
  const brute = adresseEnTexte(d?.chantier?.adresse) || adresseEnTexte(d?.adresses?.chantier);
  return brute.split('\n').map((x) => x.trim()).filter(Boolean).join(', ');
}

/** Titre de la fiche : « Devis n° DEV-… » ou « Brouillon » (un brouillon n'a pas encore de numéro). */
export const titreFiche = (d) => (d?.numero ? `Devis n° ${d.numero}` : 'Brouillon');

/** Lien du PDF du devis s'il existe : `pdf` peut être un texte (adresse) ou { lien | url }. Seules les adresses https sont acceptées. */
export function lienPdf(d) {
  const p = d?.pdf;
  const brut = typeof p === 'string' ? p : (p && typeof p === 'object' ? (p.lien ?? p.url) : '');
  const lien = texte(brut);
  return /^https:\/\//i.test(lien) ? lien : '';
}

/** Dates montrées dans le bloc identité (texte JJ/MM/AAAA, vide si inconnue). */
export const datesFiche = (d) => ({ date: dateFr(dateDuDevis(d) ?? ''), validite: dateFr(d?.expireLe ?? '') });

// ---------------------------------------------------------------- totaux et conditions

/**
 * Totaux montrés : ceux figés à la finalisation s'ils existent, sinon calculés par totauxDevis. Jamais d'exception (devis incomplet = zéros).
 * `tvaParTaux` : [{ taux, baseHT, montant }] ; `netAPayer` retombe sur le total TTC.
 */
export function totauxFiche(d) {
  let calcule = null;
  const calculer = () => { if (!calcule) { try { calcule = totauxDevis(d); } catch { calcule = {}; } } return calcule; };
  const f = d?.totaux;
  const fige = f && estNombre(f.ht);
  const base = fige ? f : calculer();
  const ht = estNombre(base.ht) ? base.ht : 0;
  const tva = estNombre(base.tva) ? base.tva : 0;
  const ttc = estNombre(base.ttc) ? base.ttc : ht + tva;
  const tvaParTaux = Array.isArray(base.tvaParTaux) ? base.tvaParTaux : (Array.isArray(calculer().tvaParTaux) ? calculer().tvaParTaux : []);
  return { ht, tva, ttc, netAPayer: estNombre(base.netAPayer) ? base.netAPayer : ttc, tvaParTaux };
}

/**
 * Lignes de « Conditions de paiement » (acompte, retenue de garantie, texte libre, moyens de paiement), lues dans la vue client.
 * Liste vide = « Aucune condition ».
 */
export function conditionsFiche(d) {
  let v;
  try { v = vueClient(d); } catch { return []; }
  const l = [];
  if (v.acompte?.libelle) l.push(v.acompte.libelle, v.acompte.libelleReste);
  if (v.retenueGarantie) l.push(v.retenueGarantie.phrase || v.retenueGarantie.libelle);
  if (texte(v.conditionsPaiement)) l.push(v.conditionsPaiement.trim());
  if (v.modesPaiement?.length) l.push(`Moyens de paiement acceptés : ${v.modesPaiement.join(', ')}`);
  return l.filter(Boolean);
}

// ---------------------------------------------------------------- ventilation par famille

/** Famille de premier niveau d'une ligne : sa famille (ou celle de son article, ou celle de son type), remontée au parent. Null si aucune. */
function familleHaute(ligne, articles, familles) {
  const article = ligne.familleId || !ligne.articleId ? null : (articles ?? []).find((a) => a.id === ligne.articleId);
  const id = familleEffective({ familleId: ligne.familleId || article?.familleId, type: ligne.type ?? article?.type });
  const f = (familles ?? []).find((x) => x.id === id);
  if (!f) return null;
  if (estPremierNiveau(f)) return f;
  return (familles ?? []).find((x) => x.id === f.parentId) ?? f;
}

/**
 * Ventilation d'un devis par famille de premier niveau : HT, TTC, achat et marge brute de chaque famille.
 * HT et TTC viennent de la vue client (une ligne = son total HT et son taux de TVA) ; l'achat est quantité × prix d'achat, au centime.
 * Les totaux sont AVANT remise (`remiseHt` est donnée à part). La marge brute n'est jamais montrée au client.
 * `vide` : le devis n'a aucune ligne.
 */
export function ventilationParFamille(devis, articles = [], familles = []) {
  const groupes = new Map(); // id de famille ('' = sans famille) -> cumul en centimes
  let t = { remiseHt: 0 };
  let vue = { sections: [] };
  try { t = totauxDevis(devis); vue = vueClient(devis); } catch { /* devis incomplet : rien à ventiler */ }
  let nb = 0;
  for (const [i, s] of (devis?.sections ?? []).entries()) {
    for (const [j, l] of (s.lignes ?? []).entries()) {
      nb += 1;
      const vl = vue.sections?.[i]?.lignes?.[j] ?? {};
      const ht = Math.round((estNombre(vl.totalHT) ? vl.totalHT : 0) * 100);
      const taux = estNombre(vl.tauxTva) ? vl.tauxTva : 0;
      const tva = Math.round(ht * taux / 100);
      const achat = Math.round(totalLigne(l.quantite, l.prixAchat) * 100);
      const f = familleHaute(l, articles, familles);
      const g = groupes.get(f?.id ?? '') ?? { id: f?.id ?? '', nom: f?.nom ?? NOM_SANS_FAMILLE, ht: 0, ttc: 0, achat: 0 };
      g.ht += ht; g.ttc += ht + tva; g.achat += achat;
      groupes.set(g.id, g);
    }
  }
  const ordre = (familles ?? []).filter(estPremierNiveau).map((f) => f.id);
  const liste = [...groupes.values()].sort((a, b) => {
    const x = ordre.indexOf(a.id); const y = ordre.indexOf(b.id);
    return (x === -1 ? 1e9 : x) - (y === -1 ? 1e9 : y);
  }).map((g) => ({ id: g.id, nom: g.nom, ht: g.ht / 100, ttc: g.ttc / 100, achat: g.achat / 100, marge: (g.ht - g.achat) / 100 }));
  const somme = (cle) => Math.round(liste.reduce((s, g) => s + Math.round(g[cle] * 100), 0)) / 100;
  return { familles: liste, total: { ht: somme('ht'), ttc: somme('ttc'), achat: somme('achat'), marge: somme('marge') }, remiseHt: estNombre(t.remiseHt) ? t.remiseHt : 0, vide: nb === 0 };
}

export const ONGLETS_VENTILATION = Object.freeze([
  { id: 'ht', libelle: 'Total HT', cle: 'ht' },
  { id: 'ttc', libelle: 'Total TTC', cle: 'ttc' },
  { id: 'marge', libelle: 'Marge brute HT', cle: 'marge' },
]);

/** Part d'un montant dans un total, en % (une décimale) ; 0 si le total est nul ou négatif. */
export function partEnPourcent(montant, total) {
  if (!estNombre(montant) || !estNombre(total) || total <= 0) return 0;
  return Math.round(montant / total * 1000) / 10;
}

/** Lignes du tableau d'un onglet : [{ nom, montant, part }]. Liste vide = « Aucun résultat ». */
export function lignesVentilation(vent, onglet = 'ht') {
  const cle = ONGLETS_VENTILATION.find((o) => o.id === onglet)?.cle ?? 'ht';
  if (!vent || vent.vide) return [];
  return vent.familles.map((f) => ({ id: f.id, nom: f.nom, montant: f[cle], part: partEnPourcent(f[cle], vent.total[cle]) }));
}

// ---------------------------------------------------------------- boutons de la fiche

/**
 * Ce que la fiche propose, selon le statut. Chaque entrée : { actif, raison } (raison = texte d'info quand elle est grisée).
 * Les changements de statut viennent de TRANSITIONS (logique.js) : jamais d'écriture directe.
 * `annuler` : « Refuser » si le devis est envoyé, sinon « Archiver » (signé ou refusé), sinon « Supprimer » (brouillon, pas encore possible), sinon grisé.
 */
export function actionsFiche(d, { editeur = EDITEUR_DISPONIBLE, suppression = SUPPRESSION_DISPONIBLE } = {}) {
  const statut = d?.statut ?? 'brouillon';
  const brouillon = statut === 'brouillon';
  const bientot = { actif: false, raison: MESSAGE_BIENTOT };
  const pdf = lienPdf(d);
  let annuler;
  if (transitionPossible(statut, 'refuser')) annuler = { actif: true, action: 'refuser', libelle: 'Refuser' };
  else if (peutArchiver(d)) annuler = { actif: true, action: 'archiver', libelle: 'Archiver' };
  else if (brouillon) annuler = suppression ? { actif: true, action: 'supprimer', libelle: 'Supprimer' } : { actif: false, action: 'supprimer', libelle: 'Supprimer', raison: MESSAGE_BIENTOT };
  else annuler = { actif: false, action: 'refuser', libelle: 'Annuler', raison: 'Ce devis ne peut plus être annulé.' };
  return {
    principal: brouillon ? 'modifier' : null,
    marquerEnvoye: transitionPossible(statut, 'marquer_envoye') ? { actif: true } : { actif: false, raison: brouillon ? 'Finalise d’abord le devis.' : 'Ce devis est déjà passé à l’étape suivante.' },
    envoyerEmail: bientot,
    facturer: bientot,
    modifier: brouillon ? (editeur ? { actif: true } : bientot) : null,
    voirDevis: brouillon ? null : { actif: true },
    apercuPdf: pdf ? { actif: true, lien: pdf } : { actif: false, raison: MESSAGE_PDF_ABSENT },
    dupliquer: editeur ? { actif: true } : bientot,
    annuler,
  };
}
