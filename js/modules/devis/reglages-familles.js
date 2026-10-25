// Réglages du module Devis : section « Familles d'articles ». Même présentation que les écrans « Sources » ou « Secteurs » du CRM : une liste de lignes avec un champ
// pour renommer, des boutons à droite, un champ d'ajout en bas, et pour une désactivation la fenêtre de confirmation puis le message « … · Annuler » pendant 8 secondes.
// Les sept familles de premier niveau sont verrouillées (aucun bouton) ; leurs sous-familles se renomment, se désactivent et se réactivent. Les règles (noms uniques,
// longueur, deux niveaux) sont dans familles.js ; l'écriture dans donnees.js.
import { h, icone, remplir, toast } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import * as D from './donnees.js';
import { arbreFamilles, estFamilleDepart } from './familles.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : réessaie dans un instant, ou demande à un éditeur de l’espace. Rien n’a été changé.';

export function reglagesFamilles(page) {
  const sec = h('section', { class: 'carte-section', id: 'reglages-familles' },
    h('h2', {}, icone('tag', { taille: 18 }), 'Familles d’articles'),
    h('p', { class: 'aide' }, 'Les familles rangent les articles de ton catalogue. Les sept grandes familles sont fixes ; tu peux renommer, désactiver et réactiver leurs sous-familles, ou en ajouter. Une sous-famille désactivée n’est plus proposée pour de nouveaux articles, ceux qui l’ont déjà la gardent.'));
  const zone = h('div', { class: 'pile liste-familles-reglages' });
  sec.append(zone);
  page.append(sec);

  // Les messages et les textes en cours de saisie survivent aux redessins (une écriture refusée revient par la base, qui redessine la liste).
  const erreurs = new Map();
  const saisies = new Map();
  const message = (id) => zone.querySelector(`[data-erreur="famille-${id}"]`);
  const dire = (id, texte) => { erreurs.set(id, texte); const p = message(id); if (p) p.textContent = texte; if (texte) toast(texte, { type: 'erreur', duree: 6000 }); };

  /** Exécute une écriture ; un refus de règle (doublon, nom trop long…) ou d'écriture est dit sous la famille, rien n'est perdu. Renvoie true si c'est écrit. */
  async function ecrire(parentId, action) {
    dire(parentId, '');
    try {
      const r = await action();
      if (r?.erreur) { dire(parentId, r.erreur); return false; }
      return true;
    } catch (e) {
      console.warn(e);
      dire(parentId, ERREUR_ECRITURE);
      return false;
    }
  }

  function ligneSousFamille(f) {
    const inactive = f.actif === false;
    const champ = h('input', { type: 'text', class: 'champ', value: f.nom, 'aria-label': `Renommer la sous-famille ${f.nom}`, maxlength: '200', dataset: { champ: 'nomFamille' },
      onchange: async (e) => {
        const nomActuel = D.etat.familles.find((x) => x.id === f.id)?.nom ?? f.nom; // la ligne n'est pas redessinée pendant la saisie : on relit le nom enregistré
        const v = e.target.value.trim();
        if (!v || v === nomActuel) { e.target.value = nomActuel; return; }
        const ok = await ecrire(f.parentId, () => D.renommerFamille(f.id, v));
        if (ok) toast('Sous-famille renommée'); else e.target.value = D.etat.familles.find((x) => x.id === f.id)?.nom ?? nomActuel;
      } });
    const bouton = inactive
      ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'reactiver-famille' }, 'aria-label': `Réactiver ${f.nom}`,
        onclick: async () => { if (await ecrire(f.parentId, () => D.activerFamille(f.id, true))) toast(`« ${f.nom} » réactivée`); } }, icone('archive-restore', { taille: 14 }), 'Réactiver')
      : h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'desactiver-famille' }, 'aria-label': `Désactiver ${f.nom}`,
        onclick: () => retirerAvecAnnulation({
          titre: 'Désactiver cette sous-famille ?', libelleOk: 'Désactiver',
          message: `« ${f.nom} » ne sera plus proposée pour de nouveaux articles. Les articles qui l’ont déjà la gardent, et tu pourras la réactiver quand tu veux.`,
          faire: async () => { const r = await D.activerFamille(f.id, false); if (r.erreur) throw new Error(r.erreur); },
          defaire: async () => { const r = await D.activerFamille(f.id, true); if (r.erreur) throw new Error(r.erreur); },
          messageFait: `« ${f.nom} » désactivée`, messageErreur: 'Désactivation impossible : réessaie dans un instant. Rien n’a été changé.',
        }) }, icone('archive', { taille: 14 }), 'Désactiver');
    return h('div', { class: `ligne-reglage${inactive ? ' archivee' : ''}`, dataset: { famille: f.id, niveau: '2' } }, champ,
      inactive ? h('span', { class: 'badge' }, 'Désactivée') : null, h('div', { class: 'groupe-boutons' }, bouton));
  }

  function formulaireSousFamille(parent) {
    const champ = h('input', { type: 'text', class: 'champ', placeholder: 'Nouvelle sous-famille', 'aria-label': `Nouvelle sous-famille de ${parent.nom}`, maxlength: '200', value: saisies.get(parent.id) ?? '', dataset: { champ: 'nouvelle-sous-famille' }, oninput: (e) => saisies.set(parent.id, e.target.value) });
    return h('form', { class: 'ligne-ajout', onsubmit: async (e) => {
      e.preventDefault();
      const v = champ.value.trim();
      if (!v) { champ.focus(); return; }
      if (await ecrire(parent.id, () => D.creerFamille(v, parent.id))) { champ.value = ''; saisies.delete(parent.id); toast(`Sous-famille « ${v} » ajoutée`); }
    } }, champ, h('button', { type: 'submit', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-sous-famille' } }, icone('plus', { taille: 16 }), 'Sous-famille'));
  }

  function rendre() {
    remplir(zone, ...arbreFamilles(D.etat.familles).map(({ famille, enfants }) => h('div', { class: 'groupe-famille', dataset: { groupe: famille.id } },
      h('div', { class: 'ligne-reglage ligne-famille-depart', dataset: { famille: famille.id, niveau: '1' } },
        h('strong', {}, famille.nom), estFamilleDepart(famille.id) ? h('span', { class: 'badge' }, 'Famille de départ') : null),
      enfants.length ? enfants.map(ligneSousFamille) : h('p', { class: 'vide-discret' }, 'Aucune sous-famille.'),
      h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: `famille-${famille.id}` } }, erreurs.get(famille.id) ?? ''),
      formulaireSousFamille(famille))));
  }
  rendre();

  // Un changement venu d'ailleurs met la liste à jour, sauf pendant qu'on tape dans un champ de cette section.
  function rafraichir() {
    if (sec.contains(document.activeElement) && document.activeElement.matches('input')) return;
    rendre();
  }
  return D.surChangement(rafraichir);
}
