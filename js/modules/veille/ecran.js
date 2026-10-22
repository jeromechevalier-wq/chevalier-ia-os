// Écrans du module Veille : « Contenus » (liste filtrable avec l'état et les liens des résumés) et « Sources » (ce que Jérôme suit).
// L'écran n'écrit jamais lui-même dans la base : l'ajout d'un lien et le bouton « Résumer » passent par la fonction `veille` du serveur (D.appeler).
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML), et un lien n'est cliquable que s'il commence par http(s) (L.lienSur).
// Seule exception voulue : la page HTML d'un résumé, affichée dans un cadre isolé (iframe sandbox, aucun script) pour qu'elle soit belle à lire.
import { h, icone, remplir, toast, dialogue } from '../../os/ui.js';
import { estChezClient } from '../../os/contexte.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { analyserLien } from './lien.js';

function lien(url, libelle, classe = 'veille-lien') {
  const sur = L.lienSur(url);
  return sur ? h('a', { class: classe, href: sur, target: '_blank', rel: 'noopener noreferrer' }, libelle, icone('external-link', { taille: 13 })) : null;
}

/** Ouvre la page HTML d'un résumé dans un cadre isolé : sans script, liens dans un nouvel onglet. */
async function lireResume(resume, titre) {
  let html = null;
  try { html = await D.lirePage(resume.id); } catch (e) { console.warn('page du résumé indisponible', e?.code); }
  if (!html) { toast('Ce résumé n\'est pas lisible ici.', { type: 'erreur' }); return; }
  const cadre = h('iframe', { class: 'veille-cadre', title: `Résumé : ${titre}`, sandbox: 'allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer' });
  cadre.srcdoc = L.pageDuResume(html);
  await dialogue({ titre: titre || 'Résumé', contenu: cadre, classe: 'dialogue-veille-resume', boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }] });
}

const pastille = (etat) => h('span', { class: `veille-pastille etat-${etat}` }, h('i', { class: 'veille-point' }), L.LIBELLES_ETAT[etat]);

// Filtres mémorisés jusqu'au rechargement de la page (variable de module, aucun stockage du navigateur) ; remis à zéro à la déconnexion.
let filtres = { ...L.criteresVides(), texte: '' };
export function oublierFiltresVeille() { filtres = { ...L.criteresVides(), texte: '' }; }

export function rendreContenus(conteneur) {
  let signature = '';

  const resume = h('div', { class: 'veille-resume', 'aria-live': 'polite' });
  const recherche = h('input', { type: 'search', class: 'champ', placeholder: 'Chercher dans les titres', 'aria-label': 'Chercher dans les titres', value: filtres.texte, oninput: (e) => { filtres.texte = e.target.value; signature = ''; rendre(); } });
  const liste = h('ol', { class: 'veille-liste' });

  // Bouton « Filtres » commun à toutes les listes : même fenêtre à cases à cocher (OU dans un groupe, ET entre groupes), pastille = nombre de cases cochées.
  const optionsSources = () => { const avecContenu = new Set(D.etat.contenus.map((x) => x.sourceId)); return L.optionsSources(D.etat.sources, D.etat.contenus).filter((o) => avecContenu.has(o.id)); };
  const boutonF = boutonFiltres({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'sources', libelle: 'Source', type: 'cases', options: optionsSources().map((o) => ({ valeur: o.id, libelle: o.nom })) },
        { cle: 'types', libelle: 'Type', type: 'cases', options: L.typesPresents(D.etat.contenus).map((t) => ({ valeur: t, libelle: t })) },
        { cle: 'etats', libelle: 'État', type: 'cases', options: L.etatsPresents(D.etat.contenus).map((o) => ({ valeur: o.valeur, libelle: o.libelle })) },
      ],
      criteres: filtres,
      effacer: () => ({ ...L.criteresVides(), texte: filtres.texte }), // « Tout effacer » garde la recherche
    });
    boutonF.element.focus();
    if (!r) return;
    filtres = { ...filtres, sources: r.sources, types: r.types, etats: r.etats };
    signature = ''; rendre();
  } });


  async function resumer(contenu, bouton) {
    bouton.disabled = true;
    try {
      const r = await D.appeler({ action: 'resumer', contenuId: contenu.id });
      toast(r.message, { type: r.lance ? 'info' : 'erreur', duree: 5000 });
    } catch (e) {
      toast(e?.message || 'Le résumé n\'a pas pu être lancé.', { type: 'erreur', duree: 6000 });
      bouton.disabled = false;
    }
  }

  // Formulaire d'ajout : un seul champ, l'appli reconnaît elle-même un épisode ou une chaîne et propose les boutons qui conviennent.
  const champLien = h('input', { type: 'url', class: 'champ', placeholder: 'Coller un lien YouTube (épisode ou chaîne)', 'aria-label': 'Lien YouTube à ajouter', autocomplete: 'off', oninput: majAjout });
  const aideAjout = h('div', { class: 'veille-meta', 'aria-live': 'polite' });
  const boutonsAjout = h('div', { class: 'veille-actions' });
  let ajoutEnCours = false;
  function majAjout() {
    const { aide, boutons } = L.boutonsAjout(analyserLien(champLien.value), champLien.value);
    remplir(aideAjout, aide);
    remplir(boutonsAjout, boutons.map((b) => h('button', { type: 'button', class: 'veille-bouton', dataset: { action: b.cle }, disabled: ajoutEnCours, onclick: () => ajouter(b.cle === 'ajouter-resumer') }, b.libelle)));
  }
  async function ajouter(lancerResume) {
    if (ajoutEnCours) return;
    ajoutEnCours = true; majAjout();
    try {
      const r = await D.appeler({ action: 'ajouterLien', url: champLien.value.trim(), lancerResume });
      toast(L.messageAjout(r), { duree: 6000 });
      champLien.value = '';
    } catch (e) {
      toast(e?.message || 'L\'ajout n\'a pas fonctionné.', { type: 'erreur', duree: 6000 });
    } finally {
      ajoutEnCours = false; majAjout();
    }
  }
  const formulaireAjout = !estChezClient() ? h('section', { class: 'veille-ajout', 'aria-label': 'Ajouter un lien' }, champLien, aideAjout, boutonsAjout) : null;
  majAjout();

  conteneur.append(h('div', { class: 'page page-liste page-veille' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Veille')),
    formulaireAjout,
    resume,
    h('div', { class: 'barre-filtres-ligne veille-filtres' }, h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), recherche), boutonF.element),
    liste));

  // Une source qui n'existe plus (ou sans contenu) ne reste pas cochée en cachette.
  function nettoyerFiltres() {
    const ids = new Set(optionsSources().map((o) => o.id));
    if (filtres.sources.some((id) => !ids.has(id))) filtres = { ...filtres, sources: filtres.sources.filter((id) => ids.has(id)) };
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
      r.pageDisponible === true ? h('button', { type: 'button', class: 'veille-bouton', dataset: { action: 'lire' }, onclick: () => lireResume(r, x.titre) }, 'Lire le résumé') : null,
      lien(r.lienHtml, r.pageDisponible === true ? 'Ouvrir dans Drive' : 'Résumé complet'), lien(r.lienCourt, 'Résumé court'), lien(r.lienTranscript, 'Texte intégral'),
      interne && r.modele ? h('span', { class: 'veille-meta' }, r.modele) : null,
      cout ? h('span', { class: 'veille-meta' }, cout) : null,
      interne && r.payeur && L.LIBELLES_PAYEUR[r.payeur] ? h('span', { class: 'veille-meta' }, `Payé par : ${L.LIBELLES_PAYEUR[r.payeur]}`) : null,
    ] : null;
    // Bouton Résumer : sur un contenu « nouveau » ou « en échec » (réessayer), et chez le propriétaire seulement. Il appelle le serveur, qui lance le workflow.
    const boutonResumer = L.peutResumer(etat) && interne ? h('div', { class: 'veille-actions' },
      h('button', { type: 'button', class: 'veille-bouton', dataset: { action: 'resumer' }, onclick: (e) => resumer(x, e.currentTarget) }, etat === 'echec' ? 'Réessayer le résumé' : 'Résumer')) : null;
    return h('li', { class: 'veille-ligne', dataset: { id: x.id, etat } },
      h('div', { class: 'veille-principal' }, titre,
        h('div', { class: 'veille-meta' }, L.nomSource(x, D.etat.sources), ' · ', L.normaliserType(x.type), date ? ` · ${date}` : ''),
        detailsResume ? h('div', { class: 'veille-actions' }, detailsResume) : null,
        boutonResumer,
        etat === 'echec' && x.etapeEchec ? h('div', { class: 'veille-erreur' }, h('span', { class: 'veille-erreur-cle' }, 'Étape en échec : '), x.etapeEchec) : null),
      pastille(etat));
  }

  function rendre() {
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'veille-vide' }, 'Chargement…')); return; }
    nettoyerFiltres();
    boutonF.majCompte(L.nombreFiltres(filtres));
    boutonF.element.disabled = !D.etat.contenus.length; // rien à filtrer (aucun contenu, ou lecture impossible) : le bouton est grisé
    const visibles = L.filtrer(D.etat.contenus, filtres);
    const sig = JSON.stringify([filtres, D.etat.sources.map((s) => s.nom), visibles.map((x) => [x.id, x.etat, x.titre]), D.etat.resumes.map((r) => [r.id, r.contenuId, r.pageDisponible === true])]);
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
        ? 'Rien à afficher avec ces filtres. Décoche un filtre.'
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
