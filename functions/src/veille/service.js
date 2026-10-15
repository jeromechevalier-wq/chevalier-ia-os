// Service de la Veille appelé par l'appli (fonction `veille`) : ajouter un lien collé à la main (épisode ou chaîne YouTube) et lancer un résumé.
// Aucune dépendance en dur : la base (`donnees`, voir partage/porte/adaptateur.js), le réseau (`fetchImpl`), l'horloge et le jeton du bouton Résumer sont injectés,
// pour tout tester sans réseau. Les tables sont celles de la porte : veille_sources, veille_contenus (à la racine chez Jérôme, `base` pour un client).
import { analyserLien, idChaineDansPage, lireFluxChaine, urlFluxChaine, NB_EPISODES_CHAINE } from '../../partage/veille-lien.js';

export const ADRESSE_RESUMER = 'https://n8n.chevalier-ia.fr/webhook/veille-resumer-porte';
export const SOURCE_MANUELLE = Object.freeze({ id: 'ajouts-manuels', nom: 'Ajouts manuels' });
const DELAI_RESEAU_MS = 15_000;
const DELAI_RESUMER_MS = 25_000;
const OCTETS_PAGE_MAX = 6_000_000;
const EN_TETES_YOUTUBE = { 'User-Agent': 'Mozilla/5.0 (compatible; ChevalierIA-Veille/1.0)', 'Accept-Language': 'fr-FR,fr;q=0.9', Cookie: 'SOCS=CAI' }; // le cookie évite la page de consentement européenne

/** Erreur « métier » : code stable, message écrit pour être lu par Jérôme. */
export class ErreurVeille extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurVeille';
    this.code = code;
  }
}

const chemin = (base, table, id) => `${base ? `${base}/` : ''}${table}${id === undefined ? '' : `/${id}`}`;
const sansIndefini = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export function creerServiceVeille({ donnees, fetchImpl = fetch, maintenant = Date.now, adresseResumer = ADRESSE_RESUMER, lireJeton }) {
  async function chercher(url, { delai = DELAI_RESEAU_MS, entetes = {} } = {}) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delai);
    try {
      return await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow', headers: entetes });
    } finally {
      clearTimeout(minuteur);
    }
  }
  async function texte(url, options) {
    let r;
    try { r = await chercher(url, options); } catch { throw new ErreurVeille('youtube_injoignable', 'YouTube ne répond pas pour le moment. Réessayer dans un instant.'); }
    if (!r.ok) throw new ErreurVeille(r.status === 404 ? 'introuvable' : 'youtube_refuse', r.status === 404 ? 'Ce lien ne mène à rien sur YouTube.' : 'YouTube a refusé la demande. Réessayer plus tard.');
    const t = await r.text();
    return t.length > OCTETS_PAGE_MAX ? t.slice(0, OCTETS_PAGE_MAX) : t;
  }

  async function assurerSource(base, source, auteur) {
    const existante = await donnees.lireDoc(chemin(base, 'veille_sources', source.id));
    if (existante) return { ...existante, nouvelle: false };
    const doc = sansIndefini({ ...source.data, type: 'YouTube', actif: true, origine: 'appli', ecritPar: auteur, creeLe: new Date(maintenant()) });
    await donnees.creerSiAbsent(chemin(base, 'veille_sources', source.id), doc);
    return { ...doc, id: source.id, nouvelle: true };
  }

  async function ajouterContenu(base, c, source, auteur) {
    const doc = sansIndefini({
      sourceId: source.id, sourceNom: source.nom, titre: c.titre, url: c.url, type: 'YouTube', etat: 'nouveau',
      datePublication: c.datePublication ?? undefined, detecteLe: new Date(maintenant()), origine: 'appli', ecritPar: auteur,
    });
    return donnees.creerSiAbsent(chemin(base, 'veille_contenus', c.id), doc);
  }

  /** Épisode seul : titre et chaîne par oEmbed, rangé dans la source « Ajouts manuels ». */
  async function ajouterEpisode(base, lien, auteur) {
    const deja = await donnees.lireDoc(chemin(base, 'veille_contenus', lien.id));
    if (deja) return { genre: 'video', ids: [lien.id], crees: 0, existants: 1, titre: deja.titre, sourceNom: deja.sourceNom };
    const brut = await texte(`https://www.youtube.com/oembed?url=${encodeURIComponent(lien.url)}&format=json`);
    let info;
    try { info = JSON.parse(brut); } catch { info = null; }
    const titre = typeof info?.title === 'string' ? info.title.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300) : '';
    if (!titre) throw new ErreurVeille('introuvable', 'Cet épisode est introuvable ou privé.');
    const source = await assurerSource(base, { id: SOURCE_MANUELLE.id, data: { nom: SOURCE_MANUELLE.nom, note: 'Épisodes ajoutés à la main depuis l\'appli (un lien collé).' } }, auteur);
    const cree = await ajouterContenu(base, { id: lien.id, titre, url: lien.url }, { id: source.id, nom: source.nom ?? SOURCE_MANUELLE.nom }, auteur);
    return { genre: 'video', ids: [lien.id], crees: cree ? 1 : 0, existants: cree ? 0 : 1, titre, sourceNom: source.nom ?? SOURCE_MANUELLE.nom };
  }

  /** Chaîne : on la suit (source active, relevée ensuite par la collecte du lundi) et on prend ses 5 derniers épisodes. */
  async function ajouterChaine(base, lien, auteur) {
    let idChaine = lien.idChaine;
    if (!idChaine) {
      const page = await texte(lien.page, { entetes: EN_TETES_YOUTUBE });
      idChaine = idChaineDansPage(page);
      if (!idChaine) throw new ErreurVeille('chaine_introuvable', 'Je ne retrouve pas cette chaîne. Vérifier le lien (il doit mener à une chaîne YouTube).');
    }
    const flux = lireFluxChaine(await texte(urlFluxChaine(idChaine)), NB_EPISODES_CHAINE);
    const nom = flux.nom || lien.page;
    const source = await assurerSource(base, {
      id: idChaine,
      data: { nom, url: lien.page, page: lien.page, identifiantYoutube: idChaine, fluxRss: urlFluxChaine(idChaine), note: 'Chaîne ajoutée à la main depuis l\'appli.' },
    }, auteur);
    let crees = 0;
    for (const v of flux.videos) if (await ajouterContenu(base, v, { id: idChaine, nom: source.nom ?? nom }, auteur)) crees++;
    return { genre: 'chaine', ids: flux.videos.map((v) => v.id), crees, existants: flux.videos.length - crees, sourceNom: source.nom ?? nom, sourceNouvelle: source.nouvelle };
  }

  /** Lance le workflow n8n « résumer à la demande » pour un contenu (le jeton reste ici, jamais dans la page). */
  async function resumer(base, contenuId) {
    if (typeof contenuId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(contenuId)) throw new ErreurVeille('requete_invalide', 'Contenu inconnu.');
    const contenu = await donnees.lireDoc(chemin(base, 'veille_contenus', contenuId));
    if (!contenu) throw new ErreurVeille('contenu_inconnu', 'Ce contenu n\'existe pas (ou plus).');
    if (contenu.etat === 'en_cours') return { lance: false, raison: 'deja_en_cours', message: 'Ce résumé est déjà en cours de préparation.' };
    if (contenu.etat === 'resume') return { lance: false, raison: 'deja_resume', message: 'Ce contenu est déjà résumé.' };
    let jeton;
    try { jeton = String(await lireJeton()).trim(); } catch { jeton = ''; }
    if (!jeton) throw new ErreurVeille('jeton_absent', 'Le bouton Résumer n\'est pas encore configuré côté serveur (jeton manquant).');
    let r;
    try {
      r = await chercher(`${adresseResumer}?video_id=${encodeURIComponent(contenuId)}&token=${encodeURIComponent(jeton)}`, { delai: DELAI_RESUMER_MS });
    } catch {
      throw new ErreurVeille('n8n_injoignable', 'Le service de résumé ne répond pas. Réessayer dans un instant.');
    }
    if (r.status === 403) throw new ErreurVeille('jeton_refuse', 'Le service de résumé a refusé la demande (jeton à vérifier).');
    if (!r.ok) throw new ErreurVeille('n8n_erreur', 'Le service de résumé a rencontré un problème. Réessayer plus tard.');
    const page = await r.text();
    if (/Résumé lancé/.test(page)) return { lance: true, message: 'Résumé lancé. Il apparaît ici dans quelques minutes.' };
    if (/déjà en cours/.test(page)) return { lance: false, raison: 'deja_en_cours', message: 'Ce résumé est déjà en cours de préparation.' };
    if (/déjà résumée/.test(page)) return { lance: false, raison: 'deja_resume', message: 'Ce contenu est déjà résumé.' };
    return { lance: false, raison: 'rien_a_lancer', message: 'Rien à lancer pour ce contenu.' };
  }

  return {
    /** `url` : le lien collé. `lancerResume` : seulement utile pour un épisode (une chaîne n'est jamais résumée d'office : 5 résumés coûteraient trop). */
    async ajouterLien({ base = '', url, lancerResume = false, auteur }) {
      const lien = analyserLien(url);
      if (!lien) throw new ErreurVeille('lien_non_reconnu', 'Ce lien n\'est ni un épisode ni une chaîne YouTube.');
      const r = lien.genre === 'video' ? await ajouterEpisode(base, lien, auteur) : await ajouterChaine(base, lien, auteur);
      if (lien.genre === 'video' && lancerResume) {
        try { r.resume = await resumer(base, lien.id); } catch (e) { if (e instanceof ErreurVeille) r.resume = { lance: false, raison: e.code, message: e.message }; else throw e; }
      }
      return r;
    },
    resumer: ({ base = '', contenuId }) => resumer(base, contenuId),
  };
}
