// Autorisation unique de Google Drive (portée « drive.file ») pour Chevalier IA OS.
// Trois façons de la donner ; le jeton de rafraîchissement obtenu est enregistré dans ~/.config/chevalier-ia-os/
// (droits 600) et n'est JAMAIS affiché.
//   node outils/autoriser-drive.js                       sur le Mac : ouvre Google, reçoit le retour sur http://localhost:8085/
//   node outils/autoriser-drive.js --manuel              session cloud, étape 1 : affiche l'adresse Google à ouvrir
//   node outils/autoriser-drive.js --terminer "<adresse>" session cloud, étape 2 : l'adresse où Google a renvoyé le navigateur
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import {
  FICHIER_CLIENT, FICHIER_JETON, FICHIER_AUTORISATION_EN_COURS, URL_AUTORISATION, PORTEE, PORT_REDIRECTION, REDIRECTION,
  lireClient, appelJeton, lireJson, ecrireSecret,
} from './_google.js';

const MAIL = 'jerome.chevalier@gmail.com';
const base64url = (b) => b.toString('base64url');
const args = process.argv.slice(2);

const client = await lireClient();
if (!client.redirections.includes(REDIRECTION)) {
  console.warn(`⚠ L'adresse de redirection ${REDIRECTION} n'est pas dans l'identifiant OAuth (${FICHIER_CLIENT} ou variable).`);
  console.warn('  Si Google répond « redirect_uri_mismatch », ajoute-la dans la console (étape 3 du guide) et relance.\n');
}

function nouvelleDemande() {
  const verifieur = base64url(randomBytes(32));
  const defi = base64url(createHash('sha256').update(verifieur).digest());
  const etat = base64url(randomBytes(16));
  const adresse = `${URL_AUTORISATION}?${new URLSearchParams({
    client_id: client.id,
    redirect_uri: REDIRECTION,
    response_type: 'code',
    scope: PORTEE,
    access_type: 'offline',
    prompt: 'consent',
    state: etat,
    code_challenge: defi,
    code_challenge_method: 'S256',
    login_hint: MAIL,
  })}`;
  return { verifieur, etat, adresse };
}

function pagePour(titre, texte) {
  return `<!doctype html><meta charset="utf-8"><title>${titre}</title><body style="font:18px system-ui;max-width:32em;margin:4em auto;padding:0 1em"><h1>${titre}</h1><p>${texte}</p>`;
}

/** Attend le retour de Google sur localhost:8085 (IPv4 et IPv6, jamais ouvert au réseau). */
function attendreCode(etat) {
  return new Promise((resolve, reject) => {
    const serveurs = [];
    const fermer = () => serveurs.forEach((s) => s.close());
    const minuteur = setTimeout(() => { fermer(); reject(new Error('Délai dépassé (5 minutes) : relance le script.')); }, 5 * 60 * 1000);
    const gerer = (req, res) => {
      const u = new URL(req.url, REDIRECTION);
      if (u.pathname !== '/') { res.writeHead(404).end(); return; }
      const erreur = u.searchParams.get('error');
      const code = u.searchParams.get('code');
      if (erreur || u.searchParams.get('state') !== etat || !code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(pagePour('Échec', `Google a répondu : ${erreur || 'réponse inattendue'}. Reviens au terminal.`));
        clearTimeout(minuteur); fermer();
        reject(new Error(`Autorisation refusée ou invalide (${erreur || 'état incorrect'}).`));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(pagePour('C’est fait', 'Tu peux fermer cet onglet et revenir au terminal.'));
      clearTimeout(minuteur); fermer();
      resolve(code);
    };
    for (const hote of ['127.0.0.1', '::1']) {
      const s = createServer(gerer);
      s.on('error', (e) => { if (hote === '127.0.0.1') { clearTimeout(minuteur); reject(e); } /* ::1 absent : sans importance */ });
      s.listen(PORT_REDIRECTION, hote);
      serveurs.push(s);
    }
  });
}

/** Échange le code contre les jetons et enregistre le jeton de rafraîchissement (sans jamais l'afficher). */
async function echangerEtEnregistrer(code, verifieur) {
  const { r, j } = await appelJeton(client, {
    code, redirect_uri: REDIRECTION, grant_type: 'authorization_code', code_verifier: verifieur,
  });
  if (!r.ok) {
    console.error(`✗ Google a refusé l'échange (HTTP ${r.status}) : ${j.error || ''} ${j.error_description || ''}`);
    process.exit(1);
  }
  if (!j.refresh_token) {
    console.error('✗ Google n’a pas fourni de jeton de rafraîchissement (autorisation déjà donnée avant ?).');
    console.error('  Retire l’accès sur https://myaccount.google.com/permissions (application « Chevalier IA OS - Drive serveur »), puis relance.');
    process.exit(1);
  }
  const portees = (j.scope || '').split(' ').filter(Boolean);
  await ecrireSecret(FICHIER_JETON, {
    refresh_token: j.refresh_token,
    scope: j.scope,
    obtenuLe: new Date().toISOString(),
    refresh_token_expires_in: j.refresh_token_expires_in ?? null,
  });
  console.log(`\n✓ Jeton de rafraîchissement enregistré dans ${FICHIER_JETON} (droits 600). Il n’est pas affiché.`);
  console.log(`  Portée accordée : ${portees.join(', ') || '(inconnue)'}`);
  if (portees.length !== 1 || portees[0] !== PORTEE) console.warn('⚠ La portée n’est pas exactement drive.file : à signaler avant d’aller plus loin.');
  if (j.refresh_token_expires_in) {
    console.warn(`⚠ Google indique que ce jeton expire dans ${Math.round(j.refresh_token_expires_in / 86400)} jours : l’application est probablement encore en mode « Test ».`);
    console.warn('  Passe l’écran de consentement « En production » (étape 2 du guide), puis refais cette autorisation.');
  } else {
    console.log('  Aucune échéance annoncée pour le jeton (bon signe : application « En production »).');
  }
  console.log('\nSuite : node outils/prototype-drive.js');
}

if (args.includes('--manuel')) {
  // Session cloud, étape 1 : on garde le vérificateur PKCE (clé à usage unique) pour l'étape 2.
  const d = nouvelleDemande();
  await ecrireSecret(FICHIER_AUTORISATION_EN_COURS, { verifieur: d.verifieur, etat: d.etat, creeLe: new Date().toISOString() });
  console.log('1. Ouvre cette adresse dans ton navigateur (connecté à', MAIL, ') et autorise l’accès aux fichiers créés par l’application :\n');
  console.log(d.adresse, '\n');
  console.log('2. À la fin, la page affichera une erreur « connexion impossible » ou « localhost a refusé de se connecter » : c’est NORMAL.');
  console.log('3. Copie l’adresse complète de la barre d’adresse (elle commence par http://localhost:8085/?state=…&code=…) et envoie-la-moi.');
  console.log('   Ce code ne sert qu’une fois, quelques minutes, et ne vaut rien sans le secret de l’identifiant : tu peux le coller dans le chat.');
} else if (args.includes('--terminer')) {
  const brute = args[args.indexOf('--terminer') + 1];
  if (!brute) { console.error('Usage : node outils/autoriser-drive.js --terminer "<adresse copiée>"'); process.exit(1); }
  let attente;
  try { attente = await lireJson(FICHIER_AUTORISATION_EN_COURS); } catch { console.error('✗ Aucune autorisation en cours : lance d’abord --manuel (dans la même session).'); process.exit(1); }
  let u;
  try { u = new URL(brute.trim()); } catch { console.error('✗ Ce n’est pas une adresse valide : copie toute la barre d’adresse.'); process.exit(1); }
  const code = u.searchParams.get('code');
  const erreur = u.searchParams.get('error');
  if (erreur || !code) { console.error(`✗ Google a répondu : ${erreur || 'pas de code dans l’adresse'}.`); process.exit(1); }
  if (u.searchParams.get('state') !== attente.etat) { console.error('✗ L’adresse ne correspond pas à la demande en cours (état différent) : relance --manuel.'); process.exit(1); }
  await echangerEtEnregistrer(code, attente.verifieur);
  await rm(FICHIER_AUTORISATION_EN_COURS, { force: true });
} else {
  // Sur le Mac : tout est automatique.
  const d = nouvelleDemande();
  console.log('1. Une page Google va s’ouvrir. Choisis', MAIL, 'puis autorise « Voir et gérer les fichiers créés par cette application ».');
  console.log('   Si elle ne s’ouvre pas, copie cette adresse dans ton navigateur :\n');
  console.log(d.adresse, '\n');
  const attente = attendreCode(d.etat);
  attente.catch(() => {}); // l'erreur est traitée plus bas
  if (process.platform === 'darwin') execFile('open', [d.adresse], () => {});
  const code = await attente.catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
  await echangerEtEnregistrer(code, d.verifieur);
}
