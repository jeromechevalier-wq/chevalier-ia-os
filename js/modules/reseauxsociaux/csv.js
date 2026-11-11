// Lecteur de fichiers CSV (RFC 4180) pour l'import LinkedIn : texte entre guillemets, guillemets doublés, retours à la ligne dans un champ, BOM au début.
// Aucune dépendance (ni Firebase ni DOM) : importable par les tests Node. Rien n'est envoyé nulle part, tout se lit dans le navigateur.

/** Découpe un texte CSV en lignes de champs (tableaux de chaînes). Les lignes entièrement vides sont ignorées. */
export function lireCsv(texte) {
  let t = String(texte ?? '');
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  const finChamp = () => { ligne.push(champ); champ = ''; };
  const finLigne = () => {
    finChamp();
    if (ligne.some((c) => c.trim() !== '')) lignes.push(ligne);
    ligne = [];
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++; } else entreGuillemets = false;
      } else champ += c;
    } else if (c === '"' && champ === '') entreGuillemets = true;
    else if (c === ',') finChamp();
    else if (c === '\n') finLigne();
    else if (c === '\r') { if (t[i + 1] === '\n') i++; finLigne(); } else champ += c;
  }
  if (champ !== '' || ligne.length) finLigne();
  return lignes;
}

/** Nom de colonne comparable : sans accents, sans casse, sans espaces ni ponctuation (« Sender Profile URL » = « senderprofileurl »). */
export function normaliserEntete(texte) {
  return String(texte ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Cherche la ligne d'en-tête (les fichiers de LinkedIn peuvent commencer par des lignes de notes) puis rend les lignes suivantes sous forme d'objets.
 * `colonnes` : { cle: [noms acceptés, anglais ou français] } ; `requises` : les clés indispensables. Rend null si aucune ligne ne porte toutes les colonnes requises.
 * Une colonne facultative absente donne la chaîne vide.
 */
export function lireTable(lignes, colonnes, requises) {
  const aliases = Object.fromEntries(Object.entries(colonnes).map(([cle, noms]) => [cle, new Set(noms.map(normaliserEntete))]));
  for (let i = 0; i < lignes.length; i++) {
    const normalisees = lignes[i].map(normaliserEntete);
    const position = {};
    for (const cle of Object.keys(aliases)) {
      const p = normalisees.findIndex((n) => aliases[cle].has(n));
      if (p >= 0) position[cle] = p;
    }
    if (!requises.every((cle) => cle in position)) continue;
    return {
      indexEntete: i,
      lignes: lignes.slice(i + 1).map((l) => Object.fromEntries(Object.keys(colonnes).map((cle) => [cle, cle in position ? String(l[position[cle]] ?? '').trim() : '']))),
    };
  }
  return null;
}

// Colonnes des trois fichiers lus (noms de l'export de LinkedIn en anglais et en français ; à confirmer avec un vrai export).
export const COLONNES_MESSAGES = {
  conversation: ['CONVERSATION ID', 'ID DE LA CONVERSATION', 'ID CONVERSATION', 'CONVERSATION'],
  de: ['FROM', 'DE', 'EXPEDITEUR'],
  urlDe: ['SENDER PROFILE URL', 'URL DU PROFIL DE L EXPEDITEUR', 'URL DE PROFIL DE L EXPEDITEUR', 'URL PROFIL EXPEDITEUR'],
  vers: ['TO', 'A', 'DESTINATAIRE', 'DESTINATAIRES'],
  urlVers: ['RECIPIENT PROFILE URLS', 'URL DES PROFILS DES DESTINATAIRES', 'URLS DES PROFILS DES DESTINATAIRES', 'URL PROFIL DESTINATAIRE'],
  date: ['DATE', 'DATE D ENVOI'],
  dossier: ['FOLDER', 'DOSSIER'],
};
export const REQUISES_MESSAGES = ['conversation', 'de', 'vers', 'date'];

export const COLONNES_RELATIONS = {
  prenom: ['FIRST NAME', 'PRENOM'],
  nom: ['LAST NAME', 'NOM', 'NOM DE FAMILLE'],
  url: ['URL', 'PROFILE URL', 'URL DU PROFIL'],
};
export const REQUISES_RELATIONS = ['prenom', 'nom', 'url'];

export const COLONNES_PROFIL = {
  prenom: ['FIRST NAME', 'PRENOM'],
  nom: ['LAST NAME', 'NOM', 'NOM DE FAMILLE'],
};
export const REQUISES_PROFIL = ['prenom', 'nom'];
