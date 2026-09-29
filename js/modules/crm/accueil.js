// Accueil : objectifs du mois, À faire (En retard, Aujourd'hui, Sans action prévue), statistiques, rappel d'export.
import { h, icone, vider, toast } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { rendreObjectifs, surObjectifs, moisCourantParis } from '../../os/objectifs.js';
import { animerCompteur } from '../../os/celebrations.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { marquerFait, dialogueProchaineAction, pastilleEtape } from './fiche.js';
import { exporterCsv } from './liste.js';

let moisAffiche = null;

export function etatVide(message, { bouton } = {}) {
  return h('div', { class: 'etat-vide' },
    h('img', { src: 'assets/charles-portrait.png', alt: '', width: '120', height: '90', class: 'charles-vide' }),
    h('p', {}, message),
    bouton || null);
}

export function rendreAccueil(conteneur, { compte }) {
  const moisCourant = moisCourantParis();
  if (!moisAffiche || moisAffiche > moisCourant) moisAffiche = moisCourant;

  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const rappel = h('div', { class: 'zone-rappel' });
  const zoneObjectifs = h('div', { class: 'zone-objectifs' });
  const libelleMois = h('span', { class: 'mois-libelle' });
  const precedent = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Mois précédent', onclick: () => changerMois(-1) }, icone('chevron-left'));
  const suivant = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Mois suivant', onclick: () => changerMois(1) }, icone('chevron-right'));
  const zoneAFaire = h('div', { class: 'zone-a-faire' });
  const zoneStats = h('div', { class: 'zone-stats' });

  const page = h('div', { class: 'page page-accueil' },
    h('header', { class: 'page-tete' },
      h('div', {}, h('p', { class: 'etiquette' }, jour), h('h1', {}, `Bonjour ${compte.nom}`)),
      h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => naviguer('crm/fiche/nouvelle') }, icone('plus', { taille: 16 }), 'Nouvelle fiche')),
    rappel,
    h('section', { class: 'carte-section section-objectifs', 'aria-labelledby': 'titre-objectifs' },
      h('div', { class: 'section-tete' },
        h('h2', { id: 'titre-objectifs' }, icone('target', { taille: 18 }), 'Objectifs du mois'),
        h('div', { class: 'selecteur-mois' }, precedent, libelleMois, suivant)),
      zoneObjectifs),
    h('div', { class: 'grille-accueil' },
      h('section', { class: 'carte-section section-a-faire', 'aria-labelledby': 'titre-a-faire' },
        h('div', { class: 'section-tete' }, h('h2', { id: 'titre-a-faire' }, icone('check-check', { taille: 18 }), 'À faire')),
        zoneAFaire),
      h('section', { class: 'carte-section section-ajout-rapide', 'aria-labelledby': 'titre-ajout' },
        h('div', { class: 'section-tete' }, h('h2', { id: 'titre-ajout' }, icone('plus', { taille: 18 }), 'Ajout rapide')),
        formulaireAjoutRapide())),
    h('section', { class: 'carte-section section-stats', 'aria-labelledby': 'titre-stats' },
      h('div', { class: 'section-tete' }, h('h2', { id: 'titre-stats' }, icone('chart-column', { taille: 18 }), 'Statistiques')),
      zoneStats));
  conteneur.append(page);

  let majObjectifs = null;
  function monterObjectifs() {
    libelleMois.textContent = L.libelleMois(moisAffiche);
    suivant.disabled = moisAffiche >= moisCourant;
    majObjectifs = rendreObjectifs(zoneObjectifs, { mois: moisAffiche });
  }
  function changerMois(n) {
    const m = L.decalerMois(moisAffiche, n);
    if (m > moisCourant) return;
    moisAffiche = m;
    monterObjectifs();
  }

  function rafraichir() {
    if (!D.estPret()) {
      vider(zoneAFaire).append(h('div', { class: 'chargement-bloc' }, h('span', { class: 'rond-chargement' })));
      return;
    }
    majObjectifs ? majObjectifs() : monterObjectifs();
    rendreRappel(rappel);
    rendreAFaire(zoneAFaire);
    rendreStats(zoneStats);
  }

  monterObjectifs();
  rafraichir();
  const arrets = [D.surChangement(rafraichir), surObjectifs(() => majObjectifs?.())];
  return () => arrets.forEach((f) => f());
}

function rendreRappel(zone) {
  vider(zone);
  if (!L.rappelExportVisible(D.etat.reglages.dernierExport)) return;
  zone.append(h('div', { class: 'rappel-export', role: 'status' },
    icone('download', { taille: 18 }),
    h('div', {}, h('strong', {}, 'Pense à ta sauvegarde mensuelle'), h('p', { class: 'aide' }, 'Exporte toutes les fiches en CSV (lisible dans Excel).')),
    h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'exporter-tout' }, onclick: () => exporterCsv(D.etat.fiches, { complet: true }) }, 'Exporter')));
}

function ligneAction(item, groupe) {
  const f = item.fiche;
  return h('li', { class: `ligne-a-faire ${groupe === 'retard' ? 'en-retard' : ''}`, dataset: { fiche: f.id } },
    h('div', { class: 'ligne-a-faire-texte' },
      h('a', { class: 'lien-fiche', href: `#/crm/fiche/${f.id}` }, f.nom),
      f.entreprise ? h('span', { class: 'aide' }, ` · ${f.entreprise}`) : null,
      h('p', { class: 'ligne-action' }, item.action,
        h('span', { class: `date-action ${groupe === 'retard' ? 'retard' : ''}` }, ` · ${L.formatJourCourt(item.date, D.ctx().aujourdhui)}`))),
    h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit bouton-fait', 'aria-label': `Fait : ${item.action} (${f.nom})`,
      onclick: (e) => {
        e.currentTarget.closest('li').classList.add('disparait');
        marquerFait(f, { reprise: item.type === 'reveil' });
      } }, icone('check', { taille: 16 }), 'Fait'));
}

function rendreAFaire(zone) {
  vider(zone);
  const aujourdhui = D.ctx().aujourdhui;
  const { enRetard, aujourdhui: duJour, sansAction } = L.aFaire(D.etat.fiches, aujourdhui);
  if (!D.etat.fiches.length) {
    zone.append(etatVide('Ajoute ton premier prospect', { bouton: h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => naviguer('crm/fiche/nouvelle') }, icone('plus', { taille: 16 }), 'Ajouter un prospect') }));
    return;
  }
  const groupe = (titre, cle, items, rendu, classe = '') => h('div', { class: `groupe-a-faire ${classe}`, dataset: { groupe: cle } },
    h('h3', {}, titre, h('span', { class: 'compteur' }, String(items.length))),
    items.length ? h('ul', {}, items.map(rendu)) : null);
  if (!enRetard.length && !duJour.length) {
    zone.append(etatVide('Aucune relance aujourd’hui, Charles veille'));
  }
  if (enRetard.length) zone.append(groupe('En retard', 'retard', enRetard, (x) => ligneAction(x, 'retard'), 'groupe-retard'));
  if (duJour.length) zone.append(groupe('Aujourd’hui', 'aujourdhui', duJour, (x) => ligneAction(x, 'jour')));
  zone.append(groupe('Sans action prévue', 'sans-action', sansAction, (f) => h('li', { class: 'ligne-a-faire', dataset: { fiche: f.id } },
    h('div', { class: 'ligne-a-faire-texte' },
      h('a', { class: 'lien-fiche', href: `#/crm/fiche/${f.id}` }, f.nom),
      h('p', { class: 'ligne-action' }, pastilleEtape(f.etape))),
    h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => dialogueProchaineAction(f, { titre: 'Planifier une action' }) }, icone('calendar', { taille: 16 }), 'Planifier')), 'groupe-sans-action'));
}

let derniersNombres = new Map();

function rendreStats(zone) {
  const parEtape = L.compterParEtape(D.etat.fiches);
  const max = Math.max(1, ...parEtape.map((e) => e.nombre));
  const ca = L.caParMois(D.etat.fiches, moisCourantParis(), 6);
  const maxCa = Math.max(1, ...ca.map((m) => m.montant));
  vider(zone);
  const barres = h('div', { class: 'stats-etapes' },
    h('h3', {}, 'Fiches par étape'),
    h('ul', { class: 'barres-horizontales' }, parEtape.map((e) => {
      const remplie = h('span', { class: 'barre-remplie', style: { width: '0%', background: e.couleur } });
      const nombre = h('span', { class: 'barre-nombre' }, '0');
      animerCompteur(nombre, derniersNombres.get(e.id) || 0, e.nombre);
      derniersNombres.set(e.id, e.nombre);
      requestAnimationFrame(() => requestAnimationFrame(() => { remplie.style.width = `${(e.nombre / max) * 100}%`; }));
      return h('li', { dataset: { etape: e.id } }, h('span', { class: 'barre-libelle' }, e.libelle), h('span', { class: 'barre' }, remplie), nombre);
    })));
  const colonnes = h('div', { class: 'stats-ca' },
    h('h3', {}, "Chiffre d'affaires encaissé, 6 derniers mois"),
    h('div', { class: 'barres-verticales', role: 'img', 'aria-label': ca.map((m) => `${L.libelleMois(m.mois)} : ${L.formatEuros(m.montant)}`).join(', ') },
      ca.map((m) => {
        const col = h('span', { class: 'colonne-remplie', style: { height: '0%' } });
        requestAnimationFrame(() => requestAnimationFrame(() => { col.style.height = `${Math.max(m.montant ? 4 : 0, (m.montant / maxCa) * 100)}%`; }));
        return h('div', { class: 'colonne', dataset: { mois: m.mois } },
          h('span', { class: 'colonne-valeur' }, m.montant ? L.formatEuros(m.montant) : ''),
          h('span', { class: 'colonne-piste' }, col),
          h('span', { class: 'colonne-libelle' }, m.libelle));
      })));
  zone.append(barres, colonnes);
}

function formulaireAjoutRapide() {
  const nom = h('input', { type: 'text', class: 'champ', placeholder: 'Prénom et nom', 'aria-label': 'Prénom et nom', autocomplete: 'off' });
  const entreprise = h('input', { type: 'text', class: 'champ', placeholder: 'Entreprise', 'aria-label': 'Entreprise' });
  const source = h('select', { class: 'champ', 'aria-label': 'Source' });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const remplir = () => {
    const v = source.value;
    vider(source).append(h('option', { value: '' }, 'Source…'), ...D.etat.sources.map((s) => h('option', { value: s }, s)));
    source.value = v;
  };
  remplir();
  source.addEventListener('focus', remplir);
  return h('form', { class: 'ajout-rapide', onsubmit: async (e) => {
    e.preventDefault();
    const valeurs = { nom: nom.value.trim(), entreprise: entreprise.value.trim(), source: source.value };
    if (!valeurs.nom || !valeurs.source) {
      erreur.textContent = !valeurs.nom ? 'Indique le prénom et le nom.' : 'Choisis une source.';
      (!valeurs.nom ? nom : source).focus();
      return;
    }
    erreur.textContent = '';
    try {
      const id = await D.creerFiche(valeurs);
      nom.value = ''; entreprise.value = ''; source.value = '';
      toast('Fiche créée');
      naviguer(`crm/fiche/${id}`);
    } catch {
      toast('Création impossible', { type: 'erreur' });
    }
  } },
  nom, entreprise, source, erreur,
  h('button', { type: 'submit', class: 'bouton bouton-principal' }, icone('plus', { taille: 16 }), 'Ajouter'),
  h('p', { class: 'aide' }, 'La fiche s’ouvre ensuite pour ajouter une note rapide.'));
}
