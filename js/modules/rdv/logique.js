// Module « Rendez-vous » : règles pures (sans Firebase, sans navigateur), testables par Node.
// Le même fichier servira à l'écran et, plus tard, au serveur (PR 4) : il ne dépend de rien.
//
// Formes de données (tables `rdv_…`, voir docs/tables.md) :
//  - rendez-vous : { id, client, objet, adresse, commune, creneaux: [ISO…] (1 à 3), etat, creneauChoisi, archive,
//      tour, envoiDemandeLe, confirmeLe, annule, test, relancesTermineesLe (écrit par le serveur avec l'alerte de fin) }
//  - participant : { id, rendezVousId, personneId, nom, role, telephone (+33…), reponse, etatReponse,
//      creneauxOk: [1, 3], reponseLe, idReponse }
//  - message (jamais modifié) : { id, rendezVousId, tour, sens: 'sortant'|'entrant', numero, texte, caracteres,
//      segments, typeMessage, idFournisseur, echeance, comprise, envoyeLe }
//  - paramètres : voir PARAMETRES_DEFAUT.
// Les instants sont stockés en ISO UTC (ou en millisecondes) ; les calculs de jour et d'heure se font en Europe/Paris.

export const FUSEAU = 'Europe/Paris';
export const ETATS = ['en_attente', 'a_valider', 'confirme', 'a_reprendre'];
export const LIBELLES_ETATS = { en_attente: 'En attente', a_valider: 'À valider', confirme: 'Confirmés', a_reprendre: 'À reprendre' };
export const TYPES_MESSAGE = ['confiance', 'creneaux', 'relance', 'confirmation', 'rappel', 'pluie', 'alerte'];
export const ETATS_REPONSE = ['attente', 'comprise', 'incomprise', 'saisie'];
export const ROLES_DEPART = ['Client', 'Terrassier', 'Architecte', 'Géomètre'];
export const MAX_CRENEAUX = 3;
export const MAX_PARTICIPANTS = 5;
/** Délai fixe entre la dernière relance et l'alerte « relances terminées ». */
export const DELAI_ALERTE_HEURES = 24;
/** « Aucun créneau à venir ne convient » : plus d'alerte si le dernier créneau commun est passé depuis plus de ce nombre de jours. */
export const AGE_MAX_ALERTE_AUCUN_JOURS = 7;
/** Taille d'un SMS en GSM-7 (160 unités) ; le prix d'un SMS est réglable (`prixSms`, voir `coutSms`). */
export const SEUIL_SMS = 160;
/** Prix d'un segment de SMS en euros et date de ces tarifs (réglables dans Réglages > Rendez-vous ; une estimation, jamais une facture). */
export const PRIX_SMS_DEFAUT = 0.0685;
export const TARIFS_AU_DEFAUT = '1er novembre 2026';

const HEURE_MS = 3600 * 1000;
const MINUTE_MS = 60 * 1000;
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Nom de l'entreprise écrit dans les SMS (réglable dans Réglages > Rendez-vous ; « Chevalier IA » tant qu'il n'est pas réglé). */
export const NOM_ENTREPRISE_DEFAUT = 'Chevalier IA';
export const NOM_ENTREPRISE_MAX = 30;
const nomEntrepriseDe = (p) => normaliserSms(String(p?.nomEntreprise ?? '')).replace(/\s+/g, ' ').trim().slice(0, NOM_ENTREPRISE_MAX).trim() || NOM_ENTREPRISE_DEFAUT; // accents, €, guillemets… remplacés comme dans tout SMS

export const PARAMETRES_DEFAUT = Object.freeze({
  relances: { delaiHeures: 24, nombre: 3 },
  rappel: { actif: true, heure: '19:00' },
  plage: { debut: '08:00', fin: '20:30' },
  numerosAlerte: [],            // [{ id, libelle, numero, actif }]
  numeroAffiche: '',            // id du numéro d'alerte donné aux participants dans le premier SMS
  numeroTest: '',               // seul numéro qui reçoit les SMS d'un rendez-vous marqué test (jamais dans le dépôt)
  nomDansLesSms: '',
  nomEntreprise: NOM_ENTREPRISE_DEFAUT, // nom de l'entreprise, écrit dans la ligne finale de chaque SMS envoyé à un participant
  roles: [...ROLES_DEPART],
  modeles: {},                  // surcharges des modèles par défaut, par type (les six modèles des participants et `alerte-<sousType>`)
  prixSms: PRIX_SMS_DEFAUT,     // euros par segment de SMS (estimation affichée dans l'aperçu des modèles)
  tarifsAu: TARIFS_AU_DEFAUT,   // date des tarifs de ClickSend, écrite à côté de l'estimation
});

// ───────────────────────────── Instants et fuseau Europe/Paris ─────────────────────────────

/** Instant (millisecondes) d'un ISO, d'un nombre ou d'une Date ; NaN si illisible. */
export function enMs(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
  return new Date(v).getTime();
}
export const versISO = (ms) => new Date(ms).toISOString();

const formateurParis = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

/** Date et heure murales de Paris pour un instant. */
export function partiesParis(ms) {
  const p = {};
  for (const x of formateurParis.formatToParts(new Date(ms))) p[x.type] = x.value;
  const annee = Number(p.year), mois = Number(p.month), jour = Number(p.day);
  return {
    annee, mois, jour, heure: Number(p.hour) % 24, minute: Number(p.minute), seconde: Number(p.second),
    jourSemaine: new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay(),
  };
}

function decalageParis(ms) {
  const base = Math.floor(ms / 1000) * 1000;
  const p = partiesParis(base);
  return Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde) - base;
}

/** Instant (ms) d'une heure murale de Paris. Une heure qui n'existe pas (saut du printemps) avance d'une heure. */
export function instantDepuisParis(annee, mois, jour, heure = 0, minute = 0) {
  const devine = Date.UTC(annee, mois - 1, jour, heure, minute);
  const d1 = decalageParis(devine);
  let candidat = devine - d1;
  const d2 = decalageParis(candidat);
  if (d2 !== d1) candidat = devine - d2;
  return candidat;
}

/** Jour de Paris décalé de `n` jours (calendrier, pas 24 h) : { annee, mois, jour }. */
export function jourParisPlusN(ms, n) {
  const p = partiesParis(ms);
  const d = new Date(Date.UTC(p.annee, p.mois - 1, p.jour + n));
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate() };
}

function minutesDe(hhmm, secours) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return secours;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? secours : h * 60 + mi;
}

/** Plage d'envoi lue dans les réglages : { debut, fin } en minutes depuis minuit (Paris). */
export function lirePlage(plage) {
  const p = plage || PARAMETRES_DEFAUT.plage;
  let debut = minutesDe(p.debut, 8 * 60), fin = minutesDe(p.fin, 20 * 60 + 30);
  if (fin <= debut) { debut = 8 * 60; fin = 20 * 60 + 30; }
  return { debut, fin };
}

/** Premier instant (≥ ms) où un SMS d'échéance peut partir : tout de suite dans la plage, sinon à l'ouverture suivante. */
export function prochaineOuverture(ms, plage) {
  const { debut, fin } = lirePlage(plage);
  const p = partiesParis(ms);
  const minutes = p.heure * 60 + p.minute;
  if (minutes >= debut && minutes <= fin) return ms;
  const j = minutes < debut ? { annee: p.annee, mois: p.mois, jour: p.jour } : jourParisPlusN(ms, 1);
  return instantDepuisParis(j.annee, j.mois, j.jour, Math.floor(debut / 60), debut % 60);
}

/** Minuit de Paris au début du jour du créneau : le rappel « demain » ne part plus à partir de là. */
export function debutDuJour(ms) {
  const j = jourParisPlusN(ms, 0);
  return instantDepuisParis(j.annee, j.mois, j.jour, 0, 0);
}

/** Rappel de la veille : la veille (jour de Paris) du créneau, à l'heure réglée. */
export function instantRappelVeille(creneauMs, heure = '19:00') {
  const j = jourParisPlusN(creneauMs, -1);
  const m = minutesDe(heure, 19 * 60);
  return instantDepuisParis(j.annee, j.mois, j.jour, Math.floor(m / 60), m % 60);
}

// ───────────────────────────── Dates lisibles ─────────────────────────────

const heureTexte = (p, espace) => (p.minute === 0 ? `${p.heure}${espace}h` : `${p.heure}h${String(p.minute).padStart(2, '0')}`);

/** « jeu. 19 nov. 10 h » (écran). */
export function formaterCreneau(v) {
  const ms = enMs(v);
  if (!Number.isFinite(ms)) return '';
  const p = partiesParis(ms);
  return `${JOURS[p.jourSemaine]} ${p.jour} ${MOIS[p.mois - 1]} ${heureTexte(p, ' ')}`;
}
/** « jeu. 19 nov. 10h » (SMS, un caractère de moins). */
export function formaterCreneauSms(v) {
  const ms = enMs(v);
  if (!Number.isFinite(ms)) return '';
  const p = partiesParis(ms);
  return `${JOURS[p.jourSemaine]} ${p.jour} ${MOIS[p.mois - 1]} ${heureTexte(p, '')}`;
}
/** « mardi 17 novembre » */
export function formaterJourLong(v) {
  const ms = enMs(v);
  if (!Number.isFinite(ms)) return '';
  const p = partiesParis(ms);
  return `${JOURS_LONGS[p.jourSemaine]} ${p.jour} ${MOIS_LONGS[p.mois - 1]}`;
}
/** « 10h » ou « 10h30 » */
export function formaterHeure(v) {
  const ms = enMs(v);
  if (!Number.isFinite(ms)) return '';
  return heureTexte(partiesParis(ms), '');
}
/** Consigne 5 : « Créneau 1, mardi 17 novembre à 10h » (écran : tableau, création, fiche). */
export function libelleCreneau(index, v) {
  const ms = enMs(v);
  return `Créneau ${index + 1}${Number.isFinite(ms) ? `, ${formaterJourLong(ms)} à ${formaterHeure(ms)}` : ''}`;
}
/** Lignes des créneaux dans un SMS : « 1 : mar. 17 nov. 10h » une par ligne. */
export function listeCreneauxSms(creneaux) {
  return (creneaux || []).map((c, i) => `${i + 1} : ${formaterCreneauSms(c)}`).join('\n');
}

/** « aujourd'hui », « demain » ou « le jeu. 19 nov. » selon le jour de Paris. */
export function quandRelatif(v, maintenant) {
  const ms = enMs(v), nowMs = enMs(maintenant);
  const p = partiesParis(ms), n = partiesParis(nowMs);
  const jourDe = (x) => Date.UTC(x.annee, x.mois - 1, x.jour);
  const ecart = Math.round((jourDe(p) - jourDe(n)) / (24 * HEURE_MS));
  if (ecart === 0) return "aujourd'hui";
  if (ecart === 1) return 'demain';
  return `le ${JOURS[p.jourSemaine]} ${p.jour} ${MOIS[p.mois - 1]}`;
}

// ───────────────────────────── SMS : alphabet GSM-7, accents, comptage ─────────────────────────────

const GSM_BASE = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(''),
);
const GSM_EXTENSION = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€', '\f']);

const REMPLACEMENTS = new Map([
  ['œ', 'oe'], ['Œ', 'OE'], ['«', '"'], ['»', '"'], ['“', '"'], ['”', '"'], ['„', '"'], ['‘', "'"], ['’', "'"], ['‚', "'"], ['`', "'"], ['´', "'"],
  ['…', '...'], ['–', '-'], ['—', '-'], ['−', '-'], ['‐', '-'], ['‑', '-'], [' ', ' '], [' ', ' '], [' ', ' '], ['\t', ' '],
  ['€', 'EUR'], ['•', '-'], ['·', '-'], ['×', 'x'], ['°', 'o'], [' ', '\n'], [' ', '\n'],
]);

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️︎⃣\u{1f1e6}-\u{1f1ff}]/u;
const MARQUES = /[̀-ͯ]/g;

/**
 * Règle de Jérôme (consigne 12) : pas de caractère « bizarre » dans nos SMS. Chaque caractère hors de l'alphabet GSM-7
 * est remplacé par son équivalent simple (ê → e, ç → c, « » → "), les émojis sont supprimés. Sans cela, un seul
 * caractère rare fait passer tout le message en Unicode : 70 caractères par SMS au lieu de 160.
 * Les caractères qu'on ne sait pas remplacer restent (le message passe alors en Unicode : `compterSms` le dit).
 */
export function normaliserSms(texte) {
  const entree = String(texte ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  let sortie = '';
  for (const c of entree) {
    if (GSM_BASE.has(c) || (GSM_EXTENSION.has(c) && c !== '€')) { sortie += c; continue; }
    if (REMPLACEMENTS.has(c)) { sortie += REMPLACEMENTS.get(c); continue; }
    if (EMOJI.test(c)) continue;
    const sansMarque = c.normalize('NFD').replace(MARQUES, '');
    if (sansMarque !== c && [...sansMarque].every((x) => GSM_BASE.has(x))) { sortie += sansMarque; continue; }
    sortie += c;
  }
  return sortie;
}

/** Caractères d'un texte qui le font passer en Unicode (liste sans doublon). */
export function caracteresHorsListe(texte) {
  const trouves = new Set();
  for (const c of String(texte ?? '')) if (!GSM_BASE.has(c) && !GSM_EXTENSION.has(c)) trouves.add(c);
  return [...trouves];
}

/**
 * Taille d'un SMS tel qu'il sera envoyé (le texte donné n'est pas modifié : normalise-le d'abord).
 * GSM-7 : 160 unités pour 1 SMS, 153 par morceau au-delà ; Unicode : 70, puis 67. Les caractères de l'extension
 * (`[ ] { } ~ ^ | \`, `€`) comptent double. `caracteres` = ce que l'artisan voit (nombre de caractères), `unites` = ce que l'opérateur compte.
 */
export function compterSms(texte) {
  const t = String(texte ?? '');
  const caracteres = [...t].length;
  const horsListe = caracteresHorsListe(t);
  if (horsListe.length) {
    const unites = t.length; // unités UTF-16, comme l'opérateur en Unicode
    return { encodage: 'unicode', caracteres, unites, segments: unites === 0 ? 0 : unites <= 70 ? 1 : Math.ceil(unites / 67), limite: 70, horsListe };
  }
  let unites = 0;
  for (const c of t) unites += GSM_EXTENSION.has(c) ? 2 : 1;
  return { encodage: 'gsm7', caracteres, unites, segments: unites === 0 ? 0 : unites <= 160 ? 1 : Math.ceil(unites / 153), limite: 160, horsListe: [] };
}

/** Normalise puis compte : c'est ce qu'on affiche dans l'appli et ce que la plateforme envoie. */
export function preparerSms(texte) {
  const normalise = normaliserSms(texte);
  return { texte: normalise, ...compterSms(normalise), modifie: normalise !== String(texte ?? '').replace(/\r\n?/g, '\n') };
}

/**
 * Ligne finale de tout SMS envoyé à un participant : le nom de l'entreprise et le moyen de se désabonner (demandés par ClickSend).
 * Les alertes à la professionnelle n'en portent pas. Si le texte porte déjà cette mention (comparée après normalisation), rien n'est ajouté.
 */
export function mentionStop(parametres) {
  return `${nomEntrepriseDe(parametres)} - Répondez STOP pour vous désabonner.`;
}
export function avecMentionStop(texte, parametres) {
  const t = String(texte ?? '').replace(/\s+$/, '');
  if (!t) return t;
  // On cherche la mention ELLE-MÊME (pas le mot « stop » : un client « Stop Fuites » ou une rue du Stop ne doit pas la faire sauter).
  if (normaliserSms(t).includes(normaliserSms(mentionStop(parametres)))) return t;
  return `${t}\n${mentionStop(parametres)}`;
}

/** « 124 caractères sur 160 · 1 SMS » */
export function libelleCompteur(texte) {
  const c = preparerSms(texte);
  if (c.encodage === 'unicode') return `${c.caracteres} caractères · ${c.segments} SMS (caractère spécial : 70 par SMS)`;
  return `${c.unites} caractères sur ${c.limite} · ${c.segments} SMS`.replace(' · 0 SMS', '');
}

// ───────────────────────────── Modèles de SMS ─────────────────────────────

export const VARIABLES_SMS = ['nom_pro', 'client', 'creneaux', 'adresse', 'numero_pro', 'date', 'heure'];
export const LIBELLES_MODELES = {
  confiance: 'Premier SMS (présentation)',
  creneaux: 'Propositions de créneaux',
  relance: 'Relance',
  confirmation: 'Confirmation',
  rappel: 'Rappel de la veille',
  pluie: 'Pluie ou annulation',
};
/** Six modèles génériques. Voir `EXEMPLE_SMS` pour les longueurs. Pas de caractère hors GSM-7 (règle des accents). */
export const MODELES_DEFAUT = Object.freeze({
  confiance: 'Bonjour, c\'est {nom_pro}. Je vais vous proposer des dates pour le rendez-vous {client}. Une question : {numero_pro}',
  creneaux: '{nom_pro} : rendez-vous {client}, quels créneaux ?\n{creneaux}\nRépondez par ex. 1 et 3, ou 0 si aucun.',
  relance: '{nom_pro} : toujours sans réponse pour le rendez-vous {client}.\n{creneaux}\nRépondez 1, 2, 3 ou 0 si aucun.',
  confirmation: 'RDV confirmé : {client}, {date} à {heure}.\n{adresse}\nMerci, {nom_pro}',
  rappel: 'Rappel : demain {date} à {heure}, RDV {client}.\n{adresse}\n{nom_pro}',
  pluie: '{nom_pro} : RDV du {date} à {heure} ({client}) annulé à cause de la pluie. Je vous propose une autre date très vite.',
});
export const EXEMPLE_SMS = Object.freeze({
  nom_pro: 'Mme Martin',
  client: 'M. Durand',
  creneaux: '1 : mar. 17 nov. 10h\n2 : mer. 18 nov. 14h\n3 : jeu. 19 nov. 9h',
  adresse: '12 rue des Lilas, Lyon',
  numero_pro: '06 00 00 00 00',
  date: 'jeu. 19 nov.',
  heure: '10h',
});

const typeDeModele = { confiance: 'confiance', creneaux: 'creneaux', relance: 'relance', confirmation: 'confirmation', rappel: 'rappel', pluie: 'pluie' };

/**
 * Remplace les variables `{nom}`. Une variable inconnue ou vide est laissée telle quelle (visible dans l'aperçu), sauf les
 * variables facultatives (`adresse`) : vides, elles disparaissent avec leur ligne.
 */
export const VARIABLES_FACULTATIVES = ['adresse', 'lien'];
export function remplirModele(modele, valeurs = {}) {
  let retire = false;
  const texte = String(modele ?? '').replace(/\{([a-z_]+)\}/g, (tout, nom) => {
    const v = valeurs[nom];
    if (VARIABLES_FACULTATIVES.includes(nom) && v === '') { retire = true; return ''; }
    return v === undefined || v === null || v === '' ? tout : String(v);
  });
  return retire ? texte.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/\s+$/, '') : texte;
}
/** Variables d'un modèle qui ne sont pas dans la liste de SA famille (pour refuser un modèle faux à l'enregistrement). `type` : le modèle (« rappel », « alerte-commun »…) ; sans lui, la liste des six modèles des participants. */
export function variablesInconnues(modele, type) {
  const permises = type ? variablesDuModele(type) : VARIABLES_SMS;
  const trouvees = [...String(modele ?? '').matchAll(/\{([a-zA-Z_]*)\}/g)].map((m) => m[1]);
  return [...new Set(trouvees.filter((v) => !permises.includes(v)))];
}

export function modeleDe(type, parametres) {
  const perso = parametres?.modeles?.[type];
  return typeof perso === 'string' && perso.trim() ? perso : (MODELES_DEFAUT[type] ?? MODELES_ALERTE_DEFAUT[type]);
}

/** Texte exact d'un SMS : modèle rempli, puis normalisé et compté. */
export function construireSms(type, valeurs, parametres) {
  return { typeMessage: typeDeModele[type] || type, ...preparerSms(avecMentionStop(remplirModele(modeleDe(type, parametres), valeurs), parametres)) };
}

/** Aperçu et taille des six modèles avec des données d'exemple (écran Réglages). */
export function apercuModeles(parametres) {
  return Object.keys(MODELES_DEFAUT).map((type) => ({ type, libelle: LIBELLES_MODELES[type], modele: modeleDe(type, parametres), ...construireSms(type, EXEMPLE_SMS, parametres) }));
}

// ───────────────────────────── Alertes à la professionnelle (modèles modifiables) ─────────────────────────────

/** Les huit alertes. Chaque modèle est réglable comme ceux des participants, sous la clé `alerte-<sousType>` dans `modeles`. Aucune mention STOP (elles vont à la professionnelle). */
export const SOUS_TYPES_ALERTE = ['commun', 'aucun', 'incomprise', 'fin-relances', 'ambigu', 'echec-envoi', 'tardive', 'desinscription'];
export const cleAlerte = (sousType) => `alerte-${sousType}`;
export const LIBELLES_ALERTES = Object.freeze({
  'alerte-commun': 'Alerte : un créneau convient à tous',
  'alerte-aucun': 'Alerte : aucun créneau commun',
  'alerte-incomprise': 'Alerte : réponse non comprise',
  'alerte-fin-relances': 'Alerte : relances terminées',
  'alerte-ambigu': 'Alerte : numéro dans deux rendez-vous',
  'alerte-echec-envoi': 'Alerte : un SMS n’est pas parti',
  'alerte-tardive': 'Alerte : réponse après la confirmation',
  'alerte-desinscription': 'Alerte : une personne a répondu STOP',
});
/** Une liste de variables PAR alerte : seules celles-ci sont acceptées dans son modèle. `{lien}` : l'adresse du rendez-vous dans l'appli, seulement pour « un créneau convient » et « aucun créneau ». */
export const VARIABLES_ALERTE = Object.freeze({
  'alerte-commun': ['client', 'creneau', 'lien'],
  'alerte-aucun': ['client', 'lien'],
  'alerte-incomprise': ['client', 'nom', 'reponse'],
  'alerte-fin-relances': ['client'],
  'alerte-ambigu': ['client'],
  'alerte-echec-envoi': ['client', 'nom'],
  'alerte-tardive': ['client', 'nom', 'reponse'],
  'alerte-desinscription': ['client', 'nom'],
});
/** Pas de caractère hors GSM-7 (« À » s'écrit « A ») : le texte par défaut est déjà celui qui partira. */
export const MODELES_ALERTE_DEFAUT = Object.freeze({
  'alerte-commun': 'RDV {client} : tous dispos le {creneau}. Confirme dans l\'appli.\n{lien}',
  'alerte-aucun': 'RDV {client} : aucun créneau commun. Propose d\'autres dates dans l\'appli.\n{lien}',
  'alerte-incomprise': 'RDV {client} : réponse non comprise de {nom} : "{reponse}". Appelle ou saisis sa réponse dans l\'appli.',
  'alerte-fin-relances': 'RDV {client} : relances terminées, il manque des réponses. Ouvre le rendez-vous dans l\'appli.',
  'alerte-ambigu': 'RDV {client} : ce numéro est dans deux rendez-vous ouverts, réponse non rattachée. Tranche dans l\'appli.',
  'alerte-echec-envoi': 'RDV {client} : un SMS n\'est pas parti vers {nom}. Appelle cette personne.',
  'alerte-tardive': 'RDV {client} : {nom} a répondu après la confirmation : "{reponse}". Appelle cette personne.',
  'alerte-desinscription': 'RDV {client} : {nom} a répondu STOP. Plus aucun SMS ne lui sera envoyé : appelle cette personne.',
});
/** Tous les modèles réglables : les six des participants, puis les huit alertes. */
export const TOUS_MODELES_DEFAUT = Object.freeze({ ...MODELES_DEFAUT, ...MODELES_ALERTE_DEFAUT });
export const estModeleAlerte = (type) => Object.hasOwn(MODELES_ALERTE_DEFAUT, type);
export const variablesDuModele = (type) => (estModeleAlerte(type) ? VARIABLES_ALERTE[type] : VARIABLES_SMS);
export const libelleModele = (type) => LIBELLES_MODELES[type] ?? LIBELLES_ALERTES[type] ?? type;
/** Adresses de l'appli (les mêmes que celles du serveur : `lienEcranRdv`) et identifiant d'exemple de 20 caractères (la longueur d'un identifiant Firestore). */
export const BASE_LIEN_JEROME = 'https://chevalier-ia-os.web.app';
export const BASE_LIEN_PLATEFORME = 'https://chevalier-ia-app.web.app';
const ID_EXEMPLE = 'aB3dE5gH7jK9mN1pQ3sT';
/** Adresse d'exemple d'un rendez-vous dans l'espace courant : `client` vide = chez Jérôme ; l'identifiant du client sinon. Sert à compter les SMS de l'aperçu avec la vraie longueur. */
export const lienExempleRdv = (client = '') => (client ? `${BASE_LIEN_PLATEFORME}/#/espace/${client}/rdv/liste/${ID_EXEMPLE}` : `${BASE_LIEN_JEROME}/#/rdv/liste/${ID_EXEMPLE}`);
export const EXEMPLE_ALERTE = Object.freeze({ client: 'M. Durand', creneau: '2026-11-19T09:00:00Z', nom: 'M. Petit', reponse: 'plutot jeudi', lien: lienExempleRdv('') });

const abreger = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 40);
const NOM_PAR_DEFAUT = { incomprise: 'un participant' };
/** Valeurs des variables d'une alerte. Toutes sont données (jamais d'accolade qui reste) ; `lien` vide = la variable et sa ligne disparaissent. */
function valeursAlerte(sousType, ctx = {}) {
  return {
    client: ctx.client || '(sans nom)',
    creneau: (ctx.creneau && formaterCreneauSms(ctx.creneau)) || 'a confirmer',
    nom: ctx.nom || NOM_PAR_DEFAUT[sousType] || 'une personne',
    reponse: ctx.reponse ? abreger(ctx.reponse) || '(sans texte)' : '(sans texte)',
    lien: VARIABLES_ALERTE[cleAlerte(sousType)]?.includes('lien') ? (ctx.lien || '') : '', // jamais de lien pour une alerte qui ne le prévoit pas, même si un modèle stocké l'écrit
  };
}

/** Phrases d'alerte envoyées à la professionnelle (modèle réglé ou modèle de départ, sans mention STOP). `ctx.lien` : l'adresse du rendez-vous (construite par le serveur), utilisée seulement si le modèle contient `{lien}`. */
export function texteAlerte(sousType, ctx = {}, parametres = {}) {
  const cle = cleAlerte(sousType);
  if (!estModeleAlerte(cle)) return preparerSms(`RDV ${ctx.client || '(sans nom)'} : à regarder dans l'appli.`);
  return preparerSms(remplirModele(modeleDe(cle, parametres), valeursAlerte(sousType, ctx)));
}

/** Aperçu des huit alertes avec des données d'exemple : texte avec le lien, et — pour celles qui le portent — le même texte sans lien. `client` : l'identifiant de l'espace (vide chez Jérôme) pour compter avec l'adresse réelle. */
export function apercuAlertes(parametres, { client = '' } = {}) {
  const exemple = { ...EXEMPLE_ALERTE, lien: lienExempleRdv(client) };
  return SOUS_TYPES_ALERTE.map((sousType) => {
    const type = cleAlerte(sousType);
    const modele = modeleDe(type, parametres);
    const avecLien = texteAlerte(sousType, exemple, parametres);
    const aLien = /\{lien\}/.test(modele) && VARIABLES_ALERTE[type].includes('lien');
    return { type, sousType, libelle: LIBELLES_ALERTES[type], modele, ...avecLien, aLien, sansLien: aLien ? texteAlerte(sousType, { ...exemple, lien: '' }, parametres) : null };
  });
}

/** Contrôle d'un modèle avant enregistrement : { ok, message }. Vide, variable inconnue pour CE modèle, ou `{lien}` écrit plus d'une fois sont refusés. */
export function validerModele(modele, type) {
  const texte = String(modele ?? '');
  if (!texte.trim()) return { ok: false, message: 'Le modèle ne peut pas être vide.' };
  const inconnues = variablesInconnues(texte, type);
  if (inconnues.length) return { ok: false, message: `Variable inconnue ici : {${inconnues[0]}}. Variables permises : ${variablesDuModele(type).map((v) => `{${v}}`).join(', ')}` };
  if ((texte.match(/\{lien\}/g) || []).length > 1) return { ok: false, message: 'Écris {lien} une seule fois : une adresse suffit, et chaque caractère compte dans un SMS.' };
  return { ok: true, message: '' };
}

// ───────────────────────────── Prix d'un SMS (estimation) ─────────────────────────────

export const PRIX_SMS_MIN = 0.001;
export const PRIX_SMS_MAX = 5;
export const prixSmsDe = (p) => { const n = p?.prixSms; return typeof n === 'number' && Number.isFinite(n) && n >= PRIX_SMS_MIN && n <= PRIX_SMS_MAX ? n : PRIX_SMS_DEFAUT; };
/** Lit un prix tapé (« 0,0685 », « 0.1 ») : seulement des chiffres et une virgule ou un point décimal, entre 0,001 et 5 ; « 0x1 », « 1e-7 », « -1 » ou « abc » rendent null. */
export function lirePrixSms(saisie) {
  const t = String(saisie ?? '').trim();
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return n >= PRIX_SMS_MIN && n <= PRIX_SMS_MAX ? n : null;
}
export const tarifsAuDe = (p) => (typeof p?.tarifsAu === 'string' && p.tarifsAu.trim() ? p.tarifsAu.trim().slice(0, 40) : TARIFS_AU_DEFAUT);
/** Coût estimé d'un texte : prix d'un segment × nombre de SMS facturés (`compterSms`). Rien n'est stocké : le coût se calcule à l'écran. */
export function coutSms(texte, prix = PRIX_SMS_DEFAUT) {
  const segments = compterSms(normaliserSms(texte)).segments;
  return Math.round(segments * (Number(prix) || 0) * 1e6) / 1e6;
}
/** « 0,0685 € » (jusqu'à 4 décimales, au moins 2). */
export function formaterEuros(n) {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n) || 0).replace(/[\u00a0\u202f]/g, ' ')} €`;
}
/** « ≈ 0,0685 € · estimation basée sur les tarifs ClickSend au 1er novembre 2026 » (jamais présentée comme une facture). */
export function libelleCout(texte, parametres) {
  return `≈ ${formaterEuros(coutSms(texte, prixSmsDe(parametres)))} · estimation basée sur les tarifs ClickSend au ${tarifsAuDe(parametres)}`;
}

// ───────────────────────────── Téléphones ─────────────────────────────

/**
 * Accepte 06…, 07…, +33…, 0033…, avec espaces, points ou tirets. Refuse les fixes (un SMS n'y arrive pas).
 * Rend { ok: true, telephone: '+33600000000', affichage: '06 00 00 00 00' } ou { ok: false, message }.
 */
export function normaliserTelephone(saisie) {
  const brut = String(saisie ?? '').trim();
  if (!brut) return { ok: false, message: 'Écris un numéro de téléphone mobile.' };
  if (/[^\d\s.\-+()]/.test(brut)) return { ok: false, message: 'Le numéro ne doit contenir que des chiffres, des espaces, des points ou des tirets.' };
  let chiffres = brut.replace(/\D/g, '');
  if (brut.startsWith('+')) {
    if (!chiffres.startsWith('33')) return { ok: false, message: 'Seuls les numéros de mobile français (06, 07 ou +33 6, +33 7) sont acceptés.' };
    chiffres = chiffres.slice(2);
    if (chiffres.startsWith('0')) chiffres = chiffres.slice(1); // +33 (0)6…
  } else if (/^33[67]\d{8}$/.test(chiffres)) {
    chiffres = chiffres.slice(2); // « 33612345678 » : format international sans « + » (certains fournisseurs de SMS l'envoient ainsi)
  } else if (chiffres.startsWith('0033')) {
    chiffres = chiffres.slice(4);
    if (chiffres.startsWith('0')) chiffres = chiffres.slice(1);
  } else if (chiffres.startsWith('0')) {
    chiffres = chiffres.slice(1);
  } else {
    return { ok: false, message: 'Le numéro doit commencer par 06, 07 ou +33.' };
  }
  if (chiffres.length !== 9) return { ok: false, message: 'Ce numéro n’a pas la bonne longueur : un mobile français a 10 chiffres (06 00 00 00 00).' };
  if (chiffres[0] !== '6' && chiffres[0] !== '7') {
    return { ok: false, message: 'Ce numéro est un fixe ou un numéro spécial : un SMS ne peut pas y arriver. Donne un numéro de mobile (06 ou 07).' };
  }
  const national = `0${chiffres}`;
  return { ok: true, telephone: `+33${chiffres}`, affichage: national.replace(/(\d{2})(?=\d)/g, '$1 ') };
}
/** « +33600000000 » → « 06 00 00 00 00 » (rend le texte tel quel si ce n'est pas un numéro connu). */
export function afficherTelephone(tel) {
  const r = normaliserTelephone(tel);
  return r.ok ? r.affichage : String(tel ?? '');
}
/** Lien `tel:` à côté du petit « i » (consigne 7). Vide si le numéro n'est pas valide. */
export function lienTel(tel) {
  const r = normaliserTelephone(tel);
  return r.ok ? `tel:${r.telephone}` : '';
}

// ───────────────────────────── Réponses des participants ─────────────────────────────

const SANS_ACCENT = (s) => s.normalize('NFD').replace(MARQUES, '');

/**
 * Lit une réponse par SMS : « 1 », « 1 et 3 », « 1,3 », « 1 3 », « 1 + 2 » ; « aucun », « aucune », « 0 », « non » = aucun créneau.
 * Rend { comprise: true, creneaux: [1, 3] } (liste vide = aucun créneau possible) ou { comprise: false, creneaux: [] }.
 * Un numéro hors des créneaux proposés, un mélange « 0 et 1 » ou tout autre texte = non compris.
 */
export function interpreterReponse(texte, nbCreneaux = MAX_CRENEAUX) {
  const incompris = { comprise: false, creneaux: [] };
  let t = SANS_ACCENT(String(texte ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\s.!,;:]+|[\s.!,;:]+$/g, '');
  if (!t) return incompris;
  if (['aucun', 'aucune', '0', 'non'].includes(t)) return { comprise: true, creneaux: [] };
  t = t.replace(/\s*[,;+&/]\s*/g, ' ').replace(/\s+et\s+/g, ' ').trim();
  if (!/^\d+( \d+)*$/.test(t)) return incompris;
  const numeros = [...new Set(t.split(' ').map(Number))];
  if (!numeros.length || numeros.some((n) => n < 1 || n > nbCreneaux)) return incompris;
  return { comprise: true, creneaux: numeros.sort((a, b) => a - b) };
}

/** Mots qui demandent à ne plus recevoir de SMS (règle des opérateurs : « STOP » est toujours respecté, jamais pris pour une réponse non comprise). */
export function estDesinscription(texte) {
  const t = SANS_ACCENT(String(texte ?? '').toLowerCase()).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(stop|stop sms|arret|arreter|desabonner|desabonne|desabonnement|desinscrire|desinscription|unsubscribe)$/.test(t);
}

/**
 * Applique une réponse reçue à un participant : rend le changement à écrire.
 *  - réponse à une ancienne série (`tourReponse` < tour du rendez-vous) : historique seulement, l'état ne change pas ;
 *  - réponse comprise : `etatReponse: 'comprise'` ;
 *  - réponse non comprise : `etatReponse: 'incomprise'` (les relances de cette personne sont suspendues, consigne 13).
 */
export function appliquerReponse({ participant, rdv, texte, recuLe, idReponse, tourReponse }) {
  const tour = Number.isFinite(tourReponse) ? tourReponse : (rdv?.tour ?? 1);
  if (tour < (rdv?.tour ?? 1)) return { historiqueSeulement: true, comprise: null, patch: null };
  // Un désinscrit dont la professionnelle a SAISI la réponse (après l'avoir appelé) : aucun SMS reçu de lui ne l'efface (ni « 1 », ni un nouveau STOP, qui ne redemande pas d'alerte) ; trace seulement. `desinscrit` reste vrai.
  if (participant?.desinscrit === true && participant?.etatReponse === 'saisie') return { historiqueSeulement: true, comprise: null, patch: null, alerteIncomprise: false };
  if (estDesinscription(texte)) {
    return { historiqueSeulement: false, comprise: false, desinscription: true, alerteIncomprise: true,
      patch: { reponse: String(texte ?? ''), etatReponse: 'incomprise', creneauxOk: [], reponseLe: recuLe ?? null, idReponse: idReponse ?? null, desinscrit: true } };
  }
  const lu = interpreterReponse(texte, (rdv?.creneaux || []).length || MAX_CRENEAUX);
  // Un « Merci » après une bonne réponse (ou après une saisie de la professionnelle) n'efface rien : trace seulement.
  if (!lu.comprise && (participant?.etatReponse === 'comprise' || participant?.etatReponse === 'saisie')) {
    return { historiqueSeulement: true, comprise: false, patch: null, alerteIncomprise: false };
  }
  const patch = {
    reponse: String(texte ?? ''),
    etatReponse: lu.comprise ? 'comprise' : 'incomprise',
    creneauxOk: lu.creneaux,
    ambigu: false,
    reponseLe: recuLe ?? null,
    idReponse: idReponse ?? null,
  };
  return { historiqueSeulement: false, comprise: lu.comprise, patch, alerteIncomprise: !lu.comprise && (participant?.etatReponse !== 'incomprise' || participant?.idReponse !== (idReponse ?? null)) };
}

/** Réponse saisie à la main par la professionnelle : `creneauxOk` = numéros (1 à 3), vide = aucun. */
export function saisirReponse(participant, creneauxOk, nbCreneaux = MAX_CRENEAUX) {
  const liste = [...new Set((creneauxOk || []).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= nbCreneaux).sort((a, b) => a - b);
  return { etatReponse: 'saisie', creneauxOk: liste, reponse: participant?.reponse ?? '', ambigu: false };
}

const aRepondu = (p) => p.etatReponse === 'comprise' || p.etatReponse === 'saisie';

/**
 * Cette personne a répondu STOP (repère `desinscrit` posé par `appliquerReponse`) : affichage et bilan. Le repère n'est JAMAIS remis à faux (même une réponse « 1 » reçue ensuite, ou « Proposer d'autres créneaux », le laisse).
 * Un STOP reçu pour un autre rendez-vous (numéro dans la liste tenue par le serveur, sans repère ici) est pris en compte par `estDesinscrit` quand la liste est donnée.
 */
export const estDesinscrit = (participant, desinscrits = []) => participant?.desinscrit === true || (!!participant?.telephone && (desinscrits || []).includes(participant.telephone));

/** Consigne 6 : 'oui' (coche verte), 'non' (croix rouge), 'inconnu' (point d'interrogation), 'incompris' (triangle rouge), 'desinscrit' (STOP : prime sur tout le reste, jamais « réponse non comprise »). */
export function symboleCellule(participant, indexCreneau) {
  if (participant?.desinscrit === true) return 'desinscrit';
  if (participant?.etatReponse === 'incomprise') return 'incompris';
  if (!participant || !aRepondu(participant)) return 'inconnu';
  return (participant.creneauxOk || []).includes(indexCreneau + 1) ? 'oui' : 'non';
}

// ───────────────────────────── Créneaux communs et états ─────────────────────────────

/**
 * Bilan des réponses :
 *  - `parCreneau[i]` = nombre de personnes pour qui le créneau i+1 convient ;
 *  - `communs` = numéros (1 à 3) des créneaux qui conviennent à TOUT le monde (seulement quand tout le monde a répondu) ;
 *  - RÈGLE « désinscrit (STOP) » : une personne désinscrite (`desinscrit === true`) ne bloque jamais les autres. `complet` = tous les NON-désinscrits ont répondu (et il y en a au moins un) ; un désinscrit dont la réponse a été SAISIE par la professionnelle compte comme les autres ;
 *    `parCreneau`, `reponses` et `communs` ne comptent qu'eux ; `total` compte tout le monde ; un désinscrit n'est jamais « OK » (même avec une réponse « 1 » reçue après son STOP) ;
 *  - `meilleur` = le créneau qui convient au plus de monde { creneau, nombre } (ex-aequo : le plus tôt) ;
 *  - `complet` = tout le monde a répondu (compris ou saisi), `incomprises` = réponses non comprises à traiter.
 */
export function bilanReponses(participants, nbCreneaux = MAX_CRENEAUX) {
  const liste = participants || [];
  const total = liste.length;
  // Un désinscrit dont la professionnelle a SAISI la réponse (`saisie`, après l'avoir appelé) compte comme les autres ; sa réponse par SMS (« 1 » après STOP), une attente ou une réponse non comprise ne comptent jamais.
  const actifs = liste.filter((p) => p.desinscrit !== true || p.etatReponse === 'saisie');
  const repondants = actifs.filter(aRepondu);
  const parCreneau = Array.from({ length: nbCreneaux }, (_, i) => repondants.filter((p) => (p.creneauxOk || []).includes(i + 1)).length);
  const complet = actifs.length > 0 && repondants.length === actifs.length;
  const communs = complet ? parCreneau.map((n, i) => (n === actifs.length ? i + 1 : 0)).filter(Boolean) : [];
  let meilleur = null;
  parCreneau.forEach((n, i) => { if (n > 0 && (!meilleur || n > meilleur.nombre)) meilleur = { creneau: i + 1, nombre: n }; });
  return {
    total, reponses: repondants.length, complet, parCreneau, communs, meilleur,
    incomprises: actifs.filter((p) => p.etatReponse === 'incomprise').length,
    desinscrits: liste.filter((p) => p.desinscrit === true).length,
    enAttente: actifs.filter((p) => !p.etatReponse || p.etatReponse === 'attente').length,
  };
}

/** Colonne du Kanban. `confirme` ne change plus tout seul ; un rendez-vous annulé n'est plus calculé (voir `estOuvert`). */
export function etatCalcule(rdv, participants, params = {}) {
  if (rdv?.etat === 'confirme' || rdv?.creneauChoisi) return 'confirme';
  const b = bilanReponses(participants, (rdv?.creneaux || []).length || MAX_CRENEAUX);
  if (b.complet) return b.communs.length ? 'a_valider' : 'a_reprendre';
  if (b.total > 0 && relancesTerminees(rdv, participants, params)) return 'a_reprendre';
  return 'en_attente';
}

/** Rendez-vous encore à traiter : ni archivé, ni annulé, ni confirmé. */
export const estOuvert = (rdv) => !!rdv && !rdv.archive && !rdv.annule && rdv.etat !== 'confirme' && !rdv.creneauChoisi;

/** Phrase d'état des cartes et du tableau : « 2 réponses sur 4 », « Relance 1 sur 3 demain », « Créneau commun : jeu. 19 nov. 10 h », « 2 créneaux communs ». */
export function ligneEtat({ rdv, participants, parametres, messages, maintenant, desinscrits = [] }) {
  const b = bilanReponses(participants, (rdv?.creneaux || []).length || MAX_CRENEAUX);
  if (rdv?.etat === 'confirme' || rdv?.creneauChoisi) return `Confirmé : ${formaterCreneau(rdv.creneauChoisi)}`;
  const stop = b.desinscrits ? `${b.desinscrits} désinscrit${b.desinscrits > 1 ? 's' : ''} (STOP)` : '';
  const avecStop = (t) => (stop ? `${t} · ${stop}` : t);
  if (b.complet && b.communs.length) {
    // Tous les créneaux communs sont passés : l'écran dit comme l'alerte (« aucun créneau à venir ne convient »), jamais une date passée présentée comme créneau commun.
    const avenir = creneauxCommunsAVenir(b, { creneaux: rdv.creneaux, maintenant });
    if (!avenir.length) return avecStop('Aucun créneau commun à venir');
    if (avenir.length > 1) return avecStop(`${avenir.length} créneaux communs`);
    return avecStop(`Créneau commun : ${formaterCreneau(rdv.creneaux[avenir[0] - 1])}`);
  }
  if (b.complet) return avecStop('Aucun créneau commun');
  if (b.incomprises) return b.incomprises === 1 ? 'Une réponse non comprise' : `${b.incomprises} réponses non comprises`;
  const texte = stop ? `${stop} · ${b.reponses} ${b.reponses > 1 ? 'réponses' : 'réponse'} sur ${b.total}` : `${b.reponses} ${b.reponses > 1 ? 'réponses' : 'réponse'} sur ${b.total}`;
  const prochaine = prochaineRelance({ rdv, participants, parametres, messages, desinscrits });
  if (prochaine && Number.isFinite(enMs(maintenant))) {
    const quand = enMs(prochaine.dueLe) <= enMs(maintenant) ? 'bientôt' : quandRelatif(prochaine.dueLe, maintenant);
    return `${texte} · Relance ${prochaine.numero} sur ${prochaine.sur} ${quand}`;
  }
  return texte;
}

// ───────────────────────────── Échéances : relances, rappel, alertes ─────────────────────────────

const params = (p) => ({
  relances: { ...PARAMETRES_DEFAUT.relances, ...(p?.relances || {}) },
  rappel: { ...PARAMETRES_DEFAUT.rappel, ...(p?.rappel || {}) },
  plage: { ...PARAMETRES_DEFAUT.plage, ...(p?.plage || {}) },
  numerosAlerte: Array.isArray(p?.numerosAlerte) ? p.numerosAlerte : [],
  numeroAffiche: p?.numeroAffiche || '',
  numeroTest: p?.numeroTest || '',
  nomDansLesSms: p?.nomDansLesSms || '',
  nomEntreprise: nomEntrepriseDe(p),
  modeles: p?.modeles || {},
  prixSms: prixSmsDe(p),
  tarifsAu: tarifsAuDe(p),
});

/** Identifiant déterministe d'un envoi : le même envoi a toujours le même identifiant (jamais deux SMS pour une échéance). */
export const idEcheance = (rdvId, tour, nature, cible = '') => `${rdvId}:t${tour || 1}:${nature}${cible ? `:${cible}` : ''}`;

/** Un SMS ne part vers la vraie personne que si le rendez-vous n'est pas un test ; sinon, vers le numéro de test, ou nulle part. */
export function numeroCible(numero, rdv, parametresBruts) {
  if (!rdv?.test) return numero;
  return params(parametresBruts).numeroTest || null;
}

const envoyes = (messages) => new Map((messages || []).filter((m) => m.sens !== 'entrant' && m.echeance).map((m) => [m.echeance, m]));
const nombreRelances = (p) => Math.max(0, Math.min(10, Math.floor(Number(p.relances.nombre) || 0)));
const delaiRelance = (p) => Math.max(1, Number(p.relances.delaiHeures) || 24) * HEURE_MS;

function numeroPro(p) {
  const actifs = p.numerosAlerte.filter((n) => n && n.numero);
  return (actifs.find((n) => n.id === p.numeroAffiche) || actifs.find((n) => n.actif) || actifs[0] || {}).numero || '';
}

function valeursSms(rdv, p, extra = {}) {
  const pro = numeroPro(p);
  const choisi = rdv?.creneauChoisi || extra.creneau;
  return {
    nom_pro: p.nomDansLesSms,
    client: rdv?.client || rdv?.objet || '',
    creneaux: listeCreneauxSms(rdv?.creneaux),
    adresse: String(rdv?.adresse || '').replace(/\s*\n\s*/g, ', '),
    numero_pro: pro ? afficherTelephone(pro) : '',
    date: choisi ? formaterCreneauSms(choisi).replace(/ \d{1,2}h(\d{2})?$/, '') : '',
    heure: choisi ? formaterHeure(choisi) : '',
  };
}

const enAttente = (x) => !x.etatReponse || x.etatReponse === 'attente';
const dernierCreneau = (rdv) => Math.max(...(rdv?.creneaux || []).map(enMs).filter(Number.isFinite), -Infinity);

/**
 * Calendrier des relances, partagé par la carte et par `smsDus`. Seules les personnes joignables (avec un téléphone) et en attente comptent.
 *  - le départ est le premier SMS de créneaux réellement envoyé ;
 *  - la relance k est due au plus tôt `délai` après l'envoi RÉEL de la relance k-1 (jamais de rafale après une panne) ;
 *  - une relance enregistrée sans horodatage d'envoi arrête le calendrier (on ne devine pas) ;
 *  - `complet` : toutes les relances prévues sont faites (l'alerte de fin peut être due).
 */
function calendrierRelances({ rdv, participants, p, deja, desinscrits = [] }) {
  const tour = rdv.tour || 1;
  const n = nombreRelances(p);
  // Une personne désinscrite (repère OU numéro dans la liste du serveur) n'est jamais relancée et ne bloque pas le calendrier des autres.
  const joignables = (participants || []).filter((x) => x.telephone && !estDesinscrit(x, desinscrits));
  const attentes = joignables.filter(enAttente);
  const envoiDe = (nature, x) => { const m = deja.get(idEcheance(rdv.id, tour, nature, x.id)); return m ? enMs(m.envoyeLe) : undefined; };
  const departs = joignables.map((x) => envoiDe('creneaux', x)).filter(Number.isFinite);
  const depart = departs.length ? Math.min(...departs) : NaN;
  const sortie = { n, depart, attentes, etapes: [], derniere: Number.isFinite(depart) ? depart : null, complet: false };
  if (!Number.isFinite(depart) || !attentes.length) return sortie;
  for (let k = 1; k <= n; k++) {
    let instant = depart + k * delaiRelance(p);
    if (k > 1) {
      const avant = attentes.map((x) => envoiDe(`relance${k - 1}`, x));
      if (avant.some((v) => !Number.isFinite(v))) return sortie;
      instant = Math.max(instant, Math.max(...avant) + delaiRelance(p));
    }
    const faits = attentes.map((x) => envoiDe(`relance${k}`, x));
    sortie.etapes.push({ k, instant, cibles: attentes.filter((x, i) => faits[i] === undefined) });
    if (faits.some((v) => !Number.isFinite(v))) return sortie;
    sortie.derniere = Math.max(...faits);
  }
  sortie.complet = true;
  return sortie;
}

/** Prochaine relance prévue (pour la carte) : { numero, sur, dueLe } ou null. */
export function prochaineRelance({ rdv, participants, parametres, messages, desinscrits = [] }) {
  const p = params(parametres);
  if (!nombreRelances(p) || !estOuvert(rdv) || !rdv?.id) return null;
  const cal = calendrierRelances({ rdv, participants, p, deja: envoyes(messages), desinscrits });
  const etape = cal.etapes.find((e) => e.cibles.length);
  return etape ? { numero: etape.k, sur: cal.n, dueLe: versISO(prochaineOuverture(etape.instant, p.plage)) } : null;
}

/** Le serveur a écrit `rdv.relancesTermineesLe` (alerte de fin envoyée) et il manque encore des réponses : colonne « À reprendre ». */
export function relancesTerminees(rdv, participants, parametres) {
  return !!rdv?.relancesTermineesLe && (participants || []).some((x) => x.desinscrit !== true && (!x.etatReponse || x.etatReponse === 'attente'));
}

/**
 * Liste des SMS dus MAINTENANT pour un rendez-vous (aucun envoi ici : la plateforme les tire, les envoie, puis les confirme).
 *  - chaque SMS a un `idEcheance` fixe ; un identifiant déjà présent dans `messages` n'est plus dû ;
 *  - `horsPlage: false` pour la confirmation seule ; tout le reste attend l'ouverture suivante de la plage d'envoi ;
 *  - les relances ne s'enchaînent pas : la relance k n'est due qu'après la relance k-1 (pas de rattrapage en rafale) ;
 *  - une personne dont la réponse n'est pas comprise n'est plus relancée (consigne 13) ;
 *  - un rendez-vous de test ne vise que `numeroTest` (aucun SMS s'il n'est pas réglé).
 * Rend un tableau trié par date : { idEcheance, typeMessage, sousType?, participantId?, numero, texte, caracteres, segments, dueLe, tour }.
 */
export function smsDus({ rdv, participants = [], parametres, messages = [], maintenant, desinscrits = [], lien = '' }) {
  const nowMs = enMs(maintenant);
  if (!rdv?.id || !Number.isFinite(nowMs) || rdv.archive || rdv.annule) return [];
  const p = params(parametres);
  const tour = rdv.tour || 1;
  const deja = envoyes(messages);
  const dus = [];
  const proposer = (def) => {
    if (deja.has(def.idEcheance)) return;
    const numero = numeroCible(def.numero, rdv, parametres);
    if (!numero) return;
    if (def.typeMessage !== 'alerte' && desinscrits.includes(def.numero)) return; // « STOP » reçu : plus aucun SMS vers ce numéro (les alertes vont à la professionnelle)
    const dueLe = def.horsPlage === false ? def.instant : prochaineOuverture(def.instant, p.plage);
    if (dueLe > nowMs) return;
    if (Number.isFinite(def.avant) && (dueLe >= def.avant || nowMs >= def.avant)) return;
    const sms = def.texte !== undefined ? preparerSms(def.texte) : construireSms(def.modele, def.valeurs, p);
    if (!sms.texte.trim()) return; // un modèle qui ne donne aucun texte (ex. `{lien}` seul, sans adresse) n'envoie rien
    dus.push({
      idEcheance: def.idEcheance, typeMessage: def.typeMessage, sousType: def.sousType || null, participantId: def.participantId || null,
      manque: [...new Set([...sms.texte.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))],
      numero, texte: sms.texte, caracteres: sms.caracteres, unites: sms.unites, segments: sms.segments, encodage: sms.encodage,
      dueLe: versISO(dueLe), tour,
    });
  };
  const valeurs = valeursSms(rdv, p);
  const actifsAlerte = p.numerosAlerte.map((n, i) => (n ? { ...n, id: n.id || `n${i + 1}` } : n)).filter((n) => n && n.actif && n.numero);
  const alerter = (sousType, nature, ctx, sauf = '') => {
    for (const n of actifsAlerte) {
      if (sauf && deja.has(idEcheance(rdv.id, tour, `alerte-${sauf}`, n.id))) continue;
      proposer({
        idEcheance: idEcheance(rdv.id, tour, `alerte-${nature}`, n.id), typeMessage: 'alerte', sousType, numero: n.numero,
        instant: ctx.instant, avant: ctx.avant, texte: texteAlerte(sousType, { client: rdv.client, ...ctx }, p).texte,
      });
    }
  };

  const envoiDemande = enMs(rdv.envoiDemandeLe);
  const confirme = rdv.etat === 'confirme' || !!rdv.creneauChoisi;

  // 1. Premiers SMS (présentation, puis créneaux une minute après pour garder l'ordre).
  if (Number.isFinite(envoiDemande) && !confirme) {
    for (const x of participants) {
      if (tour === 1) proposer({ idEcheance: idEcheance(rdv.id, tour, 'confiance', x.id), typeMessage: 'confiance', modele: 'confiance', valeurs, numero: x.telephone, participantId: x.id, instant: envoiDemande });
      proposer({ idEcheance: idEcheance(rdv.id, tour, 'creneaux', x.id), typeMessage: 'creneaux', modele: 'creneaux', valeurs, numero: x.telephone, participantId: x.id, instant: envoiDemande + MINUTE_MS });
    }
  }

  // 2. Relances : seulement les personnes joignables en attente (une réponse non comprise suspend leurs relances),
  //    et plus du tout quand tous les créneaux sont passés.
  const ouverts = estOuvert(rdv);
  const limite = dernierCreneau(rdv);
  if (ouverts && nowMs < limite) {
    const cal = calendrierRelances({ rdv, participants, p, deja, desinscrits });
    for (const etape of cal.etapes) {
      for (const x of etape.cibles) {
        proposer({ idEcheance: idEcheance(rdv.id, tour, `relance${etape.k}`, x.id), typeMessage: 'relance', modele: 'relance', valeurs, numero: x.telephone, participantId: x.id, instant: etape.instant, avant: limite });
      }
    }
    // 3. Alerte « relances terminées » : 24 h après la dernière relance, s'il manque encore des réponses.
    if (cal.complet && cal.attentes.length && Number.isFinite(cal.derniere)) {
      alerter('fin-relances', 'fin', { instant: cal.derniere + DELAI_ALERTE_HEURES * HEURE_MS, avant: limite });
    }
  }

  // 4. Alertes de réponses (tout le monde a répondu ; réponse non comprise).
  if (ouverts && participants.length) {
    const b = bilanReponses(participants, (rdv.creneaux || []).length || MAX_CRENEAUX);
    const dateDerniere = Math.max(0, ...participants.map((x) => enMs(x.reponseLe)).filter(Number.isFinite));
    const instantReponses = dateDerniere || nowMs;
    // « Un créneau convient à tous » cite le premier créneau commun ENCORE À VENIR. Si tous les créneaux communs sont passés, la professionnelle reçoit « aucun créneau commun » (aucun créneau à venir ne convient),
    // sauf si l'alerte « commun » lui a déjà été envoyée (sinon elle recevrait « aucun » juste après, quand son créneau passe).
    // `lien` (adresse du rendez-vous, construite par le serveur) n'est utilisé que par ces deux alertes ; une seule alerte par numéro et par série (l'identifiant d'échéance `alerte-commun` / `alerte-aucun`).
    const prochain = b.communs.map((i) => rdv.creneaux[i - 1]).find((c) => enMs(c) > nowMs);
    if (b.complet && prochain) alerter('commun', 'commun', { instant: instantReponses, creneau: prochain, lien });
    // Borne d'âge : si le dernier créneau commun est passé depuis plus de 7 jours, rien n'est envoyé (un vieux rendez-vous ne doit jamais déclencher un SMS au premier tir après un déploiement).
    const dernierCommun = Math.max(...b.communs.map((i) => enMs(rdv.creneaux[i - 1])).filter(Number.isFinite), -Infinity);
    // Même borne pour « aucun créneau commun » : sans créneau commun, on regarde le dernier créneau proposé (tous passés depuis plus de 7 jours = plus d'alerte).
    const reference = b.communs.length > 0 ? dernierCommun : dernierCreneau(rdv);
    const tropVieux = Number.isFinite(reference) && nowMs - reference > AGE_MAX_ALERTE_AUCUN_JOURS * 24 * HEURE_MS;
    if (b.complet && !prochain && !tropVieux) alerter('aucun', 'aucun', { instant: instantReponses, lien }, b.communs.length ? 'commun' : '');
    for (const x of participants.filter((y) => y.etatReponse === 'incomprise')) {
      alerter(x.desinscrit ? 'desinscription' : x.ambigu ? 'ambigu' : 'incomprise', `incomprise-${x.id}-${x.idReponse || 'r'}`, { instant: enMs(x.reponseLe) || nowMs, nom: x.nom, reponse: x.reponse });
    }
  }

  // 4 bis. Un SMS abandonné (3 échecs d'envoi) : la professionnelle est prévenue, une seule fois par SMS.
  for (const m of messages) {
    if (m.etatEnvoi !== 'abandonne' || m.sens === 'entrant' || m.typeMessage === 'alerte' || !m.id || (m.tour ?? 1) !== tour) continue; // seulement la série courante : l'alerte d'une ancienne série ne repart pas
    const x = participants.find((y) => y.id === m.participantId);
    alerter('echec-envoi', `echec-${m.id}`, { instant: enMs(m.envoyeLe) || nowMs, nom: x?.nom });
  }

  // 4 ter. Une réponse arrivée APRÈS la confirmation (« empêchement », STOP…) : la professionnelle est alertée une seule fois par réponse.
  for (const x of participants) {
    if (!x.reponseTardive || !x.idReponseTardive) continue;
    alerter(x.desinscrit ? 'desinscription' : 'tardive', `tardive-${x.id}-${x.idReponseTardive}`, { instant: enMs(x.reponseTardiveLe) || nowMs, nom: x.nom, reponse: x.reponseTardive });
  }

  // 5. Confirmation (jamais retardée par la plage) et rappel de la veille.
  if (confirme) {
    const confirmeLe = Number.isFinite(enMs(rdv.confirmeLe)) ? enMs(rdv.confirmeLe) : nowMs;
    {
      for (const x of participants) {
        proposer({ idEcheance: idEcheance(rdv.id, tour, 'confirmation', x.id), typeMessage: 'confirmation', modele: 'confirmation', valeurs: valeursSms(rdv, p), numero: x.telephone, participantId: x.id, instant: confirmeLe, horsPlage: false, avant: enMs(rdv.creneauChoisi) });
      }
      const choisi = enMs(rdv.creneauChoisi);
      if (p.rappel.actif && Number.isFinite(choisi)) {
        const rappelA = instantRappelVeille(choisi, p.rappel.heure);
        if (rappelA >= confirmeLe) {
          for (const x of participants) {
            proposer({ idEcheance: idEcheance(rdv.id, tour, 'rappel', x.id), typeMessage: 'rappel', modele: 'rappel', valeurs: valeursSms(rdv, p), numero: x.telephone, participantId: x.id, instant: rappelA, avant: debutDuJour(choisi) });
          }
        }
      }
    }
  }
  return dus.sort((a, b) => a.dueLe.localeCompare(b.dueLe) || a.idEcheance.localeCompare(b.idEcheance));
}

// ───────────────────────────── Même téléphone dans deux rendez-vous ─────────────────────────────

/**
 * Rattache une réponse reçue à UN participant. `rendezVous` = [{ rdv, participants }] (tous les rendez-vous).
 *  - { type: 'unique', rendezVousId, participantId } : un seul rendez-vous ouvert contient ce numéro ;
 *  - { type: 'ambigu', cibles: [{ rendezVousId, participantId }] } : le numéro est dans plusieurs rendez-vous ouverts, la réponse ne
 *    peut pas être rattachée avec certitude → incomprise pour tous, alerte, la professionnelle tranche ;
 *  - { type: 'inconnu' } : aucun rendez-vous ouvert avec ce numéro.
 */
export function rattacherReponse(numero, rendezVous) {
  const cherche = normaliserTelephone(numero);
  const cle = cherche.ok ? cherche.telephone : String(numero ?? '');
  const candidats = [];
  for (const { rdv, participants } of rendezVous || []) {
    if (!estOuvert(rdv)) continue;
    for (const x of participants || []) {
      const t = normaliserTelephone(x.telephone);
      if ((t.ok ? t.telephone : x.telephone) === cle) candidats.push({ rendezVousId: rdv.id, participantId: x.id });
    }
  }
  const sortie = (c) => ({ rendezVousId: c.rendezVousId, participantId: c.participantId });
  if (!candidats.length) return { type: 'inconnu' };
  if (candidats.length === 1) return { type: 'unique', ...sortie(candidats[0]) };
  return { type: 'ambigu', cibles: candidats.map(sortie) };
}

// ───────────────────────────── Rôles (consigne 3) ─────────────────────────────

const cleRole = (r) => SANS_ACCENT(String(r ?? '').trim().toLowerCase());

/** Nombre de participants (dans toute l'appli, archivés compris) qui ont ce rôle. */
export function usageRole(role, participants) {
  const c = cleRole(role);
  return (participants || []).filter((x) => cleRole(x.role) === c).length;
}
/** Un rôle ne se supprime que si aucun participant ne l'utilise nulle part. */
export const peutSupprimerRole = (role, participants) => usageRole(role, participants) === 0;

/** Ajoute un rôle : { ok, roles } ou { ok: false, message } (vide ou déjà là, sans tenir compte des accents ni des majuscules). */
export function ajouterRole(roles, nom) {
  const propre = String(nom ?? '').replace(/\s+/g, ' ').trim();
  if (!propre) return { ok: false, message: 'Écris le nom du rôle.' };
  if (propre.length > 40) return { ok: false, message: 'Le nom du rôle est trop long (40 caractères au plus).' };
  if ((roles || []).some((r) => cleRole(r) === cleRole(propre))) return { ok: false, message: 'Ce rôle existe déjà.' };
  return { ok: true, roles: [...(roles || []), propre] };
}
/** Retire un rôle s'il n'est pas utilisé : { ok, roles } ou { ok: false, message }. */
export function retirerRole(roles, nom, participants) {
  const n = usageRole(nom, participants);
  if (n > 0) return { ok: false, message: `Ce rôle est utilisé par ${n} ${n > 1 ? 'participants' : 'participant'} : il ne peut pas être supprimé.` };
  return { ok: true, roles: (roles || []).filter((r) => cleRole(r) !== cleRole(nom)) };
}

// ───────────────────────────── Validation de la création ─────────────────────────────

/** Rend la liste des problèmes (vide = on peut envoyer). Les téléphones sont rendus normalisés dans `participants`. */
export function validerNouveauRdv({ participants, creneaux, maintenant }) {
  const erreurs = [];
  const nowMs = enMs(maintenant);
  const lignes = participants || [];
  if (!lignes.length) erreurs.push('Ajoute au moins un participant.');
  const sortie = lignes.map((x, i) => {
    const t = normaliserTelephone(x.telephone);
    if (!t.ok) erreurs.push(`Participant ${i + 1} : ${t.message}`);
    return { ...x, telephone: t.ok ? t.telephone : x.telephone };
  });
  if (lignes.length > MAX_PARTICIPANTS) erreurs.push(`Un rendez-vous réunit ${MAX_PARTICIPANTS} personnes au plus.`);
  const vus = new Set();
  const personnes = new Set();
  sortie.forEach((x, i) => {
    if (x.telephone && vus.has(x.telephone)) erreurs.push(`Participant ${i + 1} : ce numéro est déjà celui d’un autre participant de ce rendez-vous.`);
    vus.add(x.telephone);
    if (x.personneId && personnes.has(x.personneId)) erreurs.push(`Participant ${i + 1} : cette personne est déjà dans la liste.`);
    if (x.personneId) personnes.add(x.personneId);
  });
  const utiles = (creneaux || []).filter((c) => c !== '' && c != null);
  if (!utiles.length) erreurs.push('Ajoute au moins un créneau.');
  if (utiles.length > MAX_CRENEAUX) erreurs.push(`Tu peux proposer ${MAX_CRENEAUX} créneaux au plus.`);
  const ms = utiles.map(enMs);
  if (ms.some((m) => !Number.isFinite(m))) erreurs.push('Un créneau n’a pas une date et une heure valides.');
  else if (Number.isFinite(nowMs) && ms.some((m) => m <= nowMs)) erreurs.push('Les créneaux doivent être dans le futur.');
  if (new Set(ms).size !== ms.length) erreurs.push('Deux créneaux sont identiques.');
  return { ok: erreurs.length === 0, erreurs, participants: sortie };
}

// ───────────────────────────── Fiche : client et commune ─────────────────────────────

/** Commune d'une adresse multiligne : la dernière ligne non vide, sans code postal devant (« 69000 Lyon » -> « Lyon »). */
export function communeDe(adresse) {
  const lignes = String(adresse ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lignes.length) return '';
  const derniere = lignes[lignes.length - 1].replace(/^\d{4,5}\s*/, '').replace(/\s+cedex.*$/i, '').trim();
  return derniere || lignes[lignes.length - 1];
}

/** Nom affiché du client : la personne au rôle « Client », sinon la première. */
export function clientDe(participants) {
  const liste = participants || [];
  const c = liste.find((x) => cleRole(x.role) === 'client') || liste[0];
  return c?.nom ? String(c.nom).trim() : '';
}

/** Filtre de la liste : recherche (client, commune, objet, adresse, participants) + colonnes (états) + tests. */
export function criteresVides() { return { recherche: '', etats: [], tests: 'inclure' }; }
export function filtrerRendezVous(rdvs, criteres, participantsParRdv = {}, { archives = false } = {}) {
  const c = { ...criteresVides(), ...criteres };
  const q = SANS_ACCENT(String(c.recherche || '').toLowerCase()).trim();
  return (rdvs || []).filter((r) => {
    if ((!!r.archive || !!r.annule) !== archives) return false; // un rendez-vous annulé est toujours dans les Archives
    if (c.etats.length && !c.etats.includes(r.etat || 'en_attente')) return false;
    if (c.tests === 'exclure' && r.test === true) return false;
    if (c.tests === 'seulement' && r.test !== true) return false;
    if (!q) return true;
    const texte = SANS_ACCENT([r.client, r.commune, r.objet, r.adresse, ...(participantsParRdv[r.id] || []).map((x) => x.nom)].join(' ').toLowerCase());
    return texte.includes(q);
  });
}
export const nombreFiltres = (criteres) => { const c = { ...criteresVides(), ...criteres }; return c.etats.length + (c.tests !== 'inclure' ? 1 : 0); };

/** Premier créneau (instant) d'un rendez-vous, pour le tri « Date du rendez-vous » : le créneau choisi, sinon le plus proche. */
export function dateDuRendezVous(r) {
  const choisi = enMs(r?.creneauChoisi);
  if (Number.isFinite(choisi)) return choisi;
  const liste = (r?.creneaux || []).map(enMs).filter(Number.isFinite);
  return liste.length ? Math.min(...liste) : null;
}

/** Nom du fichier de sauvegarde : chevalier-ia-rendez-vous-AAAA-MM-JJ.json (jour de Paris). */
export function nomFichierExportRdv(maintenant = new Date()) {
  const p = partiesParis(enMs(maintenant));
  const deux = (n) => String(n).padStart(2, '0');
  return `chevalier-ia-rendez-vous-${p.annee}-${deux(p.mois)}-${deux(p.jour)}.json`;
}

// ───────────────────────────── Fiche : bandeaux, confirmation, nouvelle série ─────────────────────────────

/** Un créneau (numéro 1 à 3) est « à venir » si sa date est après `maintenant` ; sans `creneaux` ni `maintenant` valide, rien n'est écarté. */
const creneauAVenir = ({ creneaux = null, maintenant = null } = {}) => (n) => !creneaux || !Number.isFinite(enMs(maintenant)) || enMs(creneaux[n - 1]) > enMs(maintenant);
/** Instant d'un créneau (pour trier par date) ; sans `creneaux`, le numéro lui-même. */
const instantCreneau = ({ creneaux = null } = {}) => (n) => (creneaux ? enMs(creneaux[n - 1]) : n);

/** Créneaux communs à tous (réponses complètes) encore À VENIR, dans l'ordre des numéros (1, 2, 3). `creneaux` et `maintenant` (facultatifs) écartent les créneaux déjà passés. */
export function creneauxCommunsAVenir(bilan, options = {}) {
  return [...(bilan?.communs || [])].filter(creneauAVenir(options)).sort((x, y) => x - y);
}

/**
 * Créneaux parmi lesquels la professionnelle choisit (tous ENCORE À VENIR), du plus tôt au plus tard (chacun garde son numéro) : les créneaux communs s'il y en a (un ou plusieurs),
 * sinon le seul créneau qui convient au plus de monde (à égalité : le plus tôt en date) ; liste vide s'il n'y en a aucun. Jamais de choix d'office : seule la professionnelle confirme.
 */
export function creneauxAConfirmer(bilan, options = {}) {
  const instant = instantCreneau(options);
  const communs = creneauxCommunsAVenir(bilan, options).sort((x, y) => instant(x) - instant(y) || x - y);
  if (communs.length) return communs;
  const avenir = creneauAVenir(options);
  const candidats = (bilan?.parCreneau || []).map((nombre, i) => ({ numero: i + 1, nombre })).filter((c) => c.nombre > 0 && avenir(c.numero));
  candidats.sort((x, y) => y.nombre - x.nombre || instant(x.numero) - instant(y.numero));
  return candidats.length ? [candidats[0].numero] : [];
}

/**
 * Le créneau `numero` choisi dans la fenêtre « plusieurs créneaux conviennent à tous » est-il toujours valable au moment de confirmer ? Rend :
 *  - 'ok' : sa date est celle qui était affichée (`dateAffichee`), tout le monde a répondu (réponses comprises) et il est toujours commun à tous et à venir ;
 *  - 'rendezvous' : le rendez-vous n'est plus à confirmer (confirmé ailleurs, annulé, archivé ou supprimé) ;
 *  - 'creneau' : la fiche a changé (date modifiée, participant ajouté, réponse corrigée ou non comprise…) : on refuse, sans rabattre sur « le créneau qui convient au plus de monde ».
 */
export function verdictChoix(rdv, participants, numero, dateAffichee, maintenant) {
  if (!rdv || !estOuvert(rdv)) return 'rendezvous';
  const creneaux = rdv.creneaux || [];
  if (!(enMs(creneaux[numero - 1]) === enMs(dateAffichee))) return 'creneau';
  const bilan = bilanReponses(participants, creneaux.length || MAX_CRENEAUX);
  return bilan.complet && creneauxCommunsAVenir(bilan, { creneaux, maintenant }).includes(numero) ? 'ok' : 'creneau';
}

/**
 * Même relecture pour la fenêtre d'UN seul créneau proposé (le commun, ou celui qui convient au plus de monde) : 'rendezvous' si le rendez-vous n'est plus à confirmer,
 * 'creneau' si la date du créneau n'est plus celle qui était affichée ou si ce créneau est passé, 'ok' sinon.
 */
export function verdictCreneauUnique(rdv, participants, numero, dateAffichee, maintenant) {
  if (!rdv || !estOuvert(rdv)) return 'rendezvous';
  const creneaux = rdv.creneaux || [];
  const date = creneaux[numero - 1];
  if (!(enMs(date) === enMs(dateAffichee)) || !(enMs(date) > enMs(maintenant))) return 'creneau';
  // Les réponses ont pu changer : ce créneau doit rester LE créneau proposé (le commun, ou celui qui convient au plus de monde) ; sinon la fenêtre disait autre chose que la fiche.
  const proposes = creneauxAConfirmer(bilanReponses(participants, creneaux.length || MAX_CRENEAUX), { creneaux, maintenant });
  return proposes.length === 1 && proposes[0] === numero ? 'ok' : 'creneau';
}

/**
 * Créneau à proposer à la confirmation quand il n'y en a QU'UN à proposer (le créneau commun, sinon celui qui convient au plus de monde) ; null s'il n'y en a aucun
 * ET quand plusieurs créneaux conviennent à tous : la professionnelle choisit alors elle-même (`creneauxAConfirmer`). C'est une PROPOSITION : seule la professionnelle confirme.
 */
export function creneauAConfirmer(bilan, options = {}) {
  const choix = creneauxAConfirmer(bilan, options);
  return choix.length === 1 ? choix[0] : null;
}

/** « 1 », « 1 et 2 », « 1, 2 et 3 » : les numéros de créneaux écrits en français. */
const listeNumeros = (numeros) => (numeros.length > 1 ? `${numeros.slice(0, -1).join(', ')} et ${numeros.at(-1)}` : String(numeros[0]));

/**
 * Bandeau violet de la fiche : { type: 'commun' | 'partiel' | 'aucun', creneau, creneaux, texte }, ou null tant qu'il n'y a rien à dire. Mêmes options que `creneauAConfirmer` (créneaux passés écartés).
 * Plusieurs créneaux communs : `creneau` vaut null, `creneaux` les liste et le texte les cite tous.
 */
export function bandeauCreneau(bilan, options = {}) {
  if (!bilan || !bilan.total) return null;
  const communs = bilan.complet ? creneauxCommunsAVenir(bilan, options) : [];
  if (communs.length > 1) return { type: 'commun', creneau: null, creneaux: communs, texte: `Les créneaux ${listeNumeros(communs)} conviennent à tout le monde. Seul toi peux en confirmer un.` };
  if (communs.length === 1) return { type: 'commun', creneau: communs[0], creneaux: communs, texte: `Le créneau ${communs[0]} convient à tout le monde. Seul toi peux le confirmer.` };
  if (bilan.complet && !bilan.communs.length) return { type: 'aucun', creneau: null, creneaux: [], texte: 'Aucun créneau ne convient à tout le monde. Tu peux proposer d’autres créneaux.' };
  const c = creneauAConfirmer(bilan, options);
  if (c) {
    const n = bilan.parCreneau[c - 1];
    return { type: 'partiel', creneau: c, creneaux: [c], texte: `Pour l’instant, le créneau ${c} convient à ${n} ${n > 1 ? 'personnes' : 'personne'} sur ${bilan.total}. Seul toi peux le confirmer.` };
  }
  if (bilan.complet) return { type: 'aucun', creneau: null, creneaux: [], texte: 'Les créneaux qui conviennent sont passés. Tu peux proposer d’autres créneaux.' };
  return null;
}

/** Texte du bandeau rouge (consigne 13) quand au moins une réponse n'est pas comprise. */
export const TEXTE_REPONSE_INCOMPRISE = 'Cette personne a répondu quelque chose que le service ne comprend pas. Tu as reçu un SMS : appelle-la ou saisis sa réponse à sa place.';
export const TEXTE_REPONSES_INCOMPRISES = 'Certaines personnes ont répondu quelque chose que le service ne comprend pas. Tu as reçu un SMS : appelle-les ou saisis leur réponse à leur place.';

/** Texte du bandeau rouge quand au moins une personne a répondu STOP : elle ne reçoit plus rien, mais les autres ne sont pas bloqués. */
export const TEXTE_DESINSCRIT = 'Cette personne a répondu STOP : elle ne reçoit plus aucun SMS. Les autres réponses comptent quand même. Appelle-la si besoin.';
export const TEXTE_DESINSCRITS = 'Certaines personnes ont répondu STOP : elles ne reçoivent plus aucun SMS. Les autres réponses comptent quand même. Appelle-les si besoin.';

// ───────────────────────────── Avant de confirmer : ce qui va partir par SMS ─────────────────────────────

/** « 06 00 00 00 02 » → « 06 •• •• •• 02 » : seuls le début et la fin du numéro sont montrés. Un numéro qui n'a pas la forme attendue (cinq groupes de deux chiffres) est masqué en entier. */
export function masquerTelephone(tel) {
  const groupes = afficherTelephone(tel).split(' ').filter(Boolean);
  if (groupes.length === 5 && groupes.every((g) => /^\d{2}$/.test(g))) return `${groupes[0]} •• •• •• ${groupes[4]}`;
  return '•• •• •• •• ••';
}

/**
 * Ce qui va se passer si la professionnelle confirme le créneau `numero` (aucun envoi ici) : qui reçoit quoi, le texte réel de la confirmation, le nombre de SMS FACTURÉS (segments) et le coût estimé.
 * C'est le MIROIR EXACT de `smsDus` (même numéro cible via `numeroCible`, mêmes exclusions) :
 *  - confirmation tout de suite à chaque participant dont le numéro n'est pas dans `desinscrits` (la liste tenue par le serveur : « STOP » reçu ; le repère `desinscrit` d'une fiche n'en fait pas partie) ;
 *  - rappel la veille à l'heure réglée, passé par la plage d'envoi (`prochaineOuverture`), seulement si le rappel est actif, si cette veille n'est pas déjà passée et si l'instant obtenu reste avant le début du jour du rendez-vous ;
 *  - un rendez-vous de test n'écrit qu'au numéro de test (rien s'il n'est pas réglé).
 * Rend { creneau, test, numeroTest (masqué), personnes[{ id, nom, telephone (masqué), statut: 'recoit' | 'desinscrit' | 'sans-telephone' | 'test-sans-numero' }], destinataires, rappelLe,
 * confirmation: { texte, caracteres, segments, manque }, messages, segmentsConfirmation, segmentsRappel, segments (total facturé), cout, tarifsAu, aucun, raisonAucun }.
 */
export function previsionConfirmation({ rdv, participants = [], parametres, numero, maintenant, desinscrits = [] }) {
  const p = params(parametres);
  const creneau = (rdv?.creneaux || [])[numero - 1];
  const choisiMs = enMs(creneau);
  const nowMs = enMs(maintenant);
  const simule = { ...rdv, etat: 'confirme', creneauChoisi: creneau };
  const valeurs = valeursSms(simule, p);
  const confirmation = construireSms('confirmation', valeurs, p);
  const rappelA = p.rappel.actif && Number.isFinite(choisiMs) ? instantRappelVeille(choisiMs, p.rappel.heure) : NaN;
  const rappelReel = Number.isFinite(rappelA) ? prochaineOuverture(rappelA, p.plage) : NaN; // le rappel attend l'ouverture de la plage d'envoi, comme dans smsDus
  const rappelPossible = Number.isFinite(rappelA) && rappelA >= nowMs && rappelReel < debutDuJour(choisiMs);
  const rappel = rappelPossible ? construireSms('rappel', valeurs, p) : null;
  const test = rdv?.test === true;
  const numeroTest = test ? p.numeroTest : '';
  const personnes = (participants || []).map((x) => {
    const tel = String(x.telephone ?? '').trim();
    const cible = numeroCible(x.telephone, rdv, parametres); // le numéro où le SMS partirait vraiment (le numéro de test pour un rendez-vous de test)
    const statut = !cible ? (test ? 'test-sans-numero' : 'sans-telephone') : desinscrits.includes(x.telephone) ? 'desinscrit' : 'recoit';
    return { id: x.id, nom: x.nom || 'Sans nom', telephone: tel ? masquerTelephone(tel) : '', statut };
  });
  const destinataires = personnes.filter((x) => x.statut === 'recoit').length;
  const nbRappels = rappel ? destinataires : 0;
  const segmentsConfirmation = confirmation.segments * destinataires;
  const segmentsRappel = rappel ? rappel.segments * nbRappels : 0;
  const cout = Math.round((coutSms(confirmation.texte, p.prixSms) * destinataires + (rappel ? coutSms(rappel.texte, p.prixSms) * nbRappels : 0)) * 1e6) / 1e6;
  return {
    creneau, test, numeroTest: numeroTest ? masquerTelephone(numeroTest) : '', personnes, destinataires,
    rappelLe: rappelPossible && destinataires > 0 ? versISO(rappelReel) : null, // aucun destinataire : aucun rappel à annoncer
    confirmation: { texte: confirmation.texte, caracteres: confirmation.caracteres, segments: confirmation.segments, manque: [...new Set([...confirmation.texte.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))] },
    messages: destinataires + nbRappels, segmentsConfirmation, segmentsRappel, segments: segmentsConfirmation + segmentsRappel,
    cout, tarifsAu: p.tarifsAu,
    aucun: destinataires === 0,
    raisonAucun: destinataires > 0 ? '' : test && !numeroTest ? 'test-sans-numero' : 'personne-joignable',
  };
}

/**
 * Phrase d'aide toujours visible sous le bouton « Confirmer… » : ce qui partira si on confirme un des créneaux `numeros`.
 * Le rappel n'est cité que s'il part pour TOUS ces créneaux ; l'heure est celle où il partira vraiment (après la plage d'envoi).
 */
export function phraseAvantConfirmer({ rdv, participants, parametres, numeros, maintenant, desinscrits = [] }) {
  const previsions = (numeros || []).map((numero) => previsionConfirmation({ rdv, participants, parametres, numero, maintenant, desinscrits }));
  if (!previsions.length) return '';
  const base = previsions[0];
  if (base.aucun) { // « aucun SMS » passe avant le mode test : tous désinscrits avec un numéro de test réglé ne reçoivent rien non plus
    return base.raisonAucun === 'test-sans-numero'
      ? 'Rendez-vous de test : aucun SMS ne partira (le numéro des SMS de test n’est pas réglé).'
      : 'Aucun SMS ne partira : aucun participant n’a de numéro joignable.';
  }
  if (base.test) return `Rendez-vous de test : le SMS de confirmation part seulement vers le numéro de test (${base.numeroTest}), jamais vers les participants.`;
  const n = base.destinataires;
  const rappel = previsions.every((x) => x.rappelLe) ? `, puis un rappel la veille à ${formaterHeure(base.rappelLe)}` : '';
  return `En confirmant : ${n} ${n > 1 ? 'personnes reçoivent' : 'personne reçoit'} un SMS de confirmation tout de suite${rappel}. Les numéros désinscrits (STOP) ne reçoivent rien.`;
}

/** Changement à écrire sur le rendez-vous quand la professionnelle confirme le créneau `numero` (1 à 3). Refus si le rendez-vous n'est pas ouvert ou le créneau n'existe pas. */
export function planConfirmer(rdv, numero, maintenant) {
  if (!estOuvert(rdv)) return { erreur: 'Ce rendez-vous n’est plus à confirmer.' };
  const creneau = (rdv.creneaux || [])[numero - 1];
  if (!creneau) return { erreur: 'Ce créneau n’existe pas.' };
  if (!(enMs(creneau) > enMs(maintenant))) return { erreur: 'Ce créneau est déjà passé : propose d’autres créneaux.' };
  return { patch: { etat: 'confirme', creneauChoisi: versISO(enMs(creneau)), confirmeLe: versISO(enMs(maintenant)) } };
}

/**
 * Nouvelle série de créneaux (aussi après une confirmation, par exemple à cause de la pluie : le créneau choisi est alors retiré) : l'historique des SMS est gardé (les messages ne sont jamais modifiés), le numéro de série `tour` augmente,
 * les réponses des participants sont remises à zéro (la réponse tardive à l'ancienne série ne compte que dans l'historique) et les relances repartent.
 * Rend { patchRdv, patchParticipant } ou { erreur }.
 */
export function planNouvelleSerie(rdv, creneaux, maintenant) {
  if (!rdv || rdv.annule || rdv.archive) return { erreur: 'Ce rendez-vous n’est plus ouvert aux propositions.' };
  const verdict = validerCreneaux(creneaux, maintenant);
  if (verdict.erreurs.length) return { erreur: verdict.erreurs[0] };
  return {
    patchRdv: { creneaux: verdict.creneaux, tour: (rdv.tour || 1) + 1, etat: 'en_attente', creneauChoisi: null, confirmeLe: null, relancesFaites: 0, relancesTermineesLe: null, envoiDemandeLe: null },
    patchParticipant: { etatReponse: 'attente', creneauxOk: [], reponse: '', reponseLe: null, idReponse: null },
  };
}

/** Créneaux saisis : 1 à 3, futurs, sans doublon. Rend { creneaux: [ISO], erreurs }. */
export function validerCreneaux(creneaux, maintenant) {
  const erreurs = [];
  const nowMs = enMs(maintenant);
  const utiles = (creneaux || []).filter((c) => c !== '' && c != null);
  if (!utiles.length) erreurs.push('Ajoute au moins un créneau.');
  if (utiles.length > MAX_CRENEAUX) erreurs.push(`Tu peux proposer ${MAX_CRENEAUX} créneaux au plus.`);
  const ms = utiles.map(enMs);
  if (ms.some((m) => !Number.isFinite(m))) erreurs.push('Un créneau n’a pas une date et une heure valides.');
  else if (Number.isFinite(nowMs) && ms.some((m) => m <= nowMs)) erreurs.push('Les créneaux doivent être dans le futur.');
  if (new Set(ms).size !== ms.length) erreurs.push('Deux créneaux sont identiques.');
  return { creneaux: ms.filter(Number.isFinite).map(versISO), erreurs };
}

/**
 * Texte prérempli (modifiable) du SMS de pluie ou d'annulation. Jamais d'accolade visible : un nom ou une date qui manque est simplement omis.
 * Pluie : le modèle réglé si toutes ses données existent, sinon une phrase simple.
 */
export function texteSmsManuel(type, rdv, parametres) {
  const p = params(parametres);
  const choisi = rdv?.creneauChoisi;
  const date = choisi ? formaterCreneauSms(choisi).replace(/ \d{1,2}h(\d{2})?$/, '') : '';
  const heure = choisi ? formaterHeure(choisi) : '';
  const client = rdv?.client || rdv?.objet || '';
  const signature = p.nomDansLesSms ? `${p.nomDansLesSms} : ` : '';
  const quand = date ? ` du ${date} à ${heure}` : '';
  const sujet = client ? ` ${client}` : '';
  if (type === 'annulation') return preparerSms(avecMentionStop(`${signature}le RDV${sujet}${quand} est annulé. Je vous recontacte pour une autre date.`, parametres)).texte;
  if (p.nomDansLesSms && client && date) {
    const valeurs = { nom_pro: p.nomDansLesSms, client, creneaux: listeCreneauxSms(rdv?.creneaux), adresse: String(rdv?.adresse || '').replace(/\s*\n\s*/g, ', '), numero_pro: numeroPro(p) ? afficherTelephone(numeroPro(p)) : '', date, heure };
    const sms = construireSms('pluie', valeurs, parametres);
    if (!/\{[a-z_]+\}/.test(sms.texte)) return sms.texte;
  }
  return preparerSms(avecMentionStop(`${signature}le RDV${client ? ` (${client})` : ''}${quand} est annulé à cause de la pluie. Je vous propose une autre date très vite.`, parametres)).texte;
}

/** Historique d'un rendez-vous : les messages par date, avec le nom de l'expéditeur ou du destinataire (retrouvé par le numéro). */
export function historiqueMessages(messages, participants) {
  const parNumero = new Map((participants || []).map((p) => [p.telephone, p]));
  return [...(messages || [])].map((m) => ({ ...m, qui: parNumero.get(m.numero)?.nom || '' }))
    .sort((a, b) => (enMs(a.envoyeLe ?? a.recuLe ?? a.creeLe) || 0) - (enMs(b.envoyeLe ?? b.recuLe ?? b.creeLe) || 0));
}
