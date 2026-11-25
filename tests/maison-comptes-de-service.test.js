// Relecture Fable (25/11/2026, bloquant B1) : les comptes de service écrits dans le manifeste de déploiement doivent rester EXACTEMENT ceux d'avant le chantier 0.
// Le raccourci « nom@ » cassait le déploiement (firebase-tools ne le complète pas pour l'accès aux secrets ni pour Cloud Scheduler) : les deux index.js
// calculent maintenant l'adresse complète avec compteDeService (securite/maison.js), à partir de GCLOUD_PROJECT, que firebase-tools pose à la découverte.
// Valeurs attendues : relevées sur origin/main (aa07c176) en chargeant les deux index.js avec GCLOUD_PROJECT=chevalier-ia-os puis chevalier-ia-app.
// « <ResetValue> » : aucun compte déclaré (compte par défaut du projet), comme avant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MANIFESTE = fileURLToPath(new URL('./_manifeste-comptes.js', import.meta.url));
const lire = (index, projet) => JSON.parse(execFileSync(process.execPath, [MANIFESTE, fileURLToPath(new URL(index, import.meta.url))], {
  env: { PATH: process.env.PATH, GCLOUD_PROJECT: projet }, encoding: 'utf8',
}));

const AVANT_OS = Object.freeze({
  automatisationsAdmin: "automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  automatisationsDecider: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  automatisationsInterneHoraire: "automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  automatisationsRenommer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  baseAccorderAcces: "base-acces@chevalier-ia-os.iam.gserviceaccount.com",
  consoleEtat: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  deploiementVerifier: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  depotdocument: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisArchiver: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisChangerStatut: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisChoisirAffaire: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisEnregistrerEnvoi: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisFinaliser: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisMarquerTest: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisModifierDestinataires: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisNouvelleVersion: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisPdf: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisPdfAuto: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisPdfLien: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisPreparerEmail: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisPreparerEmailEtat: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  devisSupprimer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  documentDeposer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  documentLien: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  documentRenommer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  documentSupprimer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  mcp: "mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  modeTestSupprimer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  pilotageEnregistrerReglages: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  pilotageLire: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  porte: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  rdvConnexionSms: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  rdvEnvoiPlanifie: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  rdvEnvoyer: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  rdvEtat: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  rdvReponseSms: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  reseauxsociauxBuffer: "<ResetValue>",
  reseauxsociauxMesuresHebdo: "<ResetValue>",
  reseauxsociauxReleverMesures: "<ResetValue>",
  tableaudebord: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  tableaudebordSaisir: "porte-serveur@chevalier-ia-os.iam.gserviceaccount.com",
  veille: "<ResetValue>",
});
const AVANT_APP = Object.freeze({
  automatisationsCopieHoraire: "<ResetValue>",
  automatisationsDecider: "<ResetValue>",
  automatisationsRafraichir: "<ResetValue>",
  automatisationsRenommer: "<ResetValue>",
  deploiementVerifier: "<ResetValue>",
  devisArchiver: "<ResetValue>",
  devisChangerStatut: "<ResetValue>",
  devisChoisirAffaire: "<ResetValue>",
  devisEnregistrerEnvoi: "<ResetValue>",
  devisFinaliser: "<ResetValue>",
  devisMarquerTest: "<ResetValue>",
  devisModifierDestinataires: "<ResetValue>",
  devisNouvelleVersion: "<ResetValue>",
  devisPdf: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  devisPdfAuto: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  devisPdfLien: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  devisPreparerEmail: "<ResetValue>",
  devisPreparerEmailEtat: "<ResetValue>",
  devisSupprimer: "<ResetValue>",
  documentDeposer: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  documentLien: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  documentRenommer: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  documentSupprimer: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  espaceReglages: "espace-reglages@chevalier-ia-app.iam.gserviceaccount.com",
  mcpclients: "mcp-clients@chevalier-ia-app.iam.gserviceaccount.com",
  modeTestSupprimer: "<ResetValue>",
  porte: "devis-pdf@chevalier-ia-app.iam.gserviceaccount.com",
  rdvConnexionSms: "<ResetValue>",
  rdvEnvoiPlanifie: "<ResetValue>",
  rdvEnvoyer: "<ResetValue>",
  rdvEtat: "<ResetValue>",
  rdvReponseSms: "<ResetValue>",
});

describe('B1 comptes de service du manifeste : identiques à ceux d\'avant le chantier 0', () => {
  test('B1 CRM de Jérôme (GCLOUD_PROJECT=chevalier-ia-os) : chaque fonction, le même compte caractère pour caractère', () => {
    assert.deepEqual(lire('../functions/src/index.js', 'chevalier-ia-os'), AVANT_OS);
  });
  test('B1 plateforme (GCLOUD_PROJECT=chevalier-ia-app) : chaque fonction, le même compte caractère pour caractère', () => {
    assert.deepEqual(lire('../functions-plateforme/src/index.js', 'chevalier-ia-app'), AVANT_APP);
  });
  test('B1 un autre projet reçoit ses propres comptes (rien de chevalier-ia-os ni de chevalier-ia-app)', () => {
    const autre = lire('../functions/src/index.js', 'maison-essai');
    assert.equal(autre.mcp, 'mcp-serveur@maison-essai.iam.gserviceaccount.com');
    assert.ok(!JSON.stringify(autre).includes('chevalier-ia-'));
  });
});
