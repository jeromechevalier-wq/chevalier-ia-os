// Page Réglages > Déploiement : la logique pure (js/os/deploiement.js) et les lignes des modules (js/modules/crm/deploiement.js, js/modules/devis/deploiement.js).
// Aucun navigateur, aucun réseau. Les noms de test commencent par le numéro du critère d'acceptation (voir la PR).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ETAPES_COQUE, MOMENTS, adapterEtapes, DOCUMENT_COCHES, problemesEtapes, etapesVisibles, lireCoches, patchCoche, dateJour, dateLisible, resultatsDesControles,
  couleurEtape, etatGlobal, resume, lienEtape, calculerPage, attendreQue,
} from '../js/os/deploiement.js';
import { ETAPES_DEPLOIEMENT_AFFAIRES, controlerDeploiementAffaires } from '../js/modules/crm/deploiement.js';
import { ETAPES_DEPLOIEMENT_DEVIS, controlerDeploiementDevis, etatEntreprise, etatEtapeDevis, etatCatalogue } from '../js/modules/devis/deploiement.js';

const TOUTES = [...ETAPES_COQUE, ...ETAPES_DEPLOIEMENT_AFFAIRES, ...ETAPES_DEPLOIEMENT_DEVIS];
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ENTREPRISE_COMPLETE = { nom: 'Entreprise Essai', siret: '12345678900011', adresse: { ligne1: '1 rue de l’Essai', codePostal: '75001', ville: 'Paris' }, telephone: '0100000000', assurance: { garantie: 'Décennale', assureur: 'Assureur Essai' }, mediateur: { nom: 'Médiateur Essai', site: 'https://mediateur.exemple' } };

describe('Déploiement : définition des étapes (écrite dans le code)', () => {
  test('1 chaque étape (coque, Affaires, Devis) a un identifiant unique, un moment connu, un type, un libellé, une phrase de réparation et un lien https ou une route de l’appli', () => {
    assert.deepEqual(problemesEtapes(TOUTES), []);
    assert.deepEqual(MOMENTS.map((m) => m.libelle), ['Avant la séance', 'Pendant la séance', 'Réglages Google du projet', 'Après la séance']);
    assert.ok(problemesEtapes([{ id: 'x', groupe: 'nulle-part', type: 'auto', libelle: 'a', reparation: 'b', lien: 'http://exemple' }]).length >= 2, 'un moment inconnu et un lien http sont refusés');
  });
  test('1 aucune étape ne parle de « CRM » ni ne contient d’adresse e-mail, de clé ou de nom de client ; les liens de console ne nomment pas le projet en dur', () => {
    const texte = JSON.stringify(TOUTES);
    assert.doesNotMatch(texte, /CRM/);
    assert.doesNotMatch(JSON.stringify(TOUTES.map((e) => [e.libelle, e.reparation])), /Jérôme|Terminal|node scripts|dépôt|du client|au client/, 'textes écrits pour tout éditeur de l’espace, jamais du point de vue de Jérôme');
    assert.doesNotMatch(texte, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/, 'aucune adresse e-mail');
    assert.doesNotMatch(texte, /AIza[0-9A-Za-z_-]{20,}|cia_[A-Za-z0-9_-]{20,}|cle-[a-z]+\.[a-z]+\./, 'aucune clé');
    for (const e of TOUTES.filter((x) => /console\.cloud\.google\.com/.test(x.lien ?? ''))) assert.match(e.lien, /\{projet\}/, e.id);
    assert.equal(lienEtape({ lien: 'https://console.cloud.google.com/x?project={projet}' }, { projet: 'chevalier-ia-app' }), 'https://console.cloud.google.com/x?project=chevalier-ia-app');
  });
  test('1 l’accès « devisPdf au dossier Drive » n’est plus une étape (le PDF est rangé dans Cloud Storage, plus aucune copie dans Drive)', () => {
    assert.ok(!TOUTES.filter((e) => e.id !== 'pdf-fonctions').some((e) => /devisPdf|compte de service/i.test(`${e.libelle} ${e.reparation}`)));
  });
  test('J Devis : les lignes « stockage des PDF » et « fonctions du PDF » sont des contrôles du serveur, avec une phrase pour réparer et le mode d’emploi du PDF', () => {
    for (const id of ['pdf-stockage', 'pdf-fonctions']) {
      const e = ETAPES_DEPLOIEMENT_DEVIS.find((x) => x.id === id);
      assert.equal(e.module, 'devis'); assert.equal(e.type, 'auto'); assert.equal(e.controle, `serveur.${id}`);
      assert.match(e.lien, /pdf-clients\.md$/);
    }
    assert.deepEqual(problemesEtapes(TOUTES), []);
    const r = resultatsDesControles(TOUTES, { serveur: { controles: { fonctions: 'ok', 'pdf-stockage': 'manque' } } });
    assert.equal(r['pdf-stockage'], 'manque');
    assert.equal(r['pdf-fonctions'], 'inconnu', 'un serveur plus ancien ne connaît pas la ligne : orange, jamais vert');
  });
  test('1 le contrôle d’une ligne automatique de la coque vient du serveur ; les étapes « Préparer l’e-mail », MCP et règles sont manuelles', () => {
    for (const e of ETAPES_COQUE.filter((x) => x.type === 'auto')) assert.match(e.controle, /^serveur\.(fonctions|membres|pdf-stockage|pdf-fonctions)$/, e.id);
    for (const id of ['devis-preparer-email', 'regles-a-jour', 'mcp']) assert.equal(TOUTES.find((e) => e.id === id).type, 'manuel', id);
  });
});

describe('Déploiement : étapes conditionnelles par module', () => {
  test('9 à la racine, « Personnes autorisées » est une case à cocher (les comptes sont dans le code) ; chez un client, un contrôle automatique', () => {
    const racine = adapterEtapes(ETAPES_COQUE, { racine: true }).find((e) => e.id === 'membres');
    assert.equal(racine.type, 'manuel');
    assert.equal(racine.controle, undefined);
    assert.match(racine.reparation, /fixés dans le code/);
    assert.deepEqual(problemesEtapes(adapterEtapes(TOUTES, { racine: true })), []);
    const client = adapterEtapes(ETAPES_COQUE, { racine: false }).find((e) => e.id === 'membres');
    assert.equal(client.type, 'auto');
    assert.equal(client.controle, 'serveur.membres');
    const p = calculerPage({ etapes: adapterEtapes(TOUTES, { racine: true }), actifs: ['affaires', 'devis'], resultats: resultatsDesControles(adapterEtapes(TOUTES, { racine: true }), { serveur: { controles: { fonctions: 'ok', membres: 'ok' } } }) });
    assert.equal(p.groupes.flatMap((g) => g.lignes).find((l) => l.etape.id === 'membres').couleur, 'gris');
  });
  test('9 une ligne de module n’existe que si ce module est actif ; les lignes de la coque restent toujours', () => {
    const ids = (actifs) => etapesVisibles(TOUTES, actifs).map((e) => e.id);
    const sansModule = ids([]);
    assert.deepEqual(sansModule, ETAPES_COQUE.map((e) => e.id));
    assert.ok(ids(['affaires']).includes('dossier-drive'));
    assert.ok(!ids(['affaires']).includes('devis-entreprise'));
    assert.ok(ids(['affaires', 'devis']).includes('devis-entreprise'));
    assert.ok(!ids(['devis']).includes('dossier-drive'), 'Devis seul (cas impossible, mais la règle reste) : pas la ligne Drive des Affaires');
  });
  test('7 cas vide : un espace dont aucun module n’ajoute de ligne est « vide » (message à l’écran), et garde les étapes communes', () => {
    const p = calculerPage({ etapes: TOUTES, actifs: ['veille'] });
    assert.equal(p.vide, true);
    assert.equal(p.resume.total, ETAPES_COQUE.length);
    assert.equal(calculerPage({ etapes: TOUTES, actifs: ['affaires'] }).vide, false);
  });
});

describe('Déploiement : couleurs, état global, résumé, regroupement', () => {
  test('2 auto : ok = vert, manque = rouge, inconnu ou absent = orange ; manuel : cochée = vert, sinon gris', () => {
    const auto = { id: 'a', type: 'auto' };
    const manuel = { id: 'm', type: 'manuel' };
    assert.equal(couleurEtape(auto, { resultats: { a: 'ok' } }), 'vert');
    assert.equal(couleurEtape(auto, { resultats: { a: 'manque' } }), 'rouge');
    assert.equal(couleurEtape(auto, { resultats: { a: 'inconnu' } }), 'orange');
    assert.equal(couleurEtape(auto, {}), 'orange');
    assert.equal(couleurEtape(manuel, { coches: { m: { fait: true } } }), 'vert');
    assert.equal(couleurEtape(manuel, {}), 'gris');
  });
  test('2 état global : rouge > orange > gris > vert ; aucune ligne = gris', () => {
    assert.equal(etatGlobal(['vert', 'gris', 'rouge', 'orange']), 'rouge');
    assert.equal(etatGlobal(['vert', 'gris', 'orange']), 'orange');
    assert.equal(etatGlobal(['vert', 'gris']), 'gris');
    assert.equal(etatGlobal(['vert', 'vert']), 'vert');
    assert.equal(etatGlobal([]), 'gris');
  });
  test('2 résumé « 11 sur 14 vertes » : les manuelles cochées comptent vertes, l’inconnu compte orange', () => {
    const r = resume([...Array(11).fill('vert'), 'orange', 'rouge', 'gris']);
    assert.equal(r.texte, '11 sur 14 vertes');
    assert.deepEqual([r.oranges, r.rouges, r.gris], [1, 1, 1]);
    assert.equal(resume(['vert', 'gris']).texte, '1 sur 2 verte');
    const p = calculerPage({ etapes: TOUTES, actifs: ['affaires', 'devis'], resultats: { 'fonctions-serveur': 'ok' }, coches: { bienvenue: { fait: true, le: '2026-10-25' } } });
    assert.equal(p.resume.verts, 2);
  });
  test('2 regroupement par moment, dans l’ordre Avant / Pendant / Réglages Google / Après ; un moment sans ligne disparaît ; une manuelle cochée dit « Fait le … »', () => {
    const p = calculerPage({ etapes: TOUTES, actifs: ['affaires', 'devis'], coches: { bienvenue: { fait: true, le: '2026-10-25' } } });
    assert.deepEqual(p.groupes.map((g) => g.id), ['avant', 'pendant', 'google', 'apres']);
    const bienvenue = p.groupes.find((g) => g.id === 'pendant').lignes.find((l) => l.etape.id === 'bienvenue');
    assert.equal(bienvenue.texte, 'Fait le 25/10/2026');
    const sansGoogle = calculerPage({ etapes: ETAPES_COQUE, actifs: [] });
    assert.ok(!sansGoogle.groupes.some((g) => g.id === 'google'));
  });
  test('2 une valeur venue du serveur ou d’un module n’est jamais reprise telle quelle : seulement ok, manque ou inconnu', () => {
    const r = resultatsDesControles(TOUTES, { serveur: { controles: { fonctions: 'ok', membres: '<script>' } }, modules: { 'devis-catalogue': 'manque', 'dossier-drive': { id: 'secret' } } });
    assert.equal(r['fonctions-serveur'], 'ok');
    assert.equal(r.membres, 'inconnu');
    assert.equal(r['devis-catalogue'], 'manque');
    assert.equal(r['dossier-drive'], 'inconnu');
    const sansServeur = resultatsDesControles(ETAPES_COQUE, { serveur: null });
    assert.deepEqual(Object.values(sansServeur), ['inconnu', 'inconnu'], 'serveur injoignable : ses lignes en orange');
  });
});

describe('Déploiement : cases « C’est fait »', () => {
  test('4 on n’enregistre que { fait: true, le: AAAA-MM-JJ }, dans crm_parametres/deploiement ; la lecture ignore tout le reste', () => {
    assert.deepEqual(DOCUMENT_COCHES, { collection: 'crm_parametres', id: 'deploiement' });
    assert.deepEqual(patchCoche('bienvenue', new Date(2026, 9, 25, 23, 50)), { bienvenue: { fait: true, le: '2026-10-25' } });
    const lu = lireCoches({ bienvenue: { fait: true, le: '2026-10-25', auteur: 'x@y.z' }, 'fonctions-serveur': { fait: true }, inconnue: { fait: true }, mcp: { fait: false }, raccourci: { fait: true, le: 'hier' } }, TOUTES);
    assert.deepEqual(lu, { bienvenue: { fait: true, le: '2026-10-25' }, raccourci: { fait: true, le: null } }, 'pas de case sur une ligne automatique, pas de champ en plus');
    assert.equal(dateJour(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(dateLisible('2026-10-25'), '25/10/2026');
    assert.equal(dateLisible('n’importe quoi'), '');
  });
});

describe('Déploiement : contrôles des modules (sans réseau)', () => {
  test('3 Affaires : dossier Drive racine choisi = vert, absent = rouge, réglages pas encore lus = orange ; ni l’identifiant ni le nom ne sortent', () => {
    assert.deepEqual(controlerDeploiementAffaires({ reglages: { dossierParentDrive: { id: 'id-dossier', nom: 'Projets' } } }), { 'dossier-drive': 'ok' });
    assert.deepEqual(controlerDeploiementAffaires({ reglages: { dossierParentDrive: null } }), { 'dossier-drive': 'manque' });
    assert.deepEqual(controlerDeploiementAffaires({ pret: false }), { 'dossier-drive': 'inconnu' });
    assert.doesNotMatch(JSON.stringify(controlerDeploiementAffaires({ reglages: { dossierParentDrive: { id: 'id-dossier', nom: 'Projets' } } })), /id-dossier|Projets/);
  });
  test('3 Devis : « Mon entreprise » complète = même calcul que le point rouge ; étape des devis réglée ET existante ; catalogue avec un article actif', () => {
    assert.equal(etatEntreprise({ entreprise: ENTREPRISE_COMPLETE }), 'ok');
    assert.equal(etatEntreprise({ entreprise: { nom: 'Seulement un nom' } }), 'manque');
    assert.equal(etatEtapeDevis({ etapeDevis: 'devis' }, ['devis', 'gagne']), 'ok');
    assert.equal(etatEtapeDevis({ etapeDevis: '' }, ['devis']), 'manque');
    assert.equal(etatEtapeDevis({ etapeDevis: 'disparue' }, ['devis']), 'manque');
    assert.equal(etatCatalogue([{ actif: false }]), 'manque');
    assert.equal(etatCatalogue([{ actif: false }, { libelle: 'x' }]), 'ok');
    assert.equal(controlerDeploiementDevis({ reglages: {}, etapesIds: [], articles: [], erreurArticles: true })['devis-catalogue'], 'inconnu', 'catalogue illisible : on ne sait pas');
  });
  test('3 plus d’étape « CORS » : le contrôle du site ne lit plus le stockage, et les trois lignes automatiques restantes sont inchangées', () => {
    assert.ok(!TOUTES.some((e) => e.id === 'devis-cors' || /CORS/.test(`${e.libelle} ${e.reparation}`)));
    assert.deepEqual(Object.keys(controlerDeploiementDevis({ pret: false })), ['devis-entreprise', 'devis-etape', 'devis-catalogue']);
    assert.deepEqual(Object.keys(controlerDeploiementDevis({ reglages: {}, etapesIds: [], articles: [{}] })), ['devis-entreprise', 'devis-etape', 'devis-catalogue']);
  });
  test('4 le libellé et la réparation de l’essai de bout en bout ne parlent plus de Drive', () => {
    const essai = TOUTES.find((e) => e.id === 'devis-essai');
    assert.equal(essai.libelle, 'Essai de bout en bout d’un devis (PDF, e-mail, Envoyé)');
    assert.match(essai.reparation, /ouvre son PDF depuis l’onglet Devis de l’affaire/);
    assert.doesNotMatch(`${essai.libelle} ${essai.reparation}`, /Drive/);
  });
  test('10 un contrôle qui plante vaut « inconnu » et n’empêche pas les autres', () => {
    const piege = { get entreprise() { throw new Error('boum'); }, etapeDevis: 'devis' };
    const r = controlerDeploiementDevis({ reglages: piege, etapesIds: ['devis'], articles: [{}] });
    assert.equal(r['devis-entreprise'], 'inconnu');
    assert.equal(r['devis-catalogue'], 'ok');
  });
  test('10 attendreQue : vrai dès que la condition le devient, faux après le délai, sans jamais lever d’erreur', async () => {
    let pret = false;
    let rappel = null;
    const promesse = attendreQue(() => pret, (r) => { rappel = r; return () => { rappel = null; }; }, 1000);
    pret = true; rappel();
    assert.equal(await promesse, true);
    assert.equal(rappel, null, 'désabonné');
    assert.equal(await attendreQue(() => false, null, 20), false);
    assert.equal(await attendreQue(() => { throw new Error('x'); }, null, 20), false);
  });
});

describe('Déploiement : la coque ne connaît aucun module', () => {
  test('9 js/os/deploiement.js et js/os/deploiement-ecran.js n’importent rien de js/modules et ne citent aucun module par son nom', () => {
    for (const f of ['js/os/deploiement.js', 'js/os/deploiement-ecran.js']) {
      const source = lire(f).replace(/^\s*\/\/.*$/gm, '');
      assert.doesNotMatch(source, /modules\//, f);
      for (const mot of ['crm', 'projets', 'affaires', 'devis', 'veille', 'automatisations']) assert.doesNotMatch(source, new RegExp(`['"\`]${mot}['"\`]`), `${f} : ${mot}`);
    }
    for (const f of ['js/modules/crm/index.js', 'js/modules/devis/index.js']) assert.match(lire(f), /export function controlesDeploiement\(\)/, f);
  });
});
