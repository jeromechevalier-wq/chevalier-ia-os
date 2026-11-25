// Module Articles : liste unique, filtres en un clic, analyse de la sélection, envoi des coefficients, convertis du dépôt d'origine SANS changer les cas ni les valeurs.
import { describe, it } from 'node:test'
import { expect } from './fixtures/achats/attendre.js'
import { construireListe, CRITERES_ARTICLES_VIDES, filtrerArticles, libelleEtatFiltre, texteCompteur, } from '../js/modules/achatsarticles/logique.js'
import {
  FILTRES_RAPIDES, analyserSelection, appliquerFiltreRapide, articlesChanges, comptesFiltres, dejaValidesDeReference, filtreRapideActif, lignesDeRegroupement, modifieUnGroupeValide, pastilleLigne, phraseSelection,
  preparerEnvoi, saisiesDeDepart, taillesGroupes, TEXTE_COCHE_UN_AUTRE, TEXTE_DEUX_GROUPES,
} from '../js/modules/achatsarticles/selection.js'

const art = (id, designation, f = 'ALPHA') => ({ id, fournisseur_id: `f-${f}`, reference: null, designation, unite: 'u', fournisseurs: { nom: f } })
const ref = (id, nom) => ({ id, nom, unite_reference: 'sac', actif: true })
const rap = (af, ar, k, valide) => ({ article_fournisseur_id: af, article_reference_id: ar, coefficient: k, valide_le: valide ? '2026-11-20' : null, suggere_par_ia: !valide })

// Groupe VALIDÉ « Ciment » (c1, c2), groupe SUGGÉRÉ « Sable » (s1, s2, s3), groupe VALIDÉ « Colle » (k1, k2), trois libres (l1, l2, l3).
const articles = [art('c1', 'Ciment 25 kg'), art('c2', 'Ciment gris 25kg', 'BETA'), art('s1', 'Sable 0/4'), art('s2', 'Sable lavé', 'BETA'), art('s3', 'Sable fin', 'GAMMA'),
  art('k1', 'Colle carrelage'), art('k2', 'Colle C2', 'BETA'), art('l1', 'Parpaing 20'), art('l2', 'Parpaing 20 cm', 'BETA'), art('l3', 'Gravier', 'GAMMA')]
const refs = [ref('R-ciment', 'Ciment'), ref('R-sable', 'Sable'), ref('R-colle', 'Colle')]
const raps = [rap('c1', 'R-ciment', 1, true), rap('c2', 'R-ciment', 0.8, true), rap('s1', 'R-sable', 1, false), rap('s2', 'R-sable', 1, false), rap('s3', 'R-sable', 1, false),
  rap('k1', 'R-colle', 1, true), rap('k2', 'R-colle', 1, true)]
const liste = construireListe(articles, raps, refs, new Map())
const de = (id) => liste.find((x) => x.article.id === id)

describe('1 : une seule liste plate, pastille de rapprochement, filtres en un clic', () => {
  it('1 : tous les articles sont dans la liste (aucun regroupé en carte), la pastille dit À rapprocher / ✦ À valider · groupe de N / Groupe « nom » · N', () => {
    expect(liste).toHaveLength(10)
    expect(filtrerArticles(liste, CRITERES_ARTICLES_VIDES)).toHaveLength(10)
    const t = taillesGroupes(liste)
    expect(pastilleLigne(de('l1'), t).texte).toBe('À rapprocher')
    expect(pastilleLigne(de('s1'), t).texte).toBe('À valider · groupe de 3')
    expect(pastilleLigne(de('c1'), t).texte).toBe('Groupe « Ciment » · 2')
    expect(pastilleLigne(de('s1'), t).etincelle).toBe(true)
    expect(pastilleLigne(de('c1'), t).etincelle).toBe(false)
    // Un groupe rapproché qui avait été proposé par l'IA : infobulle avec le nom de la personne.
    const ia = construireListe(articles, [{ ...rap('c1', 'R-ciment', 1, true), valide_par: 'Claire', suggere_par_ia: true }, rap('c2', 'R-ciment', 1, true)], refs, new Map())
    expect(pastilleLigne(ia[0], taillesGroupes(ia)).infobulle).toBe('proposé par l’IA, validé par Claire')
    expect(pastilleLigne(ia[1], taillesGroupes(ia)).infobulle).toBeUndefined()
    // Mêmes couleurs que les états existants.
    expect(pastilleLigne(de('s1'), t).badge).toBe('badge-attention')
    expect(pastilleLigne(de('c1'), t).badge).toBe('badge-succes')
  })
  it('1 : filtres « À rapprocher | ✦ Suggestions IA à valider | Rapprochés » (pas de « Tous ») avec leur nombre, activables et désactivables en un clic', () => {
    expect(FILTRES_RAPIDES.map((f) => f.libelle)).toEqual(['À rapprocher', 'Suggestions IA à valider', 'Rapprochés'])
    expect(FILTRES_RAPIDES.map((f) => f.etincelle)).toEqual([false, true, false])
    expect(comptesFiltres(liste)).toEqual({ a_rapprocher: 3, suggere: 3, valide: 4 })
    let c = appliquerFiltreRapide(CRITERES_ARTICLES_VIDES, 'suggere')
    expect(filtreRapideActif(c)).toBe('suggere')
    expect(filtrerArticles(liste, c).map((x) => x.article.id)).toEqual(['s1', 's2', 's3'])
    c = appliquerFiltreRapide(c, 'valide')
    expect(filtrerArticles(liste, c)).toHaveLength(4)
    // Un second clic sur le filtre allumé l'éteint : tous les articles.
    c = appliquerFiltreRapide(c, 'valide')
    expect(filtreRapideActif(c)).toBeNull()
    expect(filtrerArticles(liste, c)).toHaveLength(10)
    // La recherche se combine avec le filtre.
    expect(filtrerArticles(liste, { ...appliquerFiltreRapide(CRITERES_ARTICLES_VIDES, 'a_rapprocher'), recherche: 'gravier' }).map((x) => x.article.id)).toEqual(['l3'])
    // « Refusés » n'est que dans la fenêtre « Filtres » (mot « Rapprochés » à la place de « Validé »).
    expect(libelleEtatFiltre('refusee')).toBe('Refusés')
    expect(libelleEtatFiltre('valide')).toBe('Rapprochés')
    expect(filtreRapideActif({ ...CRITERES_ARTICLES_VIDES, etats: ['valide', 'suggere'] })).toBeNull()
  })
  it('1 : en-tête : les nombres s’additionnent (même comptage que la liste)', () => {
    expect(texteCompteur(liste)).toBe('10 articles · 3 à rapprocher · 3 suggestions IA à valider · 4 rapprochés')
  })
})

describe('3 : la barre d’action : un seul bouton, dont le nom dépend de la sélection', () => {
  it('3 : la phrase dit combien d’articles sont cochés, déjà en groupe et libres', () => {
    expect(analyserSelection(liste, ['c1', 'l1', 'l2']).phrase).toBe('3 articles cochés : 1 déjà en groupe, 2 libres')
    expect(phraseSelection(1, 0)).toBe('1 article coché : 1 libre')
    expect(analyserSelection(liste, []).type).toBe('aucune')
  })
  it('3a : que des articles libres (au moins 2) → « Rapprocher ces N articles », un nouveau groupe', () => {
    const a = analyserSelection(liste, ['l1', 'l2', 'l3'])
    expect(a.type).toBe('rapprocher')
    expect(a.libelle).toBe('Rapprocher ces 3 articles')
    expect(a.groupes).toHaveLength(0)
    const lignes = lignesDeRegroupement(a)
    expect(lignes.map((l) => l.x.article.id)).toEqual(['l1', 'l2', 'l3'])
    // Aucun coefficient deviné : les champs partent vides.
    expect(Object.values(saisiesDeDepart(lignes))).toEqual(['', '', ''])
  })
  it('3b : un groupe + des articles libres → « Ajouter au groupe « nom » » (le duo devient trio) ; les membres gardent leur coefficient', () => {
    const a = analyserSelection(liste, ['c1', 'l1'])
    expect(a.type).toBe('ajouter')
    expect(a.libelle).toBe('Ajouter au groupe « Ciment »')
    expect(a.groupes[0].membres.map((m) => m.article.id)).toEqual(['c1', 'c2'])
    // Seul l'article libre demande un coefficient ; les membres sont montrés sans changement.
    expect(lignesDeRegroupement(a).map((l) => l.x.article.id)).toEqual(['l1'])
    const prep = preparerEnvoi(lignesDeRegroupement(a), { l1: '0,5' }, 'R-ciment')
    expect(prep.aEnvoyer).toEqual([{ id: 'l1', coefficient: 0.5, designation: 'Parpaing 20' }])
    expect(a.groupes[0].valide).toBe(true)
  })
  it('3c : deux groupes cochés (avec ou sans libres) = pas de bouton, un texte d’aide (la fusion est interdite : on dissocie puis on ajoute)', () => {
    for (const ids of [['c1', 'k1'], ['c1', 's1', 'l1']]) {
      const a = analyserSelection(liste, ids)
      expect(a.type).toBe('impossible')
      expect(a.libelle).toBe('')
      expect(a.aide).toBe(TEXTE_DEUX_GROUPES)
    }
    expect(TEXTE_DEUX_GROUPES).toMatch(/décoche ses articles et clique sur « Enregistrer »/)
    expect(TEXTE_DEUX_GROUPES).toMatch(/Ajouter au groupe/)
    expect(TEXTE_DEUX_GROUPES).not.toMatch(/fusion/i)
  })
  it('3c : après la sortie (décocher puis « Enregistrer »), les articles redeviennent « À rapprocher » et se cochent avec l’autre groupe pour « Ajouter au groupe »', () => {
    // La dissociation supprime le rapprochement : c1 et c2 (groupe Ciment) n'ont plus de rapprochement.
    const apres = construireListe(articles, raps.filter((r) => !['c1', 'c2'].includes(r.article_fournisseur_id)), refs, new Map())
    const de2 = (id) => apres.find((x) => x.article.id === id)
    expect(de2('c1').etat).toBe('a_rapprocher')
    expect(pastilleLigne(de2('c1'), taillesGroupes(apres)).texte).toBe('À rapprocher')
    const a = analyserSelection(apres, ['c1', 'c2', 'k1'])
    expect(a.type).toBe('ajouter')
    expect(a.libelle).toBe('Ajouter au groupe « Colle »')
    expect(lignesDeRegroupement(a).map((l) => l.x.article.id)).toEqual(['c1', 'c2'])
  })
  it('3d : sélection impossible (un seul libre, un seul article en groupe, ou deux du même groupe) : pas de bouton, un texte d’aide', () => {
    for (const ids of [['l1'], ['c1'], ['c1', 'c2']]) {
      const a = analyserSelection(liste, ids)
      expect(a.type).toBe('impossible')
      expect(a.libelle).toBe('')
      expect(a.aide.length).toBeGreaterThan(10)
    }
    expect(analyserSelection(liste, ['l1']).aide).toBe(TEXTE_COCHE_UN_AUTRE)
  })
  it('3 : un identifiant coché qui n’est plus dans la liste est ignoré', () => {
    const a = analyserSelection(liste, ['l1', 'disparu'])
    expect(a.coches.map((x) => x.article.id)).toEqual(['l1'])
    expect(a.type).toBe('impossible')
  })
})

describe('5 : un groupe validé ne se modifie qu’après confirmation ; une suggestion reste une suggestion', () => {
  it('5 : ajouter à un groupe validé demande une confirmation ; un groupe seulement suggéré ou un nouveau groupe, non', () => {
    expect(modifieUnGroupeValide(analyserSelection(liste, ['c1', 'l1']))).toBe(true)
    expect(modifieUnGroupeValide(analyserSelection(liste, ['s1', 'l1']))).toBe(false)
    expect(modifieUnGroupeValide(analyserSelection(liste, ['l1', 'l2']))).toBe(false)
  })
  it('5 : un membre suggéré du groupe gardé, qu’on ne touche pas, n’est jamais renvoyé (donc jamais validé à la place de la personne)', () => {
    const a = analyserSelection(liste, ['s1', 'l1'])
    const lignes = lignesDeRegroupement(a)
    const prep = preparerEnvoi(lignes, { l1: '2' }, 'R-sable')
    expect(prep.aEnvoyer.map((l) => l.id)).toEqual(['l1'])
  })
  it('5 : après une panne partielle, les articles déjà écrits ne sont ni renvoyés ni demandés', () => {
    const lignes = lignesDeRegroupement(analyserSelection(liste, ['l1', 'l2', 'l3']))
    const prep = preparerEnvoi(lignes, { l1: '2', l2: '3', l3: '1' }, 'R-nouveau', ['l1'])
    expect(prep.aEnvoyer.map((l) => l.id)).toEqual(['l2', 'l3'])
    expect(preparerEnvoi(lignes, { l1: '', l2: '3', l3: '1' }, 'R-nouveau', ['l1']).erreurs.l1).toBeUndefined()
  })
  it('5 : si quelqu’un a changé un article entre-temps, on le repère (rien ne doit être écrit)', () => {
    const vus = [de('l1'), de('c1')]
    expect(articlesChanges(vus, vus)).toEqual([])
    const apres = construireListe(articles, [...raps, rap('l1', 'R-colle', 1, true)], refs, new Map())
    expect(articlesChanges(vus, apres).map((x) => x.article.id)).toEqual(['l1'])
    // Un article déjà enregistré par cette fenêtre n'est plus comparé.
    expect(articlesChanges(vus, apres, ['l1'])).toEqual([])
  })
})

describe('« Valider le groupe » montre aussi les articles déjà validés de la référence', () => {
  // Groupe « Béton » : b1 déjà validé, b2 suggéré par l'IA → « À valider · groupe de 2 ».
  const arts = [art('b1', 'Béton cellulaire 60x25x20'), art('b2', 'Chausson béton cellulaire 60x25x20', 'BETA')]
  const l2 = construireListe(arts, [rap('b1', 'R-beton', 1, true), rap('b2', 'R-beton', 1, false)], [ref('R-beton', 'Béton cellulaire')], new Map())
  it('un groupe de 2 = 2 articles visibles : le suggéré à valider + le validé en lecture seule ; le « groupe de N » compte validés + suggérés', () => {
    expect(pastilleLigne(l2[1], taillesGroupes(l2)).texte).toBe('À valider · groupe de 2')
    expect(dejaValidesDeReference(l2, 'R-beton', ['b2']).map((x) => x.article.id)).toEqual(['b1'])
    // Les articles de la fenêtre ne sont pas comptés deux fois ; une autre référence n'est pas mélangée.
    expect(dejaValidesDeReference(l2, 'R-beton', ['b1', 'b2'])).toEqual([])
    expect(dejaValidesDeReference(l2, 'autre', ['b2'])).toEqual([])
  })
})
