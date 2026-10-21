// Barre de recherche et de filtres des listes (personnes, organisations, affaires) : champ de recherche,
// fenêtre de filtres combinables, pastilles supprimables, filtres enregistrés.
import { h, icone, remplir, dialogue, demanderTexte, ouvrirMenu, toast, champIntelligent } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';

function unique(valeurs) {
  return [...new Set(valeurs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Contrôles de la fenêtre de filtres, selon la liste. */
function controles(liste) {
  const cases = (cle, libelle, options) => ({ cle, libelle, type: 'cases', options });
  const oui = (cle, libelle) => ({ cle, libelle, type: 'oui' });
  const etiquettes = D.etat.etiquettes.map((e) => ({ valeur: e.id, libelle: e.nom }));
  const sources = unique([...D.etat.sources, ...D.etat.personnes.map((p) => p.source), ...D.etat.affaires.map((a) => a.source)]);
  if (liste === 'personnes') {
    return [
      cases('etiquettes', 'Étiquettes', etiquettes),
      { cle: 'organisations', libelle: 'Organisations', type: 'organisations' },
      cases('sources', 'Source', sources.map((s) => ({ valeur: s, libelle: s }))),
      cases('villes', 'Ville', unique(D.etat.personnes.map((p) => p.ville)).map((v) => ({ valeur: v, libelle: v }))),
      oui('archives', 'Archivées seulement'),
    ];
  }
  if (liste === 'organisations') {
    return [
      cases('etiquettes', 'Étiquettes', etiquettes),
      cases('secteurs', 'Secteur', unique([...D.etat.secteurs, ...D.etat.organisations.map((o) => o.secteur)]).map((v) => ({ valeur: v, libelle: v }))),
      cases('villes', 'Ville', unique(D.etat.organisations.map((o) => o.ville)).map((v) => ({ valeur: v, libelle: v }))),
      oui('archives', 'Archivées seulement'),
    ];
  }
  return [
    cases('etapes', 'Étape', L.etapesActives(D.etat.config).map((e) => ({ valeur: e.id, libelle: e.libelle }))),
    cases('statuts', 'Statut', L.STATUTS.map((s) => ({ valeur: s.id, libelle: s.libelle }))),
    cases('priorites', 'Priorité', L.PRIORITES.map((p) => ({ valeur: p.id, libelle: p.libelle }))),
    cases('offres', 'Offre', D.etat.offres.filter((o) => o.actif !== false).map((o) => ({ valeur: o.id, libelle: o.nom }))),
    cases('sources', 'Source', sources.map((s) => ({ valeur: s, libelle: s }))),
    oui('enRetard', 'En retard'),
    oui('sansAction', 'Sans action prévue'),
    oui('semaine', 'À relancer cette semaine'),
  ];
}

async function ouvrirFenetreFiltres(liste, criteres) {
  const c = L.criteresComplets(liste, criteres);
  const corps = h('div', { class: 'pile filtres-corps' });
  let organisationsChoisies = [...c.organisations];
  let selecteurOrgs = null;
  for (const ctl of controles(liste)) {
    if (ctl.type === 'cases') {
      if (!ctl.options.length) continue;
      corps.append(h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, ctl.libelle),
        h('div', { class: 'cases' }, ctl.options.map((o) => h('label', { class: 'case' },
          h('input', { type: 'checkbox', checked: c[ctl.cle].includes(o.valeur), dataset: { cle: ctl.cle, valeur: o.valeur },
            onchange: (e) => { c[ctl.cle] = e.target.checked ? [...c[ctl.cle], o.valeur] : c[ctl.cle].filter((v) => v !== o.valeur); } }), o.libelle)))));
    } else if (ctl.type === 'oui') {
      corps.append(h('label', { class: 'case case-seule' }, h('input', { type: 'checkbox', checked: !!c[ctl.cle], dataset: { cle: ctl.cle }, onchange: (e) => { c[ctl.cle] = e.target.checked; } }), ctl.libelle));
    } else if (ctl.type === 'choix') {
      corps.append(h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, ctl.libelle),
        h('select', { class: 'champ', dataset: { cle: ctl.cle }, onchange: (e) => { c[ctl.cle] = e.target.value; } }, ctl.options.map((o) => h('option', { value: o.valeur, selected: c[ctl.cle] === o.valeur }, o.libelle)))));
    } else if (ctl.type === 'organisations') {
      const valeur = organisationsChoisies.map((id) => D.organisation(id)).filter(Boolean).map((o) => ({ id: o.id, libelle: o.nom }));
      selecteurOrgs = champIntelligent({
        etiquette: 'Organisations', placeholder: 'Choisir des organisations', icone: 'building-2', multiple: true, valeur,
        fournir: (saisie) => L.rechercherSuggestions(saisie, D.etat.organisations.filter((o) => !o.archive).map((o) => ({ id: o.id, libelle: o.nom })), {}),
        surChoix: (liste2) => { organisationsChoisies = liste2.map((x) => x.id); },
      });
      corps.append(h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, ctl.libelle), selecteurOrgs.element));
    }
  }
  const r = await dialogue({
    titre: 'Filtres',
    classe: 'dialogue-formulaire dialogue-filtres',
    contenu: corps,
    boutons: [
      { libelle: 'Tout effacer', valeur: 'effacer' },
      { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal' },
    ],
  });
  if (r === 'effacer') return { ...L.criteresComplets(liste, { recherche: c.recherche }) };
  if (r === 'appliquer') return { ...c, organisations: organisationsChoisies };
  return null;
}

/**
 * Bouton « Filtres » commun à toutes les listes et à l'historique des fiches : icône entonnoir, texte « Filtres », pastille de compte
 * quand des filtres sont posés. `majCompte(n)` met la pastille à jour ; `petit` donne la version compacte (titre d'un bloc).
 */
export function boutonFiltres({ auClic, petit = false }) {
  const element = h('button', { type: 'button', class: `bouton bouton-secondaire${petit ? ' bouton-petit' : ''}`, 'data-action': 'filtres', onclick: auClic });
  function majCompte(n = 0) {
    remplir(element, icone('funnel', { taille: 16 }), 'Filtres', n ? h('span', { class: 'compteur-filtres' }, String(n)) : null);
  }
  majCompte(0);
  return { element, majCompte };
}

/**
 * Barre de filtres d'une liste.
 * options : { liste, lireCriteres(), ecrireCriteres(c), contexte() (pour les libellés des pastilles) }
 * Renvoie { element, rafraichir() }.
 */
export function barreFiltres({ liste, lireCriteres, ecrireCriteres, contexte = () => ({}), placeholder = 'Rechercher' }) {
  const champRecherche = h('input', { class: 'champ', type: 'search', 'aria-label': placeholder, placeholder, autocomplete: 'off', value: lireCriteres().recherche || '',
    oninput: (e) => ecrireCriteres({ ...L.criteresComplets(liste, lireCriteres()), recherche: e.target.value }) });
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  const boutonFiltres_ = boutonFiltres({ auClic: async () => {
    const r = await ouvrirFenetreFiltres(liste, lireCriteres());
    if (r) ecrireCriteres(r);
  } });
  const boutonF = boutonFiltres_.element;
  const boutonEnregistres = h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'filtres-enregistres', 'aria-label': 'Filtres enregistrés',
    onclick: (e) => {
      const saved = D.etat.filtres.filter((f) => (f.liste || 'affaires') === liste);
      ouvrirMenu(e.currentTarget, [
        ...saved.map((f) => ({ libelle: f.nom, icone: 'bookmark', action: () => ecrireCriteres(L.criteresComplets(liste, f.criteres)) })),
        { libelle: 'Enregistrer ce filtre…', icone: 'bookmark-plus', desactive: !L.criteresActifs(liste, lireCriteres()), action: enregistrer },
      ]);
    } }, icone('bookmark', { taille: 16 }));
  async function enregistrer() {
    const nom = await demanderTexte('Enregistrer ce filtre', { libelle: 'Nom du filtre' });
    if (!nom) return;
    const id = `${L.normaliser(nom).replace(/[^a-z0-9]+/g, '_')}_${L.idAleatoire().slice(0, 4)}`;
    await D.enregistrerFiltres([...D.etat.filtres, { id, nom, liste, criteres: L.criteresComplets(liste, lireCriteres()), ordre: D.etat.filtres.length + 1 }]);
    toast('Filtre enregistré');
  }
  function rafraichir() {
    const c = lireCriteres();
    if (champRecherche.value !== (c.recherche || '') && document.activeElement !== champRecherche) champRecherche.value = c.recherche || '';
    const actifs = L.pastillesFiltres(liste, c, contexte()).filter((p) => p.cle !== 'recherche');
    boutonFiltres_.majCompte(actifs.length);
    remplir(zonePastilles,
      actifs.map((p) => h('span', { class: 'pastille-filtre' }, p.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => ecrireCriteres(L.retirerCritere(liste, c, p.cle, p.valeur)) }, icone('x', { taille: 12 })))),
      actifs.length > 1 || (actifs.length && c.recherche) ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => ecrireCriteres(L.criteresComplets(liste, {})) }, 'Tout effacer') : null);
  }
  const element = h('div', { class: 'barre-filtres' },
    h('div', { class: 'barre-filtres-ligne' }, h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), champRecherche), boutonF, boutonEnregistres),
    zonePastilles);
  rafraichir();
  return { element, rafraichir };
}

