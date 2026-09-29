// Règles métier pures du module CRM : aucune dépendance à Firebase ni au navigateur.
// Conventions :
//  - les champs "date" (datePremierContact, dateProchaineAction, dateInterviewJtbd, dateReveil)
//    sont des chaînes "AAAA-MM-JJ" (jour civil, sans fuseau) ;
//  - dateRdv est une chaîne "AAAA-MM-JJTHH:MM" (heure de Paris) ;
//  - les champs "timestamp" sont des Timestamp Firestore (ou des Date côté tests) :
//    versDate() sait lire les deux.

export const FUSEAU = 'Europe/Paris';
export const MAX_HISTORIQUE = 200;
export const JOURS_RAPPEL_EXPORT = 30;

// ---------------------------------------------------------------- référentiels

export const ETAPES = [
  { id: 'premier_contact', libelle: 'Premier contact', couleur: '#b9adc9' },
  { id: 'rdv_fixe', libelle: 'Rendez vous fixé', couleur: '#e3cdee' },
  { id: 'proposition_envoyee', libelle: 'Proposition envoyée', couleur: '#b98ee0' },
  { id: 'gagne', libelle: 'Gagné', couleur: '#ecbc06' },
  { id: 'facture_envoyee', libelle: 'Facture envoyée', couleur: '#fd6455' },
  { id: 'facture_payee', libelle: 'Facture payée', couleur: '#3fbf7f' },
];

export const SORTIES = [
  { id: 'perdu', libelle: 'Perdu', couleur: '#8d8993' },
  { id: 'pas_maintenant', libelle: 'Pas maintenant', couleur: '#8a9bb4' },
];

export const TOUTES_ETAPES = [...ETAPES, ...SORTIES];

export const ROLES = [
  { id: 'prospect', libelle: 'Prospect' },
  { id: 'partenaire', libelle: 'Partenaire' },
  { id: 'interview_jtbd', libelle: 'Interviewé JTBD' },
];

export const TAILLES = ['Solo', '2 à 10', '11 à 50', 'Plus de 50'];

export const PRIORITES = [
  { id: 'chaud', libelle: 'Chaud' },
  { id: 'tiede', libelle: 'Tiède' },
  { id: 'froid', libelle: 'Froid' },
];

export const RAISONS_PERDU = ['Prix', 'Pas le moment', 'Pas de besoin', 'Concurrent', 'Sans réponse', 'Autre'];

export const SECTEURS_DEPART = ['Commerce local', 'Artisanat', 'Services', 'Bien être', 'Conseil', 'Associatif', 'Autre'];
export const SOURCES_DEPART = [
  'Réseau personnel', 'Réseau entrepreneuses', 'Commerçant local', 'LinkedIn',
  'Recommandation', 'Événement', 'Flyer', 'Autre',
];
export const OFFRES_DEPART = [
  { id: 'audit', nom: 'Audit', actif: true, ordre: 1 },
  { id: 'accompagnement', nom: 'Accompagnement', actif: true, ordre: 2 },
];
export const REGLAGES_DEPART = { delaiPaiementJours: 30, dernierExport: null };

export const FILTRES_DEPART = [
  { id: 'relancer_semaine', nom: 'À relancer cette semaine', criteres: { semaine: true }, ordre: 1 },
  { id: 'chauds', nom: 'Chauds', criteres: { priorites: ['chaud'] }, ordre: 2 },
  { id: 'reseau_entrepreneuses', nom: 'Réseau entrepreneuses', criteres: { sources: ['Réseau entrepreneuses'] }, ordre: 3 },
  { id: 'jtbd_a_faire', nom: 'Interviews JTBD à faire', criteres: { roles: ['interview_jtbd'], jtbd: 'non_faite' }, ordre: 4 },
];

export const DATES_RAPIDES = [
  { id: 'demain', libelle: 'Demain', jours: 1 },
  { id: '3j', libelle: '+3 jours', jours: 3 },
  { id: '1sem', libelle: '+1 semaine', jours: 7 },
  { id: '2sem', libelle: '+2 semaines', jours: 14 },
];

export function libelleEtape(id) {
  return TOUTES_ETAPES.find((e) => e.id === id)?.libelle ?? id ?? '';
}
export function couleurEtape(id) {
  return TOUTES_ETAPES.find((e) => e.id === id)?.couleur ?? '#8d8993';
}
export function libelleRole(id) {
  return ROLES.find((r) => r.id === id)?.libelle ?? id;
}
export function libellePriorite(id) {
  return PRIORITES.find((p) => p.id === id)?.libelle ?? id ?? '';
}
export function libelleOffre(offres, id) {
  if (!id) return '';
  const o = (offres || []).find((x) => x.id === id);
  return o ? o.nom : id;
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

export function formatRdv(texte) {
  if (!texte) return '';
  const [jour, heure] = texte.split('T');
  return heure ? `${formatJour(jour)} à ${heure.replace(':', ' h ')}` : formatJour(jour);
}

export function formatEuros(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
  }).format(v).replace(/ | /g, ' ');
}

export function formatNombre(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n) || 0).replace(/ | /g, ' ');
}

// ---------------------------------------------------------------- statuts et alertes

export function estArchivee(f) {
  return f.archive === true;
}

/** Ni archivée, ni perdue, ni pas maintenant. */
export function estActive(f) {
  return !estArchivee(f) && f.etape !== 'perdu' && f.etape !== 'pas_maintenant';
}

/** En retard : date de prochaine action passée, fiche ni archivée ni perdue. */
export function estEnRetard(f, aujourdhui) {
  if (!f.dateProchaineAction) return false;
  if (estArchivee(f) || f.etape === 'perdu') return false;
  return f.dateProchaineAction < aujourdhui;
}

/** Sans action prévue : fiche active sans date de prochaine action. */
export function estSansAction(f) {
  return estActive(f) && !f.dateProchaineAction;
}

export function estAReveiller(f, aujourdhui) {
  return f.etape === 'pas_maintenant' && !estArchivee(f) && !!f.dateReveil && f.dateReveil <= aujourdhui;
}

export function emailActif(f) {
  return !!(f.email && String(f.email).trim()) && !f.oppositionProspection;
}

function trierParDateEtNom(a, b) {
  return (a.date || '').localeCompare(b.date || '') || (a.fiche.nom || '').localeCompare(b.fiche.nom || '', 'fr');
}

/** Bloc "À faire" de l'Accueil : En retard, Aujourd'hui, Sans action prévue. */
export function aFaire(fiches, aujourdhui) {
  const enRetard = [];
  const duJour = [];
  const sansAction = [];
  for (const f of fiches) {
    if (estEnRetard(f, aujourdhui)) {
      enRetard.push({ fiche: f, action: f.prochaineAction || 'Action sans intitulé', date: f.dateProchaineAction, type: 'action' });
    } else if (f.dateProchaineAction === aujourdhui && !estArchivee(f) && f.etape !== 'perdu') {
      duJour.push({ fiche: f, action: f.prochaineAction || 'Action sans intitulé', date: f.dateProchaineAction, type: 'action' });
    }
    if (estAReveiller(f, aujourdhui) && !estEnRetard(f, aujourdhui) && f.dateProchaineAction !== aujourdhui) {
      duJour.push({ fiche: f, action: 'Reprendre contact', date: f.dateReveil, type: 'reveil' });
    }
    if (estSansAction(f)) sansAction.push(f);
  }
  enRetard.sort(trierParDateEtNom);
  duJour.sort(trierParDateEtNom);
  sansAction.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
  return { enRetard, aujourdhui: duJour, sansAction };
}

// ---------------------------------------------------------------- suggestions douces

/** Suggestion proposée à l'entrée dans une étape, ou null. */
export function suggestionPourEtape(etape, aujourdhui, delaiPaiementJours = 30) {
  switch (etape) {
    case 'proposition_envoyee':
      return { action: 'Relancer la proposition', date: ajouterJours(aujourdhui, 3) };
    case 'gagne':
      return { action: 'Envoyer la facture', date: aujourdhui };
    case 'facture_envoyee':
      return { action: 'Vérifier le paiement', date: ajouterJours(aujourdhui, Number(delaiPaiementJours) || 30) };
    default:
      return null;
  }
}

// ---------------------------------------------------------------- écritures (patchs purs)

export function ajouterHistorique(historique, entree) {
  const h = [...(historique || []), entree];
  return h.length > MAX_HISTORIQUE ? h.slice(h.length - MAX_HISTORIQUE) : h;
}

function entree(ctx, type, texte) {
  return { date: ctx.maintenant, auteur: ctx.auteur || '', type, texte };
}

export function idAleatoire() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Document complet d'une nouvelle fiche (sans creeLe/modifieLe, posés par la couche données). */
export function nouvelleFiche(valeurs, ctx) {
  const aujourdhui = ctx.aujourdhui || aujourdhuiParis(ctx.maintenant);
  const etape = valeurs.etape || 'premier_contact';
  return {
    nom: (valeurs.nom || '').trim(),
    entreprise: valeurs.entreprise || '',
    roles: valeurs.roles && valeurs.roles.length ? [...valeurs.roles] : ['prospect'],
    dateInterviewJtbd: valeurs.dateInterviewJtbd || null,
    secteur: valeurs.secteur || '',
    taille: valeurs.taille || '',
    ville: valeurs.ville || '',
    telephone: valeurs.telephone || '',
    email: (valeurs.email || '').trim(),
    siteWeb: valeurs.siteWeb || '',
    linkedin: valeurs.linkedin || '',
    source: valeurs.source || '',
    etape,
    dateEntreeEtape: ctx.maintenant,
    datesEtapes: { [etape]: ctx.maintenant },
    priorite: valeurs.priorite || 'tiede',
    besoin: valeurs.besoin || '',
    offreId: valeurs.offreId || null,
    dureeJours: valeurs.dureeJours ?? null,
    montant: valeurs.montant ?? null,
    datePremierContact: valeurs.datePremierContact || aujourdhui,
    dateDernierEchange: ctx.maintenant,
    prochaineAction: valeurs.prochaineAction || '',
    dateProchaineAction: valeurs.dateProchaineAction || null,
    dateRdv: valeurs.dateRdv || null,
    rdvTenu: false,
    dateRdvTenu: null,
    notes: valeurs.notes || '',
    notesRapides: [],
    historique: [],
    documents: [],
    raisonPerdu: null,
    raisonPerduDetail: null,
    dateReveil: null,
    encaissements: [],
    oppositionProspection: false,
    dateOpposition: null,
    archive: false,
    creePar: ctx.auteur || '',
    modifiePar: ctx.auteur || '',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValide(email) {
  return !email || EMAIL_RE.test(String(email).trim());
}

/** Contrôle des champs obligatoires. Renvoie { champ: message } (vide si tout va bien). */
export function validerFiche(v) {
  const erreurs = {};
  if (!v.nom || !String(v.nom).trim()) erreurs.nom = 'Le prénom et le nom sont obligatoires.';
  if (!v.roles || v.roles.length === 0) erreurs.roles = 'Choisis au moins un rôle.';
  if (!v.source) erreurs.source = 'La source est obligatoire.';
  if (!v.etape) erreurs.etape = "L'étape est obligatoire.";
  if (!v.priorite) erreurs.priorite = 'La priorité est obligatoire.';
  if (!v.datePremierContact) erreurs.datePremierContact = 'La date du premier contact est obligatoire.';
  if (!emailValide(v.email)) erreurs.email = "L'adresse email n'est pas valide.";
  if (v.etape === 'perdu' && !v.raisonPerdu) erreurs.raisonPerdu = 'Indique la raison de la perte.';
  if (v.etape === 'pas_maintenant' && !v.dateReveil) erreurs.dateReveil = 'Indique une date de réveil.';
  return erreurs;
}

/** Contrôle avant changement d'étape (raison si perdu, date de réveil si pas maintenant). */
export function validerChangementEtape(etape, options = {}) {
  if (!TOUTES_ETAPES.some((e) => e.id === etape)) return 'Étape inconnue.';
  if (etape === 'perdu' && !options.raisonPerdu) return 'Indique la raison de la perte.';
  if (etape === 'pas_maintenant' && !options.dateReveil) return 'Indique une date de réveil.';
  return null;
}

/**
 * Patch appliqué lors d'un changement d'étape.
 * options : raisonPerdu, raisonPerduDetail, dateReveil, montantEncaisse.
 */
export function changementEtape(fiche, etape, ctx, options = {}) {
  if (!fiche || fiche.etape === etape) return null;
  const erreur = validerChangementEtape(etape, options);
  if (erreur) throw new Error(erreur);
  const datesEtapes = { ...(fiche.datesEtapes || {}) };
  if (!datesEtapes[etape]) datesEtapes[etape] = ctx.maintenant;
  let historique = ajouterHistorique(
    fiche.historique,
    entree(ctx, 'etape', `Étape : ${libelleEtape(fiche.etape)} → ${libelleEtape(etape)}`),
  );
  const patch = {
    etape,
    dateEntreeEtape: ctx.maintenant,
    datesEtapes,
    dateDernierEchange: ctx.maintenant,
    archive: etape === 'facture_payee',
  };
  if (etape === 'perdu') {
    patch.raisonPerdu = options.raisonPerdu;
    patch.raisonPerduDetail = options.raisonPerduDetail || null;
  }
  if (etape === 'pas_maintenant') patch.dateReveil = options.dateReveil;
  if (etape === 'facture_payee') {
    const montant = Number(options.montantEncaisse ?? fiche.montant ?? 0) || 0;
    patch.encaissements = [
      ...(fiche.encaissements || []),
      { date: ctx.maintenant, montant, offreId: fiche.offreId || null },
    ];
    historique = ajouterHistorique(historique, entree(ctx, 'encaissement', `Encaissement : ${formatEuros(montant)}`));
  }
  patch.historique = historique;
  return patch;
}

/** "Nouvelle affaire" sur une fiche archivée ou perdue. */
export function nouvelleAffaire(fiche, ctx) {
  return {
    etape: 'premier_contact',
    dateEntreeEtape: ctx.maintenant,
    datesEtapes: { premier_contact: ctx.maintenant },
    archive: false,
    offreId: null,
    dureeJours: null,
    montant: null,
    prochaineAction: '',
    dateProchaineAction: null,
    dateRdv: null,
    rdvTenu: false,
    dateRdvTenu: null,
    raisonPerdu: null,
    raisonPerduDetail: null,
    dateReveil: null,
    dateDernierEchange: ctx.maintenant,
    historique: ajouterHistorique(fiche.historique, entree(ctx, 'nouvelle_affaire', 'Nouvelle affaire')),
    // notes, notesRapides, encaissements : conservés (non modifiés).
  };
}

export function peutDemarrerNouvelleAffaire(fiche) {
  return estArchivee(fiche) || fiche.etape === 'perdu';
}

export function fixerAction(texte, date) {
  return { prochaineAction: (texte || '').trim(), dateProchaineAction: date || null };
}

/** Bouton "Fait" : vide l'action, historise, met à jour le dernier échange. */
export function actionFaite(fiche, ctx, { reprise = false } = {}) {
  const texte = reprise ? 'Reprendre contact' : (fiche.prochaineAction || 'Action');
  const patch = {
    prochaineAction: '',
    dateProchaineAction: null,
    dateDernierEchange: ctx.maintenant,
  };
  let historique = ajouterHistorique(fiche.historique, entree(ctx, 'action_faite', `Action faite : ${texte}`));
  if (reprise && fiche.etape === 'pas_maintenant') {
    const p = changementEtape({ ...fiche, historique }, 'premier_contact', ctx);
    Object.assign(patch, p, { dateReveil: null });
    historique = p.historique;
  }
  patch.historique = historique;
  return patch;
}

export function emailEnvoye(fiche, ctx) {
  return {
    dateDernierEchange: ctx.maintenant,
    historique: ajouterHistorique(fiche.historique, entree(ctx, 'email', 'Email envoyé')),
  };
}

export function marquerRdvTenu(fiche, coche, ctx) {
  if (!coche) return { rdvTenu: false, dateRdvTenu: null };
  const dateRdv = fiche.dateRdv ? dateHeureParisVersDate(fiche.dateRdv) || versDate(fiche.dateRdv) : null;
  return {
    rdvTenu: true,
    dateRdvTenu: dateRdv || ctx.maintenant,
    dateDernierEchange: ctx.maintenant,
    historique: ajouterHistorique(fiche.historique, entree(ctx, 'rdv', 'Rendez vous tenu')),
  };
}

export function ajouterNoteRapide(fiche, texte, ctx) {
  const t = (texte || '').trim();
  if (!t) return null;
  return {
    notesRapides: [...(fiche.notesRapides || []), { id: ctx.id || idAleatoire(), texte: t, date: ctx.maintenant, auteur: ctx.auteur || '' }],
    dateDernierEchange: ctx.maintenant,
  };
}

export function supprimerNoteRapide(fiche, id) {
  return { notesRapides: (fiche.notesRapides || []).filter((n) => n.id !== id) };
}

/** "Copier dans Notes" : action explicite de l'utilisateur, ajoute la note à la fin des Notes. */
export function copierNoteDansNotes(fiche, id) {
  const n = (fiche.notesRapides || []).find((x) => x.id === id);
  if (!n) return null;
  const notes = fiche.notes || '';
  return { notes: notes ? `${notes.replace(/\s+$/, '')}\n\n${n.texte}` : n.texte };
}

export function ajouterDocument(fiche, libelle, url) {
  const u = (url || '').trim();
  if (!u) return null;
  return { documents: [...(fiche.documents || []), { libelle: (libelle || '').trim() || u, url: u }] };
}

export function supprimerDocument(fiche, index) {
  return { documents: (fiche.documents || []).filter((_, i) => i !== index) };
}

export function marquerOpposition(coche, ctx) {
  return { oppositionProspection: !!coche, dateOpposition: coche ? ctx.maintenant : null };
}

// ---------------------------------------------------------------- objectifs

export const CALCULS = {
  interviews_jtbd: {
    libelle: 'Interviews JTBD réalisées',
    unite: '',
    calculer: (fiches, mois) => fiches.filter((f) => f.dateInterviewJtbd && moisParis(f.dateInterviewJtbd) === mois).length,
  },
  nouveaux_contacts: {
    libelle: 'Nouveaux contacts',
    unite: '',
    calculer: (fiches, mois) => fiches.filter((f) => f.creeLe && moisParis(f.creeLe) === mois).length,
  },
  rdv_tenus: {
    libelle: 'Rendez vous tenus',
    unite: '',
    calculer: (fiches, mois) => fiches.filter((f) => f.rdvTenu && f.dateRdvTenu && moisParis(f.dateRdvTenu) === mois).length,
  },
  propositions_envoyees: {
    libelle: 'Propositions envoyées',
    unite: '',
    calculer: (fiches, mois) => fiches.filter((f) => f.datesEtapes?.proposition_envoyee && moisParis(f.datesEtapes.proposition_envoyee) === mois).length,
  },
  ca_encaisse: {
    libelle: "Chiffre d'affaires encaissé",
    unite: '€',
    calculer: (fiches, mois) => fiches.reduce(
      (s, f) => s + (f.encaissements || []).filter((e) => moisParis(e.date) === mois).reduce((t, e) => t + (Number(e.montant) || 0), 0),
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

export function valeurObjectif(objectif, { fiches = [], saisies = [], mois }) {
  if (objectif.type === 'manuel') {
    const s = saisies.find((x) => x.objectifId === objectif.id && x.mois === mois);
    return Number(s?.valeur) || 0;
  }
  const c = CALCULS[objectif.calcul];
  return c ? c.calculer(fiches, mois) : 0;
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

// ---------------------------------------------------------------- statistiques

export function compterParEtape(fiches) {
  return TOUTES_ETAPES.map((e) => ({ ...e, nombre: fiches.filter((f) => f.etape === e.id).length }));
}

export function caParMois(fiches, moisFin, n = 6) {
  const liste = [];
  for (let i = n - 1; i >= 0; i--) {
    const mois = decalerMois(moisFin, -i);
    liste.push({ mois, libelle: libelleMois(mois, true), montant: CALCULS.ca_encaisse.calculer(fiches, mois) });
  }
  return liste;
}

/** Fiches passées en Facture payée pendant le mois (colonne du Kanban). */
export function payeesDuMois(fiches, mois) {
  return fiches.filter((f) => f.etape === 'facture_payee' && moisParis(f.dateEntreeEtape) === mois);
}

// ---------------------------------------------------------------- recherche et filtres

export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function correspondRecherche(f, recherche) {
  const q = normaliser(recherche);
  if (!q) return true;
  const botte = normaliser([
    f.nom, f.entreprise, f.ville, f.notes,
    ...(f.notesRapides || []).map((n) => n.texte),
  ].join(' \u0001 '));
  return q.split(/\s+/).every((mot) => botte.includes(mot));
}

export const CRITERES_VIDES = Object.freeze({
  recherche: '',
  etapes: [], roles: [], sources: [], secteurs: [], villes: [], priorites: [], offres: [],
  enRetard: false, sansAction: false, jtbd: null, archives: false, semaine: false,
});

export function criteresComplets(c = {}) {
  return {
    ...CRITERES_VIDES,
    ...c,
    etapes: [...(c.etapes || [])],
    roles: [...(c.roles || [])],
    sources: [...(c.sources || [])],
    secteurs: [...(c.secteurs || [])],
    villes: [...(c.villes || [])],
    priorites: [...(c.priorites || [])],
    offres: [...(c.offres || [])],
  };
}

/** Critères enregistrables (sans la recherche, sans les valeurs vides). */
export function criteresAEnregistrer(c) {
  const complet = criteresComplets(c);
  const res = {};
  for (const [cle, valeur] of Object.entries(complet)) {
    if (cle === 'recherche') continue;
    if (Array.isArray(valeur) ? valeur.length : valeur) res[cle] = valeur;
  }
  return res;
}

export function filtreEstVide(c) {
  return Object.keys(criteresAEnregistrer(c)).length === 0 && !normaliser(c?.recherche);
}

/** Applique des critères combinables (ET entre critères, OU entre valeurs d'un même critère). */
export function filtrer(fiches, criteres, { aujourdhui }) {
  const c = criteresComplets(criteres);
  const dimanche = aujourdhui ? dimancheDeLaSemaine(aujourdhui) : null;
  const villes = c.villes.map(normaliser);
  return fiches.filter((f) => {
    if (c.archives ? !estArchivee(f) : estArchivee(f)) return false;
    if (c.etapes.length && !c.etapes.includes(f.etape)) return false;
    if (c.roles.length && !(f.roles || []).some((r) => c.roles.includes(r))) return false;
    if (c.sources.length && !c.sources.includes(f.source)) return false;
    if (c.secteurs.length && !c.secteurs.includes(f.secteur)) return false;
    if (villes.length && !villes.includes(normaliser(f.ville))) return false;
    if (c.priorites.length && !c.priorites.includes(f.priorite)) return false;
    if (c.offres.length && !c.offres.includes(f.offreId)) return false;
    if (c.enRetard && !estEnRetard(f, aujourdhui)) return false;
    if (c.sansAction && !estSansAction(f)) return false;
    if (c.jtbd === 'faite' && !f.dateInterviewJtbd) return false;
    if (c.jtbd === 'non_faite' && f.dateInterviewJtbd) return false;
    if (c.semaine) {
      if (!f.dateProchaineAction || f.etape === 'perdu') return false;
      if (f.dateProchaineAction > dimanche) return false;
    }
    return correspondRecherche(f, c.recherche);
  });
}

/** Pastilles des filtres actifs : [{ cle, valeur, libelle }]. */
export function pastillesFiltres(criteres, { offres = [] } = {}) {
  const c = criteresComplets(criteres);
  const p = [];
  c.etapes.forEach((v) => p.push({ cle: 'etapes', valeur: v, libelle: `Étape : ${libelleEtape(v)}` }));
  c.roles.forEach((v) => p.push({ cle: 'roles', valeur: v, libelle: `Rôle : ${libelleRole(v)}` }));
  c.sources.forEach((v) => p.push({ cle: 'sources', valeur: v, libelle: `Source : ${v}` }));
  c.secteurs.forEach((v) => p.push({ cle: 'secteurs', valeur: v, libelle: `Secteur : ${v}` }));
  c.villes.forEach((v) => p.push({ cle: 'villes', valeur: v, libelle: `Ville : ${v}` }));
  c.priorites.forEach((v) => p.push({ cle: 'priorites', valeur: v, libelle: `Priorité : ${libellePriorite(v)}` }));
  c.offres.forEach((v) => p.push({ cle: 'offres', valeur: v, libelle: `Offre : ${libelleOffre(offres, v)}` }));
  if (c.enRetard) p.push({ cle: 'enRetard', valeur: true, libelle: 'En retard' });
  if (c.sansAction) p.push({ cle: 'sansAction', valeur: true, libelle: 'Sans action prévue' });
  if (c.jtbd === 'faite') p.push({ cle: 'jtbd', valeur: 'faite', libelle: 'Interview JTBD faite' });
  if (c.jtbd === 'non_faite') p.push({ cle: 'jtbd', valeur: 'non_faite', libelle: 'Interview JTBD non faite' });
  if (c.archives) p.push({ cle: 'archives', valeur: true, libelle: 'Archivés' });
  if (c.semaine) p.push({ cle: 'semaine', valeur: true, libelle: 'À relancer cette semaine' });
  if (normaliser(c.recherche)) p.push({ cle: 'recherche', valeur: c.recherche, libelle: `Recherche : ${c.recherche}` });
  return p;
}

export function retirerCritere(criteres, cle, valeur) {
  const c = criteresComplets(criteres);
  if (Array.isArray(c[cle])) c[cle] = c[cle].filter((v) => v !== valeur);
  else if (cle === 'jtbd') c.jtbd = null;
  else if (cle === 'recherche') c.recherche = '';
  else c[cle] = false;
  return c;
}

export function basculerValeur(criteres, cle, valeur) {
  const c = criteresComplets(criteres);
  c[cle] = c[cle].includes(valeur) ? c[cle].filter((v) => v !== valeur) : [...c[cle], valeur];
  return c;
}

// ---------------------------------------------------------------- tri de la Liste

const CLES_TRI = {
  nom: (f) => normaliser(f.nom),
  entreprise: (f) => normaliser(f.entreprise),
  ville: (f) => normaliser(f.ville),
  etape: (f) => TOUTES_ETAPES.findIndex((e) => e.id === f.etape),
  priorite: (f) => PRIORITES.findIndex((p) => p.id === f.priorite),
  source: (f) => normaliser(f.source),
  prochaineAction: (f) => f.dateProchaineAction || '',
  montant: (f) => (f.montant === null || f.montant === undefined || f.montant === '' ? null : Number(f.montant)),
  dateDernierEchange: (f) => versDate(f.dateDernierEchange)?.getTime() ?? null,
};

export function trierFiches(fiches, colonne = 'nom', sens = 'asc') {
  const cle = CLES_TRI[colonne] || CLES_TRI.nom;
  const s = sens === 'desc' ? -1 : 1;
  return [...fiches].sort((a, b) => {
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

// ---------------------------------------------------------------- export CSV et rappel

export const COLONNES_CSV = [
  ['id', 'Identifiant'], ['nom', 'Prénom et nom'], ['entreprise', 'Entreprise'], ['roles', 'Rôles'],
  ['dateInterviewJtbd', "Date de l'interview JTBD"], ['secteur', 'Secteur'], ['taille', 'Taille'],
  ['ville', 'Ville'], ['telephone', 'Téléphone'], ['email', 'Email'], ['siteWeb', 'Site web'],
  ['linkedin', 'LinkedIn'], ['source', 'Source'], ['etape', 'Étape'], ['dateEntreeEtape', "Entrée dans l'étape"],
  ['priorite', 'Priorité'], ['besoin', 'Besoin identifié'], ['offreId', 'Offre envisagée'],
  ['dureeJours', 'Durée (jours)'], ['montant', 'Montant (€)'], ['datePremierContact', 'Premier contact'],
  ['dateDernierEchange', 'Dernier échange'], ['prochaineAction', 'Prochaine action'],
  ['dateProchaineAction', 'Date prochaine action'], ['dateRdv', 'Date du rendez vous'],
  ['rdvTenu', 'Rendez vous tenu'], ['dateRdvTenu', 'Date du rendez vous tenu'], ['notes', 'Notes'],
  ['notesRapides', 'Notes rapides'], ['documents', 'Documents'], ['raisonPerdu', 'Raison si perdu'],
  ['raisonPerduDetail', 'Détail de la raison'], ['dateReveil', 'Date de réveil'], ['encaissements', 'Encaissements'],
  ['oppositionProspection', 'Opposition à la prospection'], ['dateOpposition', "Date de l'opposition"],
  ['archive', 'Archivé'], ['historique', 'Historique'], ['creeLe', 'Créé le'], ['creePar', 'Créé par'],
  ['modifieLe', 'Modifié le'], ['modifiePar', 'Modifié par'],
];

const CHAMPS_TIMESTAMP = new Set(['dateEntreeEtape', 'dateDernierEchange', 'dateRdvTenu', 'dateOpposition', 'creeLe', 'modifieLe']);

function nombreFr(n) {
  if (n === null || n === undefined || n === '') return '';
  return String(n).replace('.', ',');
}

function valeurCsv(f, champ, offres) {
  const v = f[champ];
  if (CHAMPS_TIMESTAMP.has(champ)) return formatDateHeure(v);
  switch (champ) {
    case 'roles': return (v || []).map(libelleRole).join(', ');
    case 'etape': return libelleEtape(v);
    case 'priorite': return libellePriorite(v);
    case 'offreId': return libelleOffre(offres, v);
    case 'dureeJours': case 'montant': return nombreFr(v);
    case 'dateRdv': return v ? v.replace('T', ' ') : '';
    case 'rdvTenu': case 'oppositionProspection': case 'archive': return v ? 'Oui' : 'Non';
    case 'notesRapides': return (v || []).map((n) => `${formatDateHeure(n.date)} : ${n.texte}`).join('\n');
    case 'documents': return (v || []).map((d) => `${d.libelle} : ${d.url}`).join('\n');
    case 'encaissements': return (v || []).map((e) => `${formatDateHeure(e.date)} : ${nombreFr(e.montant)} €${e.offreId ? ` (${libelleOffre(offres, e.offreId)})` : ''}`).join('\n');
    case 'historique': return (v || []).map((h) => `${formatDateHeure(h.date)} : ${h.texte}`).join('\n');
    default: return v === null || v === undefined ? '' : String(v);
  }
}

export function echapperCsv(valeur) {
  const s = String(valeur ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export CSV : UTF 8 avec BOM, séparateur point virgule, fins de ligne CRLF. */
export function versCsv(fiches, { offres = [] } = {}) {
  const lignes = [COLONNES_CSV.map(([, libelle]) => echapperCsv(libelle)).join(';')];
  for (const f of fiches) {
    lignes.push(COLONNES_CSV.map(([champ]) => echapperCsv(valeurCsv(f, champ, offres))).join(';'));
  }
  return `﻿${lignes.join('\r\n')}\r\n`;
}

export function nomFichierCsv(maintenant = new Date(), complet = true) {
  return `chevalier-ia-prospects${complet ? '' : '-filtre'}-${aujourdhuiParis(maintenant)}.csv`;
}

/** Rappel d'export : affiché si aucun export, ou si le dernier date de plus de 30 jours. */
export function rappelExportVisible(dernierExport, maintenant = new Date()) {
  const d = versDate(dernierExport);
  if (!d) return true;
  return maintenant.getTime() - d.getTime() > JOURS_RAPPEL_EXPORT * 86400000;
}
