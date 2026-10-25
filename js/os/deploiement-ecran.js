// Écran Réglages > Déploiement (25/10/2026) : toutes les étapes d'un déploiement, une ligne chacune, avec une pastille de couleur ET un texte.
// Les contrôles se lancent à l'ouverture et avec « Revérifier » : ceux du serveur (fonction « deploiementVerifier ») et ceux des modules actifs (`controlesDeploiement()`
// de leur API : la coque ne cite aucun module). Chaque contrôle est isolé : un module qui plante, ou le serveur injoignable, laisse ses lignes en orange, les autres continuent.
// Les cases « C'est fait » des étapes manuelles s'enregistrent toutes seules dans crm_parametres/deploiement de l'espace ({ <étape>: { fait: true, le: 'AAAA-MM-JJ' } }).
// Rien de secret n'est affiché : la fonction ne rend que des états, et la page n'affiche que des textes fixes.
import { doc, onSnapshot, setDoc, deleteField } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from './firebase.js';
import { firebaseConfig } from './firebase-config.js';
import { cheminBaseClient, cheminCollection } from './chemins.js';
import { h, icone, remplir, toast } from './ui.js';
import { lien } from './router.js';
import { ETAPES_COQUE, DOCUMENT_COCHES, calculerPage, resultatsDesControles, lireCoches, patchCoche, lienEtape } from './deploiement.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const DELAI_SERVEUR_MS = 15000;
const DELAI_MODULE_MS = 12000;
const MESSAGE_ORANGE = 'Le contrôle n’a pas abouti : clique sur « Revérifier » dans un instant.';

const avecDelai = (promesse, ms) => Promise.race([promesse, new Promise((_, rejeter) => setTimeout(() => rejeter(new Error('delai')), ms))]);

/** Les étapes et les vérificateurs des modules actifs (par leur API ; un module sans `controlesDeploiement` n'ajoute rien, un module qui plante non plus). */
function controlesDesModules(ctx) {
  const liste = [];
  for (const id of ctx.actifs ?? []) {
    try {
      const c = ctx.apis?.get(id)?.controlesDeploiement?.();
      if (c && Array.isArray(c.etapes)) liste.push({ etapes: c.etapes, verifier: typeof c.verifier === 'function' ? c.verifier : null });
    } catch (e) {
      console.warn('Déploiement : lignes d’un module indisponibles', e?.message);
    }
  }
  return liste;
}

/** Appel de la fonction du serveur : la réponse, ou null si elle est injoignable ou refuse (l'écran le dit). */
async function appelerServeur(ctx) {
  const client = ctx.chezClient && ctx.client ? ctx.client : null;
  const r = await avecDelai(httpsCallable(fonctions(), 'deploiementVerifier')(client ? { client } : {}), DELAI_SERVEUR_MS);
  return r?.data && typeof r.data === 'object' ? r.data : null;
}

export function sectionDeploiement(ctx, etat) {
  const base = ctx.chezClient && ctx.client ? cheminBaseClient(ctx.client) : '';
  const refCoches = doc(db, cheminCollection(base, DOCUMENT_COCHES.collection), DOCUMENT_COCHES.id);
  const modules = controlesDesModules(ctx);
  const etapes = [...ETAPES_COQUE, ...modules.flatMap((m) => m.etapes)];
  const peutCocher = ctx.editeur !== false;
  const page = { resultats: {}, cochesBrutes: {}, enCours: false, erreurServeur: false, ecriture: new Set() };

  const zoneTete = h('div', { class: 'deploiement-tete' });
  const zoneMessages = h('div', { class: 'deploiement-messages' });
  const zoneListe = h('div', { class: 'deploiement-groupes' });
  const sec = h('section', { class: 'carte-section deploiement', id: 'reglages-deploiement' },
    h('h2', {}, icone('shield-check', { taille: 18 }), 'Déploiement'),
    h('p', { class: 'aide' }, 'Toutes les étapes d’un déploiement, une à une, avec leur état dans cet espace. Les contrôles automatiques se lancent à l’ouverture de la page ; une étape grise se vérifie à la main, puis se coche (« C’est fait »). Si quelque chose ne marche plus, toutes les cases doivent être vertes.'),
    zoneTete, zoneMessages, zoneListe);

  const coches = () => lireCoches(page.cochesBrutes, etapes);

  function ligne({ etape, couleur, texte }) {
    const enAttente = page.enCours && etape.type === 'auto';
    const texteEtat = enAttente ? 'Vérification…' : texte;
    const adresse = lienEtape(etape, { projet: firebaseConfig.projectId });
    const lienReparation = adresse
      ? h('a', { href: adresse, target: '_blank', rel: 'noopener noreferrer', class: 'deploiement-lien', dataset: { role: 'lien-reparation' } }, icone('external-link', { taille: 14 }), /console\.cloud\.google\.com/.test(adresse) ? 'Ouvrir la console Google' : 'Ouvrir le mode d’emploi')
      : etape.route ? h('a', { href: lien(etape.route), class: 'deploiement-lien', dataset: { role: 'lien-reparation' } }, icone('chevron-right', { taille: 14 }), 'Ouvrir le réglage') : null;
    const aide = enAttente ? null
      : couleur === 'rouge' || couleur === 'gris' ? h('p', { class: `deploiement-reparation${couleur === 'rouge' ? ' deploiement-reparation-rouge' : ''}`, dataset: { role: 'reparation' } }, etape.reparation, ' ', lienReparation)
        : couleur === 'orange' ? h('p', { class: 'deploiement-reparation', dataset: { role: 'reparation' } }, MESSAGE_ORANGE) : null;
    let caseFait = null;
    if (etape.type === 'manuel') {
      const fait = couleur === 'vert';
      caseFait = h('label', { class: 'case deploiement-case' },
        h('input', { type: 'checkbox', checked: fait, disabled: !peutCocher || page.ecriture.has(etape.id), dataset: { coche: etape.id }, 'aria-label': `C’est fait : ${etape.libelle}`,
          onchange: (e) => cocher(etape.id, e.target.checked) }),
        h('span', {}, 'C’est fait'));
    }
    return h('li', { class: 'deploiement-ligne', dataset: { etape: etape.id, couleur: enAttente ? 'attente' : couleur, type: etape.type } },
      h('span', { class: 'deploiement-pastille', 'aria-hidden': 'true' }),
      h('div', { class: 'deploiement-corps' },
        h('span', { class: 'deploiement-libelle' }, etape.libelle),
        h('span', { class: 'deploiement-etat', dataset: { role: 'etat' } }, texteEtat),
        aide),
      caseFait);
  }

  function rendre() {
    if (!etat.vivant) return;
    const focus = document.activeElement; // le focus clavier reste sur la case ou le bouton après le nouveau dessin
    const reprise = focus?.dataset?.coche ? `[data-coche="${CSS.escape(focus.dataset.coche)}"]` : focus?.dataset?.action && sec.contains(focus) ? `[data-action="${CSS.escape(focus.dataset.action)}"]` : null;
    const calcul = calculerPage({ etapes, actifs: ctx.actifs, resultats: page.resultats, coches: coches() });
    remplir(zoneTete,
      h('p', { class: 'deploiement-resume', dataset: { role: 'resume', global: page.enCours ? 'attente' : calcul.global }, 'aria-live': 'polite' },
        h('span', { class: 'deploiement-pastille', 'aria-hidden': 'true' }), page.enCours ? 'Vérification en cours…' : calcul.resume.texte),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reverifier' }, disabled: page.enCours, onclick: () => verifier() },
        icone('refresh-cw', { taille: 16 }), 'Revérifier'));
    remplir(zoneMessages,
      page.erreurServeur && !page.enCours ? h('div', { class: 'deploiement-erreur', role: 'alert', dataset: { etat: 'erreur-serveur' } },
        icone('triangle-alert', { taille: 16 }), h('p', {}, 'Impossible de vérifier pour le moment. Les cases « C’est fait » restent utilisables.'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => verifier() }, 'Réessayer')) : null,
      calcul.vide ? h('p', { class: 'aide', dataset: { role: 'vide' } }, 'Aucun module de cet espace n’ajoute de contrôle : seules les étapes communes à tous les espaces sont listées.') : null,
      peutCocher ? null : h('p', { class: 'aide', dataset: { role: 'lecture' } }, 'Tu es lecteur de cet espace : tu peux consulter les étapes, pas les cocher.'));
    remplir(zoneListe, ...calcul.groupes.map((g) => h('div', { class: 'deploiement-groupe', dataset: { moment: g.id } },
      h('h3', {}, g.libelle),
      h('ul', { class: 'deploiement-liste' }, g.lignes.map(ligne)))));
    if (reprise) sec.querySelector(reprise)?.focus();
  }

  async function cocher(id, fait) {
    if (!peutCocher) return;
    const avant = page.cochesBrutes;
    page.cochesBrutes = { ...avant };
    if (fait) Object.assign(page.cochesBrutes, patchCoche(id)); else delete page.cochesBrutes[id];
    page.ecriture.add(id);
    rendre();
    try {
      await setDoc(refCoches, fait ? patchCoche(id) : { [id]: deleteField() }, { merge: true });
    } catch (e) {
      console.warn('Déploiement : case non enregistrée', e?.code);
      page.cochesBrutes = avant;
      toast('Enregistrement impossible : réessaie dans un instant.', { type: 'erreur' });
    } finally {
      page.ecriture.delete(id);
      rendre();
    }
  }

  let tour = 0;
  async function verifier() {
    const moi = ++tour;
    page.enCours = true;
    page.erreurServeur = false;
    rendre();
    const serveur = appelerServeur(ctx).catch((e) => { console.warn('Déploiement : serveur injoignable', e?.code ?? e?.message); return null; });
    const resultatsModules = await Promise.all(modules.map(async (m) => {
      if (!m.verifier) return {};
      try {
        const r = await avecDelai(Promise.resolve().then(() => m.verifier()), DELAI_MODULE_MS);
        return r && typeof r === 'object' ? r : {};
      } catch (e) {
        console.warn('Déploiement : contrôle d’un module en échec', e?.message);
        return {};
      }
    }));
    const reponse = await serveur;
    if (moi !== tour || !etat.vivant) return; // un « Revérifier » plus récent a pris la main, ou on a quitté la page
    page.erreurServeur = !reponse;
    page.resultats = resultatsDesControles(etapes, { serveur: reponse, modules: Object.assign({}, ...resultatsModules) });
    page.enCours = false;
    rendre();
  }

  const arret = onSnapshot(refCoches, (s) => { page.cochesBrutes = s.exists() ? s.data() : {}; rendre(); },
    (e) => console.warn('Déploiement : cases illisibles', e?.code));
  etat.nettoyages.push(arret);
  rendre();
  verifier();
  return sec;
}
