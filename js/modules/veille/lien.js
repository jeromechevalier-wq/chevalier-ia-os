// Module Veille : reconnaître un lien YouTube collé à la main (un épisode ou une chaîne) et lire les pages YouTube utiles.
// Aucune dépendance (ni Firebase ni DOM ni réseau) : ce fichier sert à l'écran (savoir quels boutons montrer) ET au serveur
// (functions/partage/veille-lien.js, copie faite par scripts/preparer-fonctions.js) et se teste seul (tests/veille-lien.test.js).

export const NB_EPISODES_CHAINE = 5; // décision de Jérôme (2026-10-15) : à l'ajout d'une chaîne, on prend ses 5 derniers épisodes

const HOTES = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);
const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const ID_CHAINE = /^UC[A-Za-z0-9_-]{22}$/;
const POIGNEE = /^@[\p{L}\p{N}._-]{1,100}$/u;
const NOM_SIMPLE = /^[\p{L}\p{N}._%-]{1,100}$/u;

export const urlVideo = (id) => `https://www.youtube.com/watch?v=${id}`;
export const urlFluxChaine = (idChaine) => `https://www.youtube.com/feeds/videos.xml?channel_id=${idChaine}`;

/**
 * Analyse un lien collé. Renvoie :
 *   { genre: 'video', id, url }                                    un épisode (watch?v=, youtu.be/, shorts/, live/, embed/)
 *   { genre: 'chaine', idChaine | null, page, url }                une chaîne (/channel/UC…, /@nom, /c/nom, /user/nom) ; `page` = adresse de sa page, pour retrouver son identifiant
 *   null                                                           tout le reste (autre site, liste de lecture seule, texte quelconque)
 */
export function analyserLien(brut) {
  let t = String(brut ?? '').trim();
  if (!t || /\s/.test(t)) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  let u;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const hote = u.hostname.toLowerCase();
  if (!HOTES.has(hote)) return null;
  const segs = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });

  if (hote.endsWith('youtu.be')) {
    return ID_VIDEO.test(segs[0] ?? '') ? { genre: 'video', id: segs[0], url: urlVideo(segs[0]) } : null;
  }
  if (segs[0] === 'watch') {
    const v = u.searchParams.get('v') ?? '';
    return ID_VIDEO.test(v) ? { genre: 'video', id: v, url: urlVideo(v) } : null;
  }
  if (['shorts', 'live', 'embed', 'v'].includes(segs[0] ?? '') && ID_VIDEO.test(segs[1] ?? '')) return { genre: 'video', id: segs[1], url: urlVideo(segs[1]) };

  if (segs[0] === 'channel' && ID_CHAINE.test(segs[1] ?? '')) {
    return { genre: 'chaine', idChaine: segs[1], page: `https://www.youtube.com/channel/${segs[1]}`, url: `https://www.youtube.com/channel/${segs[1]}` };
  }
  if (POIGNEE.test(segs[0] ?? '')) {
    const page = `https://www.youtube.com/${encodeURIComponent(segs[0]).replace('%40', '@')}`;
    return { genre: 'chaine', idChaine: null, page, url: page };
  }
  if ((segs[0] === 'c' || segs[0] === 'user') && NOM_SIMPLE.test(segs[1] ?? '')) {
    const page = `https://www.youtube.com/${segs[0]}/${encodeURIComponent(segs[1])}`;
    return { genre: 'chaine', idChaine: null, page, url: page };
  }
  return null;
}

/** Identifiant de chaîne (UC…) lu dans le code d'une page de chaîne YouTube. `null` si introuvable. */
export function idChaineDansPage(html) {
  const t = String(html ?? '');
  const motifs = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/,
    /<meta itemprop="(?:identifier|channelId)" content="(UC[A-Za-z0-9_-]{22})"/,
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /"browseId":"(UC[A-Za-z0-9_-]{22})"/,
  ];
  for (const m of motifs) {
    const r = t.match(m);
    if (r) return r[1];
  }
  return null;
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decoder(t) {
  return String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e.toLowerCase()] ?? tout;
  }).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}
const balise = (bloc, nom) => {
  const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`));
  return m ? decoder(m[1]) : '';
};

/**
 * Flux YouTube d'une chaîne (Atom) -> { idChaine, nom, videos: [{ id, titre, url, datePublication }] } (les plus récentes d'abord, `max` au plus).
 * Une entrée sans identifiant ou sans titre valide est ignorée.
 */
export function lireFluxChaine(xml, max = NB_EPISODES_CHAINE) {
  const t = String(xml ?? '');
  const premiere = t.indexOf('<entry>');
  const entete = premiere === -1 ? t : t.slice(0, premiere);
  const brutChaine = balise(entete, 'yt:channelId');
  const idChaine = /^[A-Za-z0-9_-]{22}$/.test(brutChaine) ? `UC${brutChaine}` : brutChaine; // le flux donne l'identifiant sans son « UC » du début
  const nom = balise(entete, 'title');
  const videos = [];
  for (const m of t.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = balise(m[1], 'yt:videoId');
    const titre = balise(m[1], 'title');
    if (!ID_VIDEO.test(id) || !titre) continue;
    const date = new Date(balise(m[1], 'published'));
    videos.push({ id, titre: titre.slice(0, 300), url: urlVideo(id), datePublication: Number.isNaN(date.getTime()) ? null : date });
    if (videos.length >= max) break;
  }
  return { idChaine: ID_CHAINE.test(idChaine) ? idChaine : null, nom: nom.slice(0, 120), videos };
}
