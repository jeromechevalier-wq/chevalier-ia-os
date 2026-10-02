// Prototype Drive (étape 1 du plan, docs/plan-mcp.md section 5.8). À lancer par Jérôme sur son Mac.
//   node outils/prototype-drive.js              tests A à D, côté « serveur » (dossier et fichiers de test)
//   node outils/prototype-drive.js --navigateur test E : envoi de 50 Mo depuis le navigateur, par morceaux
//   node outils/prototype-drive.js --nettoyer   met à la corbeille du Drive ce que le prototype a créé
// Tout se passe dans le dossier « ZZ prototype Chevalier IA OS » : aucune donnée réelle, aucun fichier existant touché
// (la portée drive.file ne voit de toute façon que les fichiers créés par cette application).
// Aucun jeton n'est affiché. Dépendances : aucune (Node 20 ou plus).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  PORTEE, FICHIER_JETON, URL_API, lireJson, nouveauJetonAcces, appelDrive, lireEtat, ecrireEtat,
} from './_google.js';

const NOM_DOSSIER = 'ZZ prototype Chevalier IA OS';
const PORT_NAVIGATEUR = 5051;
const args = process.argv.slice(2);
const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

const resultats = [];
function noter(id, libelle, ok, detail = '') {
  resultats.push({ id, libelle, ok, detail });
  const icone = ok === true ? '✓' : ok === false ? '✗' : 'ℹ';
  console.log(`${icone} ${id}  ${libelle}${detail ? `  (${detail})` : ''}`);
}

function afficherBilan() {
  console.log('\n──────── À copier-coller dans la conversation ────────');
  console.log('| Test | Résultat | Détail |\n|---|---|---|');
  for (const r of resultats) console.log(`| ${r.id} ${r.libelle} | ${r.ok === true ? 'OUI' : r.ok === false ? 'NON' : 'info'} | ${r.detail || ''} |`);
  console.log('───────────────────────────────────────────────────────');
}

function echec(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function dossierDuPrototype(jeton, etat) {
  if (etat.dossiers.length) return etat.dossiers[etat.dossiers.length - 1];
  const r = await appelDrive(jeton, '/drive/v3/files?fields=id,name,webViewLink', {
    methode: 'POST', json: { name: NOM_DOSSIER, mimeType: 'application/vnd.google-apps.folder' },
  });
  if (r.statut !== 200 || !r.donnees.id) throw new Error(`Création du dossier refusée (HTTP ${r.statut}) : ${JSON.stringify(r.donnees).slice(0, 200)}`);
  etat.dossiers.push({ id: r.donnees.id, nom: r.donnees.name, lien: r.donnees.webViewLink });
  await ecrireEtat(etat);
  return etat.dossiers[etat.dossiers.length - 1];
}

function ouvrir(adresse) {
  if (process.platform === 'darwin') execFile('open', [adresse], () => {});
}

// ------------------------------------------------------------------------------------------- nettoyer
async function nettoyer() {
  const etat = await lireEtat();
  const { accessToken } = await nouveauJetonAcces();
  const elements = [...etat.fichiers.map((f) => ({ ...f, type: 'fichier' })), ...etat.dossiers.map((d) => ({ ...d, type: 'dossier' }))];
  if (!elements.length) { console.log('Rien à nettoyer.'); return; }
  for (const e of elements) {
    const r = await appelDrive(accessToken, `/drive/v3/files/${e.id}?fields=id,trashed`, { methode: 'PATCH', json: { trashed: true } });
    console.log(`${r.statut === 200 ? '✓' : '✗'} ${e.type} « ${e.nom} » ${r.statut === 200 ? 'mis à la corbeille du Drive (récupérable 30 jours)' : `non traité (HTTP ${r.statut})`}`);
  }
  await ecrireEtat({ dossiers: [], fichiers: [] });
  console.log('\nÉtat local remis à zéro. Le jeton de rafraîchissement est conservé.');
}

// ------------------------------------------------------------------------------------------- tests A à D
function multipart(metadonnees, contenu, type) {
  const limite = `proto${randomBytes(8).toString('hex')}`;
  const corps = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadonnees)}\r\n--${limite}\r\nContent-Type: ${type}\r\n\r\n`),
    Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu),
    Buffer.from(`\r\n--${limite}--`),
  ]);
  return { corps, entete: `multipart/related; boundary=${limite}` };
}

/** Téléversement reprenable en deux morceaux de 256 Kio ; avecAutorisation=false : sans en-tête Authorization. */
async function televerserEnDeuxMorceaux(jeton, dossierId, nom, avecAutorisation) {
  const total = 2 * 262144;
  const donnees = randomBytes(total);
  const init = await appelDrive(jeton, '/upload/drive/v3/files?uploadType=resumable&fields=id,name,size', {
    methode: 'POST',
    json: { name: nom, parents: [dossierId] },
    entetes: { 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(total) },
  });
  const session = init.entetes.get('location');
  if (init.statut !== 200 || !session) return { init: init.statut, session: false };
  const envoyer = async (debut, fin) => {
    const entetes = { 'Content-Range': `bytes ${debut}-${fin - 1}/${total}` };
    if (avecAutorisation) entetes.Authorization = `Bearer ${jeton}`;
    const r = await fetch(session, { method: 'PUT', headers: entetes, body: donnees.subarray(debut, fin), redirect: 'manual' });
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch { /* pas de corps */ }
    return { statut: r.status, json };
  };
  const m1 = await envoyer(0, 262144);
  if (m1.statut !== 308) return { init: 200, session: true, hote: new URL(session).host, m1: m1.statut };
  const m2 = await envoyer(262144, total);
  return { init: 200, session: true, hote: new URL(session).host, m1: m1.statut, m2: m2.statut, id: m2.json?.id, taille: m2.json?.size };
}

async function testsServeur() {
  const etat = await lireEtat();

  console.log('\n— A. Jeton et portée —');
  const j1 = await nouveauJetonAcces();
  noter('A1', 'Jeton d’accès obtenu avec le jeton de rafraîchissement', true, `valable ${j1.expiresIn} s`);
  const portees = j1.scope.split(' ').filter(Boolean);
  noter('A2', 'Portée = drive.file seule', portees.length === 1 && portees[0] === PORTEE, portees.join(', ') || 'portée non renvoyée');
  const enregistre = await lireJson(FICHIER_JETON);
  noter('A3', 'Aucune échéance annoncée pour le jeton de rafraîchissement', !enregistre.refresh_token_expires_in,
    enregistre.refresh_token_expires_in ? `expire dans ${Math.round(enregistre.refresh_token_expires_in / 86400)} jours : application en mode Test ?` : 'indice de mise en production, à confirmer dans la console (F)');

  console.log('\n— B. Création côté serveur —');
  const dossier = await dossierDuPrototype(j1.accessToken, etat);
  noter('B1', `Dossier « ${dossier.nom} » créé (ou retrouvé)`, true, dossier.id);

  const nomFichier = `${jour} - prototype - essai.txt`;
  const contenu = `Essai du prototype Drive de Chevalier IA OS, ${new Date().toISOString()}\n`;
  const m = multipart({ name: nomFichier, parents: [dossier.id] }, contenu, 'text/plain');
  const envoi = await appelDrive(j1.accessToken, '/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink', {
    methode: 'POST', corps: m.corps, entetes: { 'Content-Type': m.entete },
  });
  const fichier = envoi.donnees;
  noter('B2', 'Petit fichier téléversé côté serveur', envoi.statut === 200 && !!fichier.id, envoi.statut === 200 ? `${fichier.name}, ${fichier.size} octets` : `HTTP ${envoi.statut}`);
  if (!fichier.id) return;
  etat.fichiers.push({ id: fichier.id, nom: fichier.name });
  await ecrireEtat(etat);

  const perms = await appelDrive(j1.accessToken, `/drive/v3/files/${fichier.id}/permissions?fields=permissions(type,role)`);
  const liste = perms.donnees.permissions || [];
  noter('B3', 'Fichier privé : seul le propriétaire y a accès', liste.length === 1 && liste[0].type === 'user' && liste[0].role === 'owner',
    liste.map((p) => `${p.type}/${p.role}`).join(', ') || `HTTP ${perms.statut}`);

  console.log('\n— C. Visibilité commune (second jeton, plus tard) —');
  const j2 = await nouveauJetonAcces();
  const dedans = await appelDrive(j2.accessToken, `/drive/v3/files?q=${encodeURIComponent(`'${dossier.id}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=100`);
  noter('C1', 'Un second jeton retrouve le fichier dans le dossier', (dedans.donnees.files || []).some((f) => f.id === fichier.id), `${(dedans.donnees.files || []).length} fichier(s) dans le dossier`);
  const nomNouveau = `${jour} - prototype - essai renomme.txt`;
  const renomme = await appelDrive(j2.accessToken, `/drive/v3/files/${fichier.id}?fields=id,name`, { methode: 'PATCH', json: { name: nomNouveau } });
  noter('C2', 'Le second jeton renomme le fichier', renomme.statut === 200 && renomme.donnees.name === nomNouveau, `HTTP ${renomme.statut}`);
  const lu = await appelDrive(j2.accessToken, `/drive/v3/files/${fichier.id}?alt=media`, { brut: true });
  noter('C3', 'Le second jeton relit le contenu à l’identique', lu.statut === 200 && lu.donnees.toString('utf8') === contenu, `HTTP ${lu.statut}`);
  const tout = await appelDrive(j2.accessToken, `/drive/v3/files?q=${encodeURIComponent('trashed=false')}&fields=files(id)&pageSize=100`);
  const connus = new Set([...etat.fichiers, ...etat.dossiers].map((e) => e.id));
  const autres = (tout.donnees.files || []).filter((f) => !connus.has(f.id));
  noter('C4', 'Isolation : aucun fichier de ton Drive hors de l’application n’est visible', autres.length === 0,
    autres.length ? `${autres.length} autre(s) fichier(s) visible(s) (créés par cette application lors d’un autre essai ?)` : `${(tout.donnees.files || []).length} fichier(s) visible(s), tous créés par ce prototype`);

  console.log('\n— D. Session de téléversement reprenable —');
  const sans = await televerserEnDeuxMorceaux(j2.accessToken, dossier.id, `${jour} - prototype - sans autorisation.bin`, false);
  noter('D1', 'La session de téléversement s’ouvre', !!sans.session, sans.session ? `adresse sur ${sans.hote}` : `HTTP ${sans.init}`);
  const sansOk = sans.m1 === 308 && (sans.m2 === 200 || sans.m2 === 201) && !!sans.id;
  noter('D2', 'Les morceaux sont acceptés SANS en-tête d’autorisation', sansOk, `morceau 1 : HTTP ${sans.m1 ?? '-'}, morceau 2 : HTTP ${sans.m2 ?? '-'}`);
  if (sans.id) { etat.fichiers.push({ id: sans.id, nom: 'sans autorisation' }); await ecrireEtat(etat); }
  const avec = await televerserEnDeuxMorceaux(j2.accessToken, dossier.id, `${jour} - prototype - avec autorisation.bin`, true);
  noter('D3', 'Contrôle : les morceaux sont acceptés AVEC l’en-tête d’autorisation', avec.m1 === 308 && (avec.m2 === 200 || avec.m2 === 201) && !!avec.id, `morceau 1 : HTTP ${avec.m1 ?? '-'}, morceau 2 : HTTP ${avec.m2 ?? '-'}`);
  if (avec.id) { etat.fichiers.push({ id: avec.id, nom: 'avec autorisation' }); await ecrireEtat(etat); }

  console.log('\n— À vérifier à la main —');
  noter('B4', `Ouvre ${dossier.lien || 'ton Drive'} : le dossier et ses fichiers sont là, sans partage`, null, 'regarde le Drive, pas le terminal');
  noter('F', 'Écran de consentement « En production » dans la console (guide, étape 2)', null, 'à confirmer par une capture ou une phrase');
  noter('E', 'Test navigateur (50 Mo par morceaux) : node outils/prototype-drive.js --navigateur', null, 'à lancer ensuite');
}

// ------------------------------------------------------------------------------------------- test E
async function testNavigateur() {
  const etat = await lireEtat();
  const j = await nouveauJetonAcces();
  const dossier = await dossierDuPrototype(j.accessToken, etat);
  const secret = randomBytes(12).toString('hex');
  const page = (await readFile(fileURLToPath(new URL('./prototype-drive-navigateur.html', import.meta.url)), 'utf8')).replace('__URL_API__', URL_API);

  const retour = await new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => { serveur.close(); reject(new Error('Délai dépassé (10 minutes).')); }, 10 * 60 * 1000);
    const serveur = createServer(async (req, res) => {
      const prefixe = `/${secret}/`;
      if (!req.url.startsWith(prefixe) && req.url !== `/${secret}`) { res.writeHead(404).end(); return; }
      const route = req.url.slice(prefixe.length) || '';
      if (req.method === 'GET' && route === '') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
      } else if (req.method === 'GET' && route === 'jeton') {
        try {
          const frais = await nouveauJetonAcces();
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ accessToken: frais.accessToken, dossierId: dossier.id, jour }));
        } catch (e) { res.writeHead(500).end(String(e.message)); }
      } else if (req.method === 'POST' && route === 'resultat') {
        const morceaux = [];
        for await (const m of req) morceaux.push(m);
        res.writeHead(204).end();
        clearTimeout(minuteur);
        serveur.close();
        try { resolve(JSON.parse(Buffer.concat(morceaux).toString('utf8'))); } catch (e) { reject(e); }
      } else { res.writeHead(404).end(); }
    });
    serveur.on('error', reject);
    serveur.listen(PORT_NAVIGATEUR, '127.0.0.1', () => {
      const adresse = `http://127.0.0.1:${PORT_NAVIGATEUR}/${secret}/`;
      console.log(`Ouvre cette page dans Chrome ou Safari sur ton Mac (elle s'ouvre seule normalement) :\n\n  ${adresse}\n`);
      console.log('Clique sur « Envoyer 50 Mo de test » (ou choisis un vrai fichier), puis attends le résultat ici.');
      ouvrir(adresse);
    });
  });

  console.log('\n— E. Envoi depuis le navigateur —');
  noter('E1', 'La page obtient l’adresse de session (en-tête Location lisible depuis le navigateur)', !!retour.locationLisible, retour.locationLisible ? '' : 'à signaler : l’adresse doit alors être fournie par la fonction');
  noter('E2', `Envoi de ${Math.round((retour.tailleOctets || 0) / 1048576)} Mo par morceaux depuis le navigateur`, !!retour.ok,
    retour.ok ? `${retour.morceaux} morceaux, ${retour.debitMoParSeconde} Mo/s` : `échec : ${retour.erreur || 'inconnu'}`);
  if (retour.fichierId) {
    etat.fichiers.push({ id: retour.fichierId, nom: 'envoi navigateur' });
    await ecrireEtat(etat);
    const j2 = await nouveauJetonAcces();
    const meta = await appelDrive(j2.accessToken, `/drive/v3/files/${retour.fichierId}?fields=id,name,size`);
    noter('E3', 'Drive contient bien un fichier de la taille envoyée', meta.statut === 200 && Number(meta.donnees.size) === retour.tailleOctets, meta.statut === 200 ? `${meta.donnees.size} octets` : `HTTP ${meta.statut}`);
  }
}

// ------------------------------------------------------------------------------------------- lancement
try {
  if (args.includes('--nettoyer')) await nettoyer();
  else if (args.includes('--navigateur')) { await testNavigateur(); afficherBilan(); }
  else { await testsServeur(); afficherBilan(); }
} catch (e) {
  echec(e.message);
}
