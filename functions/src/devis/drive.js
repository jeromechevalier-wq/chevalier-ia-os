// Rangement du PDF de devis dans Drive : <dossier de travail de l'affaire>/Devis/. Client Drive injecté.
const SCOPE = 'https://www.googleapis.com/auth/drive';
const API = 'https://www.googleapis.com/drive/v3';
const API_ENVOI = 'https://www.googleapis.com/upload/drive/v3';
export const SCOPE_DRIVE = SCOPE;

/** Apostrophes et antislashs échappés pour une requête Drive. */
export function echapperRequete(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/** Nom de fichier ou de dossier propre : pas de / ni de caractères de contrôle, 120 caractères au plus. */
export function nettoyerNom(s, max = 120) {
  const n = String(s ?? '').replace(/[\/\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return n.length > max ? n.slice(0, max).trim() : n;
}

/** DEV-2026-10-24-001 v2 - Objet.pdf */
export function nomFichierDevis({ numero, version, objet } = {}) {
  const tete = nettoyerNom(`${numero || 'DEVIS'} v${version || 1}`, 60);
  const obj = nettoyerNom(objet || '', 50);
  const nom = obj ? `${tete} - ${obj}` : tete;
  return `${nettoyerNom(nom, 116)}.pdf`;
}

async function trouverOuCreer(drive, nom, parentId) {
  const existant = await drive.chercherDossier(nom, parentId);
  if (existant && existant.id) return existant.id;
  const cree = await drive.creerDossier(nom, parentId);
  return cree.id;
}

/** « a.pdf » -> « a (2).pdf », « a (3).pdf »… tant que le nom existe. */
async function nomLibre(drive, nom, parentId) {
  if (!drive.fichierExiste) return nom;
  const pt = nom.lastIndexOf('.');
  const racine = pt > 0 ? nom.slice(0, pt) : nom;
  const ext = pt > 0 ? nom.slice(pt) : '';
  let candidat = nom;
  for (let i = 2; await drive.fichierExiste(candidat, parentId); i += 1) {
    if (i > 200) throw new Error('Drive : trop de fichiers du même nom.');
    candidat = `${racine} (${i})${ext}`;
  }
  return candidat;
}

export async function rangerPdfDevis({ drive, dossierParentId, dossierRacineId, nomAffaire, nomFichier, pdf }) {
  if (!drive) throw new Error('Drive : client manquant.');
  if (!pdf || !pdf.length) throw new Error('Drive : PDF vide.');
  let dossierAffaireId = dossierParentId;
  if (!dossierAffaireId) {
    if (!dossierRacineId) throw new Error("Drive : l'affaire n'a pas de dossier de travail et aucun dossier racine n'est configuré.");
    const nom = nettoyerNom(nomAffaire) || 'Affaire sans nom';
    dossierAffaireId = await trouverOuCreer(drive, nom, dossierRacineId);
  }
  const dossierDevisId = await trouverOuCreer(drive, 'Devis', dossierAffaireId);
  const nom = await nomLibre(drive, nettoyerNom(nomFichier) || 'Devis.pdf', dossierDevisId);
  const f = await drive.envoyerFichier({ nom, parentId: dossierDevisId, contenu: pdf, mimeType: 'application/pdf' });
  return { fileId: f.id, lien: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, dossierAffaireId, dossierDevisId };
}

/** Vrai client sur l'API REST Drive v3. `auth.obtenirJeton()` rend un jeton d'accès (scope Drive) ; aucune clé ici. */
export function creerClientDrive({ auth, fetchImpl = fetch, urlApi = API, urlEnvoi = API_ENVOI } = {}) {
  if (!auth || typeof auth.obtenirJeton !== 'function') throw new Error('Drive : fournisseur de jeton manquant.');
  async function appel(url, opts = {}) {
    const jeton = await auth.obtenirJeton();
    const rep = await fetchImpl(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(30000) });
    if (!rep.ok) throw new Error(`Drive : réponse ${rep.status}.`);
    return rep.json();
  }
  const liste = async (q) => {
    const p = new URLSearchParams({ q, fields: 'files(id,name)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '10' });
    const r = await appel(`${urlApi}/files?${p}`);
    return r.files || [];
  };
  return {
    async chercherDossier(nom, parentId) {
      const f = await liste(`name='${echapperRequete(nom)}' and '${echapperRequete(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      return f[0] || null;
    },
    async fichierExiste(nom, parentId) {
      const f = await liste(`name='${echapperRequete(nom)}' and '${echapperRequete(parentId)}' in parents and trashed=false`);
      return f.length > 0;
    },
    async creerDossier(nom, parentId) {
      return appel(`${urlApi}/files?supportsAllDrives=true&fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' }),
      });
    },
    async envoyerFichier({ nom, parentId, contenu, mimeType }) {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: nom, parents: [parentId] })], { type: 'application/json' }));
      form.append('file', new Blob([contenu], { type: mimeType }));
      return appel(`${urlEnvoi}/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, { method: 'POST', body: form });
    },
  };
}

/** Jeton d'accès réel du compte de service de la fonction (google-auth-library chargée à l'usage). */
export function authGoogleDrive() {
  let auth;
  return {
    async obtenirJeton() {
      if (!auth) { const { GoogleAuth } = await import('google-auth-library'); auth = new GoogleAuth({ scopes: [SCOPE] }); }
      return (await auth.getAccessToken()) || '';
    },
  };
}
