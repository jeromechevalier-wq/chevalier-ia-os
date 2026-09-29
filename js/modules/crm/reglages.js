// Réglages du CRM : offres, secteurs, sources, filtres enregistrés, délai de paiement.
import { h, icone, vider, remplir, toast, confirmer, demanderTexte } from '../../os/ui.js';
import * as D from './donnees.js';

function section(id, titre, nomIcone, aide) {
  return h('section', { class: 'carte-section', id },
    h('h2', {}, icone(nomIcone, { taille: 18 }), titre),
    aide ? h('p', { class: 'aide' }, aide) : null);
}

function boutonIcone(nom, libelle, onclick, disabled = false) {
  return h('button', { type: 'button', class: 'bouton-icone', 'aria-label': libelle, title: libelle, disabled, onclick }, icone(nom, { taille: 16 }));
}

function formulaireAjout(placeholder, libelleBouton, surAjout) {
  const champ = h('input', { type: 'text', class: 'champ', placeholder, 'aria-label': placeholder });
  return h('form', { class: 'ligne-ajout', onsubmit: async (e) => {
    e.preventDefault();
    const v = champ.value.trim();
    if (!v) { champ.focus(); return; }
    await surAjout(v);
    champ.value = '';
  } }, champ, h('button', { type: 'submit', class: 'bouton bouton-secondaire' }, icone('plus', { taille: 16 }), libelleBouton));
}

export function rendreReglagesCrm(page) {
  const sOffres = section('reglages-offres', 'Offres', 'briefcase', 'Une offre archivée reste lisible sur les anciennes fiches.');
  const listeOffres = h('div', { class: 'liste-reglages' });
  sOffres.append(listeOffres, formulaireAjout('Nom de la nouvelle offre', 'Ajouter une offre', async (nom) => {
    const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'offre';
    let id = base;
    let n = 2;
    while (D.etat.offres.some((o) => o.id === id)) id = `${base}_${n++}`;
    await D.enregistrerOffres([...D.etat.offres, { id, nom, actif: true }]);
    toast(`Offre "${nom}" ajoutée`);
  }));

  const sSecteurs = section('reglages-secteurs', 'Secteurs', 'users');
  const listeSecteurs = h('div', { class: 'liste-reglages' });
  sSecteurs.append(listeSecteurs, formulaireAjout('Nouveau secteur', 'Ajouter', async (v) => {
    if (D.etat.secteurs.includes(v)) return;
    await D.enregistrerListes({ secteurs: [...D.etat.secteurs, v] });
  }));

  const sSources = section('reglages-sources', 'Sources', 'sparkles');
  const listeSources = h('div', { class: 'liste-reglages' });
  sSources.append(listeSources, formulaireAjout('Nouvelle source', 'Ajouter', async (v) => {
    if (D.etat.sources.includes(v)) return;
    await D.enregistrerListes({ sources: [...D.etat.sources, v] });
  }));

  const sFiltres = section('reglages-filtres', 'Filtres enregistrés', 'bookmark', 'Crée un filtre depuis la Liste ou le Kanban avec "Enregistrer ce filtre".');
  const listeFiltres = h('div', { class: 'liste-reglages' });
  sFiltres.append(listeFiltres);

  const sDelai = section('reglages-delai', 'Délai de paiement', 'clock', 'Utilisé pour la suggestion "Vérifier le paiement" après une facture envoyée.');
  const delai = h('input', { type: 'number', class: 'champ champ-court', min: '1', max: '365', 'aria-label': 'Délai de paiement en jours',
    onchange: async (e) => {
      const v = Math.max(1, Math.min(365, Number(e.target.value) || 30));
      await D.enregistrerReglages({ delaiPaiementJours: v });
      toast('Délai de paiement enregistré');
    } });
  sDelai.append(h('label', { class: 'ligne-champ' }, delai, h('span', {}, 'jours')));

  page.append(sOffres, sSecteurs, sSources, sFiltres, sDelai);

  function ligneOffre(o, i, liste) {
    const nom = h('input', { type: 'text', class: 'champ', value: o.nom, 'aria-label': `Nom de l'offre ${o.nom}`,
      onchange: (e) => {
        const v = e.target.value.trim();
        if (!v) { e.target.value = o.nom; return; }
        D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, nom: v } : x)));
      } });
    const deplacer = (j) => {
      const copie = [...liste];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      D.enregistrerOffres(copie);
    };
    return h('div', { class: `ligne-reglage ${o.actif === false ? 'archivee' : ''}`, dataset: { offre: o.id } },
      nom,
      o.actif === false ? h('span', { class: 'badge' }, 'Archivée') : null,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('arrow-up', 'Monter', () => deplacer(i - 1), i === 0),
        boutonIcone('arrow-down', 'Descendre', () => deplacer(i + 1), i === liste.length - 1),
        o.actif === false
          ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, actif: true } : x))) }, icone('archive-restore', { taille: 14 }), 'Réactiver')
          : h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => D.enregistrerOffres(liste.map((x) => (x.id === o.id ? { ...x, actif: false } : x))) }, icone('archive', { taille: 14 }), 'Archiver')));
  }

  function ligneValeur(cle, valeur, i, liste) {
    const champ = h('input', { type: 'text', class: 'champ', value: valeur, 'aria-label': `Renommer ${valeur}`,
      onchange: (e) => {
        const v = e.target.value.trim();
        if (!v || liste.includes(v)) { e.target.value = valeur; return; }
        D.enregistrerListes({ [cle]: liste.map((x, j) => (j === i ? v : x)) });
      } });
    return h('div', { class: 'ligne-reglage' }, champ,
      h('div', { class: 'groupe-boutons' },
        boutonIcone('trash-2', `Retirer ${valeur}`, async () => {
          if (await confirmer('Retirer de la liste', `"${valeur}" ne sera plus proposé. Les fiches existantes gardent leur valeur.`, { libelleOk: 'Retirer' })) {
            D.enregistrerListes({ [cle]: liste.filter((x) => x !== valeur) });
          }
        })));
  }

  function ligneFiltre(f) {
    return h('div', { class: 'ligne-reglage', dataset: { filtre: f.id } },
      h('span', { class: 'nom-filtre' }, icone('bookmark', { taille: 14 }), f.nom),
      h('div', { class: 'groupe-boutons' },
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'renommer-filtre' }, onclick: async () => {
          const nom = await demanderTexte('Renommer le filtre', { libelle: 'Nom du filtre', valeur: f.nom });
          if (!nom) return;
          await D.enregistrerFiltres(D.etat.filtres.map((x) => (x.id === f.id ? { ...x, nom } : x)));
          toast('Filtre renommé');
        } }, icone('pencil', { taille: 14 }), 'Renommer'),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'supprimer-filtre' }, onclick: async () => {
          if (!(await confirmer('Supprimer le filtre', `Supprimer le filtre "${f.nom}" ?`, { libelleOk: 'Supprimer', danger: true }))) return;
          await D.enregistrerFiltres(D.etat.filtres.filter((x) => x.id !== f.id));
          toast('Filtre supprimé');
        } }, icone('trash-2', { taille: 14 }), 'Supprimer')));
  }

  function rafraichir() {
    if (page.contains(document.activeElement) && document.activeElement.matches('.liste-reglages input')) return;
    remplir(listeOffres, ...D.etat.offres.map((o, i, l) => ligneOffre(o, i, l)));
    remplir(listeSecteurs, ...D.etat.secteurs.map((v, i, l) => ligneValeur('secteurs', v, i, l)));
    remplir(listeSources, ...D.etat.sources.map((v, i, l) => ligneValeur('sources', v, i, l)));
    remplir(listeFiltres, ...D.etat.filtres.map(ligneFiltre));
    if (!D.etat.filtres.length) listeFiltres.append(h('p', { class: 'vide-discret' }, 'Aucun filtre enregistré.'));
    if (document.activeElement !== delai) delai.value = String(D.etat.reglages.delaiPaiementJours ?? 30);
  }
  rafraichir();
  return D.surChangement(rafraichir);
}
