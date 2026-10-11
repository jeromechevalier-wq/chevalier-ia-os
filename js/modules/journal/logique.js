// Journal d'activité des workflows : règles d'affichage (états, compteurs, filtres, durées, textes). Aucune dépendance (ni Firebase ni DOM) :
// ce fichier se teste seul (tests/journal-logique.test.js). Les libellés viennent du cahier des charges de Jérôme (11/10/2026).

export const DELAI_STALE_MS = 10 * 60 * 1000; // « en cours » depuis plus de 10 minutes = à vérifier
export const DELAI_RAFRAICHIR_MS = 10 * 1000; // entre deux rafraîchissements (bouton) et intervalle de la mise à jour automatique
export const LIBELLES_ETAT = {
  new: 'Démarrée', running: 'En cours', waiting: 'En attente', success: 'Terminée', error: 'En erreur',
  canceled: 'Annulée', unknown: 'Inconnu', stale: 'À vérifier',
};
export const OPTIONS_ETAT = [
  { valeur: '', libelle: 'Tous les états' }, { valeur: 'running', libelle: 'En cours' }, { valeur: 'success', libelle: 'Terminées' },
  { valeur: 'error', libelle: 'En erreur' }, { valeur: 'stale', libelle: 'À vérifier' },
];

const pad = (n) => (n < 10 ? '0' : '') + n;

/** Horodatage Firestore, Date ou nombre -> millisecondes (ou null). */
export function enMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

/**
 * État à AFFICHER d'une exécution : celui de n8n, sauf « en cours » depuis plus de 10 minutes -> « stale » (à vérifier).
 * Le champ `stale` écrit par le serveur compte aussi ; l'écran recalcule avec l'heure actuelle (entre deux copies, le temps passe).
 */
export function etatAffiche(exe, maintenant) {
  const s = exe?.status || 'unknown';
  if (s === 'running' || s === 'new') {
    const debut = enMs(exe.startedAt);
    if (exe.stale === true || (debut !== null && maintenant - debut > DELAI_STALE_MS)) return 'stale';
  }
  return LIBELLES_ETAT[s] ? s : 'unknown';
}

/** Les quatre compteurs du haut de page. « Démarrée » compte comme « en cours ». */
export function compteurs(liste, maintenant) {
  const c = { enCours: 0, erreur: 0, averifier: 0, terminees: 0 };
  for (const e of liste) {
    const s = etatAffiche(e, maintenant);
    if (s === 'running' || s === 'new') c.enCours++;
    else if (s === 'error') c.erreur++;
    else if (s === 'stale') c.averifier++;
    else if (s === 'success') c.terminees++;
  }
  return c;
}

/** Liste filtrée par automatisation (workflowId) et par état ('' = tous ; running / success / error / stale). Plus récentes d'abord. */
export function filtrer(liste, { workflowId = '', etat = '' } = {}, maintenant) {
  return liste
    .filter((e) => {
      if (workflowId && e.workflowId !== workflowId) return false;
      if (!etat) return true;
      const s = etatAffiche(e, maintenant);
      return etat === 'running' ? s === 'running' || s === 'new' : s === etat;
    })
    .sort((a, b) => (enMs(b.startedAt) ?? 0) - (enMs(a.startedAt) ?? 0) || Number(b.executionId ?? b.id) - Number(a.executionId ?? a.id));
}

/** Nom affiché d'une automatisation : le nom choisi par le client, sinon celui de n8n, sinon celui recopié dans l'exécution. */
export function nomAffiche(workflowId, workflows, exe = null) {
  const w = workflows?.get?.(workflowId) ?? null;
  return (w?.libelle || w?.nom || exe?.workflowLabel || 'Automatisation').toString();
}

/** Liste des automatisations pour le filtre : [{ id, nom }], triées par nom. */
export function optionsAutomatisations(workflows, executions) {
  const m = new Map();
  for (const [id, w] of workflows) m.set(id, nomAffiche(id, workflows));
  for (const e of executions) if (e.workflowId && !m.has(e.workflowId)) m.set(e.workflowId, nomAffiche(e.workflowId, workflows, e));
  return [...m].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function hhmmss(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 840 ms -> « 0,8 s » ; 24 s -> « 24 s » ; 125 s -> « 2 min 05 s » ; 3 h 02 -> « 3 h 02 min ». */
export function formaterDuree(ms) {
  const m = Math.max(0, ms);
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} s`;
  const s = Math.round(m / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${pad(Math.floor((s % 3600) / 60))} min`;
}

/** « il y a 12 s », « il y a 5 min », « aujourd'hui 09:41 », « hier 18:02 », « 3 oct. 08:15 ». */
export function depuis(ms, maintenant) {
  const s = Math.round((maintenant - ms) / 1000);
  if (s < 60) return `il y a ${Math.max(0, s)} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  const d = new Date(ms);
  const t = new Date(maintenant);
  const hier = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === t.toDateString()) return `aujourd’hui ${hm}`;
  if (d.toDateString() === hier.toDateString()) return `hier ${hm}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${hm}`;
}

/** Texte de durée d'une ligne : « depuis 3 min 02 s » (en cours) ou « durée 0,8 s » (terminée). `null` si l'on ne sait pas. */
export function texteDuree(exe, maintenant) {
  const debut = enMs(exe.startedAt);
  const s = etatAffiche(exe, maintenant);
  if (s === 'running' || s === 'new' || s === 'stale') return debut === null ? null : { vivant: true, ms: maintenant - debut, texte: `depuis ${formaterDuree(maintenant - debut)}` };
  const ms = typeof exe.durationMs === 'number' ? exe.durationMs : (enMs(exe.stoppedAt) !== null && debut !== null ? enMs(exe.stoppedAt) - debut : null);
  return ms === null ? null : { vivant: false, ms, texte: `durée ${formaterDuree(ms)}` };
}

/** Bandeau jaune si n8n est injoignable (l'écran garde les dernières données), sinon `null`. */
export function texteBandeau(etatSynchro) {
  if (!etatSynchro || etatSynchro.n8nOk !== false) return null;
  const dernier = enMs(etatSynchro.lastSuccessAt);
  return `n8n ne répond pas pour le moment. Vous voyez les données de ${dernier === null ? '—' : hhmmss(dernier)}. Nous sommes prévenus.`;
}

/** « Mis à jour il y a 40 s » (ou « Mis à jour… » tant que rien n'a été copié). */
export function texteMiseAJour(etatSynchro, maintenant) {
  const t = enMs(etatSynchro?.lastSyncedAt);
  return t === null ? 'Mis à jour…' : `Mis à jour ${depuis(t, maintenant)}`;
}

/** Secondes restantes avant de pouvoir rafraîchir à la main (0 = possible). */
export function attenteRafraichir(dernierClic, maintenant) {
  return Math.max(0, Math.ceil((dernierClic + DELAI_RAFRAICHIR_MS - maintenant) / 1000));
}

/** Faut-il lancer une mise à jour automatique maintenant ? Page visible, case cochée, 10 s écoulées depuis la dernière demande. */
export function doitRafraichirAuto({ active, visible, derniereDemande, maintenant, enCours }) {
  return active && visible && !enCours && maintenant - derniereDemande >= DELAI_RAFRAICHIR_MS;
}
