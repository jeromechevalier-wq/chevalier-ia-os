// Liste des devis : fonctions PURES (tri, filtre, recherche, pagination, regroupement en colonnes, statut affiché, actions permises).
// Aucun accès à Firebase ni au navigateur : l'écran (liste-ecran.js) les appelle, `node --test` les vérifie (tests/devis-liste.test.js).
// Les règles de statut viennent de logique.js (TRANSITIONS, estExpire) : rien n'est redéfini ici.
import { STATUTS_DEVIS, estExpire, transitionPossible, totauxDevis, peutArchiver } from './logique.js';
import { etatPdfDevis } from './pdf.js';
import { emailPossible } from './email-brouillon.js';

/** L'éditeur de devis existe : « Nouveau devis », « Modifier » et « Dupliquer » sont actifs (false les grise « bientôt disponible »). */
export const EDITEUR_DISPONIBLE = true;
/** Un brouillon se supprime par la fonction du serveur devisSupprimer (jamais un devis finalisé). */
export const SUPPRESSION_DISPONIBLE = true;
export const TAILLES_PAGE = Object.freeze([10, 25, 50]);
export const TAILLE_PAGE_DEFAUT = 25;
export const MESSAGE_BIENTOT = 'Bientôt disponible';

/** Couleur de pastille de chaque statut affiché (comme les autres pastilles de l'interface). */
export const COULEURS_STATUT = Object.freeze({
  brouillon: '#8d8993', en_attente_envoi: '#6fa8ff', envoye: '#c9a4ff', accepte: '#6ddba0', refuse: '#ff8a8a', remplace: '#b3a98f', expire: '#ffb86b',
});
export const libelleStatut = (id) => STATUTS_DEVIS.find((s) => s.id === id)?.libelle ?? '';

// ---------------------------------------------------------------- dates

/** Timestamp Firestore, Date, nombre, objet { seconds } ou texte -> millisecondes (null si illisible). */
export function enMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return enMs(v.toDate());
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6);
  if (typeof v === 'string') { const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v); return Number.isNaN(t) ? null : t; }
  return null;
}

/** Jour AAAA-MM-JJ à Paris (null si illisible). Un texte déjà au format jour est rendu tel quel. */
export function jourParis(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const ms = enMs(v);
  if (ms === null) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** « En date du » : le jour de finalisation, sinon le jour de création (un brouillon n'a pas été finalisé). */
export const dateDuDevis = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d?.dateEmission ?? '') ? d.dateEmission : null) ?? jourParis(d?.finaliseLe) ?? jourParis(d?.creeLe);
/** Date de dernière modification en ms (retombe sur la création). */
export const modifieMs = (d) => enMs(d?.modifieLe) ?? enMs(d?.creeLe) ?? 0;

/** 12/03/2026 à partir de 2026-03-12 (chaîne vide si illisible). */
export const dateFr = (jour) => (/^\d{4}-\d{2}-\d{2}$/.test(jour ?? '') ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : '');

/** « il y a 5 min », « il y a 3 h », « il y a 2 j », « il y a 3 mois » ; moins d'une minute : « à l’instant ». */
export function depuis(ms, maintenant) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const minutes = Math.floor((maintenant - ms) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  if (jours < 60) return `il y a ${jours} j`;
  return `il y a ${Math.floor(jours / 30)} mois`;
}

/** Initiales de la personne qui a modifié, depuis son e-mail : « jerome.chevalier@x.fr » -> « JC » ; un seul mot -> une lettre. */
export function initialesDe(email) {
  const local = String(email ?? '').split('@')[0];
  const mots = local.split(/[._+\- ]+/).filter(Boolean);
  if (!mots.length) return '';
  return ((mots[0][0] ?? '') + (mots.length > 1 ? mots.at(-1)[0] : '')).toUpperCase();
}

// ---------------------------------------------------------------- statut affiché, totaux

/** Statut montré : « expire » quand un devis finalisé ou envoyé a dépassé sa validité (calculé, jamais stocké). */
/** Pastille ronde en bas à droite d'une carte du Tableau, comme sur les Affaires et les Projets : rouge (à régler : PDF non rangé, devis expiré ou refusé), verte (envoyé ou signé), grise (le reste : brouillon, finalisé pas encore envoyé). */
export function couleurPastilleDevis(d, aujourdhui, maintenant = Date.now()) {
  const statut = statutAffiche(d, aujourdhui);
  if (etatPdfDevis(d, maintenant) === 'a_reessayer' || statut === 'expire' || statut === 'refuse') return 'rouge';
  return statut === 'envoye' || statut === 'accepte' ? 'verte' : 'grise';
}
export const LIBELLES_PASTILLE_DEVIS = Object.freeze({ rouge: 'À régler', verte: 'Envoyé ou signé', grise: 'Rien à signaler' });

export const statutAffiche = (d, aujourdhui) => (estExpire(d, aujourdhui) ? 'expire' : (d?.statut ?? 'brouillon'));

/** Totaux HT et TTC : ceux figés à la finalisation, sinon calculés (brouillon). null si le calcul est impossible. */
export function totauxDe(d) {
  if (typeof d?.totaux?.ht === 'number') return { ht: d.totaux.ht, ttc: typeof d.totaux.ttc === 'number' ? d.totaux.ttc : d.totaux.ht };
  try {
    const t = totauxDevis(d);
    return { ht: t.ht, ttc: typeof t.ttc === 'number' ? t.ttc : t.ht };
  } catch { return null; }
}

// ---------------------------------------------------------------- tri

export const CRITERES_TRI = Object.freeze({
  modifie: (d) => modifieMs(d),
  numero: (d) => d.numero ?? '',
  date: (d) => dateDuDevis(d) ?? '',
  validite: (d) => d.expireLe ?? '',
  ht: (d) => totauxDe(d)?.ht ?? -Infinity,
  ttc: (d) => totauxDe(d)?.ttc ?? -Infinity,
});

/** Tri stable (copie). Défaut : modifié le plus récemment d'abord. À égalité : numéro décroissant puis identifiant, pour un ordre toujours le même. */
export function trier(liste, { critere = 'modifie', sens = 'desc' } = {}) {
  const cle = CRITERES_TRI[critere] ?? CRITERES_TRI.modifie;
  const f = sens === 'asc' ? 1 : -1;
  return [...liste].sort((a, b) => {
    const x = cle(a); const y = cle(b);
    const c = typeof x === 'string' ? x.localeCompare(y, 'fr') : (x - y);
    return c !== 0 ? c * f : (String(b.numero ?? '').localeCompare(String(a.numero ?? '')) || String(a.id).localeCompare(String(b.id)));
  });
}

// ---------------------------------------------------------------- filtres et recherche

/** `statuts` : statuts affichés cochés (vide = tous ; « expire » reconnu) ; `du` / `au` : jours AAAA-MM-JJ inclus, sur « En date du » (un devis sans date est écarté dès qu'une borne est posée). */
export function filtrer(liste, { statuts = [], du = '', au = '', aujourdhui } = {}) {
  return liste.filter((d) => {
    if (statuts.length && !statuts.includes(statutAffiche(d, aujourdhui))) return false;
    if (du || au) {
      const jour = dateDuDevis(d);
      if (!jour) return false;
      if (du && jour < du) return false;
      if (au && jour > au) return false;
    }
    return true;
  });
}

const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recherche sur le numéro, le client et l'affaire (sans accent ni majuscule ; chaque mot doit se retrouver). `noms(d)` rend { client, affaire }. */
export function rechercher(liste, texte, noms = () => ({})) {
  const mots = sansAccent(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return liste;
  return liste.filter((d) => {
    const n = noms(d) ?? {};
    const botte = sansAccent(`${d.numero ?? ''} ${n.client ?? ''} ${n.affaire ?? ''}`);
    return mots.every((m) => botte.includes(m));
  });
}

/** Périodes proposées dans « Filtres » (colonne « En date du »). Décision : des périodes prêtes plutôt que deux dates à saisir (la fenêtre de filtres commune n'a pas de champ date). */
export const PERIODES = Object.freeze([
  { id: 'toutes', libelle: 'Toutes les dates' },
  { id: '30j', libelle: '30 derniers jours' },
  { id: '90j', libelle: '90 derniers jours' },
  { id: 'mois', libelle: 'Ce mois-ci' },
  { id: 'annee', libelle: 'Cette année' },
]);
const ajouterJours = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Bornes { du, au } (jours AAAA-MM-JJ, '' = sans borne) d'une période, à partir d'aujourd'hui. */
export function bornesDePeriode(id, aujourdhui) {
  if (id === '30j') return { du: ajouterJours(aujourdhui, -30), au: '' };
  if (id === '90j') return { du: ajouterJours(aujourdhui, -90), au: '' };
  if (id === 'mois') return { du: `${aujourdhui.slice(0, 7)}-01`, au: '' };
  if (id === 'annee') return { du: `${aujourdhui.slice(0, 4)}-01-01`, au: '' };
  return { du: '', au: '' };
}

// ---------------------------------------------------------------- pagination

/** Page demandée (ramenée dans les bornes). `libelle` : « 1 à 2 sur 2 éléments ». */
export function paginer(liste, page = 1, parPage = TAILLE_PAGE_DEFAUT) {
  const taille = TAILLES_PAGE.includes(parPage) ? parPage : TAILLE_PAGE_DEFAUT;
  const total = liste.length;
  const pages = Math.max(1, Math.ceil(total / taille));
  const courante = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  const debut = total ? (courante - 1) * taille : 0;
  const lignes = liste.slice(debut, debut + taille);
  const libelle = total === 0 ? '0 élément' : `${debut + 1} à ${debut + lignes.length} sur ${total} ${total > 1 ? 'éléments' : 'élément'}`;
  return { lignes, page: courante, pages, parPage: taille, total, libelle };
}

// ---------------------------------------------------------------- tableau (colonnes par statut)

/** Colonnes de la vue Tableau (décision de Jérôme, 25/10/2026) : quatre colonnes. Un devis finalisé mais pas encore envoyé reste dans « Envoyé » (avec une pastille « Pas encore envoyé »). */
export const COLONNES_TABLEAU = Object.freeze([
  { id: 'brouillon', libelle: 'Brouillon', statuts: ['brouillon'] },
  { id: 'envoye', libelle: 'Envoyé', statuts: ['envoye', 'en_attente_envoi'] },
  { id: 'accepte', libelle: 'Signé', statuts: ['accepte'] },
  { id: 'refuse', libelle: 'Refusé', statuts: ['refuse'] },
]);

/** Statuts qui ne sont plus dans le Tableau : ils se lisent dans la vue « Archives » (rien n'est modifié en base). */
export const STATUTS_HORS_TABLEAU = Object.freeze(['remplace', 'expire']);
export const estHorsTableau = (d, aujourdhui) => STATUTS_HORS_TABLEAU.includes(statutAffiche(d, aujourdhui));
/** Vue « Archives » : les devis archivés à la main, plus les anciennes versions (remplacées) et les devis expirés. */
export const estDansArchives = (d, aujourdhui) => d?.archive === true || estHorsTableau(d, aujourdhui);

/** Libellé de la pastille d'un devis finalisé mais pas encore envoyé (statut « en_attente_envoi »). */
export const LIBELLE_PAS_ENCORE_ENVOYE = 'Pas encore envoyé';

/** Répartit les devis (déjà triés) dans les colonnes selon leur statut AFFICHÉ. Remplacé et expiré n'ont pas de colonne (ignorés) ; un statut inconnu va dans « Brouillon ». */
export function regrouperParColonne(liste, aujourdhui) {
  const colonnes = COLONNES_TABLEAU.map((c) => ({ id: c.id, libelle: c.libelle, devis: [] }));
  for (const d of liste) {
    const s = statutAffiche(d, aujourdhui);
    if (STATUTS_HORS_TABLEAU.includes(s)) continue;
    const i = COLONNES_TABLEAU.findIndex((c) => c.statuts.includes(s));
    colonnes[i === -1 ? 0 : i].devis.push(d);
  }
  return colonnes;
}

// ---------------------------------------------------------------- actions permises (menu « … »)

/** Changements de statut proposés, avec l'opération du serveur : finaliser | marquer_envoye | accepter | refuser. Jamais d'écriture directe. */
export const CHANGEMENTS_STATUT = Object.freeze([
  { action: 'finaliser', libelle: 'Finalisé' },
  { action: 'marquer_envoye', libelle: 'Envoyé' },
  { action: 'accepter', libelle: 'Signé' },
  { action: 'refuser', libelle: 'Refusé' },
]);

/**
 * Ce que le menu « … » d'un devis propose. `statuts` : les changements permis (selon TRANSITIONS) ; les autres entrées disent si elles sont actives.
 * Chaque entrée : { actif, raison } (raison = texte d'info quand elle est grisée).
 */
export function actionsPermises(d, { editeur = EDITEUR_DISPONIBLE, suppression = SUPPRESSION_DISPONIBLE } = {}) {
  const statut = d?.statut ?? 'brouillon';
  const brouillon = statut === 'brouillon';
  const bientot = { actif: false, raison: MESSAGE_BIENTOT };
  const version = transitionPossible(statut, 'nouvelle_version');
  return {
    statuts: CHANGEMENTS_STATUT.filter((c) => transitionPossible(statut, c.action)),
    voir: { actif: true },
    editer: brouillon ? (editeur ? { actif: true } : bientot) : { actif: false, raison: MESSAGE_NON_EDITABLE },
    nouvelleVersion: version ? (editeur ? { actif: true } : bientot) : { actif: false, raison: brouillon ? 'Un brouillon se modifie directement.' : 'Pas de nouvelle version pour un devis signé ou remplacé.' },
    dupliquer: editeur ? { actif: true } : bientot,
    facturer: bientot,
    envoyer: emailPossible(statut),
    supprimer: brouillon ? (suppression ? { actif: true } : bientot) : { actif: false, raison: 'Seul un brouillon se supprime.' },
  };
}

export const MESSAGE_NON_EDITABLE = 'Ce devis est finalisé : on ne le modifie plus. Pour le corriger, crée une nouvelle version.';
export const MESSAGE_ARCHIVE_IMPOSSIBLE = 'Seul un devis signé ou refusé peut être archivé.';

/** Entrée « Archiver » / « Désarchiver » du menu « … » (même schéma que les projets). Les règles sont celles du serveur : on n'archive qu'un devis signé ou refusé. */
export function archivageDevis(d) {
  if (d?.archive === true) return { actif: true, action: 'desarchiver', libelle: 'Désarchiver', icone: 'archive-restore' };
  if (peutArchiver(d)) return { actif: true, action: 'archiver', libelle: 'Archiver', icone: 'archive' };
  return { actif: false, action: 'archiver', libelle: 'Archiver', icone: 'archive', raison: MESSAGE_ARCHIVE_IMPOSSIBLE };
}

/**
 * UNE SEULE SOURCE pour les actions d'un devis : le menu « … » de la liste, celui de l'éditeur et celui de la visualisation partent de cette liste.
 * Rend des descriptions sans code d'écran : { cle, libelle, icone, actif, danger? }, { separateur: true } ou { texte } (explication d'une entrée grisée).
 * Clés : statut:<action>, editer, voir, nouvelle_version, dupliquer, envoyer_email, archiver, supprimer. `exclure` retire des clés (celles qui ont déjà un bouton direct dans l'écran).
 */
export function entreesActionsDevis(d, { exclure = [], editeur = EDITEUR_DISPONIBLE, suppression = SUPPRESSION_DISPONIBLE } = {}) {
  const a = actionsPermises(d, { editeur, suppression });
  const ar = archivageDevis(d);
  const avec = (texte, e) => (e.raison === MESSAGE_BIENTOT ? `${texte} (bientôt disponible)` : texte);
  const sortie = [];
  const ajouter = (cle, libelle, ic, e, extra = {}) => {
    if (exclure.includes(cle)) return;
    sortie.push({ cle, libelle: avec(libelle, e), icone: ic, actif: e.actif, ...extra });
    if (!e.actif && e.raison && e.raison !== MESSAGE_BIENTOT) sortie.push({ texte: e.raison });
  };
  for (const c of a.statuts) {
    if (!exclure.includes(`statut:${c.action}`)) sortie.push({ cle: `statut:${c.action}`, libelle: `Passer à « ${c.libelle} »`, icone: 'check', actif: true, action: c.action, statutLibelle: c.libelle });
  }
  if (a.statuts.length) sortie.push({ separateur: true });
  ajouter('editer', 'Éditer le devis', 'pencil', a.editer);
  ajouter('voir', 'Voir le devis', 'eye', a.voir);
  if (a.nouvelleVersion.actif || a.nouvelleVersion.raison === MESSAGE_BIENTOT) ajouter('nouvelle_version', 'Créer une nouvelle version', 'git-branch', a.nouvelleVersion);
  ajouter('dupliquer', 'Dupliquer', 'copy', a.dupliquer);
  ajouter('envoyer_email', 'Envoyer par e-mail', 'mail', a.envoyer);
  if (!exclure.includes('archiver')) {
    sortie.push({ separateur: true });
    sortie.push({ cle: 'archiver', libelle: ar.libelle, icone: ar.icone, actif: ar.actif, action: ar.action });
    if (!ar.actif && ar.raison) sortie.push({ texte: ar.raison });
  }
  if (d?.statut === 'brouillon') ajouter('supprimer', 'Supprimer', 'trash-2', a.supprimer, { danger: true });
  // Jamais de séparateur en tête, en queue ou doublé.
  return sortie.filter((e, i, l) => !(e.separateur && (i === 0 || i === l.length - 1 || l[i - 1].separateur)));
}
