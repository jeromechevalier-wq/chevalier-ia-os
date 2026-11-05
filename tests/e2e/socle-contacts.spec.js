// Socle commun (noyau Contacts), PR A : `CRM.demarrer(compte, base, { noyau: true })` n'écoute que les personnes et les organisations.
// Un test par point, le nom commence par son numéro. Captures dans tests/e2e/captures/socle/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, listerDocuments, lireDocument, creerPersonne, creerOrganisation, creerAffaire,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/socle/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const CRM = '/js/modules/crm/donnees.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function semer() {
  await creerOrganisation('o1', { nom: 'Atelier Cent' });
  await creerPersonne('p1', { nom: 'Paul Cent', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'Devis 100 €', organisationId: 'o1' });
}
/** Appelle une fonction de la couche de données du CRM (celle que l'appli utilise : même module, même instance). */
const appeler = (page, fonction, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [CRM, fonction, args]);
/** Garde le compte connecté dans la page (arreter() le remet à null). */
const retenirCompte = (page) => page.evaluate(async (m) => { window.__compteSocle = (await import(m)).compteCourant(); }, CRM);
/** Redémarre en mode donné et attend que tout ce qui est démarré soit prêt ; renvoie l'état utile. */
const demarrer = (page, options, { arreter = true } = {}) => page.evaluate(async ([m, o, a]) => {
  const D = await import(m);
  if (a) D.arreter();
  D.demarrer(window.__compteSocle, '', o);
  await new Promise((ok) => { if (D.estPret()) ok(); else { const fin = D.surChangement(() => { if (D.estPret()) { fin(); ok(); } }); } });
}, [CRM, options, arreter]);
const lireEtat = (page) => page.evaluate(async (m) => {
  const D = await import(m);
  const L = await import('/js/modules/crm/logique.js');
  return {
    pret: { ...D.etat.pret }, noyau: D.estNoyau(), ecoutes: D.ecoutesDemarrees(), personnes: D.etat.personnes.map((x) => x.id), organisations: D.etat.organisations.map((x) => x.id),
    affaires: D.etat.affaires.map((x) => x.id), offres: D.etat.offres.length, configNeutre: D.etat.config === L.CONFIG_NEUTRE, etapes: D.etat.config.etapes.length,
  };
}, CRM);
const rendreLeComplet = (page) => page.evaluate(async ([m]) => { const D = await import(m); D.arreter(); D.demarrer(window.__compteSocle, ''); }, [CRM]);
const attendre = async (collection, predicat) => {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
};

test('1 le socle seul démarre sans Affaires : deux écouteurs, prêt, rien d\'autre lu', async ({ page }, info) => {
  await semer();
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  const e = await lireEtat(page);
  expect(e.pret).toEqual({ personnes: true, organisations: true, affaires: false, activites: false, parametres: false });
  expect(e.noyau).toBe(true);
  expect(e.ecoutes).toEqual(['personnes', 'organisations']);
  expect(e.personnes).toEqual(['p1']);
  expect(e.organisations).toEqual(['o1']);
  expect(e.affaires).toHaveLength(0);
  expect(e.offres).toBe(0);
  expect(e.configNeutre).toBe(true);
  await capturer(page, info, '1-socle-seul');
  await rendreLeComplet(page);
});

test('2 écrire sur le socle seul passe par le vrai journal', async ({ page }, info) => {
  await semer();
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  const id = await appeler(page, 'creerPersonne', { nom: 'Marie Cent', organisationId: 'o1' });
  expect((await lireDocument(`crm_personnes/${id}`)).nom).toBe('Marie Cent');
  const ligne = await attendre('crm_audit', (l) => l.docId === id);
  expect(ligne).toMatchObject({ outil: 'creerPersonne', collection: 'crm_personnes', docId: id, action: 'creer', via: 'ecran' });
  await attendre('crm_audit_avant', (l) => l.docId === id);
  const evt = await attendre('crm_evenements', (l) => l.type === 'personne_creee');
  expect(evt.personneId).toBe(id);
  expect((await lireEtat(page)).personnes).toContain(id);
  await capturer(page, info, '2-ecriture-socle');
  await rendreLeComplet(page);
});

test('3 le CRM complet démarre par-dessus le socle : mêmes fiches, cinq écouteurs, sans doublon', async ({ page }, info) => {
  await semer();
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  await demarrer(page, {}, { arreter: false });
  const e = await lireEtat(page);
  expect(e.pret).toEqual({ personnes: true, organisations: true, affaires: true, activites: true, parametres: true });
  expect(e.ecoutes).toEqual(['personnes', 'organisations', 'affaires', 'activites', 'parametres']);
  expect(e.noyau).toBe(false);
  expect(e.personnes).toContain('p1');
  expect(e.affaires).toEqual(['a1']);
  expect(e.etapes).toBeGreaterThan(0);
  await demarrer(page, { noyau: true }, { arreter: false });
  expect((await lireEtat(page)).ecoutes).toEqual(['personnes', 'organisations', 'affaires', 'activites', 'parametres']);
  await capturer(page, info, '3-par-dessus');
  await rendreLeComplet(page);
});

test('5 cas d\'erreur : supprimer une fiche sur le socle seul est refusé proprement', async ({ page }, info) => {
  await semer();
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  const refus = (fonction, ...args) => page.evaluate(async ([m, f, a]) => { try { await (await import(m))[f](...a); return null; } catch (e) { return e.message; } }, [CRM, fonction, args]);
  const message = 'Supprimer une fiche demande le module Affaires';
  expect(await refus('supprimerPersonne', 'p1', 'conserver')).toContain(message);
  expect((await lireDocument('crm_personnes/p1')).nom).toBe('Paul Cent');
  expect(await refus('supprimerOrganisation', 'o1')).toContain(message);
  expect(await lireDocument('crm_organisations/o1')).not.toBeNull();
  await capturer(page, info, '5-suppression-refusee');
  await demarrer(page, {}, { arreter: false });
  const apres = await refus('supprimerOrganisation', 'o1');
  expect(apres).toBeTruthy();
  expect(apres).not.toContain(message);
  expect(await lireDocument('crm_organisations/o1')).not.toBeNull();
  await rendreLeComplet(page);
});

test('6 cas vide : un espace sans aucune fiche', async ({ page }, info) => {
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  const e = await lireEtat(page);
  expect(e.ecoutes).toEqual(['personnes', 'organisations']);
  expect(e.personnes).toEqual([]);
  expect(e.organisations).toEqual([]);
  expect(e.pret.personnes && e.pret.organisations).toBe(true);
  // Le socle n'écrit jamais de paramètres : il n'y en avait pas avant (l'écran complet n'a pas encore tourné), il n'y en a pas après.
  await page.waitForTimeout(500);
  const avant = (await listerDocuments('crm_parametres')).length;
  await page.waitForTimeout(500);
  expect((await listerDocuments('crm_parametres')).length).toBe(avant);
  await capturer(page, info, '6-vide');
  await rendreLeComplet(page);
});

test('7 garde-fou : un autre compte ou un autre espace arrête tout avant de repartir', async ({ page }, info) => {
  await semer();
  await connecter(page);
  await retenirCompte(page);
  await demarrer(page, { noyau: true });
  const e = await page.evaluate(async (m) => {
    const D = await import(m);
    D.demarrer({ email: 'autre@exemple.test' }, '');
    return { ecoutes: D.ecoutesDemarrees(), email: D.compteCourant().email };
  }, CRM);
  expect(e.ecoutes).toEqual(['personnes', 'organisations', 'affaires', 'activites', 'parametres']);
  expect(e.email).toBe('autre@exemple.test');
  await capturer(page, info, '7-autre-compte');
  await rendreLeComplet(page);
});
