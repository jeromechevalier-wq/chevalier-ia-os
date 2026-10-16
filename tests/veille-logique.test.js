// Module Veille : règles d'affichage (logique.js, sans Firebase ni DOM) et cohérence avec le registre, les règles Firestore et la règle de nommage.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../js/modules/veille/logique.js';
import { moduleDeclare, MODULES_DECLARES } from '../js/os/registre.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const t = (iso) => new Date(iso);

describe('veille : types, états, liens', () => {
  test('type : YouTube par défaut (comme le Sheet d\'origine), podcast et newsletter reconnus sans tenir compte de la casse ni des accents', () => {
    assert.equal(L.normaliserType(''), 'YouTube');
    assert.equal(L.normaliserType(undefined), 'YouTube');
    assert.equal(L.normaliserType('inconnu'), 'YouTube');
    assert.equal(L.normaliserType('PODCAST'), 'Podcast');
    assert.equal(L.normaliserType(' newsletter '), 'Newsletter');
  });
  test('état : accepte les mots du Google Sheet (en cours, résumée, échec) et retombe sur « nouveau »', () => {
    assert.equal(L.normaliserEtat('en cours'), 'en_cours');
    assert.equal(L.normaliserEtat('en_cours'), 'en_cours');
    assert.equal(L.normaliserEtat('Résumée'), 'resume');
    assert.equal(L.normaliserEtat('resume'), 'resume');
    assert.equal(L.normaliserEtat('Échec'), 'echec');
    assert.equal(L.normaliserEtat('erreur'), 'echec');
    assert.equal(L.normaliserEtat(''), 'nouveau');
    assert.equal(L.normaliserEtat('autre chose'), 'nouveau');
  });

  test('Résumer : possible sur un contenu nouveau ou en échec seulement, et aucun jeton ni adresse n8n dans la page', () => {
    assert.equal(L.peutResumer('nouveau'), true);
    assert.equal(L.peutResumer('echec'), true);
    assert.equal(L.peutResumer('en_cours'), false);
    assert.equal(L.peutResumer('resume'), false);
    for (const f of ['js/modules/veille/logique.js', 'js/modules/veille/ecran.js', 'js/modules/veille/donnees.js', 'js/modules/veille/lien.js']) {
      assert.doesNotMatch(lire(f), /n8n\.chevalier-ia\.fr|JETON_RESUMER|token=/, f);
    }
  });
  test('boutonsAjout : les boutons dépendent de ce que le lien désigne', () => {
    const vide = L.boutonsAjout(null, '  ');
    assert.deepEqual(vide.boutons, []);
    assert.match(vide.aide, /Coller/);
    assert.deepEqual(L.boutonsAjout(null, 'bonjour').boutons, []);
    assert.match(L.boutonsAjout(null, 'bonjour').aide, /ni un épisode ni une chaîne/);
    assert.deepEqual(L.boutonsAjout({ genre: 'video' }, 'x').boutons.map((b) => b.libelle), ['Ajouter', 'Ajouter et résumer']);
    assert.deepEqual(L.boutonsAjout({ genre: 'video' }, 'x').boutons.map((b) => b.cle), ['ajouter', 'ajouter-resumer']);
    const chaine = L.boutonsAjout({ genre: 'chaine' }, 'x');
    assert.deepEqual(chaine.boutons.map((b) => b.libelle), ['Suivre la chaîne']);
    assert.match(chaine.aide, /5 derniers/);
  });
  test('messageAjout : phrases de confirmation (chaîne, épisode, déjà présent, résumé lancé)', () => {
    assert.equal(L.messageAjout({ genre: 'chaine', sourceNom: 'Veritasium', sourceNouvelle: true, crees: 5 }), 'Chaîne suivie : Veritasium, 5 épisodes ajoutés.');
    assert.equal(L.messageAjout({ genre: 'chaine', sourceNom: 'Veritasium', sourceNouvelle: false, crees: 1 }), 'Chaîne déjà suivie : Veritasium, 1 épisode ajouté.');
    assert.match(L.messageAjout({ genre: 'chaine', sourceNom: 'V', sourceNouvelle: false, crees: 0 }), /aucun nouvel épisode/);
    assert.equal(L.messageAjout({ genre: 'video', crees: 1, titre: 'Mon épisode' }), 'Épisode ajouté : Mon épisode.');
    assert.equal(L.messageAjout({ genre: 'video', crees: 0, titre: 'Mon épisode' }), 'Cet épisode est déjà dans la liste : Mon épisode.');
    assert.equal(L.messageAjout({ genre: 'video', crees: 1, titre: 'T', resume: { message: 'Résumé lancé.' } }), 'Épisode ajouté : T. Résumé lancé.');
  });
  test('pageDuResume : les liens s\'ouvrent dans un nouvel onglet (balise base ajoutée une fois)', () => {
    assert.equal(L.pageDuResume('<html><head><title>x</title></head><body>a</body></html>'), '<html><head><base target="_blank"><title>x</title></head><body>a</body></html>');
    assert.equal(L.pageDuResume('<p>a</p>'), '<base target="_blank"><p>a</p>');
    assert.equal(L.pageDuResume(null), '<base target="_blank">');
  });
  test('un lien n\'est cliquable que s\'il est en http ou https (jamais javascript:)', () => {
    assert.equal(L.lienSur('https://exemple.test/a'), 'https://exemple.test/a');
    assert.equal(L.lienSur('http://exemple.test'), 'http://exemple.test');
    assert.equal(L.lienSur('javascript:alert(1)'), null);
    assert.equal(L.lienSur('data:text/html,x'), null);
    assert.equal(L.lienSur('  '), null);
    assert.equal(L.lienSur(undefined), null);
  });
  test('coût : trois décimales, virgule française, dollar par défaut ; inconnu = null', () => {
    assert.equal(L.coutTexte({ coutReel: 0.002 }), '0,002 $');
    assert.equal(L.coutTexte({ coutReel: 0.018, devise: 'EUR' }), '0,018 €');
    assert.equal(L.coutTexte({}), null);
    assert.equal(L.coutTexte(null), null);
    assert.equal(L.coutTexte({ coutReel: 'x' }), null);
  });
  test('date : sans l\'année si c\'est l\'année en cours', () => {
    const maintenant = t('2026-10-14T10:00:00Z').getTime();
    assert.match(L.dateTexte(t('2026-10-12T08:00:00Z'), maintenant), /^12 oct/);
    assert.match(L.dateTexte(t('2025-03-02T08:00:00Z'), maintenant), /2025$/);
    assert.equal(L.dateTexte(null), null);
  });
});

describe('veille : contenus', () => {
  const contenus = [
    { id: 'a', sourceId: 's1', titre: 'Premier épisode', type: 'Podcast', etat: 'résumée', datePublication: t('2026-10-01T08:00:00Z') },
    { id: 'b', sourceId: 's2', titre: 'Une vidéo sur l\'IA', type: '', etat: 'nouveau', datePublication: t('2026-10-10T08:00:00Z') },
    { id: 'c', sourceId: 's1', titre: 'Épisode échoué', type: 'Podcast', etat: 'échec', etapeEchec: 'Transcription', datePublication: t('2026-10-05T08:00:00Z') },
    { id: 'd', sourceId: 's3', titre: 'Sans date de publication', type: 'Newsletter', etat: 'en cours', detecteLe: t('2026-10-12T08:00:00Z') },
  ];
  test('tri : les plus récents d\'abord (publication, sinon détection)', () => {
    assert.deepEqual(L.filtrer(contenus).map((x) => x.id), ['d', 'b', 'c', 'a']);
  });
  test('filtres : source, type, état et texte (sans accent ni casse)', () => {
    assert.deepEqual(L.filtrer(contenus, { sourceId: 's1' }).map((x) => x.id), ['c', 'a']);
    assert.deepEqual(L.filtrer(contenus, { type: 'YouTube' }).map((x) => x.id), ['b']);
    assert.deepEqual(L.filtrer(contenus, { etat: 'echec' }).map((x) => x.id), ['c']);
    assert.deepEqual(L.filtrer(contenus, { texte: 'EPISODE' }).map((x) => x.id), ['c', 'a']);
    assert.deepEqual(L.filtrer(contenus, { sourceId: 's1', etat: 'resume' }).map((x) => x.id), ['a']);
  });
  test('compteurs par état', () => {
    assert.deepEqual(L.compteurs(contenus), { nouveau: 1, en_cours: 1, resume: 1, echec: 1 });
    assert.deepEqual(L.compteurs([]), { nouveau: 0, en_cours: 0, resume: 0, echec: 0 });
  });
  test('le résumé le plus récent de chaque contenu l\'emporte (un nouvel essai ne perd rien)', () => {
    const resumes = [
      { id: 'r1', contenuId: 'a', creeLe: t('2026-10-02T08:00:00Z'), modele: 'ancien' },
      { id: 'r2', contenuId: 'a', creeLe: t('2026-10-03T08:00:00Z'), modele: 'récent' },
      { id: 'r3', contenuId: 'b', creeLe: t('2026-10-03T09:00:00Z') },
      { id: 'r4', creeLe: t('2026-10-03T09:00:00Z') },
    ];
    const m = L.dernierResumeParContenu(resumes);
    assert.equal(m.size, 2);
    assert.equal(m.get('a').modele, 'récent');
  });
  test('sources : options triées, nom retrouvé, actives d\'abord, nombre de contenus', () => {
    const sources = [{ id: 's2', nom: 'Zèbre', actif: false }, { id: 's1', nom: 'Alpha', actif: true }];
    assert.deepEqual(L.optionsSources(sources, contenus).map((o) => o.id), ['s1', 's3', 's2']); // Alpha, Source (s3 sans nom), Zèbre
    assert.equal(L.nomSource({ sourceId: 's1' }, sources), 'Alpha');
    assert.equal(L.nomSource({ sourceId: 'sx', sourceNom: 'Copie' }, sources), 'Copie');
    assert.equal(L.nomSource({ sourceId: 'sx' }, sources), 'Source inconnue');
    assert.deepEqual(L.trierSources(sources).map((s) => s.id), ['s1', 's2']);
    assert.equal(L.nombreParSource(contenus).get('s1'), 2);
  });
});

describe('veille : cohérence du code', () => {
  test('règle de nommage module_table : les quatre tables déclarées sont veille_sources, veille_contenus, veille_resumes, veille_pages', () => {
    assert.deepEqual(moduleDeclare('veille').collections, ['veille_sources', 'veille_contenus', 'veille_resumes', 'veille_pages']);
    for (const m of MODULES_DECLARES) for (const c of m.collections) if (m.id === 'veille') assert.match(c, /^veille_[a-z]+$/);
  });
  test('l\'écran ne peut rien écrire : aucune fonction d\'écriture Firestore dans le module', () => {
    for (const f of ['donnees', 'ecran', 'index', 'logique']) {
      const c = lire(`js/modules/veille/${f}.js`).replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(c, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/, f);
      assert.doesNotMatch(c, /innerHTML|insertAdjacentHTML|outerHTML/, `${f} : jamais de HTML injecté`);
    }
  });
  test('les tables sont dans la sauvegarde complète du CRM (sinon un export oublierait la veille)', () => {
    const bloc = lire('js/modules/crm/donnees.js').match(/COLLECTIONS_CRM = \[([\s\S]*?)\]/)[1];
    for (const c of moduleDeclare('veille').collections) assert.ok(bloc.includes(`'${c}'`), c);
  });
  test('les règles Firestore de la base 1 couvrent les tables de la veille par le joker (deux comptes autorisés), sans règle à part', () => {
    const r = lire('firestore.rules');
    assert.match(r, /match \/\{collection\}\/\{document=\*\*\}/);
    assert.doesNotMatch(r, /veille_/);
  });
});
