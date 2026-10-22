// Module Automatisations (workflows n8n) : règles d'affichage (états, compteurs, filtres, durées, textes). Aucune dépendance (ni Firebase ni DOM) :
// ce fichier se teste seul (tests/automatisations-logique.test.js). Les libellés viennent du cahier des charges de Jérôme (11/10/2026).

export const DELAI_STALE_MS = 10 * 60 * 1000; // « en cours » depuis plus de 10 minutes = à vérifier
export const DELAI_RAFRAICHIR_MS = 10 * 1000; // entre deux rafraîchissements (bouton) et intervalle de la mise à jour automatique
export const LIBELLES_ETAT = {
  new: 'Démarrée', running: 'En cours', waiting: 'En attente', success: 'Terminée', error: 'En erreur',
  canceled: 'Annulée', unknown: 'Inconnu', stale: 'À vérifier',
};
export const OPTIONS_ETAT = [
  { valeur: '', libelle: 'Tous les états' }, { valeur: 'running', libelle: 'En cours' }, { valeur: 'success', libelle: 'Terminées' },
  { valeur: 'error', libelle: 'En erreur' }, { valeur: 'stale', libelle: 'Exécutions à vérifier' },
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

/** Une valeur ou un tableau -> tableau de valeurs non vides. */
const enTableau = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/**
 * Liste filtrée par automatisation (workflowId / workflowIds) et par état (etat / etats : running, success, error, stale). Plus récentes d'abord.
 * Une chaîne ou un tableau : dans un même groupe, il suffit d'en avoir une (« OU ») ; entre les deux groupes il faut les deux (« ET »). Rien de coché = tout.
 * « En cours » (running) englobe « Démarrée » (new).
 */
export function filtrer(liste, { workflowId = '', workflowIds = [], etat = '', etats = [] } = {}, maintenant) {
  const ids = [...enTableau(workflowId), ...enTableau(workflowIds)];
  const lesEtats = [...enTableau(etat), ...enTableau(etats)];
  return liste
    .filter((e) => {
      if (ids.length && !ids.includes(e.workflowId)) return false;
      if (!lesEtats.length) return true;
      const s = etatAffiche(e, maintenant);
      return lesEtats.some((x) => (x === 'running' ? s === 'running' || s === 'new' : s === x));
    })
    .sort((a, b) => (enMs(b.startedAt) ?? 0) - (enMs(a.startedAt) ?? 0) || Number(b.executionId ?? b.id) - Number(a.executionId ?? a.id));
}

/** Critères de la fenêtre « Filtres » : { workflowIds: [], etats: [] }. */
export const criteresVides = () => ({ workflowIds: [], etats: [] });
/** Nombre de cases cochées (la pastille du bouton « Filtres »). */
export const compterCriteres = (c) => (c?.workflowIds?.length || 0) + (c?.etats?.length || 0);

/** Retire des critères les cases qui n'existent plus (une automatisation disparue, un état qui n'a plus d'exécution). */
export function nettoyerCriteres(c, optionsWorkflows, optionsEtats) {
  const ids = new Set(optionsWorkflows.map((o) => o.id));
  const etats = new Set(optionsEtats.map((o) => o.valeur));
  return { workflowIds: (c?.workflowIds || []).filter((i) => ids.has(i)), etats: (c?.etats || []).filter((e) => etats.has(e)) };
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

/** Options de l'état qui ont au moins une exécution dans `liste` (l'entrée vide « Tous les états » est conservée ici ; `optionsEtatCases` la retire pour la fenêtre de filtres) : on ne propose que du possible. */
export function optionsEtatPossibles(liste, maintenant) {
  return OPTIONS_ETAT.filter((o) => o.valeur === '' || filtrer(liste, { etat: o.valeur }, maintenant).length > 0);
}

/** Les mêmes, sans « Tous les états » : ce sont les cases à cocher de la fenêtre « Filtres ». */
export const optionsEtatCases = (liste, maintenant) => optionsEtatPossibles(liste, maintenant).filter((o) => o.valeur !== '');

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
  return `n8n ne répond pas pour le moment. Vous voyez les données de ${dernier === null ? '—' : hhmmss(dernier)}.`;
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

// ------------------------------------------------------------------ vue administrateur (tous les propriétaires)

export const PROPRIETAIRE_INTERNE = 'interne';
export const FILTRE_A_VERIFIER = 'a-verifier'; // « Workflows non reconnus » (à corriger dans n8n)
export const FILTRE_SANS_MODULE = 'sans-module'; // workflows en règle de clients qui n'ont pas le module (rien à corriger)
/** Les deux catégories de workflows non copiés : pas des exécutions, donc aucune liste d'exécutions dans ces vues. */
export const estCategorieWorkflows = (filtre) => filtre === FILTRE_A_VERIFIER || filtre === FILTRE_SANS_MODULE;
/** Signalements d'une catégorie. Sans `categorie` (ancien format), « non reconnu ». */
export const signalementsDe = (liste, filtre) => (liste ?? []).filter((i) => (i.categorie === 'sans-module') === (filtre === FILTRE_SANS_MODULE));

/**
 * Fusionne tes données (Chevalier IA OS, en direct) et celles des clients (fonction serveur, lecture seule) selon le filtre :
 * 'tous', 'interne', l'identifiant d'un client ; 'interne-seul' = pas administrateur (aucun mélange, aucun propriétaire affiché).
 * Renvoie { executions, workflows: Map } ; chaque exécution d'administrateur porte `proprietaire` et un `id` unique (« client/numéro »).
 */
export function fusionnerVues(interne, admin, filtre) {
  if (filtre === 'interne-seul') return { executions: interne.executions, workflows: interne.workflows, proprietaire: false };
  const moi = (e) => ({ ...e, proprietaire: PROPRIETAIRE_INTERNE });
  const lui = (e) => ({ ...e, id: `${e.proprietaire}/${e.id}` });
  const executions = [];
  const workflows = new Map();
  if (filtre === 'tous' || filtre === PROPRIETAIRE_INTERNE || estCategorieWorkflows(filtre)) {
    executions.push(...interne.executions.map(moi));
    for (const [id, w] of interne.workflows) workflows.set(id, w);
  }
  if (filtre !== PROPRIETAIRE_INTERNE) {
    executions.push(...(admin?.executions ?? []).filter((e) => filtre === 'tous' || estCategorieWorkflows(filtre) || e.proprietaire === filtre).map(lui));
    for (const w of admin?.workflows ?? []) if (filtre === 'tous' || estCategorieWorkflows(filtre) || w.proprietaire === filtre) workflows.set(w.id, w);
  }
  return { executions, workflows, proprietaire: true };
}

/** Options du filtre « propriétaire » : Tous, Interne, les clients, « Workflows non reconnus (n) » et, s'il y en a, « Clients sans le module (n) ». */
export function optionsProprietaires(proprietaires, nbAVerifier, nbSansModule = 0) {
  return [
    { valeur: 'tous', libelle: 'Tous les propriétaires' },
    { valeur: PROPRIETAIRE_INTERNE, libelle: 'Interne (toi)' },
    ...(proprietaires ?? []).map((p) => ({ valeur: p.id, libelle: p.nom || p.id })),
    { valeur: FILTRE_A_VERIFIER, libelle: `Workflows non reconnus (${nbAVerifier})` },
    ...(nbSansModule ? [{ valeur: FILTRE_SANS_MODULE, libelle: `Clients sans le module (${nbSansModule})` }] : []),
  ];
}

/** Nom d'un propriétaire pour une pastille sur la ligne. */
export function nomProprietaire(id, proprietaires) {
  if (id === PROPRIETAIRE_INTERNE) return 'Interne';
  return (proprietaires ?? []).find((p) => p.id === id)?.nom || id || '';
}

/**
 * Bandeau jaune de l'administrateur : n8n qui ne répond pas pour toi ou pour un client concerné par le filtre, ou la base des clients illisible.
 * Renvoie un texte ou null.
 */
export function texteBandeauAdmin({ synchroInterne, admin, filtre }) {
  const lignes = [];
  if (filtre === 'tous' || filtre === PROPRIETAIRE_INTERNE || estCategorieWorkflows(filtre)) {
    const t = texteBandeau(synchroInterne);
    if (t) lignes.push(`Interne : ${t}`);
  }
  if (filtre !== PROPRIETAIRE_INTERNE) {
    if (admin?.erreur) lignes.push('Les clients ne sont pas lisibles pour le moment (la fonction n’est pas encore en service ou ne répond pas). Tes propres automatisations restent affichées.');
    else if (admin?.charge && admin.lecturePossible === false) lignes.push('La base des clients (Chevalier IA APP) n’est pas lisible : le droit de lecture n’est pas encore donné au serveur.');
    else for (const p of admin?.proprietaires ?? []) if ((filtre === 'tous' || estCategorieWorkflows(filtre) || filtre === p.id) && p.synchro && p.synchro.n8nOk === false) lignes.push(`${p.nom || p.id} : n8n ne répond pas, les données datent de ${enMs(p.synchro.lastSuccessAt) === null ? '—' : hhmmss(enMs(p.synchro.lastSuccessAt))}.`);
  }
  return lignes.length ? lignes.join(' ') : null;
}
