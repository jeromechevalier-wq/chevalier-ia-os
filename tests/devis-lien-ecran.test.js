// lienEcran : l'adresse de l'écran du devis, calculée par le serveur et rendue par les outils Devis du MCP (Jérôme et clients).
// De bout en bout par le protocole MCP, sur des données fictives en mémoire. Le nom d'un test commence par le numéro du critère :
//  1 brouillon créé -> editeur (Jérôme) ; 2 lister_devis / lire_devis (complet et récapitulatif) : editeur pour un brouillon, voir sinon, même expiré ;
//  3 chez un client : plateforme + espace/<client>/ ; 4 finaliser (aperçu puis final) et nouvelle version ; 5 base inconnue ou espace mal formé : champ absent ;
//  6 jamais de jeton, code, e-mail ni « ? » dans un lien ; 7 consigne dans la description des outils, sans mot du verrou, 85 outils ; 8 obtenir_pdf_officiel_devis garde lienApplication.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { GARANTIE_PAS_D_ENVOI } from '../functions/src/mcp/outils/garantie.js';
import { CONSIGNE_LIEN_ECRAN, lienEcranDevis } from '../functions/src/coeur/liens.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';
import { EMETTEUR_ESSAI } from './jeu-finalisation.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const EMAIL = ['client@exemple.test'];
const JEROME = 'https://chevalier-ia-os.web.app';
const PLATEFORME = 'https://chevalier-ia-app.web.app';
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const CHANTIER = { debutTravaux: '2026-11-15', dureeEstimee: { valeur: 3, unite: 'semaine' } };
const devisEnregistre = (id, extra = {}) => ({
  id, racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: `Objet ${id}`, destinataires: EMAIL,
  modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30', chantier: CHANTIER,
  sections: [{ id: `s-${id}`, titre: '', lignes: [{ id: `l-${id}`, libelle: 'Peinture', unite: 'm²', quantite: 10, prixAchat: 8 }] }], ...extra,
});

async function demarrer({ devis = [], client = null, baseLien } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration', entreprise: EMETTEUR_ESSAI }] });
  const rangees = client ? Object.fromEntries(Object.entries(collections).map(([k, v]) => [`clients/${client}/${k}`, v])) : collections;
  const acces = creerAccesMemoire(rangees);
  const donnees = client ? avecBase(acces, `clients/${client}`) : acces;
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire'), entree(JETONS.code, 'claude-code-jerome', 'claude-code')]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const stockage = { existe: async () => true, lienSigne: async (chemin) => `https://stockage.exemple.test/${chemin}` };
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {}, stockage, ...(baseLien !== undefined ? { baseLien } : client ? { baseLien: PLATEFORME } : {}) });
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
  const reponses = [];
  const appeler = async (jeton, nom, args = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    reponses.push({ nom, texte });
    return { isError: !!corps.result.isError, texte, data };
  };
  const doc = (nom, id) => (client ? rangees[`clients/${client}/${nom}`] : collections[nom])?.find((d) => d.id === id);
  return { appeler, doc, reponses };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const creerBrouillon = async (s) => {
  const article = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 50, unite: 'm²', code: 'CAR' }));
  return ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', objet: 'Neuf', destinataires: EMAIL, lignes: [{ articleId: article.id, quantite: 2 }] }));
};

describe('1 un brouillon créé porte son lien (Jérôme)', () => {
  test('1 creer_devis_brouillon rend lienEcran = base de Jérôme + #/devis/editeur/<id>', async () => {
    const s = await demarrer();
    const c = await creerBrouillon(s);
    assert.equal(c.lienEcran, `${JEROME}/#/devis/editeur/${c.id}`);
  });
});

describe('2 lister_devis et lire_devis', () => {
  test('2 editeur pour un brouillon, voir pour tout autre statut (y compris expiré) ; complet et récapitulatif', async () => {
    const passe = { expireLe: '2026-01-01' };
    const s = await demarrer({ devis: [devisEnregistre('b1'), devisEnregistre('f1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001', totaux: { totalHt: 100, ttc: 120, lignes: [], sections: [] } }), devisEnregistre('x1', { statut: 'envoye', numero: 'DEV-2026-10-01-002', ...passe })] });
    const liste = ok(await s.appeler('lecteur', 'lister_devis', {}));
    const parId = Object.fromEntries(liste.devis.map((d) => [d.id, d]));
    assert.equal(parId.b1.lienEcran, `${JEROME}/#/devis/editeur/b1`);
    assert.equal(parId.f1.lienEcran, `${JEROME}/#/devis/voir/f1`);
    assert.equal(parId.x1.statut, 'expire', 'statut affiché calculé');
    assert.equal(parId.x1.lienEcran, `${JEROME}/#/devis/voir/x1`, 'le lien suit le statut stocké');
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'b1' })).lienEcran, `${JEROME}/#/devis/editeur/b1`);
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'b1', format: 'recapitulatif' })).lienEcran, `${JEROME}/#/devis/editeur/b1`);
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'f1' })).lienEcran, `${JEROME}/#/devis/voir/f1`);
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'f1', format: 'recapitulatif' })).lienEcran, `${JEROME}/#/devis/voir/f1`);
  });
  test('2 cas vide : aucun devis, aucune clé lienEcran ; un identifiant inconnu est refusé sans lien', async () => {
    const s = await demarrer();
    const liste = ok(await s.appeler('lecteur', 'lister_devis', {}));
    assert.deepEqual(liste.devis, []);
    const r = await s.appeler('lecteur', 'lire_devis', { id: 'zzz' });
    assert.equal(r.isError, true);
    assert.doesNotMatch(JSON.stringify(s.reponses), /lienEcran/);
  });
});

describe('3 chez un client', () => {
  test('3 le lien porte la plateforme et le préfixe de l’espace', async () => {
    const s = await demarrer({ client: 'demo', devis: [devisEnregistre('f1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001', totaux: { totalHt: 100, ttc: 120, lignes: [], sections: [] } }), devisEnregistre('b1')] });
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'f1' })).lienEcran, `${PLATEFORME}/#/espace/demo/devis/voir/f1`);
    assert.equal(ok(await s.appeler('lecteur', 'lire_devis', { id: 'b1' })).lienEcran, `${PLATEFORME}/#/espace/demo/devis/editeur/b1`);
  });
});

describe('4 finaliser et nouvelle version', () => {
  test('4 l’aperçu pointe vers editeur, la finalisation vers voir, la nouvelle version vers le NOUVEAU brouillon', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1')] });
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1' }));
    assert.equal(apercu.lienEcran, `${JEROME}/#/devis/editeur/b1`);
    const f = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1', codeConfirmation: apercu.code }));
    assert.equal(f.lienEcran, `${JEROME}/#/devis/voir/b1`);
    const v = ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'b1' }));
    assert.notEqual(v.id, 'b1');
    assert.equal(v.lienEcran, `${JEROME}/#/devis/editeur/${v.id}`);
  });
});

describe('5 base inconnue ou espace mal formé', () => {
  test('5 sans base (baseLien vide), aucune réponse ne porte lienEcran et rien ne plante', async () => {
    const s = await demarrer({ baseLien: '', devis: [devisEnregistre('b1')] });
    ok(await s.appeler('lecteur', 'lister_devis', {}));
    ok(await s.appeler('lecteur', 'lire_devis', { id: 'b1' }));
    const c = await creerBrouillon(s);
    assert.equal(c.lienEcran, undefined);
    assert.doesNotMatch(JSON.stringify(s.reponses), /lienEcran/);
  });
  test('5 lienEcranDevis : base non https, espace mal formé, devis sans id = undefined ; identifiant spécial encodé', () => {
    assert.equal(lienEcranDevis({ baseLien: '', espace: '' }, { id: 'a' }), undefined);
    assert.equal(lienEcranDevis({ baseLien: 'http://exemple.test', espace: '' }, { id: 'a' }), undefined);
    assert.equal(lienEcranDevis({ baseLien: PLATEFORME, espace: 'Mauvais/../x' }, { id: 'a' }), undefined);
    assert.equal(lienEcranDevis({ baseLien: PLATEFORME, espace: 'demo' }, {}), undefined);
    assert.equal(lienEcranDevis({ baseLien: `${PLATEFORME}/`, espace: 'interne' }, { id: 'a b/c', statut: 'accepte' }), `${PLATEFORME}/#/devis/voir/a%20b%2Fc`);
  });
});

describe('6 aucun secret dans un lien', () => {
  test('6 parcours créer, modifier, finaliser, PDF, nouvelle version : ni jeton, ni code, ni e-mail, ni « ? »', async () => {
    const s = await demarrer();
    const c = await creerBrouillon(s);
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: c.id, objet: 'Autre', chantier: CHANTIER }));
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: c.id }));
    ok(await s.appeler('code', 'finaliser_devis', { id: c.id, codeConfirmation: apercu.code }));
    Object.assign(s.doc('devis_devis', c.id), { pdf: { statut: 'ok', chemin: `devis/a1/${c.id}/x.pdf`, nom: 'x.pdf', sha256: 'a'.repeat(64), tentatives: 1 } });
    ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: c.id }));
    ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: c.id }));
    const liens = s.reponses.flatMap((r) => [...r.texte.matchAll(/"lienEcran":\s*"([^"]*)"/g)].map((m) => m[1]));
    assert.ok(liens.length >= 5, `liens trouvés : ${liens.length}`);
    for (const l of liens) {
      assert.match(l, /^https:\/\/[^/?\s]+\/#\/devis\/(editeur|voir)\/[A-Za-z0-9%_-]+$/);
      assert.doesNotMatch(l, /cia_|@|\?/);
      assert.ok(!l.includes(apercu.code), 'le code de confirmation n’est jamais dans un lien');
    }
  });
});

describe('7 consigne dans les descriptions', () => {
  const AVEC_LIEN = ['creer_devis_brouillon', 'modifier_devis_brouillon', 'modifier_lignes_devis', 'creer_devis_depuis_modele', 'annuler_derniere_modification_devis', 'finaliser_devis', 'nouvelle_version_devis', 'archiver_devis', 'enregistrer_envoi_devis', 'modifier_destinataires_devis', 'changer_statut_devis', 'lister_devis', 'lire_devis', 'obtenir_pdf_officiel_devis'];
  test('7 chaque outil qui rend lienEcran porte la consigne ; elle n’a aucun mot réservé ni nom de domaine ; 85 outils', () => {
    for (const nom of AVEC_LIEN) assert.ok(OUTILS.find((o) => o.nom === nom)?.description.includes(CONSIGNE_LIEN_ECRAN), nom);
    assert.deepEqual(OUTILS.filter((o) => o.description.includes(CONSIGNE_LIEN_ECRAN)).map((o) => o.nom).sort(), [...AVEC_LIEN].sort(), 'seuls ces outils portent la consigne');
    for (const o of OUTILS.filter((x) => x.description.includes(GARANTIE_PAS_D_ENVOI))) assert.ok(o.description.endsWith(GARANTIE_PAS_D_ENVOI), `${o.nom} : la règle d’envoi reste en dernière position`);
    assert.doesNotMatch(CONSIGNE_LIEN_ECRAN, /Jérôme|Audit|Accompagnement|lancement|decouverte|cloture|gagne|premier_contact|rdv_fixe|proposition_envoyee|jerome\.chevalier|\.web\.app|https?:/i);
    assert.equal(OUTILS.length, 85);
  });
});

describe('3 refus', () => {
  test('3 un refus d’écriture ne porte jamais lienEcran (devis finalisé, mauvais code)', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1')] });
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1' }));
    const faux = await s.appeler('code', 'finaliser_devis', { id: 'b1', codeConfirmation: 'FAUX-CODE' });
    assert.equal(faux.isError, true);
    const apercu2 = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1' })); // un code faux consomme l'aperçu : en demander un autre
    assert.ok(apercu.code && apercu2.code);
    ok(await s.appeler('code', 'finaliser_devis', { id: 'b1', codeConfirmation: apercu2.code }));
    const refus = await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'b1', objet: 'Autre' });
    assert.equal(refus.isError, true);
    assert.doesNotMatch(faux.texte, /lienEcran/);
    assert.doesNotMatch(refus.texte, /lienEcran/);
  });
});

describe('8 obtenir_pdf_officiel_devis', () => {
  test('8 garde lienApplication et rend lienEcran de même valeur', async () => {
    const s = await demarrer({ devis: [devisEnregistre('f1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001', totaux: { totalHt: 100, ttc: 120, lignes: [], sections: [] }, pdf: { statut: 'ok', chemin: 'devis/a1/f1/x.pdf', nom: 'x.pdf', sha256: 'a'.repeat(64), tentatives: 1 } })] });
    const r = ok(await s.appeler('lecteur', 'obtenir_pdf_officiel_devis', { id: 'f1' }));
    assert.equal(r.lienApplication, `${JEROME}/#/devis/voir/f1`);
    assert.equal(r.lienEcran, r.lienApplication);
  });
});
