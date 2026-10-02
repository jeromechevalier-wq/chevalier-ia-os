// Règles métier pures du module CRM (version 2.0) : aucune dépendance à Firebase ni au navigateur.
// Conventions :
//  - les champs "date" (date d'une activité, dateInterviewJtbd, dateReveil) sont des chaînes "AAAA-MM-JJ"
//    (jour civil, sans fuseau) ; les heures sont "HH:MM" ; les mois "AAAA-MM" ;
//  - les champs "timestamp" sont des Timestamp Firestore (ou des Date côté tests) : versDate() lit les deux ;
//  - les fonctions qui modifient un document renvoient un "patch" (champs à écrire) et, quand il y a lieu,
//    la liste des événements du journal à ajouter ; c'est donnees.js qui écrit.

export const FUSEAU = 'Europe/Paris';
export const JOURS_RAPPEL_EXPORT = 30;
export const MAX_HISTORIQUE = 500;
export const MAX_SUGGESTIONS = 8;
export const MIN_LETTRES = 2;
export const VERSION_EXPORT = '2.0.0';

// ---------------------------------------------------------------- référentiels

export const ETAPES = [
  { id: 'premier_contact', libelle: 'Premier contact', couleur: '#b9adc9' },
  { id: 'rdv_fixe', libelle: 'Rendez vous fixé', couleur: '#e3cdee' },
  { id: 'proposition_envoyee', libelle: 'Proposition envoyée', couleur: '#b98ee0' },
  { id: 'gagne', libelle: 'Gagné', couleur: '#ecbc06' },
  { id: 'facture_envoyee', libelle: 'Facture envoyée', couleur: '#fd6455' },
  { id: 'facture_payee', libelle: 'Facture payée', couleur: '#3fbf7f' },
];

/** Étapes dont le statut dérivé est "gagnée" (la 4e, 5e et 6e). */
export const ETAPES_GAGNEES = ['gagne', 'facture_envoyee', 'facture_payee'];

export const STATUTS = [
  { id: 'ouverte', libelle: 'Ouverte', couleur: '#b98ee0' },
  { id: 'gagnee', libelle: 'Gagnée', couleur: '#ecbc06' },
  { id: 'perdue', libelle: 'Perdue', couleur: '#8d8993' },
  { id: 'en_pause', libelle: 'En pause', couleur: '#8a9bb4' },
];

export const ROLES = [
  { id: 'prospect', libelle: 'Prospect' },
  { id: 'partenaire', libelle: 'Partenaire' },
  { id: 'interview_jtbd', libelle: 'Interviewé JTBD' },
];

export const TYPES_CONTACT = [
  { id: 'travail', libelle: 'Travail' },
  { id: 'perso', libelle: 'Perso' },
  { id: 'autre', libelle: 'Autre' },
];

export const TYPES_ACTIVITE = [
  { id: 'appel', libelle: 'Appel', titre: 'Appel' },
  { id: 'rendez_vous', libelle: 'Rendez vous', titre: 'Rendez vous' },
  { id: 'email', libelle: 'Email', titre: 'Email' },
  { id: 'tache', libelle: 'Tâche', titre: 'Tâche' },
];

export const TAILLES = ['Solo', '2 à 10', '11 à 50', 'Plus de 50'];

export const PRIORITES = [
  { id: 'chaud', libelle: 'Chaud' },
  { id: 'tiede', libelle: 'Tiède' },
  { id: 'froid', libelle: 'Froid' },
];

export const RAISONS_PERDUE = ['Prix', 'Pas le moment', 'Pas de besoin', 'Concurrent', 'Sans réponse', 'Autre'];

export const SECTEURS_DEPART = ['Commerce local', 'Artisanat', 'Services', 'Bien être', 'Conseil', 'Associatif', 'Autre'];
export const SOURCES_DEPART = [
  'Réseau personnel', 'Réseau entrepreneuses', 'Commerçant local', 'LinkedIn',
  'Recommandation', 'Événement', 'Flyer', 'Autre',
];
export const OFFRES_DEPART = [
  { id: 'audit', nom: 'Audit', actif: true, ordre: 1 },
  { id: 'accompagnement', nom: 'Accompagnement', actif: true, ordre: 2 },
];
export const ETIQUETTES_DEPART = [
  { id: 'prospect_chaud', nom: 'Prospect chaud', couleur: '#fd6455', ordre: 1 },
  { id: 'reseau_entrepreneuses', nom: 'Réseau entrepreneuses', couleur: '#b98ee0', ordre: 2 },
  { id: 'commercant_local', nom: 'Commerçant local', couleur: '#ecbc06', ordre: 3 },
  { id: 'partenaire', nom: 'Partenaire', couleur: '#3fbf7f', ordre: 4 },
];
export const REGLAGES_DEPART = { delaiPaiementJours: 30, debutActivite: '2026-10', dernierExport: null };

export const FILTRES_DEPART = [
  { id: 'relancer_semaine', nom: 'À relancer cette semaine', liste: 'affaires', criteres: { semaine: true }, ordre: 1 },
  { id: 'chaudes', nom: 'Chaudes', liste: 'affaires', criteres: { priorites: ['chaud'] }, ordre: 2 },
  { id: 'reseau_entrepreneuses', nom: 'Réseau entrepreneuses', liste: 'affaires', criteres: { sources: ['Réseau entrepreneuses'] }, ordre: 3 },
  { id: 'jtbd_a_faire', nom: 'Interviews JTBD à faire', liste: 'personnes', criteres: { roles: ['interview_jtbd'], jtbd: 'non_faite' }, ordre: 4 },
];

export const DATES_RAPIDES = [
  { id: 'demain', libelle: 'Demain', jours: 1 },
  { id: '3j', libelle: '+3 jours', jours: 3 },
  { id: '1sem', libelle: '+1 semaine', jours: 7 },
  { id: '2sem', libelle: '+2 semaines', jours: 14 },
];

export function libelleEtape(id) {
  return ETAPES.find((e) => e.id === id)?.libelle ?? id ?? '';
}
export function couleurEtape(id) {
  return ETAPES.find((e) => e.id === id)?.couleur ?? '#8d8993';
}
export function libelleStatut(id) {
  return STATUTS.find((s) => s.id === id)?.libelle ?? id ?? '';
}
export function libelleRole(id) {
  return ROLES.find((r) => r.id === id)?.libelle ?? id;
}
export function libellePriorite(id) {
  return PRIORITES.find((p) => p.id === id)?.libelle ?? id ?? '';
}
export function libelleTypeActivite(id) {
  return TYPES_ACTIVITE.find((t) => t.id === id)?.libelle ?? id ?? '';
}
export function libelleTypeContact(id) {
  return TYPES_CONTACT.find((t) => t.id === id)?.libelle ?? id ?? '';
}
export function libelleOffre(offres, id) {
  if (!id) return '';
  const o = (offres || []).find((x) => x.id === id);
  return o ? o.nom : id;
}
export function libelleEtiquette(etiquettes, id) {
  const e = (etiquettes || []).find((x) => x.id === id);
  return e ? e.nom : id;
}

// ---------------------------------------------------------------- dates

/** Convertit un Timestamp Firestore, une Date, un nombre ou une chaîne en Date (ou null). */
export function versDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && typeof v.seconds === 'number') {
    return new Date(v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6));
  }
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return dateHeureParisVersDate(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dateHeureParisVersDate(`${v}T12:00`);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}

const formateurParis = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function partiesParis(date) {
  const p = {};
  for (const { type, value } of formateurParis.formatToParts(date)) p[type] = value;
  return p;
}

/** Jour civil à Paris, "AAAA-MM-JJ". */
export function jourParis(dateLike) {
  const d = versDate(dateLike);
  if (!d) return null;
  const p = partiesParis(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Aujourd'hui à Paris, "AAAA-MM-JJ". */
export function aujourdhuiParis(maintenant = new Date()) {
  return jourParis(maintenant);
}

/** Mois civil à Paris, "AAAA-MM". Accepte aussi une chaîne "AAAA-MM-JJ". */
export function moisParis(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !v.includes('Z')) return v.slice(0, 7);
  const j = jourParis(v);
  return j ? j.slice(0, 7) : null;
}

export function moisCourant(maintenant = new Date()) {
  return moisParis(maintenant);
}

/** "2026-10-12T14:30" (heure de Paris) vers l'instant correspondant. */
export function dateHeureParisVersDate(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texte || '');
  if (!m) return null;
  const [, a, mo, j, h, mi] = m.map(Number);
  const suppose = Date.UTC(a, mo - 1, j, h, mi);
  // Décalage de Paris à cet instant (itéré deux fois pour les changements d'heure).
  let instant = suppose;
  for (let i = 0; i < 2; i++) {
    const p = partiesParis(new Date(instant));
    const vuParis = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant = suppose - (vuParis - instant);
  }
  return new Date(instant);
}

/** Ajoute n jours à un jour civil "AAAA-MM-JJ". */
export function ajouterJours(jour, n) {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/** Écart en jours entre deux jours civils (b - a). */
export function ecartJours(a, b) {
  const t = (s) => { const [x, y, z] = s.split('-').map(Number); return Date.UTC(x, y - 1, z); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/** Date d'un bouton de date rapide ("demain", "3j", "1sem", "2sem"). */
export function dateRapide(code, aujourdhui) {
  const b = DATES_RAPIDES.find((x) => x.id === code);
  if (!b) throw new Error(`Bouton de date inconnu : ${code}`);
  return ajouterJours(aujourdhui, b.jours);
}

/** Dimanche de la semaine en cours (lundi à dimanche), "AAAA-MM-JJ". */
export function dimancheDeLaSemaine(aujourdhui) {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const jourSemaine = new Date(Date.UTC(a, m - 1, j)).getUTCDay(); // 0 = dimanche
  return ajouterJours(aujourdhui, (7 - jourSemaine) % 7);
}

export function decalerMois(mois, n) {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NOMS_MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function libelleMois(mois, court = false) {
  const [a, m] = mois.split('-').map(Number);
  return court ? `${NOMS_MOIS_COURTS[m - 1]}` : `${NOMS_MOIS[m - 1]} ${a}`;
}

export function formatJour(jour) {
  if (!jour) return '';
  const [a, m, j] = jour.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

export function formatJourCourt(jour, aujourdhui) {
  if (!jour) return '';
  if (aujourdhui) {
    const e = ecartJours(aujourdhui, jour);
    if (e === 0) return "Aujourd'hui";
    if (e === 1) return 'Demain';
    if (e === -1) return 'Hier';
  }
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  const suffixe = aujourdhui && aujourdhui.slice(0, 4) !== String(a) ? ` ${a}` : '';
  return `${j} ${NOMS_MOIS_COURTS[m - 1]}${suffixe}`;
}

export function formatDateHeure(v) {
  const d = versDate(v);
  if (!d) return '';
  const p = partiesParis(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export function formatEuros(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
  }).format(v).replace(/[\u00a0\u202f]/g, ' ');
}

export function formatNombre(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n) || 0).replace(/[\u00a0\u202f]/g, ' ');
}

export function idAleatoire() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------- texte : normalisation, noms, emails

/** Minuscules, sans accents, sans espaces aux bords. */
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Comme normaliser, mais les espaces multiples deviennent un seul espace (comparaison de noms). */
export function normaliserNom(texte) {
  return normaliser(texte).replace(/\s+/g, ' ');
}

/** Espaces en trop retirés, casse conservée. */
export function nettoyerEspaces(texte) {
  return String(texte ?? '').replace(/\s+/g, ' ').trim();
}

/** "Marie Durand" -> { prenom: "Marie", nomFamille: "Durand" } ; un seul mot -> nom de famille seul. */
export function decouperNom(nom) {
  const t = nettoyerEspaces(nom);
  if (!t) return { prenom: '', nomFamille: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { prenom: '', nomFamille: t };
  return { prenom: t.slice(0, i), nomFamille: t.slice(i + 1) };
}

export function assemblerNom(prenom, nomFamille) {
  return nettoyerEspaces(`${prenom ?? ''} ${nomFamille ?? ''}`);
}

export function normaliserEmail(email) {
  return String(email ?? '').replace(/\s+/g, '').toLowerCase();
}

export function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email ?? '').trim());
}

/** Liste des emails normalisés, sans doublon ni valeur vide. */
export function emailsNormalises(emails) {
  const vus = new Set();
  for (const e of emails || []) {
    const v = normaliserEmail(typeof e === 'string' ? e : e?.valeur);
    if (v) vus.add(v);
  }
  return [...vus];
}

// ---------------------------------------------------------------- recherche intelligente et doublons

function normaliserAvecIndex(texte) {
  let norm = '';
  const index = [];
  const s = String(texte ?? '');
  for (let i = 0; i < s.length; i++) {
    const n = s[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const c of n) { norm += c; index.push(i); }
  }
  return { norm, index };
}

/** Découpe un libellé en segments { texte, fort } : les lettres trouvées sont "fort". */
export function surligner(libelle, saisie) {
  const original = String(libelle ?? '');
  const mots = normaliser(saisie).split(/\s+/).filter(Boolean);
  const { norm, index } = normaliserAvecIndex(original);
  let plages = [];
  for (const mot of mots) {
    const pos = norm.indexOf(mot);
    if (pos === -1) continue;
    plages.push([index[pos], index[pos + mot.length - 1] + 1]);
  }
  plages.sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const p of plages) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]);
    else fusion.push([...p]);
  }
  const segments = [];
  let curseur = 0;
  for (const [debut, fin] of fusion) {
    if (debut > curseur) segments.push({ texte: original.slice(curseur, debut), fort: false });
    segments.push({ texte: original.slice(debut, fin), fort: true });
    curseur = fin;
  }
  if (curseur < original.length) segments.push({ texte: original.slice(curseur), fort: false });
  return segments.length ? segments : [{ texte: original, fort: false }];
}

/**
 * Suggestions d'un champ intelligent.
 * elements : [{ id, libelle, sousTitre?, extra?: [string] }]
 * Dès `min` lettres : valeurs qui CONTIENNENT la saisie (accents et casse ignorés), débuts de mot d'abord,
 * `max` résultats au plus. `creer` : texte à créer ("Créer « … »") s'il n'existe pas de valeur identique.
 */
export function rechercherSuggestions(saisie, elements, { min = MIN_LETTRES, max = MAX_SUGGESTIONS, creer = false } = {}) {
  const q = normaliserNom(saisie);
  if (q.length < min) return { resultats: [], creer: null, total: 0 };
  const mots = q.split(' ');
  const classes = [];
  for (const el of elements || []) {
    const lib = normaliserNom(el.libelle);
    const botte = normaliserNom([el.libelle, ...(el.extra || [])].join(' '));
    if (!mots.every((m) => botte.includes(m))) continue;
    let score;
    if (lib.startsWith(q)) score = 0;
    else if (lib.split(/[\s'’\-]+/).some((w) => w.startsWith(mots[0])) && mots.every((m) => lib.includes(m))) score = 1;
    else if (mots.every((m) => lib.includes(m))) score = 2;
    else score = 3;
    classes.push({ el, score });
  }
  classes.sort((a, b) => a.score - b.score || String(a.el.libelle).localeCompare(String(b.el.libelle), 'fr'));
  const resultats = classes.slice(0, max).map(({ el }) => ({ ...el, segments: surligner(el.libelle, saisie) }));
  const identique = (elements || []).some((el) => normaliserNom(el.libelle) === q);
  return { resultats, creer: creer && !identique ? nettoyerEspaces(saisie) : null, total: classes.length };
}

/** Personnes qui ressemblent à la saisie : même nom (accents, casse, espaces ignorés) ou email partagé. */
export function trouverDoublonsPersonne(personnes, { nom, emails = [] }, { sauf = null } = {}) {
  const n = normaliserNom(nom);
  const mails = new Set(emailsNormalises(emails));
  return (personnes || []).filter((p) => {
    if (sauf && p.id === sauf) return false;
    if (p.archive) return false;
    if (n && normaliserNom(p.nom) === n) return true;
    const siens = p.emailsNormalises?.length ? p.emailsNormalises : emailsNormalises(p.emails);
    return siens.some((m) => mails.has(m));
  });
}

export function trouverDoublonsOrganisation(organisations, nom, { sauf = null } = {}) {
  const n = normaliserNom(nom);
  if (!n) return [];
  return (organisations || []).filter((o) => o.id !== sauf && !o.archive && normaliserNom(o.nom) === n);
}

// ---------------------------------------------------------------- personnes et organisations

export function validerPersonne(v) {
  const erreurs = {};
  if (!nettoyerEspaces(v.nom)) erreurs.nom = 'Le nom est obligatoire.';
  for (const e of v.emails || []) {
    if (e.valeur && !emailValide(e.valeur)) erreurs.emails = "Cette adresse email n'est pas valide.";
  }
  return erreurs;
}

export function validerOrganisation(v) {
  return nettoyerEspaces(v.nom) ? {} : { nom: 'Le nom est obligatoire.' };
}

function contactsNettoyes(liste) {
  return (liste || [])
    .map((c) => ({ valeur: nettoyerEspaces(c.valeur), type: TYPES_CONTACT.some((t) => t.id === c.type) ? c.type : 'travail' }))
    .filter((c) => c.valeur);
}

/** Document d'une nouvelle personne. Seul le nom est requis. */
export function nouvellePersonne(valeurs, ctx) {
  const nom = nettoyerEspaces(valeurs.nom);
  const { prenom, nomFamille } = decouperNom(nom);
  const emails = contactsNettoyes(valeurs.emails);
  return {
    nom,
    prenom,
    nomFamille,
    organisationId: valeurs.organisationId || null,
    telephones: contactsNettoyes(valeurs.telephones),
    emails,
    emailsNormalises: emailsNormalises(emails),
    etiquettes: [...(valeurs.etiquettes || [])],
    roles: valeurs.roles?.length ? [...valeurs.roles] : ['prospect'],
    dateInterviewJtbd: null,
    ville: nettoyerEspaces(valeurs.ville),
    linkedin: '',
    siteWeb: '',
    source: valeurs.source || '',
    oppositionProspection: false,
    dateOpposition: null,
    archive: false,
    proprietaire: ctx?.auteur ?? '',
  };
}

export function nouvelleOrganisation(valeurs, ctx) {
  return {
    nom: nettoyerEspaces(valeurs.nom),
    adresse: nettoyerEspaces(valeurs.adresse),
    ville: nettoyerEspaces(valeurs.ville),
    siteWeb: '',
    secteur: valeurs.secteur || '',
    taille: '',
    etiquettes: [...(valeurs.etiquettes || [])],
    archive: false,
    proprietaire: ctx?.auteur ?? '',
  };
}

/** Patch après modification du prénom ou du nom de famille : `nom` est recalculé. */
export function patchNomDetaille(prenom, nomFamille) {
  const p = nettoyerEspaces(prenom);
  const f = nettoyerEspaces(nomFamille);
  return { prenom: p, nomFamille: f, nom: assemblerNom(p, f) };
}

/** Patch après modification du nom affiché : prénom et nom de famille sont redécoupés. */
export function patchNomAffiche(nom) {
  const n = nettoyerEspaces(nom);
  return { nom: n, ...decouperNom(n) };
}

/** Patch après modification des emails : la liste normalisée suit. */
export function patchEmails(emails) {
  const propres = contactsNettoyes(emails);
  return { emails: propres, emailsNormalises: emailsNormalises(propres) };
}

export function emailActif(personne) {
  return !personne.oppositionProspection && (personne.emails || []).some((e) => emailValide(e.valeur));
}

export function premierEmail(personne) {
  return (personne.emails || []).find((e) => emailValide(e.valeur))?.valeur ?? '';
}

export function marquerOpposition(coche, ctx) {
  return coche
    ? { oppositionProspection: true, dateOpposition: ctx.maintenant }
    : { oppositionProspection: false, dateOpposition: null };
}

// ---------------------------------------------------------------- affaires : création, statut, étapes

/** Titre proposé quand on n'en tape pas : organisation, sinon personne. */
export function titreParDefaut({ organisation, personne } = {}) {
  return nettoyerEspaces(organisation?.nom) || nettoyerEspaces(personne?.nom) || '';
}

export function validerAffaire(v) {
  return nettoyerEspaces(v.titre) ? {} : { titre: 'Le titre est obligatoire.' };
}

export function statutPourEtape(etape) {
  return ETAPES_GAGNEES.includes(etape) ? 'gagnee' : 'ouverte';
}

/** Document d'une nouvelle affaire (étape, priorité et statut posés automatiquement). */
export function nouvelleAffaire(valeurs, ctx) {
  const etape = valeurs.etape && ETAPES.some((e) => e.id === valeurs.etape) ? valeurs.etape : 'premier_contact';
  const montant = valeurs.montant === '' || valeurs.montant === null || valeurs.montant === undefined ? null : Number(valeurs.montant);
  return {
    titre: nettoyerEspaces(valeurs.titre),
    personneId: valeurs.personneId || null,
    organisationId: valeurs.organisationId || null,
    etape,
    statut: statutPourEtape(etape),
    priorite: PRIORITES.some((p) => p.id === valeurs.priorite) ? valeurs.priorite : 'tiede',
    montant: Number.isFinite(montant) ? montant : null,
    offreId: valeurs.offreId || null,
    dureeJours: valeurs.dureeJours ?? null,
    source: valeurs.source || '',
    besoin: valeurs.besoin || '',
    dateEntreeEtape: ctx.maintenant,
    datesEtapes: { [etape]: ctx.maintenant },
    raisonPerdue: '',
    raisonPerdueDetail: '',
    dateReveil: null,
    encaissements: [],
    documents: [],
    projetId: null,
    archive: etape === 'facture_payee',
    proprietaire: ctx.auteur ?? '',
  };
}

export function validerChangementEtape(etape) {
  return ETAPES.some((e) => e.id === etape) ? {} : { etape: 'Étape inconnue.' };
}

/** Suggestion douce créée comme activité planifiée : { titre, type, date } ou null. */
export function suggestionPourEtape(etape, aujourdhui, delaiPaiementJours = 30) {
  switch (etape) {
    case 'proposition_envoyee':
      return { type: 'tache', titre: 'Relancer la proposition', date: ajouterJours(aujourdhui, 3) };
    case 'gagne':
      return { type: 'tache', titre: 'Envoyer la facture', date: aujourdhui };
    case 'facture_envoyee':
      return { type: 'tache', titre: 'Vérifier le paiement', date: ajouterJours(aujourdhui, Number(delaiPaiementJours) || 30) };
    default:
      return null;
  }
}

function evenement(type, texte, liens, ctx) {
  return {
    type,
    texte,
    personneId: liens?.personneId ?? null,
    organisationId: liens?.organisationId ?? null,
    affaireId: liens?.affaireId ?? null,
    auteur: ctx.auteur ?? '',
    date: ctx.maintenant,
  };
}

/** Liens à poser sur un élément du fil (activité, note, événement) rattaché à une affaire. */
export function liensAffaire(affaire) {
  return {
    personneId: affaire.personneId ?? null,
    organisationId: affaire.organisationId ?? null,
    affaireId: affaire.id ?? null,
  };
}

/**
 * Changement d'étape : renvoie { patch, evenements, suggestion }.
 * options : montantEncaisse (étape Facture payée).
 * Changer d'étape rouvre une affaire perdue ou en pause (raison et date de réveil effacées).
 */
export function changementEtape(affaire, etape, ctx, options = {}) {
  const erreurs = validerChangementEtape(etape);
  if (Object.keys(erreurs).length) return { erreurs, patch: {}, evenements: [], suggestion: null };
  const liens = liensAffaire(affaire);
  const rouvre = affaire.statut === 'perdue' || affaire.statut === 'en_pause';
  if (etape === affaire.etape && !rouvre) return { erreurs: {}, patch: {}, evenements: [], suggestion: null };

  const datesEtapes = { ...(affaire.datesEtapes || {}) };
  if (!datesEtapes[etape]) datesEtapes[etape] = ctx.maintenant;
  const patch = {
    etape,
    statut: statutPourEtape(etape),
    dateEntreeEtape: ctx.maintenant,
    datesEtapes,
    raisonPerdue: '',
    raisonPerdueDetail: '',
    dateReveil: null,
    archive: etape === 'facture_payee',
  };
  const evenements = [];
  if (rouvre) evenements.push(evenement('affaire_rouverte', `Affaire rouverte : ${affaire.titre}`, liens, ctx));
  if (etape !== affaire.etape) {
    evenements.push(evenement('etape_changee', `Étape : ${libelleEtape(affaire.etape)} → ${libelleEtape(etape)}`, liens, ctx));
  }
  if (etape === 'gagne' && affaire.etape !== 'gagne' && !affaire.datesEtapes?.gagne) {
    evenements.push(evenement('affaire_gagnee', `Affaire gagnée : ${affaire.titre}`, liens, ctx));
  }
  if (etape === 'facture_payee' && affaire.etape !== 'facture_payee') {
    const montant = Number(options.montantEncaisse ?? affaire.montant ?? 0) || 0;
    patch.encaissements = [...(affaire.encaissements || []), { date: ctx.maintenant, montant, offreId: affaire.offreId ?? null }];
    evenements.push(evenement('encaissement', `Encaissement : ${formatEuros(montant)}`, liens, ctx));
  }
  const suggestion = etape !== affaire.etape ? suggestionPourEtape(etape, aujourdhuiParis(ctx.maintenant), ctx.delaiPaiementJours) : null;
  return { erreurs: {}, patch, evenements, suggestion };
}

export function validerPerdue(raison) {
  return RAISONS_PERDUE.includes(raison) ? {} : { raison: 'La raison est obligatoire.' };
}

export function marquerPerdue(affaire, { raison, detail = '' }, ctx) {
  const erreurs = validerPerdue(raison);
  if (Object.keys(erreurs).length) return { erreurs, patch: {}, evenements: [] };
  return {
    erreurs: {},
    patch: { statut: 'perdue', raisonPerdue: raison, raisonPerdueDetail: nettoyerEspaces(detail), dateReveil: null },
    evenements: [evenement('affaire_perdue', `Affaire perdue (${raison}) : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

/** Date de réveil proposée pour une affaire en pause : +3 mois, au même jour du mois. */
export function dateReveilParDefaut(aujourdhui) {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + 3, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export function mettreEnPause(affaire, { dateReveil }, ctx) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReveil || '')) return { erreurs: { dateReveil: 'La date de réveil est obligatoire.' }, patch: {}, evenements: [] };
  return {
    erreurs: {},
    patch: { statut: 'en_pause', dateReveil, raisonPerdue: '', raisonPerdueDetail: '' },
    evenements: [evenement('affaire_en_pause', `Affaire en pause jusqu'au ${formatJour(dateReveil)} : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

export function rouvrirAffaire(affaire, ctx) {
  if (affaire.statut !== 'perdue' && affaire.statut !== 'en_pause') return { patch: {}, evenements: [] };
  return {
    patch: { statut: statutPourEtape(affaire.etape), raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null },
    evenements: [evenement('affaire_rouverte', `Affaire rouverte : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

export function estArchivee(x) {
  return x.archive === true;
}

/** Affaire "vivante" : ni archivée, ni perdue, ni en pause. */
export function estAffaireActive(a) {
  return !estArchivee(a) && (a.statut === 'ouverte' || a.statut === 'gagnee');
}

export function ajouterEncaissement(affaire, { montant, date }, ctx) {
  const m = Number(montant);
  if (!Number.isFinite(m) || m <= 0) return { erreurs: { montant: 'Le montant doit être positif.' }, patch: {}, evenements: [] };
  const jour = date || aujourdhuiParis(ctx.maintenant);
  return {
    erreurs: {},
    patch: { encaissements: [...(affaire.encaissements || []), { date: versDate(jour), montant: m, offreId: affaire.offreId ?? null }] },
    evenements: [evenement('encaissement', `Encaissement : ${formatEuros(m)}`, liensAffaire(affaire), ctx)],
  };
}

export function ajouterDocument(affaire, libelle, url) {
  const u = nettoyerEspaces(url);
  if (!/^https?:\/\//i.test(u)) return { erreurs: { url: "L'adresse doit commencer par http." }, patch: {} };
  return { erreurs: {}, patch: { documents: [...(affaire.documents || []), { libelle: nettoyerEspaces(libelle) || u, url: u }] } };
}

export function supprimerDocument(affaire, index) {
  return { documents: (affaire.documents || []).filter((_, i) => i !== index) };
}

// ---------------------------------------------------------------- activités

export function titreActiviteParDefaut(type) {
  return TYPES_ACTIVITE.find((t) => t.id === type)?.titre ?? 'Tâche';
}

export function validerActivite(v) {
  const erreurs = {};
  if (!TYPES_ACTIVITE.some((t) => t.id === v.type)) erreurs.type = 'Le type est obligatoire.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) erreurs.date = 'La date est obligatoire.';
  return erreurs;
}

export function nouvelleActivite(valeurs, ctx) {
  const type = TYPES_ACTIVITE.some((t) => t.id === valeurs.type) ? valeurs.type : 'tache';
  return {
    type,
    titre: nettoyerEspaces(valeurs.titre) || titreActiviteParDefaut(type),
    date: valeurs.date || aujourdhuiParis(ctx.maintenant),
    heure: valeurs.heure || '',
    fait: false,
    dateFait: null,
    personneId: valeurs.personneId ?? null,
    organisationId: valeurs.organisationId ?? null,
    affaireId: valeurs.affaireId ?? null,
    auteur: ctx.auteur ?? '',
  };
}

export function activiteFaite(activite, ctx) {
  if (activite.fait) return { patch: {}, evenements: [] };
  return {
    patch: { fait: true, dateFait: ctx.maintenant },
    evenements: [evenement('activite_faite', `${libelleTypeActivite(activite.type)} fait : ${activite.titre}`, activite, ctx)],
  };
}

export function activiteNonFaite(activite) {
  return { fait: false, dateFait: null };
}

export function estActiviteEnRetard(a, aujourdhui) {
  return !a.fait && !!a.date && a.date < aujourdhui;
}

export function activitesAVenir(activites) {
  return (activites || []).filter((a) => !a.fait);
}

function cleTri(a) {
  return `${a.date || '9999-99-99'}T${a.heure || '00:00'}`;
}

export function trierActivites(activites) {
  return [...activites].sort((a, b) => cleTri(a).localeCompare(cleTri(b)));
}

export function prochaineActivite(activites) {
  return trierActivites(activitesAVenir(activites))[0] ?? null;
}

/** Pastille d'une affaire : rouge (activité en retard), verte (activité prévue), grise (aucune). */
export function pastilleActivite(activitesDeLAffaire, aujourdhui) {
  const prevues = activitesAVenir(activitesDeLAffaire);
  if (!prevues.length) return 'grise';
  return prevues.some((a) => estActiviteEnRetard(a, aujourdhui)) ? 'rouge' : 'verte';
}

export function activitesDeAffaire(activites, affaireId) {
  return (activites || []).filter((a) => a.affaireId === affaireId);
}

/** Affaire active sans aucune activité à venir. */
export function estSansAction(affaire, activites) {
  return estAffaireActive(affaire) && !activitesDeAffaire(activitesAVenir(activites), affaire.id).length;
}

export function estAReveiller(affaire, aujourdhui) {
  return affaire.statut === 'en_pause' && !!affaire.dateReveil && affaire.dateReveil <= aujourdhui && !estArchivee(affaire);
}

/**
 * Points clés : activités non faites (en retard, aujourd'hui), affaires à réveiller, affaires sans action.
 * Les activités rattachées à une affaire perdue, en pause ou archivée sont ignorées.
 */
export function pointsCles({ activites = [], affaires = [] }, aujourdhui) {
  const vivantes = new Set(affaires.filter(estAffaireActive).map((a) => a.id));
  const garde = (a) => !a.affaireId || vivantes.has(a.affaireId);
  const ouvertes = trierActivites(activitesAVenir(activites).filter(garde));
  return {
    enRetard: ouvertes.filter((a) => estActiviteEnRetard(a, aujourdhui)),
    aujourdhui: ouvertes.filter((a) => a.date === aujourdhui),
    reveils: affaires.filter((a) => estAReveiller(a, aujourdhui)),
    sansAction: affaires.filter((a) => estSansAction(a, activites)),
  };
}

/** Points clés d'une fiche : ses activités non faites, les plus proches d'abord. */
export function pointsClesFiche(activites, aujourdhui) {
  return trierActivites(activitesAVenir(activites)).map((a) => ({
    ...a,
    etat: estActiviteEnRetard(a, aujourdhui) ? 'retard' : a.date === aujourdhui ? 'aujourdhui' : 'avenir',
  }));
}

// ---------------------------------------------------------------- notes et historique

export function validerNote(texte) {
  return nettoyerEspaces(texte) ? {} : { texte: 'La note est vide.' };
}

export function nouvelleNote(texte, liens, ctx) {
  return {
    texte: String(texte ?? '').trim(),
    personneId: liens?.personneId ?? null,
    organisationId: liens?.organisationId ?? null,
    affaireId: liens?.affaireId ?? null,
    auteur: ctx.auteur ?? '',
  };
}

export const FILTRES_HISTORIQUE = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'activites', libelle: 'Activités' },
  { id: 'notes', libelle: 'Notes' },
  { id: 'affaires', libelle: 'Affaires' },
  { id: 'evenements', libelle: 'Événements' },
];

const TYPES_EVENEMENT_AFFAIRE = new Set([
  'affaire_creee', 'etape_changee', 'affaire_gagnee', 'affaire_perdue', 'affaire_en_pause', 'affaire_rouverte', 'encaissement',
]);

/** Fil d'historique : activités faites, notes et événements, du plus récent au plus ancien. */
export function entreesHistorique({ activites = [], notes = [], evenements = [] }, filtre = 'tous') {
  const entrees = [
    ...activites.filter((a) => a.fait).map((a) => ({ genre: 'activite', date: versDate(a.dateFait) ?? versDate(a.date), element: a })),
    ...notes.map((n) => ({ genre: 'note', date: versDate(n.creeLe), element: n })),
    ...evenements.map((e) => ({ genre: 'evenement', date: versDate(e.date), element: e })),
  ];
  const gardees = entrees.filter((e) => {
    if (filtre === 'activites') return e.genre === 'activite';
    if (filtre === 'notes') return e.genre === 'note';
    if (filtre === 'affaires') return e.genre === 'evenement' && TYPES_EVENEMENT_AFFAIRE.has(e.element.type);
    if (filtre === 'evenements') return e.genre === 'evenement';
    return true;
  });
  gardees.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  return gardees.slice(0, MAX_HISTORIQUE);
}

export function evenementCreation(type, texte, liens, ctx) {
  return evenement(type, texte, liens, ctx);
}

export function evenementEmailEnvoye(personne, ctx) {
  return evenement('email_envoye', `Email envoyé à ${personne.nom}`, { personneId: personne.id, organisationId: personne.organisationId }, ctx);
}

// ---------------------------------------------------------------- objectifs mensuels

function dansLeMois(valeur, mois) {
  return !!valeur && moisParis(valeur) === mois;
}

/** Chaque calcul reçoit { personnes, affaires, activites } et un mois "AAAA-MM". */
export const CALCULS = {
  interviews_jtbd: {
    libelle: 'Interviews JTBD réalisées',
    unite: '',
    calculer: ({ personnes = [] }, mois) => personnes.filter((p) => dansLeMois(p.dateInterviewJtbd, mois)).length,
  },
  nouveaux_contacts: {
    libelle: 'Nouveaux contacts',
    unite: '',
    calculer: ({ personnes = [] }, mois) => personnes.filter((p) => dansLeMois(p.creeLe, mois)).length,
  },
  rdv_tenus: {
    libelle: 'Rendez vous tenus',
    unite: '',
    calculer: ({ activites = [] }, mois) => activites.filter((a) => a.type === 'rendez_vous' && a.fait && dansLeMois(a.dateFait, mois)).length,
  },
  propositions_envoyees: {
    libelle: 'Propositions envoyées',
    unite: '',
    calculer: ({ affaires = [] }, mois) => affaires.filter((a) => dansLeMois(a.datesEtapes?.proposition_envoyee, mois)).length,
  },
  ca_encaisse: {
    libelle: "Chiffre d'affaires encaissé",
    unite: '€',
    calculer: ({ affaires = [] }, mois) => affaires.reduce(
      (s, a) => s + (a.encaissements || []).filter((e) => dansLeMois(e.date, mois)).reduce((t, e) => t + (Number(e.montant) || 0), 0),
      0,
    ),
  },
};

export const OBJECTIFS_DEPART = [
  { id: 'interviews_jtbd', libelle: 'Interviews JTBD réalisées', type: 'calcule', calcul: 'interviews_jtbd', cible: 10, unite: '', couleur: '#e3cdee', ordre: 1, actif: true },
  { id: 'nouveaux_contacts', libelle: 'Nouveaux contacts', type: 'calcule', calcul: 'nouveaux_contacts', cible: 10, unite: '', couleur: '#b98ee0', ordre: 2, actif: true },
  { id: 'rdv_tenus', libelle: 'Rendez vous tenus', type: 'calcule', calcul: 'rdv_tenus', cible: 4, unite: '', couleur: '#ecbc06', ordre: 3, actif: true },
  { id: 'propositions_envoyees', libelle: 'Propositions envoyées', type: 'calcule', calcul: 'propositions_envoyees', cible: 3, unite: '', couleur: '#fd6455', ordre: 4, actif: true },
  { id: 'ca_encaisse', libelle: "Chiffre d'affaires encaissé", type: 'calcule', calcul: 'ca_encaisse', cible: 1000, unite: '€', couleur: '#3fbf7f', ordre: 5, actif: true },
  { id: 'flyers', libelle: 'Flyers distribués', type: 'manuel', calcul: null, cible: 100, unite: '', couleur: '#ffe56c', ordre: 6, actif: true },
];

export function idSaisie(objectifId, mois) {
  return `${objectifId}_${mois}`;
}

export function valeurObjectif(objectif, { donnees = {}, saisies = [], mois }) {
  if (objectif.type === 'manuel') {
    const s = saisies.find((x) => x.objectifId === objectif.id && x.mois === mois);
    return Number(s?.valeur) || 0;
  }
  const c = CALCULS[objectif.calcul];
  return c ? c.calculer(donnees, mois) : 0;
}

export function progression(valeur, cible) {
  const c = Number(cible) || 0;
  if (c <= 0) return valeur > 0 ? 100 : 0;
  return Math.round((Number(valeur) / c) * 100);
}

/** Objectifs qui viennent de franchir 100 % (sous puis au dessus) entre deux relevés. */
export function objectifsFranchis(avant, apres, objectifs) {
  return objectifs.filter((o) => {
    if (!(o.id in avant) || !(o.id in apres)) return false;
    return progression(avant[o.id], o.cible) < 100 && progression(apres[o.id], o.cible) >= 100;
  });
}

export function objectifsActifsTries(objectifs) {
  return [...(objectifs || [])].filter((o) => o.actif !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

// ---------------------------------------------------------------- statistiques et graphique

export function compterParEtape(affaires) {
  return ETAPES.map((e) => ({ ...e, nombre: affaires.filter((a) => a.etape === e.id).length }));
}

/**
 * Mois du graphique du chiffre d'affaires : de max(début d'activité, mois courant - (n-1)) au mois courant.
 * Aucun mois antérieur au début d'activité n'apparaît jamais ; avant le début, un seul mois (le début).
 */
export function fenetreCa(debutActivite, moisActuel, n = 6) {
  const debut = /^\d{4}-\d{2}$/.test(debutActivite || '') ? debutActivite : moisActuel;
  const fin = moisActuel < debut ? debut : moisActuel;
  const plancher = decalerMois(fin, -(n - 1));
  let depart = debut > plancher ? debut : plancher;
  const mois = [];
  while (depart <= fin) {
    mois.push(depart);
    depart = decalerMois(depart, 1);
  }
  return mois;
}

export function caParMois(affaires, moisListe) {
  return moisListe.map((mois) => ({
    mois,
    libelle: libelleMois(mois, true),
    montant: CALCULS.ca_encaisse.calculer({ affaires }, mois),
  }));
}

/** Affaires passées en Facture payée pendant le mois (colonne du Kanban). */
export function payeesDuMois(affaires, mois) {
  return affaires.filter((a) => a.etape === 'facture_payee' && dansLeMois(a.datesEtapes?.facture_payee ?? a.dateEntreeEtape, mois));
}

export function totauxColonne(affaires) {
  return { nombre: affaires.length, montant: affaires.reduce((s, a) => s + (Number(a.montant) || 0), 0) };
}

// ---------------------------------------------------------------- filtres

export const CRITERES_PERSONNES_VIDES = Object.freeze({
  recherche: '', etiquettes: [], organisations: [], roles: [], sources: [], villes: [], jtbd: '', archives: false,
});
export const CRITERES_ORGANISATIONS_VIDES = Object.freeze({
  recherche: '', etiquettes: [], secteurs: [], villes: [], archives: false,
});
export const CRITERES_AFFAIRES_VIDES = Object.freeze({
  recherche: '', etapes: [], statuts: [], priorites: [], offres: [], sources: [], personnes: [], organisations: [],
  enRetard: false, sansAction: false, semaine: false, archives: false,
});

const VIDES = { personnes: CRITERES_PERSONNES_VIDES, organisations: CRITERES_ORGANISATIONS_VIDES, affaires: CRITERES_AFFAIRES_VIDES };

export function criteresComplets(liste, c = {}) {
  const base = VIDES[liste];
  const complet = {};
  for (const [cle, valeur] of Object.entries(base)) {
    complet[cle] = Array.isArray(valeur) ? [...(c[cle] || [])] : (c[cle] ?? valeur);
  }
  return complet;
}

export function criteresActifs(liste, c) {
  const complet = criteresComplets(liste, c);
  return Object.entries(complet).some(([, v]) => (Array.isArray(v) ? v.length : !!v));
}

const inter = (liste, valeur) => !liste.length || liste.includes(valeur);
const interAvec = (liste, valeurs) => !liste.length || (valeurs || []).some((v) => liste.includes(v));

function recherchePersonne(p, orgNom) {
  return normaliser([p.nom, orgNom, p.ville, ...(p.emails || []).map((e) => e.valeur), ...(p.telephones || []).map((t) => t.valeur)].join(' \u0001 '));
}

function correspond(botte, recherche) {
  const q = normaliser(recherche);
  return !q || q.split(/\s+/).every((mot) => botte.includes(mot));
}

export function filtrerPersonnes(personnes, criteres, { organisations = [] } = {}) {
  const c = criteresComplets('personnes', criteres);
  const orgs = new Map(organisations.map((o) => [o.id, o]));
  return personnes.filter((p) => {
    if (c.archives ? !estArchivee(p) : estArchivee(p)) return false;
    if (!correspond(recherchePersonne(p, orgs.get(p.organisationId)?.nom), c.recherche)) return false;
    if (!interAvec(c.etiquettes, p.etiquettes)) return false;
    if (!inter(c.organisations, p.organisationId)) return false;
    if (!interAvec(c.roles, p.roles)) return false;
    if (!inter(c.sources, p.source)) return false;
    if (!inter(c.villes, p.ville)) return false;
    if (c.jtbd === 'faite' && !p.dateInterviewJtbd) return false;
    if (c.jtbd === 'non_faite' && p.dateInterviewJtbd) return false;
    return true;
  });
}

export function filtrerOrganisations(organisations, criteres) {
  const c = criteresComplets('organisations', criteres);
  return organisations.filter((o) => {
    if (c.archives ? !estArchivee(o) : estArchivee(o)) return false;
    if (!correspond(normaliser([o.nom, o.ville, o.adresse].join(' \u0001 ')), c.recherche)) return false;
    if (!interAvec(c.etiquettes, o.etiquettes)) return false;
    if (!inter(c.secteurs, o.secteur)) return false;
    if (!inter(c.villes, o.ville)) return false;
    return true;
  });
}

/** contexte : { activites, personnes, organisations, aujourdhui } */
export function filtrerAffaires(affaires, criteres, { activites = [], personnes = [], organisations = [], aujourdhui } = {}) {
  const c = criteresComplets('affaires', criteres);
  const pers = new Map(personnes.map((p) => [p.id, p]));
  const orgs = new Map(organisations.map((o) => [o.id, o]));
  const dimanche = aujourdhui ? dimancheDeLaSemaine(aujourdhui) : null;
  return affaires.filter((a) => {
    if (c.archives ? !estArchivee(a) : estArchivee(a)) return false;
    const botte = normaliser([a.titre, pers.get(a.personneId)?.nom, orgs.get(a.organisationId)?.nom].join(' \u0001 '));
    if (!correspond(botte, c.recherche)) return false;
    if (!inter(c.etapes, a.etape)) return false;
    if (!inter(c.statuts, a.statut)) return false;
    if (!inter(c.priorites, a.priorite)) return false;
    if (!inter(c.offres, a.offreId)) return false;
    if (!inter(c.sources, a.source)) return false;
    if (!inter(c.personnes, a.personneId)) return false;
    if (!inter(c.organisations, a.organisationId)) return false;
    const siennes = activitesAVenir(activitesDeAffaire(activites, a.id));
    if (c.enRetard && !(aujourdhui && siennes.some((x) => estActiviteEnRetard(x, aujourdhui)))) return false;
    if (c.sansAction && !(estAffaireActive(a) && !siennes.length)) return false;
    if (c.semaine && !(dimanche && estAffaireActive(a) && siennes.some((x) => x.date <= dimanche))) return false;
    return true;
  });
}

export function pastillesFiltres(liste, criteres, { offres = [], etiquettes = [], personnes = [], organisations = [] } = {}) {
  const c = criteresComplets(liste, criteres);
  const p = [];
  const nomPersonne = (id) => personnes.find((x) => x.id === id)?.nom ?? id;
  const nomOrg = (id) => organisations.find((x) => x.id === id)?.nom ?? id;
  if (c.recherche) p.push({ cle: 'recherche', valeur: c.recherche, libelle: `Recherche : ${c.recherche}` });
  (c.etiquettes || []).forEach((v) => p.push({ cle: 'etiquettes', valeur: v, libelle: `Étiquette : ${libelleEtiquette(etiquettes, v)}` }));
  (c.organisations || []).forEach((v) => p.push({ cle: 'organisations', valeur: v, libelle: `Organisation : ${nomOrg(v)}` }));
  (c.roles || []).forEach((v) => p.push({ cle: 'roles', valeur: v, libelle: `Rôle : ${libelleRole(v)}` }));
  (c.sources || []).forEach((v) => p.push({ cle: 'sources', valeur: v, libelle: `Source : ${v}` }));
  (c.secteurs || []).forEach((v) => p.push({ cle: 'secteurs', valeur: v, libelle: `Secteur : ${v}` }));
  (c.villes || []).forEach((v) => p.push({ cle: 'villes', valeur: v, libelle: `Ville : ${v}` }));
  (c.etapes || []).forEach((v) => p.push({ cle: 'etapes', valeur: v, libelle: `Étape : ${libelleEtape(v)}` }));
  (c.statuts || []).forEach((v) => p.push({ cle: 'statuts', valeur: v, libelle: `Statut : ${libelleStatut(v)}` }));
  (c.priorites || []).forEach((v) => p.push({ cle: 'priorites', valeur: v, libelle: `Priorité : ${libellePriorite(v)}` }));
  (c.offres || []).forEach((v) => p.push({ cle: 'offres', valeur: v, libelle: `Offre : ${libelleOffre(offres, v)}` }));
  (c.personnes || []).forEach((v) => p.push({ cle: 'personnes', valeur: v, libelle: `Personne : ${nomPersonne(v)}` }));
  if (c.jtbd === 'faite') p.push({ cle: 'jtbd', valeur: 'faite', libelle: 'Interview JTBD faite' });
  if (c.jtbd === 'non_faite') p.push({ cle: 'jtbd', valeur: 'non_faite', libelle: 'Interview JTBD à faire' });
  if (c.enRetard) p.push({ cle: 'enRetard', valeur: true, libelle: 'En retard' });
  if (c.sansAction) p.push({ cle: 'sansAction', valeur: true, libelle: 'Sans action prévue' });
  if (c.semaine) p.push({ cle: 'semaine', valeur: true, libelle: 'À relancer cette semaine' });
  if (c.archives) p.push({ cle: 'archives', valeur: true, libelle: 'Archivées' });
  return p;
}

/** Retire une pastille des critères. */
export function retirerCritere(liste, criteres, cle, valeur) {
  const c = criteresComplets(liste, criteres);
  if (Array.isArray(c[cle])) c[cle] = c[cle].filter((v) => v !== valeur);
  else c[cle] = VIDES[liste][cle];
  return c;
}

// ---------------------------------------------------------------- tri des listes

export function trier(lignes, cle, sens = 'asc') {
  const s = sens === 'desc' ? -1 : 1;
  return [...lignes].sort((a, b) => {
    const va = cle(a);
    const vb = cle(b);
    const videA = va === null || va === '' || va === undefined;
    const videB = vb === null || vb === '' || vb === undefined;
    if (videA && videB) return 0;
    if (videA) return 1; // les valeurs vides toujours à la fin
    if (videB) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * s;
    return String(va).localeCompare(String(vb), 'fr') * s;
  });
}

// ---------------------------------------------------------------- intégrité des liens

export function affairesDeLaPersonne(affaires, personneId) {
  return (affaires || []).filter((a) => a.personneId === personneId);
}

export function personnesDeLOrganisation(personnes, organisationId) {
  return (personnes || []).filter((p) => p.organisationId === organisationId);
}

/** Suppression d'une organisation : refusée tant qu'elle a des personnes ou des affaires. */
export function verifierSuppressionOrganisation(organisationId, { personnes = [], affaires = [] }) {
  const np = personnesDeLOrganisation(personnes, organisationId).length;
  const na = (affaires || []).filter((a) => a.organisationId === organisationId).length;
  if (!np && !na) return { ok: true, personnes: 0, affaires: 0, raison: '' };
  const morceaux = [];
  if (np) morceaux.push(`${np} personne${np > 1 ? 's' : ''}`);
  if (na) morceaux.push(`${na} affaire${na > 1 ? 's' : ''}`);
  return {
    ok: false,
    personnes: np,
    affaires: na,
    raison: `Cette organisation a encore ${morceaux.join(' et ')}. Archive-la, ou détache d'abord ses personnes et ses affaires.`,
  };
}

/**
 * Suppression d'une personne. choix : "affaires" (supprime aussi ses affaires et leurs activités, notes
 * et événements) ou "conserver" (les affaires restent, rattachées à leur organisation seule).
 * Renvoie ce que donnees.js doit faire : { supprimerAffaires, detacherAffaires }.
 */
export function planSuppressionPersonne(personneId, affaires, choix) {
  const siennes = affairesDeLaPersonne(affaires, personneId);
  if (!siennes.length) return { supprimerAffaires: [], detacherAffaires: [] };
  if (choix === 'affaires') return { supprimerAffaires: siennes.map((a) => a.id), detacherAffaires: [] };
  if (choix === 'conserver') return { supprimerAffaires: [], detacherAffaires: siennes.map((a) => a.id) };
  throw new Error('Choisis ce que deviennent ses affaires.');
}

/** Confirmation de suppression définitive : le nom tapé est comparé sans accents ni casse. */
export function confirmationValide(saisie, nom) {
  const n = normaliserNom(nom);
  return n !== '' && normaliserNom(saisie) === n;
}

// ---------------------------------------------------------------- export JSON et CSV

export function echapperCsv(valeur) {
  const s = String(valeur ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** colonnes : [[libelle, (ligne) => valeur]]. UTF 8 avec BOM, séparateur point virgule, fins de ligne CRLF. */
export function versCsv(colonnes, lignes) {
  const sortie = [colonnes.map(([libelle]) => echapperCsv(libelle)).join(';')];
  for (const l of lignes) sortie.push(colonnes.map(([, f]) => echapperCsv(f(l))).join(';'));
  return `\ufeff${sortie.join('\r\n')}\r\n`;
}

function nombreFr(n) {
  if (n === null || n === undefined || n === '') return '';
  return String(n).replace('.', ',');
}

const oui = (v) => (v ? 'Oui' : 'Non');

export function csvPersonnes(personnes, { organisations = [], etiquettes = [] } = {}) {
  const orgs = new Map(organisations.map((o) => [o.id, o.nom]));
  return versCsv([
    ['Identifiant', (p) => p.id],
    ['Nom', (p) => p.nom],
    ['Prénom', (p) => p.prenom],
    ['Nom de famille', (p) => p.nomFamille],
    ['Organisation', (p) => orgs.get(p.organisationId) ?? ''],
    ['Emails', (p) => (p.emails || []).map((e) => `${e.valeur} (${libelleTypeContact(e.type)})`).join('\n')],
    ['Téléphones', (p) => (p.telephones || []).map((t) => `${t.valeur} (${libelleTypeContact(t.type)})`).join('\n')],
    ['Étiquettes', (p) => (p.etiquettes || []).map((id) => libelleEtiquette(etiquettes, id)).join(', ')],
    ['Rôles', (p) => (p.roles || []).map(libelleRole).join(', ')],
    ["Interview JTBD faite le", (p) => formatJour(p.dateInterviewJtbd)],
    ['Ville', (p) => p.ville],
    ['LinkedIn', (p) => p.linkedin],
    ['Site web', (p) => p.siteWeb],
    ['Source', (p) => p.source],
    ['Opposition à la prospection', (p) => oui(p.oppositionProspection)],
    ['Archivé', (p) => oui(p.archive)],
    ['Propriétaire', (p) => p.proprietaire],
    ['Créé le', (p) => formatDateHeure(p.creeLe)],
  ], personnes);
}

export function csvOrganisations(organisations, { etiquettes = [], personnes = [] } = {}) {
  return versCsv([
    ['Identifiant', (o) => o.id],
    ['Nom', (o) => o.nom],
    ['Adresse', (o) => o.adresse],
    ['Ville', (o) => o.ville],
    ['Site web', (o) => o.siteWeb],
    ['Secteur', (o) => o.secteur],
    ['Taille', (o) => o.taille],
    ['Étiquettes', (o) => (o.etiquettes || []).map((id) => libelleEtiquette(etiquettes, id)).join(', ')],
    ['Personnes', (o) => personnesDeLOrganisation(personnes, o.id).length],
    ['Archivé', (o) => oui(o.archive)],
    ['Propriétaire', (o) => o.proprietaire],
    ['Créé le', (o) => formatDateHeure(o.creeLe)],
  ], organisations);
}

export function csvAffaires(affaires, { personnes = [], organisations = [], offres = [] } = {}) {
  const pers = new Map(personnes.map((p) => [p.id, p.nom]));
  const orgs = new Map(organisations.map((o) => [o.id, o.nom]));
  return versCsv([
    ['Identifiant', (a) => a.id],
    ['Titre', (a) => a.titre],
    ['Personne', (a) => pers.get(a.personneId) ?? ''],
    ['Organisation', (a) => orgs.get(a.organisationId) ?? ''],
    ['Étape', (a) => libelleEtape(a.etape)],
    ['Statut', (a) => libelleStatut(a.statut)],
    ['Priorité', (a) => libellePriorite(a.priorite)],
    ['Montant (€)', (a) => nombreFr(a.montant)],
    ['Offre', (a) => libelleOffre(offres, a.offreId)],
    ['Durée (jours)', (a) => nombreFr(a.dureeJours)],
    ['Source', (a) => a.source],
    ['Besoin identifié', (a) => a.besoin],
    ['Raison si perdue', (a) => a.raisonPerdue],
    ['Date de réveil', (a) => formatJour(a.dateReveil)],
    ['Encaissements', (a) => (a.encaissements || []).map((e) => `${formatDateHeure(e.date)} : ${nombreFr(e.montant)} €`).join('\n')],
    ['Documents', (a) => (a.documents || []).map((d) => `${d.libelle} : ${d.url}`).join('\n')],
    ['Archivé', (a) => oui(a.archive)],
    ['Propriétaire', (a) => a.proprietaire],
    ['Créé le', (a) => formatDateHeure(a.creeLe)],
  ], affaires);
}

function versSerialisable(v) {
  if (v === null || v === undefined) return null;
  const d = typeof v === 'object' && !Array.isArray(v) ? versDateStricte(v) : null;
  if (d) return d.toISOString();
  if (Array.isArray(v)) return v.map(versSerialisable);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versSerialisable(x)]));
  return v;
}

function versDateStricte(v) {
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number' && 'nanoseconds' in v) return versDate(v);
  return null;
}

/** Sauvegarde complète : { version, exporteLe, collections: { nom: [documents avec id] } }, en texte JSON. */
export function exportJson(collections, maintenant = new Date()) {
  const sortie = {};
  for (const [nom, docs] of Object.entries(collections)) sortie[nom] = (docs || []).map((d) => versSerialisable(d));
  return JSON.stringify({ version: VERSION_EXPORT, exporteLe: maintenant.toISOString(), collections: sortie }, null, 2);
}

export function nomFichierExport(maintenant = new Date(), type = 'complet') {
  const jour = aujourdhuiParis(maintenant);
  const bases = {
    complet: ['chevalier-ia-os', 'json'],
    personnes: ['chevalier-ia-personnes', 'csv'],
    organisations: ['chevalier-ia-organisations', 'csv'],
    affaires: ['chevalier-ia-affaires', 'csv'],
  };
  const [base, ext] = bases[type] || bases.complet;
  return `${base}-${jour}.${ext}`;
}

/** Rappel d'export : affiché si aucun export, ou si le dernier date de plus de 30 jours. */
export function rappelExportVisible(dernierExport, maintenant = new Date()) {
  const d = versDate(dernierExport);
  if (!d) return true;
  return maintenant.getTime() - d.getTime() > JOURS_RAPPEL_EXPORT * 86400000;
}
