// Module Veille : reconnaissance d'un lien YouTube collé à la main (épisode ou chaîne) et lecture du flux d'une chaîne (js/modules/veille/lien.js, sans réseau).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { analyserLien, idChaineDansPage, lireFluxChaine, NB_EPISODES_CHAINE } from '../js/modules/veille/lien.js';

const ID = 'dQw4w9WgXcQ';
const UC = 'UCHnyfMqiRRG1u-2MsSQLbXA';

describe('analyserLien', () => {
  test('un épisode, sous toutes ses formes d\'adresse', () => {
    for (const u of [`https://www.youtube.com/watch?v=${ID}`, `https://youtube.com/watch?v=${ID}&t=42s&list=PLx`, `https://m.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}`, `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/live/${ID}?feature=share`, `https://www.youtube.com/embed/${ID}`, `www.youtube.com/watch?v=${ID}`, `  https://youtu.be/${ID}  `]) {
      assert.deepEqual(analyserLien(u), { genre: 'video', id: ID, url: `https://www.youtube.com/watch?v=${ID}` }, u);
    }
  });
  test('une chaîne : identifiant direct, @nom, /c/ et /user/', () => {
    assert.deepEqual(analyserLien(`https://www.youtube.com/channel/${UC}`), { genre: 'chaine', idChaine: UC, page: `https://www.youtube.com/channel/${UC}`, url: `https://www.youtube.com/channel/${UC}` });
    const a = analyserLien('https://www.youtube.com/@veritasium/videos');
    assert.deepEqual(a, { genre: 'chaine', idChaine: null, page: 'https://www.youtube.com/@veritasium', url: 'https://www.youtube.com/@veritasium' });
    assert.equal(analyserLien('youtube.com/@IA.et-Stratégie').page, 'https://www.youtube.com/@IA.et-Strat%C3%A9gie');
    assert.equal(analyserLien('https://www.youtube.com/c/Nom_Simple').page, 'https://www.youtube.com/c/Nom_Simple');
    assert.equal(analyserLien('https://www.youtube.com/user/ancien').page, 'https://www.youtube.com/user/ancien');
  });
  test('tout le reste est refusé (autre site, texte, liste de lecture seule, faux hôte, mauvais identifiant, protocole dangereux)', () => {
    for (const u of ['', '   ', null, undefined, 'bonjour', 'https://exemple.fr/watch?v=' + ID, `https://youtube.com.evil.fr/watch?v=${ID}`, `https://evilyoutube.com/watch?v=${ID}`,
      'https://www.youtube.com/playlist?list=PLabc', 'https://www.youtube.com/watch?v=trop-court', 'https://www.youtube.com/watch', 'https://youtu.be/', 'https://www.youtube.com/', 'https://www.youtube.com/channel/UCtropcourt',
      'https://www.youtube.com/@', 'https://www.youtube.com/@a b', `javascript:alert('${ID}')`, `ftp://youtube.com/watch?v=${ID}`, 'https://www.youtube.com/c/', 'deux mots https://youtu.be/' + ID]) {
      assert.equal(analyserLien(u), null, String(u));
    }
  });
});

describe('idChaineDansPage', () => {
  test('retrouve l\'identifiant dans les formes connues de la page', () => {
    assert.equal(idChaineDansPage(`<link rel="canonical" href="https://www.youtube.com/channel/${UC}">`), UC);
    assert.equal(idChaineDansPage(`<meta itemprop="identifier" content="${UC}">`), UC);
    assert.equal(idChaineDansPage(`..."externalId":"${UC}","x":1`), UC);
    assert.equal(idChaineDansPage(`..."channelId":"${UC}"`), UC);
    assert.equal(idChaineDansPage('<html>rien</html>'), null);
    assert.equal(idChaineDansPage(null), null);
  });
});

const flux = (n) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <yt:channelId>${UC.slice(2)}</yt:channelId>
 <title>Veritasium &amp; Cie</title>
 <entry><id>yt:video:x</id><yt:videoId>BAD</yt:videoId><title>Identifiant invalide</title></entry>
${Array.from({ length: n }, (_, i) => ` <entry>
  <id>yt:video:v${i}</id>
  <yt:videoId>video${String(i).padStart(6, '0')}</yt:videoId>
  <title>Épisode ${i} &lt;3 &#39;test&#39;</title>
  <published>2026-10-${String(15 - i).padStart(2, '0')}T08:00:00+00:00</published>
 </entry>`).join('\n')}
</feed>`;

describe('lireFluxChaine', () => {
  test('nom, identifiant complet (UC rajouté), 5 épisodes au plus, les plus récents d\'abord, entités décodées, entrée invalide ignorée', () => {
    const r = lireFluxChaine(flux(8));
    assert.equal(NB_EPISODES_CHAINE, 5);
    assert.equal(r.idChaine, UC);
    assert.equal(r.nom, 'Veritasium & Cie');
    assert.equal(r.videos.length, 5);
    assert.deepEqual(r.videos[0], { id: 'video000000', titre: "Épisode 0 <3 'test'", url: 'https://www.youtube.com/watch?v=video000000', datePublication: new Date('2026-10-15T08:00:00Z') });
    assert.deepEqual(r.videos.map((v) => v.id), ['video000000', 'video000001', 'video000002', 'video000003', 'video000004']);
    assert.equal(lireFluxChaine(flux(2)).videos.length, 2);
    assert.equal(lireFluxChaine(flux(8), 3).videos.length, 3);
  });
  test('flux vide ou illisible : aucune vidéo, pas d\'erreur', () => {
    assert.deepEqual(lireFluxChaine(''), { idChaine: null, nom: '', videos: [] });
    assert.deepEqual(lireFluxChaine('<html>pas un flux</html>').videos, []);
    assert.deepEqual(lireFluxChaine(null).videos, []);
  });
});
