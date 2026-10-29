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

/** Opérations de devis qui figent le devis (fonctions du serveur, voir coeur/devis.js) : jamais restaurées. */
const OUTILS_DEVIS_FIGES = ['devisFinaliser', 'devisChangerStatut'];
/** Opérations de devis qui touchent un devis déjà finalisé SANS le figer : archiver, historique des envois (statut inchangé). Elles se défont même si le devis n'est plus un brouillon. */
const OUTILS_DEVIS_SUR_FINALISE = ['devisArchiver', 'devisEnregistrerEnvoi', 'devisModifierDestinataires'];
const VOIE_DE_SECOURS = 'Pour corriger un devis finalisé, créer la version suivante (nouvelle_version_devis, ou depuis l’écran).';

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
  // Une transition de devis réécrit aussi le montant de l'affaire (`montantDevis*`) : défaire cette ligne avec une copie entière de l'affaire effacerait ce qui a changé depuis (titre, étape, documents).
  if (lignesAudit.some((l) => /^devis/.test(l.outil ?? '') && l.collection === C.affaires)) {
    throw new ErreurEcriture('restauration_refusee', 'Cette opération a changé un devis et recalculé le montant de l’affaire : elle ne se défait pas avec le journal. Refais le geste inverse sur le devis (archiver_devis avec archive: false par exemple) : le montant est recalculé.');
  }
  // Une finalisation (numéro consommé, prix figés) ou un changement de statut d'un devis ne se défait pas d'après le journal : créer la version suivante (nouvelle_version_devis).
  if (lignesAudit.some((l) => OUTILS_DEVIS_FIGES.includes(l.outil))) {
    throw new ErreurEcriture('restauration_refusee', `Cette opération a finalisé ou changé le statut d’un devis : elle ne se défait pas avec le journal (le numéro serait perdu). ${VOIE_DE_SECOURS}`);
  }
  const copies = await Promise.all(lignesAudit.map((l) => donnees.document(C.auditAvant, l.id)));
  const perimees = lignesAudit.filter((_, i) => !copies[i]);
  if (perimees.length) {
    throw new ErreurEcriture('copie_expiree', `Les copies « avant » de cette opération manquent : ${perimees.length} ligne(s) sur ${lignesAudit.length}. Utiliser une sauvegarde (copie Google ou export JSON).`, { perimees: perimees.length });
  }
  const courants = await Promise.all(lignesAudit.map((l) => donnees.document(l.collection, l.docId)));
  // Même avec `forcer` : un devis qui n'est plus un brouillon (finalisé à l'écran après sa création par l'assistant, par exemple) ne se supprime ni ne se remet en brouillon par le journal.
  const figee = lignesAudit.find((l, i) => l.collection === C.devis && courants[i] && courants[i].statut !== 'brouillon' && !OUTILS_DEVIS_SUR_FINALISE.includes(l.outil));
  if (figee) throw new ErreurEcriture('restauration_refusee', 'Un devis de cette opération n’est plus un brouillon : il ne se restaure pas avec le journal, même avec forcer. ' + VOIE_DE_SECOURS);
  // Archivage / envoi défaits « de force » sur un devis dont le statut a changé depuis (signé, refusé…) : on remettrait l'ancien statut, ce qui contourne la règle des statuts.
  const statutChange = lignesAudit.find((l, i) => l.collection === C.devis && courants[i] && OUTILS_DEVIS_SUR_FINALISE.includes(l.outil) && copies[i]?.apres && courants[i].statut !== copies[i].apres.statut);
  if (statutChange) throw new ErreurEcriture('restauration_refusee', 'Le statut de ce devis a changé depuis cette opération : elle ne se défait plus avec le journal, même avec forcer. ' + VOIE_DE_SECOURS);
  // Recréer un devis supprimé : refusé si sa racine a déjà un brouillon ou un devis de même version (deux devis finalisés au même numéro sinon).
  for (let i = 0; i < lignesAudit.length; i += 1) {
    const l = lignesAudit[i];
    const avant = copies[i]?.avant;
    if (l.collection !== C.devis || courants[i] || !avant) continue;
    const freres = await donnees.liste(C.devis, { champ: 'racineId', valeur: avant.racineId ?? l.docId });
    const conflit = freres.find((v) => v.id !== l.docId && (v.statut === 'brouillon' || (v.version ?? 1) === (avant.version ?? 1)));
    if (conflit) throw new ErreurEcriture('restauration_refusee', 'Ce devis ne peut pas être recréé : une autre version brouillon ou de même version existe déjà pour ce numéro. ' + VOIE_DE_SECOURS);
  }
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
