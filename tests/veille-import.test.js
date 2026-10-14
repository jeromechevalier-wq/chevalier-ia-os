// Import du Google Sheet vers les tables de la veille : la transformation (scripts/veille/transformer.js), sans réseau ni Firebase.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformer, idContenu, idSource, dateDuSheet, lignesEnObjets, slug } from '../scripts/veille/transformer.js';

const SOURCES = [
  ['nom', 'url_chaine', 'actif', 'type', 'page', 'identifiant_chaine_youtube', 'flux_rss', 'note'],
  ['IA Strategy', 'UC2U', 'oui', 'YouTube', 'https://www.youtube.com/@x', 'UC2U', 'https://flux/yt', 'Chaîne « IA et Stratégie »'],
  ['diary of ceo', 'UCGq', 'non', 'YouTube', 'https://www.youtube.com/channel/UCGq', 'UCGq', '', ''],
  ['Ethan Mollick - One Useful Thing', 'https://www.oneusefulthing.org/feed', 'oui', 'Newsletter', 'https://www.oneusefulthing.org', '', 'https://www.oneusefulthing.org/feed', ''],
];
const VIDEOS = [
  ['video_id', 'chaine', 'titre', 'date_publication', 'url_video', 'statut', 'etape_echec', 'traite_le', 'lien_resume_html', 'lien_resume_court', 'lien_transcript', 'type', 'url_audio', 'flux_rss', 'ajoutee_le'],
  ['v1', 'IA et Stratégie', 'Vidéo résumée', '2026-10-05T15:30:28+00:00', 'https://www.youtube.com/watch?v=v1', 'résumée', '', '2026-10-12', 'https://d/h', 'https://d/c', 'https://d/t'],
  ['v2', 'The Diary Of A CEO', 'Vidéo à choisir', '2026-10-08T07:00:35+00:00', 'https://www.youtube.com/watch?v=v2', 'à choisir'],
  ['https://www.oneusefulthing.org/p/the-overhang', 'Ethan Mollick - One Useful Thing', 'The Overhang', '2026-09-18T17:54:32.000Z', 'https://www.oneusefulthing.org/p/the-overhang', 'résumée', '', '2026-10-13', 'https://d/h2', 'https://d/c2', 'https://d/t2', 'Newsletter', '', 'https://flux', '2026-10-13'],
  ['v4', 'Chaîne inconnue', 'Sans source', '', '', 'échec', 'Transcription'],
];

describe('veille : import du Sheet', () => {
  const r = transformer(SOURCES, VIDEOS);
  test('sources : identifiant de chaîne YouTube sinon nom sans accent ; actif oui/non ; champs vides non écrits', () => {
    assert.deepEqual(r.sources.map((s) => s.id), ['UC2U', 'UCGq', 'ethan-mollick-one-useful-thing']);
    assert.equal(r.sources[0].data.actif, true);
    assert.equal(r.sources[1].data.actif, false);
    assert.ok(!('fluxRss' in r.sources[1].data) && !('note' in r.sources[1].data));
    assert.equal(r.sources[2].data.type, 'Newsletter');
  });
  test('contenus : le nom de chaîne du Sheet est relié à la bonne source (IA et Stratégie -> IA Strategy)', () => {
    const [v1, v2, v3, v4] = r.contenus;
    assert.equal(v1.data.sourceId, 'UC2U');
    assert.equal(v2.data.sourceId, 'UCGq');
    assert.equal(v3.id, 'the-overhang');
    assert.equal(v3.data.idOrigine, 'https://www.oneusefulthing.org/p/the-overhang');
    assert.equal(v4.data.sourceId, undefined);
    assert.equal(v4.data.sourceNom, 'Chaîne inconnue');
    assert.equal(r.avertissements.length, 1);
  });
  test('états et types : « résumée » -> resume, « à choisir » -> nouveau, « échec » -> echec ; type vide = celui de la source', () => {
    assert.deepEqual(r.contenus.map((c) => c.data.etat), ['resume', 'nouveau', 'resume', 'echec']);
    assert.equal(r.contenus[0].data.type, 'YouTube');
    assert.equal(r.contenus[2].data.type, 'Newsletter');
    assert.equal(r.contenus[3].data.etapeEchec, 'Transcription');
  });
  test('résumés : un seul par contenu résumé, liens repris, rien d\'inventé (ni modèle ni coût), payeur posé', () => {
    assert.deepEqual(r.resumes.map((x) => x.id), ['r-v1', 'r-the-overhang']);
    const x = r.resumes[0].data;
    assert.deepEqual([x.contenuId, x.lienHtml, x.lienCourt, x.lienTranscript, x.payeur], ['v1', 'https://d/h', 'https://d/c', 'https://d/t', 'jerome']);
    assert.ok(!('modele' in x) && !('coutReel' in x) && !('cleIa' in x));
  });
  test('dates : jour seul = midi UTC, texte illisible = absent', () => {
    assert.equal(dateDuSheet('2026-10-12').toISOString(), '2026-10-12T12:00:00.000Z');
    assert.equal(dateDuSheet('2026-10-07T16:00:24+00:00').toISOString(), '2026-10-07T16:00:24.000Z');
    assert.equal(dateDuSheet('pas une date'), null);
    assert.equal(dateDuSheet(''), null);
    assert.ok(!('datePublication' in r.contenus[3].data));
  });
  test('identifiants : jamais de « / » ; un doublon est ignoré avec un avertissement', () => {
    assert.equal(idContenu('a/b'), 'a_b');
    assert.equal(idContenu('https://x.test/p/Mon-Article/?a=1'), 'mon-article');
    const doublon = transformer(SOURCES, [VIDEOS[0], VIDEOS[2], VIDEOS[2]]);
    assert.equal(doublon.contenus.length, 1);
    assert.match(doublon.avertissements[0], /double/);
    assert.equal(slug('Les PME et l\'IA'), 'les-pme-et-l-ia');
    assert.equal(idSource({ nom: 'Le Plateau', identifiant_chaine_youtube: '' }), 'le-plateau');
    assert.equal(lignesEnObjets([['a', 'b'], ['1'], ['', '']]).length, 1);
  });
  test('le script ne touche qu\'aux trois tables veille_* et refuse tout autre projet que le CRM ou l\'émulateur', () => {
    const s = readFileSync(fileURLToPath(new URL('../scripts/veille/importer-sheet.js', import.meta.url)), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.deepEqual([...s.matchAll(/\['(veille_[a-z]+)'/g)].map((m) => m[1]), ['veille_sources', 'veille_contenus', 'veille_resumes']);
    assert.doesNotMatch(s, /\.delete\(|batch\.delete|recursiveDelete|\.update\(/);
    assert.match(s, /const projetId = enEmulateur \? PROJET_ESSAI : PROJET_CRM/);
  });
});
