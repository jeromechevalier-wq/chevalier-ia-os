// Règles du module Console (sans Firebase ni DOM : testables seules).
// Phase 0 : le Filet de sécurité, une liste de vérifications que Jérôme fait à la main et date ici. Chaque ligne a un délai ; passé ce délai
// (ou si elle n'a jamais été faite), elle est rouge. Rien dans ce fichier ne décrit l'infrastructure (le dépôt est public) : ce sont des
// vérifications génériques, les détails vivent dans le second cerveau.
import { TEXTES_SCHEMA } from './schema-textes.js';
import { moduleDeclare } from '../../os/registre.js';

/** Vérifications du filet : id (clé du document `console_filet/<id>`), titre, aide, délai en jours avant qu'elle soit trop ancienne. */
export const LIGNES_FILET = Object.freeze([
  { id: 'sauvegarde-clients', titre: 'Sauvegarde de la base des clients constatée', aide: 'Ouvrir la console Google : la copie quotidienne et le retour à la minute sont actifs.', delai: 30 },
  { id: 'restauration', titre: 'Restauration d\'une sauvegarde essayée pour de vrai', aide: 'Restaurer une copie dans une base d\'essai et ouvrir un espace dessus.', delai: 90 },
  { id: 'retour-arriere', titre: 'Retour arrière essayé (site, fonctions, règles)', aide: 'Revenir à la version précédente de chaque élément, puis vérifier que tout marche.', delai: 90 },
  { id: 'second-proprietaire', titre: 'Second propriétaire du projet des clients', aide: 'Une personne de confiance peut gérer le projet si Jérôme est indisponible.', delai: 90 },
  { id: 'budget', titre: 'Budget et alertes de facturation des clients', aide: 'Un budget est fixé et les alertes arrivent bien.', delai: 90 },
  { id: 'guide-indisponible', titre: 'Guide « Jérôme indisponible » relu', aide: 'Le document dit qui fait quoi, où sont les accès et comment couper un service.', delai: 90 },
  { id: 'controle-deploiement', titre: 'Contrôle après déploiement essayé', aide: 'Après une publication, un test vérifie qu\'un espace s\'ouvre encore.', delai: 30 },
]);

const JOUR = 86_400_000;

/** Date d'un champ Firestore ou ISO (Timestamp avec toDate, Date, texte ISO), ou null si illisible. */
export function dateDe(valeur) {
  if (!valeur) return null;
  const d = typeof valeur.toDate === 'function' ? valeur.toDate() : valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * État d'une ligne : 'jamais' (aucune vérification enregistrée), 'ok' (dans le délai) ou 'ancien' (délai dépassé).
 * `fiche` = document `console_filet/<id>` ({ verifieLe, note }) ou undefined.
 */
export function etatLigne(ligne, fiche, maintenant = new Date()) {
  const date = dateDe(fiche?.verifieLe);
  if (!date) return { etat: 'jamais', jours: null };
  const jours = Math.max(0, Math.floor((maintenant.getTime() - date.getTime()) / JOUR));
  return { etat: jours > ligne.delai ? 'ancien' : 'ok', jours };
}

/** Les lignes du filet avec leur état : [{ ...ligne, etat, jours, note }] dans l'ordre de LIGNES_FILET. `fiches` = tableau de documents (champ `id`). */
export function lignesAvecEtat(fiches, maintenant = new Date()) {
  const parId = new Map((fiches ?? []).map((f) => [f.id, f]));
  return LIGNES_FILET.map((l) => ({ ...l, ...etatLigne(l, parId.get(l.id), maintenant), note: typeof parId.get(l.id)?.note === 'string' ? parId.get(l.id).note : '' }));
}

/** Résumé du filet : { total, ok, aRefaire } (aRefaire = jamais faites ou trop anciennes). */
export function resumeFilet(lignes) {
  const ok = lignes.filter((l) => l.etat === 'ok').length;
  return { total: lignes.length, ok, aRefaire: lignes.length - ok };
}

/** Phrase lue sous une ligne : « Jamais vérifié », « Vérifié aujourd'hui », « Vérifié il y a 12 jours ». */
export function texteEtat(l) {
  if (l.etat === 'jamais') return 'Jamais vérifié';
  if (l.jours === 0) return 'Vérifié aujourd\'hui';
  return `Vérifié il y a ${l.jours} jour${l.jours > 1 ? 's' : ''}`;
}

/** Plateformes du sélecteur : « Toutes » en premier (critère C8). Phase 0 : seule la plateforme de Jérôme est lisible. */
export const PLATEFORMES = Object.freeze([
  { id: 'toutes', libelle: 'Toutes les plateformes' },
  { id: 'jerome', libelle: 'Chevalier IA OS (Jérôme)' },
  { id: 'clients', libelle: 'Plateforme des clients' },
]);

/** Plateforme demandée dans l'adresse (« console/vue?plateforme=clients » ou segment) : inconnue -> « toutes ». */
export function plateformeValide(id) {
  return PLATEFORMES.some((p) => p.id === id) ? id : 'toutes';
}

// Versions des bâtiments (phase 2, 28/11/2026) : la réponse de `consoleVersions` mise en phrases pour l'écran. Libellés repris du schéma (schema-textes.js).
export const LIBELLES_BATIMENTS = Object.freeze({ os: TEXTES_SCHEMA.batiments[0].nom, immeuble: TEXTES_SCHEMA.batiments[1].nom });
export const TEXTE_VERSION_VIDE = 'Version inconnue : ce bâtiment n\'a pas encore été remis en ligne avec le tampon.';
export const MOTIF_SANS_TAMPON = 'pas encore de tampon';
const ETATS = Object.freeze({ a_jour: 'à jour', en_retard: 'en retard', en_attente: 'en attente du prochain tampon (moins d\'une heure)' });

/** « à jour », « en retard », « en attente du prochain tampon (moins d'une heure) » ou « inconnue » (tout autre état). */
export function texteEtatVersion(etat) {
  return ETATS[etat] ?? 'inconnue';
}

/** Date et heure d'un texte ISO, à l'heure de Paris : { jour: '28/11/2026', heure: '10:00' }, ou null. */
export function jourEtHeure(iso) {
  const d = dateDe(iso);
  if (!d) return null;
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d);
  return { jour, heure };
}

/** Une ligne d'historique en phrase : « 2.59.0 (avant : 2.58.0) », « 2.58.0 (premier tampon) » ou, si seule la structure change, « structure 1 → 2 » ; puis « , le … à … ». */
export function texteHistorique(l) {
  const q = jourEtHeure(l?.le);
  const quand = q ? `, le ${q.jour} à ${q.heure}` : '';
  const structureSeule = l?.de_version && l.de_version === l?.version && Number.isInteger(l?.de_structure) && Number.isInteger(l?.structure_code) && l.de_structure !== l.structure_code;
  if (structureSeule) return `structure ${l.de_structure} → ${l.structure_code}${quand}`;
  return `${l?.version ?? '?'}${l?.de_version ? ` (avant : ${l.de_version})` : ' (premier tampon)'}${quand}`;
}

/**
 * Une ligne de l'écran pour un bâtiment de la réponse :
 * { cle, libelle, version, depuis, vuLe, etatVersion, etatStructure, textes: { version, structure }, vide, sansTampon, motif, historique: [texte] }.
 * `vide` : aucune version lue ; `sansTampon` : la fiche n'existe pas encore (l'écran dit TEXTE_VERSION_VIDE) ; sinon l'écran montre seulement le motif.
 */
export function ligneVersion(b) {
  const depuis = jourEtHeure(b?.depuis);
  const vu = jourEtHeure(b?.vu_le);
  const vide = typeof b?.version !== 'string';
  return {
    cle: b?.cle,
    libelle: LIBELLES_BATIMENTS[b?.cle] ?? 'Bâtiment',
    version: vide ? null : b.version,
    depuis: depuis ? `depuis le ${depuis.jour}` : null,
    vuLe: vu ? `vu le ${vu.jour} à ${vu.heure}` : null,
    etatVersion: ETATS[b?.etat_version] ? b.etat_version : 'inconnu',
    etatStructure: ETATS[b?.etat_structure] ? b.etat_structure : 'inconnu',
    textes: { version: `Version : ${texteEtatVersion(b?.etat_version)}`, structure: `Structure : ${texteEtatVersion(b?.etat_structure)}` },
    vide,
    sansTampon: vide && b?.motif === MOTIF_SANS_TAMPON,
    motif: typeof b?.motif === 'string' && b.motif !== MOTIF_SANS_TAMPON ? b.motif : null,
    historique: (Array.isArray(b?.historique) ? b.historique : []).slice(0, 10).map(texteHistorique),
  };
}
/** Les lignes de l'écran, dans l'ordre de la réponse ; une réponse illisible donne une liste vide. */
export function lignesVersions(reponse) {
  return (Array.isArray(reponse?.batiments) ? reponse.batiments : []).map(ligneVersion);
}

// Registre privé des bâtiments (phase 2, PR 2, 28/11/2026) : la réponse de `consoleBatiments` mise en forme pour le schéma, la rangée de boutons et le détail.
// Les noms (appartements, maisons) arrivent du serveur, pour Jérôme seul ; ils ne sont jamais écrits dans le dépôt. Les textes fixes du dessin restent dans schema-textes.js.
export const MAX_NOM_ETAGE = 14; // fenêtre d'un étage : 124 unités
export const MAX_NOM_MAISON = 16; // nom sous une maison : colonne de 200 unités, textes agrandis dans le dessin étroit
export const MAX_ROLE_NUAGE = 14;
export const NB_ETAGES_NOMMES = 3;
export const TEXTE_REGISTRE_VIDE = 'Registre vide : les maisons s\'afficheront quand la fiche privée sera remplie.';
export const ETATS_MAISON = Object.freeze({ en_service: 'en service', en_construction: 'en construction', a_venir: 'à venir' });
const GENRE_PAR_ETAT = Object.freeze({ en_service: 'maison', en_construction: 'chantier', a_venir: 'avenir' });

/** Coupe un texte à `max` caractères (« … » compris), espaces autour retirés. */
export function tronquer(texte, max) {
  const t = String(texte ?? '').trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

const texteCourt = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const listeProjets = (l) => (Array.isArray(l) ? l : []).map((p) => ({ role: texteCourt(p?.role, 40), libelle: texteCourt(p?.libelle) })).filter((p) => p.role && p.libelle).slice(0, 10);

/** La réponse de `consoleBatiments`, relue et bornée (une réponse illisible donne des listes vides). */
export function reponseBatiments(r) {
  const apparts = (Array.isArray(r?.immeuble?.appartements) ? r.immeuble.appartements : [])
    .filter((a) => typeof a?.id === 'string' && a.id).slice(0, 30)
    .map((a) => ({ id: a.id, nom: texteCourt(a.nom) ?? a.id, modules: (Array.isArray(a.modules) ? a.modules : []).filter((m) => typeof m === 'string').slice(0, 40) }));
  const maisons = (Array.isArray(r?.maisons) ? r.maisons : [])
    .filter((m) => typeof m?.cle === 'string' && m.cle && texteCourt(m.nom) && GENRE_PAR_ETAT[m.etat]).slice(0, 20)
    .map((m) => ({ cle: m.cle, nom: texteCourt(m.nom), etat: m.etat, projets: listeProjets(m.projets) }));
  const total = Number.isInteger(r?.immeuble?.total_appartements) ? Math.max(r.immeuble.total_appartements, apparts.length) : apparts.length;
  const releves = r?.releves && typeof r.releves === 'object' && !Array.isArray(r.releves) ? r.releves : {};
  return {
    os: { projets: listeProjets(r?.os?.projets) },
    immeuble: { projets: listeProjets(r?.immeuble?.projets), appartements: apparts, total },
    maisons, releves,
    motifs: (Array.isArray(r?.motifs) ? r.motifs : []).filter((m) => typeof m === 'string').map((m) => m.slice(0, 120)).slice(0, 20),
  };
}

/** Étages de l'immeuble : « À venir », « et N autres » s'il y a plus de 3 appartements, puis les 3 premiers noms (le premier en bas). Aucun appartement : null. */
export function etagesImmeuble(appartements, total = appartements.length) {
  if (!appartements.length) return null;
  const noms = appartements.slice(0, NB_ETAGES_NOMMES).map((a) => tronquer(a.nom, MAX_NOM_ETAGE));
  const autres = Math.max(total, appartements.length) - noms.length;
  const [et, mot] = TEXTES_SCHEMA.autres;
  return [TEXTES_SCHEMA.etages[0], ...(autres > 0 ? [`${et} ${autres} ${mot}`] : []), ...noms.reverse()];
}

/**
 * Modèle du schéma pour schema.js : { batiments, etages }, ou null (aucun appartement et registre vide : le schéma figé, inchangé).
 * Les maisons du registre remplacent « Maison client 1 » (grue si en construction, pointillés si à venir) ; « Maison à venir » reste en dernier.
 */
export function modeleSchema(reponse) {
  const r = reponseBatiments(reponse);
  if (!r.immeuble.appartements.length && !r.maisons.length) return null;
  const [crm, immeuble, chantier, avenir] = TEXTES_SCHEMA.batiments;
  const maisons = r.maisons.length ? r.maisons.map((m) => ({
    nom: tronquer(m.nom, MAX_NOM_MAISON),
    genre: GENRE_PAR_ETAT[m.etat],
    nuage: [tronquer(m.projets[0]?.role ?? TEXTES_SCHEMA.nuageMaison[0], MAX_ROLE_NUAGE), tronquer(m.projets[1]?.role ?? TEXTES_SCHEMA.nuageMaison[1], MAX_ROLE_NUAGE)],
    legende: [TEXTES_SCHEMA.etats[m.etat]],
  })) : [chantier];
  return { batiments: [crm, immeuble, ...maisons, avenir], etages: etagesImmeuble(r.immeuble.appartements, r.immeuble.total) ?? TEXTES_SCHEMA.etages };
}

/** Les boutons sous le schéma : Chevalier IA OS, Chevalier IA App, chaque appartement, chaque maison. { type, cle, libelle }. */
export function boutonsBatiments(reponse) {
  const r = reponseBatiments(reponse);
  return [
    { type: 'os', cle: 'os', libelle: LIBELLES_BATIMENTS.os },
    { type: 'immeuble', cle: 'immeuble', libelle: LIBELLES_BATIMENTS.immeuble },
    ...r.immeuble.appartements.map((a) => ({ type: 'appartement', cle: a.id, libelle: a.nom })),
    ...r.maisons.map((m) => ({ type: 'maison', cle: m.cle, libelle: m.nom })),
  ];
}

const MOTIFS_RELEVE_TEXTES = Object.freeze({
  injoignable: 'injoignable (droit de lecture absent ou bâtiment hors ligne)',
  sans_tampon: 'pas encore de tampon',
});

const texteOuNull = (v, max = 40) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const entierOuNull = (v) => (Number.isInteger(v) ? v : null);

/**
 * Un relevé réduit aux champs que l'écran montre (lignesReleve), pour l'export : version, depuis, structure, dernier contact, dernier essai, motif connu,
 * et l'historique (version, version d'avant, structure, structure d'avant, date). Jamais un autre champ. Relevé absent ou illisible : null.
 */
export function releveAffiche(rel) {
  if (!rel || typeof rel !== 'object' || Array.isArray(rel)) return null;
  return {
    version: texteOuNull(rel.version), version_depuis: texteOuNull(rel.version_depuis), structure_code: entierOuNull(rel.structure_code),
    dernier_contact_ok: texteOuNull(rel.dernier_contact_ok), dernier_essai: texteOuNull(rel.dernier_essai),
    motif: Object.hasOwn(MOTIFS_RELEVE_TEXTES, rel.motif) ? rel.motif : null,
    historique: (Array.isArray(rel.historique) ? rel.historique : []).slice(0, 10).map((l) => ({
      version: texteOuNull(l?.version), de_version: texteOuNull(l?.de_version), structure_code: entierOuNull(l?.structure_code),
      de_structure: entierOuNull(l?.de_structure), le: texteOuNull(l?.le),
    })),
  };
}

/** Lignes d'un relevé (copie chez Jérôme) : { lignes: [texte], motif, historique: [texte], vide }. */
export function lignesReleve(rel) {
  if (!rel || typeof rel !== 'object') return { vide: true, lignes: [], motif: null, historique: [] };
  const depuis = jourEtHeure(rel.version_depuis);
  const contact = jourEtHeure(rel.dernier_contact_ok);
  const essai = jourEtHeure(rel.dernier_essai);
  const lignes = [
    `Version : ${typeof rel.version === 'string' ? rel.version : 'inconnue'}${depuis ? `, depuis le ${depuis.jour}` : ''}`,
    `Structure : ${Number.isInteger(rel.structure_code) ? rel.structure_code : 'inconnue'}`,
    contact ? `Vu le ${contact.jour} à ${contact.heure} (dernier contact)` : 'Jamais joint pour l\'instant',
    ...(essai && rel.motif === 'injoignable' ? [`Dernier essai le ${essai.jour} à ${essai.heure}`] : []),
  ];
  return {
    vide: false, lignes,
    motif: MOTIFS_RELEVE_TEXTES[rel.motif] ?? null,
    historique: (Array.isArray(rel.historique) ? rel.historique : []).slice(0, 10).map(texteHistorique),
  };
}

/**
 * Le détail d'un bâtiment pour le panneau : { titre, etat, projets: [texte] | null, modules: [texte] | null, note, releve }.
 * `type` : 'os', 'immeuble', 'appartement' ou 'maison' ; un appartement montre la version et l'historique de l'immeuble (même version pour tous) et ses modules.
 * Bâtiment introuvable : null.
 */
export function detailBatiment(reponse, type, cle) {
  const r = reponseBatiments(reponse);
  const projets = (l) => l.map((p) => `${p.role} : ${p.libelle}`);
  if (type === 'os' || type === 'immeuble') {
    return { titre: LIBELLES_BATIMENTS[type], etat: `État : ${ETATS_MAISON.en_service}`, projets: projets(r[type].projets), modules: null, note: null, releve: lignesReleve(r.releves[type]) };
  }
  if (type === 'appartement') {
    const a = r.immeuble.appartements.find((x) => x.id === cle);
    if (!a) return null;
    return {
      titre: a.nom, etat: `État : ${ETATS_MAISON.en_service}`, projets: null,
      modules: a.modules.map((id) => moduleDeclare(id)?.nom ?? id),
      note: `Appartement de ${LIBELLES_BATIMENTS.immeuble} : même version pour tous les appartements.`,
      releve: lignesReleve(r.releves.immeuble),
    };
  }
  if (type === 'maison') {
    const m = r.maisons.find((x) => x.cle === cle);
    if (!m) return null;
    return { titre: m.nom, etat: `État : ${ETATS_MAISON[m.etat]}`, projets: projets(m.projets), modules: null, note: null, releve: lignesReleve(r.releves[m.cle]) };
  }
  return null;
}
