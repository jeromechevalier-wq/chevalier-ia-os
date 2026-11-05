// Mode test (cadrage docs/cadrage-mode-test.md, PR 2) : marquer ou démarquer un essai (`test: true` / `test: false`) sur une personne, une organisation, une affaire, un projet ou un devis.
// Une seule fonction, utilisée par les outils marquer_test / demarquer_test (et, plus tard, par la fonction appelable de l'écran : PR 3).
//
// Règles :
// - UNE transaction : le document est lu dedans (introuvable : refus), écrit avec `modifier` (jamais un `set` sans fusion : le reste du document est conservé), une ligne de journal (restaurable).
// - Déjà dans l'état demandé : `rien: true`, aucune écriture, aucune ligne de journal.
// - Affaire : le montant calculé d'après les devis (`montantDevis*`) est recalculé DANS la même transaction (un devis ne compte que s'il a le même repère que son affaire).
// - Devis : toutes les versions de la racine reçoivent le même repère (décision prise seul : une version de test ne se mêle pas à une version réelle du même numéro) ;
//   le montant de chaque affaire touchée est recalculé dans la même transaction. Le compteur d'usage des articles n'est PAS touché ici : `recalculer_usage_articles` le remet juste.
// - Le nom du journal (`marquerTest` / `demarquerTest`) ne commence pas par « devis » : la restauration d'une fiche ou d'un brouillon remet le document ET le montant ensemble ;
//   pour un devis finalisé, la restauration est refusée par restaurer.js (un devis qui n'est plus un brouillon ne se restaure pas).
// - PR 3 : un devis finalisé dont le numéro est TEST-… reste un test (démarquer refusé, avant toute écriture) ; un DEV- marqué test après coup reste démarquable.
//   `OPERATIONS_TEST` (fonction appelable de l'écran) vit ici et non dans devis.js : devis.js n'importe pas ce fichier (pas de cycle).
import { COLLECTIONS as C } from './donnees.js';
import { estNumeroTest } from '../../partage/devis.js';
import { ErreurDevis, journal, modifier, lireDevis, lireVersions, montantDeLAffaire, remettreCompteurTest } from './devis.js';
import { planSupprimerTests } from '../../partage/logique.js';
import { executerEcritures, MAX_ECRITURES } from './ecriture.js';
import { empreinteApercu } from '../securite/codes.js';

export const TYPES_TEST = Object.freeze({
  personne: C.personnes,
  organisation: C.organisations,
  affaire: C.affaires,
  projet: C.projets,
  devis: C.devis,
});

const montantLu = (a) => ({ ht: typeof a?.montantDevisHt === 'number' ? a.montantDevisHt : null, nature: a?.montantDevisNature ?? null });

export const MESSAGE_TEST_FINALISE = 'Ce devis de test est finalisé (numéro TEST-…) : il reste un test. Pour un vrai devis, crée un nouveau devis.';

export async function basculerTest({ donnees, ctx, type, id, test }) {
  const collection = TYPES_TEST[type];
  if (!collection) throw new ErreurDevis('demande_invalide', `Type inconnu : ${type}.`);
  if (typeof id !== 'string' || !id || id.length > 200 || id.includes('/')) throw new ErreurDevis('demande_invalide', 'Identifiant manquant ou invalide.');
  return donnees.transaction(async (tx) => {
    const doc = type === 'devis' ? await lireDevis(tx, id) : await tx.document(collection, id);
    if (!doc) throw new ErreurDevis('introuvable', `Fiche introuvable : ${id}`);
    const dejaFait = (x) => (x.test === true) === test;
    const changements = [];
    let montant = null;
    if (type === 'devis') {
      const versions = await lireVersions(tx, doc);
      const toutes = [doc, ...versions.filter((v) => v.id !== doc.id)];
      if (test === false && toutes.some((v) => estNumeroTest(v.numero))) throw new ErreurDevis('transition_interdite', MESSAGE_TEST_FINALISE);
      const aChanger = toutes.filter((v) => !dejaFait(v));
      if (!aChanger.length) return { ok: true, rien: true, id, type, test, devis: doc };
      for (const v of aChanger) changements.push(modifier(v, { test }));
      const retouches = Object.fromEntries(aChanger.map((v) => [v.id, { test }]));
      const suivi = [];
      for (const v of toutes.filter((x, i, l) => l.findIndex((y) => y.affaireId === x.affaireId) === i)) {
        const m = await montantDeLAffaire(tx, v, retouches); // un brouillon ne compte jamais (règle D17) : aucune écriture d'affaire alors
        if (m) { changements.push(m); suivi.push({ affaireId: v.affaireId, avant: montantLu(m.avant), apres: montantLu(m.apres) }); }
      }
      montant = suivi.length ? suivi : null;
    } else if (type === 'affaire') {
      if (dejaFait(doc)) return { ok: true, rien: true, id, type, test };
      const m = await montantDeLAffaire(tx, { id: null, affaireId: id }, {}, { test });
      const patch = { test, ...(m ? m.ecriture.donnees : {}) };
      changements.push(modifier(doc, patch, collection));
      if (m) montant = { avant: montantLu(doc), apres: montantLu(m.apres) };
    } else {
      if (dejaFait(doc)) return { ok: true, rien: true, id, type, test };
      changements.push(modifier(doc, { test }, collection));
    }
    const j = journal({ donnees, ctx, outil: test ? 'marquerTest' : 'demarquerTest', parametres: { type, id }, changements });
    tx.ecrire([...changements.map((c) => c.ecriture), ...j.ecritures]);
    return {
      ok: true, id, type, test, operationId: j.operationId,
      ...(type === 'devis' ? { versions: changements.filter((c) => c.collection === C.devis).length, devis: { ...doc, test } } : {}),
      ...(montant ? { montant } : {}),
    };
  });
}

// ---------------------------------------------------------------- « Supprimer tous mes tests » (PR 4, cadrage §9)
/** Noms écrits dans le journal par la suppression groupée (outil MCP, écran) : la restauration refuse de recréer un devis TEST- supprimé sous l'un d'eux. */
export const OUTILS_SUPPRESSION_TESTS = Object.freeze(['supprimer_tous_les_tests', 'supprimerTousLesTests']);

/** Lit les collections ENTIÈRES (devis compris) et calcule le plan. N'écrit rien. Rend { plan, apercu }. */
export async function apercuSuppressionTests({ donnees }) {
  const [personnes, organisations, affaires, projets, taches, activites, notes, evenements, devis] = await Promise.all(
    [C.personnes, C.organisations, C.affaires, C.projets, C.projetsTaches, C.activites, C.notes, C.evenements, C.devis].map((nom) => donnees.liste(nom)));
  const plan = planSupprimerTests({ personnes, organisations, affaires, projets, taches, activites, notes, evenements, devis });
  const toutes = [...plan.devisFinalises, ...plan.reste];
  const apercu = {
    total: plan.total, comptes: plan.comptes, noms: plan.noms, relies: plan.relies, nonRestaurables: plan.devisFinalises.length,
    empreinte: empreinteApercu(toutes.map((e) => `${e.type}:${e.collection}/${e.id}`)),
  };
  return { plan, apercu };
}

/**
 * `apercu: true` (défaut) : aperçu seul. `apercu: false` : exige `empreinte` égale à celle recalculée, puis écrit le lot A (devis TEST- finalisés, jamais restaurables)
 * puis le lot B (le reste, restaurable), chacun avec son journal et ses copies « avant », puis remet le compteur TEST-.
 * Pas de transaction globale (le moteur journalise par paquets de 400) : si le lot B échoue après le lot A, le message donne l'identifiant de l'opération du lot A.
 * `ecrire` (facultatif) : l'outil MCP passe `c.ecrire` (plafonds) ; l'écran laisse le défaut (écriture directe). Un devis de test ne compte jamais dans le montant d'une affaire réelle ni dans l'usage des articles : rien à recalculer.
 */
export async function supprimerTousLesTests({ donnees, ctx, apercu = true, empreinte = null, outil = 'supprimerTousLesTests', ecrire = null }) {
  const { plan, apercu: vue } = await apercuSuppressionTests({ donnees });
  const rien = plan.total === 0;
  if (apercu) return { ok: true, tests: { apercu: true, ...(rien ? { rien: true } : {}), ...vue } };
  if (rien) return { ok: true, tests: { rien: true, total: 0, comptes: plan.comptes, relies: plan.relies } };
  if (typeof empreinte !== 'string' || empreinte !== vue.empreinte) throw new ErreurDevis('demande_invalide', 'La liste de tes tests a changé depuis l’aperçu : relance l’aperçu.');
  if (plan.devisFinalises.length + plan.reste.length > MAX_ECRITURES) throw new ErreurDevis('demande_invalide', 'Plus de 1000 documents de test : supprime d’abord une partie (devis, puis affaires) un par un.');
  const ctxJournal = { ...ctx, jeton: ctx.jeton ?? ctx.acteur }; // même ligne de journal que `journal()` (devis.js) : l'écran n'a pas de jeton
  const ecriture = ecrire ?? ((demande) => executerEcritures({ donnees, ctx: ctxJournal, outil, ...demande }));
  const operationIds = { devisFinalises: null, reste: null };
  if (plan.devisFinalises.length) {
    try {
      operationIds.devisFinalises = (await ecriture({ operations: plan.devisFinalises, parametres: { total: plan.total, lot: 'devisFinalises' } })).operationId ?? null;
    } catch (e) {
      const partiel = e?.details?.partiel === true;
      if (!partiel) throw e; // rien n'a été écrit : l'erreur d'origine (plafond, journal indisponible…) reste telle quelle
      throw new ErreurDevis('transition_interdite', `Des devis de test ont pu être supprimés (opération ${e.details.operationId ?? 'inconnue'}) : actualise pour voir ce qui reste, puis relance la suppression. ${String(e?.message ?? '').slice(0, 200)}`);
    }
  }
  if (plan.reste.length) {
    try {
      operationIds.reste = (await ecriture({ operations: plan.reste, parametres: { total: plan.total, lot: 'reste' } })).operationId ?? null;
    } catch (e) {
      if (!operationIds.devisFinalises && e?.details?.partiel !== true) throw e;
      const ou = operationIds.devisFinalises ? `Les devis de test sont supprimés (opération ${operationIds.devisFinalises}) mais la suite a échoué` : `Une partie des éléments a pu être supprimée (opération ${e.details.operationId ?? 'inconnue'})`;
      throw new ErreurDevis('transition_interdite', `${ou} : actualise, puis relance la suppression. ${String(e?.message ?? '').slice(0, 200)}`);
    }
  }
  const { remis } = await remettreCompteurTest({ donnees, ctx });
  return { ok: true, tests: { supprime: true, total: plan.total, comptes: plan.comptes, relies: plan.relies, operationIds, compteurTestRemis: remis } };
}

/** Opérations de la fonction appelable de l'écran (chez Jérôme et chez les clients) : `{ devisId, test }`, ou `{ apercu, empreinte }` pour supprimerTests. */
export const OPERATIONS_TEST = Object.freeze({
  marquerTest: (base, d) => {
    if (typeof d.test !== 'boolean') throw new ErreurDevis('demande_invalide', 'Le champ test doit être vrai ou faux.');
    return basculerTest({ ...base, type: 'devis', id: d.devisId, test: d.test });
  },
  supprimerTests: (base, d) => supprimerTousLesTests({ ...base, apercu: d.apercu !== false, empreinte: typeof d.empreinte === 'string' ? d.empreinte : null }),
});
