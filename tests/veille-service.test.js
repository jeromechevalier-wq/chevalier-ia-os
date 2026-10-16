// Module Veille, côté serveur : ajout d'un lien collé (épisode ou chaîne) et lancement d'un résumé (functions/src/veille/), sans réseau ni Firebase :
// la base, YouTube et n8n sont simulés. Les tables sont celles de la porte (veille_sources, veille_contenus).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { creerServiceVeille, ErreurVeille, ADRESSE_RESUMER } from '../functions/src/veille/service.js';
import { creerAppelVeille } from '../functions/src/veille/appel.js';

const ID = 'dQw4w9WgXcQ';
const UC = 'UCHnyfMqiRRG1u-2MsSQLbXA';
const JETON = 'jeton-secret-de-test';

function baseEnMemoire() {
  const docs = new Map();
  return {
    docs,
    async lireDoc(c) { return docs.has(c) ? { ...docs.get(c), id: c.split('/').at(-1) } : null; },
    async creerSiAbsent(c, d) { if (docs.has(c)) return false; docs.set(c, d); return true; },
    async majDoc(c, p) { if (!docs.has(c)) return false; docs.set(c, { ...docs.get(c), ...p }); return true; },
  };
}

const reponse = (corps, statut = 200) => ({ ok: statut >= 200 && statut < 300, status: statut, text: async () => corps });
const flux = `<feed xmlns:yt="y"><yt:channelId>${UC.slice(2)}</yt:channelId><title>Veritasium</title>${Array.from({ length: 7 }, (_, i) =>
  `<entry><yt:videoId>video${String(i).padStart(6, '0')}</yt:videoId><title>Épisode ${i}</title><published>2026-10-${10 + i}T08:00:00+00:00</published></entry>`).join('')}</feed>`;

function monde({ n8n = 'Résumé lancé', statutN8n = 200, jeton = JETON } = {}) {
  const base = baseEnMemoire();
  const appels = [];
  const fetchImpl = async (url) => {
    appels.push(String(url));
    const u = String(url);
    if (u.startsWith('https://www.youtube.com/oembed')) return u.includes('introuvable') ? reponse('Not Found', 404) : reponse(JSON.stringify({ title: 'Never Gonna Give You Up', author_name: 'Rick' }));
    if (u.startsWith('https://www.youtube.com/@veritasium')) return reponse(`<html>..."externalId":"${UC}"...</html>`);
    if (u.startsWith('https://www.youtube.com/@inconnue')) return reponse('<html>rien</html>');
    if (u.startsWith('https://www.youtube.com/feeds/videos.xml')) return reponse(flux);
    if (u.startsWith(ADRESSE_RESUMER)) return statutN8n === 200 ? reponse(`<h2>${n8n}</h2>`) : reponse('x', statutN8n);
    throw new Error(`appel inattendu : ${u}`);
  };
  const service = creerServiceVeille({ donnees: base, fetchImpl, maintenant: () => Date.UTC(2026, 9, 15, 12), lireJeton: async () => jeton });
  return { base, appels, service };
}

describe('ajouterLien : un épisode', () => {
  test('crée le contenu « nouveau » dans la source « Ajouts manuels » (créée au besoin), avec le titre lu chez YouTube', async () => {
    const m = monde();
    const r = await m.service.ajouterLien({ url: `https://youtu.be/${ID}?si=x`, auteur: 'jerome.chevalier@gmail.com' });
    assert.deepEqual(r, { genre: 'video', ids: [ID], crees: 1, existants: 0, titre: 'Never Gonna Give You Up', sourceNom: 'Ajouts manuels' });
    const c = m.base.docs.get(`veille_contenus/${ID}`);
    assert.equal(c.etat, 'nouveau');
    assert.equal(c.titre, 'Never Gonna Give You Up');
    assert.equal(c.url, `https://www.youtube.com/watch?v=${ID}`);
    assert.equal(c.sourceId, 'ajouts-manuels');
    assert.equal(c.type, 'YouTube');
    assert.equal(c.origine, 'appli');
    assert.equal(c.ecritPar, 'jerome.chevalier@gmail.com');
    const s = m.base.docs.get('veille_sources/ajouts-manuels');
    assert.equal(s.actif, true);
    assert.equal('identifiantYoutube' in s, false, 'la collecte du lundi ignore cette source (pas d\'identifiant de chaîne)');
  });
  test('un épisode déjà présent n\'est ni recréé ni redemandé à YouTube', async () => {
    const m = monde();
    await m.service.ajouterLien({ url: `https://youtu.be/${ID}`, auteur: 'a' });
    const avant = m.appels.length;
    const r = await m.service.ajouterLien({ url: `https://www.youtube.com/watch?v=${ID}`, auteur: 'a' });
    assert.equal(r.crees, 0);
    assert.equal(r.existants, 1);
    assert.equal(m.appels.length, avant, 'aucun appel réseau de plus');
  });
  test('épisode introuvable : erreur claire, rien n\'est écrit', async () => {
    const m = monde();
    await assert.rejects(() => m.service.ajouterLien({ url: 'https://youtu.be/introuvable', auteur: 'a' }), (e) => e instanceof ErreurVeille && e.code === 'introuvable');
    assert.equal(m.base.docs.size, 0);
  });
  test('« Ajouter et résumer » : lance le résumé après l\'ajout, avec le jeton côté serveur', async () => {
    const m = monde();
    const r = await m.service.ajouterLien({ url: `https://youtu.be/${ID}`, lancerResume: true, auteur: 'a' });
    assert.equal(r.resume.lance, true);
    const appel = m.appels.find((u) => u.startsWith(ADRESSE_RESUMER));
    assert.equal(appel, `${ADRESSE_RESUMER}?video_id=${ID}&token=${JETON}`);
  });
  test('« Ajouter et résumer » : si le résumé ne peut pas partir, l\'épisode reste ajouté et le message le dit', async () => {
    const m = monde({ statutN8n: 403 });
    const r = await m.service.ajouterLien({ url: `https://youtu.be/${ID}`, lancerResume: true, auteur: 'a' });
    assert.equal(r.crees, 1);
    assert.equal(r.resume.lance, false);
    assert.match(r.resume.message, /jeton/);
    assert.equal(m.base.docs.get(`veille_contenus/${ID}`).etat, 'nouveau');
  });
});

describe('ajouterLien : une chaîne', () => {
  test('retrouve l\'identifiant, suit la chaîne (source active) et ajoute ses 5 derniers épisodes, sans lancer de résumé', async () => {
    const m = monde();
    const r = await m.service.ajouterLien({ url: 'https://www.youtube.com/@veritasium', lancerResume: true, auteur: 'a' });
    assert.equal(r.genre, 'chaine');
    assert.equal(r.crees, 5);
    assert.equal(r.sourceNom, 'Veritasium');
    assert.equal(r.sourceNouvelle, true);
    assert.equal('resume' in r, false, 'jamais de résumé d\'office pour une chaîne');
    const s = m.base.docs.get(`veille_sources/${UC}`);
    assert.equal(s.actif, true);
    assert.equal(s.identifiantYoutube, UC);
    assert.equal(s.fluxRss, `https://www.youtube.com/feeds/videos.xml?channel_id=${UC}`);
    assert.equal(s.nom, 'Veritasium');
    const contenus = [...m.base.docs.keys()].filter((k) => k.startsWith('veille_contenus/'));
    assert.equal(contenus.length, 5);
    const c = m.base.docs.get('veille_contenus/video000000');
    assert.deepEqual([c.etat, c.sourceId, c.sourceNom, c.titre], ['nouveau', UC, 'Veritasium', 'Épisode 0']);
    assert.ok(c.datePublication instanceof Date);
    assert.equal(m.appels.some((u) => u.startsWith(ADRESSE_RESUMER)), false);
  });
  test('relancer l\'ajout ne crée aucun doublon', async () => {
    const m = monde();
    await m.service.ajouterLien({ url: `https://www.youtube.com/channel/${UC}`, auteur: 'a' });
    const r = await m.service.ajouterLien({ url: `https://www.youtube.com/channel/${UC}`, auteur: 'a' });
    assert.deepEqual([r.crees, r.existants, r.sourceNouvelle], [0, 5, false]);
    assert.equal(m.appels.filter((u) => u.includes('/@')).length, 0, 'identifiant donné dans le lien : la page de la chaîne n\'est pas lue');
  });
  test('chaîne introuvable : erreur claire', async () => {
    const m = monde();
    await assert.rejects(() => m.service.ajouterLien({ url: 'https://www.youtube.com/@inconnue', auteur: 'a' }), (e) => e.code === 'chaine_introuvable');
    assert.equal(m.base.docs.size, 0);
  });
});

describe('ajouterLien : liens refusés', () => {
  test('autre site, texte, liste de lecture : rien n\'est lu ni écrit', async () => {
    const m = monde();
    for (const url of ['https://exemple.fr/x', 'bonjour', 'https://www.youtube.com/playlist?list=PL1', '']) {
      await assert.rejects(() => m.service.ajouterLien({ url, auteur: 'a' }), (e) => e.code === 'lien_non_reconnu', url);
    }
    assert.deepEqual([m.appels.length, m.base.docs.size], [0, 0]);
  });
});

describe('resumer', () => {
  const avecContenu = (etat) => { const m = monde(); m.base.docs.set('veille_contenus/c1', { etat, titre: 'T' }); return m; };
  test('contenu nouveau : lance le workflow avec le jeton, contenu en échec : aussi (réessayer)', async () => {
    for (const etat of ['nouveau', 'echec']) {
      const m = avecContenu(etat);
      assert.deepEqual(await m.service.resumer({ contenuId: 'c1' }), { lance: true, message: 'Résumé lancé. Il apparaît ici dans quelques minutes.' });
      assert.equal(m.appels.at(-1), `${ADRESSE_RESUMER}?video_id=c1&token=${JETON}`);
    }
  });
  test('déjà en cours ou déjà résumé : rien n\'est lancé, sans appeler n8n', async () => {
    for (const [etat, raison] of [['en_cours', 'deja_en_cours'], ['resume', 'deja_resume']]) {
      const m = avecContenu(etat);
      const r = await m.service.resumer({ contenuId: 'c1' });
      assert.deepEqual([r.lance, r.raison], [false, raison]);
      assert.equal(m.appels.length, 0);
    }
  });
  test('réponses de n8n : « rien à lancer », jeton refusé (403), panne (500), contenu inconnu, identifiant invalide, jeton absent', async () => {
    const rien = avecContenu('nouveau'); const m1 = monde({ n8n: 'Rien à lancer' }); m1.base.docs.set('veille_contenus/c1', { etat: 'nouveau' });
    assert.equal((await m1.service.resumer({ contenuId: 'c1' })).raison, 'rien_a_lancer');
    void rien;
    const m2 = monde({ statutN8n: 403 }); m2.base.docs.set('veille_contenus/c1', { etat: 'nouveau' });
    await assert.rejects(() => m2.service.resumer({ contenuId: 'c1' }), (e) => e.code === 'jeton_refuse');
    const m3 = monde({ statutN8n: 500 }); m3.base.docs.set('veille_contenus/c1', { etat: 'nouveau' });
    await assert.rejects(() => m3.service.resumer({ contenuId: 'c1' }), (e) => e.code === 'n8n_erreur');
    await assert.rejects(() => monde().service.resumer({ contenuId: 'inconnu' }), (e) => e.code === 'contenu_inconnu');
    for (const mauvais of ['a/b', '', 'x'.repeat(101), null, 5]) await assert.rejects(() => monde().service.resumer({ contenuId: mauvais }), (e) => e.code === 'requete_invalide');
    const m4 = monde({ jeton: '  ' }); m4.base.docs.set('veille_contenus/c1', { etat: 'nouveau' });
    await assert.rejects(() => m4.service.resumer({ contenuId: 'c1' }), (e) => e.code === 'jeton_absent');
    assert.equal(m4.appels.length, 0);
  });
});

describe('appel (fonction appelable)', () => {
  const requete = (data, auth) => ({ data, auth });
  const bon = { token: { email: 'jerome.chevalier@gmail.com', email_verified: true } };
  const appel = (m) => creerAppelVeille({ service: m.service });
  test('refuse sans connexion, avec un compte non vérifié ou étranger', async () => {
    const m = monde();
    for (const [auth, code] of [[undefined, 'unauthenticated'], [{ token: { email: 'jerome.chevalier@gmail.com', email_verified: false } }, 'permission-denied'], [{ token: { email: 'autre@exemple.fr', email_verified: true } }, 'permission-denied']]) {
      await assert.rejects(() => appel(m)(requete({ action: 'ajouterLien', url: `https://youtu.be/${ID}` }, auth)), (e) => e.code === code);
    }
    assert.equal(m.base.docs.size, 0);
  });
  test('refuse une demande mal formée ; accepte la bonne ; traduit les refus du service en messages lisibles', async () => {
    const m = monde();
    for (const data of [null, 'x', [], {}, { action: 'supprimer' }]) await assert.rejects(() => appel(m)(requete(data, bon)), (e) => e.code === 'invalid-argument');
    const r = await appel(m)(requete({ action: 'ajouterLien', url: `https://youtu.be/${ID}`, lancerResume: true }, bon));
    assert.equal(r.crees, 1);
    assert.equal(m.base.docs.get(`veille_contenus/${ID}`).ecritPar, 'jerome.chevalier@gmail.com');
    await assert.rejects(() => appel(m)(requete({ action: 'ajouterLien', url: 'bonjour' }, bon)), (e) => e.code === 'failed-precondition' && /ni un épisode ni une chaîne/.test(e.message));
    await assert.rejects(() => appel(m)(requete({ action: 'ajouterLien', url: 12 }, bon)), (e) => e.code === 'failed-precondition');
    await assert.rejects(() => appel(m)(requete({ action: 'resumer', contenuId: 'inconnu' }, bon)), (e) => e.code === 'failed-precondition' && /n'existe pas/.test(e.message));
  });
  test('une erreur imprévue ne montre aucun détail', async () => {
    const service = { ajouterLien: async () => { throw new Error('secret interne'); } };
    await assert.rejects(() => creerAppelVeille({ service })(requete({ action: 'ajouterLien', url: 'x' }, bon)), (e) => e.code === 'internal' && !/secret/.test(e.message));
  });
});

describe('sécurité du code', () => {
  test('le jeton n\'est écrit nulle part dans le dépôt de l\'appli (ni page, ni service) et le secret est déclaré dans la fonction', () => {
    const idx = readFileSync(new URL('../functions/src/index.js', import.meta.url), 'utf8');
    assert.match(idx, /defineSecret\('VEILLE_JETON_RESUMER'\)/);
    assert.match(idx, /export const veille = onCall/);
    for (const f of ['../functions/src/veille/service.js', '../functions/src/veille/appel.js', '../functions/src/index.js']) {
      assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /27a9434ae485af417e6f5769cbe73ce56add5ada/, f);
    }
  });
});
