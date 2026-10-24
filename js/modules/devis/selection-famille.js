// Fenêtre « Sélection de la famille » du Bordereau : les familles en arbre à deux niveaux (les sept familles de départ, puis leurs sous-familles en retrait), un choix,
// « Annuler » / « Sélectionner », et un menu « … » pour créer une sous-famille, renommer ou désactiver une sous-famille. Les sept familles de départ sont verrouillées
// (ni renommées, ni désactivées). Les règles (noms uniques par parent, deux niveaux) sont dans familles.js ; l'écriture dans donnees.js.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu } from '../../os/ui.js';
import * as D from './donnees.js';
import { arbreFamilles, estFamilleDepart, cheminFamille } from './familles.js';

const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant, ou demande à un éditeur de l’espace.';

/** Demande un nom de famille. `valider(nom)` renvoie `{ erreur }` (message affiché sous le champ, la fenêtre reste ouverte). Renvoie true si enregistré. */
async function fenetreNom(titre, valeur, valider, aide = null) {
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
    contenu: h('div', { class: 'pile' }, aide ? h('p', { class: 'discret' }, aide) : null, h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette' }, 'Nom de la famille', champ), erreur)),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Enregistrer', valeur: true, style: 'principal', avantFermeture: tenter }],
    auMontage: ({ boutons }) => { champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); boutons.at(-1).click(); } }); },
  });
}

/**
 * Ouvre la fenêtre. `courante` : l'identifiant de la famille actuelle de l'article ('' = aucune).
 * Renvoie `{ id }` si on clique « Sélectionner », sinon `undefined`.
 */
export async function selectionFamille({ courante = '' } = {}) {
  let choix = courante || '';
  const liste = h('div', { class: 'liste-familles', role: 'radiogroup', 'aria-label': 'Familles' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'familles' } });
  let boutonOk = null;

  const famille = (id) => D.etat.familles.find((f) => f.id === id) ?? null;
  const choixPermis = () => !!choix && !!famille(choix) && (famille(choix).actif !== false || choix === courante);

  function option(f, niveau) {
    return h('label', { class: `famille-option famille-niveau-${niveau}${f.actif === false ? ' famille-desactivee' : ''}`, dataset: { famille: f.id, niveau: String(niveau) } },
      h('input', { type: 'radio', name: 'famille', value: f.id, checked: choix === f.id, onchange: () => { choix = f.id; majBoutons(); } }),
      f.nom, f.actif === false ? h('span', { class: 'discret' }, ' (désactivée)') : null);
  }
  function rendre() {
    remplir(liste, arbreFamilles(D.etat.familles).flatMap(({ famille: f, enfants }) => [option(f, 1), ...enfants.map((e) => option(e, 2))]));
    majBoutons();
  }
  function majBoutons() {
    if (!boutonOk) return;
    const f = famille(choix);
    boutonOk.disabled = !choixPermis();
    avis.textContent = f && !choixPermis() ? 'Cette famille est désactivée : réactive-la avec le menu « … », ou choisis-en une autre.' : '';
  }

  const nouvelle = async () => {
    const f = famille(choix);
    if (!f) return;
    const parent = f.parentId ? famille(f.parentId) : f; // une sous-famille sélectionnée : la nouvelle va à côté d'elle, sous le même parent
    if (!parent) return;
    await fenetreNom('Nouvelle sous-famille', '', async (nom) => {
      const r = await D.creerFamille(nom, parent.id);
      if (!r.erreur) choix = r.famille.id;
      return r;
    }, `Elle sera rangée dans « ${parent.nom} ».`);
    rendre();
  };
  const renommer = async () => {
    const f = famille(choix);
    if (!f || estFamilleDepart(f.id)) return;
    await fenetreNom('Renommer la famille', f.nom, (nom) => D.renommerFamille(f.id, nom));
    rendre();
  };
  const basculer = async () => {
    const f = famille(choix);
    if (!f || estFamilleDepart(f.id)) return;
    try {
      if (f.actif === false) { await D.activerFamille(f.id, true); rendre(); return; }
      const ok = await confirmer('Désactiver cette famille ?', `« ${cheminFamille(D.etat.familles, f.id)} » ne sera plus proposée aux nouveaux articles. Les articles déjà rattachés la gardent, et tu pourras la réactiver quand tu veux.`, { libelleOk: 'Désactiver' });
      if (ok) await D.activerFamille(f.id, false);
    } catch (e) { console.warn(e); avis.textContent = ERREUR_ECRITURE; }
    rendre();
  };
  const menu = h('button', {
    type: 'button', class: 'bouton-icone', 'aria-label': 'Gérer les familles', 'aria-haspopup': 'menu', dataset: { action: 'menu-familles' },
    onclick: (e) => {
      const f = famille(choix);
      const modifiable = !!f && !estFamilleDepart(f.id); // les familles de départ n'ont ni « Renommer » ni « Désactiver »
      ouvrirMenu(e.currentTarget, [
        { libelle: 'Nouvelle sous-famille', icone: 'plus', desactive: !f, action: nouvelle },
        ...(modifiable ? [
          { libelle: 'Renommer', icone: 'pencil', action: renommer },
          { libelle: f.actif === false ? 'Réactiver' : 'Désactiver', action: basculer },
        ] : []),
      ]);
    },
  }, icone('ellipsis', { taille: 18 }));

  const r = await dialogue({
    titre: 'Sélection de la famille',
    classe: 'dialogue-formulaire dialogue-familles',
    contenu: h('div', { class: 'pile' }, h('div', { class: 'ligne-champs entete-familles' }, h('span', { class: 'etiquette' }, 'Familles'), menu),
      h('p', { class: 'discret' }, 'Choisis une famille, ou une sous-famille. Pour en créer une, sélectionne d’abord la famille qui la contiendra, puis le menu « … ».'), liste, avis),
    boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Sélectionner', valeur: true, style: 'principal' }],
    auMontage: ({ boutons }) => { boutonOk = boutons.at(-1); rendre(); },
  });
  return r ? { id: choix } : undefined;
}
