// Jeu d'essai commun des tests qui finalisent un devis (PR B, 31/10/2026) : la finalisation exige « Mon entreprise » complète (nom, adresse, SIRET, assurance sans crochet),
// un client, le début et la durée des travaux et une date de validité à venir. Valeurs fictives. Un test qui veut vérifier un refus retire UNE de ces valeurs :
// aucun contrôle n'est affaibli, seul le jeu d'essai est complété.
export const AUJOURDHUI_ESSAI = '2026-10-24';
export const EMETTEUR_ESSAI = Object.freeze({
  nom: 'Entreprise Essai', siret: '123 456 789 00010', adresse: { ligne1: '1 rue de l’Essai', codePostal: '75001', ville: 'Paris' },
  assuranceTexte: 'Assurance décennale : Assureur Essai, contrat numéro : 123, territorialité : France métropolitaine.',
});
export const CHANTIER_ESSAI = Object.freeze({ debutTravaux: '2026-11-15', dureeEstimee: Object.freeze({ valeur: 3, unite: 'semaine' }) });
/** Le 2e argument de erreursFinalisation (et de figerPourFinalisation) qui rend un devis complet finalisable. */
export const OPTIONS_FINALISATION = Object.freeze({ emetteur: EMETTEUR_ESSAI, aujourdhui: AUJOURDHUI_ESSAI });
/** Complète un devis d'essai : un client (sauf s'il en a un), le début et la durée des travaux (sauf s'il a déjà un chantier daté), une date de validité (sauf s'il en a une). */
export function completerPourFinaliser(devis) {
  const chantier = devis.chantier ?? {};
  return {
    ...devis,
    expireLe: devis.expireLe ?? '2027-01-22',
    ...(devis.personneId || devis.organisationId ? {} : { personneId: 'p1' }),
    chantier: { ...chantier, debutTravaux: chantier.debutTravaux ?? CHANTIER_ESSAI.debutTravaux, dureeEstimee: chantier.dureeEstimee ?? { ...CHANTIER_ESSAI.dureeEstimee } },
  };
}
