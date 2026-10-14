// Écrans du module Veille : « Contenus » (liste filtrable avec l'état et les liens des résumés) et « Sources » (ce que Jérôme suit).
// Lecture seule : aucun bouton n'écrit dans la base. Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML),
// et un lien n'est cliquable que s'il commence par http(s) (L.lienSur).
import { h, icone, remplir } from '../../os/ui.js';
import { estChezClient } from '../../os/contexte.js';
import * as D from './donnees.js';
import * as L from './logique.js';

function lien(url, libelle, classe = 'veille-lien') {
  const sur = L.lienSur(url);
  return sur ? h('a', { class: classe, href: sur, target: '_blank', rel: 'noopener noreferrer' }, libelle, icone('external-link', { taille: 13 })) : null;
}

const pastille = (etat) => h('span', { class: `veille-pastille etat-${etat}` }, h('i', { class: 'veille-point' }), L.LIBELLES_ETAT[etat]);

export function rendreContenus(conteneur) {
  const filtres = { sourceId: '', type: '', etat: '', texte: '' };
  let signature = '';

  const resume = h('div', { class: 'veille-resume', 'aria-live': 'polite' });
  const selSource = h('select', { class: 'champ', 'aria-label': 'Filtrer par source', onchange: (e) => { filtres.sourceId = e.target.value; signature = ''; rendre(); } });
  const selType = h('select', { class: 'champ', 'aria-label': 'Filtrer par type', onchange: (e) => { filtres.type = e.target.value; signature = ''; rendre(); } },
    h('option', { value: '' }, 'Tous les types'), L.TYPES.map((t) => h('option', { value: t }, t)));
  const selEtat = h('select', { class: 'champ', 'aria-label': 'Filtrer par état', onchange: (e) => { filtres.etat = e.target.value; signature = ''; rendre(); } },
    L.OPTIONS_ETAT.map((o) => h('option', { value: o.valeur }, o.libelle)));
  const recherche = h('input', { type: 'search', class: 'champ', placeholder: 'Chercher dans les titres', 'aria-label': 'Chercher dans les titres', oninput: (e) => { filtres.texte = e.target.value; signature = ''; rendre(); } });
  const liste = h('ol', { class: 'veille-liste' });

  conteneur.append(h('div', { class: 'page page-liste page-veille' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Veille')),
    resume,
    h('div', { class: 'veille-filtres' }, selSource, selType, selEtat, recherche),
    liste));

  function remplirFiltreSources() {
    const options = L.optionsSources(D.etat.sources, D.etat.contenus);
    const sig = JSON.stringify(options);
    if (selSource.dataset.sig === sig) return;
    selSource.dataset.sig = sig;
    remplir(selSource, h('option', { value: '' }, 'Toutes les sources'), options.map((o) => h('option', { value: o.id }, o.nom)));
    selSource.value = options.some((o) => o.id === filtres.sourceId) ? filtres.sourceId : '';
    filtres.sourceId = selSource.value;
  }

  function ligne(x, derniers) {
    const etat = L.normaliserEtat(x.etat);
    const r = derniers.get(x.id);
    const date = L.dateTexte(x.datePublication);
    const titre = lien(x.url, x.titre || 'Sans titre', 'veille-titre') || h('span', { class: 'veille-titre' }, x.titre || 'Sans titre');
    // Modèle, coût et payeur : réservés au propriétaire de la base. Un client ne voit jamais ce que coûte la production (décision du 2026-10-12).
    const interne = !estChezClient();
    const cout = r && interne ? L.coutTexte(r) : null;
    const detailsResume = r ? [
      lien(r.lienHtml, 'Résumé complet'), lien(r.lienCourt, 'Résumé court'), lien(r.lienTranscript, 'Texte intégral'),
      interne && r.modele ? h('span', { class: 'veille-meta' }, r.modele) : null,
      cout ? h('span', { class: 'veille-meta' }, cout) : null,
      interne && r.payeur && L.LIBELLES_PAYEUR[r.payeur] ? h('span', { class: 'veille-meta' }, `Payé par : ${L.LIBELLES_PAYEUR[r.payeur]}`) : null,
    ] : null;
    return h('li', { class: 'veille-ligne', dataset: { id: x.id, etat } },
      h('div', { class: 'veille-principal' }, titre,
        h('div', { class: 'veille-meta' }, L.nomSource(x, D.etat.sources), ' · ', L.normaliserType(x.type), date ? ` · ${date}` : ''),
        detailsResume ? h('div', { class: 'veille-actions' }, detailsResume) : null,
        etat === 'echec' && x.etapeEchec ? h('div', { class: 'veille-erreur' }, h('span', { class: 'veille-erreur-cle' }, 'Étape en échec : '), x.etapeEchec) : null),
      pastille(etat));
  }

  function rendre() {
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'veille-vide' }, 'Chargement…')); return; }
    remplirFiltreSources();
    const visibles = L.filtrer(D.etat.contenus, filtres);
    const sig = JSON.stringify([filtres, D.etat.sources.map((s) => s.nom), visibles.map((x) => [x.id, x.etat, x.titre]), D.etat.resumes.map((r) => [r.id, r.contenuId])]);
    if (sig === signature) return;
    signature = sig;
    const c = L.compteurs(D.etat.contenus);
    remplir(resume,
      h('span', { class: 'veille-puce nv' }, h('b', {}, String(c.nouveau)), c.nouveau > 1 ? ' nouveaux' : ' nouveau'),
      h('span', { class: 'veille-puce run' }, h('b', {}, String(c.en_cours)), ' en cours'),
      h('span', { class: 'veille-puce ok' }, h('b', {}, String(c.resume)), c.resume > 1 ? ' résumés' : ' résumé'),
      h('span', { class: 'veille-puce ko' }, h('b', {}, String(c.echec)), c.echec > 1 ? ' échecs' : ' échec'));
    if (!visibles.length) {
      remplir(liste, h('li', { class: 'veille-vide' }, D.etat.contenus.length
        ? 'Aucun contenu ne correspond à ces filtres.'
        : 'Aucun contenu pour le moment. Les contenus détectés par la veille apparaîtront ici.'));
      return;
    }
    const derniers = L.dernierResumeParContenu(D.etat.resumes);
    remplir(liste, visibles.map((x) => ligne(x, derniers)));
  }

  const arretDonnees = D.surChangement(rendre);
  rendre();
  return function quitter() { arretDonnees(); };
}

export function rendreSources(conteneur) {
  const liste = h('ol', { class: 'veille-liste' });
  conteneur.append(h('div', { class: 'page page-liste page-veille' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Sources suivies')), liste));

  function rendre() {
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'veille-vide' }, 'Chargement…')); return; }
    if (!D.etat.sources.length) { remplir(liste, h('li', { class: 'veille-vide' }, 'Aucune source pour le moment.')); return; }
    const nombres = L.nombreParSource(D.etat.contenus);
    remplir(liste, L.trierSources(D.etat.sources).map((s) => {
      const actif = s.actif === true;
      const n = nombres.get(s.id) ?? 0;
      return h('li', { class: 'veille-ligne', dataset: { id: s.id, actif: actif ? 'oui' : 'non' } },
        h('div', { class: 'veille-principal' },
          lien(s.page || s.url, s.nom || 'Source', 'veille-titre') || h('span', { class: 'veille-titre' }, s.nom || 'Source'),
          h('div', { class: 'veille-meta' }, L.normaliserType(s.type), ` · ${n} contenu${n > 1 ? 's' : ''}`),
          s.note ? h('div', { class: 'veille-note' }, s.note) : null),
        h('span', { class: `veille-pastille etat-${actif ? 'resume' : 'inactif'}` }, h('i', { class: 'veille-point' }), actif ? 'Suivie' : 'En pause'));
    }));
  }

  const arretDonnees = D.surChangement(rendre);
  rendre();
  return function quitter() { arretDonnees(); };
}
