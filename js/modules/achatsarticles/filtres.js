// Fenêtre « Filtres » de l'écran Articles : État et Fournisseur, cases à cocher, « Tout effacer » et « Appliquer ». La recherche garde son champ dans la barre.
import { h, dialogue } from '../../os/ui.js';
import { ETATS, libelleEtatFiltre } from './logique.js';

/** Ouvre la fenêtre. Renvoie une promesse : les nouveaux critères, ou null si elle est fermée sans appliquer. */
export function ouvrirFiltres({ criteres, fournisseurs }) {
  const etats = new Set(criteres.etats);
  const choisis = new Set(criteres.fournisseurs);
  const case_ = (ensemble, valeur, libelle) => h('label', { class: 'case' },
    h('input', { type: 'checkbox', checked: ensemble.has(valeur), dataset: { valeur }, onchange: (e) => { if (e.target.checked) ensemble.add(valeur); else ensemble.delete(valeur); } }), libelle);
  const contenu = h('div', { class: 'pile' },
    h('fieldset', { class: 'bloc-champ groupe-cases' }, h('legend', { class: 'etiquette' }, 'État'),
      h('div', { class: 'filtre-liste' }, ETATS.map((e) => case_(etats, e.id, libelleEtatFiltre(e.id))))),
    h('fieldset', { class: 'bloc-champ groupe-cases' }, h('legend', { class: 'etiquette' }, 'Fournisseur'),
      h('div', { class: 'filtre-liste' }, fournisseurs.length === 0 ? h('span', { class: 'aide' }, 'Aucun pour l’instant.') : fournisseurs.map((f) => case_(choisis, f, f)))));
  return dialogue({
    titre: 'Filtres',
    contenu,
    classe: 'dialogue-formulaire dialogue-filtres',
    boutons: [
      { libelle: 'Tout effacer', valeur: () => ({ recherche: criteres.recherche, etats: [], fournisseurs: [] }) },
      { libelle: 'Appliquer', valeur: () => ({ recherche: criteres.recherche, etats: ETATS.map((e) => e.id).filter((id) => etats.has(id)), fournisseurs: fournisseurs.filter((f) => choisis.has(f)) }), style: 'principal' },
    ],
  });
}
