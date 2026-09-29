// Liste : tableau triable (cartes sur téléphone), barre de filtres partagée avec le Kanban, export CSV.
import { h, icone, vider, toast, demanderTexte } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { pastilleEtape, pastillePriorite } from './fiche.js';

// ---------------------------------------------------------------- état des filtres (session)

let criteres = L.criteresComplets();
let filtreEnregistreActif = null;
const abonnesFiltres = new Set();
let tri = { colonne: 'nom', sens: 'asc' };

export function criteresCourants() {
  return criteres;
}

export function definirCriteres(c, { depuisFiltre = null } = {}) {
  criteres = L.criteresComplets(c);
  filtreEnregistreActif = depuisFiltre;
  abonnesFiltres.forEach((f) => f());
}

export function surFiltres(rappel) {
  abonnesFiltres.add(rappel);
  return () => abonnesFiltres.delete(rappel);
}

export function fichesFiltrees() {
  return L.filtrer(D.etat.fiches, criteres, { aujourdhui: D.ctx().aujourdhui });
}

// ---------------------------------------------------------------- export CSV

export async function exporterCsv(fiches, { complet = false } = {}) {
  const csv = L.versCsv(fiches, { offres: D.etat.offres });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: L.nomFichierCsv(new Date(), complet), hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (complet) {
    await D.noterExportComplet().catch(() => {});
    toast(`Sauvegarde exportée : ${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`);
  } else {
    toast(`Export : ${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`);
  }
}

// ---------------------------------------------------------------- barre de filtres

/** Barre de recherche, filtres, pastilles et filtres enregistrés. */
export function rendreBarreFiltres(conteneur, { avecExport = false } = {}) {
  const recherche = h('input', {
    type: 'search', class: 'champ champ-recherche', placeholder: 'Rechercher (nom, entreprise, ville, notes)', 'aria-label': 'Rechercher', value: criteres.recherche,
    oninput: (e) => { criteres = { ...criteres, recherche: e.target.value }; abonnesFiltres.forEach((f) => f()); },
  });
  const boutonFiltres = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'aria-expanded': 'false', dataset: { action: 'filtres' } }, icone('funnel', { taille: 16 }), 'Filtres');
  const panneau = h('div', { class: 'panneau-filtres', hidden: true });
  boutonFiltres.addEventListener('click', () => {
    panneau.hidden = !panneau.hidden;
    boutonFiltres.setAttribute('aria-expanded', String(!panneau.hidden));
    if (!panneau.hidden) rendrePanneau();
  });
  const enregistrer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'enregistrer-filtre' }, onclick: enregistrerFiltre }, icone('bookmark-plus', { taille: 16 }), 'Enregistrer ce filtre');
  const exporter = avecExport ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter' }, onclick: () => {
    const complet = L.filtreEstVide(criteres);
    exporterCsv(complet ? D.etat.fiches : fichesFiltrees(), { complet });
  } }, icone('download', { taille: 16 }), 'Exporter en CSV') : null;
  const enregistres = h('div', { class: 'filtres-enregistres', role: 'group', 'aria-label': 'Filtres enregistrés' });
  const pastilles = h('div', { class: 'pastilles-filtres', 'aria-live': 'polite' });

  conteneur.append(h('div', { class: 'barre-filtres' },
    h('div', { class: 'barre-filtres-haut' },
      h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), recherche),
      boutonFiltres, enregistrer, exporter),
    enregistres, pastilles, panneau));

  function rendreEnregistres() {
    vider(enregistres);
    for (const f of D.etat.filtres) {
      enregistres.append(h('button', {
        type: 'button', class: `puce ${filtreEnregistreActif === f.id ? 'active' : ''}`, 'aria-pressed': String(filtreEnregistreActif === f.id), dataset: { filtre: f.id },
        onclick: () => (filtreEnregistreActif === f.id ? definirCriteres({ recherche: criteres.recherche }) : definirCriteres({ ...f.criteres, recherche: criteres.recherche }, { depuisFiltre: f.id })),
      }, icone('bookmark', { taille: 14 }), f.nom));
    }
  }

  function rendrePastilles() {
    vider(pastilles);
    const liste = L.pastillesFiltres(criteres, { offres: D.etat.offres }).filter((p) => p.cle !== 'recherche');
    for (const p of liste) {
      pastilles.append(h('button', { type: 'button', class: 'pastille-filtre', 'aria-label': `Retirer le filtre ${p.libelle}`,
        onclick: () => definirCriteres(L.retirerCritere(criteres, p.cle, p.valeur)) }, p.libelle, icone('x', { taille: 14 })));
    }
    if (liste.length || criteres.recherche) {
      pastilles.append(h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'tout-effacer' },
        onclick: () => { recherche.value = ''; definirCriteres({}); } }, 'Tout effacer'));
    }
    enregistrer.disabled = L.filtreEstVide({ ...criteres, recherche: '' });
  }

  function groupe(titre, cle, options) {
    return h('fieldset', { class: 'groupe-filtre' }, h('legend', {}, titre),
      h('div', { class: 'puces' }, options.map((o) => h('button', {
        type: 'button', class: `puce ${criteres[cle].includes(o.valeur) ? 'active' : ''}`, 'aria-pressed': String(criteres[cle].includes(o.valeur)),
        onclick: () => definirCriteres(L.basculerValeur(criteres, cle, o.valeur)),
      }, o.libelle))));
  }

  function bascule(libelle, actif, valeurSuivante) {
    return h('button', { type: 'button', class: `puce ${actif ? 'active' : ''}`, 'aria-pressed': String(actif), onclick: () => definirCriteres({ ...criteres, ...valeurSuivante }) }, libelle);
  }

  function rendrePanneau() {
    if (panneau.hidden) return;
    const villes = [...new Map(D.etat.fiches.filter((f) => f.ville).map((f) => [L.normaliser(f.ville), f.ville.trim()])).values()].sort((a, b) => a.localeCompare(b, 'fr'));
    vider(panneau).append(
      groupe('Étape', 'etapes', L.TOUTES_ETAPES.map((e) => ({ valeur: e.id, libelle: e.libelle }))),
      groupe('Rôle', 'roles', L.ROLES.map((r) => ({ valeur: r.id, libelle: r.libelle }))),
      groupe('Priorité', 'priorites', L.PRIORITES.map((p) => ({ valeur: p.id, libelle: p.libelle }))),
      groupe('Source', 'sources', D.etat.sources.map((s) => ({ valeur: s, libelle: s }))),
      groupe('Secteur', 'secteurs', D.etat.secteurs.map((s) => ({ valeur: s, libelle: s }))),
      villes.length ? groupe('Ville', 'villes', villes.map((v) => ({ valeur: v, libelle: v }))) : null,
      groupe('Offre', 'offres', D.etat.offres.map((o) => ({ valeur: o.id, libelle: o.actif === false ? `${o.nom} (archivée)` : o.nom }))),
      h('fieldset', { class: 'groupe-filtre' }, h('legend', {}, 'Suivi'),
        h('div', { class: 'puces' },
          bascule('En retard', criteres.enRetard, { enRetard: !criteres.enRetard }),
          bascule('Sans action prévue', criteres.sansAction, { sansAction: !criteres.sansAction }),
          bascule('Interview JTBD faite', criteres.jtbd === 'faite', { jtbd: criteres.jtbd === 'faite' ? null : 'faite' }),
          bascule('Interview JTBD non faite', criteres.jtbd === 'non_faite', { jtbd: criteres.jtbd === 'non_faite' ? null : 'non_faite' }),
          bascule('Archivés', criteres.archives, { archives: !criteres.archives }))));
  }

  async function enregistrerFiltre() {
    const nom = await demanderTexte('Enregistrer ce filtre', { libelle: 'Nom du filtre' });
    if (!nom) return;
    const id = `f_${Date.now().toString(36)}`;
    const ordre = Math.max(0, ...D.etat.filtres.map((f) => f.ordre ?? 0)) + 1;
    await D.enregistrerFiltres([...D.etat.filtres, { id, nom, criteres: L.criteresAEnregistrer(criteres), ordre }]);
    filtreEnregistreActif = id;
    toast(`Filtre "${nom}" enregistré`);
  }

  function tout() {
    if (document.activeElement !== recherche) recherche.value = criteres.recherche;
    rendreEnregistres();
    rendrePastilles();
    rendrePanneau();
  }
  tout();
  const arrets = [surFiltres(tout), D.surChangement(() => { rendreEnregistres(); rendrePanneau(); })];
  return () => arrets.forEach((f) => f());
}

// ---------------------------------------------------------------- vue Liste

const COLONNES = [
  { cle: 'nom', libelle: 'Nom' },
  { cle: 'etape', libelle: 'Étape' },
  { cle: 'priorite', libelle: 'Priorité' },
  { cle: 'ville', libelle: 'Ville' },
  { cle: 'source', libelle: 'Source' },
  { cle: 'prochaineAction', libelle: 'Prochaine action' },
  { cle: 'montant', libelle: 'Montant' },
  { cle: 'dateDernierEchange', libelle: 'Dernier échange' },
];

export function rendreListe(conteneur) {
  const zoneBarre = h('div');
  const compteur = h('span', { class: 'compteur-resultats', 'aria-live': 'polite' });
  const table = h('table', { class: 'table-fiches' });
  const zoneTable = h('div', { class: 'zone-table' });
  const page = h('div', { class: 'page page-liste' },
    h('header', { class: 'page-tete' },
      h('div', {}, h('p', { class: 'etiquette' }, 'CRM'), h('h1', {}, 'Liste ', compteur)),
      h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => naviguer('crm/fiche/nouvelle') }, icone('plus', { taille: 16 }), 'Nouvelle fiche')),
    zoneBarre, zoneTable);
  conteneur.append(page);
  const arretBarre = rendreBarreFiltres(zoneBarre, { avecExport: true });

  function entete() {
    return h('thead', {}, h('tr', {}, COLONNES.map((c) => {
      const actif = tri.colonne === c.cle;
      return h('th', { scope: 'col', 'aria-sort': actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', class: 'tri', dataset: { tri: c.cle }, onclick: () => {
          tri = { colonne: c.cle, sens: actif && tri.sens === 'asc' ? 'desc' : 'asc' };
          rafraichir();
        } }, c.libelle, icone(actif ? (tri.sens === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down', { taille: 14 })));
    })));
  }

  function ligne(f) {
    const aujourdhui = D.ctx().aujourdhui;
    const retard = L.estEnRetard(f, aujourdhui);
    return h('tr', { class: `ligne-fiche ${retard ? 'en-retard' : ''}`, dataset: { fiche: f.id }, tabindex: '0',
      onclick: () => naviguer(`crm/fiche/${f.id}`),
      onkeydown: (e) => { if (e.key === 'Enter') naviguer(`crm/fiche/${f.id}`); } },
    h('td', { class: 'cellule-nom', dataset: { libelle: 'Nom' } }, h('span', { class: 'nom' }, f.nom), f.entreprise ? h('span', { class: 'aide' }, f.entreprise) : null,
      f.oppositionProspection ? h('span', { class: 'badge badge-opposition' }, 'Opposition') : null),
    h('td', { dataset: { libelle: 'Étape' } }, pastilleEtape(f.etape)),
    h('td', { dataset: { libelle: 'Priorité' } }, pastillePriorite(f.priorite)),
    h('td', { dataset: { libelle: 'Ville' } }, f.ville || ''),
    h('td', { dataset: { libelle: 'Source' } }, f.source || ''),
    h('td', { class: 'cellule-action', dataset: { libelle: 'Prochaine action' } },
      f.prochaineAction ? h('span', {}, f.prochaineAction) : null,
      f.dateProchaineAction ? h('span', { class: `date-action ${retard ? 'retard' : ''}` }, retard ? icone('clock', { taille: 12 }) : null, L.formatJourCourt(f.dateProchaineAction, aujourdhui)) : null),
    h('td', { class: 'cellule-montant', dataset: { libelle: 'Montant' } }, f.montant ? L.formatEuros(f.montant) : ''),
    h('td', { dataset: { libelle: 'Dernier échange' } }, f.dateDernierEchange ? L.formatJourCourt(L.jourParis(f.dateDernierEchange), aujourdhui) : ''));
  }

  function rafraichir() {
    if (!D.estPret()) {
      vider(zoneTable).append(h('div', { class: 'chargement-bloc' }, h('span', { class: 'rond-chargement' })));
      return;
    }
    const fiches = L.trierFiches(fichesFiltrees(), tri.colonne, tri.sens);
    compteur.textContent = `(${fiches.length})`;
    vider(zoneTable);
    if (!D.etat.fiches.length) {
      zoneTable.append(etatVideListe('Ajoute ton premier prospect'));
      return;
    }
    if (!fiches.length) {
      zoneTable.append(etatVideListe('Aucune fiche ne correspond à ces filtres.'));
      return;
    }
    vider(table).append(entete(), h('tbody', {}, fiches.map(ligne)));
    zoneTable.append(table);
  }
  rafraichir();
  const arrets = [D.surChangement(rafraichir), surFiltres(rafraichir), arretBarre];
  return () => arrets.forEach((f) => f());
}

function etatVideListe(message) {
  return h('div', { class: 'etat-vide' },
    h('img', { src: 'assets/charles-portrait.png', alt: '', width: '120', height: '90', class: 'charles-vide' }),
    h('p', {}, message));
}
