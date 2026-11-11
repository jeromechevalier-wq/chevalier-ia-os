// Import LinkedIn : règles pures (appariement, deux voix, jamais d'écrasement, plans d'écriture). Critères G1 à G5 du cahier, sur une archive FICTIVE.
// Les écritures réelles (journal, émulateur) sont couvertes par le parcours Playwright reseauxsociaux-import.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../js/modules/reseauxsociaux/import-logique.js';
import { lireFichiersUtiles } from '../js/modules/reseauxsociaux/zip.js';
import { archiveFictive, csvMessages, messagesFictifs, csvRelations, csvProfil, PROPRIO, PHRASE_TEMOIN } from './_archive-linkedin-fictive.js';

const texte = (o) => (o ? new TextDecoder().decode(o) : null);
const MAINTENANT = new Date('2026-11-11T12:00:00Z');
const contexte = () => { let n = 0; return { maintenant: MAINTENANT, auteur: 'essai@exemple.test', nouvelId: (c) => `${c}-${++n}` }; };
const lireTout = async (blob = archiveFictive()) => {
  const f = await lireFichiersUtiles(blob, I.FICHIERS_UTILES);
  return I.lireArchive({ messagesCsv: texte(f['messages.csv']), connexionsCsv: texte(f['connections.csv']), profilCsv: texte(f['profile.csv']) });
};
const alice = (extra = {}) => ({ id: 'p-alice', nom: 'Alice Exemple', linkedin: '', emails: [{ valeur: 'alice@exemple.test' }], telephones: [{ valeur: '0100000000' }], ...extra });
const plan = async ({ personnes = [alice()], activites = [], etiquetteId = 'a_classer', archive } = {}) => {
  const a = archive ?? await lireTout();
  return I.construirePlan({ archive: a, proprietaire: I.trouverProprietaire(a.conversations, a.profil), personnes, activites, etiquetteId, fichier: 'export.zip', octets: 1234, empreinte: 'abc' }, contexte());
};
const parCollection = (p, c) => p.ecritures.filter((e) => e.collection === c);
const tousLesTextes = (p) => JSON.stringify(p.ecritures);

test('G1 un zip fictif (2 conversations à deux voix, 1 à une voix, 1 de groupe, 1 relation sans conversation) : 2 activités linkedin, 1 personne rattachée, 1 créée « À classer » source « LinkedIn »', async () => {
  const p = await plan();
  assert.deepEqual(p.resultat, { personnesCreees: 1, personnesRattachees: 1, activitesCreees: 2, ignoreesUneVoix: 1, ignoreesGroupe: 1, ignoreesAmbigues: 0, ignoreesDejaVues: 0, ignoreesSansProfil: 0 });
  assert.deepEqual(p.lu, { connexions: 2, conversations: 4, messages: 8 });
  const activites = parCollection(p, 'crm_activites');
  assert.equal(activites.length, 2);
  for (const a of activites) assert.deepEqual([a.donnees.type, a.donnees.fait, a.donnees.voix], ['linkedin', true, 2]);
  const creees = parCollection(p, 'crm_personnes').filter((e) => e.type === 'creer');
  assert.equal(creees.length, 1);
  assert.equal(creees[0].donnees.nom, 'Bruno Test');
  assert.equal(creees[0].donnees.source, 'LinkedIn');
  assert.deepEqual(creees[0].donnees.etiquettes, ['a_classer']);
  // Adresse de profil écrite en deuxième écriture (nouvellePersonne impose un champ vide), sans « ?… » ni « / » final ; la personne créée est rattachée à son activité.
  const maj = parCollection(p, 'crm_personnes').filter((e) => e.type === 'modifier');
  assert.deepEqual(maj.map((e) => [e.id, e.patch.linkedin]).sort(), [[creees[0].id, 'https://www.linkedin.com/in/bruno-test'], ['p-alice', 'https://www.linkedin.com/in/alice-exemple']].sort());
  assert.ok(activites.some((a) => a.donnees.personneId === creees[0].id));
  // La relation sans conversation (Denis) n'a PAS de fiche.
  assert.ok(!tousLesTextes(p).includes('Denis'));
  // Le document d'import est la DERNIÈRE écriture.
  const dernier = p.ecritures.at(-1);
  assert.equal(dernier.collection, 'reseauxsociaux_imports');
  assert.deepEqual([dernier.donnees.statut, dernier.donnees.fichier, dernier.donnees.octets, dernier.donnees.empreinte], ['termine', 'export.zip', 1234, 'abc']);
  assert.deepEqual(dernier.horodater, ['creeLe']);
  assert.deepEqual(dernier.signer, ['auteur']);
  assert.equal(p.ecritures.filter((e) => e.collection === 'reseauxsociaux_imports').length, 1);
});

test('G1 le sens, le jour (Paris) et l’instant du dernier message viennent de la conversation', async () => {
  const p = await plan();
  const parPersonne = Object.fromEntries(parCollection(p, 'crm_activites').map((a) => [a.donnees.personneId === 'p-alice' ? 'alice' : 'bruno', a.donnees]));
  assert.equal(parPersonne.alice.sens, 'recu');
  assert.equal(parPersonne.alice.date, '2026-11-09');
  assert.equal(parPersonne.alice.dateFait.toISOString(), '2026-11-09T08:15:00.000Z');
  assert.equal(parPersonne.alice.titre, 'Échange LinkedIn : 3 messages, le dernier reçu le 09/11/2026.');
  assert.equal(parPersonne.bruno.sens, 'envoye');
  assert.equal(parPersonne.bruno.date, '2026-10-21');
  assert.equal(parPersonne.bruno.titre, 'Échange LinkedIn : 2 messages, le dernier envoyé le 21/10/2026.');
});

test('G2 aucune donnée existante n’est écrasée : seuls l’activité et le champ LinkedIn VIDE changent', async () => {
  const existante = alice({ linkedin: '', ville: 'Ville Fictive', source: 'Recommandation', etiquettes: ['partenaire'] });
  const p = await plan({ personnes: [existante] });
  const touches = parCollection(p, 'crm_personnes').filter((e) => e.id === 'p-alice');
  assert.equal(touches.length, 1);
  assert.deepEqual(Object.keys(touches[0].patch), ['linkedin'], 'un seul champ modifié, et c’est le champ LinkedIn');
  // Avec un champ LinkedIn déjà rempli : aucune modification de la fiche, l'activité est rattachée quand même.
  const rempli = alice({ linkedin: 'https://www.linkedin.com/in/alice-exemple/' });
  const p2 = await plan({ personnes: [rempli] });
  assert.equal(parCollection(p2, 'crm_personnes').filter((e) => e.id === 'p-alice').length, 0);
  assert.ok(parCollection(p2, 'crm_activites').some((a) => a.donnees.personneId === 'p-alice'));
  assert.equal(p2.resultat.personnesRattachees, 1);
  // Aucun plan ne supprime ni ne remplace une fiche.
  assert.ok(p.ecritures.every((e) => e.type !== 'supprimer'));
});

test('G2 appariement par adresse de profil (forme différente) ; par nom sans adresse ; deux homonymes d’adresses différentes ne se confondent pas', async () => {
  const bruno = { id: 'p-bruno', nom: 'Bruno TEST', linkedin: 'HTTP://WWW.LINKEDIN.COM/IN/Bruno-Test/?x=1' };
  const p = await plan({ personnes: [alice(), bruno] });
  assert.equal(p.resultat.personnesCreees, 0);
  assert.equal(p.resultat.personnesRattachees, 2);
  // Un homonyme qui porte une AUTRE adresse n'est pas retenu : on crée une nouvelle fiche plutôt que de confondre deux personnes.
  const autreBruno = { id: 'p-autre', nom: 'Bruno Test', linkedin: 'https://www.linkedin.com/in/bruno-test-un-autre' };
  const p2 = await plan({ personnes: [alice(), autreBruno] });
  assert.equal(p2.resultat.personnesCreees, 1);
  assert.ok(!parCollection(p2, 'crm_personnes').some((e) => e.id === 'p-autre'));
  // Les fiches de test sont ignorées.
  const p3 = await plan({ personnes: [alice({ test: true })] });
  assert.equal(p3.resultat.personnesRattachees, 0);
});

test('G3 deux candidats pour le même nom : aucune écriture, ignoreesAmbigues = 1', async () => {
  const messages = messagesFictifs().filter((m) => m.conv === 'conv-alice');
  const archive = I.lireArchive({ messagesCsv: csvMessages(messages), profilCsv: csvProfil() });
  const p = await plan({ archive, personnes: [alice(), alice({ id: 'p-alice-2', emails: [] })] });
  assert.equal(p.resultat.ignoreesAmbigues, 1);
  assert.equal(p.resultat.activitesCreees, 0);
  assert.equal(p.ecritures.length, 1, 'seul le document d’import est écrit');
  assert.equal(p.ecritures[0].collection, 'reseauxsociaux_imports');
  // Deux fiches qui portent la même adresse de profil : ambigu aussi.
  const p2 = await plan({ archive, personnes: [alice({ linkedin: 'https://www.linkedin.com/in/alice-exemple' }), alice({ id: 'p2', nom: 'Autre Nom', linkedin: 'https://www.linkedin.com/in/alice-exemple/' })] });
  assert.equal(p2.resultat.ignoreesAmbigues, 1);
});

test('G4 tous les titres d’activité font 200 caractères au plus, ne contiennent aucun nom, et aucun texte de message n’apparaît dans une écriture', async () => {
  const p = await plan();
  for (const a of parCollection(p, 'crm_activites')) {
    assert.ok(a.donnees.titre.length <= I.LIMITE_RESUME_LINKEDIN);
    assert.doesNotMatch(a.donnees.titre, /Alice|Bruno|Olivia/);
  }
  assert.ok(!tousLesTextes(p).includes(PHRASE_TEMOIN), 'la phrase témoin des messages ne doit figurer dans aucune écriture');
  assert.ok(!tousLesTextes(p).includes('Olivia'), 'le nom du propriétaire n’est écrit nulle part');
  // Plafond garanti même pour des valeurs extrêmes.
  assert.ok(I.resumeEchange({ nbMessages: 10 ** 300, sens: 'recu', dernierLe: MAINTENANT }).length <= 200);
  assert.equal(I.resumeEchange({ nbMessages: 1, sens: 'envoye', dernierLe: new Date('2026-11-09T23:30:00Z') }), 'Échange LinkedIn : 1 message, le dernier envoyé le 10/11/2026.');
  // La clé anti-doublon tient dans les 80 caractères du CRM.
  assert.ok(I.cleImport('x'.repeat(5000), 123456).length <= 80);
});

test('G5 relancer le même fichier : refus avec la date ; un zip plus récent aux mêmes conversations ne crée aucune activité en double ; une conversation qui a grandi crée une nouvelle activité', async () => {
  const p1 = await plan();
  const activites = parCollection(p1, 'crm_activites').map((a) => ({ ...a.donnees, id: a.id }));
  // Refus : seul un import `termine` de même empreinte compte, et la date est celle de Paris.
  const imports = [{ id: 'i1', statut: 'termine', empreinte: 'abc', creeLe: new Date('2026-11-10T23:30:00Z') }, { id: 'i2', statut: 'echec', empreinte: 'def', creeLe: new Date('2026-11-01T10:00:00Z') }];
  assert.equal(I.dejaImporte('abc', imports), '11/11/2026');
  assert.equal(I.dejaImporte('def', imports), null, 'un import en échec n’empêche pas la reprise');
  assert.equal(I.dejaImporte('zzz', imports), null);
  // Un zip plus récent (autre empreinte) avec les mêmes conversations : tout est « déjà vu ».
  const personnes = [alice(), { id: 'p-bruno', nom: 'Bruno Test', linkedin: 'https://www.linkedin.com/in/bruno-test' }];
  const p2 = await plan({ personnes, activites });
  assert.equal(p2.resultat.activitesCreees, 0);
  assert.equal(p2.resultat.ignoreesDejaVues, 2);
  assert.equal(p2.ecritures.length, 1);
  // La conversation d'Alice a grandi d'un message : nouvelle activité (rien n'est écrasé), l'autre reste « déjà vue ».
  const messages = [...messagesFictifs(), { conv: 'conv-alice', de: PROPRIO, vers: 'Alice Exemple', date: '2026-11-10 09:00:00 UTC' }];
  const archive = I.lireArchive({ messagesCsv: csvMessages(messages), connexionsCsv: csvRelations(), profilCsv: csvProfil() });
  const p3 = await plan({ personnes, activites, archive });
  assert.equal(p3.resultat.activitesCreees, 1);
  assert.equal(p3.resultat.ignoreesDejaVues, 1);
  assert.match(parCollection(p3, 'crm_activites')[0].donnees.titre, /4 messages, le dernier envoyé le 10\/11\/2026/);
});

test('G5 une personne créée par l’import est retrouvée par un import suivant (aucune fiche en double)', async () => {
  const p1 = await plan();
  const creee = parCollection(p1, 'crm_personnes').find((e) => e.type === 'creer');
  const personnes = [alice(), { ...creee.donnees, id: creee.id, linkedin: 'https://www.linkedin.com/in/bruno-test' }];
  const messages = [...messagesFictifs(), { conv: 'conv-bruno-2', de: 'Bruno Test', urlDe: 'https://www.linkedin.com/in/bruno-test', vers: PROPRIO, date: '2026-11-05 10:00:00 UTC' }, { conv: 'conv-bruno-2', de: PROPRIO, vers: 'Bruno Test', date: '2026-11-05 11:00:00 UTC' }];
  const archive = I.lireArchive({ messagesCsv: csvMessages(messages), profilCsv: csvProfil() });
  const p = await plan({ personnes, archive, activites: [] });
  assert.equal(p.resultat.personnesCreees, 0);
});

test('règle des deux voix : une conversation où une seule personne a écrit n’a ni fiche ni activité ; le dossier spam est ignoré ; un groupe est compté à part', async () => {
  const p = await plan({ personnes: [] });
  assert.equal(p.resultat.ignoreesUneVoix, 1);
  assert.equal(p.resultat.ignoreesGroupe, 1);
  assert.ok(!tousLesTextes(p).includes('Carla'));
  const spam = messagesFictifs().filter((m) => m.conv === 'conv-bruno').map((m) => ({ ...m, dossier: 'SPAM' }));
  const archive = I.lireArchive({ messagesCsv: csvMessages([...messagesFictifs().filter((m) => m.conv === 'conv-alice'), ...spam]), profilCsv: csvProfil() });
  const p2 = await plan({ archive, personnes: [alice()] });
  assert.equal(p2.resultat.ignoreesUneVoix, 1);
  assert.equal(p2.resultat.personnesCreees, 0);
});

test('un interlocuteur sans adresse de profil exploitable (compte supprimé, membre LinkedIn) n’a jamais de fiche ; un nom déjà dans le CRM reste apparié par son nom', async () => {
  const messages = [
    { conv: 'c-sans', de: 'Eva Sansadresse', vers: PROPRIO, date: '2026-11-01 10:00:00 UTC' }, { conv: 'c-sans', de: PROPRIO, vers: 'Eva Sansadresse', date: '2026-11-01 11:00:00 UTC' },
    { conv: 'c-membre', de: 'Membre LinkedIn', urlDe: 'https://www.linkedin.com/in/anonyme', vers: PROPRIO, date: '2026-11-02 10:00:00 UTC' }, { conv: 'c-membre', de: PROPRIO, vers: 'Membre LinkedIn', date: '2026-11-02 11:00:00 UTC' },
    { conv: 'c-existante', de: 'Alice Exemple', vers: PROPRIO, date: '2026-11-03 10:00:00 UTC' }, { conv: 'c-existante', de: PROPRIO, vers: 'Alice Exemple', date: '2026-11-03 11:00:00 UTC' },
  ];
  const archive = I.lireArchive({ messagesCsv: csvMessages(messages), profilCsv: csvProfil() });
  const p = await plan({ archive, personnes: [alice()] });
  assert.equal(p.resultat.ignoreesSansProfil, 2);
  assert.equal(p.resultat.personnesCreees, 0);
  assert.equal(p.resultat.personnesRattachees, 1);
  assert.equal(parCollection(p, 'crm_personnes').filter((e) => e.id === 'p-alice').length, 0, 'sans adresse dans l’archive, le champ LinkedIn n’est pas touché');
});

test('l’adresse de profil d’une relation (Connections.csv) complète un message qui n’en porte pas, si le nom est unique', async () => {
  const messages = [{ conv: 'c-denis', de: 'Denis Exemple', vers: PROPRIO, date: '2026-11-01 10:00:00 UTC' }, { conv: 'c-denis', de: PROPRIO, vers: 'Denis Exemple', date: '2026-11-01 11:00:00 UTC' }];
  const archive = I.lireArchive({ messagesCsv: csvMessages(messages), connexionsCsv: csvRelations(), profilCsv: csvProfil() });
  const p = await plan({ archive, personnes: [] });
  assert.equal(p.resultat.personnesCreees, 1);
  assert.equal(parCollection(p, 'crm_personnes').find((e) => e.type === 'modifier').patch.linkedin, 'https://www.linkedin.com/in/denis-exemple');
  // Deux relations de même nom : on ne devine pas.
  const doublon = `${csvRelations()}\nDenis,Exemple,https://www.linkedin.com/in/denis-exemple-2,,,,`;
  const p2 = await plan({ archive: I.lireArchive({ messagesCsv: csvMessages(messages), connexionsCsv: doublon, profilCsv: csvProfil() }), personnes: [] });
  assert.equal(p2.resultat.ignoreesSansProfil, 1);
});

test('sans étiquette « À classer » (création refusée) : la personne est créée sans étiquette', async () => {
  const p = await plan({ etiquetteId: null });
  assert.deepEqual(parCollection(p, 'crm_personnes').find((e) => e.type === 'creer').donnees.etiquettes, []);
});

test('propriétaire : le nom le plus présent, confirmé par le profil ; sinon « Je n’ai pas reconnu ton profil dans l’archive. »', async () => {
  const a = await lireTout();
  assert.equal(I.trouverProprietaire(a.conversations, a.profil), 'olivia exemple');
  assert.equal(I.trouverProprietaire(a.conversations, null), 'olivia exemple', 'sans profil lisible, le nom le plus fréquent suffit quand il est seul en tête');
  assert.throws(() => I.trouverProprietaire(a.conversations, 'Quelqu’un Dautre'), (e) => /Je n’ai pas reconnu ton profil dans l’archive\./.test(e.message) && e.ecrireEchec === true);
  // Une seule conversation sans profil : égalité, on ne devine pas.
  const une = I.lireArchive({ messagesCsv: csvMessages(messagesFictifs().filter((m) => m.conv === 'conv-alice')) });
  assert.throws(() => I.trouverProprietaire(une.conversations, null), /Je n’ai pas reconnu ton profil/);
  // Le profil lève l'égalité.
  assert.equal(I.trouverProprietaire(une.conversations, PROPRIO), 'olivia exemple');
  assert.throws(() => I.lireArchive({ messagesCsv: undefined }), (e) => /messages\.csv/.test(e.message) && e.ecrireEchec === true);
  assert.throws(() => I.lireArchive({ messagesCsv: 'a,b\n1,2\n' }), /colonnes attendues/);
});

test('adresses de profil : normalisation, adresse écrite, et lien de la boîte mail accepté seulement en https sur linkedin.com', () => {
  assert.equal(I.normaliserProfil('HTTPS://fr.LinkedIn.com/in/Alice-Exemple/?trk=1#x'), 'linkedin.com/in/alice-exemple');
  assert.equal(I.normaliserProfil('https://www.linkedin.com/company/societe'), null);
  assert.equal(I.normaliserProfil('https://exemple.test/in/alice'), null);
  assert.equal(I.adresseProfil('http://fr.linkedin.com/in/Alice-Exemple/?x=1'), 'https://www.linkedin.com/in/Alice-Exemple');
  assert.equal(I.lienLinkedinSur('https://www.linkedin.com/psettings/member-data'), 'https://www.linkedin.com/psettings/member-data');
  assert.equal(I.lienLinkedinSur('https://linkedin.com/x'), 'https://linkedin.com/x');
  for (const mauvais of ['http://www.linkedin.com/x', 'https://linkedin.com.exemple.test/x', 'https://exemple.test/linkedin.com', 'https://evilinkedin.com/x', 'javascript:alert(1)', '', null, 'pas un lien', 'https://user:mdp@www.linkedin.com/x']) assert.equal(I.lienLinkedinSur(mauvais), null, String(mauvais));
});

test('document d’import en échec : une seule écriture, statut echec, message gardé ; historique du plus récent au plus ancien', () => {
  const ctx = contexte();
  const e = I.planEchec({ fichier: 'C:\\Users\\x\\export.zip', octets: 10, empreinte: 'zz', erreur: 'Je n’ai pas reconnu ton profil dans l’archive.' }, ctx).ecritures;
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].donnees.statut, e[0].donnees.fichier, e[0].donnees.erreur], ['echec', 'export.zip', 'Je n’ai pas reconnu ton profil dans l’archive.']);
  const h = I.historiqueImports([{ id: 'a', creeLe: new Date('2026-01-01') }, { id: 'b', creeLe: new Date('2026-03-01') }, { id: 'c' }]);
  assert.deepEqual(h.map((x) => x.id), ['b', 'a', 'c']);
});
