// Chantier 6 : identité de Jérôme retirée chez un client. Logique pure (accent, contraste, icône, manifeste) et contrôles statiques
// (inventaire des textes, jetons de couleur : le CRM de Jérôme garde exactement ses valeurs jaunes).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import {
  contraste, accentPourTheme, feuilleAccent, SURFACES_THEME, initialeMarque, iconeInitiale, manifesteClient, MARQUE_NEUTRE,
} from '../js/os/marque.js';
import { estChezClient, definirChezClient } from '../js/os/contexte.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const COULEURS = ['#ffffff', '#000000', '#ffff00', '#f0a93a', '#ecbc06', '#e3cdee', '#341363', '#336699', '#102030', '#767676', '#ff0000', '#00aa55', '#fff', '#0a0'];
const THEMES = ['sombre', 'clair'];

describe('accent chez un client : contraste vérifié, deux thèmes', () => {
  test('texte sur le bouton ≥ 4,5, bouton visible sur la page ≥ 3, texte et icônes ≥ 4,5 sur la surface la plus défavorable', () => {
    for (const c of COULEURS) {
      for (const t of THEMES) {
        const a = accentPourTheme(c, t);
        const surface = SURFACES_THEME[t];
        assert.ok(contraste(a.accent, a.surAccent) >= 4.5, `${c}/${t} : texte du bouton`);
        assert.ok(contraste(a.accent, surface) >= 3, `${c}/${t} : bouton sur la page`);
        assert.ok(contraste(a.trait, surface) >= 4.5, `${c}/${t} : texte/icône sur la page`);
        assert.ok(contraste(a.survol, a.surAccent) >= 4.5, `${c}/${t} : bouton survolé`);
      }
    }
  });
  test('une couleur déjà lisible ne bouge pas (le jaune de Jérôme reste jaune sur fond sombre)', () => {
    const a = accentPourTheme('#ecbc06', 'sombre');
    assert.equal(a.accent, '#ecbc06');
    assert.equal(a.trait, '#ecbc06');
  });
  test('une couleur invalide retombe sur la couleur neutre, jamais d\'erreur', () => {
    assert.deepEqual(accentPourTheme('rouge', 'clair'), accentPourTheme(MARQUE_NEUTRE.couleur, 'clair'));
  });
  test('feuille de style : deux thèmes, tous les jetons, rien d\'autre que des couleurs #rrggbb', () => {
    const css = feuilleAccent('#336699');
    for (const t of THEMES) assert.match(css, new RegExp(`:root\\[data-theme='${t}'\\]\\[data-marque\\] \\{`));
    for (const j of ['--accent', '--sur-accent', '--accent-survol', '--accent-trait', '--lien', '--accent-a1f', '--accent-a99']) assert.ok(css.includes(`${j}:`), j);
    const sansSelecteur = css.replace(/:root\[data-theme='(sombre|clair)'\]\[data-marque\] \{/g, '').replace(/\}/g, '');
    for (const decl of sansSelecteur.split(';').map((d) => d.trim()).filter(Boolean)) {
      assert.match(decl, /^--[a-z0-9-]+: #[0-9a-f]{6}([0-9a-f]{2})?$/, decl);
    }
  });
  test('injection impossible : une valeur piégée ne produit que la couleur neutre', () => {
    const css = feuilleAccent('#fff; } body { display:none');
    assert.ok(!css.includes('display'));
    assert.ok(!css.includes('body'));
    assert.equal(css, feuilleAccent(MARQUE_NEUTRE.couleur));
  });
  test('la couleur d\'accent est distincte des couleurs d\'étapes : la feuille ne redéfinit aucun jeton sémantique', () => {
    const css = feuilleAccent('#336699');
    assert.ok(!/--etape-|--prio-|--retard|--succes|--jaune|--corail|--vert/.test(css));
  });
});

describe('identité de la page : icône, manifeste', () => {
  test('initiale du nom', () => {
    assert.equal(initialeMarque({ nom: 'Cabinet Martin' }), 'C');
    assert.equal(initialeMarque({ nom: 'école du lac' }), 'É');
    assert.equal(initialeMarque({ nom: '' }), '?');
    assert.equal(initialeMarque(null), MARQUE_NEUTRE.nom[0]);
  });
  test('icône sans logo : SVG aux couleurs du client, initiale échappée', () => {
    const uri = iconeInitiale({ nom: '<b>&"', couleur: '#336699' });
    assert.ok(uri.startsWith('data:image/svg+xml,'));
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    assert.match(svg, /fill="#336699"/);
    assert.ok(!svg.includes('<b>'));
    assert.match(svg, />&lt;<\/text>/);
  });
  test('manifeste : nom, adresse de départ et couleurs du client ; rien de Jérôme', () => {
    const m = manifesteClient({ nom: 'Cabinet Martin', couleur: '#336699', logo: 'https://exemple.test/logo.png' }, 'cabinet', 'https://app.exemple.test');
    assert.equal(m.name, 'Cabinet Martin');
    assert.equal(m.start_url, 'https://app.exemple.test/#/espace/cabinet');
    assert.equal(m.scope, 'https://app.exemple.test/');
    assert.equal(m.icons[0].src, 'https://exemple.test/logo.png');
    assert.ok(!('sizes' in m.icons[0]), 'M4 : aucune taille inventée pour le logo du stockage');
    assert.equal(m.icons[1].type, 'image/svg+xml', 'M4 : icône à l’initiale en repli');
    assert.ok(!/chevalier|jérôme|crm\/accueil/i.test(JSON.stringify(m)));
    const long = manifesteClient({ nom: 'Un nom vraiment très long de client', couleur: '#336699', logo: null }, 'x', 'https://a.test');
    assert.ok(long.short_name.length <= 12);
    assert.equal(long.icons[0].type, 'image/svg+xml');
  });
});

describe('interrupteur « chez un client »', () => {
  test('faux par défaut (CRM de Jérôme), vrai seulement sur demande explicite, revient à faux', () => {
    assert.equal(estChezClient(), false);
    definirChezClient('oui');
    assert.equal(estChezClient(), false, 'seul true active');
    definirChezClient(true);
    assert.equal(estChezClient(), true);
    definirChezClient(false);
    assert.equal(estChezClient(), false);
  });
  test('espace-modules l\'active à l\'ouverture et le coupe à la fermeture', () => {
    const src = lire('js/os/espace-modules.js');
    assert.match(src, /definirChezClient\(true\)/);
    assert.match(src, /definirChezClient\(false\)/);
    assert.match(src, /appliquerIdentite\(marque, client\)/);
  });
});

describe('CRM de Jérôme : les jetons d\'accent gardent leurs valeurs jaunes', () => {
  const tokens = lire('css/tokens.css');
  test('valeurs par défaut = jaune d\'avant', () => {
    assert.match(tokens, /--accent-survol: var\(--jaune-clair\);/);
    assert.match(tokens, /--accent-trait: var\(--jaune\);/);
    for (const a of ['1f', '20', '26', '33', '55', '66', '80', '99']) assert.ok(tokens.includes(`--accent-a${a}: #ecbc06${a};`), a);
    assert.match(tokens, /--jaune: #ecbc06;/);
    assert.match(tokens, /--jaune-clair: #ffe56c;/);
    assert.equal((tokens.match(/--accent: var\(--jaune\);/g) || []).length, 2, 'les deux thèmes');
    assert.equal((tokens.match(/--sur-accent: #29292c;/g) || []).length, 2);
  });
  test('les couleurs sémantiques ne dépendent pas de l\'accent', () => {
    for (const l of tokens.split('\n').filter((x) => /--(etape|prio)-/.test(x))) assert.ok(!/--accent/.test(l), l);
    assert.match(tokens, /--etape-gagne: var\(--jaune\);/);
    assert.match(tokens, /--prio-tiede: var\(--jaune\);/);
  });
  test('la feuille d\'un client n\'est injectée que par identite.js (jamais par main.js, donc jamais au CRM)', () => {
    assert.ok(!/identite|feuilleAccent|data-marque/.test(lire('js/main.js')));
    assert.ok(!/data-marque/.test(tokens + lire('css/os.css') + lire('css/crm.css')));
  });
  test('plus de jaune « en dur » dans les règles d\'interface partagées (restent : connexion du CRM, célébrations, objectifs, rappel de sauvegarde, étoile)', () => {
    const permis = /rappel-export|objectif|celebration|connexion|orbite|charles|bouton-google|badge-manuel|menu-marque b|barre-haut-marque b|est-favori|\.espace/;
    for (const f of ['css/os.css', 'css/crm.css', 'css/projets.css']) {
      let selecteur = ''; // règles écrites sur plusieurs lignes : la ligne du sélecteur compte
      for (const l of lire(f).split('\n')) {
        if (l.includes('{')) selecteur = l;
        if (!/ecbc06|var\(--jaune|ffe56c|f0a93a/.test(l)) continue;
        assert.match(`${selecteur} ${l}`, permis, `${f} : ${l.trim().slice(0, 100)}`);
      }
    }
  });
});

describe('inventaire des textes d\'identité de Jérôme dans le code de l\'interface', () => {
  function fichiers(dossier) {
    return readdirSync(join(RACINE, dossier)).flatMap((n) => {
      const chemin = join(dossier, n);
      return statSync(join(RACINE, chemin)).isDirectory() ? fichiers(chemin) : (n.endsWith('.js') ? [chemin] : []);
    });
  }
  const sansComm = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  // Fichier -> pourquoi les mentions sont acceptables (chaque entrée est une décision : un nouveau fichier fait échouer ce test).
  const ATTENDUS = {
    'js/main.js': 'CRM de Jérôme seulement (Réglages, connexion)',
    'js/os/shell.js': 'marque de Jérôme à la racine ; chez un client : nom du client (option client)',
    'js/os/celebrations.js': 'option du CRM (allumée par défaut chez un client, réglable), message neutre, prénom et image en réglage',
    'js/os/firebase-config.js': 'comptes autorisés du CRM de Jérôme (vide dans la plateforme)',
    'js/os/registre.js': 'menu « CRM » (mot du métier)',
    'js/modules/mcp/index.js': 'texte des Réglages de l’assistant à la racine seulement : « les comptes autorisés sont fixés par Jérôme » (jamais montré chez un client)',
    'js/modules/mcp/logique.js': 'phrase de la page « Connecter mon IA » à la racine seulement : « Les comptes autorisés sont fixés par Jérôme » (jamais montrée chez un client)',
    'js/modules/crm/composants.js': 'noms des deux comptes (affichage d\'un auteur) ; image de Charles et liste Jérôme/Charles coupées chez un client',
    'js/modules/crm/logique.js': 'données de départ et textes pour Claude Code (écrans masqués chez un client)',
    'js/modules/crm/affaires.js': 'célébration « Bravo Jérôme ! » (coupée chez un client)',
    'js/modules/crm/accueil.js': 'texte de Charles remplacé chez un client',
    'js/modules/crm/journal.js': 'texte neutre chez un client',
    'js/modules/crm/lanceurs.js': 'Claude Code / GitHub : derrière l’option « Dépôt de code et dossier » (allumée par défaut chez un client, réglable)',
    'js/modules/crm/reglages.js': 'écran Réglages du CRM : inaccessible chez un client',
    'js/modules/crm/dossier-parent.js': 'zone « Dossier Drive parent » des options : l’aide cite le nom « Chevalier IA - … » du dossier créé tout seul (voulu, comme google-drive.js)',
    'js/modules/crm/donnees.js': 'noms de collections ; réglages de départ vidés chez un client',
    'js/modules/automatisations/logique.js': 'bandeau de la vue administrateur (nomme Chevalier IA APP) : montré au seul compte de Jérôme, chez lui',
    'js/modules/projets/logique.js': 'modèles de départ de Jérôme (semés seulement à la racine)',
    'js/modules/projets/taches.js': 'champ « Confiée à » : membres de l’espace, caché s’il n’y en a qu’un',
    'js/modules/projets/fiche-projet.js': 'lanceurs masqués chez un client',
    'js/os/google-drive.js': 'nom du dossier parent créé tout seul : « Chevalier IA OS » à la racine, « Chevalier IA - <nom de l\'espace> » chez un client (voulu)',
    'js/modules/projets/projets.js': 'GitHub / célébration de clôture coupée chez un client',
  };
  const MOTS = /Chevalier|Jérôme|Jerome|Charles|Hermes|Claude Code/;
  test('toute mention dans le code est connue et traitée (sinon : décider si elle doit être masquée chez un client)', () => {
    const trouves = {};
    for (const f of fichiers('js')) {
      if (/\.test\./.test(f)) continue;
      if (MOTS.test(sansComm(lire(f)))) trouves[f.replaceAll('\\', '/')] = true;
    }
    const inconnus = Object.keys(trouves).filter((f) => !(f in ATTENDUS));
    assert.deepEqual(inconnus, [], `nouvelles mentions à classer : ${inconnus.join(', ')}`);
  });
  test('les fichiers partagés qui montrent encore un texte de Jérôme le coupent chez un client', () => {
    for (const f of ['js/modules/crm/accueil.js', 'js/modules/crm/composants.js', 'js/modules/crm/journal.js']) {
      assert.match(lire(f), /estChezClient/, f);
    }
    // Depuis le ménage du CRM, les célébrations, le GitHub et « Confiée à » ne dépendent plus de « chez un client » mais d'une option / des membres.
    assert.match(lire('js/os/celebrations.js'), /configurerCelebrations/);
    assert.match(lire('js/modules/crm/lanceurs.js'), /boutonsDepot/);
    assert.match(lire('js/modules/projets/taches.js'), /choixAssigneVisible/);
  });
  test('les fichiers propres à la page d\'un client ne portent aucun nom de Jérôme', () => {
    for (const f of ['js/os/espace.js', 'js/os/espace-modules.js', 'js/os/identite.js', 'js/os/marque.js', 'js/os/contexte.js', 'js/os/reglages.js']) {
      assert.ok(!MOTS.test(sansComm(lire(f))), f);
    }
  });
  test('index.html : le script de tête neutralise le titre et les icônes pour #/espace/, le noscript est neutre', () => {
    const html = lire('index.html');
    assert.match(html, /\^#\\\/espace\\\//);
    assert.match(html, /<noscript>Cette application a besoin de JavaScript\.<\/noscript>/);
  });
});
