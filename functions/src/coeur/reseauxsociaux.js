// Actions du module Réseaux sociaux pour les outils MCP (13/11/2026) : lire et écrire les sources, pistes, exemples et idées.
// Mêmes règles que l'écran : les PLANS purs de js/modules/reseauxsociaux/ (copiés dans functions/partage/rs-*.js) fabriquent les écritures, le moteur d'écriture les journalise.
// Principes (cahier des charges, docs/cahier-des-charges-inspirations.md) :
//  - lien et analyse seulement : jamais le texte d'un post tiers. Aucun outil n'a de champ `extrait` ; les lectures ne le rendent pas non plus ;
//  - listes de champs FERMÉES : on ne lit dans les arguments que les champs prévus (le SDK retire déjà les autres, on ne s'y fie pas) ;
//  - aucune suppression : une piste se met « écartée », une idée « abandonnée » ;
//  - même code chez Jérôme et chez les clients (`c.donnees` est déjà rangé sous clients/<client>/ chez un client).
import * as L from '../../partage/logique.js';
import * as R from '../../partage/rs-logique.js';
import * as I from '../../partage/rs-idees.js';
import * as N from '../../partage/rs-inspirations.js';
import * as P from '../../partage/rs-pistes.js';
import { COLLECTIONS as C } from './donnees.js';
import { MAX_LIGNES } from './lecture.js';
import { serialiser } from './serialisation.js';
import { sansId } from './canonique.js';
import { ErreurMetier } from './metier.js';

const refuser = (code, message, details) => { throw new ErreurMetier(code, message, details); };
const lireDoc = async (c, collection, id, genre) => (await c.donnees.document(collection, id)) || refuser('introuvable', `${genre} introuvable : ${id}`);
const sortie = (r, extra = {}) => ({ operationId: r.operationId, ...extra, ecritures: r.ecritures.length, ...(r.auditIncomplet ? { auditIncomplet: true, avertissement: r.avertissement } : {}) });
const borne = (liste, limite) => { const max = Math.min(limite ?? MAX_LIGNES, MAX_LIGNES); return { total: liste.length, tronque: liste.length > max, elements: liste.slice(0, max) }; };
const cle = (texte) => P.cleAngle(texte);
/** La modification n'a lieu que si le document n'a pas changé depuis la lecture (une modification faite à l'écran entre-temps n'est jamais écrasée par l'ancienne valeur). */
const siInchange = (ecritures, collection, id, existant) => ecritures.map((e) => (e.type === 'modifier' && e.collection === collection && e.id === id ? { ...e, exigerAvant: sansId(existant) } : e));

/** Un plan pur lève une ErreurClaire (message lisible) : elle devient un refus de saisie, comme pour les autres outils. */
function plan(fabriquer) {
  try { return fabriquer(); } catch (e) {
    if (e instanceof I.ErreurClaire) refuser('saisie_invalide', e.message);
    throw e;
  }
}

/** Retire de ce qu'on rend à l'assistant tout `extrait` (les mots d'un tiers saisis à la main à l'écran) : l'assistant ne lit jamais le texte d'un post tiers. */
const sansExtrait = (doc) => {
  const { extrait, ...reste } = doc; // eslint-disable-line no-unused-vars
  return reste;
};
const ideeLue = (idee) => ({ ...idee, sources: (Array.isArray(idee.sources) ? idee.sources : []).map(sansExtrait) });
const sourceLue = (s) => ({ ...s, type: N.typeSource(s) });

// ---------------------------------------------------------------- lecture

export async function listerSources(c, { type, sansPiste, limite }) {
  const [sources, pistes, idees] = await Promise.all([C.reseauxInspirations, C.reseauxPistes, C.reseauxIdees].map((nom) => c.donnees.liste(nom)));
  let gardees = N.trierInspirations(sources);
  if (type) gardees = gardees.filter((s) => N.typeSource(s) === type);
  const lignes = gardees.map((s) => ({ ...sourceLue(s), compteurs: P.compteursSource(s.id, pistes, idees) }));
  const filtrees = sansPiste ? lignes.filter((l) => l.compteurs.pistes === 0) : lignes;
  const { total, tronque, elements } = borne(filtrees, limite);
  return serialiser({ total, tronque, sources: elements });
}

export async function lireSource(c, { id }) {
  const source = await lireDoc(c, C.reseauxInspirations, id, 'Source');
  const [exemples, pistes, idees] = await Promise.all([C.reseauxExemples, C.reseauxPistes, C.reseauxIdees].map((nom) => c.donnees.liste(nom)));
  const sesPistes = pistes.filter((p) => p.sourceId === id);
  const sesExemples = N.exemplesDe(exemples, id).map((e) => ({ ...sansExtrait(e), ecartALaMoyenne: N.ecartALaMoyenne(e, source)?.libelle ?? null }));
  return serialiser({
    source: sourceLue(source),
    compteurs: P.compteursSource(id, pistes, idees),
    exemples: sesExemples,
    pistes: sesPistes.map((p) => ({ ...p, etatAffiche: P.etatAffichePiste(p, idees) })),
  });
}

export async function listerPistes(c, { sourceId, etat, pilier, format, lot, limite }) {
  const [pistes, idees] = await Promise.all([C.reseauxPistes, C.reseauxIdees].map((nom) => c.donnees.liste(nom)));
  let gardees = pistes;
  if (sourceId) gardees = gardees.filter((p) => p.sourceId === sourceId);
  if (etat) gardees = gardees.filter((p) => (p.etat ?? 'nouvelle') === etat);
  if (pilier) gardees = gardees.filter((p) => R.convertirPilier(p.pilier) === pilier);
  if (format) gardees = gardees.filter((p) => p.format === format);
  if (lot) gardees = gardees.filter((p) => p.lot === lot);
  const triees = L.trier(gardees, (p) => `${p.sourceTitre ?? ''}`.toLowerCase() + String(p.angle ?? '').toLowerCase());
  const { total, tronque, elements } = borne(triees, limite);
  return serialiser({ total, tronque, pistes: elements.map((p) => ({ ...p, etatAffiche: P.etatAffichePiste(p, idees) })) });
}

export async function listerIdees(c, { etat, pilier, limite }) {
  let idees = await c.donnees.liste(C.reseauxIdees);
  if (etat) idees = idees.filter((i) => (i.etat ?? 'idee') === etat);
  if (pilier) idees = idees.filter((i) => R.convertirPilier(i.pilier) === pilier);
  const triees = L.trier(idees, (i) => String(i.angle ?? '').toLowerCase());
  const { total, tronque, elements } = borne(triees, limite);
  return serialiser({ total, tronque, idees: elements.map(ideeLue) });
}

// ---------------------------------------------------------------- sources

const CHAMPS_SOURCE = ['type', 'nom', 'url', 'pourquoi', 'piliers', 'formats', 'resume', 'veilleContenuId', 'moyenneReactions', 'moyenneCommentaires', 'nombrePostsReleves', 'releveLe'];
const choisir = (args, liste) => Object.fromEntries(liste.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]));

/** Une source de même nom, ou de même adresse, existe déjà (comparaison sans accents ni casse). */
function doublonSource(sources, valeurs, sauf = null) {
  const nom = cle(valeurs.nom);
  const url = valeurs.url ? N.normaliserUrlSource(N.typeSource(valeurs), valeurs.url) : '';
  return sources.find((s) => s.id !== sauf && ((nom && cle(s.nom) === nom) || (url && s.url && N.normaliserUrlSource(N.typeSource(s), s.url) === url)));
}

export async function creerSource(c, args) {
  const { forcer } = args;
  const valeurs = choisir(args, CHAMPS_SOURCE);
  const sources = await c.donnees.liste(C.reseauxInspirations);
  const doublon = doublonSource(sources, valeurs);
  if (doublon && !forcer) refuser('doublon', `Une source existe déjà : « ${doublon.nom} » (id ${doublon.id}). Si c'est bien une autre source, recommencer avec forcer: true.`, { doublons: [{ id: doublon.id, nom: doublon.nom }] });
  // Un résumé de veille de n8n a un identifiant prévisible (veille-<contenu>) : ajouter_pistes le retrouve, jamais deux fiches pour le même contenu.
  const id = valeurs.type === 'veille' && valeurs.veilleContenuId ? P.idSourceVeille(valeurs.veilleContenuId) : c.donnees.nouvelId(C.reseauxInspirations);
  if (sources.some((s) => s.id === id)) refuser('doublon', `Une source existe déjà pour ce contenu de veille (id ${id}).`, { doublons: [{ id }] });
  const p = plan(() => N.planEnregistrerInspiration(null, valeurs, { id, autres: sources }));
  return sortie(await c.ecrire({ operations: p.ecritures, parametres: args }), { id });
}

export async function modifierSource(c, args) {
  const { id } = args;
  const existante = await lireDoc(c, C.reseauxInspirations, id, 'Source');
  const valeurs = choisir(args, CHAMPS_SOURCE);
  if (!Object.keys(valeurs).length) refuser('saisie_invalide', 'Aucun champ à modifier.');
  const p = plan(() => N.planEnregistrerInspiration(existante, valeurs, { id }));
  return sortie(await c.ecrire({ operations: siInchange(p.ecritures, C.reseauxInspirations, id, existante), parametres: args }), { id });
}

// ---------------------------------------------------------------- pistes

const CHAMPS_PISTE = P.CHAMPS_OUTIL; // angle, note, ancre, url, pilier, format, service, exempleId : liste fermée

export async function ajouterPistes(c, args) {
  const { sourceId, nom, veilleContenuId, lot } = args;
  const entrees = (Array.isArray(args.pistes) ? args.pistes : []).map((p) => choisir(p ?? {}, CHAMPS_PISTE));
  if (entrees.length > P.MAX_PISTES_PAR_LOT) refuser('saisie_invalide', `Au plus ${P.MAX_PISTES_PAR_LOT} pistes à la fois : en envoyer 30, puis le reste dans un autre appel.`);
  // Un identifiant que le rangement des pistes couperait ou changerait (plus de 100 caractères, espaces doubles) laisserait des pistes orphelines.
  if (sourceId !== String(sourceId).replace(/\s+/g, ' ').trim().slice(0, 100)) refuser('saisie_invalide', 'Identifiant de source invalide (100 caractères au plus, sans espaces en trop).');
  const sources = await c.donnees.liste(C.reseauxInspirations);
  let source = sources.find((s) => s.id === sourceId) ?? (veilleContenuId ? sources.find((s) => N.typeSource(s) === 'veille' && s.veilleContenuId === veilleContenuId) : undefined);
  const sourceExiste = !!source;
  const idSource = source?.id ?? sourceId;
  if (!source) {
    // Seul un résumé de veille venu de n8n n'a pas encore de fiche : son identifiant est prévisible (veille-<contenu>), la fiche est créée avec les pistes. Toute autre source doit exister.
    if (!veilleContenuId || sourceId !== P.idSourceVeille(veilleContenuId)) {
      refuser('introuvable', `Source introuvable : ${sourceId}. Pour un résumé de veille qui n'a pas encore de fiche, donner veilleContenuId (l'identifiant de la source est alors « ${P.idSourceVeille(veilleContenuId || '<veilleContenuId>')} ») et nom. Sinon la créer d'abord avec creer_source_inspiration.`);
    }
    source = { id: sourceId, type: 'veille', nom: nom ?? '', veilleContenuId, pourquoi: '', url: '' };
    const erreur = N.validerInspiration(source);
    if (erreur) refuser('saisie_invalide', `${erreur} (la source de ce résumé de veille n'existe pas encore : donner son nom).`);
  }
  // Les exemples cités doivent être ceux de cette source (un exemple appartient à un profil).
  const cites = [...new Set(entrees.map((e) => e.exempleId).filter(Boolean))];
  if (cites.length) {
    const exemples = await c.donnees.liste(C.reseauxExemples);
    const inconnus = cites.filter((x) => !exemples.some((e) => e.id === x && e.profilId === idSource));
    if (inconnus.length) refuser('saisie_invalide', `exempleId inconnu pour cette source : ${inconnus.join(', ')} (voir lire_source_inspiration, exemples).`);
  }
  const pistesExistantes = (await c.donnees.liste(C.reseauxPistes)).filter((p) => p.sourceId === idSource);
  const jour = L.aujourdhuiParis(c.maintenant);
  const ordre = sourceExiste ? 0 : Math.max(-1, ...sources.map((s) => (Number.isFinite(s.ordre) ? s.ordre : -1))) + 1;
  const p = plan(() => P.planAjouterPistes(source, entrees, {
    nouvelId: (nomTable) => c.donnees.nouvelId(nomTable), jour, lot: lot || `${jour}-claude`, auteur: 'claude',
    pistesExistantes, accepterDoublons: false, sourceExiste, ordre, champsPermis: CHAMPS_PISTE,
  }));
  const ids = p.ecritures.filter((e) => e.collection === C.reseauxPistes).map((e) => e.id);
  return sortie(await c.ecrire({ operations: p.ecritures, parametres: args }), { sourceId: idSource, sourceCreee: !sourceExiste, creees: p.creees, ids, ignorees: p.ignorees, lot: lot || `${jour}-claude` });
}

export async function modifierPiste(c, args) {
  const { id } = args;
  const existante = await lireDoc(c, C.reseauxPistes, id, 'Piste');
  const valeurs = choisir(args, P.CHAMPS_MODIFIABLES);
  if (!Object.keys(valeurs).length) refuser('saisie_invalide', 'Aucun champ à modifier.');
  // « Retenue » passe par retenir_piste (qui crée l'idée et lie les deux) ; ici, seulement remettre en stock ou écarter.
  if (valeurs.etat === 'retenue') refuser('saisie_invalide', 'Pour retenir une piste, utiliser retenir_piste (il crée l’idée et lie les deux).');
  // Une piste liée à une idée ne revient pas « en stock » : elle resterait bloquée (retenir_piste la dirait déjà devenue une idée).
  if (valeurs.etat === 'nouvelle' && existante.ideeId) refuser('saisie_invalide', `Cette piste est liée à l’idée ${existante.ideeId} : on ne la remet pas en stock (abandonne l’idée avec modifier_idee, ou écarte la piste).`);
  const p = plan(() => P.planModifierPiste(existante, valeurs, { id }));
  return sortie(await c.ecrire({ operations: siInchange(p.ecritures, C.reseauxPistes, id, existante), parametres: args }), { id });
}

export async function retenirPiste(c, { id }) {
  const piste = await lireDoc(c, C.reseauxPistes, id, 'Piste');
  const source = await c.donnees.document(C.reseauxInspirations, piste.sourceId); // peut avoir disparu : la piste garde le titre et le type recopiés
  const ideeId = c.donnees.nouvelId(C.reseauxIdees);
  const p = plan(() => P.planEnFaireUneIdee(piste, source, { ideeId }));
  // La piste ne doit pas avoir changé entre la lecture et l'écriture (deux appels en même temps ne créent pas deux idées).
  const operations = p.ecritures.map((e) => (e.collection === C.reseauxPistes ? { ...e, exigerAvant: sansId(piste) } : e));
  return sortie(await c.ecrire({ operations, parametres: { id } }), { pisteId: id, ideeId });
}

// ---------------------------------------------------------------- exemples

const CHAMPS_EXEMPLE = ['profilId', 'url', 'date', 'accroche', 'structure', 'longueur', 'pourquoi', 'format', 'pilier', 'service', 'reactions', 'commentaires', 'releveLe']; // jamais `extrait`

export async function enregistrerExemple(c, args) {
  const { id } = args;
  const valeurs = choisir(args, CHAMPS_EXEMPLE);
  const exemples = await c.donnees.liste(C.reseauxExemples);
  const existant = id ? exemples.find((e) => e.id === id) ?? refuser('introuvable', `Exemple introuvable : ${id}`) : null;
  const profilId = valeurs.profilId ?? existant?.profilId;
  if (!profilId) refuser('saisie_invalide', 'Donne profilId (le profil de l’exemple) pour créer un exemple, ou id pour en mettre un à jour.');
  const profil = await lireDoc(c, C.reseauxInspirations, profilId, 'Profil');
  if (N.typeSource(profil) !== 'profil') refuser('saisie_invalide', 'Un exemple de post se rattache à un profil (une source de type profil), pas à un site ni à un résumé de veille.');
  if (existant && valeurs.profilId && valeurs.profilId !== existant.profilId) refuser('saisie_invalide', 'Un exemple ne change pas de profil.');
  const url = N.normaliserUrlLinkedin(valeurs.url ?? existant?.url);
  const doublon = url && exemples.find((e) => e.id !== id && e.profilId === profilId && N.normaliserUrlLinkedin(e.url) === url);
  if (doublon) refuser('doublon', `Cet exemple existe déjà (id ${doublon.id}) : pour changer ses chiffres ou son analyse, passer id.`, { doublons: [{ id: doublon.id }] });
  const nouvelId = id ?? c.donnees.nouvelId(C.reseauxExemples);
  const p = plan(() => N.planEnregistrerExemple(existant, valeurs, { id: nouvelId }));
  return sortie(await c.ecrire({ operations: existant ? siInchange(p.ecritures, C.reseauxExemples, nouvelId, existant) : p.ecritures, parametres: args }), { id: nouvelId });
}

// ---------------------------------------------------------------- idées

const CHAMPS_IDEE = ['angle', 'sources', 'pilier', 'format', 'service', 'etat', 'texte'];
const CHAMPS_SOURCE_IDEE = ['type', 'titre', 'url', 'ancre', 'resume', 'motsCles', 'consulteLe', 'archive']; // jamais `extrait`
const idee = (args) => {
  const valeurs = choisir(args, CHAMPS_IDEE);
  if (Array.isArray(valeurs.sources)) valeurs.sources = valeurs.sources.map((s) => choisir(s ?? {}, CHAMPS_SOURCE_IDEE));
  return valeurs;
};

export async function creerIdee(c, args) {
  const valeurs = idee(args);
  if (valeurs.etat === 'dans_buffer' && String(valeurs.texte ?? '').trim()) refuser('saisie_invalide', 'Une idée « Dans Buffer » n’a pas de texte dans le module : le texte vit dans Buffer. Créer l’idée avec son texte, puis la passer dans Buffer à la main.');
  const idees = await c.donnees.liste(C.reseauxIdees);
  const doublon = valeurs.angle && idees.find((i) => cle(i.angle) === cle(valeurs.angle));
  if (doublon && !args.forcer) refuser('doublon', `Une idée avec cet angle existe déjà (id ${doublon.id}, état ${doublon.etat ?? 'idee'}). Si c'est bien une autre idée, recommencer avec forcer: true.`, { doublons: [{ id: doublon.id, angle: doublon.angle }] });
  const id = c.donnees.nouvelId(C.reseauxIdees);
  const p = plan(() => I.planEnregistrerIdee(null, valeurs, { id }));
  return sortie(await c.ecrire({ operations: p.ecritures, parametres: args }), { id });
}

export async function modifierIdee(c, args) {
  const { id } = args;
  const existante = await lireDoc(c, C.reseauxIdees, id, 'Idée');
  const valeurs = idee(args);
  if (!Object.keys(valeurs).length) refuser('saisie_invalide', 'Aucun champ à modifier.');
  // Passer dans Buffer efface le texte du module (règle du passage de témoin) : l'écran demande confirmation, l'outil aussi.
  if (valeurs.etat !== undefined && I.effaceraLeTexte(existante, valeurs.etat) && args.effacerLeTexte !== true) {
    refuser('confirmation', 'Passer cette idée « Dans Buffer » efface son texte du module (il vit alors dans Buffer). Si le texte est déjà dans Buffer, recommencer avec effacerLeTexte: true (une copie « avant » reste dans le journal).');
  }
  if (valeurs.etat === 'dans_buffer' && existante.etat !== 'dans_buffer' && String(valeurs.texte ?? '').trim()) refuser('saisie_invalide', 'Une idée « Dans Buffer » n’a pas de texte dans le module.');
  if (valeurs.texte !== undefined && (valeurs.etat ?? existante.etat) === 'dans_buffer') refuser('saisie_invalide', 'Une idée « Dans Buffer » n’a pas de texte dans le module : il vit dans Buffer.');
  // Les mots d'un tiers saisis à l'écran (extrait) ne sont jamais montrés à l'assistant : la liste qu'il renvoie ne doit pas les effacer.
  if (valeurs.sources) {
    const anciennes = Array.isArray(existante.sources) ? existante.sources : [];
    const cleSource = (x) => `${x?.type ?? ''}|${x?.url ?? ''}|${cle(x?.titre)}`;
    const reprises = new Set();
    valeurs.sources = valeurs.sources.map((nouvelle) => {
      const k = cleSource(nouvelle);
      const j = anciennes.findIndex((a, n) => !reprises.has(n) && cleSource(a) === k);
      const ancienne = j >= 0 ? anciennes[j] : undefined;
      if (j >= 0) reprises.add(j);
      return ancienne?.extrait ? { ...nouvelle, extrait: ancienne.extrait } : nouvelle;
    });
    const perdues = anciennes.filter((a, n) => a?.extrait && !reprises.has(n));
    if (perdues.length) refuser('confirmation', `Cette liste retirerait ${perdues.length} source(s) qui portent des mots saisis à l’écran (non montrés ici) : « ${perdues.map((a) => a.titre || a.url || a.type).join(' ; ')} ». Les garder dans la liste (même type, adresse et titre), ou les retirer à l’écran.`);
  }
  const p = plan(() => I.planEnregistrerIdee(existante, valeurs, { id }));
  return sortie(await c.ecrire({ operations: siInchange(p.ecritures, C.reseauxIdees, id, existante), parametres: args }), { id });
}
