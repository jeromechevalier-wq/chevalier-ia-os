// Règles pures de l'import LinkedIn (aucune dépendance à Firebase ni au DOM : testables par `node --test`).
// Entrée : le contenu de trois fichiers de l'archive (messages, relations, profil), déjà décompressés en texte. Sortie : un plan d'écriture (liste d'écritures du journal) et des compteurs.
// Principes (cahier des charges, 11/11/2026) :
//  - on ne garde un échange que si les DEUX personnes ont écrit (règle des deux voix) ; les conversations de groupe et le dossier « spam » sont ignorés ;
//  - jamais d'écrasement : une personne existante reçoit seulement une activité et, si son champ LinkedIn est vide, son adresse de profil ;
//  - le texte des messages n'est jamais gardé ni écrit : l'activité porte un titre CALCULÉ (nombre de messages, sens et jour du dernier), jamais copié ;
//  - aucune organisation n'est créée ni rattachée.
import * as L from '../crm/logique.js';
import { lireCsv, lireTable, COLONNES_MESSAGES, REQUISES_MESSAGES, COLONNES_RELATIONS, REQUISES_RELATIONS, COLONNES_PROFIL, REQUISES_PROFIL } from './csv.js';

export const COLLECTION_IMPORTS = 'reseauxsociaux_imports'; // même nom que dans logique.js du module (copié ici pour que ce fichier ne dépende de rien d'autre)
export const LIMITE_RESUME_LINKEDIN = 200; // caractères au plus pour le titre d'une activité LinkedIn écrite par l'import
export const NOM_CATEGORIE_A_CLASSER = 'À classer';
export const SOURCE_LINKEDIN = 'LinkedIn';
export const FICHIERS_UTILES = Object.freeze(['messages.csv', 'connections.csv', 'profile.csv']);

/** Erreur dont le message est fait pour être montré tel quel (`saisie`) ; `ecrireEchec` : le fichier a été lu jusqu'au bout, l'échec peut être consigné. */
export class ErreurImport extends Error {
  constructor(message, { ecrireEchec = false } = {}) { super(message); this.name = 'ErreurImport'; this.saisie = true; this.ecrireEchec = ecrireEchec; }
}

// ---------------------------------------------------------------- adresses de profil

const MOTIF_PROFIL = /^https?:\/\/(?:[a-z0-9-]+\.)*linkedin\.com\/in\/([^/?#\s]+)/i;
const NOMS_GENERIQUES = new Set(['membre linkedin', 'linkedin member', 'utilisateur linkedin', 'linkedin user']);

/** « linkedin.com/in/alice-exemple » (minuscules, sans protocole, sans « www. », sans « ?… » ni « / » final) ou null si l'adresse n'est pas un profil exploitable. */
export function normaliserProfil(url) {
  const m = MOTIF_PROFIL.exec(String(url ?? '').trim());
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* garde le texte tel quel */ }
  return `linkedin.com/in/${slug.toLowerCase()}`;
}

/** Adresse de profil à écrire dans la fiche (https, sans « ?… » ni « / » final), ou null. */
export function adresseProfil(url) {
  const m = MOTIF_PROFIL.exec(String(url ?? '').trim());
  return m ? `https://www.linkedin.com/in/${m[1]}` : null;
}

export const nomGenerique = (nom) => NOMS_GENERIQUES.has(L.normaliserNom(nom));

// ---------------------------------------------------------------- lecture des fichiers

const listeVirgules = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/** Date de l'export (« 2026-11-09 14:03:22 UTC ») -> Date, ou null. */
export function lireDate(texte) {
  const t = String(texte ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(?:UTC|Z)?$/i.exec(t);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))) : (t ? new Date(t) : null);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Lit les trois fichiers. `messagesCsv` est obligatoire ; `connexionsCsv` et `profilCsv` sont facultatifs.
 * Rend { messagesLus, conversations: Map(id -> conversation), connexions: [{ nom, url }], profil: nom | null }.
 * Une conversation : { id, participants: Map(cle -> { nom, url }), ecrits: Map(cle -> nombre), nbMessages, dernierLe, dernierPar, spam }. Le TEXTE des messages n'est jamais lu.
 */
export function lireArchive({ messagesCsv, connexionsCsv = null, profilCsv = null }) {
  if (typeof messagesCsv !== 'string') throw new ErreurImport('Je n’ai pas trouvé tes messages dans l’archive (le fichier « messages.csv » manque).', { ecrireEchec: true });
  const table = lireTable(lireCsv(messagesCsv), COLONNES_MESSAGES, REQUISES_MESSAGES);
  if (!table) throw new ErreurImport('Je n’ai pas reconnu le fichier des messages : les colonnes attendues n’y sont pas.', { ecrireEchec: true });
  const conversations = new Map();
  for (const m of table.lignes) {
    if (!m.conversation) continue;
    let c = conversations.get(m.conversation);
    if (!c) {
      c = { id: m.conversation, participants: new Map(), ecrits: new Map(), nbMessages: 0, dernierLe: null, dernierPar: null, spam: false };
      conversations.set(m.conversation, c);
    }
    c.nbMessages++;
    if (L.normaliserNom(m.dossier) === 'spam') c.spam = true;
    const ajouter = (nom, url) => {
      const cle = L.normaliserNom(nom);
      if (!cle) return null;
      const existant = c.participants.get(cle);
      if (!existant) c.participants.set(cle, { nom: nom.trim(), url: url || '' });
      else if (!existant.url && url) existant.url = url;
      return cle;
    };
    const expediteur = ajouter(m.de, m.urlDe);
    const destinataires = listeVirgules(m.vers);
    const urls = listeVirgules(m.urlVers);
    destinataires.forEach((nom, i) => ajouter(nom, urls.length === destinataires.length ? urls[i] : ''));
    if (expediteur) {
      c.ecrits.set(expediteur, (c.ecrits.get(expediteur) ?? 0) + 1);
      const d = lireDate(m.date);
      if (d && (!c.dernierLe || d.getTime() >= c.dernierLe.getTime())) { c.dernierLe = d; c.dernierPar = expediteur; }
    }
  }
  const connexions = [];
  const tableRelations = typeof connexionsCsv === 'string' ? lireTable(lireCsv(connexionsCsv), COLONNES_RELATIONS, REQUISES_RELATIONS) : null;
  for (const r of tableRelations?.lignes ?? []) {
    const nom = `${r.prenom} ${r.nom}`.replace(/\s+/g, ' ').trim();
    if (nom) connexions.push({ nom, url: r.url });
  }
  const tableProfil = typeof profilCsv === 'string' ? lireTable(lireCsv(profilCsv), COLONNES_PROFIL, REQUISES_PROFIL) : null;
  const l0 = tableProfil?.lignes[0];
  const profil = l0 && `${l0.prenom} ${l0.nom}`.trim() ? `${l0.prenom} ${l0.nom}`.replace(/\s+/g, ' ').trim() : null;
  return { messagesLus: table.lignes.length, conversations, connexions, profil };
}

// ---------------------------------------------------------------- propriétaire

/**
 * Qui est la personne qui a exporté l'archive ? Le nom présent dans le plus grand nombre de conversations ; confirmé par le profil s'il est lisible.
 * Rend la clé du propriétaire (nom normalisé) ou lève une erreur « Je n’ai pas reconnu ton profil dans l’archive. » (égalité sans profil, ou profil qui ne correspond pas).
 */
export function trouverProprietaire(conversations, profil = null) {
  const compte = new Map();
  for (const c of conversations.values()) for (const cle of c.participants.keys()) compte.set(cle, (compte.get(cle) ?? 0) + 1);
  const echec = () => new ErreurImport('Je n’ai pas reconnu ton profil dans l’archive.', { ecrireEchec: true });
  if (!compte.size) throw echec();
  const max = Math.max(...compte.values());
  const tetes = [...compte].filter(([, n]) => n === max).map(([cle]) => cle);
  const cleProfil = profil ? L.normaliserNom(profil) : '';
  // Nom du profil écrit un peu autrement dans les messages (titre derrière le nom) : l'un commence par l'autre.
  const proche = (a, b) => !!a && !!b && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `));
  if (cleProfil) {
    const candidats = tetes.filter((cle) => proche(cle, cleProfil));
    if (candidats.length === 1) return candidats[0];
    throw echec();
  }
  if (tetes.length === 1) return tetes[0];
  throw echec();
}

// ---------------------------------------------------------------- classement des conversations

const URL_PAR_NOM_UNIQUE = (connexions) => {
  const parNom = new Map();
  for (const x of connexions) {
    const cle = L.normaliserNom(x.nom);
    parNom.set(cle, parNom.has(cle) ? null : x); // deux relations de même nom : on ne devine pas
  }
  return parNom;
};

/**
 * Classe chaque conversation. Rend { retenues: [...], compteurs: { ignoreesUneVoix, ignoreesGroupe, ignoreesAmbigues } }.
 * Une conversation retenue : { id, nbMessages, dernierLe, sens ('envoye' | 'recu'), autre: { nom, url (adresse à écrire ou null), cleUrl } }.
 * `ignoreesAmbigues` reçoit aussi une conversation sans aucune date lisible (rien de sûr à écrire).
 */
export function classerConversations(archive, proprietaire) {
  const retenues = [];
  const compteurs = { ignoreesUneVoix: 0, ignoreesGroupe: 0, ignoreesAmbigues: 0 };
  const parNom = URL_PAR_NOM_UNIQUE(archive.connexions);
  for (const c of archive.conversations.values()) {
    if (c.participants.size > 2) { compteurs.ignoreesGroupe++; continue; }
    const autres = [...c.participants.keys()].filter((cle) => cle !== proprietaire);
    if (c.spam || c.participants.size !== 2 || !c.participants.has(proprietaire) || autres.length !== 1) { compteurs.ignoreesUneVoix++; continue; }
    const cleAutre = autres[0];
    if (!(c.ecrits.get(proprietaire) > 0) || !(c.ecrits.get(cleAutre) > 0)) { compteurs.ignoreesUneVoix++; continue; }
    if (!c.dernierLe) { compteurs.ignoreesAmbigues++; continue; }
    const p = c.participants.get(cleAutre);
    const generique = nomGenerique(p.nom);
    const brute = generique ? '' : (p.url || parNom.get(cleAutre)?.url || '');
    retenues.push({
      id: c.id,
      nbMessages: c.nbMessages,
      dernierLe: c.dernierLe,
      sens: c.dernierPar === proprietaire ? 'envoye' : 'recu',
      autre: { nom: p.nom, generique, url: adresseProfil(brute), cleUrl: normaliserProfil(brute) },
    });
  }
  return { retenues, compteurs };
}

// ---------------------------------------------------------------- titre, clé anti-doublon, empreinte courte

/** « 2026-11-09 » -> « 09/11/2026 ». */
export const jourFrancais = (jour) => { const [a, m, j] = String(jour).split('-'); return `${j}/${m}/${a}`; };

/** Titre CALCULÉ d'une activité LinkedIn : « Échange LinkedIn : 8 messages, le dernier reçu le 09/11/2026. » (jamais copié d'un message ; 200 caractères au plus). */
export function resumeEchange({ nbMessages, sens, dernierLe }) {
  const n = Math.max(1, Math.trunc(Number(nbMessages) || 1));
  const jour = L.jourParis(dernierLe);
  const quand = jour ? ` le ${jourFrancais(jour)}` : '';
  return `Échange LinkedIn : ${n} message${n > 1 ? 's' : ''}, le dernier ${sens === 'envoye' ? 'envoyé' : 'reçu'}${quand}.`.slice(0, LIMITE_RESUME_LINKEDIN);
}

/** Empreinte courte (14 caractères hexadécimaux) d'un texte : sert de clé anti-doublon (« cyrb53 », rapide et sans dépendance). */
export function empreinteCourte(texte) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const t = String(texte ?? '');
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Clé anti-doublon d'une activité importée : `<empreinte de l'identifiant de conversation>:<nombre de messages>` (80 caractères au plus). */
export const cleImport = (idConversation, nbMessages) => `${empreinteCourte(idConversation)}:${nbMessages}`;

// ---------------------------------------------------------------- appariement avec le CRM

/**
 * Cherche la personne du CRM qui correspond à l'interlocuteur : d'abord par adresse de profil, puis par nom.
 * Rend { genre: 'existante', personne } | { genre: 'ambigue' } | { genre: 'aucune' }.
 * Par nom, une personne qui porte DÉJÀ une autre adresse de profil n'est pas retenue (deux homonymes ne se confondent pas) ; les fiches de test sont ignorées.
 */
export function apparier(autre, personnes) {
  const vivantes = personnes.filter((p) => p.test !== true);
  if (autre.cleUrl) {
    const parUrl = vivantes.filter((p) => normaliserProfil(p.linkedin) === autre.cleUrl);
    if (parUrl.length === 1) return { genre: 'existante', personne: parUrl[0] };
    if (parUrl.length > 1) return { genre: 'ambigue' };
  }
  if (autre.generique) return { genre: 'aucune' };
  const cle = L.normaliserNom(autre.nom);
  const parNom = vivantes.filter((p) => L.normaliserNom(p.nom) === cle && !(autre.cleUrl && String(p.linkedin ?? '').trim() && normaliserProfil(p.linkedin) !== autre.cleUrl));
  if (parNom.length === 1) return { genre: 'existante', personne: parNom[0] };
  if (parNom.length > 1) return { genre: 'ambigue' };
  return { genre: 'aucune' };
}

// ---------------------------------------------------------------- plan d'écriture

export const resultatVierge = () => ({
  personnesCreees: 0, personnesRattachees: 0, activitesCreees: 0,
  ignoreesUneVoix: 0, ignoreesGroupe: 0, ignoreesAmbigues: 0, ignoreesDejaVues: 0, ignoreesSansProfil: 0,
});

/** Nom de fichier sans chemin, 200 caractères au plus. */
export const nomFichierPropre = (nom) => String(nom ?? '').split(/[\\/]/).pop().slice(0, 200);

/**
 * Plan complet d'un import : { ecritures, resultat, lu }. Le document d'import (`reseauxsociaux_imports`) est la DERNIÈRE écriture :
 * un import interrompu à mi-parcours n'en laisse aucun, donc le relancer est permis et termine le travail (grâce aux clés anti-doublon).
 * `contexte` : { archive, proprietaire, personnes, activites (déjà écrites : on y lit `cleImport`), etiquetteId (ou null), fichier, octets, empreinte }.
 * `ctx` : le contexte habituel de la logique du CRM (maintenant, auteur, nouvelId(collection)).
 */
export function construirePlan({ archive, proprietaire, personnes, activites = [], etiquetteId = null, fichier, octets, empreinte }, ctx) {
  const { retenues, compteurs } = classerConversations(archive, proprietaire);
  const resultat = { ...resultatVierge(), ...compteurs };
  const dejaVues = new Set(activites.map((a) => a.cleImport).filter(Boolean));
  const ecritures = [];
  const rattachees = new Set();
  const completees = new Set(); // personnes dont on a rempli l'adresse de profil (une seule fois)
  const creeesParProfil = new Map(); // cleUrl -> id d'une personne créée dans CET import
  for (const conv of retenues) {
    const cle = cleImport(conv.id, conv.nbMessages);
    if (dejaVues.has(cle)) { resultat.ignoreesDejaVues++; continue; }
    let personneId = null;
    const m = apparier(conv.autre, personnes);
    if (m.genre === 'ambigue') { resultat.ignoreesAmbigues++; continue; }
    if (m.genre === 'existante') {
      personneId = m.personne.id;
      if (conv.autre.url && !String(m.personne.linkedin ?? '').trim() && !completees.has(personneId)) {
        completees.add(personneId);
        ecritures.push(...L.planMajPersonne(personneId, { linkedin: conv.autre.url }).ecritures);
      }
      rattachees.add(personneId);
    } else if (conv.autre.cleUrl && creeesParProfil.has(conv.autre.cleUrl)) {
      personneId = creeesParProfil.get(conv.autre.cleUrl);
    } else if (conv.autre.url) {
      // Deux écritures (`nouvellePersonne` impose un champ LinkedIn vide) : création, puis adresse de profil.
      const creation = L.planCreerPersonne({ nom: conv.autre.nom, source: SOURCE_LINKEDIN, etiquettes: etiquetteId ? [etiquetteId] : [] }, ctx);
      personneId = creation.id;
      ecritures.push(...creation.ecritures, ...L.planMajPersonne(personneId, { linkedin: conv.autre.url }).ecritures);
      creeesParProfil.set(conv.autre.cleUrl, personneId);
      resultat.personnesCreees++;
    } else { resultat.ignoreesSansProfil++; continue; }
    const titre = resumeEchange(conv);
    ecritures.push(...L.planCreerActivite({
      type: 'linkedin', titre, date: L.jourParis(conv.dernierLe), fait: true, dateFait: conv.dernierLe,
      sens: conv.sens, voix: 2, cleImport: cle, personneId,
    }, ctx).ecritures);
    dejaVues.add(cle);
    resultat.activitesCreees++;
  }
  resultat.personnesRattachees = rattachees.size;
  const lu = { connexions: archive.connexions.length, conversations: archive.conversations.size, messages: archive.messagesLus };
  ecritures.push(ecritureImport(ctx, { fichier, octets, empreinte, statut: 'termine', lu, resultat }));
  return { ecritures, resultat, lu };
}

/** Écriture du document d'import (l'heure et l'auteur sont posés par le journal : `horodater` et `signer`). */
export function ecritureImport(ctx, { fichier, octets, empreinte, statut, erreur = null, lu = null, resultat = null }) {
  const donnees = {
    fichier: nomFichierPropre(fichier),
    octets: Math.max(0, Math.trunc(Number(octets) || 0)),
    empreinte: String(empreinte ?? ''),
    statut,
    lu: lu ?? { connexions: 0, conversations: 0, messages: 0 },
    resultat: resultat ?? resultatVierge(),
    ...(erreur ? { erreur: String(erreur).slice(0, 300) } : {}),
  };
  return L.ecritureCreer(COLLECTION_IMPORTS, ctx.nouvelId(COLLECTION_IMPORTS), donnees, { horodater: ['creeLe'], signer: ['auteur'] });
}

/** Plan d'un import échoué après lecture complète du fichier : une seule écriture, le document `statut: 'echec'`. */
export const planEchec = (infos, ctx) => ({ ecritures: [ecritureImport(ctx, { ...infos, statut: 'echec' })] });

const dateDe = (v) => { const d = L.versDate(v); return d && !Number.isNaN(d.getTime()) ? d : null; };

/** Refus « déjà importé » : la date (JJ/MM/AAAA, jour de Paris) du premier import `termine` qui porte la même empreinte, ou null. */
export function dejaImporte(empreinte, imports) {
  const trouve = (imports ?? []).filter((i) => i.statut === 'termine' && i.empreinte === empreinte).map((i) => dateDe(i.creeLe)).filter(Boolean).sort((a, b) => a - b)[0];
  return trouve ? jourFrancais(L.jourParis(trouve)) : null;
}

/** Les imports, du plus récent au plus ancien (tri dans le navigateur : jamais de orderBy dans la requête). */
export function historiqueImports(imports) {
  const t = (i) => dateDe(i.creeLe)?.getTime() ?? 0;
  return [...(imports ?? [])].sort((a, b) => t(b) - t(a));
}

/** Date lisible d'un import (JJ/MM/AAAA) ou chaîne vide. */
export function dateImport(i) {
  const d = dateDe(i?.creeLe);
  return d ? jourFrancais(L.jourParis(d)) : '';
}

// ---------------------------------------------------------------- réponse de la boîte mail

/** Le lien rendu par la vérification de la boîte n'est utilisé que s'il est en https sur linkedin.com (ou un sous-domaine) : sinon null. Jamais rendu tel quel. */
export function lienLinkedinSur(lien) {
  try {
    const u = new URL(String(lien ?? ''));
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const hote = u.hostname.toLowerCase();
    return hote === 'linkedin.com' || hote.endsWith('.linkedin.com') ? u.href : null;
  } catch { return null; }
}
