// Kanban : 6 étapes + colonnes repliées Perdu et Pas maintenant, glisser déposer, menu "Déplacer vers…".
import { h, icone, vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { moisCourantParis } from '../../os/objectifs.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { changerEtape, pastillePriorite } from './fiche.js';
import { rendreBarreFiltres, fichesFiltrees, surFiltres } from './liste.js';

const deplies = new Set(); // colonnes de sortie dépliées pendant la session
let colonnesPrecedentes = new Map(); // id fiche → étape au rendu précédent (animation des cartes qui bougent)

function menuDeplacer(f, bouton) {
  document.querySelector('.menu-deplacer')?.remove();
  const menu = h('div', { class: 'menu-deplacer', role: 'menu', 'aria-label': `Déplacer ${f.nom} vers` },
    h('p', { class: 'etiquette' }, 'Déplacer vers…'),
    L.TOUTES_ETAPES.filter((e) => e.id !== f.etape).map((e) => h('button', {
      type: 'button', role: 'menuitem', class: 'menu-deplacer-entree', dataset: { etape: e.id },
      onclick: (ev) => { ev.stopPropagation(); menu.remove(); changerEtape(D.fiche(f.id), e.id); },
    }, h('span', { class: 'point', style: { background: e.couleur } }), e.libelle)));
  document.body.append(menu);
  const r = bouton.getBoundingClientRect();
  const largeur = 220;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - largeur - 8, r.right - largeur))}px`;
  const hauteur = menu.offsetHeight;
  menu.style.top = `${r.bottom + hauteur + 8 > window.innerHeight ? Math.max(8, r.top - hauteur - 4) : r.bottom + 4}px`;
  menu.querySelector('button')?.focus();
  const fermer = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'mousedown' && menu.contains(e.target)) return;
    menu.remove();
    document.removeEventListener('mousedown', fermer, true);
    document.removeEventListener('keydown', fermer, true);
  };
  setTimeout(() => {
    document.addEventListener('mousedown', fermer, true);
    document.addEventListener('keydown', fermer, true);
  });
}

function carte(f, aujourdhui, animer) {
  const retard = L.estEnRetard(f, aujourdhui);
  const el = h('article', {
    class: `carte-kanban ${retard ? 'en-retard' : ''} ${animer ? 'arrive' : ''}`, draggable: 'true', tabindex: '0',
    dataset: { fiche: f.id, etape: f.etape }, 'aria-label': f.nom,
    onclick: (e) => { if (!e.target.closest('button')) naviguer(`crm/fiche/${f.id}`); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) naviguer(`crm/fiche/${f.id}`); },
    ondragstart: (e) => {
      e.dataTransfer.setData('text/plain', f.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('glisse');
      document.body.classList.add('glisser-en-cours');
    },
    ondragend: () => { el.classList.remove('glisse'); document.body.classList.remove('glisser-en-cours'); },
  },
  h('div', { class: 'carte-haut' },
    h('span', { class: 'carte-nom' }, f.nom),
    h('button', { type: 'button', class: 'bouton-icone bouton-deplacer', 'aria-label': `Déplacer ${f.nom} vers…`, 'aria-haspopup': 'menu',
      onclick: (e) => { e.stopPropagation(); menuDeplacer(f, e.currentTarget); } }, icone('arrow-right-left', { taille: 15 }))),
  f.entreprise ? h('p', { class: 'carte-entreprise' }, f.entreprise) : null,
  h('div', { class: 'carte-badges' },
    pastillePriorite(f.priorite),
    retard ? h('span', { class: 'badge badge-retard' }, icone('clock', { taille: 12 }), 'En retard') : null,
    f.oppositionProspection ? h('span', { class: 'badge badge-opposition' }, 'Opposition') : null,
    f.montant ? h('span', { class: 'carte-montant' }, L.formatEuros(f.montant)) : null),
  f.prochaineAction || f.dateProchaineAction
    ? h('p', { class: `carte-action ${retard ? 'retard' : ''}` }, icone('calendar', { taille: 13 }),
      h('span', {}, [f.prochaineAction, f.dateProchaineAction ? L.formatJourCourt(f.dateProchaineAction, aujourdhui) : ''].filter(Boolean).join(' · ')))
    : h('p', { class: 'carte-action vide' }, 'Aucune action prévue'));
  return el;
}

function zoneDepot(el, etape) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('survol-depot'); });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('survol-depot'); });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('survol-depot');
    const id = e.dataTransfer.getData('text/plain');
    const f = D.fiche(id);
    if (f && f.etape !== etape) changerEtape(f, etape);
  });
}

export function rendreKanban(conteneur) {
  const zoneBarre = h('div');
  const tableau = h('div', { class: 'kanban', role: 'list' });
  const page = h('div', { class: 'page page-kanban' },
    h('header', { class: 'page-tete' },
      h('div', {}, h('p', { class: 'etiquette' }, 'CRM'), h('h1', {}, 'Kanban')),
      h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => naviguer('crm/fiche/nouvelle') }, icone('plus', { taille: 16 }), 'Nouvelle fiche')),
    zoneBarre, tableau);
  conteneur.append(page);
  const arretBarre = rendreBarreFiltres(zoneBarre);

  function rafraichir() {
    if (!D.estPret()) {
      vider(tableau).append(h('div', { class: 'chargement-bloc' }, h('span', { class: 'rond-chargement' })));
      return;
    }
    const defilement = tableau.scrollLeft;
    const aujourdhui = D.ctx().aujourdhui;
    const fiches = fichesFiltrees().filter((f) => !f.archive);
    const nouvellesColonnes = new Map(fiches.map((f) => [f.id, f.etape]));
    vider(tableau);
    for (const e of L.ETAPES) {
      const liste = fiches.filter((f) => f.etape === e.id).sort((a, b) => (a.dateProchaineAction || '9999').localeCompare(b.dateProchaineAction || '9999') || a.nom.localeCompare(b.nom, 'fr'));
      const corps = h('div', { class: 'colonne-corps' });
      let compteur = String(liste.length);
      if (e.id === 'facture_payee') {
        const payees = L.payeesDuMois(D.etat.fiches, moisCourantParis());
        const total = payees.reduce((s, f) => s + (Number(f.encaissements?.at(-1)?.montant) || 0), 0);
        compteur = String(payees.length);
        corps.append(h('div', { class: 'colonne-payees' },
          h('p', { class: 'payees-nombre' }, `${payees.length} payée${payees.length > 1 ? 's' : ''} ce mois`),
          h('p', { class: 'payees-total' }, L.formatEuros(total)),
          h('p', { class: 'aide' }, 'Les fiches payées sont archivées : retrouve les dans la Liste, filtre "Archivés".')));
      } else {
        for (const f of liste) corps.append(carte(f, aujourdhui, colonnesPrecedentes.size > 0 && colonnesPrecedentes.get(f.id) !== f.etape));
        if (!liste.length) corps.append(h('p', { class: 'colonne-vide' }, 'Dépose une carte ici'));
      }
      const col = h('section', { class: 'colonne-kanban', role: 'listitem', dataset: { etape: e.id }, style: { '--c': e.couleur }, 'aria-label': e.libelle },
        h('header', { class: 'colonne-tete' }, h('span', { class: 'point' }), h('h2', {}, e.libelle), h('span', { class: 'compteur' }, compteur)),
        corps);
      zoneDepot(col, e.id);
      tableau.append(col);
    }
    for (const e of L.SORTIES) {
      const liste = fiches.filter((f) => f.etape === e.id);
      const ouverte = deplies.has(e.id);
      const col = h('section', { class: `colonne-kanban colonne-sortie ${ouverte ? '' : 'repliee'}`, role: 'listitem', dataset: { etape: e.id }, style: { '--c': e.couleur }, 'aria-label': e.libelle },
        h('header', { class: 'colonne-tete' },
          h('button', { type: 'button', class: 'bouton-replier', 'aria-expanded': String(ouverte), 'aria-label': `${ouverte ? 'Replier' : 'Déplier'} ${e.libelle}`,
            onclick: () => { if (ouverte) deplies.delete(e.id); else deplies.add(e.id); rafraichir(); } },
          icone(ouverte ? 'chevron-right' : 'chevron-left', { taille: 16 })),
          h('span', { class: 'point' }), h('h2', {}, e.libelle), h('span', { class: 'compteur' }, String(liste.length))),
        ouverte ? h('div', { class: 'colonne-corps' }, liste.map((f) => carte(f, aujourdhui, false)), liste.length ? null : h('p', { class: 'colonne-vide' }, 'Aucune fiche')) : null);
      zoneDepot(col, e.id);
      tableau.append(col);
    }
    colonnesPrecedentes = nouvellesColonnes;
    tableau.scrollLeft = defilement;
  }
  colonnesPrecedentes = new Map();
  rafraichir();
  const arrets = [D.surChangement(rafraichir), surFiltres(rafraichir), arretBarre];
  return () => { arrets.forEach((f) => f()); document.querySelector('.menu-deplacer')?.remove(); };
}
