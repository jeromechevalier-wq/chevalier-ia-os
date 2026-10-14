// La porte : ce que les workflows n8n appellent pour lire et écrire dans les données d'un module (veille…). Voir docs/porte-cles.md.
// Ce fichier est la LOGIQUE, sans Firebase ni réseau en dur : tout ce qui touche l'extérieur (base, n8n, modules actifs, journal) est injecté.
// Il est copié dans les dossiers de fonctions (functions/partage, functions-plateforme/partage) avant les tests et le déploiement.
//
// Ordre des contrôles pour chaque appel (le premier qui échoue arrête tout, et rien n'est écrit) :
//   1. méthode POST, aucune origine de navigateur, corps JSON de taille raisonnable (couche HTTP) ;
//   2. clé valide, active, étiquette = propriétaire (cles.js)                          → 401 « cle_refusee » (toujours la même réponse) ;
//   3. plafond de requêtes par clé                                                      → 429 ;
//   4. forme de la requête, module et action connus                                     → 400 ;
//   5. module actif pour ce propriétaire (fiche du client)                             → 403 « module_non_actif » ;
//   6. intégrité : le workflow appelant appartient au propriétaire (étiquette + nom)   → 403 « workflow_refuse » ; n8n injoignable → 503 ;
//   7. validation stricte des données, puis l'action (tables veille_* du propriétaire seulement).
import { extraireBearer, verifierCle, doitNoterUsage } from './cles.js';
import { ACTIONS_VEILLE, ErreurAction, lancerAction } from './actions-veille.js';
import { ErreurValidation } from './validation.js';
import { ErreurN8n } from './n8n.js';

export const MODULES_DE_LA_PORTE = Object.freeze({ veille: ACTIONS_VEILLE });
export const OCTETS_MAX = 256 * 1024;
export const REQUETES_PAR_MINUTE = 120;
export const DUREE_CACHE_INTEGRITE_MS = 60_000;
const MOTIF_WORKFLOW = /^[A-Za-z0-9_-]{1,64}$/;
const MOTIF_NOM = /^[a-z][a-z0-9]{0,30}$/;
const POUR_QUI = ['interne', 'produit', 'perso'];

/** Erreur rendue au workflow : code stable, statut HTTP, message sans donnée sensible. */
export class ErreurPorte extends Error {
  constructor(code, message, statut) {
    super(message);
    this.name = 'ErreurPorte';
    this.code = code;
    this.statut = statut;
  }
}

/**
 * Le workflow appartient-il au propriétaire de la clé ? `workflow` : { nom, etiquettes }. Renvoie null si oui, sinon la raison (pour le journal seulement).
 *  - dans la plateforme : l'étiquette `client-<propriétaire>` (et aucune autre étiquette « client-… ») + un nom qui commence par `client-<propriétaire>-` ;
 *  - dans le CRM de Jérôme (propriétaire « interne ») : exactement une étiquette parmi interne / produit / perso, aucune étiquette de client,
 *    et un nom qui commence par ce mot suivi d'un tiret.
 */
export function raisonDeRefusIntegrite(contexte, proprietaire, workflow) {
  const etiquettes = workflow.etiquettes.map((t) => t.toLowerCase());
  const nom = workflow.nom.toLowerCase();
  const clients = etiquettes.filter((t) => t.startsWith('client-'));
  if (contexte === 'plateforme') {
    if (clients.length !== 1 || clients[0] !== `client-${proprietaire}`) return 'etiquette_client_differente';
    if (!nom.startsWith(`client-${proprietaire}-`)) return 'nom_different';
    return null;
  }
  if (contexte === 'crm') {
    if (proprietaire !== 'interne') return 'proprietaire_inconnu';
    if (clients.length > 0) return 'etiquette_client_presente';
    const pour = POUR_QUI.filter((p) => etiquettes.includes(p));
    if (pour.length !== 1) return 'pour_qui_absent_ou_multiple';
    if (!nom.startsWith(`${pour[0]}-`)) return 'nom_different';
    return null;
  }
  return 'contexte_inconnu';
}

/** Compteur par clé et par minute, en mémoire de l'instance : un frein grossier contre une boucle ou une clé volée (comme le serveur MCP). */
export function creerLimiteurMemoire({ parMinute = REQUETES_PAR_MINUTE, maintenant = Date.now } = {}) {
  const minutes = new Map();
  return {
    requete(idCourt) {
      const fenetre = Math.floor(maintenant() / 60_000);
      const c = minutes.get(idCourt);
      const n = c && c.fenetre === fenetre ? c.n + 1 : 1;
      if (minutes.size > 1000) for (const [k, v] of minutes) if (v.fenetre < fenetre) minutes.delete(k);
      if (n > parMinute) throw new ErreurPorte('limite_depassee', `Trop de requêtes pour cette clé (${parMinute} par minute).`, 429);
      minutes.set(idCourt, { fenetre, n });
    },
  };
}

/**
 * `contexte` : 'crm' (base 1) ou 'plateforme' (base 2).
 * `donnees` : { lireCle(empreinte), majCle(empreinte, partiel), lireDoc, creerSiAbsent, majDoc, lister } (adaptateur.js).
 * `n8n` : { lireWorkflow(id) } (n8n.js) — obligatoire : sans lui, la porte refuse tout (jamais de contrôle sauté en silence).
 * `modulesActifs(proprietaire)` : liste des modules actifs. `journal(entree)` : ligne sans donnée sensible.
 * Renvoie `traiter({ methode, authorization, corps })` -> { statut, corps }.
 */
export function creerPorte({ contexte, donnees, n8n, modulesActifs, limiteur = creerLimiteurMemoire(), journal = () => {}, maintenant = Date.now }) {
  const cache = new Map(); // `${propriétaire}:${workflowId}` -> expire (ms) : seulement les contrôles réussis

  async function integrite(proprietaire, workflowId, infos) {
    const cle = `${proprietaire}:${workflowId}`;
    const expire = cache.get(cle);
    if (expire && expire > maintenant()) return;
    let workflow;
    try {
      if (!n8n) throw new ErreurN8n('refuse', 'contrôle indisponible');
      workflow = await n8n.lireWorkflow(workflowId);
    } catch (e) {
      if (e instanceof ErreurN8n && e.genre === 'introuvable') { infos.code = 'workflow_introuvable'; throw new ErreurPorte('workflow_refuse', 'Ce workflow n\'est pas autorisé pour cette clé.', 403); }
      infos.code = e instanceof ErreurN8n ? `n8n_${e.genre}` : 'n8n_erreur';
      throw new ErreurPorte('verification_indisponible', 'La vérification du workflow est momentanément impossible. Réessayer plus tard.', 503);
    }
    const raison = raisonDeRefusIntegrite(contexte, proprietaire, workflow);
    if (raison) { infos.code = raison; throw new ErreurPorte('workflow_refuse', 'Ce workflow n\'est pas autorisé pour cette clé.', 403); }
    if (cache.size > 500) cache.clear();
    cache.set(cle, maintenant() + DUREE_CACHE_INTEGRITE_MS);
  }

  async function executer({ methode, authorization, corps }, infos) {
    if (methode !== 'POST') throw new ErreurPorte('methode_refusee', 'Seule la méthode POST est acceptée.', 405);
    const cle = extraireBearer(authorization);
    const verif = await verifierCle(cle, (e) => donnees.lireCle(e));
    if (!verif.ok) { infos.code = `cle_${verif.raison}`; throw new ErreurPorte('cle_refusee', 'Clé refusée.', 401); }
    infos.idCourt = verif.idCourt;
    infos.proprietaire = verif.proprietaire;
    if (doitNoterUsage({ dernierUsage: verif.dernierUsage }, maintenant())) {
      try { await donnees.majCle(verif.empreinte, { dernierUsage: new Date(maintenant()) }); } catch { /* la date de dernier usage n'est jamais une raison de refuser un appel */ }
    }
    limiteur.requete(verif.idCourt);

    if (corps === null || typeof corps !== 'object' || Array.isArray(corps)) throw new ErreurPorte('requete_invalide', 'Le corps doit être un objet JSON.', 400);
    for (const k of Object.keys(corps)) if (!['module', 'action', 'workflowId', 'donnees'].includes(k)) throw new ErreurPorte('requete_invalide', `Champ inconnu : « ${k} ».`, 400);
    const { module, action: nomAction, workflowId } = corps;
    if (typeof module !== 'string' || !MOTIF_NOM.test(module) || typeof nomAction !== 'string' || !/^[a-zA-Z.]{1,40}$/.test(nomAction)) throw new ErreurPorte('requete_invalide', '« module » et « action » sont obligatoires.', 400);
    if (typeof workflowId !== 'string' || !MOTIF_WORKFLOW.test(workflowId)) throw new ErreurPorte('requete_invalide', '« workflowId » est obligatoire (utiliser {{ $workflow.id }} dans n8n).', 400);
    const actions = Object.hasOwn(MODULES_DE_LA_PORTE, module) ? MODULES_DE_LA_PORTE[module] : null;
    const action = actions && Object.hasOwn(actions, nomAction) ? actions[nomAction] : null;
    if (!action) throw new ErreurPorte('action_inconnue', 'Module ou action inconnus.', 400);
    infos.module = module;
    infos.action = nomAction;
    infos.workflowId = workflowId;

    const actifs = await modulesActifs(verif.proprietaire);
    if (!actifs.includes(module)) throw new ErreurPorte('module_non_actif', `Le module « ${module} » n'est pas actif pour cette clé.`, 403);
    await integrite(verif.proprietaire, workflowId, infos);

    const base = contexte === 'crm' ? '' : `clients/${verif.proprietaire}`;
    try {
      const resultat = await lancerAction(action, corps.donnees, { base, donnees, auteur: `porte:${verif.idCourt}`, maintenant });
      return { statut: 200, corps: { ok: true, resultat } };
    } catch (e) {
      if (e instanceof ErreurValidation) throw new ErreurPorte(e.code, e.message, 400);
      if (e instanceof ErreurAction) throw new ErreurPorte(e.code, e.message, e.statut);
      throw e;
    }
  }

  return async function traiter(requete) {
    const debut = maintenant();
    const infos = {};
    let statut;
    let reponse;
    try {
      reponse = await executer(requete, infos);
      statut = reponse.statut;
    } catch (e) {
      if (e instanceof ErreurPorte) {
        statut = e.statut;
        reponse = { statut, corps: { ok: false, erreur: e.code, message: e.message } };
      } else {
        statut = 500;
        infos.code = `erreur_${String(e?.name ?? 'inconnue').slice(0, 30)}`;
        reponse = { statut, corps: { ok: false, erreur: 'erreur_interne', message: 'Une erreur est survenue.' } };
      }
    }
    try { journal({ ...infos, statut, dureeMs: maintenant() - debut }); } catch { /* le journal ne casse jamais un appel */ }
    return reponse;
  };
}

/**
 * Passerelle HTTP (Node) : refuse toute origine de navigateur, lit le corps avec une taille maximale, répond toujours en JSON sans mise en cache.
 * Seuls « / » et « /porte » existent (la réécriture d'hébergement envoie /porte).
 */
export function creerGestionnaireHttp(traiter, { octetsMax = OCTETS_MAX } = {}) {
  const repondre = (res, statut, corps, entetes = {}) => {
    res.writeHead(statut, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...entetes });
    res.end(JSON.stringify(corps));
  };
  return async function gestionnaire(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '') || '/';
    if (chemin !== '/' && chemin !== '/porte') return repondre(res, 404, { ok: false, erreur: 'introuvable' });
    if (req.headers.origin !== undefined) return repondre(res, 403, { ok: false, erreur: 'origine_refusee' }); // n8n n'envoie pas d'origine ; un navigateur, si
    if (req.method !== 'POST') return repondre(res, 405, { ok: false, erreur: 'methode_refusee', message: 'Seule la méthode POST est acceptée.' }, { Allow: 'POST' });
    const declare = Number(req.headers['content-length']);
    if (Number.isFinite(declare) && declare > octetsMax) return repondre(res, 413, { ok: false, erreur: 'corps_trop_gros' });
    let texte = '';
    let octets = 0;
    try {
      if (req.rawBody !== undefined) {
        // Fonctions Firebase : le corps est déjà lu (le flux est vide), il est gardé dans rawBody.
        if (req.rawBody.length > octetsMax) return repondre(res, 413, { ok: false, erreur: 'corps_trop_gros' });
        texte = req.rawBody.toString('utf8');
      } else {
        for await (const morceau of req) {
          octets += morceau.length;
          if (octets > octetsMax) return repondre(res, 413, { ok: false, erreur: 'corps_trop_gros' });
          texte += morceau.toString('utf8');
        }
      }
    } catch {
      return repondre(res, 400, { ok: false, erreur: 'requete_invalide', message: 'Corps illisible.' });
    }
    let corps;
    try { corps = JSON.parse(texte); } catch { corps = undefined; }
    const authorization = req.headers.authorization;
    // Un corps qui n'est pas du JSON : la clé est quand même vérifiée d'abord (une réponse 400 ne doit pas servir à tester l'existence d'une clé).
    const r = await traiter({ methode: req.method, authorization, corps: corps === undefined ? null : corps });
    repondre(res, r.statut, r.corps);
  };
}
