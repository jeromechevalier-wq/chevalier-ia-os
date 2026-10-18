// Recette de l'étape 4 du serveur MCP : crée une organisation de test « ZZ Essai MCP », lit le journal, essaie des refus,
// la supprime, la restaure, puis la supprime pour nettoyer. Ne touche à aucune autre fiche. Il faut le jeton Claude Code.
// Usage (Terminal du Mac, le jeton est saisi sans s'afficher et n'est jamais écrit ni affiché) :
//   read -s CHEVALIER_MCP_TOKEN; export CHEVALIER_MCP_TOKEN
//   node outils/essai-ecriture.mjs
// Variables facultatives : CHEVALIER_MCP_URL (défaut https://chevalier-ia-os.web.app/mcp ; sert aux tests).
// Sortie : une ligne par vérification (✓ ou ✗) ; code de sortie 1 au premier échec, avec ce qu'il resterait à nettoyer.
const URL_MCP = process.env.CHEVALIER_MCP_URL || 'https://chevalier-ia-os.web.app/mcp';
const JETON = process.env.CHEVALIER_MCP_TOKEN;
const NOM = 'ZZ Essai MCP';
if (!JETON) {
  console.error('Variable CHEVALIER_MCP_TOKEN absente. Tape d’abord :  read -s CHEVALIER_MCP_TOKEN; export CHEVALIER_MCP_TOKEN');
  process.exit(1);
}

let id = 0;
let organisationId = null;

/** Appelle un outil ; renvoie { erreur: texte } ou { data } (jamais le jeton, jamais l'en-tête). */
async function appeler(nom, args = {}) {
  let r;
  try {
    r = await fetch(URL_MCP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETON}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
  } catch (e) {
    return { erreur: `réseau : ${e.message}` };
  }
  if (r.status === 401) return { erreur: 'jeton refusé (401) : mauvais jeton, jeton révoqué ou mal collé' };
  if (r.status === 429) return { erreur: `plafond de requêtes atteint (429), réessayer dans ${r.headers.get('retry-after') ?? '?'} s` };
  if (!r.ok) return { erreur: `réponse HTTP ${r.status}` };
  const corps = await r.json();
  if (corps.error) return { erreur: corps.error.message };
  const texte = corps.result?.content?.[0]?.text ?? '';
  if (corps.result?.isError) return { erreur: texte };
  try { return { data: JSON.parse(texte) }; } catch { return { data: texte }; }
}

function echec(message) {
  console.log(`  ✗ ${message}`);
  console.log('\nESSAI INTERROMPU.');
  if (organisationId) console.log(`Il reste peut-être l'organisation « ${NOM} » (id ${organisationId}) : demande à Claude de la supprimer, ou dis-le-moi.`);
  process.exit(1);
}
const etape = (titre) => console.log(`\n${titre}`);
const bon = (message) => console.log(`  ✓ ${message}`);
async function attendu(titre, promesse, verifier) {
  etape(titre);
  const r = await promesse;
  if (r.erreur) echec(`erreur inattendue : ${r.erreur}`);
  const probleme = verifier(r.data);
  if (probleme) echec(probleme);
  return r.data;
}
async function refus(titre, promesse, motif) {
  etape(titre);
  const r = await promesse;
  if (!r.erreur) echec('devait être refusé, mais a réussi');
  if (!motif.test(r.erreur)) echec(`refusé, mais pour une autre raison : ${r.erreur}`);
  bon(`refusé comme prévu (${r.erreur.slice(0, 90)}${r.erreur.length > 90 ? '…' : ''})`);
}

// 0. Qui suis-je ?
/** Suppression en deux temps (double confirmation) : l'aperçu ne supprime rien et donne un code ; le rappel avec ce code supprime. */
async function supprimerAvecCode(args) {
  const apercu = await appeler('supprimer_organisation', args);
  if (apercu.erreur || apercu.data?.apercu !== true || !apercu.data.code) return { erreur: apercu.erreur || `pas d'aperçu avec code : ${JSON.stringify(apercu.data).slice(0, 150)}` };
  return appeler('supprimer_organisation', { ...args, codeConfirmation: apercu.data.code });
}

const moi = await attendu('0. Connexion', appeler('qui_suis_je'), (d) => {
  if (d.profil !== 'claude-code') return `ce jeton est « ${d.profil} » : il faut le jeton Claude Code`;
  if (!d.outils.includes('creer_organisation')) return 'le serveur n’offre pas encore les outils d’écriture (déploiement de l’étape 4 pas terminé ?)';
  return null;
});
bon(`connecté comme ${moi.acteur} (profil ${moi.profil}), ${moi.outils.length} outils`);

// 1. Ne rien toucher de ce qui existe déjà sous ce nom.
await attendu(`1. Aucune organisation « ${NOM} » déjà présente`, appeler('chercher', { texte: NOM, types: ['organisations'] }), (d) => (d.resultats.length ? `une organisation « ${d.resultats[0].libelle} » existe déjà (id ${d.resultats[0].id}) : je n'y touche pas, supprime-la toi-même puis relance` : null));
bon('rien à ce nom');

// 2. Création
const cree = await attendu(`2. Créer l'organisation « ${NOM} »`, appeler('creer_organisation', { nom: NOM }), (d) => (d.id && d.operationId ? null : 'la réponse ne contient pas d\'identifiant'));
organisationId = cree.id;
bon(`créée (id ${cree.id}, opération ${cree.operationId})`);

// 3. Journal
await attendu('3. Lire le journal de cette opération', appeler('lire_audit', { operationId: cree.operationId }), (d) => {
  const l = d.lignes ?? [];
  if (l.length !== 2) return `2 lignes attendues (l'organisation et son événement), ${l.length} trouvée(s)`;
  if (!l.every((x) => x.acteur === 'claude-code-jerome' && x.statut === 'succes' && x.outil === 'creer_organisation' && x.via === 'mcp')) return 'une ligne n’a pas l’acteur, l’outil, le canal ou le statut attendu';
  if (l.some((x) => JSON.stringify(x).includes(NOM))) return 'le journal contient le nom saisi (il ne doit garder que les noms de champs)';
  return null;
});
bon('2 lignes « succes », acteur claude-code-jerome, canal mcp, sans le nom saisi');

// 4. Refus
await refus('4. Créer la même organisation une seconde fois (doublon)', appeler('creer_organisation', { nom: NOM.toLowerCase() }), /existante possible/);
await refus('5. Supprimer avec un mauvais nom de confirmation', appeler('supprimer_organisation', { id: organisationId, confirmationNom: 'Pas le bon nom' }), /non confirmée/);
await attendu('6. L\'organisation est toujours là après les refus', appeler('lire_organisation', { id: organisationId }), (d) => (d.organisation?.nom === NOM ? null : 'organisation absente ou renommée'));
bon('intacte');

// 5. Suppression
const suppr = await attendu('7. Supprimer (nom de confirmation, puis aperçu et code)', supprimerAvecCode({ id: organisationId, confirmationNom: NOM }), (d) => (d.operationId ? null : 'pas d\'identifiant d\'opération'));
bon(`supprimée (opération ${suppr.operationId}) : ${JSON.stringify(suppr.supprimes)}`);
await refus('8. Elle a bien disparu', appeler('lire_organisation', { id: organisationId }), /introuvable/);

// 6. Restauration
const apercu = await attendu('9. Restauration : aperçu (rien n\'est écrit)', appeler('restaurer_depuis_audit', { operationId: suppr.operationId }), (d) => (d.apercu === true && d.aDefaire >= 1 && d.conflits === 0 ? null : `aperçu inattendu : ${JSON.stringify(d).slice(0, 150)}`));
bon(`${apercu.aDefaire} document(s) à recréer : ${apercu.lignes.map((l) => `${l.collection} ${l.action}`).join(', ')}`);
await refus('10. Toujours supprimée après l\'aperçu', appeler('lire_organisation', { id: organisationId }), /introuvable/);
const fait = await attendu('11. Restauration : pour de vrai', appeler('restaurer_depuis_audit', { operationId: suppr.operationId, apercu: false }), (d) => (d.restauree === true ? null : `restauration inattendue : ${JSON.stringify(d).slice(0, 150)}`));
bon(`restaurée : ${fait.ecritures.length} écriture(s), opération ${fait.operationRestauration}`);
await attendu('12. Revenue, avec le même identifiant', appeler('lire_organisation', { id: organisationId, avecFil: true }), (d) => {
  if (d.organisation?.nom !== NOM) return 'organisation absente ou autre nom';
  if (!d.fil?.some((e) => /Organisation créée/.test(e.texte ?? ''))) return 'son événement « Organisation créée » n’est pas revenu';
  return null;
});
bon(`« ${NOM} » est revenue (id ${organisationId}) avec son événement « Organisation créée »`);

// 7. Nettoyage
const nettoyage = await attendu('13. Nettoyage : suppression définitive', supprimerAvecCode({ id: organisationId, confirmationNom: NOM }), (d) => (d.operationId ? null : 'pas d\'identifiant d\'opération'));
bon(`supprimée de nouveau (opération ${nettoyage.operationId})`);
await refus('14. Plus rien', appeler('lire_organisation', { id: organisationId }), /introuvable/);
organisationId = null;

console.log('\nESSAI RÉUSSI : créer, journaliser, refuser un doublon, refuser une suppression non confirmée, supprimer, restaurer à l\'identique, nettoyer.');
console.log('Il reste à créer la règle TTL de crm_audit_avant (la collection existe maintenant).');
