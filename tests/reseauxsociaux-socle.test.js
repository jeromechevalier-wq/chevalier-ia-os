// Module Réseaux sociaux, squelette (nuit du 11/11/2026) : règles pures et tests de texte, sans navigateur ni émulateur.
// Un test par critère du cahier ; le nom commence par son numéro (D1 à D9). Données fictives uniquement (Alice Exemple, exemple.test).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import { LIBELLES_JOURNAL } from '../js/modules/reseauxsociaux/libelles-journal.js';
import { MODULES_DECLARES, IDS_MODULES, moduleDeclare, modulesActifsDuClient, verifierActivation, blocsDuMenu, reglagesDesModules, ongletsDuModule, premiereRoute, interrupteursDuClient } from '../js/os/registre.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const instant = (iso) => new Date(iso);
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

describe('D1 D2 déclaration du module au registre', () => {
  test('D1 le module vient entre Veille et Automatisations, une seule entrée de menu (icône handshake), quatre écrans en onglets', () => {
    const ids = MODULES_DECLARES.map((m) => m.id);
    assert.equal(ids.indexOf('reseauxsociaux'), ids.indexOf('veille') + 1);
    assert.equal(ids.indexOf('automatisations'), ids.indexOf('reseauxsociaux') + 1);
    const m = moduleDeclare('reseauxsociaux');
    assert.deepEqual([m.nom, m.libelleMenu, m.iconeMenu, m.prefixe, m.entreeMenu], ['Réseaux sociaux', 'Réseaux sociaux', 'handshake', 'reseauxsociaux', 'reseauxsociaux/aujourdhui']);
    assert.deepEqual(m.ecrans.map((e) => [e.route, e.libelle, e.icone]), [
      ['reseauxsociaux/aujourdhui', 'Aujourd’hui', 'calendar'], ['reseauxsociaux/posts', 'Posts', 'square-kanban'],
      ['reseauxsociaux/relations', 'Relations', 'users'], ['reseauxsociaux/import', 'Import', 'upload']]);
    assert.deepEqual(ongletsDuModule('reseauxsociaux').map((o) => o.libelle), ['Aujourd’hui', 'Posts', 'Relations', 'Import']);
    const entrees = blocsDuMenu(['reseauxsociaux']).flatMap((b) => b.sections.flat());
    assert.deepEqual(entrees.map((e) => [e.libelle, e.chemin]), [['Réseaux sociaux', 'reseauxsociaux/aujourdhui']]);
    assert.equal(premiereRoute(['reseauxsociaux']), 'reseauxsociaux/aujourdhui');
  });

  test('D1 les icônes du module existent toutes dans la coque (une icône inconnue ne dessine rien)', () => {
    const ui = lire('js/os/ui.js');
    for (const nom of ['handshake', 'calendar', 'square-kanban', 'users', 'upload', 'download', 'external-link', 'refresh-cw', 'chart-column']) assert.ok(ui.includes(`"${nom}":`), nom);
  });

  test('D2 un client avec reseauxsociaux: true voit le module, sans erreur ; sans le champ il ne le voit pas ; aucun autre module exigé', () => {
    assert.deepEqual(modulesActifsDuClient({ modules: { reseauxsociaux: true } }), { actifs: ['reseauxsociaux'], erreurs: [] });
    assert.deepEqual(modulesActifsDuClient({ modules: { veille: true } }).actifs, ['veille']);
    assert.deepEqual(modulesActifsDuClient({ modules: { reseauxsociaux: false } }).actifs, []);
    assert.deepEqual(modulesActifsDuClient({}).actifs, []);
    assert.deepEqual(moduleDeclare('reseauxsociaux').dependances, []);
    assert.equal(moduleDeclare('reseauxsociaux').socle, true);
    assert.equal(verifierActivation(['reseauxsociaux']).ok, true);
    assert.ok(IDS_MODULES.includes('reseauxsociaux'));
  });

  test('D2 un interrupteur « Modules actifs » existe pour le module, éteint par défaut', () => {
    assert.deepEqual(interrupteursDuClient([]).find((l) => l.id === 'reseauxsociaux'), { id: 'reseauxsociaux', libelle: 'Réseaux sociaux', modules: ['reseauxsociaux'], actif: false, complet: false });
  });

  test('D3 les Réglages du module ont une section Sauvegarde ; les deux tables sont déclarées et dans la sauvegarde complète', () => {
    assert.deepEqual(reglagesDesModules(['reseauxsociaux'])[0].sections.map((s) => s.id), ['reglages-export-reseauxsociaux']);
    assert.deepEqual(moduleDeclare('reseauxsociaux').collections, ['reseauxsociaux_posts', 'reseauxsociaux_imports']);
    assert.deepEqual([...R.COLLECTIONS], moduleDeclare('reseauxsociaux').collections);
    const donnees = lire('js/modules/crm/donnees.js');
    for (const nom of R.COLLECTIONS) assert.ok(donnees.includes(`'${nom}'`), nom);
    assert.match(R.nomFichierExportReseauxSociaux(instant('2026-11-17T10:00:00Z')), /^chevalier-ia-reseaux-sociaux-2026-11-17\.json$/);
  });

  test('D3 l\'export lit les deux tables (lecture seule : aucune écriture) et la section existe dans le code', () => {
    const exp = lire('js/modules/reseauxsociaux/export.js');
    assert.ok(exp.includes('reglages-export-reseauxsociaux') && exp.includes('exporter-reseauxsociaux'));
    assert.doesNotMatch(exp, /setDoc|updateDoc|executer|addDoc/);
    const d = lire('js/modules/reseauxsociaux/donnees.js');
    const corps = d.slice(d.indexOf('export async function lireToutPourExport'), d.indexOf('// ----', d.indexOf('export async function lireToutPourExport')));
    assert.match(corps, /R\.COLLECTIONS/);
    assert.doesNotMatch(corps, /setDoc|executer/);
  });
});

describe('D4 lecture de Buffer : cache et messages', () => {
  test('D4 le cache de cinq minutes est appliqué par chargerBuffer (force le contourne, une lecture en cours est partagée, une erreur n\'est pas gardée)', () => {
    assert.equal(R.DUREE_CACHE_BUFFER_MS, 5 * 60 * 1000);
    const d = lire('js/modules/reseauxsociaux/donnees.js');
    const corps = d.slice(d.indexOf('export async function chargerBuffer'));
    assert.match(corps, /if \(enCours\) return enCours;/);
    assert.match(corps, /!force && etat\.buffer\.lueLe && !etat\.buffer\.erreur && maintenant\(\) - derniereLecture < R\.DUREE_CACHE_BUFFER_MS/);
    assert.match(corps, /appeler\(\{ action: 'lirePosts' \}\)/);
    assert.equal((d.match(/httpsCallable\(fonctions\(\), 'reseauxsociauxBuffer'\)/g) || []).length, 1);
    assert.doesNotMatch(d, /mutation|setDoc\(|addDoc\(/); // lecture seule côté Buffer, écritures seulement par executer
  });

  test('D4 messages : refus du serveur montrés tels quels, erreur technique en phrase simple, chez un client « pas branché »', () => {
    const refus = { code: 'functions/failed-precondition', message: 'La clé Buffer est refusée.' };
    assert.equal(R.messageErreurBuffer(refus), 'La clé Buffer est refusée.');
    assert.equal(R.messageErreurBuffer({ code: 'functions/permission-denied', message: 'x' }), 'Ce compte n\'a pas accès à cette action. Se reconnecter si besoin.');
    assert.equal(R.messageErreurBuffer({ code: 'functions/internal', message: 'INTERNAL' }), 'Le serveur ne répond pas pour le moment. Réessayer dans un instant.');
    for (const code of ['functions/not-found', 'functions/internal', 'functions/unavailable', 'functions/permission-denied']) {
      assert.equal(R.messageErreurBuffer({ code, message: 'x' }, true), R.MESSAGE_BUFFER_ABSENT, code);
    }
    assert.equal(R.messageErreurBuffer(refus, true), 'La clé Buffer est refusée.', 'un refus écrit par le serveur reste montré chez un client aussi');
    assert.equal(R.MESSAGE_BUFFER_ABSENT, 'Buffer n’est pas branché sur cet espace.');
  });
});

describe('D5 créneaux de publication', () => {
  const programme = (prevuLe, texte = 'Un post') => ({ id: `p-${prevuLe}`, statut: 'programme', prevuLe, texte });

  test('D5 heure d\'ÉTÉ : jeudi 22/10/2026 04:08 UTC = 6h08 Paris, le créneau est pris', () => {
    const c = R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), [programme('2026-10-22T04:08:00Z')]);
    const jeudi = c.find((x) => x.date === '2026-10-22');
    assert.deepEqual([jeudi.heure, jeudi.post?.id], ['06:08', 'p-2026-10-22T04:08:00Z']);
    assert.equal(c.find((x) => x.date === '2026-10-20').post, null, 'le mardi suivant reste vide');
  });

  test('D5 heure d\'HIVER : mardi 03/11/2026 05:08 UTC = 6h08 Paris, le créneau est pris (le changement d\'heure a eu lieu le 25/10)', () => {
    const c = R.creneauxAVenir(instant('2026-11-02T08:00:00Z'), [programme('2026-11-03T05:08:00Z')]);
    assert.equal(c.find((x) => x.date === '2026-11-03').post?.id, 'p-2026-11-03T05:08:00Z');
    // la règle suit l'heure de Paris, pas une constante UTC : 05:38 UTC fait 7h38 Paris en été (90 min d'écart, pas pris) et 6h38 Paris en hiver (30 min, pris)
    const ete = R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), [programme('2026-10-22T05:38:00Z')]);
    assert.equal(ete.find((x) => x.date === '2026-10-22').post, null);
    const hiver = R.creneauxAVenir(instant('2026-11-02T08:00:00Z'), [programme('2026-11-03T05:38:00Z')]);
    assert.ok(hiver.find((x) => x.date === '2026-11-03').post);
  });

  test('D5 un post à 7h30 Paris ne prend pas le créneau de 6h08 (au-delà de la tolérance de 60 minutes)', () => {
    const c = R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), [programme('2026-10-22T05:30:00Z')]); // 07:30 heure d'été
    assert.equal(c.find((x) => x.date === '2026-10-22').post, null);
  });

  test('D5 seuls les posts programmés ou publiés comptent ; les créneaux sont les mardis et jeudis des 21 prochains jours, passés exclus', () => {
    const posts = [{ id: 'a', statut: 'brouillon', prevuLe: '2026-10-22T04:08:00Z' }, { id: 'b', statut: 'publie', prevuLe: '2026-10-22T04:08:00Z' }];
    const c = R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), posts);
    assert.deepEqual(c.map((x) => x.date), ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05']); // lundi 19 à 10h Paris : les 21 jours vont jusqu'au dimanche 08/11 ; le mardi 10/11 est hors fenêtre
    // créneau déjà passé aujourd'hui : jeudi 22/10 à 9h Paris, le créneau de 6h08 n'est plus listé
    assert.deepEqual(R.creneauxAVenir(instant('2026-10-22T07:00:00Z'), []).map((x) => x.date).slice(0, 2), ['2026-10-27', '2026-10-29']);
  });

  test('D5b la fenêtre par défaut couvre 21 jours : le jeudi 05/11 (17 jours plus tard) est listé, le mardi 10/11 (22 jours) ne l\'est pas ; 14 jours en paramètre coupent avant', () => {
    const dates = R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), []).map((x) => x.date);
    assert.ok(dates.includes('2026-11-05'));
    assert.ok(!dates.includes('2026-11-10'));
    assert.ok(!R.creneauxAVenir(instant('2026-10-19T08:00:00Z'), [], 14).some((x) => x.date === '2026-11-05'));
  });

  test('D5b un post publié sur le créneau le remplit aussi (post non nul) ; un brouillon, jamais', () => {
    // créneau du jeudi 22/10 à 6h08 Paris encore à venir (03:00 UTC = 5h Paris)
    const maintenant = instant('2026-10-22T03:00:00Z');
    const publie = { id: 'pub', statut: 'publie', prevuLe: '2026-10-22T04:08:00Z', publieLe: '2026-10-22T04:08:00Z' };
    const publieSansPrevu = { id: 'pub2', statut: 'publie', publieLe: '2026-10-22T04:09:00Z' };
    const brouillon = { id: 'bro', statut: 'brouillon', prevuLe: '2026-10-22T04:08:00Z' };
    assert.equal(R.creneauxAVenir(maintenant, [publie])[0].post?.id, 'pub');
    assert.equal(R.creneauxAVenir(maintenant, [publieSansPrevu])[0].post?.id, 'pub2');
    assert.equal(R.creneauxAVenir(maintenant, [brouillon])[0].post, null);
  });
});

describe('D6 étape d\'une relation', () => {
  const maintenant = instant('2026-11-12T10:00:00Z'); // jeudi 12/11/2026 à Paris
  const alice = { id: 'alice', nom: 'Alice Exemple', etiquettes: [] };
  const li = (date, extra = {}) => ({ id: `a-${date}-${Object.keys(extra).join('')}`, personneId: 'alice', type: 'linkedin', fait: true, date, dateFait: instant(`${date}T09:00:00Z`), ...extra });
  const etape = (activites, personne = alice) => R.etapeRelation(personne, activites, maintenant);

  test('D6 ligne 1 : un rendez-vous pas encore fait gagne sur tout le reste (Rendez-vous, aucun badge)', () => {
    const r = etape([li('2026-10-20', { sens: 'envoye', voix: 1 }), { personneId: 'alice', type: 'rendez_vous', fait: false, date: '2026-11-20' }]);
    assert.deepEqual(r, { etape: 'rendez_vous', badge: null, jours: null });
  });

  test('D6 ligne 2 : aucune activité LinkedIn faite = À écrire ; une activité non faite et un rendez-vous fait sont ignorés', () => {
    assert.deepEqual(etape([]), { etape: 'a_ecrire', badge: null, jours: null });
    assert.deepEqual(etape([li('2026-11-01', { fait: false })]), { etape: 'a_ecrire', badge: null, jours: null });
    assert.deepEqual(etape([{ personneId: 'alice', type: 'rendez_vous', fait: true, date: '2026-11-01' }]), { etape: 'a_ecrire', badge: null, jours: null });
    assert.deepEqual(etape([{ ...li('2026-11-01', { sens: 'recu', voix: 2 }), personneId: 'bob' }]), { etape: 'a_ecrire', badge: null, jours: null }, 'l\'activité d\'une autre personne ne compte pas');
  });

  test('D6 ligne 3 : les deux ont écrit = En échange, « À répondre » seulement si le dernier message est reçu', () => {
    assert.deepEqual(etape([li('2026-11-02', { sens: 'envoye', voix: 2 }), li('2026-11-09', { sens: 'recu', voix: 2 })]), { etape: 'en_echange', badge: 'repondre', jours: 3 });
    assert.deepEqual(etape([li('2026-11-02', { sens: 'recu', voix: 2 }), li('2026-11-09', { sens: 'envoye', voix: 2 })]), { etape: 'en_echange', badge: null, jours: 3 });
  });

  test('D6 ligne 4 : une seule voix, dernier message reçu = À écrire avec « À répondre »', () => {
    assert.deepEqual(etape([li('2026-11-10', { sens: 'recu', voix: 1 })]), { etape: 'a_ecrire', badge: 'repondre', jours: 2 });
  });

  test('D6 ligne 5 : une seule voix, dernier envoyé = En attente ; « À relancer · N j » dès 7 jours, une seule fois', () => {
    assert.deepEqual(etape([li('2026-11-09', { sens: 'envoye', voix: 1 })]), { etape: 'en_attente', badge: null, jours: 3 });
    assert.deepEqual(etape([li('2026-11-05', { sens: 'envoye', voix: 1 })]), { etape: 'en_attente', badge: 'relancer', jours: 7 });
    assert.deepEqual(etape([li('2026-11-03', { sens: 'envoye', voix: 1 })]), { etape: 'en_attente', badge: 'relancer', jours: 9 });
    // une relance est déjà partie : on laisse respirer, plus de badge
    assert.deepEqual(etape([li('2026-10-20', { sens: 'envoye', voix: 1 }), li('2026-11-03', { sens: 'envoye', voix: 1 })]), { etape: 'en_attente', badge: null, jours: 9 });
  });

  test('D6 une activité saisie à la main, sans sens ni voix, compte « envoyé » à une seule voix (jamais « à deux voix »)', () => {
    assert.deepEqual(etape([li('2026-11-02')]), { etape: 'en_attente', badge: 'relancer', jours: 10 });
  });

  test('D6 « Hors cible » : jamais de « À relancer » ; « À répondre » reste affiché', () => {
    const horsCible = { ...alice, etiquettes: ['hors_cible'] };
    assert.deepEqual(etape([li('2026-11-01', { sens: 'envoye', voix: 1 })], horsCible), { etape: 'en_attente', badge: null, jours: 11 });
    assert.deepEqual(etape([li('2026-11-10', { sens: 'recu', voix: 1 })], horsCible), { etape: 'a_ecrire', badge: 'repondre', jours: 2 });
  });

  test('D6 le calcul suit le jour de l\'échange (date), jamais l\'instant d\'import (dateFait)', () => {
    const importee = { ...li('2026-10-01', { sens: 'envoye', voix: 1 }), dateFait: instant('2026-11-12T08:00:00Z') };
    assert.deepEqual(etape([importee]), { etape: 'en_attente', badge: 'relancer', jours: 42 });
  });

  test('D6 relationsAFaire : seules les personnes à badge, « À répondre » d\'abord, puis les plus anciennes ; archivées et tests écartées', () => {
    const personnes = [alice, { id: 'bob', nom: 'Bob Exemple', etiquettes: [] }, { id: 'carol', nom: 'Carol Exemple', etiquettes: [] }, { id: 'dan', nom: 'Dan Exemple', archive: true }, { id: 'eve', nom: 'Eve Exemple', test: true }];
    const pour = (id, a) => ({ ...a, personneId: id });
    const activites = [
      pour('alice', li('2026-11-01', { sens: 'envoye', voix: 1 })),
      pour('bob', li('2026-11-11', { sens: 'recu', voix: 1 })),
      pour('carol', li('2026-11-10', { sens: 'envoye', voix: 1 })), // 2 jours : pas de badge
      pour('dan', li('2026-11-11', { sens: 'recu', voix: 1 })),
      pour('eve', li('2026-11-11', { sens: 'recu', voix: 1 })),
    ];
    const r = R.relationsAFaire(personnes, activites, maintenant);
    assert.deepEqual(r.map((x) => [x.personne.id, x.badge]), [['bob', 'repondre'], ['alice', 'relancer']]);
    assert.equal(R.libelleBadgeRelation(r[0]), 'À répondre');
    assert.equal(R.libelleBadgeRelation(r[1]), 'À relancer · 11 j');
    assert.deepEqual(R.relationsAFaire([], [], maintenant), []);
  });
});

describe('Classement des posts et catégories (règles pures)', () => {
  test('planClasserPost : création si le document est absent, modification sinon ; jamais le texte ni un chiffre de Buffer', () => {
    const valeurs = { pilier: 'pme', format: 'video', services: ['production', 'inconnu', 'production'], texte: 'ne doit pas passer', impressions: 5 };
    const cree = R.planClasserPost(null, valeurs, { id: 'abc_123-X' }).ecritures;
    assert.equal(cree.length, 1);
    assert.deepEqual([cree[0].type, cree[0].collection, cree[0].id], ['creer', 'reseauxsociaux_posts', 'abc_123-X']);
    assert.deepEqual(cree[0].donnees, { pilier: 'cas_concrets', format: 'video', services: ['production'] });
    assert.deepEqual(cree[0].horodater, ['creeLe', 'modifieLe']);
    const modif = R.planClasserPost({ pilier: 'pedagogie' }, valeurs, { id: 'abc_123-X' }).ecritures[0];
    assert.deepEqual([modif.type, modif.id], ['modifier', 'abc_123-X']);
    assert.deepEqual(modif.patch, { pilier: 'cas_concrets', format: 'video', services: ['production'] });
    assert.deepEqual(modif.horodater, ['modifieLe']);
    assert.deepEqual(R.normaliserClassement({ pilier: 'x', format: 'y', services: 'z' }), { pilier: null, format: null, services: [] });
    for (const mauvais of ['', 'a b', 'a/b', 'x'.repeat(101), null, 12]) assert.throws(() => R.planClasserPost(null, {}, { id: mauvais }), /invalide/, String(mauvais));
  });

  test('les constantes de la ligne éditoriale : quatre piliers dont les parts font 100, créneaux mardi et jeudi', () => {
    assert.deepEqual(R.PILIERS.map((p) => p.id), ['cas_concrets', 'pedagogie', 'actu_ia', 'demarche_offre']);
    assert.deepEqual(R.PILIERS.map((p) => p.cible), [25, 35, 15, 25]);
    assert.deepEqual(R.PILIERS.map((p) => p.libelle), ['Cas concrets', 'Pédagogie et méthodes', 'Actu IA décryptée', 'Ma démarche et mon offre']);
    assert.equal(R.PILIERS.reduce((t, p) => t + p.cible, 0), 100);
    assert.deepEqual(R.FORMATS.map((f) => f.id), ['texte', 'image', 'carrousel', 'animation', 'video']);
    assert.deepEqual(R.SERVICES.map((s) => s.id), ['administratif_rh', 'finance', 'production', 'commercial', 'direction']);
    assert.deepEqual([R.LIMITE_LINKEDIN, R.LIMITE_RESUME_LINKEDIN, R.DELAI_RELANCE_JOURS], [3000, 200, 7]);
    assert.deepEqual(R.CRENEAUX.map((c) => [c.jour, c.heure]), [[2, '06:08'], [4, '06:08']]);
    assert.deepEqual(R.CATEGORIES.map((c) => c.id), ['cible', 'relais', 'hors_cible', 'a_classer', 'partenaire']);
  });

  test('categoriesManquantes : ajoute seulement les noms absents, ne touche jamais une étiquette existante, id comme dans le CRM', () => {
    const existantes = [{ id: 'partenaire', nom: 'Partenaire', couleur: '#b98ee0', ordre: 1 }, { id: 'prospect_chaud', nom: 'Prospect chaud', couleur: '#fd6455', ordre: 2 }];
    const avant = structuredClone(existantes);
    const { items, creees } = R.categoriesManquantes(existantes, R.CATEGORIES.map((c) => c.nom));
    assert.deepEqual(existantes, avant, 'le tableau lu n\'est pas modifié');
    assert.deepEqual(items.slice(0, 2), avant);
    assert.deepEqual(creees.map((c) => [c.id, c.nom, c.ordre]), [['cible', 'Cible', 3], ['relais', 'Relais', 4], ['hors_cible', 'Hors cible', 5], ['a_classer', 'À classer', 6]]);
    assert.equal(items.length, 6);
    assert.ok(creees.every((c) => /^#[0-9a-f]{6}$/i.test(c.couleur)));
    // casse et accents ignorés : « a classer » existe déjà sous un autre id, on ne la recrée pas
    const dejaLa = R.categoriesManquantes([{ id: 'x1', nom: 'a classer', couleur: '#3fbf7f', ordre: 1 }], ['À classer', 'Cible']);
    assert.deepEqual(dejaLa.creees.map((c) => c.nom), ['Cible']);
    // un id déjà pris par une autre étiquette : suffixe _2
    const collision = R.categoriesManquantes([{ id: 'cible', nom: 'Autre chose', couleur: '#3fbf7f', ordre: 1 }], ['Cible']);
    assert.equal(collision.creees[0].id, 'cible_2');
    // rien à ajouter = rien à écrire
    assert.deepEqual(R.categoriesManquantes(items, R.CATEGORIES.map((c) => c.nom)).creees, []);
  });

  test('rappelImport : à partir de 7 jours ou sans import ; seuls les imports terminés comptent', () => {
    const maintenant = instant('2026-11-12T10:00:00Z');
    assert.deepEqual(R.rappelImport([], maintenant), { afficher: true, jours: null });
    assert.deepEqual(R.rappelImport([{ statut: 'echec', creeLe: instant('2026-11-11T10:00:00Z') }], maintenant), { afficher: true, jours: null });
    assert.deepEqual(R.rappelImport([{ statut: 'termine', creeLe: instant('2026-11-10T10:00:00Z') }], maintenant), { afficher: false, jours: 2 });
    assert.deepEqual(R.rappelImport([{ statut: 'termine', creeLe: instant('2026-11-05T10:00:00Z') }, { statut: 'termine', creeLe: instant('2026-10-01T10:00:00Z') }], maintenant), { afficher: true, jours: 7 });
  });

  test('dernierPostPublie, debutTexte, formaterNombre : jamais un zéro inventé', () => {
    const posts = [{ id: '1', statut: 'publie', publieLe: '2026-11-03T05:08:00Z' }, { id: '2', statut: 'publie', publieLe: '2026-11-10T05:08:00Z' }, { id: '3', statut: 'programme', prevuLe: '2026-11-17T05:08:00Z' }];
    assert.equal(R.dernierPostPublie(posts).id, '2');
    assert.equal(R.dernierPostPublie([posts[2]]), null);
    assert.equal(R.debutTexte('  Un   texte\n sur plusieurs lignes  ', 40), 'Un texte sur plusieurs lignes');
    assert.equal(R.debutTexte('a'.repeat(60), 10).length, 10);
    assert.ok(R.debutTexte('a'.repeat(60), 10).endsWith('…'));
    assert.equal(R.formaterNombre(null), '—');
    assert.equal(R.formaterNombre(undefined), '—');
    assert.equal(R.formaterNombre(0), '0');
    assert.match(R.formaterNombre(1240), /^1\s240$/);
    assert.equal(R.libelleJour('2026-10-22'), 'jeudi 22 octobre');
  });
});

describe('D8 journal : libellés des tables du module', () => {
  test('D8 le `demarrer` du module déclare les libellés au Journal commun, et ils nomment « classement de post »', () => {
    const index = lire('js/modules/reseauxsociaux/index.js');
    assert.match(index, /import \{ declarerLibellesJournal \} from '\.\.\/\.\.\/os\/journal\.js';/);
    const demarrer = index.slice(index.indexOf('export function demarrer'), index.indexOf('export function arreter'));
    assert.match(demarrer, /declarerLibellesJournal\(LIBELLES_JOURNAL\)/);
    assert.deepEqual(LIBELLES_JOURNAL.reseauxsociaux_posts, ['classement de post', 'classements de post']);
    assert.deepEqual(LIBELLES_JOURNAL.reseauxsociaux_imports, ['import LinkedIn', 'imports LinkedIn']);
    assert.match(lire('js/os/journal.js'), /export function declarerLibellesJournal/);
  });
});

describe('Catégories : creerCategories (source)', () => {
  const d = sansCommentaires(lire('js/modules/reseauxsociaux/donnees.js'));
  const corps = d.slice(d.indexOf('export async function creerCategories'), d.indexOf('// ----', d.indexOf('export async function creerCategories')));

  test('creerCategories relit le document FRAIS, refuse sans document, écrit en UN SEUL executer, jamais par creerEtiquette ni setDoc', () => {
    assert.match(corps, /getDoc\(doc\(db, chemin\('crm_parametres'\), 'etiquettes'\)\)/);
    assert.match(corps, /if \(!d\.exists\(\) \|\| !Array\.isArray\(d\.data\(\)\.items\)\) throw new Error\('Ouvre une fois Affaires pour préparer les catégories\.'\)/);
    assert.equal((corps.match(/executer\(/g) || []).length, 1, 'un seul executer');
    assert.match(corps, /if \(creees\.length\) await executer\(/);
    assert.doesNotMatch(d, /creerEtiquette|enregistrerEtiquettes|majParametre|setDoc/);
    assert.match(corps, /L\.ecritureModifier\('crm_parametres', 'etiquettes', \{ items \}\)/);
  });

  test('le module ne lit jamais les activités ni les étiquettes de l\'état du CRM (vides quand Affaires est éteint) : il écoute les siennes', () => {
    for (const f of ['donnees.js', 'aujourdhui.js', 'commun.js', 'index.js']) {
      assert.doesNotMatch(sansCommentaires(lire(`js/modules/reseauxsociaux/${f}`)), /etatCrm\.(activites|etiquettes)\b|CRM\.etat\.(activites|etiquettes)\b/, f);
    }
    assert.match(d, /where\('type', '==', 'linkedin'\)/);
    assert.match(d, /where\('type', '==', 'rendez_vous'\)/);
    assert.doesNotMatch(d, /orderBy|limit\(/);
  });
});

describe('D9 la fiche « Créer un module »', () => {
  const fiche = lire('docs/creer-un-module.md');

  test('D9 la fiche existe, est dans le sommaire du wiki et sa page est générée', () => {
    assert.ok(existsSync(join(RACINE, 'docs/creer-un-module.md')));
    assert.ok(JSON.parse(lire('scripts/wiki/sommaire.json')).rubriques.some((r) => r.pages.includes('creer-un-module')));
    assert.ok(existsSync(join(RACINE, 'wiki/creer-un-module.html')));
    assert.match(fiche, /^# Créer un module/m);
  });

  test('D9 chaque chemin:ligne cité par la fiche existe (fichier présent, ligne dans le fichier)', () => {
    const cites = [...fiche.matchAll(/`((?:[\w.-]+\/)*[\w.-]+\.(?:js|md|json|rules|css)):(\d+)(?:`| à `[^`]+:(\d+))/g)];
    assert.ok(cites.length >= 25, `trop peu de citations (${cites.length})`);
    for (const [, fichier, ligne] of cites) {
      assert.ok(existsSync(join(RACINE, fichier)), `fichier cité introuvable : ${fichier}`);
      assert.ok(lire(fichier).split('\n').length >= Number(ligne), `${fichier}:${ligne} dépasse la fin du fichier`);
    }
  });

  test('D9 chaque fichier cité sans numéro de ligne existe aussi', () => {
    for (const [, fichier] of fiche.matchAll(/`((?:js|css|docs|tests|scripts|functions|functions-plateforme)\/[\w./-]+\.(?:js|md|json|css))`/g)) {
      if (fichier.includes('<') || fichier.includes('*')) continue;
      assert.ok(existsSync(join(RACINE, fichier)), `fichier cité introuvable : ${fichier}`);
    }
  });

  test('D9 les tables du module sont dans docs/tables.md et le module dans docs/activer-desactiver-modules.md', () => {
    assert.match(lire('docs/tables.md'), /\| Réseaux sociaux \| `reseauxsociaux_posts`.*`reseauxsociaux_imports`/);
    assert.match(lire('docs/activer-desactiver-modules.md'), /\| `reseauxsociaux` \| « Réseaux sociaux »/);
  });
});

describe('Règles de l\'interface : textes visibles', () => {
  test('aucun texte du module ne cite « CRM » ni un nom propre de Jérôme', () => {
    for (const f of ['aujourdhui.js', 'commun.js', 'export.js', 'posts-ecran.js', 'relations-ecran.js', 'import-ecran.js']) {
      const src = lire(`js/modules/reseauxsociaux/${f}`).replace(/\/\/.*$/gm, ''); // sans les commentaires
      // On ne regarde que les chaînes entre quotes qui ressemblent à une phrase visible.
      for (const [, texte] of src.matchAll(/'([^'\n]{12,})'/g)) assert.doesNotMatch(texte, /\bCRM\b|de Jérôme|Jérôme/, `${f} : ${texte}`);
    }
  });

  test('un seul bouton jaune par écran : l\'écran Aujourd\'hui n\'a que « Ouvrir Buffer » en bouton principal', () => {
    const a = lire('js/modules/reseauxsociaux/aujourdhui.js');
    assert.equal((a.match(/bouton-principal/g) || []).length, 0, 'aucun jaune posé à la main');
    assert.equal((a.match(/lienBuffer\(\)/g) || []).length, 1);
    const c = lire('js/modules/reseauxsociaux/commun.js');
    assert.match(c, /principal \? 'bouton-principal' : 'bouton-secondaire'/);
    assert.match(c, /rel: 'noopener noreferrer'/);
  });
});
