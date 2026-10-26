// Rangement du PDF d'un devis dans Cloud Storage (le stockage du projet Firebase) : plus de Drive, rien à configurer chez un client.
// Le PDF n'est JAMAIS public : le navigateur n'a aucun accès direct à ce chemin (le serveur écrit avec ses droits d'administration), et la lecture passe par
// un lien signé de très courte durée, demandé à la fonction appelable `devisPdfLien` (comptes autorisés seulement).
// Chemin : <espace>devis/<affaire>/<devis>/<fichier>.pdf. `espace` vaut '' chez Jérôme (racine) et 'clients/<client>/' chez un client : même cloisonnement
// que les données. Le `bucket` est injecté (les tests n'ouvrent aucun vrai stockage).

export const DUREE_LIEN_MINUTES = 5;
export const NOM_PDF_BROUILLON = 'brouillon.pdf';
const MOTIF_ESPACE = /^(?:clients\/[a-z0-9][a-z0-9_-]{0,39}\/)?$/;

/** Nom de fichier propre : pas de / ni de caractères de contrôle, 120 caractères au plus (l'extension est gardée). */
export function nettoyerNom(s, max = 120) {
  const n = String(s ?? '').replace(/[\/\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length <= max) return n;
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(n);
  const ext = m ? m[0] : '';
  return `${n.slice(0, max - ext.length).trim()}${ext}`;
}

/** DEV-2026-10-24-001 v2 - Objet.pdf (nom du fichier dans Storage). */
export function nomFichierDevis({ numero, version, objet } = {}) {
  const tete = nettoyerNom(`${numero || 'DEVIS'} v${version || 1}`, 60);
  const obj = nettoyerNom(objet || '', 50);
  const nom = obj ? `${tete} - ${obj}` : tete;
  return `${nettoyerNom(nom, 116)}.pdf`;
}

/** « 26-10-2026 14h32 », en heure de Paris (fuseau calculé par Intl, jamais par l'heure du serveur). `date` : injectée (les essais donnent une date fixe). */
export function horodatageParis(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}h${p.minute}`;
}

/**
 * Nom lisible du document de l'affaire : « Devis DEV-… v1 – Objet.pdf », ou, pour le brouillon, « Devis brouillon – Objet – 26-10-2026 14h32.pdf » (date et heure de Paris
 * du dernier téléchargement ; un seul document brouillon par devis, remplacé et renommé à chaque fois). Le mot « Devis » est toujours là : dans les Documents d'une affaire, on voit tout de suite que c'est un devis.
 * `date` : seulement pour le brouillon. Le nom est nettoyé et borné ; l'horodatage est gardé en entier (c'est l'objet qui est raccourci).
 */
export function libelleDocumentDevis({ numero, version, objet, brouillon = false, date } = {}) {
  const tete = brouillon ? 'Devis brouillon' : `Devis ${nettoyerNom(`${numero || 'DEVIS'} v${version || 1}`, 60)}`;
  const obj = nettoyerNom(objet || '', 50);
  const quand = brouillon ? horodatageParis(date ?? new Date()) : '';
  const fin = quand ? ` – ${quand}` : '';
  const debut = obj ? `${tete} – ${obj}` : tete;
  const place = Math.max(10, 116 - fin.length);
  return `${nettoyerNom(`${nettoyerNom(debut, place)}${fin}`, 116)}.pdf`;
}

/** Un morceau de chemin : lettres, chiffres, tiret et tiret bas seulement (jamais « / » ni « .. »). */
const morceau = (v, defaut) => {
  const m = String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  return m || defaut;
};

/** Chemin Storage d'un PDF de devis. `espace` : '' ou 'clients/<client>/'. Le brouillon a un nom fixe : il REMPLACE le précédent. */
export function cheminPdfDevis({ espace = '', affaireId, devisId, brouillon = false, nomFichier }) {
  if (!MOTIF_ESPACE.test(espace)) throw new Error('Stockage : espace invalide.');
  const fichier = brouillon ? NOM_PDF_BROUILLON : nettoyerNom(nomFichier || 'devis.pdf').replace(/\.{2,}/g, '.');
  return `${espace}devis/${morceau(affaireId, 'sans-affaire')}/${morceau(devisId, 'devis')}/${fichier}`;
}

/** Ce chemin est-il bien dans le dossier des devis de CET espace ? (contrôle avant de signer un lien) */
export function cheminAppartientALEspace(chemin, espace = '') {
  return typeof chemin === 'string' && MOTIF_ESPACE.test(espace) && chemin.startsWith(`${espace}devis/`) && !chemin.includes('..') && chemin.endsWith('.pdf');
}

/**
 * Stockage réel autour d'un `bucket` de firebase-admin (ou d'un faux pour les essais).
 * Les messages d'erreur commencent par « Stockage : » : ils sont écrits pour être lus et ne contiennent ni chemin ni jeton.
 */
export function creerStockage({ bucket, maintenant = Date.now }) {
  if (!bucket || typeof bucket.file !== 'function') throw new Error('Stockage : espace de stockage manquant.');
  return {
    async envoyer(chemin, pdf) {
      if (!pdf || !pdf.length) throw new Error('Stockage : PDF vide.');
      try {
        await bucket.file(chemin).save(pdf, { contentType: 'application/pdf', resumable: false, metadata: { cacheControl: 'private, max-age=0, no-store' } });
      } catch (e) {
        throw new Error('Stockage : le PDF n\'a pas pu être enregistré.', { cause: e });
      }
    },
    /** Supprime un fichier (déjà absent = rien à faire). */
    async supprimer(chemin) {
      try { await bucket.file(chemin).delete({ ignoreNotFound: true }); } catch (e) { throw new Error('Stockage : le fichier n\'a pas pu être supprimé.', { cause: e }); }
    },
    async existe(chemin) {
      try { const [oui] = await bucket.file(chemin).exists(); return oui === true; } catch { return false; }
    },
    /** Taille du fichier en octets (null si elle n'est pas lisible). */
    async taille(chemin) {
      try { const [meta] = await bucket.file(chemin).getMetadata(); const n = Number(meta?.size); return Number.isFinite(n) && n >= 0 ? n : null; } catch { return null; }
    },
    /** Lien de lecture signé, valable `minutes` minutes (5 par défaut). */
    async lienSigne(chemin, { minutes = DUREE_LIEN_MINUTES, nomAffiche = '' } = {}) {
      try {
        const [url] = await bucket.file(chemin).getSignedUrl({
          version: 'v4', action: 'read', expires: maintenant() + minutes * 60_000,
          ...(nomAffiche ? { responseDisposition: `inline; filename="${nettoyerNom(nomAffiche).replace(/["\u0080-￿]/g, '_')}"` } : {}),
          responseType: 'application/pdf',
        });
        return url;
      } catch (e) {
        throw new Error('Stockage : le lien du PDF n\'a pas pu être créé.', { cause: e });
      }
    },
  };
}
