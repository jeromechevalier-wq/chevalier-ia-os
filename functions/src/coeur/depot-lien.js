// Lien d'envoi temporaire (17/11/2026) : un assistant qui ne peut pas transmettre les octets d'un fichier (PDF, photo) demande un LIEN à usage unique ; le fichier est ensuite envoyé à ce lien,
// soit par une commande `curl` lancée par l'assistant quand il a un terminal, soit par une petite page où l'utilisateur choisit le fichier.
//  - le lien est un secret de 256 bits (43 caractères) valable DUREE_DEPOT_MS ; il n'est stocké que par son empreinte SHA-256, dans la collection serveur `mcp_codes` (déjà celle des codes de confirmation) ;
//  - à usage unique : il est « réclamé » par une suppression atomique AVANT l'écriture (deux envois en même temps : un seul passe) ; si le fichier est refusé (type, taille), le lien est remis pour un nouvel essai ;
//  - il ne vise qu'UNE affaire ou UN projet, fixé à la création, et garde l'acteur de l'assistant qui l'a demandé (le journal dit qui) ;
//  - le dépôt est celui de l'écran et du MCP (documents.js) : mêmes contrôles (extension, type, premiers octets, taille, quota), même journal, jamais le contenu dans le journal ;
//  - le lien n'est JAMAIS écrit dans NOS journaux ni dans une réponse d'erreur (l'adresse peut figurer dans les journaux de la plateforme Google, mais elle ne vaut qu'une fois et 10 minutes).
// 2e genre (26/11/2026) : `depot_achat`, une facture d'achat en PDF pour une maison (outil MCP ajouter_facture_achat). Pas de fiche cible : le lien garde l'e-mail VÉRIFIÉ du compte qui l'a demandé ;
// le fichier n'est pas rangé ici, il est passé à `deposerAchat` (injecté depuis index.js : base/assistant-achats.js), qui le fait suivre à n8n avec un ticket neuf. Sans `deposerAchat`
// (plateforme des clients, ou serveur qui ne l'a pas branché), un tel lien répond « plus valable ». Aucun import de base/ ici (ce dossier est copié chez les clients).
import { createHash, randomBytes } from 'node:crypto';
import { COLLECTIONS as C } from './donnees.js';
import { sansId } from './canonique.js';
import * as DOC from './documents.js';

export const DUREE_DEPOT_MS = 10 * 60_000;
/** Plafond d'un envoi par lien : la fonction a 1 GiB de mémoire et le corps d'une requête est borné par la plateforme (valeur prudente, mesure réelle à faire). */
export const TAILLE_DEPOT_MAX_OCTETS = 10 * 1024 * 1024;
const MOTIF_CHEMIN = /^\/depot\/([A-Za-z0-9_-]{43})\/?$/;

const idDe = (jeton) => `depot_${createHash('sha256').update(jeton).digest('hex').slice(0, 40)}`;
/** Genres de liens d'envoi : un document d'une fiche (onglet « Documents ») ou une facture d'achat (PDF transmis au service des achats). */
export const GENRES_DEPOT = Object.freeze(['depot', 'depot_achat']);

/**
 * Crée un lien. Rend le jeton (à mettre dans l'adresse, une seule fois). `maintenant` : millisecondes. `jeton` : identifiant du jeton MCP du demandeur (pour le journal).
 * genre `depot` (défaut) : pour une affaire ou un projet (`cibleType`, `cibleId`) ; genre `depot_achat` : pour une facture d'achat, avec `email` (compte vérifié du demandeur, recontrôlé au dépôt).
 */
export async function emettreLienDepot({ donnees, genre = 'depot', cibleType, cibleId, email, acteur, jeton: jetonMcp = acteur, maintenant, aleatoire = () => randomBytes(32).toString('base64url') }) {
  if (!GENRES_DEPOT.includes(genre)) throw new Error(`genre de lien inconnu : ${genre}`);
  if (genre === 'depot_achat' && (typeof email !== 'string' || !email)) throw new Error('lien d\'achat sans compte');
  await nettoyerLiensPerimes(donnees, maintenant);
  const jeton = aleatoire();
  const contenu = genre === 'depot_achat'
    ? { genre, email: email.toLowerCase(), acteur, jetonMcp, valideJusqua: maintenant + DUREE_DEPOT_MS }
    : { genre, cibleType, cibleId, acteur, jetonMcp, valideJusqua: maintenant + DUREE_DEPOT_MS };
  await donnees.appliquer([{ type: 'set', collection: C.codes, id: idDe(jeton), donnees: contenu }]);
  return jeton;
}

/** Ménage au passage : les liens périmés jamais utilisés sont effacés (20 au plus par demande ; une panne du ménage ne bloque jamais la création). */
async function nettoyerLiensPerimes(donnees, maintenant) {
  try {
    const perimes = (await donnees.liste(C.codes)).filter((d) => GENRES_DEPOT.includes(d.genre) && maintenant > d.valideJusqua).slice(0, 20);
    if (perimes.length) await donnees.appliquer(perimes.map((d) => ({ type: 'delete', collection: C.codes, id: d.id })));
  } catch { /* ménage seulement */ }
}

/** Lit un lien sans le consommer (la page d'envoi). null si absent, périmé ou d'un autre genre. */
async function lireLien(donnees, jeton, maintenant) {
  const trouve = await donnees.document(C.codes, idDe(jeton));
  if (!trouve || !GENRES_DEPOT.includes(trouve.genre) || maintenant > trouve.valideJusqua) return null;
  return sansId(trouve);
}

/** Réclame le lien : suppression atomique, un seul appel l'obtient. null si absent, déjà pris ou périmé. */
async function reclamerLien(donnees, jeton, maintenant) {
  const id = idDe(jeton);
  const trouve = await donnees.document(C.codes, id);
  if (!trouve || !GENRES_DEPOT.includes(trouve.genre)) return null;
  const avant = sansId(trouve);
  try {
    await donnees.appliquer([{ type: 'delete', collection: C.codes, id }], { attendus: [{ collection: C.codes, id, avant }] });
  } catch {
    return null; // pris entre-temps par un autre envoi
  }
  return maintenant > avant.valideJusqua ? null : avant;
}

/** Remet un lien réclamé quand le fichier n'a pas pu être enregistré (même échéance : le délai ne se prolonge pas). */
async function restituerLien(donnees, jeton, avant) {
  try { await donnees.appliquer([{ type: 'set', collection: C.codes, id: idDe(jeton), donnees: avant }]); } catch { /* au pire l'utilisateur redemande un lien */ }
}

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Envoyer un fichier</title>
<style>
:root{--fond:#fafaf7;--texte:#1d1d1b;--doux:#6b6b66;--accent:#f2c200;--bord:#d9d8d2;--ok:#1f7a3d;--erreur:#b3261e}
@media (prefers-color-scheme:dark){:root{--fond:#1c1c1a;--texte:#f1f0ea;--doux:#a3a29b;--bord:#44443f;--ok:#6fcf8c;--erreur:#ff8a80}}
body{margin:0;background:var(--fond);color:var(--texte);font:16px/1.5 system-ui,sans-serif}
main{max-width:30rem;margin:0 auto;padding:2rem 1rem}
h1{font-size:1.4rem;margin:0 0 .5rem}p{color:var(--doux);margin:.25rem 0 1rem}
input[type=file]{display:block;width:100%;box-sizing:border-box;padding:.75rem;border:1px dashed var(--bord);border-radius:.5rem;background:transparent;color:var(--texte)}
button{margin-top:1rem;padding:.7rem 1.2rem;border:0;border-radius:.5rem;background:var(--accent);color:#1d1d1b;font:inherit;font-weight:600;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
#m{min-height:1.5em;margin-top:1rem;color:var(--texte)}#m.ok{color:var(--ok)}#m.erreur{color:var(--erreur)}
</style></head><body><main>
<h1>Envoyer un fichier</h1>
<p>Le fichier sera rangé dans l'onglet « Documents » de la fiche. Ce lien ne sert qu'une fois et expire au bout de quelques minutes.</p>
<input type="file" id="f" aria-label="Choisir le fichier">
<button type="button" id="b" disabled>Envoyer</button>
<p id="m" role="status" aria-live="polite"></p>
</main>
<script>
(function () {
  var f = document.getElementById('f'), b = document.getElementById('b'), m = document.getElementById('m');
  function dire(texte, classe) { m.textContent = texte; m.className = classe || ''; }
  f.addEventListener('change', function () { b.disabled = !f.files.length; dire(''); });
  b.addEventListener('click', function () {
    var fichier = f.files[0];
    if (!fichier) return;
    b.disabled = true; f.disabled = true; dire('Envoi en cours…');
    fetch(location.pathname + '?nom=' + encodeURIComponent(fichier.name), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: fichier })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
      .then(function (r) {
        if (r.ok) { dire('C\\u2019est envoy\\u00e9 : ' + r.j.nom + '. Tu peux fermer cette page.', 'ok'); return; }
        dire(r.j.erreur || 'L\\u2019envoi a \\u00e9chou\\u00e9. Demande un nouveau lien.', 'erreur'); f.disabled = false; b.disabled = false;
      })
      .catch(function () { dire('L\\u2019envoi n\\u2019a pas abouti. V\\u00e9rifie ta connexion puis r\\u00e9essaie.', 'erreur'); f.disabled = false; b.disabled = false; });
  });
})();
</script></body></html>`;

/** Page d'envoi d'une facture d'achat : PDF seulement (même script que la page des documents). */
const PAGE_ACHAT = PAGE
  .replace('<title>Envoyer un fichier</title>', '<title>Ajouter une facture</title>')
  .replace('<h1>Envoyer un fichier</h1>', '<h1>Ajouter une facture (PDF)</h1>')
  .replace('<p>Le fichier sera rangé dans l\'onglet « Documents » de la fiche. Ce lien ne sert qu\'une fois et expire au bout de quelques minutes.</p>',
    '<p>Le PDF sera ajouté aux factures à valider. PDF seulement, 10 Mo au plus. Ce lien ne sert qu\'une fois et expire au bout de quelques minutes.</p>')
  .replace('<input type="file" id="f" aria-label="Choisir le fichier">', '<input type="file" id="f" accept="application/pdf,.pdf" aria-label="Choisir la facture en PDF">')
  .replace("'C\\u2019est envoy\\u00e9 : ' + r.j.nom + '. Tu peux fermer cette page.'", "(r.j.message || 'Facture ajout\\u00e9e.') + ' Tu peux fermer cette page.'");

const PAGE_EXPIREE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Lien expiré</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:30rem;margin:2rem auto;padding:0 1rem"><h1 style="font-size:1.4rem">Ce lien n'est plus valable</h1><p>Il a expiré ou il a déjà servi. Demande un nouveau lien à l'assistant.</p></body></html>`;

/**
 * Gestionnaire HTTP du lien : GET = la page, PUT ou POST = le fichier (corps brut, nom dans ?nom=).
 * `stockage` : stockage.js ou fonction qui le rend. `espace` : '' chez Jérôme. `journal(ligne)` : jamais le lien ni le contenu.
 */
export function creerGestionnaireDepot({ donnees, stockage, espace = '', journal = () => {}, maintenant = () => Date.now(), deposerAchat = null }) {
  const repondre = (res, code, type, corps) => {
    res.statusCode = code;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(corps);
  };
  const json = (res, code, objet) => repondre(res, code, 'application/json; charset=utf-8', JSON.stringify(objet));

  return async (req, res) => {
    let url;
    try { url = new URL(req.url ?? '/', 'http://depot.invalide'); } catch { return repondre(res, 404, 'text/plain; charset=utf-8', 'Introuvable'); }
    const jeton = MOTIF_CHEMIN.exec(url.pathname)?.[1];
    if (!jeton) return repondre(res, 404, 'text/plain; charset=utf-8', 'Introuvable');
    const t = maintenant();

    if (req.method === 'GET') {
      let lien = null;
      try { lien = await lireLien(donnees(), jeton, t); } catch { /* base indisponible : page « expiré » */ }
      if (lien?.genre === 'depot_achat' && !deposerAchat) lien = null; // service des achats pas branché ici : « plus valable »
      if (!lien) return repondre(res, 404, 'text/html; charset=utf-8', PAGE_EXPIREE);
      return repondre(res, 200, 'text/html; charset=utf-8', lien.genre === 'depot_achat' ? PAGE_ACHAT : PAGE);
    }
    if (req.method !== 'PUT' && req.method !== 'POST') { res.setHeader('Allow', 'GET, PUT, POST'); return json(res, 405, { ok: false, erreur: 'Méthode non permise.' }); }

    const nom = url.searchParams.get('nom');
    if (!nom || nom.length > 400) return json(res, 400, { ok: false, erreur: 'Le nom du fichier est manquant (?nom=fichier.pdf).' });
    const octets = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.isBuffer(req.body) ? req.body : null;
    if (!octets || !octets.length) return json(res, 400, { ok: false, erreur: 'Le fichier est vide ou n\'a pas été reçu.' });
    if (octets.length > TAILLE_DEPOT_MAX_OCTETS) {
      let apercu = null;
      try { apercu = await lireLien(donnees(), jeton, t); } catch { apercu = null; } // le lien n'est pas consommé : un nouvel essai reste possible
      if (apercu?.genre === 'depot_achat') return json(res, 413, { ok: false, erreur: 'Ce PDF est trop gros (10 Mo au plus). Réduis-le ou scanne-le en moins haute qualité.' });
      return json(res, 413, { ok: false, erreur: `Fichier trop gros pour ce lien (${TAILLE_DEPOT_MAX_OCTETS / 1024 / 1024} Mo au plus) : onglet « Documents » de la fiche, bouton « Ajouter un fichier ».` });
    }

    const base = donnees();
    let lien;
    try { lien = await reclamerLien(base, jeton, t); } catch { lien = null; }
    if (lien?.genre === 'depot_achat' && !deposerAchat) { await restituerLien(base, jeton, lien); lien = null; }
    if (!lien) return json(res, 404, { ok: false, erreur: 'Ce lien n\'est plus valable (expiré ou déjà utilisé). Demandez-en un nouveau.' });

    if (lien.genre === 'depot_achat') {
      // Facture d'achat : le service contrôle le compte, la taille, le PDF et l'adresse, puis l'envoie à n8n (ticket neuf). Il dit si le lien peut resservir (rien n'a été envoyé).
      let r;
      try { r = await deposerAchat({ octets, nom, email: lien.email }); } catch { r = { statut: 500, corps: { ok: false, erreur: 'La facture n\'a pas pu être envoyée. Réessayez.' }, rendreLien: true }; }
      if (r.rendreLien) await restituerLien(base, jeton, lien);
      journal({ action: 'depot_achat', statut: r.statut === 200 ? 'ok' : 'refus', http: r.statut });
      return json(res, r.statut, r.corps);
    }

    const ctx = { acteur: lien.acteur, jeton: lien.jetonMcp ?? lien.acteur, via: 'mcp', maintenant: new Date(t) };
    try {
      const r = await DOC.deposerDocument({
        donnees: base, stockage: typeof stockage === 'function' ? stockage() : stockage, espace, ctx,
        ecrire: DOC.ecritureEcran({ donnees: base, ctx, outil: 'deposer_document' }),
        cibleType: lien.cibleType, cibleId: lien.cibleId, nom, octets,
      });
      journal({ action: 'depot_lien', statut: 'ok', taille: r.taille });
      return json(res, 200, { ok: true, id: r.id, nom: r.nom, taille: r.taille, [lien.cibleType === 'affaire' ? 'affaireId' : 'projetId']: lien.cibleId });
    } catch (e) {
      await restituerLien(base, jeton, lien); // le fichier n'est pas rangé : le lien resservira jusqu'à son échéance
      if (e instanceof DOC.ErreurDocument) {
        journal({ action: 'depot_lien', statut: 'refus', code: e.code });
        return json(res, e.code === 'introuvable' ? 404 : e.code === 'refuse' || e.code === 'demande_invalide' ? 422 : 503, { ok: false, erreur: e.message });
      }
      journal({ action: 'depot_lien', statut: 'erreur' });
      return json(res, 500, { ok: false, erreur: 'Le fichier n\'a pas pu être enregistré. Réessayez.' });
    }
  };
}
