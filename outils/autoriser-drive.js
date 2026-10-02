// Autorisation unique de Google Drive (portée « drive.file ») pour Chevalier IA OS.
// À lancer par Jérôme sur son Mac : node outils/autoriser-drive.js
// Ouvre Google dans le navigateur, reçoit le code sur http://localhost:8085/, l'échange contre un jeton de
// rafraîchissement et l'enregistre dans ~/.config/chevalier-ia-os/ (droits 600). Le jeton n'est JAMAIS affiché.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  FICHIER_CLIENT, FICHIER_JETON, URL_AUTORISATION, URL_JETON, PORTEE, PORT_REDIRECTION, REDIRECTION,
  lireClient, ecrireSecret,
} from './_google.js';

const MAIL = 'jerome.chevalier@gmail.com';
const base64url = (b) => b.toString('base64url');

const client = await lireClient();
if (!client.redirections.includes(REDIRECTION)) {
  console.warn(`⚠ L'adresse de redirection ${REDIRECTION} n'est pas dans ${FICHIER_CLIENT}.`);
  console.warn('  Si Google répond « redirect_uri_mismatch », ajoute-la dans la console (étape 3 du guide) et relance.\n');
}

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

function pagePour(titre, texte) {
  return `<!doctype html><meta charset="utf-8"><title>${titre}</title><body style="font:18px system-ui;max-width:32em;margin:4em auto;padding:0 1em"><h1>${titre}</h1><p>${texte}</p>`;
}

/** Attend le retour de Google sur localhost:8085 (IPv4 et IPv6, jamais ouvert au réseau). */
function attendreCode() {
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

console.log('1. Une page Google va s’ouvrir. Choisis', MAIL, 'puis autorise « Voir et gérer les fichiers créés par cette application ».');
console.log('   Si elle ne s’ouvre pas, copie cette adresse dans ton navigateur :\n');
console.log(adresse, '\n');
const attente = attendreCode();
attente.catch(() => {}); // l'erreur est traitée plus bas
if (process.platform === 'darwin') execFile('open', [adresse], () => {});

const code = await attente;
const r = await fetch(URL_JETON, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code, client_id: client.id, client_secret: client.secret, redirect_uri: REDIRECTION,
    grant_type: 'authorization_code', code_verifier: verifieur,
  }),
});
const j = await r.json().catch(() => ({}));
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
