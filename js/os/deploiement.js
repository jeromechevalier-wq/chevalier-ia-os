// Page Réglages > Déploiement (25/10/2026) : la liste des étapes d'un déploiement, une à une, avec leur état. LOGIQUE PURE : ni DOM, ni Firebase, ni réseau (testée seule).
// La liste est ÉCRITE DANS LE CODE (elle ne se modifie pas à l'écran) : la coque déclare ici ses étapes (fonctions du serveur, personnes autorisées, étapes humaines) ;
// chaque module ajoute les siennes par son API (`controlesDeploiement()` : { etapes, verifier }), jamais par un import depuis la coque. Une fonctionnalité qui arrive
// ajoute ses lignes dans son module (mode d'emploi : docs/page-deploiement.md).
//
// Une étape : { id, groupe (moment), libelle, module (null = coque ; sinon la ligne n'existe que si ce module est actif), type: 'auto' | 'manuel',
//   controle (auto de la coque : 'serveur.<contrôle>' ; auto d'un module : résultat rendu par son `verifier`), reparation (phrase simple « comment réparer »),
//   lien (adresse https exacte d'un document ou de la console ; « {projet} » = projet Google de l'espace) ou route (écran de l'appli, ex. reglages/devis) }.
// États : auto « ok » -> vert, « manque » -> rouge, « inconnu » (ou rien) -> orange ; manuel cochée -> vert, sinon gris « à vérifier à la main ».
// Rien ici ne contient de secret, d'adresse e-mail ni de nom de client : seulement des textes fixes.

export const DOCS = 'https://github.com/jeromechevalier-wq/chevalier-ia-os/blob/main/docs/';

export const MOMENTS = Object.freeze([
  Object.freeze({ id: 'avant', libelle: 'Avant la séance' }),
  Object.freeze({ id: 'pendant', libelle: 'Pendant la séance' }),
  Object.freeze({ id: 'google', libelle: 'Réglages Google du projet' }),
  Object.freeze({ id: 'apres', libelle: 'Après la séance' }),
]);
export const ETATS_RESULTAT = Object.freeze(['ok', 'manque', 'inconnu']);
export const COULEURS = Object.freeze(['vert', 'orange', 'rouge', 'gris']);
export const TEXTES_ETAT = Object.freeze({ vert: 'Vérifié', rouge: 'À réparer', orange: 'Impossible de vérifier', gris: 'À vérifier à la main' });
/** Document où sont gardées les cases « C'est fait » : `{ <idEtape>: { fait: true, le: 'AAAA-MM-JJ' } }`, rien d'autre. */
export const DOCUMENT_COCHES = Object.freeze({ collection: 'crm_parametres', id: 'deploiement' });

const geler = (liste) => Object.freeze(liste.map((e) => Object.freeze(e)));

/** Étapes de la coque (toujours présentes, chez Jérôme comme chez chaque client). */
export const ETAPES_COQUE = geler([
  { id: 'fonctions-serveur', groupe: 'avant', libelle: 'Les fonctions du serveur répondent', module: null, type: 'auto', controle: 'serveur.fonctions',
    reparation: 'Les fonctions du serveur ne répondent pas : elles ne sont pas publiées, ou pas à jour. L’administrateur de la plateforme les publie (workflow « Déploiement plateforme clients »), puis clique sur « Revérifier ».',
    lien: `${DOCS}deploiement-plateforme.md` },
  { id: 'regles-a-jour', groupe: 'avant', libelle: 'Règles de la base publiées et à jour', module: null, type: 'manuel',
    reparation: 'Si du code a changé depuis le dernier client, l’administrateur de la plateforme publie les règles (workflow « Déploiement plateforme clients », choix « regles »).',
    lien: `${DOCS}deploiement-plateforme.md` },
  { id: 'membres', groupe: 'pendant', libelle: 'Personnes autorisées bien enregistrées', module: null, type: 'auto', controle: 'serveur.membres',
    reparation: 'Aucun éditeur, ou la copie de l’équipe ne correspond pas : ouvre Réglages > Membres et rôles et enregistre à nouveau un membre ; si rien n’y paraît, préviens l’administrateur de la plateforme.',
    // À la racine, les comptes autorisés sont écrits dans le code : le contrôle serait toujours vrai. La ligne y devient une case à cocher.
    racineManuelle: true, reparationRacine: 'Les comptes autorisés de cet espace sont fixés dans le code : vérifie qu’ils sont les bons, puis coche.',
    lien: `${DOCS}nouveau-client.md` },
  { id: 'connexion', groupe: 'pendant', libelle: 'Connexion vérifiée (fiche de test créée puis supprimée)', module: null, type: 'manuel',
    reparation: 'Ouvre l’adresse de l’espace, connecte-toi avec ton compte Google, crée une fiche de test puis supprime-la.', lien: `${DOCS}deploiement-client.md` },
  { id: 'bienvenue', groupe: 'pendant', libelle: 'E-mail de bienvenue envoyé', module: null, type: 'manuel',
    reparation: 'L’administrateur de la plateforme envoie l’e-mail de bienvenue (adresse de l’espace, mode d’emploi court, comment demander de l’aide).', lien: `${DOCS}deploiement-client.md` },
  { id: 'mcp', groupe: 'pendant', libelle: 'IA (MCP) configurée', module: null, type: 'manuel',
    reparation: 'Configure ton IA avec le lien de cet espace (menu « Connecter l’assistant »).', lien: `${DOCS}mcp-clients.md` },
  { id: 'appli-telephone', groupe: 'pendant', libelle: 'Appli installée sur le téléphone', module: null, type: 'manuel',
    reparation: 'Ouvre l’adresse de l’espace sur le téléphone, puis « Ajouter à l’écran d’accueil ».', lien: `${DOCS}deploiement-client.md` },
  { id: 'raccourci', groupe: 'pendant', libelle: 'Raccourci épinglé sur le téléphone et l’ordinateur', module: null, type: 'manuel',
    reparation: 'Épingle l’adresse de l’espace (marque-page ou raccourci du bureau).', lien: `${DOCS}deploiement-client.md` },
  { id: 'rendez-vous', groupe: 'pendant', libelle: 'Rendez-vous de suivi fixé', module: null, type: 'manuel',
    reparation: 'Fixe un rendez-vous de suivi avec l’administrateur de la plateforme, par exemple une semaine après la mise en route.', lien: `${DOCS}deploiement-client.md` },
  { id: 'sauvegarde', groupe: 'apres', libelle: 'Sauvegarde de l’espace faite', module: null, type: 'manuel',
    reparation: 'L’administrateur de la plateforme fait une sauvegarde complète de l’espace (fichier gardé en lieu sûr) et note où la retrouver.', lien: `${DOCS}deploiement-client.md` },
  { id: 'journal-clients', groupe: 'apres', libelle: 'Mise en route notée par l’administrateur de la plateforme', module: null, type: 'manuel',
    reparation: 'L’administrateur de la plateforme note ce qui a été activé dans cet espace et la date, sans donnée personnelle ni secret.', lien: `${DOCS}deploiement-client.md` },
]);

/** Contrôle d'une liste d'étapes (coque ou module) : rend la liste des problèmes (vide = correcte). Sert aux tests de chaque module. */
export function problemesEtapes(etapes) {
  const problemes = [];
  const vus = new Set();
  for (const e of Array.isArray(etapes) ? etapes : []) {
    const nom = e?.id ?? '(sans identifiant)';
    if (typeof e?.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(e.id)) problemes.push(`${nom} : identifiant invalide`);
    if (vus.has(e?.id)) problemes.push(`${nom} : identifiant en double`);
    vus.add(e?.id);
    if (!MOMENTS.some((m) => m.id === e?.groupe)) problemes.push(`${nom} : moment inconnu`);
    if (!['auto', 'manuel'].includes(e?.type)) problemes.push(`${nom} : type inconnu`);
    if (typeof e?.libelle !== 'string' || !e.libelle.trim()) problemes.push(`${nom} : libellé vide`);
    if (typeof e?.reparation !== 'string' || !e.reparation.trim()) problemes.push(`${nom} : phrase de réparation vide`);
    if (e?.lien !== undefined && !/^https:\/\//.test(e.lien)) problemes.push(`${nom} : le lien doit commencer par https://`);
    if (e?.route !== undefined && (typeof e.route !== 'string' || /^[/#]|:\/\//.test(e.route))) problemes.push(`${nom} : route invalide`);
    if (e?.lien === undefined && e?.route === undefined) problemes.push(`${nom} : ni lien ni route`);
    if (e?.module !== null && typeof e?.module !== 'string') problemes.push(`${nom} : module invalide`);
    if (/\bC[R]M\b/.test(`${e?.libelle ?? ''} ${e?.reparation ?? ''}`)) problemes.push(`${nom} : jargon interdit à l'écran (voir docs/consignes-ui.md)`);
  }
  return problemes;
}

/**
 * Étapes de CET espace : à la racine (espace de Jérôme), une ligne marquée `racineManuelle` devient une case à cocher (son contrôle n'y aurait pas de sens),
 * avec sa phrase `reparationRacine`. Chez un client, rien ne change.
 */
export function adapterEtapes(etapes, { racine = false } = {}) {
  return (etapes ?? []).map((e) => {
    if (!racine || !e?.racineManuelle) return e;
    const { controle, racineManuelle, reparationRacine, ...reste } = e;
    return { ...reste, type: 'manuel', reparation: reparationRacine || e.reparation };
  });
}

/** Étapes visibles : celles de la coque, puis celles des modules ACTIFS (une étape d'un module éteint n'existe pas), dans l'ordre des moments. */
export function etapesVisibles(etapes, actifs) {
  const a = new Set(actifs ?? []);
  return (etapes ?? []).filter((e) => e && (e.module === null || e.module === undefined || a.has(e.module)));
}

/** Les cases « C'est fait » lues dans le document : seulement les étapes manuelles connues, `fait: true` et une date AAAA-MM-JJ. */
export function lireCoches(brut, etapes) {
  const manuelles = new Set((etapes ?? []).filter((e) => e.type === 'manuel').map((e) => e.id));
  const sortie = {};
  if (!brut || typeof brut !== 'object') return sortie;
  for (const [id, v] of Object.entries(brut)) {
    if (!manuelles.has(id) || !v || v.fait !== true) continue;
    sortie[id] = { fait: true, le: typeof v.le === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.le) ? v.le : null };
  }
  return sortie;
}

/** Ce qu'on écrit quand on coche une case : `{ [id]: { fait: true, le } }` (décocher : la coque efface le champ). */
export function patchCoche(id, date) {
  return { [id]: { fait: true, le: dateJour(date) } };
}

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export function dateJour(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** « 2026-10-25 » -> « 25/10/2026 ». */
export const dateLisible = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

/**
 * Résultats des contrôles automatiques, fusionnés : `serveur` = réponse de deploiementVerifier (ou null si injoignable) ; `modules` = { idEtape: état } rendus par les modules.
 * Un état inconnu ou mal formé devient « inconnu » (orange) : une valeur venue d'ailleurs ne passe jamais telle quelle.
 */
export function resultatsDesControles(etapes, { serveur = null, modules = {} } = {}) {
  const sortie = {};
  for (const e of etapes ?? []) {
    if (e.type !== 'auto') continue;
    let brut;
    if (typeof e.controle === 'string' && e.controle.startsWith('serveur.')) brut = serveur?.controles?.[e.controle.slice('serveur.'.length)];
    else brut = modules?.[e.id];
    sortie[e.id] = ETATS_RESULTAT.includes(brut) ? brut : 'inconnu';
  }
  return sortie;
}

/** Couleur d'une étape. */
export function couleurEtape(etape, { resultats = {}, coches = {} } = {}) {
  if (etape.type === 'manuel') return coches[etape.id]?.fait === true ? 'vert' : 'gris';
  const r = resultats[etape.id];
  if (r === 'ok') return 'vert';
  if (r === 'manque') return 'rouge';
  return 'orange';
}

/** État global : rouge s'il y a du rouge, sinon orange s'il y a de l'orange, sinon gris s'il reste du manuel à faire, sinon vert. Aucune étape : gris. */
export function etatGlobal(couleurs) {
  const c = new Set(couleurs ?? []);
  if (!c.size) return 'gris';
  for (const x of ['rouge', 'orange', 'gris']) if (c.has(x)) return x;
  return 'vert';
}

/** Résumé en tête : « 11 sur 14 vertes » (les manuelles cochées comptent vertes). */
export function resume(couleurs) {
  const liste = couleurs ?? [];
  const compte = (x) => liste.filter((c) => c === x).length;
  const verts = compte('vert');
  const total = liste.length;
  return { verts, oranges: compte('orange'), rouges: compte('rouge'), gris: compte('gris'), total, texte: `${verts} sur ${total} ${verts > 1 ? 'vertes' : 'verte'}` };
}

/** Adresse du lien de réparation : « {projet} » remplacé par le projet Google de l'espace (texte fixe, jamais une donnée de client). */
export function lienEtape(etape, { projet = '' } = {}) {
  if (!etape?.lien) return null;
  return etape.lien.replaceAll('{projet}', encodeURIComponent(projet));
}

/**
 * Tout ce que l'écran affiche : { groupes: [{ id, libelle, lignes: [{ etape, couleur, texte, date }] }], resume, global, vide }.
 * `vide` : aucun module de l'espace n'ajoute d'étape (l'écran le dit ; les étapes communes restent, cases manuelles comprises).
 */
export function calculerPage({ etapes, actifs, resultats = {}, coches = {} }) {
  const visibles = etapesVisibles(etapes, actifs);
  const groupes = MOMENTS.map((m) => ({
    id: m.id, libelle: m.libelle,
    lignes: visibles.filter((e) => e.groupe === m.id).map((etape) => {
      const couleur = couleurEtape(etape, { resultats, coches });
      const date = etape.type === 'manuel' && couleur === 'vert' ? dateLisible(coches[etape.id]?.le) : '';
      return { etape, couleur, texte: couleur === 'vert' && etape.type === 'manuel' ? (date ? `Fait le ${date}` : 'Fait') : TEXTES_ETAT[couleur], date };
    }),
  })).filter((g) => g.lignes.length);
  const couleurs = groupes.flatMap((g) => g.lignes.map((l) => l.couleur));
  return { groupes, resume: resume(couleurs), global: etatGlobal(couleurs), vide: !visibles.some((e) => e.module) };
}

/**
 * Attend que `condition()` soit vraie (données d'un module lues), au plus `delaiMs` : rend true si elle l'est devenue, false sinon.
 * `surChangement(rappel)` : abonnement du module (rend la fonction de désabonnement). Aucune dépendance au DOM.
 */
export function attendreQue(condition, surChangement, delaiMs = 6000) {
  return new Promise((resoudre) => {
    let fini = false;
    let desabonner = null;
    const finir = (v) => { if (fini) return; fini = true; clearTimeout(minuteur); try { desabonner?.(); } catch { /* rien */ } resoudre(v); };
    const essayer = () => { try { if (condition()) finir(true); } catch { finir(false); } };
    const minuteur = setTimeout(() => finir(false), delaiMs);
    try { desabonner = surChangement?.(essayer) ?? null; } catch { desabonner = null; }
    essayer();
  });
}
