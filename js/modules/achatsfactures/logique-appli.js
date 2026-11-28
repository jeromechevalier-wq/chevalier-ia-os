// Logique pure de « l'application Factures » (27/11/2026, maquette v3 validée) : aucun import de la coque, aucun réseau, aucun écran. Se teste seule (tests/achatsfactures-appli.test.js).
// Ce fichier calcule : les durées des animations, l'alerte « IBAN changé récemment », la liste des fournisseurs du volet, le fournisseur d'une facture (connu ou nouveau),
// les chiffres du tableau de bord des factures et le bilan de fin de pile. Rien n'est inventé : une donnée absente donne « — » ou null, jamais un nombre deviné.
import { normaliserIban, sirenDe } from './controles.js';
import { centimesSignes, dateFr } from './logique.js';

/** Vues de l'application (routes achatsfactures/<vue>) : la pile est l'accueil de l'appli. */
export const VUES_APPLI = Object.freeze(['pile', 'tableau', 'reglages']);

/** Durées des animations (ms), les mêmes que la maquette validée ; la feuille css/achatsfactures-appli.css porte les mêmes valeurs (verrou : tests/achatsfactures-appli.test.js). */
export const DUREES = Object.freeze({ tampon: 350, sortie: 700, passer: 550, entree: 450, annuler: 3200, pulse: 500, fin: 500 });
export const COURBE_ENTREE = 'cubic-bezier(.2,.8,.2,1)';

/** L'alerte « IBAN changé » reste sur les factures du fournisseur pendant ce nombre de jours. */
export const JOURS_ALERTE_IBAN = 60;
export const MOTIF_ANNULATION = 'Décision annulée tout de suite depuis la pile (bouton « Annuler »).';
export const LIMITES_CHANTIER = Object.freeze({ nom: 200, code: 40, client: 200, adresse: 300 });

const FUSEAU = 'Europe/Paris';
const JOUR_MS = 24 * 3600 * 1000;

/** Initiales d'un nom (2 lettres au plus), pour la pastille ronde d'une fiche. */
export function initiales(nom) {
  const mots = String(nom ?? '').split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m));
  const longs = mots.filter((m) => m.length > 2);
  const choisis = (longs.length ? longs : mots).slice(0, 2);
  return choisis.map((m) => [...m][0].toUpperCase()).join('') || '?';
}

/** IBAN masqué (« FR76 •••• 0189 ») : on ne montre jamais l'IBAN entier dans une liste ou une alerte. */
export function masquerIban(iban) {
  const n = normaliserIban(iban);
  if (!n) return '—';
  return n.length < 9 ? n : `${n.slice(0, 4)} •••• ${n.slice(-4)}`;
}

/** IBAN par groupes de 4 (lecture facile). */
export const ibanLisible = (iban) => (normaliserIban(iban) ?? '').replace(/(.{4})/g, '$1 ').trim();

/** SIREN d'une facture : la colonne, sinon ce que la lecture automatique a trouvé. */
export const sirenFacture = (f) => f?.fournisseur_siren ?? sirenDe(f?.extraction) ?? null;

/** Jour (AAAA-MM-JJ) d'un horodatage, en heure de Paris ; une date sans heure est gardée telle quelle. */
export function jourParis(valeur) {
  if (!valeur) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// ------------------------------------------------------------------ IBAN changé récemment
/**
 * Changement récent d'IBAN dans les confirmations d'UN fournisseur (`miennes` : déjà les siennes, aucun autre tri n'est refait ici).
 * Deux événements comptent, dans les 60 derniers jours : une confirmation RÉVOQUÉE (l'IBAN a été remplacé ou retiré), ou la confirmation d'un IBAN DIFFÉRENT d'un IBAN déjà confirmé avant.
 * Une révocation ne compte pas si le MÊME IBAN a une confirmation active plus récente (il a été reconfirmé : rien n'a changé pour qui paie).
 * Renvoie { date, motif } (le plus récent) ou null. `miennes` null (lecture impossible) = null : jamais d'alerte inventée ; les contrôles de la facture disent déjà « non vérifié ».
 */
export function changementDansConfirmations(miennes, maintenant = new Date()) {
  if (!Array.isArray(miennes)) return null;
  const limite = maintenant.getTime() - JOURS_ALERTE_IBAN * JOUR_MS;
  const quand = (v) => (v ? Date.parse(v) : NaN);
  const evenements = [];
  for (const c of miennes) {
    const rev = quand(c.revoque_le);
    const conf = quand(c.confirme_le);
    const reconfirme = miennes.some((x) => x !== c && !x.revoque_le && normaliserIban(x.iban) === normaliserIban(c.iban) && quand(x.confirme_le) > (Number.isFinite(conf) ? conf : -Infinity));
    if (Number.isFinite(rev) && rev >= limite && !reconfirme) evenements.push({ quand: rev, date: c.revoque_le, motif: c.motif_revocation ?? '' });
    const autreAvant = miennes.some((x) => x !== c && normaliserIban(x.iban) !== normaliserIban(c.iban) && x.confirme_le && Date.parse(x.confirme_le) < conf);
    if (Number.isFinite(conf) && conf >= limite && autreAvant) evenements.push({ quand: conf, date: c.confirme_le, motif: '' });
  }
  evenements.sort((a, b) => b.quand - a.quand);
  return evenements[0] ? { date: evenements[0].date, motif: evenements[0].motif } : null;
}

/** Titre de l'alerte orange « IBAN changé récemment » au-dessus d'une facture (correction du 28/11/2026). Si la facture porte l'IBAN confirmé à la main (actif), le titre le dit,
 *  sans le dire « nouveau » (ce peut être l'ancien, resté confirmé) et en gardant le rappel « Vérifie avant de payer » (dernier rappel contre la fraude pendant 60 jours).
 *  `fo` : la fiche du volet (`fournisseursDuVolet`). */
export const TITRE_ALERTE_IBAN = 'IBAN changé récemment : vérifie avant de payer';
export function titreAlerteIban(f, fo) {
  const iban = f?.iban_normalise ?? normaliserIban(f?.extraction?.iban);
  const conf = fo?.confirmation;
  if (iban && conf && !conf.revoque_le && normaliserIban(conf.iban) === iban) return `IBAN changé récemment : cette facture porte l’IBAN confirmé à la main le ${dateFr(conf.confirme_le)}. Vérifie avant de payer.`;
  return TITRE_ALERTE_IBAN;
}

/** Le même calcul pour un SIREN, dans TOUTES les confirmations lues (table `chargerIbansConfirmes`) : celles du SIREN sont d'abord retenues. Sans SIREN : null. */
export function changementIbanRecent(ibans, siren, maintenant = new Date()) {
  if (!Array.isArray(ibans) || !siren) return null;
  return changementDansConfirmations(ibans.filter((c) => c.siren === siren), maintenant);
}

// ------------------------------------------------------------------ fournisseurs du volet
/**
 * Une fiche par fournisseur de la table `fournisseurs`, enrichie de ce que l'écran sait déjà lire : ses agences, ses confirmations d'IBAN (l'historique), ses factures (nombre, dernière, e-mail).
 * `ibans` null = confirmations illisibles (la fiche dit « non lu ») ; `factures` null = factures illisibles (nombre et dernière facture : « — »).
 * L'IBAN de référence est la confirmation ACTIVE la plus récente ; à défaut, l'IBAN de la dernière facture acceptée (dit « jamais confirmé »).
 */
export function fournisseursDuVolet({ fournisseurs = [], agences = [], ibans = null, factures = null }, maintenant = new Date()) {
  return fournisseurs.map((fo) => {
    const mesAgences = agences.filter((a) => a.fournisseur_id === fo.id && !a.fusionne_dans);
    const mesIbans = Array.isArray(ibans) ? ibans.filter((c) => c.fournisseur_id === fo.id || (fo.siren && c.siren === fo.siren)) : null;
    const confirmation = mesIbans ? mesIbans.filter((c) => !c.revoque_le).sort((a, b) => String(b.confirme_le ?? '').localeCompare(String(a.confirme_le ?? '')))[0] ?? null : null;
    const mesFactures = Array.isArray(factures) && fo.siren ? factures.filter((f) => f.fournisseur_siren === fo.siren) : (Array.isArray(factures) ? [] : null);
    const parDate = mesFactures ? [...mesFactures].sort((a, b) => String(b.date_facture ?? b.created_at ?? '').localeCompare(String(a.date_facture ?? a.created_at ?? ''))) : [];
    const acceptee = parDate.find((f) => f.statut === 'acceptee' && f.iban_normalise);
    return {
      id: fo.id, nom: fo.nom?.trim() || 'Fournisseur sans nom', siren: fo.siren ?? null, statut: fo.statut ?? null,
      agences: mesAgences,
      confirmation,
      iban: confirmation ? normaliserIban(confirmation.iban) : (acceptee ? normaliserIban(acceptee.iban_normalise) : null),
      ibansLus: mesIbans !== null,
      historique: mesIbans ?? [],
      nbFactures: mesFactures ? mesFactures.length : null,
      derniere: parDate[0] ? (parDate[0].date_facture ?? jourParis(parDate[0].created_at)) : null,
      email: parDate.find((f) => f.email_expediteur)?.email_expediteur ?? null,
      changement: changementDansConfirmations(mesIbans, maintenant), // `mesIbans` sont déjà les siennes (par sa fiche ou par son SIREN) : un fournisseur sans SIREN garde son alerte
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Texte comparé sans accents ni majuscules (recherche du volet, nom exact d'un fournisseur). */
export const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const correspond = (texte, recherche) => sansAccents(texte).includes(sansAccents(recherche));

/**
 * Le fournisseur enregistré d'une facture, ou null. Dans l'ordre : son SIREN ; sinon l'agence déjà reliée à la facture (`etablissement_id` : agence → fournisseur) ;
 * sinon, SEULEMENT quand le SIREN n'a pas été lu, le nom exact (sans accents ni majuscules) s'il désigne un seul fournisseur. Un SIREN lu mais inconnu ne se rattrape jamais par le nom
 * (même nom, autre SIREN : ce n'est peut-être pas la même entreprise).
 */
export function fournisseurDeFacture(f, liste) {
  if (!f || !Array.isArray(liste)) return null;
  const siren = sirenFacture(f);
  const parSiren = siren ? liste.find((x) => x.siren === siren) : null;
  if (parSiren) return parSiren;
  const parAgence = f.etablissement_id ? liste.find((x) => (x.agences ?? []).some((a) => a.id === f.etablissement_id)) : null;
  if (parAgence) return parAgence;
  if (siren) return null;
  const nom = sansAccents(f.fournisseur ?? f.extraction?.fournisseur?.nom);
  const memes = nom ? liste.filter((x) => sansAccents(x.nom) === nom) : [];
  return memes.length === 1 ? memes[0] : null;
}

/**
 * Ce que l'application sait du fournisseur d'une facture : { etat, fournisseur }.
 * 'connu' (il est enregistré) ; 'nouveau' (son SIREN est lu et n'est pas dans la table : on propose de l'ajouter) ;
 * 'non-reconnu' (SIREN non lu et rien ne le rattache à un fournisseur : on ne dit PAS « nouveau », il est peut-être déjà enregistré).
 */
export function etatFournisseurFacture(f, liste) {
  const fournisseur = fournisseurDeFacture(f, liste);
  if (fournisseur) return { etat: 'connu', fournisseur };
  return { etat: sirenFacture(f) ? 'nouveau' : 'non-reconnu', fournisseur: null };
}

/** Motif écrit avec la révocation quand un changement d'IBAN est signalé depuis la fiche : le nouvel IBAN n'y figure JAMAIS en entier (forme masquée seulement). */
export function motifChangementIban(nouvelIban) {
  const n = normaliserIban(nouvelIban);
  return `Changement d’IBAN signalé depuis la fiche du fournisseur.${n ? ` Nouvel IBAN annoncé : ${masquerIban(n)}.` : ''}`;
}
export const MESSAGE_IBAN_RETIRE = 'Ancien IBAN retiré : le nouveau sera confirmé à la prochaine facture';

// ------------------------------------------------------------------ chantier (fiche du volet)
/** Contrôle de forme des champs de texte d'un chantier modifiés depuis sa fiche (le serveur refait les mêmes). Phrase française, ou null. */
export function verifierChantierFiche(c) {
  const nom = (c.nom ?? '').trim();
  if (!nom) return 'Le nom du chantier est obligatoire.';
  if (nom.length > LIMITES_CHANTIER.nom) return `Le nom est trop long (${LIMITES_CHANTIER.nom} caractères au maximum).`;
  if (!(c.code ?? '').trim()) return 'Le code du chantier ne peut pas être vide.';
  if (c.code.trim().length > LIMITES_CHANTIER.code) return `Le code est trop long (${LIMITES_CHANTIER.code} caractères au maximum).`;
  if ((c.client ?? '').trim().length > LIMITES_CHANTIER.client) return `Le client est trop long (${LIMITES_CHANTIER.client} caractères au maximum).`;
  if ((c.adresse ?? '').trim().length > LIMITES_CHANTIER.adresse) return `L’adresse est trop longue (${LIMITES_CHANTIER.adresse} caractères au maximum).`;
  return null;
}

/** `champs` de l'action `modifier_chantier` : SEULEMENT ce qui a changé ; un texte vidé = null (nom et code ne se vident pas). Objet vide = rien à envoyer. */
export function champsChantierModifies(origine, c) {
  const r = {};
  const avant = (k) => String(origine[k] ?? '').trim();
  if (c.nom.trim() !== avant('nom')) r.nom = c.nom.trim();
  if (c.code.trim() !== avant('code')) r.code = c.code.trim();
  if (c.client.trim() !== avant('client')) r.client = c.client.trim() || null;
  if (c.adresse.trim() !== avant('adresse')) r.adresse = c.adresse.trim() || null;
  return r;
}

// ------------------------------------------------------------------ nouveau chantier (bouton « + Chantier » du volet, 28/11/2026)
// Copie de achatschantiers/logique.js (`verifierChantier(c, true)` et `corpsCreationChantier`), à garder identique : un module Achats n'importe pas un autre module.
// Le formulaire du volet n'a que nom, code, client et adresse : le statut est toujours « en préparation » (comme le module Chantiers) ; le budget et les dates se règlent dans l'écran Chantiers.
// Verrou : tests/achatsfactures-appli.test.js compare ces deux fonctions à celles du module Chantiers sur les mêmes saisies.
export const STATUT_NOUVEAU_CHANTIER = 'en_preparation';

/** Contrôle de forme d'un nouveau chantier (le serveur refait les mêmes) : le code peut rester vide (la base l'attribue). Phrase française, ou null. */
export function verifierChantierCreation(c) {
  const nom = (c.nom ?? '').trim();
  if (!nom) return 'Le nom du chantier est obligatoire.';
  if (nom.length > LIMITES_CHANTIER.nom) return `Le nom est trop long (${LIMITES_CHANTIER.nom} caractères au maximum).`;
  if ((c.code ?? '').trim().length > LIMITES_CHANTIER.code) return `Le code est trop long (${LIMITES_CHANTIER.code} caractères au maximum).`;
  if ((c.client ?? '').trim().length > LIMITES_CHANTIER.client) return `Le client est trop long (${LIMITES_CHANTIER.client} caractères au maximum).`;
  if ((c.adresse ?? '').trim().length > LIMITES_CHANTIER.adresse) return `L’adresse est trop longue (${LIMITES_CHANTIER.adresse} caractères au maximum).`;
  return null;
}

/** Corps de `creer_chantier` : clés à plat (liste blanche du serveur), seulement les champs remplis, statut « en préparation ». Jamais d'identité. */
export function corpsCreationChantier(c) {
  const corps = { nom: (c.nom ?? '').trim(), statut: STATUT_NOUVEAU_CHANTIER };
  if ((c.code ?? '').trim()) corps.code = c.code.trim();
  if ((c.client ?? '').trim()) corps.client = c.client.trim();
  if ((c.adresse ?? '').trim()) corps.adresse = c.adresse.trim();
  return corps;
}

export const LIBELLE_STATUT_CHANTIER = Object.freeze({ en_preparation: 'En préparation', en_cours: 'En cours', suspendu: 'Suspendu', termine: 'Terminé' });

// ------------------------------------------------------------------ tableau de bord des factures
/** Numéro de semaine ISO d'une date (AAAA-MM-JJ) : { annee, semaine }. */
export function semaineIso(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const jourSemaine = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine);
  const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { annee: d.getUTCFullYear(), semaine: Math.ceil(((d.getTime() - debut) / JOUR_MS + 1) / 7) };
}

/**
 * Chiffres du tableau de bord, calculés sur la liste des factures déjà lue (aucune autre source) : à valider (non archivées), acceptées et refusées ce mois (date de la décision, heure de Paris),
 * montant TTC accepté ce mois (avoirs en négatif, en centimes), délai moyen entre l'arrivée et l'acceptation (jours ; null si aucune), les 3 fournisseurs du mois et le montant accepté des 4 dernières semaines.
 */
export function chiffresTableau(factures, maintenant = new Date()) {
  const aujourdhui = jourParis(maintenant.toISOString());
  const mois = aujourdhui.slice(0, 7);
  const decidees = factures.filter((f) => f.date_decision && jourParis(f.date_decision)?.slice(0, 7) === mois);
  const acceptees = decidees.filter((f) => f.statut === 'acceptee');
  const delais = acceptees.map((f) => (Date.parse(f.date_decision) - Date.parse(f.created_at)) / JOUR_MS).filter((n) => Number.isFinite(n) && n >= 0);
  const parFournisseur = new Map();
  for (const f of acceptees) { const nom = f.fournisseur?.trim() || 'Fournisseur inconnu'; parFournisseur.set(nom, (parFournisseur.get(nom) ?? 0) + centimesSignes(f)); }
  const semaines = [];
  for (let i = 3; i >= 0; i -= 1) {
    const [a, m, j] = aujourdhui.split('-').map(Number);
    const jour = new Date(Date.UTC(a, m - 1, j - 7 * i)).toISOString().slice(0, 10);
    const s = semaineIso(jour);
    semaines.push({ ...s, libelle: `S${s.semaine}`, centimes: 0 });
  }
  for (const f of factures) {
    if (f.statut !== 'acceptee' || !f.date_decision) continue;
    const s = semaineIso(jourParis(f.date_decision));
    const cible = semaines.find((x) => x.annee === s.annee && x.semaine === s.semaine);
    if (cible) cible.centimes += centimesSignes(f);
  }
  return {
    mois,
    aValider: factures.filter((f) => f.statut === 'a_valider' && !f.archivee_le).length,
    accepteesMois: acceptees.length,
    refuseesMois: decidees.filter((f) => f.statut === 'refusee').length,
    centimesMois: acceptees.reduce((s, f) => s + centimesSignes(f), 0),
    delaiMoyenJours: delais.length ? delais.reduce((s, n) => s + n, 0) / delais.length : null,
    top3: [...parFournisseur.entries()].map(([nom, centimes]) => ({ nom, centimes })).sort((a, b) => b.centimes - a.centimes || a.nom.localeCompare(b.nom, 'fr')).slice(0, 3),
    semaines,
  };
}

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
/** « Novembre 2026 » pour « 2026-11 ». */
export const libelleMois = (mois) => `${MOIS[Number(mois.slice(5, 7)) - 1] ?? ''} ${mois.slice(0, 4)}`.trim();
export const eurosCentimes = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const delaiLisible = (jours) => (jours === null ? '—' : `${jours.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} jour${jours >= 2 ? 's' : ''}`);

// ------------------------------------------------------------------ bilan de fin de pile
/** Décisions du jour (heure de Paris), lues dans la liste des factures : { acceptees, refusees, centimes }. */
export function bilanDuJour(factures, maintenant = new Date()) {
  const aujourdhui = jourParis(maintenant.toISOString());
  const duJour = factures.filter((f) => f.date_decision && jourParis(f.date_decision) === aujourdhui);
  const acceptees = duJour.filter((f) => f.statut === 'acceptee');
  return { acceptees: acceptees.length, refusees: duJour.filter((f) => f.statut === 'refusee').length, centimes: acceptees.reduce((s, f) => s + centimesSignes(f), 0) };
}

/** Phrase du bilan : « 3 factures traitées aujourd’hui · 2 validées (1 541,40 €) · 1 refusée ». `quand` : « aujourd’hui » ou « pendant cette séance ». */
export function texteBilan({ acceptees, refusees, centimes }, quand = 'aujourd’hui') {
  const n = acceptees + refusees;
  if (n === 0) return `Aucune facture traitée ${quand}.`;
  const morceaux = [`${n} facture${n > 1 ? 's' : ''} traitée${n > 1 ? 's' : ''} ${quand}`];
  if (acceptees) morceaux.push(`${acceptees} validée${acceptees > 1 ? 's' : ''} (${eurosCentimes(centimes)})`);
  if (refusees) morceaux.push(`${refusees} refusée${refusees > 1 ? 's' : ''}`);
  return morceaux.join(' · ');
}

// ------------------------------------------------------------------ Mode d'emploi de la base (PR 2b, 27/11/2026 ; migration 013, outils/base/REGLES.md règles 23 et 24)
// La base dit, pour chaque table, si la personne peut créer (« + ») et, pour chaque champ, s'il se modifie et la phrase du cadenas. LA BASE FAIT FOI : l'écran ne décide plus.
// Sans mode d'emploi (null : ancienne base, migrations pas appliquées, porte pas republiée), l'écran reste EXACTEMENT comme avant.
// Limite assumée : l'écran n'ouvre jamais un champ qu'il ne sait pas écrire (aucune action métier pour lui) ; le mode d'emploi peut fermer un champ, poser son cadenas, retirer un « + ».

/** Table de la base derrière chaque liste du volet. */
export const OBJET_DU_VOLET = Object.freeze({ fournisseurs: 'fournisseurs', chantiers: 'chantiers', articles: 'articles_fournisseur' });

/**
 * Prépare le mode d'emploi lu dans la base : `objets` (lignes de mode_emploi_objets) et `champs` (lignes de mode_emploi_champs). Les lignes archivées sont ignorées.
 * Renvoie null si rien d'utilisable n'est lu (aucun objet) : l'écran reste alors comme avant.
 */
export function preparerModeEmploi(objets, champs) {
  if (!Array.isArray(objets) || !Array.isArray(champs)) return null;
  const parObjet = new Map();
  for (const o of objets) if (o && typeof o.objet === 'string' && typeof o.creer === 'boolean') parObjet.set(o.objet, { creer: o.creer, phrase: texteOuNull(o.phrase_sans_creer), champs: new Map() });
  if (!parObjet.size) return null;
  for (const c of champs) {
    if (!c || c.archive_le || typeof c.objet !== 'string' || typeof c.champ !== 'string' || typeof c.modifiable !== 'string') continue;
    parObjet.get(c.objet)?.champs.set(c.champ, { etat: c.modifiable, modifiable: c.modifiable === 'oui', phrase: c.modifiable === 'oui' ? null : texteOuNull(c.phrase_cadenas) });
  }
  return parObjet;
}
const texteOuNull = (t) => (typeof t === 'string' && t.trim() ? t.trim() : null);

/**
 * Le « + » d'une liste : `defaut` (ce que fait l'écran aujourd'hui) sans mode d'emploi ou sans ligne pour cette table ; sinon la base : « + » seulement si elle l'autorise ET si l'écran le
 * sait faire (`defaut` vrai). Renvoie { montrer, phrase }.
 */
export function plusSelonModeEmploi(mode, objet, defaut) {
  const o = mode?.get(objet);
  if (!o) return { montrer: defaut, phrase: null };
  return { montrer: defaut && o.creer, phrase: o.creer ? null : o.phrase };
}

/**
 * Lignes d'une fiche (format de fiche.js) corrigées par le mode d'emploi. `lignes[i].champBase` : le nom de la colonne dans la base (absent : la ligne est un résumé de l'écran, non touché).
 * Un champ que la base dit non modifiable est fermé et reçoit sa phrase (`cadenas`) ; un champ modifiable selon la base mais que l'écran ne sait pas écrire reste fermé, sans phrase.
 * « tant_que_vide » : ouvert (sans cadenas) tant que la valeur est vide, fermé ensuite. « avant_decision » / « apres_decision » : fermés (aucune table du volet n'a de décision).
 * Sans mode d'emploi, ou sans ligne pour cette table : les lignes reviennent inchangées (même objet).
 */
export function lignesSelonModeEmploi(mode, objet, lignes) {
  const o = mode?.get(objet);
  if (!o) return lignes;
  return lignes.map((l) => {
    const regle = l.champBase ? o.champs.get(l.champBase) : null;
    if (!regle || regle.modifiable) return l;
    if (regle.etat === 'tant_que_vide' && (l.valeur === '—' || !String(l.valeur ?? '').trim())) return l;
    return { ...l, modifiable: false, cadenas: regle.phrase };
  });
}

/** Les clés d'une saisie que la base laisse modifier (une fiche ouverte avant l'arrivée du mode d'emploi ne doit jamais envoyer un champ cadenassé). */
export function saisieSelonModeEmploi(mode, objet, lignes, saisie) {
  const ouvertes = new Set(lignesSelonModeEmploi(mode, objet, lignes).filter((l) => l.modifiable).map((l) => l.cle));
  return Object.fromEntries(Object.entries(saisie).filter(([k]) => ouvertes.has(k)));
}
