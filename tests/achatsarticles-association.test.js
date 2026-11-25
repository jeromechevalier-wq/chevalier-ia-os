// Module Articles : logique de la fenêtre « Association », convertie du dépôt d'origine SANS changer les cas ni les valeurs.
import { describe, it } from 'node:test'
import { expect } from './fixtures/achats/attendre.js'
import { TEXTE_NOM_DEJA_PRIS, construireListe, } from '../js/modules/achatsarticles/logique.js'
import {
  estLienValide, etatAssociation, MESSAGE_ASSOCIATION_ENREGISTREE, messageAnnulationPartielle, messageFinal, messageSortieInterrompue, nomPropose, planEnregistrement, renommerSiBesoin, TEXTE_COCHE_DEUX, TEXTE_CORRECTION_PRIX_PLURIEL, vocabulaireAssociation, saisiesDepart, texteConfirmationEnregistrement,
  TEXTE_ASSOCIATION_DEFAITE, TEXTE_ASSOCIATION_DEFAITE_AVEC_SUGGESTIONS, resumeDejaFait, uniteDeCreation, villesParArticle,
} from '../js/modules/achatsarticles/association.js'

const art = (id, designation, f = 'ALPHA', unite = 'sac') => ({ id, fournisseur_id: `f-${f}`, reference: `R-${id}`, designation, unite, fournisseurs: { nom: f } })
const ref = (id, nom) => ({ id, nom, unite_reference: 'sac', actif: true })
const rap = (af, ar, k, valide) => ({ article_fournisseur_id: af, article_reference_id: ar, coefficient: k, valide_le: valide ? '2026-11-20' : null, suggere_par_ia: !valide })

// Association de 3 suggérée (s1 s2 s3), association de 2 validée (v1 v2), association mixte (m1 validé, m2 suggéré), deux libres (l1 l2).
const articles = [art('w1', 'Mur 1'), art('w2', 'Mur 2', 'BETA'), art('w3', 'Mur 3', 'GAMMA'), art('o1', 'Seul validé'), art('s1', 'Sable 0/4'), art('s2', 'Sable lavé', 'BETA'), art('s3', 'Sable fin', 'GAMMA'), art('v1', 'Colle carrelage'), art('v2', 'Colle C2', 'BETA'),
  art('m1', 'Fer HA10'), art('m2', 'Fer HA 10 barre', 'BETA'), art('l1', 'Parpaing 20', 'ALPHA', 'u'), art('l2', 'Parpaing 20 cm', 'BETA', 'u')]
const refs = [ref('R-mur', 'Mur'), ref('R-seul', 'Seul'), ref('R-sable', 'Sable'), ref('R-colle', 'Colle'), ref('R-fer', 'Fer')]
const raps = [rap('w1', 'R-mur', 1, true), rap('w2', 'R-mur', 1, true), rap('w3', 'R-mur', 1, true), rap('o1', 'R-seul', 1, true), rap('s1', 'R-sable', 1, false), rap('s2', 'R-sable', 2, false), rap('s3', 'R-sable', 1, false), rap('v1', 'R-colle', 1, true), rap('v2', 'R-colle', 0.5, true), rap('m1', 'R-fer', 1, true), rap('m2', 'R-fer', 1, false)]
const liste = construireListe(articles, raps, refs, new Map())
const de = (...ids) => ids.map((id) => liste.find((x) => x.article.id === id))
const decoche = (s, ...ids) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, { ...s[id], coche: false }])) })

describe('A1 : ouverture, tout est coché, rien à sortir', () => {
  it('A1 : toutes les cases sont cochées au départ, rien n’est décoché, le message est vide, aucun article ne sort et « Enregistrer » est possible', () => {
    const xs = de('s1', 's2', 's3')
    const e = etatAssociation(xs, saisiesDepart(xs))
    expect(e.nbCoches).toBe(3)
    expect(e.decochees).toEqual([])
    expect(e.message).toBe('')
    expect(e.sortants).toEqual([])
    expect(e.enregistrerPossible).toBe(true)
  })
  it('A1 : les coefficients de départ sont ceux des liens ; un article libre est vide (on ne devine jamais)', () => {
    expect(saisiesDepart(de('s2', 'l1'))).toEqual({ s2: { coche: true, coefficient: '2' }, l1: { coche: true, coefficient: '' } })
  })
})

describe('A2 : décocher un article lié = une sortie, faite par « Enregistrer »', () => {
  it('A2 : dès qu’un article lié est décoché, « Enregistrer » est actif (il fait aussi la sortie) : un article sort', () => {
    const xs = de('s1', 's2', 's3')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 's3'))
    expect(e.sortants).toHaveLength(1)
    expect(e.enregistrerPossible).toBe(true)
  })
  it('A2 : un article LIBRE décoché n’est simplement pas ajouté : aucune sortie, « Enregistrer » reste possible', () => {
    const xs = de('v1', 'v2', 'l1')
    const s = decoche({ ...saisiesDepart(xs), l1: { coche: true, coefficient: '1' } }, 'l1')
    const e2 = etatAssociation(xs, s)
    expect(e2.sortants).toEqual([])
    expect(e2.enregistrerPossible).toBe(true)
  })
})

describe('A3 : association de 3, décocher un article', () => {
  it('A3 : il sort et il en reste 2 ; seul cet article est refusé (suggestion) ; le message le dit', () => {
    const xs = de('s1', 's2', 's3')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 's2'))
    expect(e.defaite).toBe(false)
    expect(e.sortants.map((s) => [s.x.article.id, s.action])).toEqual([['s2', 'refuser']])
    expect(e.message).toContain('Les articles décochés sortent de l’association. Il reste 2 articles.')
    expect(e.message).toContain('suggestions de l’IA')
  })
  it('A3 : un lien VALIDÉ qui sort est dissocié (association validée de 3, le message ne parle pas de suggestion)', () => {
    const xs = de('w1', 'w2', 'w3')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 'w2'))
    expect(e.sortants.map((s) => [s.x.article.id, s.action])).toEqual([['w2', 'dissocier']])
    expect(e.message).toBe('Les articles décochés sortent de l’association. Il reste 2 articles.')
  })
  it('A3 : on compte les articles DÉJÀ LIÉS qui restent, pas les libres : association validée de 2 + 1 libre coché, décocher un validé = association DÉFAITE (les deux sortent)', () => {
    const xs = [...de('v1', 'v2'), ...de('l1')]
    const base = { ...saisiesDepart(xs), l1: { coche: true, coefficient: '1' } }
    const e = etatAssociation(xs, decoche(base, 'v1'))
    expect(e.defaite).toBe(true)
    expect(e.message).toBe(TEXTE_ASSOCIATION_DEFAITE)
    expect(e.message).not.toMatch(/Il reste/)
    expect(e.sortants.map((s) => s.x.article.id).sort()).toEqual(['v1', 'v2'])
  })
  it('A3 : association validée de 3 + 1 libre, décocher un validé : il reste 2 liés, un seul sort ; le libre compte dans « Il reste 3 articles »', () => {
    const xs = [...de('w1', 'w2', 'w3'), ...de('l1')]
    const e = etatAssociation(xs, decoche({ ...saisiesDepart(xs), l1: { coche: true, coefficient: '1' } }, 'w3'))
    expect(e.defaite).toBe(false)
    expect(e.sortants.map((s) => s.x.article.id)).toEqual(['w3'])
    expect(e.message).toContain('Il reste 3 articles.')
  })
})

describe('A4 : association de 2, décocher un article', () => {
  it('A4 : l’association est défaite : les deux sortent (un seul bout ne reste jamais) ; le message le dit', () => {
    const xs = de('v1', 'v2')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 'v1'))
    expect(e.defaite).toBe(true)
    expect(e.message).toBe(TEXTE_ASSOCIATION_DEFAITE)
    expect(e.message).toBe('Il ne resterait qu’un article : l’association sera défaite, les articles redeviennent libres. Rien d’autre n’est enregistré.')
    expect(e.sortants.map((s) => s.x.article.id).sort()).toEqual(['v1', 'v2'])
    expect(e.sortants.every((s) => s.action === 'dissocier')).toBe(true)
  })
  it('A4 : décocher les deux = même résultat ; confirmation écrite au pluriel', () => {
    const xs = de('v1', 'v2')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 'v1', 'v2'))
    expect(e.defaite).toBe(true)
    expect(e.sortants).toHaveLength(2)
    expect(texteConfirmationEnregistrement(e.sortants, e.defaite)).toBe('L’association sera défaite : 2 articles redeviennent libres. Le bandeau « Annuler » remet les articles sortis.')
  })
})

describe('A5 : « Enregistrer » grisé avec moins de 2 articles cochés', () => {
  it('A5 : deux articles libres cochés = possible ; un seul coché = grisé ; coefficient vide ou faux = grisé', () => {
    const xs = de('l1', 'l2')
    const s = { l1: { coche: true, coefficient: '1' }, l2: { coche: true, coefficient: '1' } }
    expect(etatAssociation(xs, s).enregistrerPossible).toBe(true)
    expect(etatAssociation(xs, decoche(s, 'l2')).enregistrerPossible).toBe(false)
    expect(etatAssociation(xs, { ...s, l2: { coche: true, coefficient: '' } }).enregistrerPossible).toBe(false)
    const faux = etatAssociation(xs, { ...s, l2: { coche: true, coefficient: '-3' } })
    expect(faux.enregistrerPossible).toBe(false)
    expect(faux.erreurs.l2).toMatch(/plus grand que zéro/)
  })
  it('A5 : à la création le coefficient des articles libres est VIDE : « Enregistrer » est grisé tant qu’il n’est pas saisi', () => {
    const xs = de('l1', 'l2')
    expect(etatAssociation(xs, saisiesDepart(xs)).enregistrerPossible).toBe(false)
  })
})

describe('A6 : nom pris et nom proposé', () => {
  it('A6 : le nom proposé à la création est la désignation du premier article ; l’unité est celle du premier (commune ou à saisir)', () => {
    expect(nomPropose(de('l1', 'l2'))).toBe('Parpaing 20')
    expect(uniteDeCreation(de('l1', 'l2'))).toEqual({ unite: 'u', commune: true })
    expect(uniteDeCreation([...de('l1'), ...de('s1')]).commune).toBe(false)
  })
})

describe('A7 : association qui mélange liens validés et suggestions de l’IA', () => {
  it('A7 : tout est coché à l’ouverture ; « Enregistrer » écrit la suggestion cochée (validée par la personne) et ne renvoie pas le lien déjà validé et inchangé', () => {
    const xs = de('m1', 'm2')
    expect(estLienValide(xs[0])).toBe(true)
    expect(estLienValide(xs[1])).toBe(false)
    const e = etatAssociation(xs, saisiesDepart(xs))
    expect(e.nbCoches).toBe(2)
    expect(e.aEnvoyer.map((l) => l.id)).toEqual(['m2'])
    expect(e.coefficientsChanges).toEqual([])
    expect(e.enregistrerPossible).toBe(true)
  })
  it('A7 : un coefficient changé sur un lien VALIDÉ demande confirmation et est renvoyé ; un article déjà écrit n’est jamais renvoyé', () => {
    const xs = de('m1', 'm2')
    const s = { ...saisiesDepart(xs), m1: { coche: true, coefficient: '2' } }
    const e = etatAssociation(xs, s)
    expect(e.coefficientsChanges.map((x) => x.article.id)).toEqual(['m1'])
    expect(e.aEnvoyer.map((l) => l.id).sort()).toEqual(['m1', 'm2'])
    expect(etatAssociation(xs, s, ['m2']).aEnvoyer.map((l) => l.id)).toEqual(['m1'])
  })
  it('A7 : décocher une suggestion = « refuser » (réversible), décocher un lien validé = « dissocier »', () => {
    // Association de 2 (m1 validé, m2 suggéré) : décocher l'un défait tout, chaque lien reçoit SON action.
    const xs = de('m1', 'm2')
    expect(etatAssociation(xs, decoche(saisiesDepart(xs), 'm2')).sortants.map((s) => [s.x.article.id, s.action])).toEqual([['m1', 'dissocier'], ['m2', 'refuser']])
    // Association de 3 suggérée : décocher un = refuser.
    const ys = de('s1', 's2', 's3')
    expect(etatAssociation(ys, decoche(saisiesDepart(ys), 's1')).sortants.map((s) => s.action)).toEqual(['refuser'])
  })
})

describe('villes et prix, messages', () => {
  it('villes : le nom de l’agence s’il existe, sinon la ville ; valeurs distinctes ; lignes vides ignorées', () => {
    const v = villesParArticle([
      { article_fournisseur_id: 'a', nom_agence: null, ville: 'Manosque' }, { article_fournisseur_id: 'a', nom_agence: null, ville: 'manosque' },
      { article_fournisseur_id: 'a', nom_agence: 'Agence Nord', ville: 'Digne' }, { article_fournisseur_id: 'b', nom_agence: ' ', ville: null }, { article_fournisseur_id: null, nom_agence: 'X', ville: 'Y' },
])
    expect(v).toEqual({ a: ['Agence Nord', 'Manosque'] })
  })
  it('messages : enregistrée, sortie interrompue (ce qui est fait est dit)', () => {
    expect(MESSAGE_ASSOCIATION_ENREGISTREE).toBe('Association enregistrée.')
    expect(messageSortieInterrompue(1, 3, 'Sable', 'Connexion impossible, réessaie.')).toBe('1 article sur 3 est sorti de l’association. « Sable » n’a pas pu sortir (Connexion impossible, réessaie). Regarde la liste à jour : un article peut être resté seul dans l’association, puis réessaie.')
    expect(messageAnnulationPartielle(1, 2, 'Panne.')).toBe('1 article est revenu sur 2, les autres non (Panne). Regarde la liste à jour : un article peut être resté seul.')
    expect(messageSortieInterrompue(0, 2, 'Sable', 'Panne.')).toMatch(/^Rien n’a été fait\./)
  })
})

describe('A2b : association à un seul article lié (décision prise seul : renommer et corriger restent possibles)', () => {
  it('A2b : une ligne, une case cochée : « Enregistrer » possible ; le coefficient changé est envoyé et demande confirmation ; rien ne se valide d’autre', () => {
    const xs = de('o1')
    const e = etatAssociation(xs, saisiesDepart(xs))
    expect(e.enregistrerPossible).toBe(true)
    expect(e.aEnvoyer).toEqual([])
    const e2 = etatAssociation(xs, { o1: { coche: true, coefficient: '2' } })
    expect(e2.enregistrerPossible).toBe(true)
    expect(e2.aEnvoyer.map((l) => l.id)).toEqual(['o1'])
    expect(e2.coefficientsChanges).toHaveLength(1)
  })
  it('A2b : dans tous les autres cas la règle « 2 cochés au moins » reste (deux lignes libres dont une décochée : pas assez d’articles pour une association)', () => {
    const xs = de('l1', 'l2')
    expect(etatAssociation(xs, decoche({ l1: { coche: true, coefficient: '1' }, l2: { coche: true, coefficient: '1' } }, 'l2')).enregistrerPossible).toBe(false)
  })
  it('A5b : moins de 2 cochés en création : un message général dit pourquoi', () => {
    const xs = de('l1', 'l2')
    const e = etatAssociation(xs, decoche({ l1: { coche: true, coefficient: '1' }, l2: { coche: true, coefficient: '1' } }, 'l2'))
    expect(e.aide).toBe(TEXTE_COCHE_DEUX)
    expect(e.enregistrerPossible).toBe(false)
  })
})

describe('A3b : après une panne en route, l’action suit l’état RELU et les articles déjà écrits', () => {
  it('A3b : une suggestion validée pendant la session (dans `faits`) est dissociée, jamais refusée', () => {
    const xs = de('s1', 's2')
    const s = decoche(saisiesDepart(xs), 's2')
    expect(etatAssociation(xs, s).sortants.map((x) => x.action)).toEqual(['refuser', 'refuser'])
    expect(etatAssociation(xs, s, ['s1']).sortants.map((x) => [x.x.article.id, x.action])).toEqual([['s1', 'dissocier'], ['s2', 'refuser']])
  })
  it('A3b : l’état relu fait foi (la suggestion est devenue un lien validé en base)', () => {
    const xs = de('s1', 's2')
    const relus = construireListe(articles, raps.map((r) => (r.article_fournisseur_id === 's1' ? { ...r, valide_le: '2026-11-24' } : r)), refs, new Map()).filter((x) => ['s1', 's2'].includes(x.article.id))
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 's2'), [], relus)
    expect(e.sortants.map((x) => [x.x.article.id, x.action])).toEqual([['s1', 'dissocier'], ['s2', 'refuser']])
  })
  it('A3b : création, 1 article écrit et 1 en échec, le restant décoché : une sortie existe (« Enregistrer » fait sortir l’article déjà écrit), le bouton n’est pas grisé', () => {
    const xs = de('l1', 'l2')
    const s = decoche({ l1: { coche: true, coefficient: '1' }, l2: { coche: true, coefficient: '1' } }, 'l2')
    const e = etatAssociation(xs, s, ['l1'])
    expect(e.enregistrerPossible).toBe(true)
    expect(e.defaite).toBe(true)
    expect(e.sortants.map((x) => [x.x.article.id, x.action])).toEqual([['l1', 'dissocier']])
  })
  it('A3b : création, 1 article écrit, 1 en échec, tout coché : « Enregistrer » réessaie seulement le restant', () => {
    const xs = de('l1', 'l2')
    const e = etatAssociation(xs, { l1: { coche: true, coefficient: '1' }, l2: { coche: true, coefficient: '1' } }, ['l1'])
    expect(e.enregistrerPossible).toBe(true)
    expect(e.aEnvoyer.map((l) => l.id)).toEqual(['l2'])
  })
})

describe('A6 : nom pris (logique exécutée)', () => {
  const pris = Object.assign(new Error('Ce nom existe déjà. Choisis un autre nom.'), { code: 'nom_deja_pris' })
  it('A6 : le serveur refuse le renommage : résultat « nom_pris », le message est « Ce nom existe déjà. Choisis un autre nom. »', async () => {
    const appels = []
    const r = await renommerSiBesoin(async (id, nom) => { appels.push(`${id}:${nom}`); throw pris }, 'R1', '  Sable  fin ', 'Sable')
    expect(r).toBe('nom_pris')
    expect(appels).toEqual(['R1:Sable fin'])
    expect(TEXTE_NOM_DEJA_PRIS).toBe('Ce nom existe déjà. Choisis un autre nom.')
  })
  it('A6 : nom inchangé = aucun appel ; renommage réussi = « renomme » ; une autre erreur remonte', async () => {
    let n = 0
    expect(await renommerSiBesoin(async () => { n++ }, 'R1', ' Sable ', 'Sable')).toBe('inchange')
    expect(n).toBe(0)
    expect(await renommerSiBesoin(async () => { n++ }, 'R1', 'Sable fin', 'Sable')).toBe('renomme')
    expect(n).toBe(1)
    await expect(renommerSiBesoin(async () => { throw new Error('Panne') }, 'R1', 'Autre', 'Sable')).rejects.toThrow('Panne')
  })
})

describe('textes de la fenêtre : vocabulaire, confirmation, message final', () => {
  it('A9 : « article de référence » devient « article interne » ; la confirmation du coefficient est au pluriel pour plusieurs articles', () => {
    expect(vocabulaireAssociation('Écris un nom pour l’article de référence.')).toBe('Écris un nom pour l’article interne.')
    expect(vocabulaireAssociation(null)).toBeNull()
    expect(TEXTE_CORRECTION_PRIX_PLURIEL).toMatch(/ces articles/)
    const xs = de('w1', 'w2')
    expect(etatAssociation(xs, { w1: { coche: true, coefficient: '2' }, w2: { coche: true, coefficient: '3' } }).coefficientsChanges).toHaveLength(2)
  })
  it('message final : le renommage réussi reste mentionné, même après un second essai', () => {
    expect(messageFinal(false, 'X', 2)).toBe('Association enregistrée.')
    expect(messageFinal(true, 'Sable fin', 0)).toBe('Renommé en « Sable fin ».')
    expect(messageFinal(true, 'Sable fin', 1)).toBe('Renommé en « Sable fin ». Association enregistrée.')
  })
})

describe('P : plan d’écriture de « Enregistrer » (ordre unique : renommer, valider, sortir)', () => {
  const ids = (l) => l.map((x) => x.id)
  const sorts = (p) => p.sortir.map((x) => [x.x.article.id, x.action])
  it('P1 : 3 validés, décocher 1 : seul cet article sort (dissocié), les 2 autres restent, rien à valider', () => {
    const xs = de('w1', 'w2', 'w3')
    const p = planEnregistrement(xs, decoche(saisiesDepart(xs), 'w3'), [], xs, false)
    expect(p.defaite).toBe(false)
    expect(p.etapes).toEqual(['sortir'])
    expect(sorts(p)).toEqual([['w3', 'dissocier']])
    expect(p.valider).toEqual([])
  })
  it('P2 : 2 validés, décocher 1 : association défaite, sortie des 2 sans aucune validation, même avec un coefficient changé et un renommage', () => {
    const xs = de('v1', 'v2')
    const s = { ...decoche(saisiesDepart(xs), 'v1'), v2: { coche: true, coefficient: '3' } }
    const p = planEnregistrement(xs, s, [], xs, true)
    expect(p.defaite).toBe(true)
    expect(p.etapes).toEqual(['sortir'])
    expect(p.valider).toEqual([])
    expect(sorts(p)).toEqual([['v1', 'dissocier'], ['v2', 'dissocier']])
  })
  it('P3 : 2 validés + 1 libre coché, décocher un validé : défaite, le libre n’est pas ajouté', () => {
    const xs = [...de('v1', 'v2'), ...de('l1')]
    const s = decoche({ ...saisiesDepart(xs), l1: { coche: true, coefficient: '1' } }, 'v1')
    const p = planEnregistrement(xs, s, [], xs, false)
    expect(p.defaite).toBe(true)
    expect(p.valider).toEqual([])
    expect(sorts(p).map((x) => x[0]).sort()).toEqual(['v1', 'v2'])
    expect(etatAssociation(xs, s).enregistrerPossible).toBe(true)
  })
  it('P4 : renommage + sortie : l’ordre est renommer puis sortir', () => {
    const xs = de('w1', 'w2', 'w3')
    const p = planEnregistrement(xs, decoche(saisiesDepart(xs), 'w3'), [], xs, true)
    expect(p.etapes).toEqual(['renommer', 'sortir'])
  })
  it('P5 : suggestion décochée dans une association de 3 : elle est refusée (réversible)', () => {
    const xs = de('s1', 's2', 's3')
    const p = planEnregistrement(xs, decoche(saisiesDepart(xs), 's2'), [], xs, false)
    expect(sorts(p)).toEqual([['s2', 'refuser']])
    expect(texteConfirmationEnregistrement(p.sortir, p.defaite)).toBe('1 suggestion de l’IA décochée est refusée. Le bandeau « Annuler » remet les articles sortis.')
  })
  it('P6 : suggestion cochée + validé décoché dans une association de 3 : valider d’abord, sortir en dernier', () => {
    // m2 est une suggestion (liée à Fer) : on la regroupe ici avec deux validés pour avoir 3 membres.
    const ys = construireListe(articles, [rap('w1', 'R-mur', 1, true), rap('w2', 'R-mur', 1, true), rap('m2', 'R-mur', 1, false)], refs, new Map())
    const zs = ['w1', 'w2', 'm2'].map((id) => ys.find((x) => x.article.id === id))
    const p = planEnregistrement(zs, decoche(saisiesDepart(zs), 'w1'), [], zs, false)
    expect(zs).toHaveLength(3)
    expect(p.defaite).toBe(false)
    expect(p.etapes).toEqual(['valider', 'sortir'])
    expect(ids(p.valider)).toEqual(['m2'])
    expect(sorts(p)).toEqual([['w1', 'dissocier']])
    expect(texteConfirmationEnregistrement(p.sortir, p.defaite, p.valider.filter((v) => v.suggestion).length)).toBe('1 article sort de l’association. 1 suggestion cochée est validée. Le bandeau « Annuler » remet les articles sortis.')
  })
  it('P7 : après une panne, `dejaFaits` n’est jamais renvoyé et l’action suit l’état relu (suggestion déjà validée = dissociée)', () => {
    const xs = de('s1', 's2', 's3')
    const s = decoche(saisiesDepart(xs), 's3')
    const p = planEnregistrement(xs, s, ['s1'], xs, false)
    expect(ids(p.valider)).toEqual(['s2'])
    expect(sorts(p)).toEqual([['s3', 'refuser']])
    const relus = construireListe(articles, raps.map((r) => (r.article_fournisseur_id === 's3' ? { ...r, valide_le: '2026-11-24' } : r)), refs, new Map()).filter((x) => ['s1', 's2', 's3'].includes(x.article.id))
    expect(sorts(planEnregistrement(xs, s, ['s1'], relus, false))).toEqual([['s3', 'dissocier']])
  })
  it('P8 : rien à faire = plan vide ; coefficient vide invalide = « Enregistrer » grisé', () => {
    const xs = de('w1', 'w2', 'w3')
    expect(planEnregistrement(xs, saisiesDepart(xs), [], xs, false).etapes).toEqual([])
    const l = de('l1', 'l2')
    const e = etatAssociation(l, saisiesDepart(l))
    expect(e.erreurs.l1).toBeTruthy()
    expect(e.enregistrerPossible).toBe(false)
  })
  it('P9 : textes de confirmation courts : plusieurs sorties, mélange refus et dissociation', () => {
    const xs = de('m1', 'm2')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 'm2'))
    expect(texteConfirmationEnregistrement(e.sortants, e.defaite)).toBe('L’association sera défaite : 1 article redevient libre, 1 suggestion de l’IA est refusée. Le bandeau « Annuler » remet les articles sortis.')
    const w = de('w1', 'w2', 'w3', 'o1')
    const e2 = etatAssociation(w, decoche(saisiesDepart(w), 'w2', 'w3'))
    expect(e2.defaite).toBe(false)
    expect(texteConfirmationEnregistrement(e2.sortants, e2.defaite)).toBe('2 articles sortent de l’association. Le bandeau « Annuler » remet les articles sortis.')
  })
})

describe('R : corrections de la relecture (textes exécutés)', () => {
  it('R1 : sortie échouée après renommage et validations : le message dit ce qui est fait, jamais « Rien n’a été fait »', () => {
    const fait = resumeDejaFait(true, 2, 'Sable')
    expect(fait).toMatch(/Sable/)
    expect(fait).toContain('2 articles sont validés.')
    expect(resumeDejaFait(false, 1, 'x')).toBe('1 article est validé.')
    expect(resumeDejaFait(false, 0, 'x')).toBe('')
    const m = messageSortieInterrompue(0, 2, 'Sable', 'Panne.', fait)
    expect(m).not.toMatch(/Rien n’a été fait/)
    expect(m).toContain('Aucun article n’est sorti de l’association.')
    expect(m).toContain('« Sable » n’a pas pu sortir (Panne).')
    expect(messageSortieInterrompue(1, 2, 'Sable', 'Panne.', fait)).toContain('1 article sur 2 est sorti')
    expect(messageSortieInterrompue(0, 2, 'Sable', 'Panne.')).toMatch(/^Rien n’a été fait\./)
  })
  it('R2 : défaite avec suggestions : validés « redeviennent libres », suggestions « sont refusées » (jamais libres), pluriels corrects', () => {
    const xs = de('m1', 'm2')
    const e = etatAssociation(xs, decoche(saisiesDepart(xs), 'm2'))
    expect(e.message).toBe(TEXTE_ASSOCIATION_DEFAITE_AVEC_SUGGESTIONS)
    expect(e.message).not.toMatch(/Il reste/)
    const ys = de('s1', 's2')
    const e2 = etatAssociation(ys, decoche(saisiesDepart(ys), 's1'))
    expect(texteConfirmationEnregistrement(e2.sortants, e2.defaite)).toMatch(/^L’association sera défaite : 2 suggestions de l’IA sont refusées\./)
    expect(texteConfirmationEnregistrement(e2.sortants, e2.defaite)).not.toMatch(/libre/)
    const vs = de('v1', 'v2')
    const e3 = etatAssociation(vs, decoche(saisiesDepart(vs), 'v1'))
    expect(e3.message).toBe(TEXTE_ASSOCIATION_DEFAITE)
    expect(texteConfirmationEnregistrement(e3.sortants, e3.defaite)).toMatch(/^L’association sera défaite : 2 articles redeviennent libres\./)
  })
  it('R5 : la confirmation dit les suggestions cochées validées du même clic (singulier et pluriel) et rappelle « Annuler »', () => {
    const xs = de('w1', 'w2', 'w3')
    const sortants = etatAssociation(xs, decoche(saisiesDepart(xs), 'w3')).sortants
    expect(texteConfirmationEnregistrement(sortants, false, 1)).toBe('1 article sort de l’association. 1 suggestion cochée est validée. Le bandeau « Annuler » remet les articles sortis.')
    expect(texteConfirmationEnregistrement(sortants, false, 3)).toContain('3 suggestions cochées sont validées.')
    // Le plan sait quelles lignes envoyées sont des suggestions (et aucune quand l'association est défaite).
    const ys = de('s1', 's2', 's3')
    expect(planEnregistrement(ys, saisiesDepart(ys), [], ys, false).valider.every((v) => v.suggestion)).toBe(true)
    const vs = de('v1', 'v2')
    expect(planEnregistrement(vs, decoche(saisiesDepart(vs), 'v1'), [], vs, false).valider).toEqual([])
  })
  it('R7 : un coefficient vidé sur un article lié donne une erreur (affichée sous la ligne) et grise « Enregistrer »', () => {
    const xs = de('w1', 'w2', 'w3')
    const e = etatAssociation(xs, { ...saisiesDepart(xs), w1: { coche: true, coefficient: '' } })
    expect(e.erreurs.w1).toMatch(/Indique le coefficient/)
    expect(e.enregistrerPossible).toBe(false)
  })
})
