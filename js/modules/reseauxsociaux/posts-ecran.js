// Écran « Posts » du module Réseaux sociaux (11/11/2026).
// Les posts viennent de Buffer (texte, statut, dates, chiffres : toujours lus, jamais copiés) ; le module garde seulement le classement de chaque post
// (pilier, format, services ; clé = identifiant Buffer). Buffer reste le lieu d'écriture : « + Post » l'ouvre dans un nouvel onglet, aucune écriture vers Buffer.
// Deux vues : Kanban (Brouillons, Programmés, Publiés : cartes non déplaçables, le statut vient de Buffer) et Statistiques (une ligne par post publié).
// Au-dessus : l'équilibre des piliers et le contrôle éditorial (règles pures dans posts-logique.js). Tri et filtres se font ici, dans le navigateur (règle D4).
// Le texte d'un post vient de l'extérieur : il est toujours posé comme texte (la fabrique `h` crée des nœuds texte), jamais en HTML.
import { h, icone, remplir, dialogue, toast, estTelephone } from '../../os/ui.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, pastilleEtiquette, selecteurTri, sectionRepliable, MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as P from './posts-logique.js';
import { classerPost } from './posts-actions.js';
import { ongletsReseauxSociaux, chargement, lienBuffer } from './commun.js';

// Feuille de style propre à l'écran, ajoutée au premier affichage (même mécanisme que celle du module, index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-reseauxsociaux="reseauxsociaux-posts"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/reseauxsociaux-posts.css', import.meta.url).href;
  l.dataset.reseauxsociaux = 'reseauxsociaux-posts';
  document.head.append(l);
}

// Choix gardés jusqu'au rechargement de la page (remis à zéro à la déconnexion : `oublierFiltresPosts`).
let vue = 'kanban';
let criteres = P.criteresVides();
let tri = { critere: 'date', sens: 'desc' };
let triStats = { colonne: 'date', sens: 'desc' };

export function oublierFiltresPosts() {
  vue = 'kanban';
  criteres = P.criteresVides();
  tri = { critere: 'date', sens: 'desc' };
  triStats = { colonne: 'date', sens: 'desc' };
}

const OPTIONS_TRI = [{ id: 'date', libelle: 'Date', sens: 'desc' }];
// Couleurs des pastilles : variables de tokens.css (jamais de jaune plein hors bouton).
const COULEUR_PILIER = { pme: 'var(--violet-clair)', claude: 'var(--corail)', actu_ia: 'var(--vert)', proximite: 'var(--lilas)', offre: 'var(--gris-lilas)' };
const COULEUR_GRISE = 'var(--bordure-forte)';
const COULEUR_COLONNE = { brouillons: 'var(--gris-lilas)', programmes: 'var(--violet-clair)', publies: 'var(--vert)' };

const phraseGrise = (texte, role = 'phrase-grise') => h('p', { class: 'aide', dataset: { role } }, texte);
const pluriel = (n, un, plusieurs) => `${R.formaterNombre(n)} ${n > 1 ? plusieurs : un}`;

function pastille(role, nom, couleur) {
  const el = pastilleEtiquette({ nom, couleur });
  el.dataset.role = role;
  return el;
}
const pastillePilier = (id) => (id ? pastille('pilier', R.libellePilier(id), COULEUR_PILIER[id] ?? COULEUR_GRISE) : pastille('pilier-vide', 'À classer', COULEUR_GRISE));
const pastilleFormat = (id) => (id ? pastille('format', R.libelleFormat(id), COULEUR_GRISE) : null);

// ---------------------------------------------------------------- fenêtre « Classer ce post »

/** Fenêtre de classement : pilier, format, services. « Enregistrer » reste grisé tant que rien n'a changé, puis jaune. Une erreur d'écriture laisse la fenêtre ouverte avec un message. */
function ouvrirClassement(post) {
  const avant = post.classement;
  const valeurs = { pilier: avant.pilier, format: avant.format, services: [...avant.services] };
  let bouton = null;
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-classement' } });
  const maj = () => {
    if (!bouton) return;
    const change = P.classementModifie(avant, valeurs);
    bouton.disabled = !change;
    bouton.classList.toggle('bouton-principal', change);
    bouton.classList.toggle('bouton-secondaire', !change);
  };
  const liste = (cle, libelle, options, vide) => {
    const select = h('select', { class: 'champ', dataset: { champ: cle }, onchange: (e) => { valeurs[cle] = e.target.value || null; maj(); } },
      h('option', { value: '' }, vide), options.map((o) => h('option', { value: o.id }, o.libelle)));
    select.value = valeurs[cle] ?? '';
    return h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, libelle), select);
  };
  const cases = h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, 'Services concernés'),
    h('div', { class: 'cases' }, R.SERVICES.map((s) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: valeurs.services.includes(s.id), dataset: { service: s.id }, onchange: (e) => {
        const prises = new Set(valeurs.services);
        if (e.target.checked) prises.add(s.id); else prises.delete(s.id);
        valeurs.services = R.SERVICES.map((x) => x.id).filter((id) => prises.has(id));
        maj();
      } }), s.libelle))),
    h('p', { class: 'aide' }, 'Aucun service coché : le post parle à tout le monde.'));
  const contenu = h('div', { class: 'pile' },
    h('p', { class: 'rs-extrait', dataset: { role: 'post-classe' } }, P.debutPost(post.texte, 160) || 'Post sans texte'),
    liste('pilier', 'Pilier', R.PILIERS, 'À classer'),
    liste('format', 'Format', R.FORMATS, 'À classer'),
    cases, erreur);
  return dialogue({
    titre: 'Classer ce post',
    classe: 'dialogue-formulaire',
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, desactive: true,
        avantFermeture: async () => {
          if (enCours) return false;
          enCours = true; erreur.textContent = '';
          try {
            await classerPost(post.id, valeurs);
            toast('Classement enregistré');
            return true;
          } catch (e) {
            console.warn(e);
            erreur.textContent = MESSAGE_TEST_ECHEC;
            return false;
          } finally { enCours = false; }
        } },
    ],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); maj(); },
  });
}

// ---------------------------------------------------------------- Kanban

function carte(post) {
  const ouvrir = () => ouvrirClassement(post);
  const titre = P.debutPost(post.texte, 80) || 'Post sans texte';
  // Pas de `draggable` ni de dépôt : le statut d'un post vient de Buffer, une carte ne se déplace pas.
  return h('article', { class: 'carte-affaire carte-post', tabindex: '0', dataset: { post: post.id, statut: post.statut }, 'aria-label': `Classer le post : ${titre}`,
    onclick: ouvrir,
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ouvrir(); } },
  h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, titre)),
  h('span', { class: 'carte-sous', dataset: { role: 'date-post' } }, icone('calendar', { taille: 12 }), P.libelleDateCarte(post)),
  h('div', { class: 'groupe-pastilles' }, pastillePilier(post.classement.pilier), pastilleFormat(post.classement.format)),
  post.statut === 'publie' ? h('span', { class: 'carte-sous', dataset: { role: 'chiffres-post' } }, P.libelleChiffres(post.stats)) : null);
}

function colonne(id, titre, posts) {
  return h('section', { class: 'colonne', dataset: { colonne: id }, 'aria-label': titre, style: { '--couleur': COULEUR_COLONNE[id] } },
    h('header', { class: 'colonne-tete' }, h('h2', {}, titre), h('span', { class: 'colonne-totaux' }, pluriel(posts.length, 'post', 'posts'))),
    h('div', { class: 'colonne-corps' }, posts.length ? posts.map(carte) : phraseGrise('Aucun post.', 'colonne-vide')));
}

function vueKanban(posts) {
  const c = P.colonnesPosts(posts, tri.sens);
  return [
    h('div', { class: 'kanban kanban-posts' }, colonne('brouillons', 'Brouillons', c.brouillons), colonne('programmes', 'Programmés', c.programmes), colonne('publies', 'Publiés', c.publies)),
    c.autres ? phraseGrise(c.autres > 1 ? `${c.autres} posts d’un autre statut ne sont pas affichés.` : '1 post d’un autre statut n’est pas affiché.', 'autres-statuts') : null,
  ];
}

// ---------------------------------------------------------------- Statistiques

function changerTriStats(colonneId) {
  const c = P.COLONNES_STATS.find((x) => x.id === colonneId);
  triStats = triStats.colonne === colonneId
    ? { colonne: colonneId, sens: triStats.sens === 'asc' ? 'desc' : 'asc' }
    : { colonne: colonneId, sens: c?.numerique || colonneId === 'date' ? 'desc' : 'asc' };
}

function vueStatistiques(posts, rafraichir) {
  const { lignes, moyenne } = P.statistiques(posts);
  if (!lignes.length) return [etatVide('Aucun post publié pour le moment.')];
  const triees = P.trierStatistiques(lignes, triStats.colonne, triStats.sens);
  const entete = h('tr', {}, P.COLONNES_STATS.map((c) => h('th', { scope: 'col', dataset: { colonne: c.id }, 'aria-sort': triStats.colonne === c.id ? (triStats.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
    h('button', { type: 'button', class: 'tri', onclick: () => { changerTriStats(c.id); rafraichir(); } },
      c.libelle, triStats.colonne === c.id ? icone(triStats.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))));
  const cellules = (l) => ({
    date: l.publieLe ? R.libelleDate(l.publieLe) : '—',
    texte: P.debutPost(l.texte, 80) || '—',
    pilier: l.pilier ? R.libellePilier(l.pilier) : '—',
    format: l.format ? R.libelleFormat(l.format) : '—',
    impressions: R.formaterNombre(l.impressions), portee: R.formaterNombre(l.portee), reactions: R.formaterNombre(l.reactions), commentaires: R.formaterNombre(l.commentaires),
    tauxEngagement: P.formaterTaux(l.tauxEngagement),
  });
  const ligne = (l) => {
    const v = cellules(l);
    return h('tr', { class: 'ligne-liste', dataset: { post: l.id } }, P.COLONNES_STATS.map((c) => h('td', { class: c.numerique ? 'rs-nombre' : '', dataset: { colonne: c.id, libelle: c.libelle } }, v[c.id])));
  };
  const pied = h('tr', { class: 'ligne-liste ligne-moyenne', dataset: { role: 'moyenne' } }, P.COLONNES_STATS.map((c) => {
    if (c.id === 'date') return h('td', { dataset: { colonne: c.id, libelle: c.libelle } }, 'Moyenne');
    if (!c.numerique) return h('td', { dataset: { colonne: c.id } });
    return h('td', { class: 'rs-nombre', dataset: { colonne: c.id, libelle: c.libelle } }, c.id === 'tauxEngagement' ? P.formaterTaux(moyenne[c.id]) : P.formaterMoyenne(moyenne[c.id]));
  }));
  return [
    h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-posts' }, h('thead', {}, entete), h('tbody', {}, triees.map(ligne)), h('tfoot', {}, pied))),
    phraseGrise('Les chiffres viennent de Buffer et se mettent à jour tout seuls.', 'note-stats'),
  ];
}

// ---------------------------------------------------------------- équilibre et contrôle éditorial

// Les deux cartes se replient (l'état est gardé sur l'appareil) : sur téléphone elles partent repliées, pour que le Kanban reste à portée de pouce.
const carteRepliable = (id, titre, contenu, compteur = null) => {
  const { element } = sectionRepliable({ id: `reseauxsociaux-${id}`, titre, contenu, ouverte: !estTelephone(), compteur });
  element.classList.add('carte-section', 'carte-repliable');
  element.dataset.carte = id;
  return element;
};

function carteEquilibre(tous) {
  const e = P.equilibre(tous);
  const ligne = (libelle, part, cible, role) => h('li', { class: 'rs-ligne rs-equilibre', dataset: { role } },
    h('span', { class: 'rs-ligne-titre' }, libelle),
    h('span', { class: 'rs-barre', style: { '--part': `${part}%`, '--cible': `${cible}%` }, 'aria-hidden': 'true' }, h('span', { class: 'rs-barre-part' }), h('span', { class: 'rs-barre-cible' })),
    h('span', { class: 'rs-ligne-detail' }, `${part} % (cible ${cible} %)`));
  return carteRepliable('equilibre', 'Équilibre des piliers', e.total
    ? [h('ul', { class: 'rs-liste' }, e.piliers.map((p) => ligne(p.libelle, p.part, p.cible, `pilier-${p.id}`)), ligne('Vidéos', e.video.part, e.video.cible, 'videos')),
      e.sansPilier ? phraseGrise(`${R.formaterNombre(e.sansPilier)} sans pilier`, 'sans-pilier') : null,
      phraseGrise('Posts publiés et programmés.')]
    : phraseGrise('Pas encore de posts publiés ou programmés.'));
}

function carteControle(tous, classements) {
  const points = P.controlesEditoriaux(tous, classements, new Date());
  return carteRepliable('controle', 'Contrôle éditorial', points.length
    ? h('ul', { class: 'rs-liste', dataset: { role: 'controles' } }, points.map((p) => h('li', { class: 'rs-ligne', dataset: { controle: p.code } }, h('span', { class: 'rs-ligne-detail rs-controle' }, p.texte))))
    : phraseGrise('Tout est en ordre.', 'tout-en-ordre'), points.length || null);
}

// ---------------------------------------------------------------- écran

export function rendrePosts(conteneur) {
  ajouterFeuille();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zoneCartes = h('div', { class: 'rs-cartes rs-cartes-posts' });
  const zone = h('div', { class: 'zone-posts' });
  const zoneVues = h('div', { class: 'zone-bascule' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });

  const actualiser = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'actualiser-buffer' }, onclick: () => D.chargerBuffer({ force: true }) },
    icone('refresh-cw', { taille: 16 }), 'Actualiser');

  const filtres = boutonFiltres({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'piliers', libelle: 'Pilier', type: 'cases', options: R.PILIERS.map((p) => ({ valeur: p.id, libelle: p.libelle })) },
        { cle: 'formats', libelle: 'Format', type: 'cases', options: R.FORMATS.map((f) => ({ valeur: f.id, libelle: f.libelle })) },
        { cle: 'services', libelle: 'Service', type: 'cases', options: R.SERVICES.map((s) => ({ valeur: s.id, libelle: s.libelle })) },
        { cle: 'nonClasses', libelle: 'Non classés seulement', type: 'oui' },
      ],
      criteres, effacer: () => ({ ...P.criteresVides(), recherche: criteres.recherche }),
    });
    if (r) { criteres = { ...P.criteresVides(), ...r }; rendre(); }
  } });
  const choixTri = selecteurTri({ options: OPTIONS_TRI, valeur: tri.critere, sens: tri.sens, surChangement: (nouveau) => { tri = nouveau; rendre(); } });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher dans le texte des posts', libelleAria: 'Rechercher un post', valeur: criteres.recherche, surSaisie: (v) => { criteres = { ...criteres, recherche: v }; rendre(); } },
    elements: { filtres: filtres.element, vues: zoneVues, pastilles: zonePastilles },
    tri: choixTri.element,
  });

  const retirer = (cle, valeur) => { criteres = { ...criteres, [cle]: cle === 'nonClasses' ? false : criteres[cle].filter((v) => v !== valeur) }; rendre(); };
  function pastillesActives() {
    const liste = [
      ...criteres.piliers.map((v) => ['piliers', v, `Pilier : ${R.libellePilier(v) ?? v}`]),
      ...criteres.formats.map((v) => ['formats', v, `Format : ${R.libelleFormat(v) ?? v}`]),
      ...criteres.services.map((v) => ['services', v, `Service : ${R.libelleService(v) ?? v}`]),
      ...(criteres.nonClasses ? [['nonClasses', true, 'Non classés seulement']] : []),
    ];
    remplir(zonePastilles, liste.map(([cle, valeur, libelle]) => h('span', { class: 'pastille-filtre' }, libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${libelle}`, onclick: () => retirer(cle, valeur) }, icone('x', { taille: 12 })))));
  }

  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-posts' },
    enteteListe({ titre: 'Posts', compteur, actions: [actualiser, lienBuffer({ libelle: '+ Post' })] }),
    ongletsReseauxSociaux('reseauxsociaux/posts'), zoneCartes, barre.element, zone));

  function rendre() {
    const b = D.etat.buffer;
    actualiser.disabled = b.chargement;
    remplir(zoneVues, basculeVues({ vues: [['kanban', 'Kanban', 'square-kanban'], ['stats', 'Statistiques', 'chart-column']], courante: vue, surChangement: (id) => { vue = id; rendre(); } }));
    choixTri.maj(OPTIONS_TRI, tri.critere, tri.sens);
    choixTri.element.hidden = vue !== 'kanban'; // les Statistiques se trient par un clic sur l'en-tête de colonne
    filtres.majCompte(P.nombreFiltres(criteres));
    pastillesActives();
    if (b.erreur) {
      remplir(compteur, '');
      remplir(zoneCartes);
      remplir(zone, h('div', { class: 'carte-section', dataset: { role: 'erreur-posts' } },
        h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-buffer' } }, b.erreur),
        h('div', { class: 'ligne-boutons' }, h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-buffer' }, onclick: () => D.chargerBuffer({ force: true }) },
          icone('refresh-cw', { taille: 16 }), 'Réessayer'))));
      return;
    }
    if (!b.lueLe) { remplir(compteur, ''); remplir(zoneCartes); remplir(zone, chargement()); return; }
    const tous = P.fusionnerPosts(b.posts, D.etat.posts);
    remplir(zoneCartes, carteEquilibre(tous), carteControle(tous, D.etat.posts));
    if (!tous.length) {
      remplir(compteur, '');
      remplir(zone, etatVide('Aucun post pour le moment. Écris-en un dans Buffer, il apparaîtra ici.'));
      return;
    }
    const affiches = P.filtrerPosts(tous, criteres);
    const retenus = (liste) => liste.filter((p) => ['brouillon', 'programme', 'publie'].includes(p.statut)).length;
    const nb = retenus(affiches);
    remplir(compteur, `${pluriel(nb, 'post', 'posts')}${nb !== retenus(tous) ? ` sur ${R.formaterNombre(retenus(tous))}` : ''}`);
    remplir(zone, ...(vue === 'stats' ? vueStatistiques(affiches, rendre) : vueKanban(affiches)));
  }

  const arret = D.surChangement(rendre);
  D.chargerBuffer().catch((e) => console.warn(e)); // deux appels rapprochés = une seule lecture (cache de cinq minutes)
  rendre();
  return function quitter() { arret(); };
}
