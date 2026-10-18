// Zone « Dossier Drive parent » : sous la case « Créer un dossier dans Google Drive » (Réglages > Options du CRM), visible seulement quand la case est cochée.
// Le dossier Drive où le bouton range les dossiers créés, choisi UNE fois avec la fenêtre Google ; sans choix, l'appli en crée un toute seule au premier dossier.
import { h, icone, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import { googleDisponible, ouvrirFenetreGoogle } from '../../os/google-picker.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { nettoyerNomDossier } from '../../os/google-drive.js';

export function zoneDossierParent() {
  const nomParent = h('span', { class: 'valeur-parent', 'data-role': 'dossier-parent' });
  // (le nom complet reste lisible au survol quand il est tronqué)
  const choisirParent = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'choisir-dossier-parent', onclick: async () => {
    choisirParent.disabled = true;
    try {
      const elus = await ouvrirFenetreGoogle({ mode: 'dossier', email: D.compteCourant()?.email || '', multiple: false });
      const dossier = elus[0];
      if (!dossier) return;
      const { nom } = nettoyerNomDossier(dossier.nom);
      await D.enregistrerReglages({ dossierParentDrive: { id: dossier.id, nom: nom || dossier.id } });
      toast('Dossier parent enregistré');
    } catch (e) {
      if (!e?.annule) console.warn(e);
      toast(e?.message || 'Choix impossible', { type: e?.annule ? 'info' : 'erreur' });
    } finally { choisirParent.disabled = !googleDisponible(); }
  } }, icone('search', { taille: 14 }), 'Choisir dans Google Drive');
  const retirerParent = h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'retirer-dossier-parent', onclick: () => {
    const ancien = D.etat.reglages.dossierParentDrive || null;
    return retirerAvecAnnulation({
      titre: 'Retirer le dossier parent ?', message: 'Au prochain dossier, l’appli en créera un nouveau toute seule. Les dossiers déjà créés ne bougent pas.',
      faire: () => D.enregistrerReglages({ dossierParentDrive: null }), defaire: () => D.enregistrerReglages({ dossierParentDrive: ancien }), messageFait: 'Dossier parent retiré',
    });
  } }, 'Retirer');
  const element = h('div', { class: 'zone-dossier-parent', 'data-role': 'zone-dossier-parent' },
    h('div', { class: 'ligne-parent-drive' }, h('span', { class: 'ligne-parent-libelle' }, 'Dossier Drive parent'), nomParent, choisirParent, retirerParent),
    h('p', { class: 'aide' }, 'Dans la fenêtre Google, seuls les dossiers s’affichent (les fichiers sont cachés exprès) : « Aucun document » veut dire que ce dossier n’a pas de sous-dossier, clique alors sur « Sélectionner ». Sans dossier parent choisi, l’appli en crée un toute seule la première fois (« Chevalier IA - … ») et y range les dossiers. Renommer ou déplacer un dossier dans Drive ne casse pas son lien.'));
  // Les réglages changent : l'écran des options se redessine, donc la zone est refaite à chaque fois (pas de mise à jour à part).
  const parent = D.etat.reglages.dossierParentDrive;
  nomParent.textContent = parent?.nom || 'Créé tout seul au premier dossier';
  nomParent.title = parent?.nom || '';
  retirerParent.hidden = !parent;
  choisirParent.disabled = !googleDisponible();
  return element;
}
