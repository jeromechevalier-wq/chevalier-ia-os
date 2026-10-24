// Fabrique le HTML du devis d'essai (3 sections, 8 lignes, deux taux de TVA, une description sur plusieurs lignes) et l'écrit sur la sortie
// en JSON { html, lignes }. Lancé par devis-document.spec.js dans un processus Node : les modules du dépôt (ES sans package.json) ne se
// chargent pas dans le chargeur de Playwright.
import * as D from '../../js/modules/devis/logique.js';
import { devisHtml } from '../../js/modules/devis/document.js';

const reglages = { modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, libelle, prixAchat, quantite, extra = {}) => ({ id, libelle, unite: 'u', quantite, prixAchat, ...extra });

const base = {
  ...D.nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }] }, { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'a@exemple.test', nouvelId: (n) => `${n}_1` }, reglages),
  objet: 'Rénovation de la toiture et de la zinguerie',
  adresses: { commanditaire: { texte: '1 rue du Test\n75000 Ville' }, facturation: null, chantier: { texte: '2 rue du Chantier, 75000 Ville' } },
  conditionsPaiement: '30 % à la commande, le solde à la réception des travaux.',
  modesPaiement: ['Virement bancaire', 'Chèque'],
  debutTravaux: 'Début janvier',
  dureeEstimee: '3 semaines',
  sections: [
    { id: 's1', titre: 'Préparation', lignes: [ligne('l1', 'Échafaudage', 80, 1, { description: 'Montage, location 3 semaines\net démontage' }), ligne('l2', 'Dépose de la couverture', 12.5, 85, { unite: 'm²', tauxTva: 10 })] },
    { id: 's2', titre: 'Toiture', lignes: [ligne('l3', 'Charpente : remplacement de pièces', 45, 12, { unite: 'ml', tauxTva: 10 }), ligne('l4', 'Tuiles', 21.3, 85, { unite: 'm²', tauxTva: 10 }), ligne('l5', 'Isolation sous toiture', 18, 85, { unite: 'm²', tauxTva: 10 })] },
    { id: 's3', titre: 'Zinguerie', lignes: [ligne('l6', 'Gouttière zinc', 32, 24, { unite: 'ml' }), ligne('l7', 'Descentes d\'eau', 28, 4, { unite: 'ml' }), ligne('l8', 'Nettoyage du chantier', 150, 1, { tauxTva: 20 })] },
  ],
};
const r = D.figerPourFinalisation(base, { numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages });
if (r.erreurs.length) throw new Error(r.erreurs.join(' / '));
const vue = D.vueClient(r.devis, { clientNom: 'Mme Exemple', emetteur: { nom: 'Atelier Exemple', adresse: '3 rue de l\'Atelier\n75000 Ville', telephone: '01 23 45 67 89', siret: '123 456 789 00012' } });
process.stdout.write(JSON.stringify({ html: devisHtml(vue), lignes: vue.sections.flatMap((s) => s.lignes).length }));
