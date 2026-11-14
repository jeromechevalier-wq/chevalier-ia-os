// Module Réseaux sociaux, écran « Fréquentation du site » (14/11/2026) : règles pures et tests de source, sans navigateur ni émulateur.
// Un test par critère ; le nom commence par son numéro (Q1 à Q6). Données fictives uniquement : « site-exemple » et « jeton-exemple » (aucun vrai lien de partage dans le dépôt, qui est public).
// Le parcours à l'écran (vide, enregistrement, cadre, erreur, retrait) : tests/e2e/reseauxsociaux-frequentation.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as F from '../js/modules/reseauxsociaux/frequentation-logique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8');
const LIEN = 'https://plausible.io/share/site-exemple?auth=jeton-exemple';

describe('Q1 lien de partage accepté ou refusé', () => {
  test('Q1 un lien https://plausible.io/share/<site>?auth=… est accepté, nettoyé de ses autres paramètres', () => {
    assert.deepEqual(F.verifierLien(`  ${LIEN}&embed=false&theme=dark&autre=1 `), { ok: true, lien: LIEN });
    assert.deepEqual(F.verifierLien('https://plausible.io/share/site-exemple/'), { ok: true, lien: 'https://plausible.io/share/site-exemple' });
  });
  test('Q1 vide, texte quelconque, http, autre site, faux hôte ou autre chemin : refusés avec un message qui dit quoi faire', () => {
    assert.equal(F.verifierLien('').message, F.MESSAGES.vide);
    assert.equal(F.verifierLien(null).ok, false);
    assert.equal(F.verifierLien('pas une adresse').message, F.MESSAGES.illisible);
    for (const mauvais of ['http://plausible.io/share/site-exemple?auth=x', 'https://exemple.test/share/site-exemple?auth=x', 'https://plausible.io.exemple.test/share/s?auth=x',
      'https://plausible.io@exemple.test/share/s', 'https://utilisateur:mdp@plausible.io/share/s', 'https://plausible.io:8443/share/s', 'https://plausible.io/site-exemple', 'https://plausible.io/share/', 'javascript:alert(1)']) {
      const v = F.verifierLien(mauvais);
      assert.equal(v.ok, false, mauvais);
      assert.ok(v.message.length > 20, mauvais);
    }
    assert.match(F.MESSAGES.inconnu, /https:\/\/plausible\.io\/share\//);
  });
});

describe('Q2 adresse du cadre', () => {
  test('Q2 le cadre reçoit embed=true et le thème de l’écran ; un lien invalide ne donne aucune adresse', () => {
    const u = new URL(F.adresseCadre(LIEN, 'dark'));
    assert.equal(u.origin + u.pathname, 'https://plausible.io/share/site-exemple');
    assert.equal(u.searchParams.get('embed'), 'true');
    assert.equal(u.searchParams.get('theme'), 'dark');
    assert.equal(u.searchParams.get('auth'), 'jeton-exemple');
    assert.equal(new URL(F.adresseCadre(LIEN, 'inconnu')).searchParams.get('theme'), 'light');
    assert.equal(F.adresseCadre('https://exemple.test/x'), '');
    assert.equal(F.adresseOuverture(LIEN), LIEN);
    assert.equal(F.adresseOuverture('https://exemple.test/x'), '');
  });
});

describe('Q3 lecture du réglage et états de l’écran', () => {
  test('Q3 un document absent, vide ou au lien invalide donne « aucun lien » ; un document valide rend le lien', () => {
    assert.equal(F.lienDepuisDocument(undefined), '');
    assert.equal(F.lienDepuisDocument({ lien: '' }), '');
    assert.equal(F.lienDepuisDocument({ lien: 'https://exemple.test/x' }), '');
    assert.equal(F.lienDepuisDocument({ lien: LIEN }), LIEN);
  });
  test('Q3 les quatre états : chargement, erreur, vide, cadre', () => {
    assert.equal(F.etatEcran({ lecture: 'chargement', lien: LIEN }), 'chargement');
    assert.equal(F.etatEcran({ lecture: 'erreur', lien: '' }), 'erreur');
    assert.equal(F.etatEcran({ lecture: 'ok', lien: '' }), 'vide');
    assert.equal(F.etatEcran({ lecture: 'ok', lien: LIEN }), 'cadre');
  });
});

describe('Q4 objectifs de contact', () => {
  test('Q4 les trois clics de contact du site sont nommés comme dans Plausible', () => {
    assert.deepEqual([...F.OBJECTIFS_CONTACT], ['Contact formulaire', 'Contact téléphone', 'Contact WhatsApp']);
  });
});

describe('Q5 dépôt public : aucun lien de partage ni clé dans le code', () => {
  test('Q5 aucun fichier de l’écran ni de ses tests ne contient une adresse /share/ réelle ou « auth= » suivi d’un jeton', () => {
    for (const f of ['js/modules/reseauxsociaux/frequentation-logique.js', 'js/modules/reseauxsociaux/frequentation-ecran.js', 'js/modules/reseauxsociaux/frequentation-donnees.js']) {
      const t = lire(f);
      const partages = [...t.matchAll(/plausible\.io\/share\/([^\s'"`)]*)/g)].map((m) => m[1]);
      for (const p of partages) assert.ok(p === '' || p === '…' || p.startsWith('<'), `${f} : ${p}`);
      assert.doesNotMatch(t, /auth=[A-Za-z0-9_-]{8,}/, f);
    }
  });
});

describe('Q6 branchement', () => {
  test('Q6 le lien vit dans crm_parametres/frequentation_site (aucune nouvelle table) et s’écrit par le journal commun', () => {
    assert.deepEqual({ ...F.DOCUMENT_LIEN }, { collection: 'crm_parametres', id: 'frequentation_site' });
    const d = lire('js/modules/reseauxsociaux/frequentation-donnees.js');
    assert.match(d, /executer\(\[L\.ecritureCreer\(F\.DOCUMENT_LIEN\.collection/);
    assert.doesNotMatch(d, /setDoc\(doc\(db, chemin\(F\./);
  });
  test('Q6 l’écran est déclaré au registre (route reseauxsociaux/frequentation) et chargé à la demande', () => {
    assert.match(lire('js/os/registre.js'), /route: 'reseauxsociaux\/frequentation', libelle: 'Site web', icone: 'globe'/);
    assert.match(lire('js/modules/reseauxsociaux/index.js'), /frequentation: \(\) => import\('\.\/frequentation-ecran\.js'\)/);
  });
  test('Q6 le cadre ne charge que Plausible : aucune politique de sécurité de firebase.json ne l’interdit', () => {
    const fb = lire('firebase.json');
    assert.doesNotMatch(fb, /frame-src|Content-Security-Policy|X-Frame-Options/i);
  });
});
