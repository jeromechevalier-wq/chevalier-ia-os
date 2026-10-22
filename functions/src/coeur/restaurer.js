// Restauration d'une opération d'après l'audit (plan-mcp.md 5.2) : on rejoue les lignes À L'ENVERS.
//  - création annulée = suppression du document ;
//  - modification annulée = remise de la copie « avant » ;
//  - suppression annulée = recréation avec le MÊME identifiant (les liens personneId, affaireId… restent valides).
// Un document qui a changé depuis l'opération (état actuel ≠ état « après » gardé dans l'audit) n'est pas touché, sauf `forcer`.
// La restauration passe par le même moteur que toute écriture : elle laisse sa propre trace (action « restaurer ») et peut elle-même
// être restaurée. Si une copie manque réellement (écriture échouée, copie perdue), message clair, et la sauvegarde prend le relais.
import { COLLECTIONS as C } from './donnees.js';
import { egal, sansId } from './canonique.js';
import { ErreurEcriture, executerEcritures } from './ecriture.js';

/** Ce qu'il faudrait faire pour défaire une ligne : 'supprimer' | 'remplacer' | 'recreer' | 'rien' | 'conflit'. */
function decider(courant, ligne) {
  if (egal(courant, ligne.apres)) return ligne.avant ? (courant ? 'remplacer' : 'recreer') : 'supprimer';
  if (egal(courant, ligne.avant)) return 'rien'; // déjà dans l'état d'avant (écriture jamais arrivée, ou déjà défaite)
  return 'conflit';
}

const RAISONS = {
  conflit: 'Le document a changé depuis cette opération (restaurer avec forcer: true l’écraserait).',
  rien: 'Déjà dans l’état d’avant.',
};

/** `reserver(operations)` : appelé juste avant d'écrire (plafonds du jeton) ; une restauration qui supprime compte comme suppression. */
export async function restaurerOperation({ donnees, ctx, operationId, apercu = true, forcer = false, reserver = null }) {
  const lignesAudit = (await donnees.liste(C.audit, { champ: 'operationId', valeur: operationId }))
    .filter((l) => l.statut !== 'echec')
    .sort((a, b) => (b.ordre ?? 0) - (a.ordre ?? 0));
  if (!lignesAudit.length) {
    throw new ErreurEcriture('introuvable', 'Aucune écriture réussie pour cette opération (identifiant inconnu, ou toutes ont échoué).');
  }
  const copies = await Promise.all(lignesAudit.map((l) => donnees.document(C.auditAvant, l.id)));
  const perimees = lignesAudit.filter((_, i) => !copies[i]);
  if (perimees.length) {
    throw new ErreurEcriture('copie_expiree', `Les copies « avant » de cette opération manquent : ${perimees.length} ligne(s) sur ${lignesAudit.length}. Utiliser une sauvegarde (copie Google ou export JSON).`, { perimees: perimees.length });
  }
  const courants = await Promise.all(lignesAudit.map((l) => donnees.document(l.collection, l.docId)));
  const lignes = lignesAudit.map((l, i) => {
    const copie = copies[i];
    const courant = sansId(courants[i]);
    const ligne = { collection: l.collection, id: l.docId, avant: copie.avant ?? null, apres: copie.apres ?? null };
    const decision = decider(courant, ligne);
    return { ...ligne, decision };
  });

  const resume = lignes.map((l) => ({ collection: l.collection, docId: l.id, action: l.decision, ...(RAISONS[l.decision] ? { raison: RAISONS[l.decision] } : {}) }));
  const conflits = lignes.filter((l) => l.decision === 'conflit').length;
  if (apercu) return { operationId, apercu: true, lignes: resume, conflits, aDefaire: lignes.filter((l) => !['rien', 'conflit'].includes(l.decision)).length };

  if (conflits && !forcer) {
    throw new ErreurEcriture('restauration_refusee', `${conflits} document(s) ont changé depuis cette opération : rien n’a été restauré. Relire l’aperçu, ou restaurer avec forcer: true.`, { conflits, lignes: resume });
  }
  const operations = lignes
    .filter((l) => l.decision !== 'rien')
    .map((l) => ({ type: 'remplacer', collection: l.collection, id: l.id, donnees: l.avant }));
  if (!operations.length) return { operationId, restauree: true, rienAFaire: true, ecritures: [] };
  await reserver?.(operations);
  const resultat = await executerEcritures({ donnees, ctx, outil: 'restaurer_depuis_audit', parametres: { operationId, forcer }, operations });
  return { operationId, restauree: true, operationRestauration: resultat.operationId, ecritures: resultat.ecritures, ...(resultat.auditIncomplet ? { auditIncomplet: true, avertissement: resultat.avertissement } : {}) };
}
