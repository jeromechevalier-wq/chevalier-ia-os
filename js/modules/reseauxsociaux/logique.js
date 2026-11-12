// Règles pures du module Réseaux sociaux : aucune dépendance à Firebase ni au DOM, donc importables par les tests Node.
// Les posts eux-mêmes (texte, statut, dates, chiffres) vivent dans Buffer et se LISENT toujours ; ce module ne garde que ce que Buffer ne sait pas
// (pilier, format, service d'un post, clé = identifiant Buffer) et la suite des échanges LinkedIn (activités du CRM de type « linkedin »).
// Les jours et les heures se calculent à Paris (heure d'été et d'hiver), jamais avec une constante UTC en dur.
import * as L from '../crm/logique.js';

export const COLLECTION_POSTS = 'reseauxsociaux_posts';
export const COLLECTION_IMPORTS = 'reseauxsociaux_imports';
export const COLLECTIONS = Object.freeze([COLLECTION_POSTS, COLLECTION_IMPORTS]);

/** Buffer reste le lieu où l'on écrit les posts (ce module ne fait que lire). */
export const URL_BUFFER = 'https://publish.buffer.com';
/** Les chiffres de Buffer sont gardés cinq minutes en mémoire (une lecture = un appel au serveur, qui interroge Buffer). */
export const DUREE_CACHE_BUFFER_MS = 5 * 60 * 1000;

/** Les cinq piliers de la ligne éditoriale (part visée, en pourcentage des posts). */
export const PILIERS = Object.freeze([
  { id: 'pme', libelle: 'Cas concrets', cible: 30 },
  { id: 'claude', libelle: 'Claude au quotidien', cible: 25 },
  { id: 'actu_ia', libelle: 'Actu IA décryptée', cible: 15 },
  { id: 'proximite', libelle: 'Parcours et proximité', cible: 20 },
  { id: 'offre', libelle: 'Offre et premier pas', cible: 10 },
]);

export const FORMATS = Object.freeze([
  { id: 'texte', libelle: 'Texte' },
  { id: 'image', libelle: 'Image' },
  { id: 'carrousel', libelle: 'Carrousel' },
  { id: 'animation', libelle: 'Animation 16:9' },
  { id: 'video', libelle: 'Vidéo 9:16' },
]);

/** Les services d'une entreprise auxquels un post peut parler (aucun coché = post général). */
export const SERVICES = Object.freeze([
  { id: 'administratif_rh', libelle: 'Administratif et RH' },
  { id: 'finance', libelle: 'Finance' },
  { id: 'production', libelle: 'Production' },
  { id: 'commercial', libelle: 'Commercial' },
  { id: 'direction', libelle: 'Direction' },
]);

/** Catégories des contacts : ce sont des étiquettes du CRM (l'id est celui que produit la création d'une étiquette à partir du nom). */
export const CATEGORIES = Object.freeze([
  { id: 'cible', nom: 'Cible' },
  { id: 'relais', nom: 'Relais' },
  { id: 'hors_cible', nom: 'Hors cible' },
  { id: 'a_classer', nom: 'À classer' },
  { id: 'partenaire', nom: 'Partenaire' },
]);

export const LIMITE_LINKEDIN = 3000; // caractères d'un post LinkedIn
export const LIMITE_RESUME_LINKEDIN = 200; // caractères du résumé d'un échange écrit par l'assistant
export const DELAI_RELANCE_JOURS = 7;
export const DELAI_RAPPEL_IMPORT_JOURS = 7;
/** Créneaux de publication : jour de la semaine (0 = dimanche), heure de Paris. */
export const CRENEAUX = Object.freeze([{ jour: 2, heure: '06:08' }, { jour: 4, heure: '06:08' }]);
// Décision prise seul : tolérance de 60 minutes (le cahier dit ±90 min, mais exige aussi qu'un post à 7h30 ne prenne pas le créneau de 6h08, soit 82 minutes d'écart : les deux ne tiennent pas ensemble).
const TOLERANCE_CRENEAU_MS = 60 * 60 * 1000;

const libelleDe = (liste, id) => liste.find((x) => x.id === id)?.libelle ?? null;
export const libellePilier = (id) => libelleDe(PILIERS, id);
export const libelleFormat = (id) => libelleDe(FORMATS, id);
export const libelleService = (id) => libelleDe(SERVICES, id);

// ---------------------------------------------------------------- textes et nombres

/** Début d'un texte sur une ligne : espaces réduits, coupé à `n` caractères avec « … » si besoin. */
export function debutTexte(texte, n = 40) {
  const t = String(texte ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, Math.max(0, n - 1)).trimEnd()}…` : t;
}

/** Nombre au format français (1 240) ; « — » quand la valeur manque (jamais un zéro inventé). */
export function formaterNombre(v) {
  return typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('fr-FR').format(v) : '—';
}

const formateurJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
/** « jeudi 22 octobre » pour un jour civil "AAAA-MM-JJ". */
export function libelleJour(jour) {
  const [a, m, j] = String(jour).split('-').map(Number);
  return formateurJour.format(new Date(Date.UTC(a, m - 1, j, 12)));
}

const formateurDateHeure = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: L.FUSEAU });
const formateurDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: L.FUSEAU });
/** « 17 nov., 06:08 » (heure de Paris), ou chaîne vide si la date est absente. */
export function libelleDateHeure(dateLike) {
  const d = L.versDate(dateLike);
  return d ? formateurDateHeure.format(d) : '';
}
/** « 17 novembre 2026 » (jour de Paris), ou chaîne vide. */
export function libelleDate(dateLike) {
  const d = L.versDate(dateLike);
  return d ? formateurDate.format(d) : '';
}

/** Nom du fichier de sauvegarde du module (logique.js du CRM ne connaît pas ce module : le nom est fait ici). */
export function nomFichierExportReseauxSociaux(maintenant = new Date()) {
  return `chevalier-ia-reseaux-sociaux-${L.aujourdhuiParis(maintenant)}.json`;
}

// ---------------------------------------------------------------- classement d'un post (pilier, format, services)

/** Un identifiant de post Buffer sert d'identifiant de document : lettres, chiffres, tiret, tiret bas. */
export const idPostValide = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);

/** Range un classement : pilier et format inconnus deviennent null, services inconnus retirés (ordre de la liste), sans doublon. */
export function normaliserClassement(valeurs = {}) {
  const pilier = PILIERS.some((p) => p.id === valeurs.pilier) ? valeurs.pilier : null;
  const format = FORMATS.some((f) => f.id === valeurs.format) ? valeurs.format : null;
  const demandes = new Set(Array.isArray(valeurs.services) ? valeurs.services : []);
  return { pilier, format, services: SERVICES.map((s) => s.id).filter((id) => demandes.has(id)) };
}

/**
 * Plan d'écriture du classement d'un post : `existant` = document déjà présent (ou null), `ctx.id` = identifiant Buffer du post.
 * Document absent = création ; présent = modification (jamais deux documents). Rend `{ ecritures }`, à passer à `executer` (journal).
 */
export function planClasserPost(existant, valeurs, ctx = {}) {
  if (!idPostValide(ctx.id)) throw new Error('Identifiant de post invalide.');
  const classement = normaliserClassement(valeurs);
  if (!existant) return { ecritures: [L.ecritureCreer(COLLECTION_POSTS, ctx.id, classement, { horodater: ['creeLe', 'modifieLe'] })] };
  return { ecritures: [L.ecritureModifier(COLLECTION_POSTS, ctx.id, classement, { horodater: ['modifieLe'] })] };
}

// ---------------------------------------------------------------- catégories de contacts (étiquettes du CRM)

/** Identifiant d'une étiquette à partir de son nom (même règle que la création d'une étiquette dans le CRM). */
export const idEtiquette = (nom) => L.normaliser(nom).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etiquette';

/**
 * Étiquettes à ajouter pour que les `noms` existent. `existantes` = le tableau `items` du document des étiquettes, tel qu'il vient d'être lu.
 * Rend `{ items, creees }` : `items` = tout le tableau (les étiquettes déjà là ne sont JAMAIS modifiées), `creees` = ce qui s'ajoute (vide = rien à écrire).
 */
export function categoriesManquantes(existantes, noms) {
  const items = [...(existantes || [])];
  const creees = [];
  let ordre = items.reduce((max, e) => Math.max(max, Number.isFinite(e.ordre) ? e.ordre : 0), items.length);
  for (const brut of noms || []) {
    const nom = L.nettoyerEspaces(brut);
    if (!nom || items.some((e) => L.normaliserNom(e.nom) === L.normaliserNom(nom))) continue;
    const base = idEtiquette(nom);
    let id = base;
    for (let i = 2; items.some((e) => e.id === id); i++) id = `${base}_${i}`;
    const nouvelle = { id, nom, couleur: L.couleurEtiquetteSuivante(items), ordre: ++ordre };
    items.push(nouvelle);
    creees.push(nouvelle);
  }
  return { items, creees };
}

// ---------------------------------------------------------------- créneaux de publication

const jourSemaine = (jour) => { const [a, m, j] = jour.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)).getUTCDay(); };

/**
 * Les créneaux (mardi et jeudi à 6 h 08, heure de Paris) des `jours` prochains jours, du plus proche au plus lointain : [{ date, heure, post }].
 * Un créneau est « rempli » (`post` = ce post) si un post programmé ou publié est prévu à 60 minutes au plus de l'heure ; sinon `post` vaut null (créneau vide).
 * Un créneau déjà passé aujourd'hui n'est pas listé.
 */
export function creneauxAVenir(maintenant, posts, jours = 21) {
  const aujourdhui = L.aujourdhuiParis(maintenant);
  const programmes = (posts || []).filter((p) => p.statut === 'programme' || p.statut === 'publie').map((p) => ({ post: p, instant: L.versDate(p.prevuLe) ?? L.versDate(p.publieLe) })).filter((x) => x.instant);
  const sortie = [];
  for (let i = 0; i < jours; i++) {
    const date = L.ajouterJours(aujourdhui, i);
    for (const c of CRENEAUX.filter((x) => x.jour === jourSemaine(date))) {
      const instant = L.dateHeureParisVersDate(`${date}T${c.heure}`);
      if (instant < maintenant) continue;
      const pris = programmes.find((x) => Math.abs(x.instant - instant) <= TOLERANCE_CRENEAU_MS);
      sortie.push({ date, heure: c.heure, post: pris?.post ?? null });
    }
  }
  return sortie;
}

/** Le post publié le plus récemment (null s'il n'y en a pas). */
export function dernierPostPublie(posts) {
  return (posts || []).filter((p) => p.statut === 'publie').map((p) => ({ p, t: L.versDate(p.publieLe)?.getTime() ?? 0 })).sort((a, b) => b.t - a.t)[0]?.p ?? null;
}

// ---------------------------------------------------------------- suite des échanges LinkedIn

const jourActivite = (a) => (typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.date) ? a.date.slice(0, 10) : (L.jourParis(a.date) ?? L.jourParis(a.dateFait)));
const instantActivite = (a) => L.versDate(a.dateFait)?.getTime() ?? 0;
// Une activité saisie à la main n'a ni `sens` ni `voix` : elle compte « envoyé », à une seule voix.
const sensDe = (a) => (a.sens === 'recu' ? 'recu' : 'envoye');
const voixDe = (a) => (a.voix === 2 ? 2 : 1);

/**
 * Où en est la relation avec une personne : { etape, badge, jours }.
 *  etape : 'a_ecrire' | 'en_attente' | 'en_echange' | 'rendez_vous' ; badge : null | 'relancer' | 'repondre' ; jours : jours pleins depuis le dernier échange (null sans échange).
 * Règles dans cet ordre, la première qui s'applique gagne :
 *  1. un rendez-vous pas encore fait : Rendez-vous ;
 *  2. aucun échange LinkedIn fait (un échange non fait est ignoré, un rendez-vous fait aussi) : À écrire ;
 *  3. les deux ont écrit (voix 2) : En échange, « À répondre » si le dernier message est reçu ;
 *  4. une seule voix, dernier message reçu : À écrire, « À répondre » ;
 *  5. une seule voix, dernier message envoyé : En attente, « À relancer » après 7 jours si un seul message est parti (une seule relance, puis on laisse respirer).
 * Le calcul se fait sur le jour de l'échange (`date`, jour de Paris), jamais sur l'instant d'import. « Hors cible » : jamais de « À relancer ».
 */
export function etapeRelation(personne, activites, maintenant = new Date()) {
  const siennes = (activites || []).filter((a) => a && (a.personneId === personne?.id));
  if (siennes.some((a) => a.type === 'rendez_vous' && a.fait !== true)) return { etape: 'rendez_vous', badge: null, jours: null };
  const faites = siennes.filter((a) => a.type === 'linkedin' && a.fait === true)
    .sort((a, b) => (jourActivite(a) ?? '').localeCompare(jourActivite(b) ?? '') || instantActivite(a) - instantActivite(b));
  if (!faites.length) return { etape: 'a_ecrire', badge: null, jours: null };
  const derniere = faites.at(-1);
  const jourDernier = jourActivite(derniere);
  const jours = jourDernier ? Math.max(0, L.ecartJours(jourDernier, L.aujourdhuiParis(maintenant))) : null;
  const horsCible = (personne?.etiquettes || []).includes('hors_cible');
  if (faites.some((a) => voixDe(a) === 2)) return { etape: 'en_echange', badge: sensDe(derniere) === 'recu' ? 'repondre' : null, jours };
  if (sensDe(derniere) === 'recu') return { etape: 'a_ecrire', badge: 'repondre', jours };
  const envoyes = faites.filter((a) => sensDe(a) === 'envoye').length;
  const relancer = !horsCible && jours !== null && jours >= DELAI_RELANCE_JOURS && envoyes === 1;
  return { etape: 'en_attente', badge: relancer ? 'relancer' : null, jours };
}

/** Les personnes qui demandent une action (badge « À répondre » ou « À relancer »), « À répondre » d'abord puis les plus anciennes : [{ personne, etape, badge, jours }]. */
export function relationsAFaire(personnes, activites, maintenant = new Date()) {
  const parPersonne = new Map();
  for (const a of activites || []) {
    if (!a?.personneId) continue;
    if (!parPersonne.has(a.personneId)) parPersonne.set(a.personneId, []);
    parPersonne.get(a.personneId).push(a);
  }
  return L.sansTests(personnes).filter((p) => !p.archive && parPersonne.has(p.id))
    .map((personne) => ({ personne, ...etapeRelation(personne, parPersonne.get(personne.id), maintenant) }))
    .filter((r) => r.badge)
    .sort((a, b) => (a.badge === b.badge ? (b.jours ?? 0) - (a.jours ?? 0) : (a.badge === 'repondre' ? -1 : 1)) || L.normaliserNom(a.personne.nom).localeCompare(L.normaliserNom(b.personne.nom)));
}

/** Texte du badge d'une relation (« À relancer · 9 j », « À répondre »). */
export function libelleBadgeRelation(r) {
  if (r.badge === 'repondre') return 'À répondre';
  if (r.badge === 'relancer') return `À relancer · ${r.jours} j`;
  return '';
}

// ---------------------------------------------------------------- imports LinkedIn

/** Rappel hebdomadaire : { afficher, jours } ; `jours` = âge du dernier import réussi (null s'il n'y en a jamais eu). Il s'affiche à partir de 7 jours (ou sans import). */
export function rappelImport(imports, maintenant = new Date()) {
  const dernier = (imports || []).filter((i) => i.statut === 'termine').map((i) => L.versDate(i.creeLe)).filter(Boolean).sort((a, b) => b - a)[0];
  if (!dernier) return { afficher: true, jours: null };
  const jours = Math.max(0, L.ecartJours(L.jourParis(dernier), L.aujourdhuiParis(maintenant)));
  return { afficher: jours >= DELAI_RAPPEL_IMPORT_JOURS, jours };
}

// ---------------------------------------------------------------- appel à Buffer : messages d'erreur

export const MESSAGE_BUFFER_ABSENT = 'Buffer n’est pas branché sur cet espace.';

/**
 * Message lisible pour une erreur de la fonction `reseauxsociauxBuffer`. Le serveur écrit lui-même ses refus « métier » (failed-precondition) : on les montre tels quels.
 * Chez un client la fonction n'existe pas (l'appel échoue de façons variées : not-found, internal…) : toute autre erreur dit « pas branché ».
 */
export function messageErreurBuffer(e, chezClient = false) {
  const code = String(e?.code ?? '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
  if (code.endsWith('failed-precondition') && message) return message;
  if (chezClient) return MESSAGE_BUFFER_ABSENT;
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) return 'Ce compte n\'a pas accès à cette action. Se reconnecter si besoin.';
  return 'Le serveur ne répond pas pour le moment. Réessayer dans un instant.';
}
