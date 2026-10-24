// Fenêtre « Sélection de la famille » du Bordereau : la liste des familles, un choix, « Annuler » / « Sélectionner », et un menu « … » pour créer, renommer,
// désactiver ou réactiver une famille. Les règles (noms uniques, longueur) sont dans familles.js ; l'écriture dans donnees.js.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu } from '../../os/ui.js';
import * as D from './donnees.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant, ou demande à un éditeur de l’espace.';

/** Demande un nom de famille. `valider(nom)` renvoie `{ erreur }` (message affiché sous le champ, la fenêtre reste ouverte). Renvoie true si enregistré. */
async function fenetreNom(titre, valeur, valider) {
  const champ = h('input', { type: 'text', class: 'champ', value: valeur, 'aria-label': 'Nom de la famille', autocomplete: 'off', maxlength: 200, dataset: { champ: 'nomFamille' } });
  const erreur = h('p', { class: 'erreur erreur-champ', role: 'alert', dataset: { erreur: 'nomFamille' } });
  async function tenter() {
    erreur.textContent = '';
    champ.classList.remove('invalide');
    try {
      const r = await valider(champ.value);
      if (r.erreur) { erreur.textContent = r.erreur; champ.classList.add('invalide'); champ.focus(); return false; }
      return true;
    } catch (e) {
      console.warn(e);
      erreur.textContent = ERREUR_ECRITURE;
      return false;
    }
  }
  return dialogue({
    titre,
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette' }, 'Nom de la famille', champ), erreur)),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
    auMontage: ({ boutons }) => { champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); boutons.at(-1).click(); } }); },
  });
}

/**
 * Ouvre la fenêtre. `courante` : l'identifiant de la famille actuelle de l'article ('' = aucune).
 * Renvoie `{ id }` (id vide = aucune famille) si on clique « Sélectionner », sinon `undefined`.
 */
export async function selectionFamille({ courante = '' } = {}) {
  let choix = courante || '';
  const liste = h('div', { class: 'liste-familles', role: 'radiogroup', 'aria-label': 'Familles' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'familles' } });
  let boutonOk = null;

  const famille = (id) => D.etat.familles.find((f) => f.id === id) ?? null;
  const choixPermis = () => !choix || (famille(choix) && (famille(choix).actif !== false || choix === courante));

  function rendre() {
    const options = [{ id: '', nom: 'Aucune famille', actif: true }, ...D.etat.familles];
    remplir(liste, options.map((f) => h('label', { class: `famille-option${f.actif === false ? ' famille-desactivee' : ''}`, dataset: { famille: f.id } },
      h('input', { type: 'radio', name: 'famille', value: f.id, checked: choix === f.id, onchange: () => { choix = f.id; majBoutons(); } }),
      f.nom, f.actif === false ? h('span', { class: 'discret' }, ' (désactivée)') : null)),
    D.etat.familles.length === 0 ? h('p', { class: 'discret', dataset: { vide: 'familles' } }, 'Aucune famille pour l’instant. Utilise le menu « … » pour créer la première.') : null);
    majBoutons();
  }
  function majBoutons() {
    if (!boutonOk) return;
    boutonOk.disabled = !choixPermis();
    avis.textContent = choixPermis() ? '' : 'Cette famille est désactivée : réactive-la avec le menu « … », ou choisis-en une autre.';
  }

  const nouvelle = async () => {
    await fenetreNom('Nouvelle famille', '', async (nom) => {
      const r = await D.creerFamille(nom);
      if (!r.erreur) choix = r.famille.id;
      return r;
    });
    rendre();
  };
  const renommer = async () => {
    const f = famille(choix);
    if (!f) return;
    await fenetreNom('Renommer la famille', f.nom, (nom) => D.renommerFamille(f.id, nom));
    rendre();
  };
  const basculer = async () => {
    const f = famille(choix);
    if (!f) return;
    try {
      if (f.actif === false) { await D.activerFamille(f.id, true); rendre(); return; }
      const ok = await confirmer('Désactiver cette famille ?', `« ${f.nom} » ne sera plus proposée aux nouveaux articles. Les articles déjà rattachés la gardent, et tu pourras la réactiver quand tu veux.`, { libelleOk: 'Désactiver' });
      if (ok) await D.activerFamille(f.id, false);
    } catch (e) { console.warn(e); avis.textContent = ERREUR_ECRITURE; }
    rendre();
  };
  const menu = h('button', {
    type: 'button', class: 'bouton-icone', 'aria-label': 'Gérer les familles', 'aria-haspopup': 'menu', dataset: { action: 'menu-familles' },
    onclick: (e) => {
      const f = famille(choix);
      ouvrirMenu(e.currentTarget, [
        { libelle: 'Nouvelle famille', icone: 'plus', action: nouvelle },
        { libelle: 'Renommer', icone: 'pencil', desactive: !f, action: renommer },
        { libelle: f?.actif === false ? 'Réactiver' : 'Désactiver', desactive: !f, action: basculer },
      ]);
    },
  }, icone('ellipsis', { taille: 18 }));

  const r = await dialogue({
    titre: 'Sélection de la famille',
    classe: 'dialogue-formulaire dialogue-familles',
    contenu: h('div', { class: 'pile' }, h('div', { class: 'ligne-champs entete-familles' }, h('span', { class: 'etiquette' }, 'Familles'), menu), liste, avis),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Sélectionner', valeur: true, style: 'principal' }],
    auMontage: ({ boutons }) => { boutonOk = boutons.at(-1); rendre(); },
  });
  return r ? { id: choix } : undefined;
}
