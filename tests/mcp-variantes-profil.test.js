// Variantes de tools/list par profil (09/11/2026) : le profil assistant-devis reçoit des descriptions courtes et un schéma allégé pour modifier_devis_brouillon ; TOUS les autres profils reçoivent exactement la même liste qu'avant.
// 1 invariance octet par octet des autres profils ; 2 alias ; 3 noms inchangés ; 4 garde-fous lisibles ; 5 champs obligatoires ; 6 refus de lignes et sections ; 7 poids plafonné ; 8 textes sans mot propre à Jérôme.
// ATTENTION : l'octet par octet dépend des versions FIGÉES de @modelcontextprotocol/sdk (1.32.0) et de zod (4.6.5) : une mise à jour d'une de ces dépendances change la forme du JSON Schema et rend le test rouge sans que rien d'autre n'ait bougé.
// Les listes de référence ont été créées à partir de main AVANT le changement. Pour les régénérer (seulement quand une description d'un autre profil change volontairement) : node tests/outils/figer-tools-list.js
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { z } from '../functions/node_modules/zod/index.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS, outilsAutorises } from '../functions/src/mcp/outils/index.js';
import { GARANTIE_PAS_D_ENVOI, concerneParLaGarantie } from '../functions/src/mcp/outils/garantie.js';
import { CONSIGNE_LIEN_ECRAN } from '../functions/src/coeur/liens.js';
import { varianteDuProfil, OUTILS_AVEC_VARIANTE, GARANTIE_COURTE, LIEN_COURT, MESSAGE_REFUS_LIGNES } from '../functions/src/mcp/outils/variantes-assistant-devis.js';
import { analyserSecret, empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';
import { CAS_FIGES, listerOutils, texteFige } from './outils/lister-outils.js';

const lireFixture = (cas) => readFileSync(new URL(`./fixtures/tools-list-${cas}.json`, import.meta.url), 'utf8');
const COMMANDE = 'node tests/outils/figer-tools-list.js';
const MODULES_DEVIS_SEUL = ['devis', 'mcp'];
const AFFAIRES = ['creer_affaire', 'lire_affaire', 'lister_affaires'];
const NOMS_ASSISTANT = ['annuler_derniere_modification_devis', 'chercher', 'chercher_article', 'creer_affaire', 'creer_devis_brouillon', 'creer_organisation', 'creer_personne', 'finaliser_devis', 'lire_affaire', 'lire_devis', 'lire_organisation', 'lire_personne', 'lire_reglages_devis', 'lister_affaires', 'lister_articles', 'lister_devis', 'modifier_destinataires_devis', 'modifier_devis_brouillon', 'modifier_lignes_devis', 'nouvelle_version_devis', 'obtenir_pdf_officiel_devis', 'preparer_email', 'qui_suis_je', 'rechercher_article_par_phrase'];
const OUTILS_DU_BOT = ['lister_devis', 'lire_devis', 'chercher_article', 'modifier_devis_brouillon', 'modifier_lignes_devis', 'annuler_derniere_modification_devis', 'nouvelle_version_devis', 'finaliser_devis', 'preparer_email'];

let jerome; let clientDevisSeul;
const listes = async () => {
  jerome ??= await listerOutils({ profil: 'assistant-devis' });
  clientDevisSeul ??= await listerOutils({ profil: 'assistant-devis', modules: MODULES_DEVIS_SEUL });
  return { jerome: jerome.tools, client: clientDevisSeul.tools };
};
const parNom = (tools) => Object.fromEntries(tools.map((t) => [t.name, t]));

describe('1 invariance : tout profil autre qu\'assistant-devis reçoit exactement la même liste qu\'avant', () => {
  for (const [cas, params] of Object.entries(CAS_FIGES)) {
    test(`1 ${cas} : tools/list identique octet par octet à tests/fixtures/tools-list-${cas}.json`, async () => {
      const { tools } = await listerOutils(params);
      assert.ok(texteFige(tools) === lireFixture(cas), `La liste d'outils du profil « ${cas} » a changé. Si c'est voulu (description ou schéma d'un autre profil), régénère les listes de référence avec « ${COMMANDE} » et dis-le dans la PR ; sinon une variante a fuité hors d'assistant-devis. (Dépend de @modelcontextprotocol/sdk 1.32.0 et zod 4.6.5.)`);
    });
  }
  test('1 les nombres de référence : 84 outils pour un jeton fixe complet, 85 pour un super admin OAuth (avec modifier_reglages_devis)', () => {
    assert.equal(JSON.parse(lireFixture('complet')).length, 84);
    const superAdmin = JSON.parse(lireFixture('complet-super-admin'));
    assert.equal(superAdmin.length, 85);
    assert.ok(superAdmin.some((t) => t.name === 'modifier_reglages_devis'));
  });
  test('1 varianteDuProfil rend l\'outil LUI-MÊME (même objet) pour tout profil autre qu\'assistant-devis', () => {
    for (const profil of ['lecture', 'ecriture', 'agent-devis', 'complet']) for (const o of OUTILS) assert.equal(varianteDuProfil(o, profil), o, `${profil} / ${o.nom}`);
  });
  test('1 pour assistant-devis, la variante garde executer, profils, nom et meta de l\'outil d\'origine', () => {
    for (const nom of OUTILS_AVEC_VARIANTE) {
      const o = OUTILS.find((x) => x.nom === nom);
      const v = varianteDuProfil(o, 'assistant-devis');
      assert.notEqual(v, o, nom);
      assert.equal(v.executer, o.executer, nom);
      assert.deepEqual([v.nom, v.profils, v.meta], [o.nom, o.profils, o.meta], nom);
    }
  });
});

describe('2 alias : un jeton déclaré avec l\'ancien nom reçoit la liste de son profil canonique', () => {
  for (const [alias, canonique] of [['claude-code', 'complet'], ['lecteur', 'lecture'], ['bibliothecaire', 'ecriture']]) {
    test(`2 ${alias} = fixture de ${canonique}`, async () => {
      const ligne = JSON.stringify({ jeton: 'essai-alias', acteur: 'essai-alias', profil: alias, empreinte: empreinte(`cia_${'A'.repeat(43)}`), actif: true });
      const profil = analyserSecret(ligne).entrees[0].profil;
      assert.equal(profil, canonique);
      const { tools } = await listerOutils({ profil });
      assert.ok(texteFige(tools) === lireFixture(canonique), `Liste du profil ${canonique} changée : ${COMMANDE}`);
    });
  }
});

describe('3 mêmes outils pour assistant-devis', () => {
  test('3 les noms de tools/list sont les 24 d\'avant chez Jérôme et les 21 d\'un client Devis seul (sans les trois d\'Affaires)', async () => {
    const l = await listes();
    assert.deepEqual(l.jerome.map((t) => t.name).sort(), NOMS_ASSISTANT);
    assert.deepEqual(l.client.map((t) => t.name).sort(), NOMS_ASSISTANT.filter((n) => !AFFAIRES.includes(n)));
    assert.deepEqual(outilsAutorises('assistant-devis').map((o) => o.nom).sort(), NOMS_ASSISTANT);
  });
});

describe('4 garde-fous lisibles dans les descriptions servies à assistant-devis', () => {
  test('4a finaliser_devis : aperçu puis code de confirmation, jamais demandé à l\'utilisateur', async () => {
    const d = parNom((await listes()).jerome).finaliser_devis.description;
    assert.match(d, /APERÇU/);
    assert.match(d, /codeConfirmation/);
    assert.match(d, /code à usage unique/);
    assert.match(d, /accord explicite de l'utilisateur/);
    assert.match(d, /Ne demande jamais le code à l'utilisateur/);
  });
  test('4b devis finalisé non modifiable : renvoi vers nouvelle_version_devis (modifier_devis_brouillon, modifier_lignes_devis, annuler, nouvelle_version)', async () => {
    const t = parNom((await listes()).jerome);
    for (const nom of ['modifier_devis_brouillon', 'modifier_lignes_devis']) {
      assert.match(t[nom].description, /finalisé/, nom);
      assert.match(t[nom].description, /nouvelle_version_devis/, nom);
    }
    assert.match(t.annuler_derniere_modification_devis.description, /finalisé/);
    assert.match(t.nouvelle_version_devis.description, /seule voie pour corriger un devis déjà finalisé/);
  });
  test('4c modifier_lignes_devis : `attendu` obligatoire, tout ou rien, numéros lus avant l\'appel', async () => {
    const d = parNom((await listes()).jerome).modifier_lignes_devis.description;
    assert.match(d, /OBLIGATOIRE/);
    assert.match(d, /`attendu`/);
    assert.match(d, /rien n'est écrit/);
    assert.match(d, /TOUT OU RIEN/);
    assert.match(d, /AVANT l'appel/);
  });
  test('4d `lignes` et `sections` refusés pour modifier_devis_brouillon, renvoi vers modifier_lignes_devis ; l\'ancienne phrase « REMPLACENT » a disparu', async () => {
    const t = parNom((await listes()).jerome).modifier_devis_brouillon;
    assert.match(t.description, /`lignes` et `sections`.*REFUSÉS/);
    assert.match(t.description, /modifier_lignes_devis/);
    assert.match(t.description, /ajouterLignes ajoute sans toucher au reste/);
    assert.doesNotMatch(t.description, /REMPLACENT/);
    assert.ok(!('lignes' in t.inputSchema.properties) && !('sections' in t.inputSchema.properties), 'lignes et sections ne sont plus annoncés');
    assert.ok('ajouterLignes' in t.inputSchema.properties);
    assert.notEqual(t.inputSchema.additionalProperties, false, 'un champ inconnu est toléré comme sur main, pas refusé');
  });
  test('4e aucun e-mail ne part seul : texte COMPLET sur preparer_email, obtenir_pdf_officiel_devis et finaliser_devis ; une phrase courte sur les autres outils devis', async () => {
    const t = parNom((await listes()).jerome);
    for (const nom of ['preparer_email', 'obtenir_pdf_officiel_devis', 'finaliser_devis']) assert.ok(t[nom].description.includes(GARANTIE_PAS_D_ENVOI), `${nom} : garantie complète`);
    assert.match(t.preparer_email.description, /BROUILLON d'e-mail/);
    assert.match(t.preparer_email.description, /N'ENVOIE RIEN/);
    const autres = OUTILS.filter((o) => o.profils.includes('assistant-devis') && concerneParLaGarantie(o) && !['preparer_email', 'obtenir_pdf_officiel_devis', 'finaliser_devis'].includes(o.nom));
    assert.ok(autres.length >= 7, `${autres.length} autres outils devis`);
    for (const o of autres) {
      assert.ok(t[o.nom].description.includes(GARANTIE_COURTE), `${o.nom} : garantie courte`);
      assert.ok(!t[o.nom].description.includes(GARANTIE_PAS_D_ENVOI), `${o.nom} : pas la garantie complète répétée`);
    }
    assert.match(GARANTIE_COURTE, /brouillon/);
    assert.match(GARANTIE_COURTE, /lui-même/);
  });
  test('4f lienEcran recopié tel quel : une fois, en court, sur chaque outil qui avait la consigne ; jamais la consigne longue', async () => {
    const t = parNom((await listes()).jerome);
    const concernes = OUTILS.filter((o) => o.profils.includes('assistant-devis') && o.description.includes(CONSIGNE_LIEN_ECRAN));
    assert.ok(concernes.length >= 10, `${concernes.length} outils`);
    for (const o of concernes) {
      const d = t[o.nom].description;
      assert.equal(d.split(LIEN_COURT).length - 1, 1, `${o.nom} : consigne de lien dite une fois`);
      assert.doesNotMatch(d, new RegExp(CONSIGNE_LIEN_ECRAN.slice(0, 40)), o.nom);
    }
    assert.match(LIEN_COURT, /lienEcran tel quel/);
    assert.match(LIEN_COURT, /ne construis jamais un lien/);
  });
  test('4g modifier_lignes_devis : changementImportant et totalChangementImportant à redire à l\'utilisateur', async () => {
    const d = parNom((await listes()).jerome).modifier_lignes_devis.description;
    assert.match(d, /changementImportant/);
    assert.match(d, /totalChangementImportant/);
    assert.match(d, /redis-le à l'utilisateur/);
  });
  test('4h chaque outil réécrit reste plus court que l\'original (sinon la variante ne sert à rien)', async () => {
    const t = parNom((await listes()).jerome);
    for (const nom of OUTILS_AVEC_VARIANTE) assert.ok(t[nom].description.length < OUTILS.find((o) => o.nom === nom).description.length, nom);
  });
});

describe('4bis toute description servie ne cite que des outils du profil', () => {
  test('4bis aucun renvoi vers un outil que le bot ne reçoit pas', async () => {
    const l = await listes();
    const tousLesNoms = OUTILS.map((o) => o.nom);
    for (const liste of [l.jerome, l.client]) {
      const presents = new Set(liste.map((t) => t.name));
      for (const t of liste.filter((x) => OUTILS_AVEC_VARIANTE.includes(x.name))) for (const nom of tousLesNoms) { // les petits outils de fiches gardent leur texte d'origine (qui cite encore lire_reglages)
        if (presents.has(nom) || AFFAIRES.includes(nom)) continue; // les outils d'Affaires sont cités par chercher / creer_devis_brouillon même quand le module est éteint (texte d'origine)
        assert.doesNotMatch(t.description, new RegExp(`\\b${nom}\\b`), `${t.name} cite ${nom}, absent du profil`);
      }
    }
  });
});

describe('5 cohérence description / exécution : tout champ obligatoire du schéma d\'exécution est annoncé', () => {
  test('5 pour chaque outil du profil, chez Jérôme et chez un client Devis seul, les champs requis de l\'exécution sont annoncés comme requis', async () => {
    const l = await listes();
    for (const liste of [l.jerome, l.client]) {
      const t = parNom(liste);
      for (const o of outilsAutorises('assistant-devis')) {
        if (!t[o.nom]) continue;
        const requis = o.schema ? (z.toJSONSchema(z.object(o.schema)).required ?? []) : [];
        for (const champ of requis) {
          assert.ok(t[o.nom].inputSchema.properties?.[champ], `${o.nom} : ${champ} annoncé`);
          assert.ok((t[o.nom].inputSchema.required ?? []).includes(champ), `${o.nom} : ${champ} annoncé comme obligatoire`);
        }
      }
    }
  });
  test('5 modifier_devis_brouillon : tous les champs d\'exécution sauf lignes et sections sont annoncés', async () => {
    const o = OUTILS.find((x) => x.nom === 'modifier_devis_brouillon');
    const annonces = Object.keys(parNom((await listes()).jerome).modifier_devis_brouillon.inputSchema.properties).sort();
    assert.deepEqual(annonces, Object.keys(o.schema).filter((c) => !['lignes', 'sections'].includes(c)).sort());
  });
});

describe('6 refus de `lignes` et `sections` par le protocole MCP (assistant-devis seulement)', () => {
  const JETONS = { assistant: `cia_${'S'.repeat(43)}`, agent: `cia_${'G'.repeat(43)}`, complet: `cia_${'C'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}` };
  const PROFILS = { assistant: 'assistant-devis', agent: 'agent-devis', complet: 'complet', biblio: 'ecriture' };
  const arrets = [];
  afterEach(async () => { while (arrets.length) await arrets.pop()(); });
  const devis = () => ({
    id: 'd1', racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: 'Objet d1', destinataires: ['client@exemple.test'],
    modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30',
    sections: [{ id: 's-d1', titre: '', lignes: [{ id: 'l-d1', libelle: 'Peinture', unite: 'm²', quantite: 10, prixAchat: 8 }] }],
  });
  async function demarrer() {
    const collections = structuredClone(base);
    Object.assign(collections, { devis_articles: [], devis_devis: [devis()], devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration' }] });
    const donnees = creerAccesMemoire(collections);
    const secret = JSON.stringify(Object.entries(JETONS).map(([k, j]) => ({ jeton: `essai-${k}`, acteur: `essai-${k}`, profil: PROFILS[k], empreinte: empreinte(j), actif: true })));
    const g = creerGestionnaire({ magasin: creerMagasin({ lire: async () => secret, dureeCacheMs: 0 }), donnees, limiteur: null, maintenant: () => MAINTENANT.getTime(), journal: () => {} });
    const serveur = createServer((req, res) => {
      const m = [];
      req.on('data', (x) => m.push(x));
      req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } g(req, res); });
    });
    await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
    arrets.push(() => new Promise((fin) => serveur.close(fin)));
    const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
    let n = 0;
    const appeler = async (jeton, nom, args = {}) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }) });
      const corps = await r.json();
      if (corps.error) return { isError: true, texte: corps.error.message };
      const texte = corps.result.content?.[0]?.text ?? '';
      let data; try { data = JSON.parse(texte); } catch { data = undefined; }
      return { isError: !!corps.result.isError, texte, data };
    };
    const article = await appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 50, unite: 'm²', code: 'CAR' });
    assert.equal(article.isError, false, article.texte);
    return { collections, appeler, articleId: article.data.id, doc: () => collections.devis_devis.find((d) => d.id === 'd1'), audit: () => (collections.crm_audit ?? []).length };
  }

  test('6 assistant-devis : `lignes` puis `sections` donnent isError, citent modifier_lignes_devis, laissent le devis inchangé et n\'écrivent aucune ligne de journal', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc());
    const auditAvant = s.audit();
    for (const [champ, valeur] of [['lignes', [{ articleId: s.articleId, quantite: 1 }]], ['sections', [{ titre: 'Neuf', lignes: [{ articleId: s.articleId, quantite: 1 }] }]]]) {
      const r = await s.appeler('assistant', 'modifier_devis_brouillon', { id: 'd1', [champ]: valeur });
      assert.equal(r.isError, true, `${champ} : ${r.texte}`);
      assert.match(r.texte, /modifier_lignes_devis/, champ);
      assert.ok(r.texte.includes(MESSAGE_REFUS_LIGNES), `${champ} : le message complet est rendu`);
      assert.deepEqual(s.doc(), avant, `${champ} : devis inchangé`);
      assert.equal(s.audit(), auditAvant, `${champ} : aucune ligne de journal`);
    }
  });
  test('6 assistant-devis : `lignes: null` est refusé aussi ; un champ inconnu (champ technique d\'un client MCP) PASSE comme sur main, sans être transmis à executer ; objet et ajouterLignes passent', async () => {
    const s = await demarrer();
    const avant = structuredClone(s.doc());
    const nul = await s.appeler('assistant', 'modifier_devis_brouillon', { id: 'd1', lignes: null });
    assert.equal(nul.isError, true, nul.texte);
    assert.match(nul.texte, /modifier_lignes_devis/);
    assert.deepEqual(s.doc(), avant);
    const inconnu = await s.appeler('assistant', 'modifier_devis_brouillon', { id: 'd1', objet: 'Objet vu', toolCallId: 'abc', champInventé: { a: 1 } });
    assert.equal(inconnu.isError, false, inconnu.texte);
    assert.equal(s.doc().objet, 'Objet vu');
    assert.equal('toolCallId' in s.doc() || 'champInventé' in s.doc(), false, 'le champ inconnu n\'est pas écrit');
    const ok = await s.appeler('assistant', 'modifier_devis_brouillon', { id: 'd1', objet: 'Nouvel objet', ajouterLignes: [{ articleId: s.articleId, quantite: 2 }] });
    assert.equal(ok.isError, false, ok.texte);
    assert.equal(s.doc().objet, 'Nouvel objet');
    assert.equal(s.doc().sections.flatMap((x) => x.lignes).length, 2, 'la ligne libre existante est gardée, la nouvelle est ajoutée');
    assert.equal(s.audit() > 0, true);
  });
  test('6 agent-devis et complet : un champ inconnu passe aussi, comme avant', async () => {
    const s = await demarrer();
    for (const jeton of ['agent', 'complet']) assert.equal((await s.appeler(jeton, 'modifier_devis_brouillon', { id: 'd1', objet: `Objet ${jeton}`, champInventé: 1 })).isError, false, jeton);
  });
  test('6 agent-devis et complet : le même appel avec `lignes` passe toujours (il remplace le contenu) ; `sections` aussi', async () => {
    for (const jeton of ['agent', 'complet']) {
      const s = await demarrer();
      const r = await s.appeler(jeton, 'modifier_devis_brouillon', { id: 'd1', lignes: [{ articleId: s.articleId, quantite: 1 }] });
      assert.equal(r.isError, false, `${jeton} lignes : ${r.texte}`);
      assert.equal(s.doc().sections.flatMap((x) => x.lignes).length, 1, jeton);
      const r2 = await s.appeler(jeton, 'modifier_devis_brouillon', { id: 'd1', sections: [{ titre: 'Neuf', lignes: [{ articleId: s.articleId, quantite: 1 }] }] });
      assert.equal(r2.isError, false, `${jeton} sections : ${r2.texte}`);
    }
  });
});

describe('7 poids de tools/list plafonné pour assistant-devis (caractères du JSON ; tokens à 3,5 caractères par token)', () => {
  // Mesuré le 09/11/2026 après l'option A + B : Jérôme 46 543 ; client Devis seul 41 333 ; les 9 outils du bot 20 986. Avant (profil assistant-devis sur main, relevé le 09/11/2026) : 60 815 ; 55 605 ; 30 929. Plafond = mesuré + 10 %.
  const AVANT_JEROME = 60_815;
  const PLAFOND = { jerome: 51_198, client: 45_467, bot: 23_085 };
  const taille = (tools) => JSON.stringify(tools).length;
  const consigne = (nom, n, plafond) => `tools/list de assistant-devis (${nom}) : ${n} caractères (~${Math.round(n / 3.5)} tokens), plafond ${plafond}. Un outil ou un texte ajouté alourdit ce que le bot relit à CHAQUE appel : raccourcis la description dans functions/src/mcp/outils/variantes-assistant-devis.js, ou relève le plafond en le disant dans la PR.`;
  test('7 la liste de Jérôme (24 outils), celle d\'un client Devis seul (21) et les 9 outils du bot restent sous leur plafond', async () => {
    const l = await listes();
    const bot = l.jerome.filter((t) => OUTILS_DU_BOT.includes(t.name));
    assert.equal(bot.length, 9);
    assert.ok(taille(l.jerome) <= PLAFOND.jerome, consigne('Jérôme', taille(l.jerome), PLAFOND.jerome));
    assert.ok(taille(l.client) <= PLAFOND.client, consigne('client Devis seul', taille(l.client), PLAFOND.client));
    assert.ok(taille(bot) <= PLAFOND.bot, consigne('9 outils du bot', taille(bot), PLAFOND.bot));
  });
  test('7 l\'allègement est réel : au moins 20 % de moins que les 60 815 caractères d\'avant (mesure de main)', async () => {
    const l = await listes();
    assert.ok(taille(l.jerome) < 0.8 * AVANT_JEROME);
  });
});

describe('8 les textes de la variante ne citent rien de propre à Jérôme (même expression que D1a de mcp-clients.test.js)', () => {
  const TEXTE_DE_JEROME = /\b(premier_contact|rdv_fixe|proposition_envoyee|gagne|lancement|decouverte|cloture)\b|Accompagnement|jerome\.chevalier|Jérôme|\bAudit\b/;
  test('8 nom, description et schéma de chaque outil servi à assistant-devis', async () => {
    for (const o of OUTILS) {
      const v = varianteDuProfil(o, 'assistant-devis');
      const texte = JSON.stringify([v.nom, v.description, v.schema ? z.toJSONSchema(v.schema instanceof z.ZodType ? v.schema : z.object(v.schema)) : null]);
      assert.doesNotMatch(texte, TEXTE_DE_JEROME, `${o.nom} : ${texte.match(TEXTE_DE_JEROME)?.[0]}`);
    }
  });
});
