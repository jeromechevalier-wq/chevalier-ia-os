// Page d'autorisation OAuth (GET /oauth/authorize) : connexion Google (la même que l'appli, via Firebase Auth), puis écran de consentement.
// Le serveur ne fait confiance qu'à ce qu'il revérifie (POST /oauth/approve : jeton d'identité Google contrôlé, compte autorisé, demande revalidée).
// Rien de ce que contient la page n'est un secret : la configuration Firebase du navigateur est publique (comme dans js/os/firebase-config.js).

const FIREBASE = 'https://www.gstatic.com/firebasejs/12.19.0';
export const CONFIG_FIREBASE = Object.freeze({
  apiKey: 'AIzaSyAa04eaHNaBJwGAUwMrDampugAn1aralXc',
  authDomain: 'chevalier-ia-os.web.app',
  projectId: 'chevalier-ia-os',
  appId: '1:96526036520:web:d09f8ac76597dffaad0f1d',
});

/** En-têtes de la page : pas d'encadrement (clic piégé), pas de mise en cache, pas de lien de retour. */
export const ENTETES_PAGE = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** JSON sûr dans un <script type="application/json"> : `<` devient \u003c, impossible de refermer la balise. */
const jsonSur = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const STYLE = `
:root{color-scheme:light dark;--fond:#f6f7f9;--carte:#fff;--texte:#14181f;--discret:#5a6472;--bord:#d9dee5;--accent:#1a56db;--danger:#b42318}
@media (prefers-color-scheme:dark){:root{--fond:#0f1319;--carte:#181e27;--texte:#eef1f5;--discret:#9aa5b4;--bord:#2b3441;--accent:#6ea1ff;--danger:#ff8a80}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--fond);color:var(--texte);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{width:100%;max-width:440px;background:var(--carte);border:1px solid var(--bord);border-radius:16px;padding:24px}
h1{font-size:1.25rem;margin:0 0 12px}p{margin:0 0 12px}.discret{color:var(--discret);font-size:.9rem}
button{width:100%;min-height:48px;margin-top:8px;border-radius:12px;border:1px solid var(--bord);background:transparent;color:var(--texte);font:inherit;font-weight:600;cursor:pointer}
button.principal{background:var(--accent);border-color:var(--accent);color:#fff}button:disabled{opacity:.6;cursor:default}
.alerte{color:var(--danger);font-weight:600}.droits{border:1px solid var(--bord);border-radius:12px;padding:12px;margin:12px 0}
[hidden]{display:none!important}`;

const enveloppe = (titre, corps) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${echapper(titre)}</title><style>${STYLE}</style></head><body><main>${corps}</main></body></html>`;

/** Page d'erreur : demande invalide (jamais de redirection vers une adresse non vérifiée). */
export function pageErreur(message) {
  return enveloppe('Connexion impossible', `<h1>Connexion impossible</h1><p class="alerte">${echapper(message)}</p><p class="discret">Reviens dans Claude et relance la connexion du connecteur.</p>`);
}

/** `demande` : { client_id, redirect_uri, code_challenge, state?, resource? }, déjà validée par le serveur. */
export function pageAutorisation(demande) {
  const corps = `
<h1>Autoriser Claude à accéder à Chevalier IA OS ?</h1>
<div id="etat-connexion" hidden>
  <p>Pour continuer, connecte-toi avec ton compte Google.</p>
  <button type="button" class="principal" id="se-connecter">Se connecter avec Google</button>
</div>
<div id="etat-consentement" hidden>
  <p>Connecté en tant que <strong id="compte"></strong>.</p>
  <div class="droits">
    <p><strong>Cette application va pouvoir :</strong></p>
    <p>lire, créer, modifier et <strong>supprimer</strong> des fiches, des notes et des projets dans ta base, comme Claude Code sur ton Mac.</p>
    <p class="discret">Retour vers : <strong id="destination"></strong></p>
  </div>
  <button type="button" class="principal" id="autoriser">Autoriser</button>
  <button type="button" id="refuser">Refuser</button>
  <button type="button" id="changer">Changer de compte</button>
</div>
<p id="message" class="alerte" role="alert" hidden></p>
<p class="discret">Tu peux couper cet accès à tout moment (voir docs/securite-et-pannes.md).</p>
<script type="application/json" id="demande">${jsonSur(demande)}</script>
<script type="application/json" id="config">${jsonSur(CONFIG_FIREBASE)}</script>
<script type="module">
import { initializeApp } from '${FIREBASE}/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from '${FIREBASE}/firebase-auth.js';
const lire = (id) => JSON.parse(document.getElementById(id).textContent);
const demande = lire('demande');
const auth = getAuth(initializeApp(lire('config')));
const $ = (id) => document.getElementById(id);
const montrer = (etat) => { $('etat-connexion').hidden = etat !== 'connexion'; $('etat-consentement').hidden = etat !== 'consentement'; };
const dire = (texte) => { $('message').textContent = texte || ''; $('message').hidden = !texte; };
$('destination').textContent = new URL(demande.redirect_uri).host;
const fournisseur = () => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
const mobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px)').matches;
let utilisateur = null;

async function envoyer(decision) {
  dire('');
  for (const id of ['autoriser', 'refuser', 'changer']) $(id).disabled = true;
  try {
    const corps = { ...demande, decision };
    if (decision === 'allow') corps.id_token = await utilisateur.getIdToken();
    const r = await fetch('/oauth/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && typeof j.redirect === 'string') { window.location.assign(j.redirect); return; }
    dire(j.message || "Ce compte n'est pas autorisé ou la demande a expiré. Relance la connexion depuis Claude.");
  } catch {
    dire('Connexion impossible pour le moment. Réessaie.');
  }
  for (const id of ['autoriser', 'refuser', 'changer']) $(id).disabled = false;
}

$('se-connecter').addEventListener('click', async () => {
  dire('');
  try {
    if (mobile()) await signInWithRedirect(auth, fournisseur());
    else await signInWithPopup(auth, fournisseur());
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) { await signInWithRedirect(auth, fournisseur()); return; }
    if (!e || (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request')) dire('La connexion Google a échoué. Réessaie.');
  }
});
$('autoriser').addEventListener('click', () => envoyer('allow'));
$('refuser').addEventListener('click', () => envoyer('deny'));
$('changer').addEventListener('click', async () => { await signOut(auth); });
onAuthStateChanged(auth, (u) => {
  utilisateur = u;
  if (u) { $('compte').textContent = u.email || ''; montrer('consentement'); } else montrer('connexion');
});
getRedirectResult(auth).catch(() => dire('La connexion Google a échoué. Réessaie.'));
</script>`;
  return enveloppe('Autoriser Claude', corps);
}
