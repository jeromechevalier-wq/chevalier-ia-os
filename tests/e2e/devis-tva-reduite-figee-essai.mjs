// Fabrique le HTML imprimé d'un devis à 10 % (exemple à 100 €) : argument « finalise » = finalisé avec le texte du réglage du jour, puis le réglage change ;
// « brouillon » = brouillon, texte lu dans le réglage changé. Écrit { html } en JSON. Lancé par devis-tva-reduite-figee.spec.js (les modules du dépôt ne se chargent pas dans Playwright).
import * as D from '../../js/modules/devis/logique.js';
import { devisHtml } from '../../js/modules/devis/document.js';

const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90, mentionTvaReduite: 'TEXTE DU JOUR DE LA FINALISATION : taux réduit appliqué, le client atteste les conditions.' };
const entreprise = { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' }, assuranceTexte: 'Assurance décennale : Assureur Exemple, contrat numéro : 123.' };
const base = {
  ...D.nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'a@exemple.test', nouvelId: (n) => `${n}_1` }, reglages),
  affaireId: 'a1', objet: 'Rénovation de la toiture', personneId: 'p1', chantier: { debutTravaux: '2026-11-15', dureeEstimee: { valeur: 3, unite: 'semaine' } },
  sections: [{ id: 's1', titre: 'Toiture', lignes: [{ id: 'l1', libelle: 'Tuiles', unite: 'forfait', quantite: 1, prixAchat: 80, prixVente: 100, tauxTva: 10 }] }],
};
const r = D.figerPourFinalisation(base, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages, emetteur: entreprise });
if (r.erreurs.length) throw new Error(r.erreurs.join(' / '));
const devis = process.argv[2] === 'brouillon' ? base : r.devis;
// Le réglage a changé APRÈS la finalisation.
const emetteur = D.emetteurImprime({ nom: 'Atelier Exemple' }, '', 'TEXTE MODIFIÉ APRÈS COUP DANS LES RÉGLAGES.');
process.stdout.write(JSON.stringify({ html: devisHtml(D.vueClient(devis, { clientNom: 'Mme Exemple', emetteur }), { emetteur }) }));
