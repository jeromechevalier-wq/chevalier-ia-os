// Chantier « applications dans la coque » (27/11/2026) : logique sans navigateur ni émulateur. Un test par critère (le nom commence par son numéro).
//  1 un bâtiment = une application (table module -> route de l'appli, js/os/maison-village.js) ; 3 « Modules actifs » d'une maison (js/os/registre.js) ;
//  4 nom et logo d'une maison (js/os/identite-maison.js, js/os/logo-maison.js). Parcours dans le navigateur : tests/e2e/applications-coque.spec.js. Données inventées.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPLIS_MODULES, routeDuBesoin, cibleValide } from '../js/os/maison-village.js';
import { interrupteursDeLaMaison, interrupteursDuClient, moduleDeclare, MODULES_DECLARES, SECTIONS_ESPACE } from '../js/os/registre.js';
import { retenirPublic, oublierPublic, logoMaison, logoValide, nomEspaceMaison, nomRange, connexionNeutre, LOGO_OCTETS_MAX, LOGO_LONGUEUR_MAX, identiteMaisonModifiable, planIdentiteMaison } from '../js/os/identite-maison.js';
import { preparerLogoMaison, typeLogo } from '../js/os/logo-maison.js';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');

beforeEach(() => oublierPublic());

test('1 la table module -> application : Factures ouvre sa pile ; chaque module de la table existe et sa route commence par son préfixe', () => {
  assert.deepEqual({ ...APPLIS_MODULES }, { achatsfactures: 'achatsfactures/pile' });
  for (const [id, route] of Object.entries(APPLIS_MODULES)) {
    const m = moduleDeclare(id);
    assert.ok(m, `module déclaré : ${id}`);
    assert.ok(route.startsWith(`${m.prefixe}/`), `${route} appartient au module ${id}`);
    assert.ok(cibleValide(`#/${route}`), 'la route de l’appli est une route interne valable');
  }
});

test('1 la cible d’un besoin qui vise la liste (ou le module seul) d’un module à application mène à l’application ; toute autre cible est gardée telle quelle', () => {
  assert.equal(routeDuBesoin('#/achatsfactures/liste'), 'achatsfactures/pile');
  assert.equal(routeDuBesoin('#/achatsfactures'), 'achatsfactures/pile');
  assert.equal(routeDuBesoin('#/achatsfactures/liste/'), 'achatsfactures/pile');
  assert.equal(routeDuBesoin('#/achatsfactures/pile'), 'achatsfactures/pile');
  assert.equal(routeDuBesoin('#/achatsfactures/tableau'), 'achatsfactures/tableau', 'une vue précise n’est jamais détournée');
  assert.equal(routeDuBesoin('#/achatsfactures/liste/f12'), 'achatsfactures/liste/f12', 'une fiche n’est jamais détournée');
  assert.equal(routeDuBesoin('#/tableauachats/tableau'), 'tableauachats/tableau', 'module sans application : comme avant');
  assert.equal(routeDuBesoin('#/achatschantiers/liste'), 'achatschantiers/liste');
  assert.equal(routeDuBesoin('#/toString/liste'), 'toString/liste', 'un nom hérité d’Object n’est pas un module de la table');
  assert.equal(routeDuBesoin(undefined), '');
});

test('1 la table est appliquée au moment d’ouvrir la cible (js/main.js), sans toucher au dessin ; la maison de l’appli ramène à l’accueil', () => {
  assert.match(lire('js/main.js'), /aller: \(cible\) => naviguer\(routeDuBesoin\(cible\)\)/);
  assert.match(lire('js/modules/achatsfactures/appli.js'), /class: 'bouton-icone af-maison', href: lien\(''\)/);
});

test('3 maison, compte client : seulement les lignes allumées, avec leur vrai état (les modules Achats comptent, la Console jamais)', () => {
  const lignes = interrupteursDeLaMaison(ACHATS);
  assert.deepEqual(lignes.map((l) => l.id), ['achats']);
  assert.deepEqual(lignes[0], { id: 'achats', libelle: 'Achats', modules: moduleLigne('achats'), actif: true, complet: true });
  assert.deepEqual(interrupteursDeLaMaison([...ACHATS, 'console']).map((l) => l.id), ['achats'], 'la Console n’est jamais une ligne');
  assert.deepEqual(interrupteursDeLaMaison([]), [], 'rien d’allumé : aucune ligne (l’écran dit « Aucun module »)');
  const partiel = interrupteursDeLaMaison(['achatsfactures', 'devis']);
  // Bloc en partie allumé (Factures seule) : le client ne lit que « Factures », sans « une partie seulement » ; le titulaire voit tout le bloc, dit incomplet.
  assert.deepEqual(partiel.map((l) => [l.id, l.actif, l.complet, l.modules]), [['devis', true, true, ['devis']], ['achats', true, true, ['achatsfactures']]]);
  const partielTitulaire = interrupteursDeLaMaison(['achatsfactures'], { catalogue: true }).find((l) => l.id === 'achats');
  assert.deepEqual([partielTitulaire.actif, partielTitulaire.complet, partielTitulaire.modules.length], [true, false, 5]);
});
function moduleLigne(id) { return interrupteursDeLaMaison(MODULES_DECLARES.map((m) => m.id), { catalogue: true }).find((l) => l.id === id).modules; }

test('3 maison, titulaire : tout le catalogue (Achats compris, sans la Console), allumé ou éteint selon le réglage', () => {
  const lignes = interrupteursDeLaMaison(ACHATS, { catalogue: true });
  const ids = lignes.map((l) => l.id);
  assert.ok(ids.includes('achats') && ids.includes('crm') && ids.includes('devis'));
  assert.ok(!ids.includes('console'));
  assert.deepEqual(lignes.filter((l) => l.actif).map((l) => l.id), ['achats'], 'seul Achats est allumé : le reste est « Éteint », pas l’inverse');
  // le catalogue du titulaire = les lignes de la plateforme + les blocs réservés activables dans une maison
  const plateforme = interrupteursDuClient([]).map((l) => l.id);
  assert.deepEqual(ids.filter((id) => id !== 'achats'), plateforme);
});

test('3 « Modules actifs » n’est plus une page technique cachée ; chez Jérôme et sur la plateforme, la liste d’avant (interrupteursDuClient) reste servie', () => {
  assert.ok(!SECTIONS_ESPACE.find((s) => s.id === 'modules').technique);
  const reglages = lire('js/os/reglages.js');
  assert.match(reglages, /const catalogue = maison && compteReserve\(ctx\.compte\);/, 'catalogue entier : le contrôle d’identité existant (comptes_jerome_seul), pas un nouveau');
  assert.match(reglages, /maison \? interrupteursDeLaMaison\(ctx\.actifs, \{ catalogue \}\) : interrupteursDuClient\(ctx\.actifs\)/);
  assert.match(reglages, /return !ctx\.chezClient && \(maisonNeutre\(\) \|\| lireModulesMaison\(modulesEcranBrut\(\)\)\.reglage\);/);
});

test('4 le logo de `public` : une adresse « data: » PNG, JPEG ou SVG assez courte est retenue ; tout le reste est ignoré', () => {
  const bon = preparerLogoMaison(PNG).logo;
  retenirPublic({ mode_crm: true, nom_espace: '  Espace   exemple ', logo: bon });
  assert.equal(nomEspaceMaison(), 'Espace exemple');
  assert.equal(logoMaison(), bon);
  for (const mauvais of ['https://exemple.test/logo.png', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'data:image/png;base64,', 'data:image/gif;base64,AAAA', 'data:image/png;base64,AA AA', 42, null, `data:image/png;base64,${'A'.repeat(LOGO_LONGUEUR_MAX)}`]) {
    retenirPublic({ mode_crm: true, nom_espace: 'Espace exemple', logo: mauvais });
    assert.equal(logoMaison(), '', String(mauvais).slice(0, 40));
    assert.equal(logoValide(mauvais), false);
  }
  oublierPublic();
  assert.equal(logoMaison(), '');
  assert.equal(connexionNeutre(), false, 'chez Jérôme (ni nom ni connexion_neutre) : Mon espace reste en lecture seule');
});

test('4 fichier du logo : le type est lu dans les octets (PNG, JPEG, SVG) ; trop lourd, vide ou autre type : refus avec un message clair', () => {
  assert.equal(typeLogo(PNG), 'image/png');
  assert.equal(typeLogo(JPEG), 'image/jpeg');
  assert.equal(typeLogo(SVG), 'image/svg+xml');
  assert.equal(typeLogo(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
  assert.equal(typeLogo(new TextEncoder().encode('<html><svg></svg></html>')), null);
  assert.equal(typeLogo(new TextEncoder().encode('GIF89a....')), null);
  for (const [octets, type] of [[PNG, 'png'], [JPEG, 'jpeg'], [SVG, 'svg+xml']]) {
    const r = preparerLogoMaison(octets);
    assert.equal(r.ok, true);
    assert.ok(r.logo.startsWith(`data:image/${type};base64,`));
    assert.ok(logoValide(r.logo));
    assert.deepEqual(new Uint8Array(Buffer.from(r.logo.split(',')[1], 'base64')), octets, 'le contenu est gardé tel quel');
  }
  const lourd = new Uint8Array(LOGO_OCTETS_MAX + 1); lourd.set(PNG);
  assert.match(preparerLogoMaison(lourd).message, /101 Ko : 100 Ko au plus/);
  assert.equal(LOGO_OCTETS_MAX, 100000);
  const limite = new Uint8Array(LOGO_OCTETS_MAX); limite.set(PNG);
  assert.equal(preparerLogoMaison(limite).ok, true, '100 Ko pile : accepté, et l’adresse tient dans la borne des règles');
  assert.ok(preparerLogoMaison(limite).logo.length <= LOGO_LONGUEUR_MAX);
  assert.match(preparerLogoMaison(new Uint8Array(0)).message, /vide/);
  assert.match(preparerLogoMaison(new TextEncoder().encode('bonjour')).message, /ni un PNG, ni un JPG, ni un SVG/);
});

test('4 le nom : espaces simplifiés, 80 caractères au plus, jamais autre chose qu’un texte', () => {
  assert.equal(nomRange('  Espace   04 '), 'Espace 04');
  assert.equal([...nomRange('é'.repeat(200))].length, 80);
  assert.equal(nomRange(42), '');
});

test('4 les règles et l’écran portent les mêmes bornes ; le logo n’est posé que dans la source d’une image', () => {
  const regles = lire('firestore.rules');
  assert.match(regles, /allow update: if id == 'public' && compteAutorise\(\) && identiteMaisonValide\(\);/, 'tout compte de la maison (27/11/2026), plus seulement le titulaire');
  assert.match(lire('js/os/reglages.js'), /if \(identiteMaisonModifiable\(ctx\)\) return \[sectionMonEspaceMaison\(ctx, etat\), apparence\];/, 'le formulaire : tout compte qui peut écrire');
  assert.match(regles, /allow list, create, delete: if false;/);
  assert.match(regles, /affectedKeys\(\)\.hasOnly\(\['nom_espace', 'logo', 'ligne_journal'\]\)/);
  assert.match(regles, /&& identiteMaisonJournalisee\(apres\);/, 'journal obligatoire');
  assert.match(regles, new RegExp(`apres\\.logo\\.size\\(\\) <= ${LOGO_LONGUEUR_MAX}`));
  for (const f of ['js/os/mon-espace-maison.js', 'js/os/shell.js']) assert.ok(!/innerHTML/.test(lire(f)), `${f} : jamais innerHTML`);
  assert.match(lire('js/os/shell.js'), /h\('img', \{ class: 'connexion-logo-maison', src: logoMaison\(\)/);
});

test('3 qui voit le formulaire du nom et du logo : tout compte qui écrit dans une maison de client ; jamais un lecteur, jamais sans compte, jamais chez Jérôme ni sur la plateforme', () => {
  const compte = { email: 'compte2@exemple.test' };
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: true, compte }), false, 'chez Jérôme (public sans nom ni connexion_neutre) : non');
  retenirPublic({ mode_crm: true, nom_espace: 'Espace exemple' });
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: true, compte }), true, 'compte de la maison qui écrit : oui (plus seulement le titulaire)');
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: false, compte }), false, 'lecteur : lecture seule');
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: true, compte: null }), false, 'sans compte : non');
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: true, compte: { email: '  ' } }), false);
  assert.equal(identiteMaisonModifiable({ chezClient: true, editeur: true, compte }), false, 'plateforme des clients : son propre écran Mon espace');
  oublierPublic();
  retenirPublic({ mode_crm: true, connexion_neutre: true });
  assert.equal(identiteMaisonModifiable({ chezClient: false, editeur: true, compte }), true, 'maison neutre sans nom : le nom peut être posé');
});

test('2 le journal d’un changement : qui, quel outil, ancien et nouveau nom ; pour le logo « logo changé » ou « logo retiré », jamais l’image ; rien ne change = aucune écriture', () => {
  const LOGO_A = `data:image/png;base64,${'A'.repeat(500)}`;
  const LOGO_B = `data:image/png;base64,${'B'.repeat(500)}`;
  const base = { acteur: 'compte2@exemple.test', idLigne: 'ligneEssai000001', maintenant: new Date('2026-11-27T10:00:00Z') };
  const p = planIdentiteMaison({ ...base, avant: { mode_crm: true, nom_espace: 'Ancien nom', logo: LOGO_A }, nom: 'Nouveau nom', logo: LOGO_B });
  assert.deepEqual(p.patch, { nom_espace: 'Nouveau nom', ligne_journal: 'ligneEssai000001', logo: LOGO_B });
  assert.equal(p.ligne.acteur, 'compte2@exemple.test');
  assert.equal(p.ligne.via, 'ecran');
  assert.equal(p.ligne.collection, 'reglages_maison');
  assert.equal(p.ligne.docId, 'public');
  assert.equal(p.ligne.action, 'modifier');
  assert.deepEqual(p.ligne.champsModifies, ['nom_espace', 'logo']);
  assert.deepEqual(p.copie.avant, { nom_espace: 'Ancien nom', logo: 'ancien logo' });
  assert.deepEqual(p.copie.apres, { nom_espace: 'Nouveau nom', logo: 'logo changé' });
  assert.ok(p.copie.expireAt instanceof Date);
  const texte = JSON.stringify([p.ligne, p.copie]);
  assert.ok(!texte.includes('data:image') && !texte.includes('AAAA') && !texte.includes('BBBB'), 'jamais l’image dans le journal');
  // Retrait du logo seul : le nom ne change pas, la ligne dit « logo retiré ».
  const r = planIdentiteMaison({ ...base, avant: { nom_espace: 'Même nom', logo: LOGO_A }, nom: 'Même nom', logo: null });
  assert.equal(r.patch.logo, null);
  assert.deepEqual(r.ligne.champsModifies, ['logo']);
  assert.deepEqual(r.copie.apres, { nom_espace: 'Même nom', logo: 'logo retiré' });
  // Nom seul : pas de logo dans la copie.
  const n = planIdentiteMaison({ ...base, avant: { nom_espace: 'A', logo: LOGO_A }, nom: 'B', logo: undefined });
  assert.equal('logo' in n.patch, false);
  assert.deepEqual(n.copie, { ...n.copie, avant: { nom_espace: 'A' }, apres: { nom_espace: 'B' } });
  // Rien ne change (même nom, logo inchangé ou identique, retrait d'un logo absent) : aucune écriture.
  assert.equal(planIdentiteMaison({ ...base, avant: { nom_espace: 'A' }, nom: 'A', logo: undefined }), null);
  assert.equal(planIdentiteMaison({ ...base, avant: { nom_espace: 'A', logo: LOGO_A }, nom: 'A', logo: LOGO_A }), null);
  assert.equal(planIdentiteMaison({ ...base, avant: { nom_espace: 'A' }, nom: 'A', logo: null }), null);
});
