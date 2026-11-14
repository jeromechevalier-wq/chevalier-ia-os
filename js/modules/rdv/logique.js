// Module « Rendez-vous » : règles pures (sans Firebase, sans navigateur), testables par Node.
// Le même fichier servira à l'écran et, plus tard, au serveur (PR 4) : il ne dépend de rien.
//
// Formes de données (tables `rdv_…`, voir docs/tables.md) :
//  - rendez-vous : { id, client, objet, adresse, commune, creneaux: [ISO…] (1 à 3), etat, creneauChoisi, archive,
//      tour, envoiDemandeLe, confirmeLe, annule, test }
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
/** Délai fixe entre la dernière relance et l'alerte « relances terminées ». */
export const DELAI_ALERTE_HEURES = 24;
/** Prix indicatif d'un SMS de 160 caractères (affiché dans l'aide, jamais dans un calcul). */
export const SEUIL_SMS = 160;

const HEURE_MS = 3600 * 1000;
const MINUTE_MS = 60 * 1000;
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const PARAMETRES_DEFAUT = Object.freeze({
  relances: { delaiHeures: 24, nombre: 3 },
  rappel: { actif: true, heure: '19:00' },
  plage: { debut: '08:00', fin: '20:30' },
  numerosAlerte: [],            // [{ id, libelle, numero, actif }]
  numeroAffiche: '',            // id du numéro d'alerte donné aux participants dans le premier SMS
  numeroTest: '',               // seul numéro qui reçoit les SMS d'un rendez-vous marqué test (jamais dans le dépôt)
  nomDansLesSms: '',
  roles: [...ROLES_DEPART],
  modeles: {},                  // surcharges des modèles par défaut, par type
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
  confiance: 'Bonjour, c\'est {nom_pro}. Je vais vous proposer des dates pour le rendez-vous de chantier {client}. Une question : {numero_pro}',
  creneaux: '{nom_pro} : chantier {client}, quels créneaux ?\n{creneaux}\nRépondez par ex. 1 et 3, ou 0 si aucun.',
  relance: '{nom_pro} : toujours sans réponse pour le chantier {client}.\n{creneaux}\nRépondez 1, 2, 3 ou 0 si aucun.',
  confirmation: 'RDV confirmé : chantier {client}, {date} à {heure}.\n{adresse}\nMerci, {nom_pro}',
  rappel: 'Rappel : demain {date} à {heure}, RDV chantier {client}.\n{adresse}\n{nom_pro}',
  pluie: '{nom_pro} : RDV du {date} à {heure} (chantier {client}) annulé à cause de la pluie. Je vous propose une autre date très vite.',
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

/** Remplace les variables `{nom}` ; une variable inconnue ou vide est laissée telle quelle (visible dans l'aperçu). */
export function remplirModele(modele, valeurs = {}) {
  return String(modele ?? '').replace(/\{([a-z_]+)\}/g, (tout, nom) => {
    const v = valeurs[nom];
    return v === undefined || v === null || v === '' ? tout : String(v);
  });
}
/** Variables d'un modèle qui ne sont pas dans la liste connue (pour refuser un modèle faux à l'enregistrement). */
export function variablesInconnues(modele) {
  const trouvees = [...String(modele ?? '').matchAll(/\{([a-zA-Z_]*)\}/g)].map((m) => m[1]);
  return [...new Set(trouvees.filter((v) => !VARIABLES_SMS.includes(v)))];
}

export function modeleDe(type, parametres) {
  const perso = parametres?.modeles?.[type];
  return typeof perso === 'string' && perso.trim() ? perso : MODELES_DEFAUT[type];
}

/** Texte exact d'un SMS : modèle rempli, puis normalisé et compté. */
export function construireSms(type, valeurs, parametres) {
  return { typeMessage: typeDeModele[type] || type, ...preparerSms(remplirModele(modeleDe(type, parametres), valeurs)) };
}

/** Aperçu et taille des six modèles avec des données d'exemple (écran Réglages). */
export function apercuModeles(parametres) {
  return Object.keys(MODELES_DEFAUT).map((type) => ({ type, libelle: LIBELLES_MODELES[type], modele: modeleDe(type, parametres), ...construireSms(type, EXEMPLE_SMS, parametres) }));
}

/** Phrases d'alerte envoyées à la professionnelle (sans nom propre, sans accent hors GSM-7). */
export function texteAlerte(sousType, ctx = {}) {
  const c = ctx.client || 'ce chantier';
  const creneau = ctx.creneau ? ` (${formaterCreneauSms(ctx.creneau)})` : '';
  const brut = {
    commun: `RDV ${c} : un créneau convient à tous${creneau}. À toi de confirmer dans l'appli.`,
    aucun: `RDV ${c} : aucun créneau commun. Propose d'autres dates dans l'appli.`,
    incomprise: `RDV ${c} : réponse non comprise de ${ctx.nom || 'un participant'}${ctx.reponse ? ` : « ${ctx.reponse} »` : ''}. Appelle ou saisis sa réponse dans l'appli.`,
    'fin-relances': `RDV ${c} : relances terminées, il manque des réponses. Ouvre le rendez-vous dans l'appli.`,
    ambigu: `RDV ${c} : ce numéro est dans deux rendez-vous ouverts, réponse non rattachée. Tranche dans l'appli.`,
  }[sousType] || `RDV ${c} : à regarder dans l'appli.`;
  return preparerSms(brut);
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

/**
 * Applique une réponse reçue à un participant : rend le changement à écrire.
 *  - réponse à une ancienne série (`tourReponse` < tour du rendez-vous) : historique seulement, l'état ne change pas ;
 *  - réponse comprise : `etatReponse: 'comprise'` ;
 *  - réponse non comprise : `etatReponse: 'incomprise'` (les relances de cette personne sont suspendues, consigne 13).
 */
export function appliquerReponse({ participant, rdv, texte, recuLe, idReponse, tourReponse }) {
  const tour = Number.isFinite(tourReponse) ? tourReponse : (rdv?.tour ?? 1);
  if (tour < (rdv?.tour ?? 1)) return { historiqueSeulement: true, comprise: null, patch: null };
  const lu = interpreterReponse(texte, (rdv?.creneaux || []).length || MAX_CRENEAUX);
  const patch = {
    reponse: String(texte ?? ''),
    etatReponse: lu.comprise ? 'comprise' : 'incomprise',
    creneauxOk: lu.creneaux,
    reponseLe: recuLe ?? null,
    idReponse: idReponse ?? null,
  };
  return { historiqueSeulement: false, comprise: lu.comprise, patch, alerteIncomprise: !lu.comprise && participant?.etatReponse !== 'incomprise' };
}

/** Réponse saisie à la main par la professionnelle : `creneauxOk` = numéros (1 à 3), vide = aucun. */
export function saisirReponse(participant, creneauxOk, nbCreneaux = MAX_CRENEAUX) {
  const liste = [...new Set((creneauxOk || []).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= nbCreneaux).sort((a, b) => a - b);
  return { etatReponse: 'saisie', creneauxOk: liste, reponse: participant?.reponse ?? '' };
}

const aRepondu = (p) => p.etatReponse === 'comprise' || p.etatReponse === 'saisie';

/** Consigne 6 : 'oui' (coche verte), 'non' (croix rouge), 'inconnu' (point d'interrogation), 'incompris' (triangle rouge). */
export function symboleCellule(participant, indexCreneau) {
  if (participant?.etatReponse === 'incomprise') return 'incompris';
  if (!participant || !aRepondu(participant)) return 'inconnu';
  return (participant.creneauxOk || []).includes(indexCreneau + 1) ? 'oui' : 'non';
}

// ───────────────────────────── Créneaux communs et états ─────────────────────────────

/**
 * Bilan des réponses :
 *  - `parCreneau[i]` = nombre de personnes pour qui le créneau i+1 convient ;
 *  - `communs` = numéros (1 à 3) des créneaux qui conviennent à TOUT le monde (seulement quand tout le monde a répondu) ;
 *  - `meilleur` = le créneau qui convient au plus de monde { creneau, nombre } (ex-aequo : le plus tôt) ;
 *  - `complet` = tout le monde a répondu (compris ou saisi), `incomprises` = réponses non comprises à traiter.
 */
export function bilanReponses(participants, nbCreneaux = MAX_CRENEAUX) {
  const liste = participants || [];
  const total = liste.length;
  const repondants = liste.filter(aRepondu);
  const parCreneau = Array.from({ length: nbCreneaux }, (_, i) => repondants.filter((p) => (p.creneauxOk || []).includes(i + 1)).length);
  const complet = total > 0 && repondants.length === total;
  const communs = complet ? parCreneau.map((n, i) => (n === total ? i + 1 : 0)).filter(Boolean) : [];
  let meilleur = null;
  parCreneau.forEach((n, i) => { if (n > 0 && (!meilleur || n > meilleur.nombre)) meilleur = { creneau: i + 1, nombre: n }; });
  return {
    total, reponses: repondants.length, complet, parCreneau, communs, meilleur,
    incomprises: liste.filter((p) => p.etatReponse === 'incomprise').length,
    enAttente: liste.filter((p) => !p.etatReponse || p.etatReponse === 'attente').length,
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

/** Phrase d'état des cartes et du tableau : « 2 réponses sur 4 », « Relance 1 sur 3 demain », « Créneau commun : jeu. 19 nov. 10 h ». */
export function ligneEtat({ rdv, participants, parametres, messages, maintenant }) {
  const b = bilanReponses(participants, (rdv?.creneaux || []).length || MAX_CRENEAUX);
  if (rdv?.etat === 'confirme' || rdv?.creneauChoisi) return `Confirmé : ${formaterCreneau(rdv.creneauChoisi)}`;
  if (b.complet && b.communs.length) return `Créneau commun : ${formaterCreneau(rdv.creneaux[b.communs[0] - 1])}`;
  if (b.complet) return 'Aucun créneau commun';
  if (b.incomprises) return b.incomprises === 1 ? 'Une réponse non comprise' : `${b.incomprises} réponses non comprises`;
  const texte = `${b.reponses} ${b.reponses > 1 ? 'réponses' : 'réponse'} sur ${b.total}`;
  const prochaine = prochaineRelance({ rdv, participants, parametres, messages });
  if (prochaine && Number.isFinite(enMs(maintenant))) return `${texte} · Relance ${prochaine.numero} sur ${prochaine.sur} ${quandRelatif(prochaine.dueLe, maintenant)}`;
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
  modeles: p?.modeles || {},
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

/** Prochaine relance prévue (pour la carte) : { numero, sur, dueLe } ou null. */
export function prochaineRelance({ rdv, participants, parametres, messages }) {
  const p = params(parametres);
  const n = nombreRelances(p);
  if (!n || !estOuvert(rdv) || !rdv?.id) return null;
  if (!(participants || []).some((x) => !x.etatReponse || x.etatReponse === 'attente')) return null;
  const deja = envoyes(messages);
  const base = deja.get(idEcheance(rdv.id, rdv.tour, 'creneaux', premierParticipant(participants)));
  if (!base) return null;
  const depart = enMs(base.envoyeLe);
  if (!Number.isFinite(depart)) return null;
  for (let k = 1; k <= n; k++) {
    const cibles = (participants || []).filter((x) => !x.etatReponse || x.etatReponse === 'attente');
    const fait = cibles.every((x) => deja.has(idEcheance(rdv.id, rdv.tour, `relance${k}`, x.id)));
    if (!fait) return { numero: k, sur: n, dueLe: versISO(prochaineOuverture(depart + k * delaiRelance(p), p.plage)) };
  }
  return null;
}
const premierParticipant = (participants) => (participants && participants[0] ? participants[0].id : '');

/** Les relances d'un rendez-vous sont finies et plus de 24 h ont passé sans que tout le monde réponde (l'alerte est due). */
export function relancesTerminees(rdv, participants, parametres) {
  return !!rdv?.relancesTermineesLe && (participants || []).some((x) => !x.etatReponse || x.etatReponse === 'attente');
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
export function smsDus({ rdv, participants = [], parametres, messages = [], maintenant }) {
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
    const dueLe = def.horsPlage === false ? def.instant : prochaineOuverture(def.instant, p.plage);
    if (dueLe > nowMs) return;
    const sms = def.texte ? preparerSms(def.texte) : construireSms(def.modele, def.valeurs, p);
    dus.push({
      idEcheance: def.idEcheance, typeMessage: def.typeMessage, sousType: def.sousType || null, participantId: def.participantId || null,
      manque: [...new Set([...sms.texte.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))],
      numero, texte: sms.texte, caracteres: sms.caracteres, unites: sms.unites, segments: sms.segments, encodage: sms.encodage,
      dueLe: versISO(dueLe), tour,
    });
  };
  const valeurs = valeursSms(rdv, p);
  const actifsAlerte = p.numerosAlerte.filter((n) => n && n.actif && n.numero);
  const alerter = (sousType, nature, ctx) => {
    for (const n of actifsAlerte) {
      proposer({
        idEcheance: idEcheance(rdv.id, tour, `alerte-${nature}`, n.id), typeMessage: 'alerte', sousType, numero: n.numero,
        instant: ctx.instant, texte: texteAlerte(sousType, { client: rdv.client, ...ctx }).texte,
      });
    }
  };

  const envoiDemande = enMs(rdv.envoiDemandeLe);
  const confirme = rdv.etat === 'confirme' || !!rdv.creneauChoisi;

  // 1. Premiers SMS (présentation, puis créneaux une minute après pour garder l'ordre).
  if (Number.isFinite(envoiDemande) && !confirme) {
    for (const x of participants) {
      proposer({ idEcheance: idEcheance(rdv.id, tour, 'confiance', x.id), typeMessage: 'confiance', modele: 'confiance', valeurs, numero: x.telephone, participantId: x.id, instant: envoiDemande });
      proposer({ idEcheance: idEcheance(rdv.id, tour, 'creneaux', x.id), typeMessage: 'creneaux', modele: 'creneaux', valeurs, numero: x.telephone, participantId: x.id, instant: envoiDemande + MINUTE_MS });
    }
  }

  // 2. Relances : seulement les personnes en attente (une réponse non comprise suspend leurs relances).
  const ouverts = estOuvert(rdv);
  const attentes = participants.filter((x) => !x.etatReponse || x.etatReponse === 'attente');
  const n = nombreRelances(p);
  const premier = participants[0];
  const baseMsg = premier ? deja.get(idEcheance(rdv.id, tour, 'creneaux', premier.id)) : null;
  const depart = baseMsg ? enMs(baseMsg.envoyeLe) : NaN;
  let derniereRelanceFaite = null;
  if (ouverts && Number.isFinite(depart)) {
    for (let k = 1; k <= n; k++) {
      const precedenteOk = k === 1 || attentes.every((x) => deja.has(idEcheance(rdv.id, tour, `relance${k - 1}`, x.id)));
      if (!precedenteOk) break;
      for (const x of attentes) {
        proposer({ idEcheance: idEcheance(rdv.id, tour, `relance${k}`, x.id), typeMessage: 'relance', modele: 'relance', valeurs, numero: x.telephone, participantId: x.id, instant: depart + k * delaiRelance(p) });
      }
      if (attentes.length && attentes.every((x) => deja.has(idEcheance(rdv.id, tour, `relance${k}`, x.id)))) {
        derniereRelanceFaite = Math.max(...attentes.map((x) => enMs(deja.get(idEcheance(rdv.id, tour, `relance${k}`, x.id)).envoyeLe)));
      }
    }
    // 3. Alerte « relances terminées » : 24 h après la dernière relance, s'il manque encore des réponses.
    if (attentes.length && (n === 0 || derniereRelanceFaite !== null) && attentes.every((x) => n === 0 || deja.has(idEcheance(rdv.id, tour, `relance${n}`, x.id)))) {
      const base = n === 0 ? depart : derniereRelanceFaite;
      alerter('fin-relances', 'fin', { instant: base + DELAI_ALERTE_HEURES * HEURE_MS });
    }
  }

  // 4. Alertes de réponses (tout le monde a répondu ; réponse non comprise).
  if (ouverts && participants.length) {
    const b = bilanReponses(participants, (rdv.creneaux || []).length || MAX_CRENEAUX);
    const dateDerniere = Math.max(0, ...participants.map((x) => enMs(x.reponseLe)).filter(Number.isFinite));
    const instantReponses = dateDerniere || nowMs;
    if (b.complet && b.communs.length) alerter('commun', 'commun', { instant: instantReponses, creneau: rdv.creneaux[b.communs[0] - 1] });
    if (b.complet && !b.communs.length) alerter('aucun', 'aucun', { instant: instantReponses });
    for (const x of participants.filter((y) => y.etatReponse === 'incomprise')) {
      alerter('incomprise', `incomprise-${x.id}-${x.idReponse || 'r'}`, { instant: enMs(x.reponseLe) || nowMs, nom: x.nom, reponse: x.reponse });
    }
  }

  // 5. Confirmation (jamais retardée par la plage) et rappel de la veille.
  if (confirme) {
    const confirmeLe = enMs(rdv.confirmeLe);
    if (Number.isFinite(confirmeLe)) {
      for (const x of participants) {
        proposer({ idEcheance: idEcheance(rdv.id, tour, 'confirmation', x.id), typeMessage: 'confirmation', modele: 'confirmation', valeurs: valeursSms(rdv, p), numero: x.telephone, participantId: x.id, instant: confirmeLe, horsPlage: false });
      }
      const choisi = enMs(rdv.creneauChoisi);
      if (p.rappel.actif && Number.isFinite(choisi)) {
        const rappelA = instantRappelVeille(choisi, p.rappel.heure);
        if (rappelA >= confirmeLe) {
          for (const x of participants) {
            proposer({ idEcheance: idEcheance(rdv.id, tour, 'rappel', x.id), typeMessage: 'rappel', modele: 'rappel', valeurs: valeursSms(rdv, p), numero: x.telephone, participantId: x.id, instant: rappelA });
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
 *  - { type: 'unique', rendezVousId, participantId } : un seul rendez-vous ouvert attend ce numéro ;
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
      if ((t.ok ? t.telephone : x.telephone) === cle) candidats.push({ rendezVousId: rdv.id, participantId: x.id, attend: !x.etatReponse || x.etatReponse === 'attente' });
    }
  }
  const sortie = (c) => ({ rendezVousId: c.rendezVousId, participantId: c.participantId });
  if (!candidats.length) return { type: 'inconnu' };
  if (candidats.length === 1) return { type: 'unique', ...sortie(candidats[0]) };
  const attendent = candidats.filter((c) => c.attend);
  if (attendent.length === 1) return { type: 'unique', ...sortie(attendent[0]) };
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
  const utiles = (creneaux || []).filter((c) => c !== '' && c != null);
  if (!utiles.length) erreurs.push('Ajoute au moins un créneau.');
  if (utiles.length > MAX_CRENEAUX) erreurs.push(`Tu peux proposer ${MAX_CRENEAUX} créneaux au plus.`);
  const ms = utiles.map(enMs);
  if (ms.some((m) => !Number.isFinite(m))) erreurs.push('Un créneau n’a pas une date et une heure valides.');
  else if (Number.isFinite(nowMs) && ms.some((m) => m <= nowMs)) erreurs.push('Les créneaux doivent être dans le futur.');
  if (new Set(ms).size !== ms.length) erreurs.push('Deux créneaux sont identiques.');
  return { ok: erreurs.length === 0, erreurs, participants: sortie };
}
