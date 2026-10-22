// Actions de la porte pour le module Automatisations : la file « À valider ». Une action n'agit QUE sur la table automatisations_propositions du propriétaire
// de la clé (`base` : '' chez Jérôme, « clients/<id> » chez un client) : le nom de la table est écrit ici, jamais reçu. Aucune suppression.
//  - propositions.demarrer       : le workflow A crée la ligne dès son démarrage (« en préparation »), avec son plan d'étapes (jalons annoncés d'avance, 3 à 8 conseillés) ;
//  - propositions.etape          : le « Logger » : une étape du plan change d'état (en cours, fait, échec, ignorée) ; permis en préparation (A) et validée (B) ;
//  - propositions.abandonner     : A a échoué avant le dépôt : la ligne passe à « abandonnée » (terminal) ;
//  - propositions.ajouter        : un workflow DÉPOSE une proposition : crée la ligne si elle n'existe pas, la FINALISE si elle est « en préparation » (rejouer ne change rien) ;
//  - propositions.lireValidees   : les propositions validées par le propriétaire, les plus anciennes d'abord (pour que le workflow les applique) ;
//  - propositions.marquerAppliquee / propositions.marquerEchec : le workflow dit ce qu'il est advenu d'une proposition validée.
// Les transitions viennent du fichier pur js/modules/automatisations/propositions.js (jamais recopiées ici). Il n'existe PAS d'action « décider » :
// valider ou refuser se fait à l'écran ou par MCP, jamais par un workflow. Le propriétaire vient de la clé, jamais du corps.
// Le journal de la porte ne reçoit jamais le titre, le résumé, les champs ni le lien (liste blanche dans functions/src/porte.js).
import { ErreurAction } from './actions-veille.js';
import { MOTIF_SECRET } from './validation.js';
// Dans functions/partage/porte/, cet import est réécrit en '../propositions.js' (scripts/preparer-fonctions.js).
import { ETATS, MAX_ETAPES, ETATS_ETAPE, abandonner, ajouterEtape, demarrer, enMs, finaliser, marquerAppliquee, marquerEchec } from '../../js/modules/automatisations/propositions.js';

export const TABLE_PROPOSITIONS = 'automatisations_propositions';
export const MAX_CHAMPS = 40;
export const MAX_LECTURE_VALIDEES = 100;

const SCHEMA_DEMARRAGE = {
  id: { type: 'idsur', requis: true },
  type: { type: 'libre', max: 40, min: 1, requis: true },
  titre: { type: 'libre', max: 120, min: 1 },
  executionId: { type: 'id' },
  plan: { type: 'liste', max: MAX_ETAPES, item: { cle: { type: 'etiquette', requis: true }, libelle: { type: 'libre', max: 60, min: 1, requis: true } } },
};
const SCHEMA_ETAPE = {
  id: { type: 'idsur', requis: true },
  cle: { type: 'etiquette', requis: true },
  libelle: { type: 'libre', max: 60, min: 1, requis: true },
  etat: { type: 'choix', valeurs: ETATS_ETAPE, requis: true },
};

const chemin = (base, id) => `${base ? `${base}/` : ''}${TABLE_PROPOSITIONS}${id === undefined ? '' : `/${id}`}`;

const SCHEMA_AJOUT = {
  id: { type: 'idsur', requis: true },
  type: { type: 'libre', max: 40, min: 1, requis: true },
  titre: { type: 'libre', max: 120, min: 1, requis: true },
  resume: { type: 'libre', max: 2000 },
  champs: { type: 'liste', max: MAX_CHAMPS, item: { nom: { type: 'libre', max: 40, min: 1, requis: true }, valeur: { type: 'libre', max: 500, requis: true } }, requis: true },
  lien: { type: 'url' },
  executionId: { type: 'id' },
};

/** Document → objet sans danger pour la réponse JSON (dates en texte ISO). */
function versJson(doc) {
  const { proprietaire, ecritPar, ...reste } = doc;
  return JSON.parse(JSON.stringify(reste, (_, v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
}

/** Refus d'une règle pure -> erreur de la porte : contenu invalide = 400, état incompatible = 409. */
const erreurDe = (r) => (r.code === 'champs_invalides' ? new ErreurAction('requete_invalide', r.message, 400) : new ErreurAction(r.code, r.message, 409));

/**
 * Lit la proposition, applique la transition PURE, écrit seulement les champs qui changent avec la précondition « le document n'a pas changé depuis ma lecture ».
 * Si la précondition échoue (une décision est arrivée entre-temps), on relit UNE fois et on réapplique la règle ; un deuxième échec est une erreur claire.
 */
async function transition({ base, donnees, auteur }, id, appliquer, champsEcrits, dejaFait) {
  const chem = chemin(base, id);
  for (let essai = 1; essai <= 2; essai++) {
    const existant = await donnees.lireDoc(chem);
    if (!existant) throw new ErreurAction('proposition_inconnue', 'Proposition inconnue.', 404);
    const { updateTime, ...proposition } = existant;
    // Idempotence : rappeler la même action (le workflow rejoue après un délai réseau) ne change rien et réussit avec deja: true.
    if (proposition.etat === dejaFait) return { proposition, deja: true };
    const r = appliquer(proposition);
    if (!r.ok) throw erreurDe(r);
    // Rien à écrire (étape rejouée à l'identique) : succès sans écriture.
    if (r.inchangee) return { proposition: r.proposition, deja: true };
    const maj = { ...Object.fromEntries(champsEcrits.map((c) => [c, r.proposition[c]])), ecritPar: auteur };
    const ecrit = await donnees.majDoc(chem, maj, updateTime ? { lastUpdateTime: updateTime } : undefined);
    if (ecrit === false) throw new ErreurAction('proposition_inconnue', 'Proposition inconnue.', 404);
    if (ecrit?.preconditionEchouee === true) continue;
    return { proposition: r.proposition, deja: false };
  }
  throw new ErreurAction('conflit_ecriture', 'La proposition a changé pendant l\'écriture : réessayer.', 409);
}

/** ctx : { base, donnees, auteur, maintenant() }. `donnees` : voir adaptateur.js (lireDoc, creerSiAbsent, majDoc, lister). */
export const ACTIONS_AUTOMATISATIONS = Object.freeze({
  'propositions.ajouter': {
    ecrit: true,
    schema: SCHEMA_AJOUT,
    async executer(ctx, d) {
      const { base, donnees, auteur, maintenant } = ctx;
      const noms = new Set();
      for (const c of d.champs) {
        if (noms.has(c.nom)) throw new ErreurAction('requete_invalide', 'Deux champs portent le même nom.');
        noms.add(c.nom);
      }
      const t = maintenant();
      // Ligne neuve : démarrer() puis finaliser() (la même logique que pour une ligne déjà « en préparation »), jamais une copie des règles ici.
      const debut = demarrer({ id: d.id, type: d.type, titre: d.titre, executionId: d.executionId, maintenant: t });
      const neuve = debut.ok ? finaliser(debut.proposition, { titre: d.titre, resume: d.resume, champs: d.champs, lien: d.lien, maintenant: t }) : debut;
      if (!neuve.ok) throw erreurDe(neuve);
      const { id: _id, ...doc } = neuve.proposition;
      if (await donnees.creerSiAbsent(chemin(base, d.id), { ...doc, ecritPar: auteur })) return { id: d.id, cree: true, etat: ETATS.A_VALIDER };
      // La ligne existe : « en préparation » -> on la finalise (précondition sur lastUpdateTime : la course est réglée) ; déjà « à valider » -> rejeu sans effet ;
      // déjà décidée (ou abandonnée) -> on répond l'état courant SANS erreur (un rejeu tardif du workflow ne doit pas le faire échouer).
      try {
        const { proposition: p, deja } = await transition(ctx, d.id, (x) => finaliser(x, { titre: d.titre, resume: d.resume, champs: d.champs, lien: d.lien, executionId: d.executionId, maintenant: t }),
          ['etat', 'titre', 'resume', 'champsProposes', 'lien', 'expireLe', 'executions'], ETATS.A_VALIDER);
        return deja ? { id: d.id, cree: false, etat: p.etat, deja: true } : { id: d.id, cree: true, etat: p.etat };
      } catch (e) {
        if (!(e instanceof ErreurAction) || e.code !== 'transition_interdite') throw e;
        const existante = await donnees.lireDoc(chemin(base, d.id));
        return { id: d.id, cree: false, etat: existante?.etat ?? null };
      }
    },
  },

  'propositions.demarrer': {
    ecrit: true,
    schema: SCHEMA_DEMARRAGE,
    async executer({ base, donnees, auteur, maintenant }, d) {
      const cles = new Set();
      for (const e of d.plan ?? []) {
        if (cles.has(e.cle)) throw new ErreurAction('requete_invalide', 'Deux étapes du plan portent la même clé.');
        cles.add(e.cle);
      }
      const r = demarrer({ id: d.id, type: d.type, titre: d.titre, executionId: d.executionId, plan: d.plan, maintenant: maintenant() });
      if (!r.ok) throw erreurDe(r);
      const { id: _id, ...doc } = r.proposition;
      if (await donnees.creerSiAbsent(chemin(base, d.id), { ...doc, ecritPar: auteur })) return { id: d.id, cree: true, etat: ETATS.EN_PREPARATION };
      // Rejouer ne change rien : le plan d'origine est conservé (jamais d'écrasement).
      const existante = await donnees.lireDoc(chemin(base, d.id));
      return { id: d.id, cree: false, etat: existante?.etat ?? null };
    },
  },

  'propositions.etape': {
    ecrit: true,
    schema: SCHEMA_ETAPE,
    async executer(ctx, { id, cle, libelle, etat }) {
      const t = ctx.maintenant();
      const { proposition: p } = await transition(ctx, id, (x) => ajouterEtape(x, { cle, libelle, etat, maintenant: t }), ['etapes'], null);
      return { id, etat: p.etat, etapes: p.etapes.length };
    },
  },

  'propositions.abandonner': {
    ecrit: true,
    schema: { id: { type: 'idsur', requis: true }, erreur: { type: 'texte', max: 1000, min: 1, requis: true } },
    async executer(ctx, { id, erreur }) {
      // Comme marquerEchec : on masque une erreur qui ressemble à un secret au lieu de refuser (la ligne resterait « en préparation »).
      const sure = MOTIF_SECRET.test(erreur) ? 'Erreur du workflow (détail masqué : il ressemblait à un secret).' : erreur;
      const t = ctx.maintenant();
      const { proposition: p, deja } = await transition(ctx, id, (x) => abandonner(x, { erreur: sure, maintenant: t }), ['etat', 'derniereErreur', 'etapes'], ETATS.ABANDONNEE);
      return { id, etat: p.etat, deja };
    },
  },

  'propositions.lireValidees': {
    ecrit: false,
    schema: { limite: { type: 'nombre', min: 1, max: MAX_LECTURE_VALIDEES } },
    async executer({ base, donnees }, { limite = 50 }) {
      // Un seul filtre (état) et une limite : aucun index composite. On lit toujours le maximum permis puis on trie en mémoire, pour que « limite » garde bien les plus anciennes.
      // Au-delà de 100 validées, les plus anciennes peuvent manquer (volume faible, acceptable).
      const liste = await donnees.lister(chemin(base), { etat: ETATS.VALIDEE, limite: MAX_LECTURE_VALIDEES });
      liste.sort((a, b) => (enMs(a.valideeLe) ?? 0) - (enMs(b.valideeLe) ?? 0));
      return { propositions: liste.slice(0, Math.floor(limite)).map(versJson) };
    },
  },

  'propositions.marquerAppliquee': {
    ecrit: true,
    schema: { id: { type: 'idsur', requis: true }, executionId: { type: 'id' } },
    async executer(ctx, { id, executionId }) {
      const { proposition: p, deja } = await transition(ctx, id, (x) => marquerAppliquee(x, { executionId, maintenant: ctx.maintenant() }), ['etat', 'executions', 'derniereErreur', 'etapes'], ETATS.APPLIQUEE);
      return { id, etat: p.etat, deja };
    },
  },

  'propositions.marquerEchec': {
    ecrit: true,
    schema: { id: { type: 'idsur', requis: true }, erreur: { type: 'texte', max: 1000, min: 1, requis: true } },
    async executer(ctx, { id, erreur }) {
      // Le type « texte » ne filtre pas les secrets, et un refus (400) laisserait la proposition bloquée en « validée » : on masque au lieu de refuser.
      const sure = MOTIF_SECRET.test(erreur) ? 'Erreur du workflow (détail masqué : il ressemblait à un secret).' : erreur;
      const { proposition: p, deja } = await transition(ctx, id, (x) => marquerEchec(x, { erreur: sure, maintenant: ctx.maintenant() }), ['etat', 'tentatives', 'derniereErreur', 'etapes'], ETATS.ECHEC);
      return { id, etat: p.etat, tentatives: p.tentatives, deja };
    },
  },
});
