// Fiche de marque : logique pure (js/os/marque.js) et contrôles statiques de la page d'un client (chantier 5).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  identifiantClientDepuisRoute, estRouteEspace, normaliserCouleur, contraste, luminance, texteSur, couleurLisibleSur,
  urlImageValide, normaliserMarque, styleMarque, MARQUE_NEUTRE, MESSAGE_REFUS_ESPACE,
} from '../js/os/marque.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\/.*$/gm, '');

describe('marque : identifiant du client dans la route', () => {
  test('espace/<client> -> identifiant en minuscules', () => {
    assert.equal(identifiantClientDepuisRoute('espace/dupont'), 'dupont');
    assert.equal(identifiantClientDepuisRoute('espace/Dupont-2_b'), 'dupont-2_b');
    assert.equal(identifiantClientDepuisRoute('/espace/acme/'), 'acme');
  });
  test('routes douteuses ou autres pages -> null', () => {
    for (const r of ['', 'espace', 'espace/', 'crm/accueil', 'espace/a/b', 'espace/../crm', 'espace/a b', 'espace/-x', 'espace/é', 'espace/' + 'a'.repeat(41), null, undefined, 'espace/a%2Fb']) {
      assert.equal(identifiantClientDepuisRoute(r), null, String(r));
    }
  });
  test('estRouteEspace distingue la plateforme du CRM', () => {
    assert.equal(estRouteEspace('espace/dupont'), true);
    assert.equal(estRouteEspace('espace'), true);
    assert.equal(estRouteEspace('crm/accueil'), false);
    assert.equal(estRouteEspace(''), false);
  });
});

describe('marque : couleurs et contraste', () => {
  test('seules #rgb et #rrggbb passent (normalisées en #rrggbb)', () => {
    assert.equal(normaliserCouleur('#ABC'), '#aabbcc');
    assert.equal(normaliserCouleur(' #336699 '), '#336699');
    for (const v of ['red', 'rgb(0,0,0)', '#12', '#12345', '#gggggg', 'url(x)', '#fff; background:url(x)', '', null, 42]) assert.equal(normaliserCouleur(v), null, String(v));
  });
  test('contraste : noir/blanc = 21, identique = 1', () => {
    assert.ok(Math.abs(contraste('#000000', '#ffffff') - 21) < 0.01);
    assert.equal(contraste('#336699', '#336699'), 1);
    assert.ok(luminance('#ffffff') > luminance('#000000'));
  });
  test('texte du bouton : toujours au moins 4,5 de contraste, même sur une couleur claire ou jaune', () => {
    for (const c of ['#ffffff', '#ffff00', '#f0a93a', '#ecbc06', '#e3cdee', '#336699', '#000000', '#767676', '#777777', '#ff0000', '#00aa55']) {
      assert.ok(contraste(c, texteSur(c)) >= 4.5, `${c} -> ${texteSur(c)}`);
    }
    assert.equal(texteSur('#ffffff'), '#000000');
    assert.equal(texteSur('#102030'), '#ffffff');
  });
  test('couleur de marque comme texte sur le fond sombre : éclaircie si besoin, jamais sous 4,5', () => {
    const fond = '#241b2e';
    for (const c of ['#000000', '#1a1a1a', '#341363', '#336699', '#ffffff', '#ffff00']) {
      assert.ok(contraste(couleurLisibleSur(c, fond), fond) >= 4.5, c);
    }
    assert.equal(couleurLisibleSur('#ffff00', fond), '#ffff00', 'une couleur déjà lisible ne bouge pas');
    assert.notEqual(couleurLisibleSur('#341363', fond), '#341363');
  });
});

describe('marque : fiche brute -> marque sûre', () => {
  const fiche = { actif: true, nom: '  Atelier Dupont ', couleur: '#ABC', logo: 'https://exemple.test/logo.png', images: ['https://exemple.test/a.jpg', { url: 'https://exemple.test/b.jpg', alt: 'Façade' }], accueil: 'Bienvenue' };
  test('fiche complète', () => {
    assert.deepEqual(normaliserMarque(fiche), {
      nom: 'Atelier Dupont', couleur: '#aabbcc', logo: 'https://exemple.test/logo.png',
      images: [{ url: 'https://exemple.test/a.jpg', alt: '' }, { url: 'https://exemple.test/b.jpg', alt: 'Façade' }], accueil: 'Bienvenue',
    });
  });
  test('absente, inactive ou mal formée -> null (page neutre)', () => {
    for (const f of [null, undefined, {}, { ...fiche, actif: false }, { ...fiche, actif: 'true' }, { ...fiche, actif: 1 }, 'texte', []]) assert.equal(normaliserMarque(f), null, JSON.stringify(f));
  });
  test('repli sur la marque neutre champ par champ', () => {
    const m = normaliserMarque({ actif: true, couleur: 'rouge', nom: 12, logo: 'javascript:alert(1)', images: 'non' });
    assert.deepEqual(m, { nom: MARQUE_NEUTRE.nom, couleur: MARQUE_NEUTRE.couleur, logo: null, images: [], accueil: '' });
  });
  test('adresses d\'images : https seulement ; au plus 4 images ; texte borné', () => {
    assert.equal(urlImageValide('http://exemple.test/a.png'), null);
    assert.equal(urlImageValide('data:image/png;base64,AAAA'), null);
    assert.equal(urlImageValide('javascript:alert(1)'), null);
    assert.equal(urlImageValide('//exemple.test/a.png'), null);
    assert.equal(urlImageValide('https://exemple.test/a.png'), 'https://exemple.test/a.png');
    const m = normaliserMarque({ actif: true, images: Array.from({ length: 9 }, (_, i) => `https://exemple.test/${i}.jpg`).concat(['http://non.test/x.jpg']), accueil: 'x'.repeat(900), nom: 'y'.repeat(300) });
    assert.equal(m.images.length, 4);
    assert.equal(m.accueil.length, 500);
    assert.equal(m.nom.length, 80);
  });
  test('variables de style : marque neutre par défaut, contraste respecté', () => {
    const s = styleMarque(null);
    assert.equal(s['--marque'], MARQUE_NEUTRE.couleur);
    const claire = styleMarque({ couleur: '#ffffcc' });
    assert.ok(contraste(claire['--marque'], claire['--marque-texte']) >= 4.5);
  });
  test('le message de refus est unique et ne cite aucun client', () => {
    assert.match(MESSAGE_REFUS_ESPACE, /pas accès à cet espace/);
  });
});

describe('page d\'un client : contrôles statiques', () => {
  const espace = sansCommentaires(lire('js/os/espace.js'));
  test('la page vérifie l\'appartenance avec le client du lien et n\'écrit jamais dans Firestore', () => {
    assert.match(espace, /surveillerCompte\([\s\S]*\{ client \}\)/);
    assert.ok(!/setDoc|updateDoc|deleteDoc|addDoc|writeBatch/.test(espace), 'aucune écriture');
    assert.ok(/doc\(db, 'marques', client\)/.test(espace));
  });
  test('un seul message de refus pour tous les cas, aucune mention d\'un autre client', () => {
    assert.equal((espace.match(/MESSAGE_REFUS_ESPACE/g) || []).length, 2); // import + une seule utilisation
    assert.ok(!/autre client|another client/i.test(espace));
  });
  test('rien n\'est injecté en HTML brut (innerHTML, insertAdjacentHTML, document.write)', () => {
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(espace));
  });
  test('main.js : le CRM reste le chemin par défaut, la plateforme n\'est chargée que pour #/espace/…', () => {
    const main = sansCommentaires(lire('js/main.js'));
    assert.match(main, /estRouteEspace/);
    assert.match(main, /import\('\.\/os\/espace\.js'\)/);
    assert.match(main, /demarrerCrm\(\)/);
    assert.match(main, /surveillerCompte\(async \(ev\) =>/); // appel sans { client } : CRM de Jérôme inchangé
    assert.ok(!/surveillerCompte\([\s\S]*?\{ client/.test(main));
  });
  test('lien court /espace/<client> : redirection fixe vers l\'appli, identifiant filtré', () => {
    const f = lire('espace/index.html');
    assert.match(f, /A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,39\}/);
    assert.ok(!/location\.(search|hash)|document\.referrer/.test(f), 'aucune adresse libre reprise');
    const fb = JSON.parse(lire('firebase.json'));
    assert.ok(fb.hosting.rewrites.some((r) => r.source === '/espace/**' && r.destination === '/espace/index.html'));
  });
  test('styles : contraste du bouton et focus visible, pas de couleur de marque en dur dans la page', () => {
    const css = lire('css/os.css');
    assert.match(css, /\.espace-bouton:focus-visible/);
    assert.match(css, /color: var\(--marque-texte\)/);
    assert.match(css, /safe-area-inset/);
  });
});

describe('règles Storage et configuration plateforme (non publiées)', () => {
  test('storage.plateforme.rules : lecture d\'un fichier de marques/<client>, pas de liste, aucune écriture, tout le reste refusé', () => {
    const r = sansCommentaires(lire('storage.plateforme.rules'));
    assert.match(r, /match \/marques\/\{client\}\/\{fichier=\*\*\} \{\s*allow get: if true;\s*allow list, write: if false;\s*\}/);
    assert.match(r, /match \/\{autre=\*\*\} \{\s*allow read, write: if false;\s*\}/);
    assert.equal((r.match(/if true/g) || []).length, 1, 'une seule autorisation publique');
  });
  test('firestore.plateforme.rules : la fiche de marque est l\'unique lecture publique', () => {
    const r = sansCommentaires(lire('firestore.plateforme.rules'));
    assert.match(r, /match \/marques\/\{client\} \{\s*allow get: if resource\.data\.get\('actif', false\) == true;\s*allow list, write: if false;\s*\}/);
    assert.ok(!/if true/.test(r));
  });
  test('firebase.plateforme.json déclare les deux fichiers de règles ; firebase.json (CRM) ne les publie pas', () => {
    const p = JSON.parse(lire('firebase.plateforme.json'));
    assert.equal(p.firestore.rules, 'firestore.plateforme.rules');
    assert.equal(p.storage.rules, 'storage.plateforme.rules');
    assert.ok(existsSync(join(RACINE, 'storage.plateforme.rules')));
    const fb = JSON.parse(lire('firebase.json'));
    assert.equal(fb.firestore.rules, 'firestore.rules');
    assert.equal(fb.storage, undefined);
    assert.ok(fb.hosting.ignore.includes('storage.plateforme.rules'));
  });
});
