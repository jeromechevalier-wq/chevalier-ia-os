// Règles pures des PISTES de posts du module Réseaux sociaux (13/11/2026) : aucune dépendance à Firebase ni au DOM, importables par les tests Node.
//
// L'entonnoir : sources (`reseauxsociaux_inspirations`, voir inspirations-logique.js) -> PISTES (`reseauxsociaux_pistes`, ce fichier) -> idées (idees-logique.js) -> posts (lus dans Buffer).
// Une piste = un angle de post POUR Jérôme, écrit avec nos mots. LISTE FERMÉE de champs : aucun champ `texte`, `contenu` ni `extrait` (le texte d'un tiers n'est jamais recopié).
// Ce fichier contient aussi le PROMPT que Jérôme copie pour Claude (`construirePromptPistes`) et la LECTURE de la réponse qu'il colle (`lireReponsePistes`) :
// l'appli n'appelle aucune IA, c'est Jérôme qui fait le pont. Rien n'est écrit avant la validation de l'aperçu (`planAjouterPistes`).
import * as L from '../crm/logique.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';
const { ErreurClaire } = I;

export const MAX_ANGLE = I.MAX_ANGLE; // 200
export const MAX_NOTE = 300;
export const MAX_ANCRE = 200;
export const MAX_ACCROCHE = 200; // la première phrase du post
export const MAX_BROUILLON = 1500; // le post presque prêt : accroche, développement, appel final (nos mots, jamais ceux d'un tiers)
export const MAX_VISUEL = 400; // proposition de visuel ou d'animation (ce qu'on voit, pas un fichier)
export const MAX_PILIERS = 4; // une piste peut servir plusieurs piliers à la fois
export const MAX_LOT = 60;
export const MAX_PISTES_PAR_LOT = 30; // propositions : 30 pistes au plus par collage ou par appel d'outil
export const MIN_PISTES_DEMANDEES = 10;
export const MAX_PISTES_DANS_PROMPT = 100; // les angles déjà en stock cités dans le prompt (les plus récents)
export const MAX_REPONSE = 60000; // caractères au plus d'une réponse collée

/** Les trois états d'une piste. « Écartée » ne supprime rien : la piste reste retrouvable par filtre. */
export const ETATS_PISTE = Object.freeze([
  { id: 'nouvelle', libelle: 'En stock' },
  { id: 'retenue', libelle: 'Retenue' },
  { id: 'ecartee', libelle: 'Écartée' },
]);
export const AUTEURS_PISTE = Object.freeze(['claude', 'utilisateur']);
/** Les champs qu'une réponse de Claude peut porter (liste fermée) ; tout autre champ est ignoré. */
export const CHAMPS_REPONSE = Object.freeze(['angle', 'accroche', 'brouillon', 'visuel', 'note', 'ancre', 'url', 'piliers', 'pilier', 'format', 'service']);
/** Les champs qu'un outil de Claude peut porter : ceux de la réponse, plus l'exemple d'où vient la piste. */
export const CHAMPS_OUTIL = Object.freeze([...CHAMPS_REPONSE, 'exempleId']);
/** Les champs qu'on peut modifier sur une piste existante. */
export const CHAMPS_MODIFIABLES = Object.freeze(['angle', 'accroche', 'brouillon', 'visuel', 'note', 'ancre', 'piliers', 'pilier', 'format', 'service', 'etat']);
export const FORMAT_REPONSE = 'pistes-v1';

// Coupe en caractères réels (points de code), jamais au milieu d'un emoji : `longueur` compte de la même façon, donc un angle accepté n'est jamais rogné.
const texteSimple = (v, max) => Array.from(String(v ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
// Texte sur plusieurs lignes (le brouillon d'un post garde ses paragraphes) : retours à la ligne unifiés, pas plus d'une ligne vide de suite, coupé en caractères réels.
const nettoyerLong = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const texteLong = (v, max) => Array.from(nettoyerLong(v)).slice(0, max).join('');
const longueurLong = (v) => Array.from(nettoyerLong(v)).length;
const longueur = (v) => Array.from(String(v ?? '').replace(/\s+/g, ' ').trim()).length;
const idConnu = (liste, id) => (liste.some((x) => x.id === id) ? id : null);
/** Adresse https seulement (sans schéma, elle est refusée : une piste ne reçoit que des liens complets). */
const urlHttps = (v) => (/^https:\/\//i.test(String(v ?? '').trim()) ? I.normaliserUrlWeb(v) : '');

/**
 * Les piliers d'une piste : liste d'identifiants d'aujourd'hui, sans doublon, 4 au plus. Accepte `piliers` (liste, ou un seul texte) et l'ancien champ `pilier` (un seul) ;
 * une valeur inconnue est laissée de côté. La liste garde l'ordre donné : le premier est le pilier principal (couleur, carte, filtre).
 */
export function normaliserPiliers(piliers, pilier) {
  const brut = [...(Array.isArray(piliers) ? piliers : (typeof piliers === 'string' ? [piliers] : [])), pilier];
  return [...new Set(brut.map((x) => R.convertirPilier(x)).filter(Boolean))].slice(0, MAX_PILIERS);
}
/** Tous les piliers d'une piste lue en base (une piste d'avant n'a que `pilier`). */
export const piliersDePiste = (piste) => normaliserPiliers(piste?.piliers, piste?.pilier);

export const libelleEtatPiste = (id) => ETATS_PISTE.find((e) => e.id === id)?.libelle ?? null;

/** Identifiant de la source d'un résumé de veille venu de n8n : prévisible, la fiche source est créée au premier besoin. */
export const idSourceVeille = (contenuId) => `veille-${String(contenuId ?? '').trim()}`;

// ---------------------------------------------------------------- une piste

/**
 * Range une piste telle qu'elle s'écrit dans la table. LISTE FERMÉE : `texte`, `contenu`, `extrait` et tout autre champ sont ignorés.
 * Pilier (ancien ou nouvel identifiant), format et service inconnus = null ; adresse non https = vide ; état inconnu = « nouvelle ».
 */
export function normaliserPiste(valeurs = {}) {
  return {
    sourceId: texteSimple(valeurs.sourceId, 100),
    sourceType: idConnu(N.TYPES_SOURCE, valeurs.sourceType) ?? 'profil',
    sourceTitre: texteSimple(valeurs.sourceTitre, N.MAX_NOM),
    angle: texteSimple(valeurs.angle, MAX_ANGLE),
    accroche: texteSimple(valeurs.accroche, MAX_ACCROCHE),
    brouillon: texteLong(valeurs.brouillon, MAX_BROUILLON),
    visuel: texteSimple(valeurs.visuel, MAX_VISUEL),
    note: texteSimple(valeurs.note, MAX_NOTE),
    ancre: texteSimple(valeurs.ancre, MAX_ANCRE),
    url: urlHttps(valeurs.url),
    exempleId: texteSimple(valeurs.exempleId, 100) || null,
    piliers: normaliserPiliers(valeurs.piliers, valeurs.pilier),
    pilier: normaliserPiliers(valeurs.piliers, valeurs.pilier)[0] ?? null,
    format: idConnu(R.FORMATS, valeurs.format),
    service: idConnu(R.SERVICES, valeurs.service),
    etat: idConnu(ETATS_PISTE, valeurs.etat) ?? 'nouvelle',
    ideeId: texteSimple(valeurs.ideeId, I.MAX_ID_LIEN) || null,
    lot: texteSimple(valeurs.lot, MAX_LOT),
    auteur: AUTEURS_PISTE.includes(valeurs.auteur) ? valeurs.auteur : 'utilisateur',
  };
}

/** Phrase d'erreur lisible, ou null si la piste peut s'enregistrer. On ne coupe jamais en silence : trop long = refusé. */
export function validerPiste(valeurs = {}) {
  if (!texteSimple(valeurs.sourceId, 101)) return 'Cette piste n’est rattachée à aucune source.';
  if (!longueur(valeurs.angle)) return 'Donne un angle à cette piste.';
  if (longueur(valeurs.angle) > MAX_ANGLE) return `L’angle doit tenir en ${MAX_ANGLE} caractères au plus.`;
  if (longueur(valeurs.accroche) > MAX_ACCROCHE) return `L’accroche doit tenir en ${MAX_ACCROCHE} caractères au plus.`;
  if (longueurLong(valeurs.brouillon) > MAX_BROUILLON) return `Le brouillon doit tenir en ${MAX_BROUILLON} caractères au plus.`;
  if (longueur(valeurs.visuel) > MAX_VISUEL) return `Le visuel doit tenir en ${MAX_VISUEL} caractères au plus.`;
  if (longueur(valeurs.note) > MAX_NOTE) return `La note doit tenir en ${MAX_NOTE} caractères au plus.`;
  if (longueur(valeurs.ancre) > MAX_ANCRE) return `L’ancre doit tenir en ${MAX_ANCRE} caractères au plus.`;
  if (String(valeurs.url ?? '').trim() && !urlHttps(valeurs.url)) return 'Le lien d’une piste doit commencer par https.';
  return null;
}

/** Clé de comparaison de deux angles : sans majuscules, sans accents, sans ponctuation, espaces réduits. */
export const cleAngle = (angle) => L.normaliser(angle).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const champsPiste = (existante) => Object.fromEntries(Object.keys(normaliserPiste({})).map((k) => [k, existante?.[k]]));

// ---------------------------------------------------------------- contrôle d'un lot (commun à l'écran et aux outils)

/**
 * Contrôle un lot de pistes (une ligne par entrée), sans rien écrire. `entrees` = objets { angle, note, … } ; `champsPermis` = liste fermée de champs (CHAMPS_REPONSE par défaut).
 * Chaque ligne rend { rang, angle, piste, refus, remarques, doublon, cochee } :
 *  - `refus` (texte) : angle vide, ou angle, note ou ancre trop long ; la piste est alors `null` ;
 *  - `remarques` : « pilier à choisir » (valeur inconnue, champ laissé vide), « lien retiré » (pas en https), « déjà en stock », « déjà dans la réponse », « au-delà de 30 » ;
 *  - `doublon` : même angle (à la casse, aux accents et à la ponctuation près) qu'une piste en stock pour cette source, ou qu'une ligne plus haut ;
 *  - `cochee` : proposée à la création (ni refusée, ni doublon, et parmi les 30 premières valides).
 * Rend aussi `champsIgnores` : le nombre de champs hors liste fermée rencontrés.
 */
export function controlerPistes(entrees, { source = {}, pistesExistantes = [], champsPermis = CHAMPS_REPONSE } = {}) {
  const vus = new Set((pistesExistantes || []).filter((p) => !p?.sourceId || !source?.id || p.sourceId === source.id).map((p) => cleAngle(p?.angle)).filter(Boolean));
  let champsIgnores = 0;
  let cochees = 0;
  const lignes = (Array.isArray(entrees) ? entrees : []).map((brut, i) => {
    const ligne = { rang: i + 1, angle: '', piste: null, refus: null, remarques: [], doublon: false, cochee: false };
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) { ligne.refus = 'ce n’est pas une piste'; return ligne; }
    champsIgnores += Object.keys(brut).filter((k) => !champsPermis.includes(k)).length;
    const lu = (k) => (champsPermis.includes(k) && typeof brut[k] === 'string' ? brut[k] : '');
    ligne.angle = texteSimple(lu('angle'), MAX_ANGLE);
    if (!longueur(lu('angle'))) { ligne.refus = 'angle vide'; return ligne; }
    for (const [champ, max] of [['angle', MAX_ANGLE], ['accroche', MAX_ACCROCHE], ['visuel', MAX_VISUEL], ['note', MAX_NOTE], ['ancre', MAX_ANCRE]]) {
      if (longueur(lu(champ)) > max) { ligne.refus = `${champ} trop long (${max} caractères au plus)`; return ligne; }
    }
    if (longueurLong(lu('brouillon')) > MAX_BROUILLON) { ligne.refus = `brouillon trop long (${MAX_BROUILLON} caractères au plus)`; return ligne; }
    const piliersLus = champsPermis.includes('piliers') && Array.isArray(brut.piliers) ? brut.piliers.filter((x) => typeof x === 'string') : [];
    const piste = {
      angle: lu('angle'), accroche: lu('accroche'), brouillon: lu('brouillon'), visuel: lu('visuel'), note: lu('note'), ancre: lu('ancre'),
      url: urlHttps(lu('url')), piliers: normaliserPiliers(piliersLus, lu('pilier')), pilier: normaliserPiliers(piliersLus, lu('pilier'))[0] ?? null, format: idConnu(R.FORMATS, lu('format')), service: idConnu(R.SERVICES, lu('service')),
      exempleId: champsPermis.includes('exempleId') ? lu('exempleId') : '',
    };
    if (lu('url').trim() && !piste.url) ligne.remarques.push('lien retiré');
    if ((lu('pilier').trim() || piliersLus.length) && !piste.piliers.length) ligne.remarques.push('pilier à choisir');
    else if (piliersLus.length > piste.piliers.length) ligne.remarques.push('pilier inconnu laissé de côté');
    for (const champ of ['format', 'service']) if (lu(champ).trim() && !piste[champ]) ligne.remarques.push(`${champ} à choisir`);
    ligne.piste = piste;
    const cle = cleAngle(piste.angle);
    if (cle && vus.has(cle)) {
      ligne.doublon = true;
      ligne.remarques.push('déjà en stock');
      return ligne;
    }
    if (cle) vus.add(cle);
    if (cochees < MAX_PISTES_PAR_LOT) { ligne.cochee = true; cochees++; } else ligne.remarques.push(`au-delà de ${MAX_PISTES_PAR_LOT}`);
    return ligne;
  });
  // Un angle répété DANS la réponse se dit autrement que celui déjà en stock.
  const enStock = new Set((pistesExistantes || []).filter((p) => !p?.sourceId || !source?.id || p.sourceId === source.id).map((p) => cleAngle(p?.angle)));
  for (const l of lignes) if (l.doublon && !enStock.has(cleAngle(l.piste.angle))) l.remarques = l.remarques.map((r) => (r === 'déjà en stock' ? 'déjà dans la réponse' : r));
  return { lignes, champsIgnores };
}

// ---------------------------------------------------------------- lecture de la réponse collée

const ERREUR_ILLISIBLE = 'Je n’arrive pas à lire cette réponse. Copie tout le bloc entre accolades.';

/**
 * Lit la réponse de Claude collée par Jérôme (format `pistes-v1`). Rien n'est écrit : on rend l'aperçu.
 * `texte` = la réponse telle que collée (Claude peut l'entourer d'un bloc de code ou d'une phrase : on prend de la première à la dernière accolade).
 * `source` = { id } (la réponse doit être pour cette source) ; `pistesExistantes` = les pistes déjà en stock pour elle (doublons).
 * Rend { ok: false, erreur } (rien à créer) ou { ok: true, lignes, nombreCochees, champsIgnores, message } ; `message` est vide, ou dit qu'aucune piste n'est valide (bouton « Créer » grisé).
 */
export function lireReponsePistes(texte, { source = {}, pistesExistantes = [] } = {}) {
  const brut = String(texte ?? '');
  if (brut.length > MAX_REPONSE) return { ok: false, erreur: 'Réponse trop longue.' };
  const debut = brut.indexOf('{');
  const fin = brut.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return { ok: false, erreur: ERREUR_ILLISIBLE };
  let json;
  try { json = JSON.parse(brut.slice(debut, fin + 1)); } catch { return { ok: false, erreur: ERREUR_ILLISIBLE }; }
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.format !== FORMAT_REPONSE || !Array.isArray(json.pistes)) return { ok: false, erreur: ERREUR_ILLISIBLE };
  // Décision prise seul : un sourceId absent OU nul est accepté (Claude l'oublie ou met null quand il ne sait pas) ; un sourceId rempli mais différent est refusé.
  if (json.sourceId !== undefined && json.sourceId !== null && json.sourceId !== source?.id) return { ok: false, erreur: 'Cette réponse est pour une autre source.' };
  const { lignes, champsIgnores } = controlerPistes(json.pistes, { source, pistesExistantes, champsPermis: CHAMPS_REPONSE });
  const nombreCochees = lignes.filter((l) => l.cochee).length;
  return { ok: true, lignes, nombreCochees, champsIgnores, message: nombreCochees || lignes.some((l) => l.piste) ? '' : 'Aucune piste valide dans cette réponse.' };
}

// ---------------------------------------------------------------- plans d'écriture

/**
 * Plan « ajouter des pistes » (l'écran après l'aperçu, et l'outil `ajouter_pistes` de Claude : mêmes contrôles). Une écriture par piste valide + la date de traitement sur la source.
 *  - `source` = { id, type, nom, url, … } (fiche de la source) ; `entrees` = les pistes à créer ({ angle, note, ancre, url, pilier, format, service, exempleId? }) ;
 *  - `ctx.nouvelId(collection)` : fabrique d'identifiants (obligatoire) ; `ctx.jour` : jour du traitement (AAAA-MM-JJ) ; `ctx.lot` : étiquette du lot ; `ctx.auteur` : « claude » (défaut) ou « utilisateur » ;
 *  - `ctx.pistesExistantes` : pistes déjà en stock pour la source (doublons) ; `ctx.accepterDoublons` : vrai à l'écran (Jérôme a recoché un doublon), faux pour les outils ;
 *  - `ctx.sourceExiste` : faux pour un résumé de veille venu de n8n dont la fiche n'existe pas encore (elle est créée, `ctx.ordre` = sa place) ;
 *  - `ctx.champsPermis` : CHAMPS_REPONSE par défaut (collage) ; les outils passent CHAMPS_OUTIL.
 * Rend { ecritures, creees, ignorees: [{ rang, raison }] }. Lève une ErreurClaire s'il y a plus de 30 pistes ou aucune piste valide. Rien n'est supprimé.
 */
export function planAjouterPistes(source, entrees, ctx = {}) {
  if (typeof ctx.nouvelId !== 'function') throw new ErreurClaire('Fabrique d’identifiants manquante.');
  if (typeof source?.id !== 'string' || !source.id) throw new ErreurClaire('Source manquante.');
  if (!Array.isArray(entrees) || !entrees.length) throw new ErreurClaire('Aucune piste à ajouter.');
  const jour = N.normaliserJour(ctx.jour);
  if (!jour) throw new ErreurClaire('Jour du traitement manquant.');
  // Une fiche qui n'existe pas encore est créée avec ces pistes : sans nom elle serait refusée, et un résumé de veille sans son contenu n'aurait aucun lien avec la Veille.
  if (ctx.sourceExiste === false) {
    if (!texteSimple(source.nom, N.MAX_NOM)) throw new ErreurClaire('Le nom de la source est nécessaire pour la créer avec ses pistes.');
    if (N.typeSource(source) === 'veille' && !texteSimple(source.veilleContenuId, 100)) throw new ErreurClaire('Le contenu de veille (veilleContenuId) est nécessaire pour créer cette source.');
  }
  const { lignes } = controlerPistes(entrees, { source, pistesExistantes: ctx.pistesExistantes, champsPermis: ctx.champsPermis ?? CHAMPS_REPONSE });
  const retenues = lignes.filter((l) => !l.refus && (ctx.accepterDoublons || !l.doublon));
  if (retenues.length > MAX_PISTES_PAR_LOT) throw new ErreurClaire(`Au plus ${MAX_PISTES_PAR_LOT} pistes à la fois.`);
  if (!retenues.length) throw new ErreurClaire(lignes.find((l) => l.refus) ? `Aucune piste valide : ${lignes.find((l) => l.refus).refus}.` : 'Aucune piste à créer : elles sont déjà en stock.');
  const type = N.typeSource(source);
  const auteur = AUTEURS_PISTE.includes(ctx.auteur) ? ctx.auteur : 'claude';
  const ecritures = retenues.map((l) => {
    const donnees = normaliserPiste({ ...l.piste, sourceId: source.id, sourceType: type, sourceTitre: source.nom, etat: 'nouvelle', ideeId: null, lot: ctx.lot, auteur });
    const erreur = validerPiste(donnees);
    if (erreur) throw new ErreurClaire(erreur);
    return L.ecritureCreer(R.COLLECTION_PISTES, ctx.nouvelId(R.COLLECTION_PISTES), donnees, { horodater: ['creeLe', 'modifieLe'] });
  });
  if (ctx.sourceExiste === false) {
    ecritures.push(L.ecritureCreer(R.COLLECTION_INSPIRATIONS, source.id, N.normaliserInspiration({ ...source, type, ordre: ctx.ordre ?? 0, traiteLe: jour }), { horodater: ['creeLe', 'modifieLe'] }));
  } else {
    ecritures.push(L.ecritureModifier(R.COLLECTION_INSPIRATIONS, source.id, { traiteLe: jour }, { horodater: ['modifieLe'] }));
  }
  return { ecritures, creees: retenues.length, ignorees: lignes.filter((l) => !retenues.includes(l)).map((l) => ({ rang: l.rang, raison: l.refus ?? l.remarques.join(', ') })) };
}

/** Plan « modifier une piste » : seuls les champs de CHAMPS_MODIFIABLES changent (angle, note, ancre, pilier, format, service, état) ; le reste est gardé. */
export function planModifierPiste(existante, valeurs = {}, ctx = {}) {
  if (!existante) throw new ErreurClaire('Cette piste n’existe plus.');
  if (typeof ctx.id !== 'string' || !ctx.id) throw new ErreurClaire('Identifiant de piste manquant.');
  if (valeurs.etat !== undefined && !idConnu(ETATS_PISTE, valeurs.etat)) throw new ErreurClaire('État inconnu.');
  const changements = Object.fromEntries(CHAMPS_MODIFIABLES.filter((k) => valeurs[k] !== undefined).map((k) => [k, valeurs[k]]));
  if (changements.pilier !== undefined && changements.piliers === undefined) changements.piliers = changements.pilier ? [changements.pilier] : [];
  if (changements.piliers !== undefined) changements.pilier = changements.piliers[0] ?? null; // la liste donnée REMPLACE l'actuelle (vide = aucun pilier) ; sans ça l'ancien pilier reviendrait en fin de liste
  const fusion = { ...champsPiste(existante), piliers: piliersDePiste(existante), ...changements };
  const erreur = validerPiste(fusion);
  if (erreur) throw new ErreurClaire(erreur);
  return { ecritures: [L.ecritureModifier(R.COLLECTION_PISTES, ctx.id, normaliserPiste(fusion), { horodater: ['modifieLe'] })] };
}

/** Écarte (ou remet en stock, ou retient) une piste : un état de plus, rien ne s'efface. */
export const planChangerEtatPiste = (existante, etat, ctx = {}) => planModifierPiste(existante, { etat }, ctx);

const TYPE_SOURCE_IDEE = Object.freeze({ profil: 'inspiration', site: 'site', veille: 'veille' });

/**
 * Plan « En faire une idée » : crée l'idée (angle, pilier, format, service et source recopiés, `pisteId` posé) et passe la piste à « retenue » avec `ideeId` (les deux sont liées).
 * `piste` = document de la piste (avec son `id`) ; `source` = fiche de la source ; `ctx.ideeId` = identifiant de la nouvelle idée. Une piste déjà liée à une idée est refusée.
 * Aucun champ « extrait » : la source de l'idée porte le lien, la section et le titre, jamais un texte de tiers.
 */
export function planEnFaireUneIdee(piste, source, ctx = {}) {
  if (!piste || typeof piste.id !== 'string') throw new ErreurClaire('Cette piste n’existe plus.');
  if (piste.ideeId) throw new ErreurClaire('Cette piste est déjà devenue une idée.');
  if (typeof ctx.ideeId !== 'string' || !ctx.ideeId) throw new ErreurClaire('Identifiant d’idée manquant.');
  const type = N.typeSource(source ?? { type: piste.sourceType });
  const sourceIdee = {
    type: TYPE_SOURCE_IDEE[type],
    titre: source?.nom || piste.sourceTitre,
    url: I.normaliserUrlWeb(piste.url) || I.normaliserUrlWeb(source?.url),
    ancre: piste.ancre,
    resume: type === 'veille' ? source?.resume : '',
  };
  const creation = I.planEnregistrerIdee(null, { angle: piste.angle, texte: piste.brouillon, sources: [sourceIdee], pilier: piste.pilier, format: piste.format, service: piste.service, etat: 'idee', pisteId: piste.id }, { id: ctx.ideeId });
  return { ecritures: [...creation.ecritures, L.ecritureModifier(R.COLLECTION_PISTES, piste.id, { etat: 'retenue', ideeId: ctx.ideeId }, { horodater: ['modifieLe'] })] };
}

// ---------------------------------------------------------------- compteurs et état affiché (calculés, jamais stockés)

/** L'état d'une piste à l'écran : « ecartee », « postee » (son idée est « Dans Buffer »), « redaction » (idée en rédaction), « retenue », sinon « stock ». `idees` = documents de reseauxsociaux_idees. */
export function etatAffichePiste(piste, idees) {
  if (piste?.etat === 'ecartee') return 'ecartee';
  const idee = piste?.ideeId ? (idees || []).find((i) => i.id === piste.ideeId) : null;
  if (idee?.etat === 'dans_buffer') return 'postee';
  if (idee?.etat === 'en_redaction') return 'redaction';
  return piste?.etat === 'retenue' ? 'retenue' : 'stock';
}

/**
 * Compteurs d'une source : « pistes » (toutes celles de la source), « retenues » (état « retenue »), « postees » (l'idée liée est « Dans Buffer » : aucun appel à Buffer ;
 * si l'idée revient en arrière, le compteur redescend tout seul). Calculés à chaque affichage, jamais stockés.
 */
export function compteursSource(sourceId, pistes, idees) {
  const siennes = (pistes || []).filter((p) => p?.sourceId === sourceId);
  return {
    pistes: siennes.length,
    retenues: siennes.filter((p) => p.etat === 'retenue').length,
    postees: siennes.filter((p) => etatAffichePiste(p, idees) === 'postee').length,
  };
}

// ---------------------------------------------------------------- le prompt à copier

const ligneListe = (liste) => liste.map((x) => `- ${x.id} : ${x.libelle}`).join('\n');

/**
 * Le prompt que Jérôme copie dans Claude (jamais envoyé par l'appli). Contenu, dans l'ordre : la demande ; la source (selon son type) ; les règles ; la liste fermée des champs ;
 * les valeurs permises de pilier, format et service (lues dans les listes du module au moment de la copie) ; les pistes déjà en stock (les 100 plus récentes) ; le modèle de réponse `pistes-v1`.
 * `source` = fiche de la source (avec `id`) ; `auteur` = nom de la personne pour qui écrire (facultatif, « moi » par défaut) ; `pistesExistantes` = ses pistes ; `exemples` = les exemples d'un profil (leur analyse écrite par nous, jamais le texte d'un post).
 */
export function construirePromptPistes({ source = {}, pistesExistantes = [], exemples = [], auteur = '' } = {}) {
  // Le même code sert chez Jérôme et chez les clients : le prompt ne nomme personne en dur. `auteur` (facultatif) = le nom de celui pour qui écrire, sinon « moi ».
  const pour = texteSimple(auteur, 100) || 'moi';
  const type = N.typeSource(source);
  const nom = texteSimple(source.nom, N.MAX_NOM) || 'cette source';
  const l = [];
  l.push(`Propose entre ${MIN_PISTES_DEMANDEES} et ${MAX_PISTES_PAR_LOT} pistes de posts LinkedIn pour ${pour} à partir de cette source.`, '');
  l.push('LA SOURCE', `Nom : ${nom}`, `Type : ${N.libelleTypeSource(source)}`);
  if (texteSimple(source.url, N.MAX_URL)) l.push(`Lien : ${texteSimple(source.url, N.MAX_URL)}`);
  if (texteSimple(source.pourquoi, N.MAX_ANALYSE)) l.push(`Ce qui m’inspire : ${texteSimple(source.pourquoi, N.MAX_ANALYSE)}`);
  if (type === 'site') {
    l.push('Lis les pages publiques de ce site (le lien ci-dessus) et propose des pistes à partir de ce qu’il présente.');
  } else if (type === 'veille') {
    l.push(`Titre du résumé : ${nom}`);
    if (texteSimple(source.resume, I.MAX_RESUME)) l.push(`Fichier résumé (nom exact) : ${texteSimple(source.resume, I.MAX_RESUME)}`);
    l.push('Le résumé est la seule porte d’entrée (jamais le transcript). Si tu peux ouvrir ce fichier toi-même, fais-le ; sinon je te le joins à ce message.');
  } else {
    const analyses = (exemples || []).filter((e) => e && (e.accroche || e.structure || e.longueur || e.pourquoi));
    if (Number.isFinite(source.moyenneReactions) && Number.isFinite(source.moyenneCommentaires)) {
      l.push(`Moyenne de ses posts relevés : ${source.moyenneReactions} réactions et ${source.moyenneCommentaires} commentaires par post.`);
    }
    if (analyses.length) {
      l.push('Analyses déjà écrites par nous sur ses meilleurs posts (jamais le texte d’un post) :');
      analyses.forEach((e, i) => {
        const parties = N.CHAMPS_ANALYSE.filter((c) => texteSimple(e[c.id], N.MAX_ANALYSE)).map((c) => `${c.libelle} : ${texteSimple(e[c.id], N.MAX_ANALYSE)}`);
        l.push(`${i + 1}. ${parties.join(' ; ')}`);
      });
    } else {
      l.push('Aucune analyse de post n’est encore enregistrée pour ce profil : tu ne peux pas lire LinkedIn à partir du seul lien. Propose-moi d’abord de faire le relevé de ses meilleurs posts (il se fait avec les outils de Claude), et ne propose des pistes que sur ce qui est écrit ci-dessus.');
    }
  }
  l.push('', 'LES RÈGLES',
    '- Jamais de phrase recopiée de la source : tout est reformulé avec nos mots.',
    `- Chaque piste est une IDÉE ÉLABORÉE, prête à servir de post : une accroche, un brouillon complet (accroche, développement en quelques paragraphes courts, appel final) que ${pour} n'aura qu'à relire.`,
    `- Pour chaque piste, propose aussi un visuel ou une animation qui accompagne le post.`,
    `- Pour chaque piste, nomme TOUS les piliers qu'elle sert (de un à ${MAX_PILIERS}), le premier est le principal.`,
    `- Une piste = un angle pour ${pour}, en une phrase de ${MAX_ANGLE} caractères au plus.`,
    '- Réponds UNIQUEMENT par le bloc JSON du modèle ci-dessous, sans phrase autour.',
    '', 'LES CHAMPS (liste fermée ; tout autre champ sera ignoré)',
    `- angle (obligatoire, ${MAX_ANGLE} caractères au plus) : la piste en une phrase`,
    `- accroche (${MAX_ACCROCHE} caractères au plus) : la première phrase du post`,
    `- brouillon (${MAX_BROUILLON} caractères au plus) : le post presque prêt, paragraphes séparés par une ligne vide`,
    `- piliers (liste de 1 à ${MAX_PILIERS} identifiants de la liste ci-dessous) : tous les piliers concernés`,
    `- visuel (${MAX_VISUEL} caractères au plus) : une proposition de visuel ou d'animation (image, carrousel slide par slide, animation 16:9, vidéo 9:16 : ce qu'on y voit)`,
    `- note (${MAX_NOTE} caractères au plus) : pourquoi c’est une bonne piste`,
    `- ancre (${MAX_ANCRE} caractères au plus) : la section du site, ou les mots-clés pour retrouver le passage du résumé`,
    '- url : lien facultatif, en https',
    '- format, service : un identifiant des listes ci-dessous',
    '', 'PILIERS PERMIS', ligneListe(R.PILIERS), '', 'FORMATS PERMIS', ligneListe(R.FORMATS), '', 'SERVICES PERMIS', ligneListe(R.SERVICES));
  const recentes = [...(pistesExistantes || [])].filter((p) => texteSimple(p?.angle, MAX_ANGLE) && (!p?.sourceId || !source?.id || p.sourceId === source.id)) // seulement les pistes de CETTE source
    .sort((a, b) => (L.versDate(b.creeLe)?.getTime() ?? 0) - (L.versDate(a.creeLe)?.getTime() ?? 0)).slice(0, MAX_PISTES_DANS_PROMPT);
  l.push('', 'PISTES DÉJÀ EN STOCK POUR CETTE SOURCE');
  if (recentes.length) l.push('Ne propose rien qui dise la même chose :', ...recentes.map((p) => `- ${texteSimple(p.angle, MAX_ANGLE)}`));
  else l.push('Aucune pour l’instant.');
  l.push('', 'MODÈLE DE RÉPONSE', JSON.stringify({
    format: FORMAT_REPONSE,
    sourceId: source.id ?? '',
    pistes: [{ angle: 'La piste en une phrase.', accroche: 'La première phrase du post.', brouillon: 'Le post presque prêt.', visuel: 'Le visuel ou l’animation proposé.', note: 'Pourquoi c’est une bonne piste.', ancre: 'Section ou mots-clés.', url: 'Lien complet en https (facultatif)', piliers: ['<identifiant de pilier>', '<un autre, si la piste en sert plusieurs>'], format: '<identifiant de format>', service: '<identifiant de service>' }],
  }, null, 2));
  return l.join('\n');
}
