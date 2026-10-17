// Reconnaissance d'un workflow n8n : à QUEL PROPRIÉTAIRE le ranger. Un propriétaire est un client (« audrey ») ou « interne » (Jérôme).
// Trois signes doivent CONCORDER (décision de Jérôme, 17/10/2026) :
//  (a) l'ÉTIQUETTE n8n : « client-<identifiant> » pour un client, « interne » pour Jérôme ;
//  (b) le NOM du workflow commence par le même mot-clé : « interne-… » pour Jérôme ; pour un client, le nom peut commencer par son identifiant (« audrey-… »)
//      mais ne l'exige pas (compatibilité : la doc n'a jamais imposé de nom aux clients) ;
//  (c) la CLÉ DE LA PORTE : le credential n8n « Clé n8n - <propriétaire> » (voir docs/porte-cles.md) utilisé par les nœuds. Pour Jérôme : « Clé n8n - interne ».
//      La comparaison est tolérante (majuscules, accents, espaces, tirets : « CLÉ N8N – Interne » = « Clé n8n - interne »).
// Règles :
//  - aucun signe : le workflow est ignoré, sans bruit (c'est le cas normal d'un workflow qui ne relève d'aucun propriétaire) ;
//  - Jérôme (« interne ») : les TROIS signes sont exigés ; un manquant ou un désaccord = jamais copié et signalé (« À vérifier ») ;
//  - client : l'étiquette est exigée ; le nom et la clé, SI présents, doivent désigner le même client (un désaccord = refusé et signalé) ;
//  - un signe qui désigne un propriétaire sans les autres (par exemple un nom « audrey-… » sans étiquette) est signalé aussi.
// Chaque signalement porte un message en français simple (champ `message`), affiché à Jérôme.
//
// Garde-fous historiques (clients) :
//  - étiquette d'un client inconnu, ou d'un client sans le module « automatisations » : workflow ignoré et signalé ;
//  - deux étiquettes de client sur un même workflow : refusé et signalé (pour aucun des deux clients) ;
//  - étiquette mal formée : ignoré et signalé.
// Un nom d'étiquette n8n fait 24 caractères au plus : « client- » en prend 7, donc l'identifiant d'un client qui veut ce module
// tient en 17 caractères au plus (les identifiants de clients vont jusqu'à 40 : voir docs/automatisations-n8n.md).

// Module « automatisations » actif ? (déplacé ici pour être partagé avec le projet du CRM, qui lit les fiches des clients en lecture seule.)
export const MODULE_AUTOMATISATIONS = 'automatisations';
/** Ancien identifiant du module (avant le renommage) : les fiches client déjà activées avec `journal: true` continuent de marcher. Voir moduleActif(). */
export const ANCIEN_MODULE_JOURNAL = 'journal';
// Les messages des journaux Cloud gardent le préfixe « Journal : » : l'alerte e-mail de Google Cloud (créée à la main dans la console) le cherche.

/**
 * Le module est-il actif d'après le champ `modules` de la fiche client ? Même règle que js/os/registre.js (un test les compare) :
 * la nouvelle clé gagne si elle est présente (true ou false) ; sinon l'ancienne clé `journal: true` compte comme `automatisations: true`.
 */
export function moduleActif(modules) {
  if (!modules || typeof modules !== 'object') return false;
  const neuf = modules[MODULE_AUTOMATISATIONS];
  if (neuf !== undefined && neuf !== null) return neuf === true;
  return modules[ANCIEN_MODULE_JOURNAL] === true;
}

export const PREFIXE_ETIQUETTE = 'client-';
export const ETIQUETTE_INTERNE = 'interne';
export const PROPRIETAIRE_INTERNE = 'interne';
/**
 * Credentials reconnus par leur IDENTIFIANT (il ne change jamais, contrairement au nom que n8n recopie dans chaque nœud : renommer un credential ne met pas à jour
 * les workflows déjà enregistrés). Propriétaire (réduit) -> identifiants. L'identifiant d'un credential n'est pas un secret (ce n'est pas sa valeur).
 * Quand l'identifiant est connu, il l'emporte sur le nom lu dans le nœud. « Clé n8n - Jérôme » = la clé `interne` de la porte (identifiant lu dans n8n le 17/10/2026).
 */
export const IDENTIFIANTS_CLES = Object.freeze({ interne: Object.freeze(['Dio4yCn4DUBgUG11']) });
export const LONGUEUR_MAX_ETIQUETTE_N8N = 24;
export const LONGUEUR_MAX_IDENTIFIANT_AUTOMATISATIONS = LONGUEUR_MAX_ETIQUETTE_N8N - PREFIXE_ETIQUETTE.length; // 17
export const MOTIF_IDENTIFIANT_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/; // même règle que l'outil « nouveau client »
export const MOTIF_ID_N8N = /^[A-Za-z0-9_-]{1,64}$/; // identifiants n8n acceptés comme noms de documents

/** Texte comparable : minuscules, sans accents, tirets typographiques ramenés à « - », espaces réduits. */
export const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[\u2010-\u2015\u2212_]/g, '-').replace(/\s+/g, ' ').trim();
/** Un identifiant de propriétaire réduit à ses lettres et chiffres : « Cabinet Martin », « cabinet-martin » et « cabinetmartin » se valent. */
const reduit = (t) => normaliser(t).replace(/[^a-z0-9]/g, '');

/** Nom du credential n8n attendu pour un propriétaire (pour les messages). */
export const nomCleDe = (proprietaire) => `Clé n8n - ${proprietaire}`;

/**
 * Propriétaire désigné par UN nom de credential : « Clé n8n - Audrey » -> 'audrey' (réduit) ; autre credential (Google, OpenAI…) -> null.
 * Tolérant : casse, accents, espaces, tiret ou deux-points (« Cle n8n : interne », « CLÉ N8N – Interne »).
 */
export function proprietaireDeLaCle(nomCredential) {
  const m = normaliser(nomCredential).match(/^cle n8n\s*[-:]?\s*(.+)$/);
  const r = m ? reduit(m[1]) : '';
  return r || null;
}

/**
 * Ce que chaque signe d'un workflow désigne. `connus` : identifiants des clients qui existent (pour reconnaître un nom « audrey-… »).
 * Renvoie { tagsClient: [identifiants], tagInterne: bool, nom: 'interne' | identifiant | null (réduit), cles: [propriétaires réduits] }.
 * `cles` : pour chaque credential, l'identifiant d'abord (s'il est dans `idsConnus`), sinon le nom « Clé n8n - <propriétaire> ».
 */
export function signesDe(w, connus = new Set(), idsConnus = IDENTIFIANTS_CLES) {
  const tags = (w.tags ?? []).map((t) => String(t));
  const tagsClient = tags.filter((t) => t.toLowerCase().startsWith(PREFIXE_ETIQUETTE)).map((t) => t.slice(PREFIXE_ETIQUETTE.length).toLowerCase());
  const tagInterne = tags.some((t) => normaliser(t) === ETIQUETTE_INTERNE);
  const nom = normaliser(w.name ?? '');
  let nomProp = null;
  // Un client peut aussi être nommé « client-<id>-… » (convention de la porte, docs/porte-cles.md) : même propriétaire.
  const candidats = [PROPRIETAIRE_INTERNE, ...connus].flatMap((c) => [[c, normaliser(c)], ...(c === PROPRIETAIRE_INTERNE ? [] : [[c, `${PREFIXE_ETIQUETTE}${normaliser(c)}`]])])
    .sort((x, y) => y[1].length - x[1].length);
  for (const [c, motif] of candidats) {
    if (nom === motif || (nom.startsWith(motif) && /^[-:\s]/.test(nom.slice(motif.length)))) { nomProp = reduit(c); break; }
  }
  const noms = w.cles ?? [];
  const ids = w.clesIds ?? [];
  const cles = [];
  for (let k = 0; k < Math.max(noms.length, ids.length); k++) {
    const parId = Object.entries(idsConnus).find(([, liste]) => ids[k] && liste.includes(ids[k]))?.[0];
    const p = parId ?? (noms[k] ? proprietaireDeLaCle(noms[k]) : null);
    if (p) cles.push(p);
  }
  return { tagsClient, tagInterne, nom: nomProp, cles: [...new Set(cles)] };
}

/**
 * Une ligne par signe, pour dire à Jérôme POURQUOI (✔ concorde, ✘ manque ou diverge) : [{ signe, ok, texte }].
 * `proprietaire` : celui que le workflow semble viser ; `exige` : vrai pour « interne » (les trois signes sont obligatoires), faux pour un client (nom et clé facultatifs).
 */
export function lignesDeSignes(w, s, proprietaire, exige) {
  const moi = reduit(proprietaire);
  const tags = (w.tags ?? []).map(String);
  const etiquette = proprietaire === PROPRIETAIRE_INTERNE ? ETIQUETTE_INTERNE : `${PREFIXE_ETIQUETTE}${proprietaire}`;
  const tagOk = proprietaire === PROPRIETAIRE_INTERNE ? s.tagInterne && s.tagsClient.length === 0 : s.tagsClient.length === 1 && s.tagsClient[0] === proprietaire && !s.tagInterne;
  const lignes = [{
    signe: 'Étiquette', ok: tagOk,
    texte: tagOk ? `Étiquette « ${etiquette} » présente.` : `Étiquette « ${etiquette} » ${tags.includes(etiquette) ? 'présente, mais avec d’autres étiquettes de propriétaire' : 'absente'} (étiquettes du workflow : ${tags.length ? tags.join(', ') : 'aucune'}).`,
  }];
  const nomOk = s.nom === moi || (!exige && s.nom === null);
  lignes.push({
    signe: 'Nom', ok: nomOk,
    texte: s.nom === moi ? `Le nom commence par « ${proprietaire}- ».` : s.nom === null
      ? (exige ? `Le nom ne commence pas par « ${proprietaire}- » (nom lu : « ${w.name ?? ''} »).` : 'Nom libre (aucune règle de nom pour un client).')
      : `Le nom (« ${w.name ?? ''} ») commence par le mot d’un autre propriétaire.`,
  });
  const lus = (w.cles ?? []).filter(Boolean).map((c) => `« ${c} »`).join(', ');
  const cleOk = s.cles.includes(moi) && s.cles.every((c) => c === moi) || (!exige && s.cles.length === 0);
  lignes.push({
    signe: 'Clé de la porte', ok: cleOk,
    texte: s.cles.includes(moi) && cleOk ? `Les nœuds utilisent la clé « ${nomCleDe(proprietaire)} ».`
      : s.cles.length === 0 ? (exige ? `Aucune clé « ${nomCleDe(proprietaire)} » dans les nœuds (credentials lus : ${lus || 'aucun'}).` : 'Aucune clé de la porte (facultatif pour un client).')
        : `Les nœuds utilisent une autre clé de la porte (credentials lus : ${lus || 'inconnus'} ; attendu : « ${nomCleDe(proprietaire)} »).`,
  });
  return lignes;
}

/** Nom d'étiquette attendu pour un client. */
export const etiquetteDuClient = (client) => `${PREFIXE_ETIQUETTE}${client}`;

/** `categorie` : « non-reconnu » (à corriger dans n8n) ou « sans-module » (workflow en règle, client sans le module : rien à corriger côté n8n). */
const CATEGORIE = { 'sans-module': 'sans-module' };
const signal = (w, raison, message, etiquettes = [], { proprietaire = null, lignes = [] } = {}) => ({
  workflowId: String(w.id).slice(0, 64), nom: String(w.name ?? '').slice(0, 120), raison, categorie: CATEGORIE[raison] ?? 'non-reconnu',
  proprietaire, etiquettes, message, lignes,
});

/**
 * Range les workflows par client.
 * `connus` : identifiants de tous les clients qui existent ; `actifs` : ceux qui ont le module « automatisations » actif ; `idsCles` : credentials reconnus par identifiant.
 * Renvoie { parClient: Map(client → [workflow]), signalements: [{ workflowId, nom, raison, categorie, proprietaire, etiquettes, message, lignes }] }.
 * Raisons : 'deux-clients', 'client-inconnu', 'sans-module', 'etiquette-invalide', 'identifiant-invalide',
 *           'signes-differents' (étiquette, nom ou clé qui désignent des propriétaires différents), 'etiquette-manquante' (un nom ou une clé de client sans étiquette).
 * Ne s'occupe PAS de « interne » : voir classerInterne().
 */
export function classer(workflows, { connus, actifs, idsCles = IDENTIFIANTS_CLES }) {
  const parClient = new Map();
  const signalements = [];
  for (const w of workflows) {
    if (!MOTIF_ID_N8N.test(String(w.id))) { signalements.push(signal(w, 'identifiant-invalide', 'L’identifiant de ce workflow dans n8n est inhabituel : il n’est pas copié.')); continue; }
    const s = signesDe(w, connus, idsCles);
    const etiquettes = (w.tags ?? []).filter((t) => String(t).toLowerCase().startsWith(PREFIXE_ETIQUETTE));
    const visee = (id) => ({ proprietaire: id, lignes: lignesDeSignes(w, s, id, false) });
    if (etiquettes.length === 0) {
      // Pas d'étiquette de client : jamais copié. Signalé seulement si le NOM ou la CLÉ désigne un client (étiquette oubliée).
      const designes = [...new Set([s.nom, ...s.cles].filter((p) => p && p !== reduit(PROPRIETAIRE_INTERNE)))];
      const client = [...connus].find((c) => designes.includes(reduit(c)));
      if (client) signalements.push(signal(w, 'etiquette-manquante', `Ce workflow semble être celui du client « ${client} » (nom ou clé de la porte), mais il n’a pas l’étiquette « ${PREFIXE_ETIQUETTE}${client} » dans n8n. Il n’est pas copié.`, [], visee(client)));
      continue; // le cas normal d'un workflow de Jérôme ou sans propriétaire : ni copié, ni bruyant
    }
    if (etiquettes.length > 1) { signalements.push(signal(w, 'deux-clients', `Ce workflow porte deux étiquettes de client (${etiquettes.join(', ')}) : on ne sait pas à qui il est. Il n’est copié chez aucun des deux.`, etiquettes)); continue; }
    const id = etiquettes[0].slice(PREFIXE_ETIQUETTE.length).toLowerCase();
    if (!MOTIF_IDENTIFIANT_CLIENT.test(id)) { signalements.push(signal(w, 'etiquette-invalide', `L’étiquette « ${etiquettes[0]} » est mal écrite (lettres, chiffres, tirets, sans espace). Il n’est pas copié.`, etiquettes)); continue; }
    if (!connus.has(id)) { signalements.push(signal(w, 'client-inconnu', `L’étiquette « ${etiquettes[0]} » désigne un client qui n’existe pas. Il n’est pas copié.`, etiquettes, visee(id))); continue; }
    if (!actifs.has(id)) {
      signalements.push(signal(w, 'sans-module', `Workflow en règle du client « ${id} », qui n’a pas (encore) le module Automatisations : il n’est pas copié. Rien à corriger dans n8n.`, etiquettes,
        { proprietaire: id, lignes: [...lignesDeSignes(w, s, id, false), { signe: 'Module', ok: false, texte: `Le module Automatisations n’est pas activé chez « ${id} ».` }] }));
      continue;
    }
    // Accord des signes : le nom et la clé, s'ils désignent quelqu'un, désignent CE client.
    const moi = reduit(id);
    const autres = [];
    if (s.tagInterne) autres.push('l’étiquette « interne »');
    if (s.nom && s.nom !== moi) autres.push(`le nom (« ${w.name} »)`);
    if (s.cles.some((c) => c !== moi)) autres.push(`la clé de la porte (« ${nomCleDe(s.cles.find((c) => c !== moi))} »)`);
    if (autres.length) { signalements.push(signal(w, 'signes-differents', `Ce workflow a l’étiquette « ${etiquettes[0]} » mais ${autres.join(' et ')} désigne${autres.length > 1 ? 'nt' : ''} quelqu’un d’autre. Il n’est pas copié tant que les signes ne concordent pas.`, etiquettes, visee(id))); continue; }
    if (!parClient.has(id)) parClient.set(id, []);
    parClient.get(id).push(w);
  }
  return { parClient, signalements };
}

/**
 * Workflows de Jérôme (propriétaire « interne »). Les TROIS signes sont exigés : étiquette « interne », nom commençant par « interne- »,
 * clé de la porte « Clé n8n - interne » (reconnue par son identifiant, sinon par son nom) parmi les credentials des nœuds.
 * Renvoie { retenus: [workflow], signalements: [...] }.
 * Un workflow qui ne relève pas de Jérôme (aucun signe « interne ») est ignoré sans bruit : le dossier d'une cliente n'est jamais copié chez lui.
 * Raisons : 'identifiant-invalide', 'signes-differents' (un signe désigne quelqu'un d'autre), 'signe-manquant' (l'un des trois manque).
 */
export function classerInterne(workflows, { connus = new Set(), idsCles = IDENTIFIANTS_CLES } = {}) {
  const retenus = [];
  const signalements = [];
  const moi = reduit(PROPRIETAIRE_INTERNE);
  for (const w of workflows) {
    const s = signesDe(w, connus, idsCles);
    const aLaCle = s.cles.includes(moi);
    if (!s.tagInterne && s.nom !== moi && !aLaCle) continue; // rien ne dit « interne »
    if (!MOTIF_ID_N8N.test(String(w.id))) { signalements.push(signal(w, 'identifiant-invalide', 'L’identifiant de ce workflow dans n8n est inhabituel : il n’est pas copié.')); continue; }
    const visee = { proprietaire: PROPRIETAIRE_INTERNE, lignes: lignesDeSignes(w, s, PROPRIETAIRE_INTERNE, true) };
    const autres = [];
    if (s.tagsClient.length) autres.push(`l’étiquette « ${PREFIXE_ETIQUETTE}${s.tagsClient[0]} »`);
    if (s.nom && s.nom !== moi) autres.push(`le nom (« ${w.name} »)`);
    if (s.cles.some((c) => c !== moi)) autres.push(`la clé de la porte (« ${nomCleDe(s.cles.find((c) => c !== moi))} »)`);
    if (autres.length) { signalements.push(signal(w, 'signes-differents', `Ce workflow est lié à « interne » mais ${autres.join(' et ')} désigne${autres.length > 1 ? 'nt' : ''} quelqu’un d’autre. Il n’est pas copié.`, [], visee)); continue; }
    const manque = [];
    if (!s.tagInterne) manque.push('l’étiquette « interne »');
    if (s.nom !== moi) manque.push('un nom qui commence par « interne- »');
    if (!aLaCle) manque.push(`la clé de la porte (le credential « ${nomCleDe(PROPRIETAIRE_INTERNE)} » dans les nœuds)`);
    if (manque.length) { signalements.push(signal(w, 'signe-manquant', `Pour être rangé chez toi, ce workflow doit avoir les trois signes. Il manque : ${manque.join(', ')}. Il n’est pas copié.`, [], visee)); continue; }
    retenus.push(w);
  }
  return { retenus, signalements };
}
