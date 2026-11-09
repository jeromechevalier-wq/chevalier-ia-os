// Outil MCP `modifier_reglages_devis` (09/11/2026) : l'assistant d'un éditeur (profil complet) règle le module Devis d'un espace.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire. Les numéros RG1 à RG8 suivent les critères d'acceptation du brief.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import * as DA from '../functions/partage/devis-articles.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, agent: `cia_${'A'.repeat(43)}`, code: `cia_${'C'.repeat(43)}`, statique: `cia_${'S'.repeat(43)}`, autre: `cia_${'X'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
// `code` simule une connexion OAuth du propriétaire (e-mail vérifié, casse libre) ; `autre` = un autre compte en profil complet ; `statique` = jeton statique complet sans e-mail (le secret des jetons n'en porte jamais).
const EMAIL_PROPRIETAIRE = 'Jerome.Chevalier@Gmail.com';
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const ENTREPRISE = Object.freeze({
  nom: 'Entreprise Essai', siret: '123 456 789 00010', telephone: '01 02 03 04 05',
  adresse: { ligne1: '1 rue de l’Essai', codePostal: '75001', ville: 'Paris' },
  assuranceTexte: 'Assurance décennale : Assureur Essai.',
  coordonneesBancaires: 'Banque Essai',
  paiement: { modes: ['Virement'], iban: 'FR76 0000 0000 0000 0000 0000 000' },
});
const REGLAGES_EXISTANTS = () => ({ id: 'reglages', regimeTva: 'assujetti', marge: 20, margeDevis: 15, modeMarge: 'majoration', mentionEmetteur: 'Ancienne mention', entreprise: structuredClone(ENTREPRISE) });

async function demarrer({ existants = true } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: [], devis_devis: [], devis_compteurs: [], devis_parametres: existants ? [REGLAGES_EXISTANTS()] : [] });
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const entrees = [entree(JETONS.lecteur, 'lecteur-essai', 'lecture'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'ecriture'), entree(JETONS.agent, 'n8n-devis-essai', 'agent-devis'), entree(JETONS.code, 'claude-essai', 'complet', { email: EMAIL_PROPRIETAIRE }), entree(JETONS.statique, 'claude-code-statique', 'complet'), entree(JETONS.autre, 'autre-complet', 'complet', { email: 'autre@exemple.test' })];
  const magasin = { entrees: async () => ({ entrees, invalides: 0 }) };
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {} });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
  arrets.push(() => new Promise((fin) => serveur.close(fin)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const rpc = async (jeton, methode, params) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }) });
    return r.json();
  };
  const appeler = async (jeton, nom, args = {}) => {
    const corps = await rpc(jeton, 'tools/call', { name: nom, arguments: args });
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  const outils = async (jeton) => (await rpc(jeton, 'tools/list', {})).result.tools.map((t) => t.name);
  return { collections, appeler, outils, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };
const OUTIL = 'modifier_reglages_devis';
const lignesReglages = (s) => s.collections.crm_audit.filter((l) => l.collection === 'devis_parametres');

describe('RG1 mise à jour partielle : seuls les champs cités changent', () => {
  test('RG1 marge, mention et SIRET changent ; nom, adresse, assurance, banque et paiement restent ; la réponse n’a pas de modeMarge', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: 30, mentionEmetteur: 'Nouvelle mention', entreprise: { siret: '999 888 777 00011', adresse: { ville: 'Lyon' } } } }));
    assert.deepEqual([...r.champsModifies].sort(), ['entreprise.adresse.ville', 'entreprise.siret', 'marge', 'mentionEmetteur']);
    assert.equal(r.reglages.marge, 30);
    assert.equal(r.reglages.mentionEmetteur, 'Nouvelle mention');
    assert.equal(r.reglages.entreprise.siret, '999 888 777 00011');
    assert.equal('coordonneesBancaires' in r.reglages.entreprise, false, 'la réponse ne montre pas les coordonnées bancaires');
    assert.equal('paiement' in r.reglages.entreprise, false, 'la réponse ne montre pas le paiement (IBAN)');
    assert.equal(JSON.stringify(r).includes('FR76'), false);
    assert.equal('modeMarge' in r.reglages, false, 'le mode de calcul n’est jamais montré');
    const d = s.doc('devis_parametres', 'reglages');
    assert.equal(d.modeMarge, 'majoration');
    assert.equal(d.margeDevis, 15);
    assert.equal(d.entreprise.nom, 'Entreprise Essai');
    assert.deepEqual(d.entreprise.adresse, { ligne1: '1 rue de l’Essai', codePostal: '75001', ville: 'Lyon' }, 'fusion profonde de l’adresse');
    assert.equal(d.entreprise.assuranceTexte, 'Assurance décennale : Assureur Essai.');
    assert.equal(d.entreprise.coordonneesBancaires, 'Banque Essai');
    assert.deepEqual(d.entreprise.paiement, ENTREPRISE.paiement, 'paiement (IBAN compris) intact');
    assert.equal(d.entreprise.telephone, '01 02 03 04 05');
  });
  test('RG1 une chaîne vide efface le champ d’« Mon entreprise » ; les autres restent', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('code', OUTIL, { reglages: { entreprise: { telephone: '' } } }));
    assert.deepEqual(r.champsModifies, ['entreprise.telephone']);
    assert.equal('telephone' in s.doc('devis_parametres', 'reglages').entreprise, false);
    assert.equal(s.doc('devis_parametres', 'reglages').entreprise.siret, '123 456 789 00010');
  });
});

describe('RG2 espace neuf : le document des réglages est créé', () => {
  test('RG2 sans document, l’outil le crée ; lire_reglages_devis le relit ; la création défaite le supprime (valeurs par défaut)', async () => {
    const s = await demarrer({ existants: false });
    const r = ok(await s.appeler('code', OUTIL, { reglages: { entreprise: { nom: 'Atelier Essai' }, marge: 25 } }));
    assert.equal(r.cree, true);
    const lu = ok(await s.appeler('lecteur', 'lire_reglages_devis', {}));
    assert.equal(lu.reglages.entreprise.nom, 'Atelier Essai');
    assert.equal(lu.reglages.marge, 25);
    assert.equal('modeMarge' in lu.reglages, false);
    const avant = ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(avant.restauree, true);
    assert.equal(s.doc('devis_parametres', 'reglages'), undefined, 'création défaite = plus de document');
    assert.equal(ok(await s.appeler('lecteur', 'lire_reglages_devis', {})).reglages.marge, DA.REGLAGES_DEVIS_DEFAUT.marge, 'retour aux valeurs par défaut');
  });
});

describe('RG3 droits : profil complet seulement', () => {
  test('RG3 agent-devis, lecture, écriture, un autre compte complet et un jeton statique complet ne voient pas l’outil et ne peuvent pas l’appeler ; le propriétaire (e-mail vérifié, casse libre) le voit', async () => {
    const s = await demarrer();
    assert.ok((await s.outils('code')).includes(OUTIL));
    for (const j of ['agent', 'lecteur', 'biblio', 'autre', 'statique']) {
      assert.ok(!(await s.outils(j)).includes(OUTIL), j);
      refuse(await s.appeler(j, OUTIL, { reglages: { marge: 30 } }));
    }
    assert.equal(s.doc('devis_parametres', 'reglages').marge, 20);
    assert.equal(lignesReglages(s).length, 0);
  });
});

describe('RG4 validation : celle de l’écran, rien d’écrit en cas de refus', () => {
  const REFUS = [
    ['couleur sans #', { entreprise: { couleur: 'ff0000' } }, /couleur/i],
    ['couleur invalide', { entreprise: { couleur: '#12' } }, /couleur/i],
    ['marge hors bornes (margeDevis)', { margeDevis: 5000 }, /marge du devis/i],
    ['marge démesurée', { marge: 5_000_000 }, /marge|too_big|1000000/i],
    ['taux non proposé', { tauxProposes: [7] }, /7/],
    ['taux par défaut non proposé', { tauxProposes: [20], tauxTvaDefaut: 10 }, /taux par défaut/i],
    ['régime inconnu', { regimeTva: 'inconnu' }, /régime/i],
    ['mention trop longue', { mentionEmetteur: 'x'.repeat(2500) }, /trop long/i],
    ['assurance trop longue', { entreprise: { assuranceTexte: 'x'.repeat(600) } }, /trop long/i],
    ['e-mail invalide', { entreprise: { email: 'pas-un-mail' } }, /e-mail/i],
    ['délai de relance plus long que la validité', { dureeValiditeJours: 30, delaiRelanceJours: 40 }, /plus court/i],
    ['nom de bordereau inconnu', { nomBordereau: 'Autre' }, /nom/i],
  ];
  for (const [nom, reglages, motif] of REFUS) {
    test(`RG4 ${nom} : message de l’écran, rien d’écrit`, async () => {
      const s = await demarrer();
      const avant = JSON.stringify(s.collections.devis_parametres);
      const journal = s.collections.crm_audit.length;
      const r = await s.appeler('code', OUTIL, { reglages });
      refuse(r, motif);
      assert.doesNotMatch(r.texte, /Calcul artisan|Calcul comptable|modeMarge/, 'le mode de calcul n’est jamais cité');
      assert.equal(JSON.stringify(s.collections.devis_parametres), avant);
      assert.equal(s.collections.crm_audit.length, journal);
    });
  }
  const INTERDITS = [
    ['modeMarge', { modeMarge: 'marge_vente' }], ['iban', { entreprise: { iban: 'FR76' } }], ['coordonneesBancaires', { entreprise: { coordonneesBancaires: 'x' } }],
    ['paiement', { entreprise: { paiement: { iban: 'FR76' } } }], ['actif', { actif: false }], ['modules', { modules: {} }], ['étape', { etapeDevis: 'x' }], ['champ inconnu', { truc: 1 }],
    ['adresse : champ inconnu', { entreprise: { adresse: { pays: 'FR' } } }],
  ];
  for (const [nom, reglages] of INTERDITS) {
    test(`RG4 champ interdit (${nom}) : refus clair, rien d’écrit`, async () => {
      const s = await demarrer();
      const avant = JSON.stringify(s.collections.devis_parametres);
      refuse(await s.appeler('code', OUTIL, { reglages }), /unrecognized|inconnu|invalid|cl[ée]/i);
      assert.equal(JSON.stringify(s.collections.devis_parametres), avant);
      assert.equal(lignesReglages(s).length, 0);
    });
  }
  test('RG4 `reglages` vide est refusé ; une clé placée à côté de `reglages` est ignorée (jamais écrite) et le reste s’applique', async () => {
    const s = await demarrer();
    const avant = JSON.stringify(s.collections.devis_parametres);
    refuse(await s.appeler('code', OUTIL, { reglages: {} }), /Aucun réglage/);
    assert.equal(JSON.stringify(s.collections.devis_parametres), avant);
    ok(await s.appeler('code', OUTIL, { reglages: { marge: 31 }, modeMarge: 'marge_vente', entreprise: { iban: 'FR76' } }));
    const d = s.doc('devis_parametres', 'reglages');
    assert.equal(d.marge, 31);
    assert.equal(d.modeMarge, 'majoration');
    assert.deepEqual(d.entreprise.paiement, ENTREPRISE.paiement);
  });
  test('RG4 espace en calcul comptable : marge de 100 % refusée sans citer le mode de calcul', async () => {
    const s = await demarrer();
    s.doc('devis_parametres', 'reglages').modeMarge = 'marge_vente';
    const r = await s.appeler('code', OUTIL, { reglages: { margeDevis: 100 } });
    refuse(r, /marge est impossible/);
    assert.doesNotMatch(r.texte, /calcul (artisan|comptable)|modeMarge/i);
    assert.equal((r.texte.match(/pourcentage plus petit/g) ?? []).length, 1, 'la phrase ne se répète pas');
  });
});

describe('RG5 journal et restauration', () => {
  test('RG5 une ligne crm_audit avec la copie « avant » ; restaurer_depuis_audit remet l’ancien état', async () => {
    const s = await demarrer();
    const avantDoc = structuredClone(s.doc('devis_parametres', 'reglages'));
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: 35, entreprise: { nom: 'Autre nom' } } }));
    const lignes = lignesReglages(s);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].outil, OUTIL);
    assert.equal(lignes[0].action, 'modifier');
    assert.equal(lignes[0].operationId, r.operationId);
    const copie = s.doc('crm_audit_avant', lignes[0].id);
    assert.ok(copie, 'copie avant/après gardée');
    assert.equal(JSON.stringify(copie).includes('Entreprise Essai'), true, 'la copie « avant » porte l’ancien nom');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.doc('devis_parametres', 'reglages'), avantDoc);
  });
});

describe('RG6 l’écran lit les nouvelles valeurs', () => {
  test('RG6 DA.reglagesDevis (lecture de l’écran) montre ce que l’outil a écrit', async () => {
    const s = await demarrer();
    ok(await s.appeler('code', OUTIL, { reglages: { dureeValiditeJours: 60, delaiRelanceJours: 12, tauxProposes: [20, 10], tauxTvaDefaut: 10, gestionDechets: false, entreprise: { couleur: '#1F6FEB', mediateur: { nom: 'Médiateur Essai' } } } }));
    const e = DA.reglagesDevis(s.doc('devis_parametres', 'reglages'));
    assert.equal(e.dureeValiditeJours, 60);
    assert.equal(e.delaiRelanceJours, 12);
    assert.deepEqual(e.tauxProposes, [20, 10]);
    assert.equal(e.tauxTvaDefaut, 10);
    assert.equal(e.gestionDechets, false);
    assert.equal(e.entreprise.couleur, '#1f6feb');
    assert.equal(e.entreprise.mediateur.nom, 'Médiateur Essai');
    assert.equal(e.modeMarge, 'majoration', 'le mode de calcul n’a pas bougé');
  });
});

describe('RG8 rien à changer', () => {
  test('RG8 les mêmes valeurs : réponse claire, aucune ligne de journal, rien d’écrit', async () => {
    const s = await demarrer();
    const avant = JSON.stringify(s.collections.devis_parametres);
    const journal = s.collections.crm_audit.length;
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: 20, entreprise: { siret: '123 456 789 00010' } } }));
    assert.equal(r.rienAChanger, true);
    assert.deepEqual(r.champsModifies, []);
    assert.match(r.message, /Rien à changer/);
    assert.equal(JSON.stringify(s.collections.devis_parametres), avant);
    assert.equal(s.collections.crm_audit.length, journal);
  });
});

describe('RG9 comptes rendus honnêtes et concurrence', () => {
  test('RG9 un document « sale » : le nettoyage de la validation apparaît dans champsModifies au lieu de disparaître en silence', async () => {
    const s = await demarrer();
    Object.assign(s.doc('devis_parametres', 'reglages').entreprise, { email: 'pas-un-mail', logoUrl: 'x' });
    const r = ok(await s.appeler('code', OUTIL, { reglages: { entreprise: { siret: '1' } } }));
    assert.ok(r.champsModifies.includes('entreprise.siret'));
    assert.ok(r.champsModifies.includes('entreprise.email') && r.champsModifies.includes('entreprise.logoUrl'), r.champsModifies.join());
  });
  test('RG9 une valeur invalide restée en base et remplacée par la bonne valeur n’est pas « rien à changer »', async () => {
    const s = await demarrer();
    s.doc('devis_parametres', 'reglages').marge = 'abc';
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: 20 } }));
    assert.equal(r.rienAChanger, undefined);
    assert.equal(s.doc('devis_parametres', 'reglages').marge, 20);
  });
  test('RG9 espace neuf et réglages égaux aux défauts : le document est tout de même créé, sans modeMarge, et le journal ne le montre pas', async () => {
    const s = await demarrer({ existants: false });
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: DA.REGLAGES_DEVIS_DEFAUT.marge } }));
    assert.equal(r.cree, true);
    const d = s.doc('devis_parametres', 'reglages');
    assert.ok(d);
    assert.equal('modeMarge' in d, false);
    assert.equal(JSON.stringify(lignesReglages(s)).includes('modeMarge'), false);
  });
  test('RG9 le moteur refuse d’écrire si le document a changé depuis la lecture (exigerAvant) : rien n’est écrit', async () => {
    const { executerEcritures } = await import('../functions/src/coeur/ecriture.js');
    const collections = { devis_parametres: [{ id: 'reglages', marge: 20 }], crm_audit: [], crm_audit_avant: [] };
    const donnees = creerAccesMemoire(collections);
    const ctx = { acteur: 'essai', jeton: 'j', via: 'mcp', maintenant: MAINTENANT };
    const lu = { marge: 20 };
    collections.devis_parametres[0].marge = 99; // l'écran a enregistré entre la lecture et l'écriture
    await assert.rejects(() => executerEcritures({ donnees, ctx, outil: 'essai', operations: [{ type: 'modifier', collection: 'devis_parametres', id: 'reglages', patch: { margeDevis: 5 }, exigerAvant: lu }] }), /a changé pendant la préparation/);
    assert.equal(collections.devis_parametres[0].marge, 99);
    assert.equal(collections.devis_parametres[0].margeDevis, undefined);
  });
});

describe('RG10 réservé aux super admins (décision du 09/11/2026) : le profil ne suffit pas', () => {
  test('RG10 la liste SUPER_ADMINS (configuration du serveur) contient exactement les deux comptes de Jérôme, tous deux dans COMPTES_AUTORISES', async () => {
    const { SUPER_ADMINS } = await import('../functions/src/securite/super-admins.js');
    const { COMPTES_AUTORISES } = await import('../functions/src/oauth/config.js');
    assert.deepEqual([...SUPER_ADMINS], ['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com']);
    for (const e of SUPER_ADMINS) assert.ok(COMPTES_AUTORISES.includes(e), `${e} peut se connecter`);
  });
  test('RG10 estSuperAdmin : chacun des deux comptes = oui, casse et espaces ignorés ; un autre compte, le profil, l’espace, un jeton statique = non', async () => {
    const { estSuperAdmin } = await import('../functions/src/mcp/gestionnaire.js');
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet', email: 'jerome.chevalier@gmail.com' } }), true);
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet', email: 'jeromebot.chevalierbot@gmail.com' } }), true);
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet', email: ' JEROME.CHEVALIER@gmail.com ' } }), true, 'casse et espaces normalisés');
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet', email: 'autre@exemple.test', role: 'editeur', client: 'a' } }), false, 'éditeur client en profil complet');
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet', email: 'jerome.chevalier@gmail.com.evil.test' } }), false, 'pas de correspondance partielle');
    assert.equal(estSuperAdmin({ jeton: { profil: 'lecture', role: 'lecteur', email: 'lea@exemple.test' } }), false);
    assert.equal(estSuperAdmin({ jeton: { profil: 'complet' } }), false, 'jeton statique sans e-mail');
    assert.equal(estSuperAdmin({ jeton: { profil: 'agent-devis', email: 42 } }), false);
    assert.equal(estSuperAdmin({}), false);
  });
  test('RG10 deuxième verrou : l’action refuse à l’exécution si l’appelant n’est pas un super admin, sans rien lire ni écrire', async () => {
    const metier = await import('../functions/src/coeur/metier.js');
    let appels = 0;
    const c = { superAdmin: false, args: { reglages: { marge: 30 } }, donnees: { document: async () => { appels++; return null; } }, ecrire: async () => { appels++; } };
    await assert.rejects(() => metier.modifierReglagesDevis(c, c.args), /pas disponible pour ce compte/);
    await assert.rejects(() => metier.modifierReglagesDevis({ ...c, superAdmin: undefined }, c.args), /pas disponible/);
    assert.equal(appels, 0);
  });
});

describe('RG11 la restauration ne contourne pas la réservation', () => {
  test('RG11 un autre compte complet et un jeton statique ne défont pas l’opération d’un super admin (aperçu et exécution refusés, document intact) ; le super admin la défait', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc('devis_parametres', 'reglages'));
    const r = ok(await s.appeler('code', OUTIL, { reglages: { marge: 44 } }));
    const apres = JSON.stringify(s.collections.devis_parametres);
    for (const j of ['autre', 'statique']) {
      refuse(await s.appeler(j, 'restaurer_depuis_audit', { operationId: r.operationId }), /réservé aux super admins/);
      refuse(await s.appeler(j, 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false, forcer: true }), /réservé aux super admins/);
      assert.equal(JSON.stringify(s.collections.devis_parametres), apres, `${j} : document intact`);
    }
    // « Restaurer la restauration » ne contourne pas la réservation : l'opération de restauration du super admin est refusée aux autres comptes.
    const b = ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.doc('devis_parametres', 'reglages'), avant);
    const apresRestauration = JSON.stringify(s.collections.devis_parametres);
    for (const j of ['autre', 'statique']) {
      refuse(await s.appeler(j, 'restaurer_depuis_audit', { operationId: b.operationRestauration }), /réservé aux super admins/);
      refuse(await s.appeler(j, 'restaurer_depuis_audit', { operationId: b.operationRestauration, apercu: false, forcer: true }), /réservé aux super admins/);
      assert.equal(JSON.stringify(s.collections.devis_parametres), apresRestauration, `${j} : document intact après la restauration`);
    }
  });
  test('RG11 les entrées du secret des jetons n’ont jamais d’e-mail (un jeton statique n’est jamais super admin)', async () => {
    const { analyserSecret } = await import('../functions/src/securite/jetons.js');
    const { entrees } = analyserSecret(JSON.stringify([{ jeton: 'jeton-essai', acteur: 'acteur-essai', profil: 'complet', empreinte: 'a'.repeat(64), actif: true, email: 'jerome.chevalier@gmail.com' }]));
    assert.equal(entrees.length, 1);
    assert.deepEqual(Object.keys(entrees[0]).sort(), ['acteur', 'actif', 'empreinte', 'jeton', 'profil']);
  });
});
