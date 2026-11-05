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
import { ErreurDevis, journal, modifier, lireDevis, lireVersions, montantDeLAffaire } from './devis.js';

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

/** Opérations de la fonction appelable de l'écran (chez Jérôme et chez les clients) : `{ devisId, test }`. */
export const OPERATIONS_TEST = Object.freeze({
  marquerTest: (base, d) => {
    if (typeof d.test !== 'boolean') throw new ErreurDevis('demande_invalide', 'Le champ test doit être vrai ou faux.');
    return basculerTest({ ...base, type: 'devis', id: d.devisId, test: d.test });
  },
});
