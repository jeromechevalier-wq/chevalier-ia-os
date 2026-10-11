// Accueil : objectifs du mois, Favoris (documents), Points clés (En retard, Aujourd'hui, Sans action prévue), statistiques, rappel d'export.
import { h, icone, vider, remplir } from '../../os/ui.js';
import { rendreObjectifs, surObjectifs, moisCourantParis } from '../../os/objectifs.js';
import { animerCompteur, charlesContent } from '../../os/celebrations.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { etatVide, lienAffaire, pastilleEtape, boutonEtoile, lien, cheminAffaire } from './composants.js';
import { ligneActivite, faireActivite, dialogueActivite, proposerProchaineActivite } from './activites.js';
import { exporterToutesLesDonnees } from './export.js';
import { estChezClient } from '../../os/contexte.js';
import { ouvrirCreationPersonne } from './personnes.js';
import * as PD from '../projets/donnees.js';
import * as P from '../projets/logique.js';
import { ligneTachePointsCles } from '../projets/taches.js';
import { cheminProjet } from '../projets/composants.js';

let moisAffiche = null;

// `objectifs: false` (chez un client, chantier 7) : la section « Objectifs du mois » n'est pas montée (les objectifs sortent de la coquille au chantier 8).
export function rendreAccueil(conteneur, { compte, objectifs = true }) {
  const moisActuel = moisCourantParis();
  if (!moisAffiche || moisAffiche > moisActuel) moisAffiche = moisActuel;
  retires = new Map();

  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const rappel = h('div', { class: 'zone-rappel' });
  const zoneObjectifs = h('div', { class: 'zone-objectifs' });
  const libelleMois = h('span', { class: 'mois-libelle' });
  const precedent = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Mois précédent', onclick: () => changerMois(-1) }, icone('chevron-left'));
  const suivant = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Mois suivant', onclick: () => changerMois(1) }, icone('chevron-right'));
  const zoneFavoris = h('div', { class: 'zone-favoris' });
  const zonePoints = h('div', { class: 'zone-a-faire' });
  const zoneStats = h('div', { class: 'zone-stats' });

  const page = h('div', { class: 'page page-accueil' },
    h('header', { class: 'page-tete' },
      h('div', {}, h('p', { class: 'etiquette' }, jour), h('h1', {}, `Bonjour ${compte.nom}`)),
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-personne', onclick: () => ouvrirCreationPersonne() }, icone('plus', { taille: 16 }), 'Personne')),
    rappel,
    objectifs ? h('section', { class: 'carte-section section-objectifs', 'aria-labelledby': 'titre-objectifs' },
      h('div', { class: 'section-tete' },
        h('h2', { id: 'titre-objectifs' }, icone('target', { taille: 18 }), 'Objectifs du mois'),
        h('div', { class: 'selecteur-mois' }, precedent, libelleMois, suivant)),
      zoneObjectifs) : null,
    h('section', { class: 'carte-section section-favoris', 'aria-labelledby': 'titre-favoris' },
      h('div', { class: 'section-tete' }, h('h2', { id: 'titre-favoris' }, icone('star', { taille: 18 }), 'Favoris')),
      zoneFavoris),
    h('section', { class: 'carte-section section-a-faire', 'aria-labelledby': 'titre-points-cles' },
      h('div', { class: 'section-tete' }, h('h2', { id: 'titre-points-cles' }, icone('check-check', { taille: 18 }), 'Points clés')),
      zonePoints),
    h('section', { class: 'carte-section section-stats', 'aria-labelledby': 'titre-stats' },
      h('div', { class: 'section-tete' }, h('h2', { id: 'titre-stats' }, icone('chart-column', { taille: 18 }), 'Statistiques')),
      zoneStats));
  conteneur.append(page);

  let majObjectifs = null;
  function monterObjectifs() {
    libelleMois.textContent = L.libelleMois(moisAffiche);
    suivant.disabled = moisAffiche >= moisActuel;
    if (objectifs) majObjectifs = rendreObjectifs(zoneObjectifs, { mois: moisAffiche });
  }
  function changerMois(n) {
    const m = L.decalerMois(moisAffiche, n);
    if (m > moisActuel) return;
    moisAffiche = m;
    monterObjectifs();
  }

  function rafraichir() {
    if (!D.estPret()) {
      remplir(zonePoints, h('div', { class: 'chargement-bloc' }, h('span', { class: 'rond-chargement' })));
      return;
    }
    majObjectifs ? majObjectifs() : monterObjectifs();
    rendreRappel(rappel);
    rendreFavoris(zoneFavoris);
    rendrePointsCles(zonePoints);
    rendreStats(zoneStats);
  }

  monterObjectifs();
  rafraichir();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir), surObjectifs(() => majObjectifs?.())];
  return () => arrets.forEach((f) => f());
}

function rendreRappel(zone) {
  vider(zone);
  if (estChezClient()) return; // rappel de sauvegarde mensuelle : propre à Jérôme
  if (!L.rappelExportVisible(D.etat.reglages.dernierExport)) return;
  zone.append(h('div', { class: 'rappel-export', role: 'status' },
    icone('download', { taille: 18 }),
    h('div', {}, h('strong', {}, 'Pense à ta sauvegarde mensuelle'), h('p', { class: 'aide' }, 'Exporte toutes tes données dans un fichier de sauvegarde.')),
    h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'exporter-tout' }, onclick: () => exporterToutesLesDonnees() }, 'Exporter')));
}

/** Favoris retirés depuis l'accueil pendant cette visite : ils restent affichés (étoile vide) pour pouvoir être remis d'un clic. Vidé à chaque arrivée sur l'accueil. */
let retires = new Map();

/** Les documents mis en favori (étoile) sur les affaires et les projets : un clic ouvre le document, l'étoile le retire. */
function rendreFavoris(zone) {
  vider(zone);
  const favoris = L.documentsFavoris(D.etat.affaires, PD.etat.projets);
  const cle = (f) => `${f.source.type}/${f.source.id}/${f.index}`;
  const actuels = new Set(favoris.map(cle));
  for (const k of [...retires.keys()]) if (actuels.has(k)) retires.delete(k);
  const lignes = [...favoris.map((f) => ({ f, favori: true })), ...[...retires.values()].map((f) => ({ f, favori: false }))]
    .sort((x, y) => x.f.libelle.localeCompare(y.f.libelle, 'fr', { sensitivity: 'base' }));
  if (!lignes.length) {
    zone.append(etatVide('Aucun favori. Clique sur l’étoile d’un document, dans une affaire ou un projet.'));
    return;
  }
  const basculer = (f) => (f.source.type === 'affaire'
    ? D.majAffaire(f.source.id, L.basculerFavoriDocument(D.affaire(f.source.id), f.index))
    : PD.majProjet(f.source.id, L.basculerFavoriDocument(PD.projet(f.source.id), f.index)));
  zone.append(h('ul', { class: 'liste-simple liste-favoris' }, lignes.map(({ f, favori }) => h('li', { class: `ligne-simple${favori ? '' : ' favori-retire'}`, dataset: { favori: f.url } },
    boutonEtoile({
      favori, libelle: f.libelle,
      surBascule: () => { if (favori) retires.set(cle(f), f); basculer(f); },
    }),
    h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.libelle),
    h('span', { class: 'activite-meta' }, lien(f.source.type === 'affaire' ? cheminAffaire(f.source.id) : cheminProjet(f.source.id), f.source.titre))))));
}

/** Combien d'éléments restent dans En retard et Aujourd'hui : pour féliciter quand tout est fait. */
function resteAFaire() {
  const aujourdhui = D.ctx().aujourdhui;
  const pc = L.pointsCles({ activites: D.etat.activites, affaires: D.etat.affaires }, aujourdhui);
  const tp = P.tachesPointsCles(PD.etat.taches, PD.etat.projets, aujourdhui);
  return pc.enRetard.length + pc.aujourdhui.length + pc.reveils.length + tp.enRetard.length + tp.aujourdhui.length;
}

async function faireTache(tache) {
  const avant = resteAFaire();
  await PD.faireTache(tache.id);
  if (avant > 0 && resteAFaire() === 0) charlesContent();
}

/** Activités du CRM et tâches de projet d'un même groupe, mêlées par date et heure (les activités d'abord à égalité). */
function lignesMelees(activites, taches, aujourdhui) {
  const cle = (x) => `${x.date}T${x.heure || '00:00'}`;
  return [
    ...activites.map((a) => ({ cle: cle(a), rang: 0, ligne: ligneActivite(a, aujourdhui, { tousRattachements: true, surFait: faire }) })),
    ...taches.map((t) => ({ cle: cle(t), rang: 1, ligne: ligneTachePointsCles(t, aujourdhui, { surFait: faireTache }) })),
  ].sort((a, b) => a.cle.localeCompare(b.cle) || a.rang - b.rang).map((x) => x.ligne);
}

async function faire(activite) {
  const avant = resteAFaire();
  await faireActivite(activite);
  if (avant > 0 && resteAFaire() === 0) charlesContent();
}

function groupe(titre, cle, nombre, contenu, classe = '') {
  return h('div', { class: `groupe-a-faire ${classe}`, dataset: { groupe: cle } },
    h('h3', {}, titre, h('span', { class: 'compteur' }, String(nombre))),
    contenu);
}

function rendrePointsCles(zone) {
  vider(zone);
  const aujourdhui = D.ctx().aujourdhui;
  const pc = L.pointsCles({ activites: D.etat.activites, affaires: D.etat.affaires }, aujourdhui);
  const tp = P.tachesPointsCles(PD.etat.taches, PD.etat.projets, aujourdhui);
  if (!D.etat.affaires.length && !D.etat.personnes.length && !D.etat.activites.length && !PD.etat.projets.length) {
    zone.append(etatVide('Ajoute ta première personne, il suffit de son nom.', { action: h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => ouvrirCreationPersonne() }, icone('plus', { taille: 16 }), 'Personne') }));
    return;
  }
  const nombreRetard = pc.enRetard.length + tp.enRetard.length;
  const duJour = pc.aujourdhui.length + pc.reveils.length + tp.aujourdhui.length;
  if (!nombreRetard && !duJour) zone.append(etatVide(estChezClient() ? 'Aucune relance aujourd’hui.' : 'Aucune relance aujourd’hui, Charles veille'));
  if (nombreRetard) {
    zone.append(groupe('En retard', 'retard', nombreRetard, h('ul', { class: 'liste-activites' }, lignesMelees(pc.enRetard, tp.enRetard, aujourdhui)), 'groupe-retard'));
  }
  if (duJour) {
    zone.append(groupe('Aujourd’hui', 'aujourdhui', duJour, h('ul', { class: 'liste-activites' },
      pc.reveils.map((a) => h('li', { class: 'activite activite-aujourdhui', dataset: { reveil: a.id } },
        h('button', { type: 'button', class: 'case-fait', 'aria-label': `Fait : reprendre contact (${a.titre})`, title: 'Fait',
          onclick: async () => { await D.rouvrir(a.id); await proposerProchaineActivite(L.liensAffaire(a)); } }, icone('check', { taille: 14 })),
        h('span', { class: 'activite-type' }, icone('clock', { taille: 16 })),
        h('div', { class: 'activite-texte' }, h('strong', {}, 'Reprendre contact'), h('span', { class: 'activite-meta' }, lienAffaire(a))))),
      lignesMelees(pc.aujourdhui, tp.aujourdhui, aujourdhui))));
  }
  zone.append(groupe('Sans action prévue', 'sans-action', pc.sansAction.length,
    pc.sansAction.length ? h('ul', { class: 'liste-activites' }, pc.sansAction.map((a) => h('li', { class: 'activite', dataset: { affaire: a.id } },
      h('div', { class: 'activite-texte' }, lienAffaire(a), h('span', { class: 'activite-meta' }, pastilleEtape(a.etape))),
      h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'planifier', onclick: () => dialogueActivite({ liens: L.liensAffaire(a), titre: 'Planifier une activité' }) }, icone('calendar', { taille: 16 }), 'Planifier')))) : null,
    'groupe-sans-action'));
}

let derniersNombres = new Map();

/** Statistiques : le DOM est construit une fois, puis seules les valeurs changent (barres animées). */
function rendreStats(zone) {
  const parEtape = L.compterParEtape(D.etat.affaires);
  const max = Math.max(1, ...parEtape.map((e) => e.nombre));
  const debut = D.etat.reglages.debutActivite;
  const fenetre = L.fenetreCa(debut, moisCourantParis(), 6);
  const ca = L.caParMois(D.etat.affaires, fenetre, PD.etat.projets);
  const maxCa = Math.max(1, ...ca.map((m) => m.montant));
  const titreCa = fenetre.length === 6 && fenetre[0] > debut ? "Chiffre d'affaires encaissé, 6 derniers mois" : `Chiffre d'affaires encaissé, depuis ${L.libelleMois(fenetre[0])}`;
  const signature = `${titreCa}|${fenetre.join('|')}`;
  if (zone.dataset.signature !== signature) {
    zone.dataset.signature = signature;
    remplir(zone,
      h('div', { class: 'stats-etapes' },
        h('h3', {}, 'Affaires par étape'),
        h('ul', { class: 'barres-horizontales' }, parEtape.map((e) => h('li', { dataset: { etape: e.id } },
          h('span', { class: 'barre-libelle' }, e.libelle),
          h('span', { class: 'barre' }, h('span', { class: 'barre-remplie', style: { width: '0%', background: e.couleur } })),
          h('span', { class: 'barre-nombre' }, '0'))))),
      h('div', { class: 'stats-ca' },
        h('h3', { 'data-role': 'titre-ca' }, titreCa),
        h('div', { class: 'barres-verticales', role: 'img' }, ca.map((m) => h('div', { class: 'colonne-ca', dataset: { mois: m.mois } },
          h('span', { class: 'colonne-valeur' }, ''),
          h('span', { class: 'colonne-piste' }, h('span', { class: 'colonne-remplie', style: { height: '0%' } })),
          h('span', { class: 'colonne-libelle' }, m.libelle))))));
  }
  for (const e of parEtape) {
    const li = zone.querySelector(`li[data-etape="${e.id}"]`);
    animerCompteur(li.querySelector('.barre-nombre'), derniersNombres.get(e.id) || 0, e.nombre);
    derniersNombres.set(e.id, e.nombre);
    const remplie = li.querySelector('.barre-remplie');
    requestAnimationFrame(() => requestAnimationFrame(() => { remplie.style.width = `${(e.nombre / max) * 100}%`; }));
  }
  zone.querySelector('.barres-verticales').setAttribute('aria-label', ca.map((m) => `${L.libelleMois(m.mois)} : ${L.formatEuros(m.montant)}`).join(', '));
  for (const m of ca) {
    const col = zone.querySelector(`.colonne-ca[data-mois="${m.mois}"]`);
    col.querySelector('.colonne-valeur').textContent = m.montant ? L.formatEuros(m.montant) : '';
    const remplie = col.querySelector('.colonne-remplie');
    requestAnimationFrame(() => requestAnimationFrame(() => { remplie.style.height = `${Math.max(m.montant ? 4 : 0, (m.montant / maxCa) * 100)}%`; }));
  }
}
