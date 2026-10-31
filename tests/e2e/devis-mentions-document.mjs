// Fabrique le HTML d'un devis finalisé d'essai avec l'assurance par défaut (crochets), les coordonnées bancaires et « Attestation et mentions » ;
// l'écrit sur la sortie en JSON { html }. Lancé par devis-mentions-legales.spec.js dans un processus Node (les modules du dépôt ne se chargent pas dans Playwright).
import * as D from '../../js/modules/devis/logique.js';
import { devisHtml } from '../../js/modules/devis/document.js';

const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const sans = process.argv[2] === 'sans';
const base = {
  ...D.nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'a@exemple.test', nouvelId: (n) => `${n}_1` }, reglages),
  affaireId: 'a1', objet: 'Rénovation de la toiture',
  sections: [{ id: 's1', titre: 'Toiture', lignes: [{ id: 'l1', libelle: 'Tuiles', unite: 'm²', quantite: 20, prixAchat: 40, tauxTva: 10 }] }],
};
// La finalisation exige l'entreprise, un client, début et durée des travaux : le jeu d'essai est complété, puis le bloc Chantier est retiré (ce document n'en montre pas).
const entreprise = { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' }, assuranceTexte: 'Assurance décennale : Assureur Exemple, contrat numéro : 123.' };
const r = D.figerPourFinalisation({ ...base, personneId: 'p1', chantier: { debutTravaux: '2026-11-15', dureeEstimee: { valeur: 3, unite: 'semaine' } } }, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages, emetteur: entreprise });
if (r.devis) delete r.devis.chantier;
if (r.erreurs.length) throw new Error(r.erreurs.join(' / '));
const emetteur = sans ? { nom: 'Atelier Exemple' } : {
  nom: 'Atelier Exemple', coordonneesBancaires: 'Banque Exemple\nFR76 0000 0000 0000\nBIC EXEMPLEXXX',
  mentionEmetteur: 'Attestation du client : les travaux concernent un logement achevé depuis plus de deux ans.\nQualification RGE n° 123 (valable jusqu\'en 2027).',
};
process.stdout.write(JSON.stringify({ html: devisHtml(D.vueClient(r.devis, { clientNom: 'Mme Exemple', emetteur })) }));
