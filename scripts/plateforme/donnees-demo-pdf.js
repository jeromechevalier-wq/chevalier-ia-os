// Outil « données de démonstration » : option --pdf. Fabrique les PDF des devis fictifs déjà écrits chez un client de démo.
// Ces devis ont été écrits directement en base (finalisé, envoyé, signé, refusé) : le serveur ne les a jamais vus passer de « brouillon » à « finalisé »,
// donc aucun PDF n'existe (l'écran montre « PDF non rangé »). Mécanisme : on rejoue ce passage, pour de vrai, devant le déclencheur `devisPdfAuto`
// (functions/src/devis/pdf-declencheur.js, qui ne réagit qu'à « brouillon -> autre statut » quand `pdf.statut` n'est pas « ok »).
//
// Pour chaque devis, DEUX update() séparés, commités l'un après l'autre (jamais dans un lot ni une transaction, jamais set() sans merge :
// un seul événement avec avant.statut === après.statut ne déclencherait rien) :
//   1. { statut: 'brouillon', pdf: null, donneesDemoStatutOrigine: <statut d'origine> }
//   2. { statut: <statut d'origine>, donneesDemoStatutOrigine: supprimé }
// Le statut d'origine est écrit EN BASE dans la même écriture que « brouillon » : si le programme est coupé entre les deux, le lancement suivant
// remet les statuts (jamais la mémoire du processus).
import { FieldValue } from 'firebase-admin/firestore';
import { ErreurOutil, modulesActifsDe } from './commun.js';
import * as D from '../../js/modules/devis/logique.js';

export const MARQUEUR = 'donneesDemo';
export const CHAMP_ORIGINE = 'donneesDemoStatutOrigine';
export const PARALLELE_DEFAUT = 2;
export const INTERVALLE_MS = 5_000;
export const PLAFOND_DEVIS_MS = 10 * 60_000;
export const DETECTION_MS = 60_000;
export const SECOURS_DELAI_EN_COURS_MS = 10 * 60_000; // seulement si functions/ n'est pas installé sur cet ordinateur (voir delaiEnCours)

/** Le délai au-delà duquel un « en cours » est considéré comme abandonné : lu dans le code du serveur (jamais recopié) quand c'est possible. */
export async function delaiEnCours() {
  try {
    return (await import('../../functions/src/coeur/devis.js')).DELAI_EN_COURS_MS;
  } catch {
    return SECOURS_DELAI_EN_COURS_MS; // npm ci pas fait dans functions/ : valeur de secours, identique au serveur au 26/10/2026
  }
}

const dateDe = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null);
const libelleStatut = (s) => D.STATUTS_DEVIS.find((x) => x.id === s)?.libelle ?? s;
const dormirVrai = (ms) => new Promise((r) => setTimeout(r, ms));

/** Réglages de l'attente (tous remplaçables dans les tests). */
function reglages(ctx) {
  const p = ctx.pdf ?? {};
  return {
    parallele: Number.isInteger(p.parallele) && p.parallele > 0 ? p.parallele : PARALLELE_DEFAUT,
    intervalleMs: p.intervalleMs ?? INTERVALLE_MS,
    plafondMs: p.plafondMs ?? PLAFOND_DEVIS_MS,
    detectionMs: p.detectionMs ?? DETECTION_MS,
    dormir: p.dormir ?? dormirVrai,
    horloge: p.horloge ?? Date.now,
  };
}

/** Le client doit avoir le module Devis : sinon le déclencheur ne répond pas. */
export function exigerModuleDevis(fiche) {
  if (!modulesActifsDe(fiche?.modules).includes('devis')) {
    throw new ErreurOutil(['Le module « devis » n\'est pas actif chez ce client : le déclencheur du PDF ne réagirait pas.', 'Activez-le : node scripts/nouveau-client.js activer-module <client> devis --ecrire']);
  }
}

/** Remet le statut d'origine des devis laissés en « brouillon » par un lancement interrompu. Rend les ids rétablis. */
async function reprendre(db, id, ctx) {
  const snap = await db.collection(`clients/${id}/devis_devis`).where(MARQUEUR, '==', true).get();
  const restes = snap.docs.filter((d) => typeof d.data()[CHAMP_ORIGINE] === 'string' && d.data()[CHAMP_ORIGINE]);
  if (!restes.length) return [];
  ctx.out(`Reprise : ${restes.length} devis laissé(s) en « brouillon » par un lancement interrompu${ctx.ecrire ? ' ; statut d\'origine remis' : ' (seraient remis en état)'}.`);
  if (!ctx.ecrire) return [];
  for (const d of restes) {
    await d.ref.update({ statut: d.data()[CHAMP_ORIGINE], [CHAMP_ORIGINE]: FieldValue.delete() });
    ctx.ecrits = true;
  }
  return restes.map((d) => d.id);
}

/** Les devis de démo dont le PDF manque. `forces` = ids qu'on vient de rétablir (le déclencheur a pu démarrer : on les attend aussi). */
async function candidats(db, id, forces, delai, maintenant) {
  const snap = await db.collection(`clients/${id}/devis_devis`).where(MARQUEUR, '==', true).get();
  const sautes = { ok: 0, enCours: 0 };
  const liste = [];
  for (const d of snap.docs) {
    const x = d.data();
    if (x.statut === 'brouillon' || typeof x.statut !== 'string') continue;
    if (x.pdf?.statut === 'ok') { sautes.ok += 1; continue; }
    const debut = dateDe(x.pdf?.demarreLe);
    const recent = x.pdf?.statut === 'en_cours' && (!debut || Math.abs(maintenant - debut.getTime()) < delai);
    const reprise = forces.includes(d.id);
    if (recent && !reprise) { sautes.enCours += 1; continue; }
    liste.push({ id: d.id, ref: d.ref, numero: x.numero ?? '(sans numéro)', statut: x.statut, reprise });
  }
  liste.sort((a, b) => a.numero.localeCompare(b.numero));
  return { liste, sautes };
}

/** Tout ce que fait --pdf. `ctx` : out, ecrire, base ({ db }), pdf (réglages de test). */
export async function fabriquerPdf(id, ctx, fiche) {
  exigerModuleDevis(fiche);
  const db = ctx.base.db;
  const r = reglages(ctx);
  const delai = await delaiEnCours();
  ctx.phasePdf = true; // pour le message d'erreur final (voir executerDonneesDemo)
  ctx.out('');
  ctx.out('PDF des devis fictifs (déclencheur devisPdfAuto)');
  const forces = await reprendre(db, id, ctx);
  const { liste, sautes } = await candidats(db, id, forces, delai, r.horloge());
  if (sautes.ok) ctx.out(`  ${sautes.ok} devis ont déjà leur PDF : sautés.`);
  if (sautes.enCours) ctx.out(`  ${sautes.enCours} devis ont un PDF en cours de fabrication (moins de ${Math.round(delai / 60000)} min) : sautés.`);
  if (!liste.length) { ctx.out('  Aucun devis de démonstration à traiter.'); return 0; }
  ctx.out(`  À traiter : ${liste.length} devis, ${r.parallele} à la fois.`);
  for (const d of liste) ctx.out(`    - ${d.numero.padEnd(18)} ${libelleStatut(d.statut)}`);
  if (!ctx.ecrire) { ctx.out('SIMULATION : rien n\'a été écrit. Relancez avec --ecrire pour fabriquer ces PDF.'); return 0; }

  const etat = { vu: false, t0: null, arret: false, resultats: new Map() };
  const attendre = async (d) => {
    const fin = r.horloge() + r.plafondMs;
    for (;;) {
      const x = (await d.ref.get()).data() ?? {};
      const s = x.pdf?.statut;
      if (s === 'en_cours' || s === 'ok' || s === 'echec') etat.vu = true;
      if (s === 'ok' || s === 'echec') return s;
      if (etat.arret) return 'attente';
      if (!etat.vu && r.horloge() - etat.t0 >= r.detectionMs) { etat.arret = true; return 'attente'; }
      if (r.horloge() >= fin) return 'attente';
      await r.dormir(r.intervalleMs);
    }
  };
  const ecrireDeuxFois = async (d) => {
    const rendre = () => d.ref.update({ statut: d.statut, [CHAMP_ORIGINE]: FieldValue.delete() });
    try { await rendre(); } catch { await rendre(); } // une seconde chance ; sinon l'erreur remonte et le lancement suivant remet le statut (reprise)
  };
  const traiter = async (d) => {
    // Un devis repris vient d'être remis en état par `reprendre` (le déclencheur a peut-être déjà démarré) : on l'attend seulement, sans réécrire.
    if (!d.reprise) {
      await d.ref.update({ statut: 'brouillon', pdf: null, [CHAMP_ORIGINE]: d.statut });
      ctx.ecrits = true;
      await ecrireDeuxFois(d);
    }
    etat.t0 ??= r.horloge();
    const fin = await attendre(d);
    etat.resultats.set(d.id, fin);
    ctx.out(`  ${d.numero.padEnd(18)} ${libelleStatut(d.statut).padEnd(10)} PDF ${fin === 'ok' ? 'ok' : fin === 'echec' ? 'ÉCHEC' : 'en attente (pas fini)'}`);
  };
  const file = [...liste];
  const ouvriers = Array.from({ length: Math.min(r.parallele, file.length) }, async () => {
    while (file.length && !etat.arret) {
      try { await traiter(file.shift()); } catch (e) { etat.erreur ??= e; etat.arret = true; }
    }
  });
  await Promise.allSettled(ouvriers);

  await marquerEvenements(db, id, ctx).catch(() => {});
  if (etat.erreur) throw etat.erreur;
  const total = (v) => [...etat.resultats.values()].filter((x) => x === v).length;
  if (etat.arret && !etat.vu) {
    throw new ErreurOutil('Le déclencheur devisPdfAuto ne répond pas : fonctions PDF pas déployées chez les clients ? (voir docs/pdf-clients.md)');
  }
  const pasFaits = liste.length - etat.resultats.size;
  ctx.out(`Bilan : ${total('ok')} PDF ok, ${total('echec')} en échec, ${total('attente') + pasFaits} pas finis.`);
  if (total('echec') || total('attente') || pasFaits) {
    ctx.out('Les devis restants gardent leur statut. Relancez --pdf --ecrire plus tard, ou cliquez « Réessayer » sur le devis.');
    return 1;
  }
  ctx.out('✔ Tous les PDF sont rangés.');
  return 0;
}

/** Les anciens PDF ont écrit « Document joint : … » (crm_evenements) sans marqueur (le serveur ne le fait plus depuis le 27/10/2026) : on marque ceux des affaires de démo, pour que --retirer les supprime. */
export async function marquerEvenements(db, id, ctx) {
  const affaires = new Set((await db.collection(`clients/${id}/crm_affaires`).where(MARQUEUR, '==', true).get()).docs.map((d) => d.id));
  const snap = await db.collection(`clients/${id}/crm_evenements`).where('type', '==', 'document').get();
  const aMarquer = snap.docs.filter((d) => affaires.has(d.data().affaireId) && d.data()[MARQUEUR] !== true);
  for (const d of aMarquer) await d.ref.update({ [MARQUEUR]: true });
  if (aMarquer.length) ctx.out(`  ${aMarquer.length} événement(s) « Document joint » marqué(s) comme démonstration (retirés par --retirer).`);
  return aMarquer.length;
}

/** Fichiers Storage des devis des affaires de démo : clients/<id>/devis/<affaireId>/… (jamais un autre chemin). */
export async function fichiersPdfDemo(bucket, id, affaireIds) {
  const fichiers = [];
  for (const a of affaireIds) {
    if (typeof a !== 'string' || !/^[A-Za-z0-9_-]+$/.test(a)) continue;
    const prefixe = `clients/${id}/devis/${a}/`;
    const [liste] = await bucket.getFiles({ prefix: prefixe });
    for (const f of liste) if (f.name.startsWith(prefixe) && !f.name.includes('..')) fichiers.push(f);
  }
  return fichiers;
}
