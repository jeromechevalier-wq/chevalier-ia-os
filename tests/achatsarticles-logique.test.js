// Module Articles : logique des rapprochements (états, prix, coefficient, filtres, tri, messages), convertie du dépôt d'origine SANS changer les cas ni les valeurs (filet du portage).
// Seules différences : imports vers le module, ErreurAction (js/os/actions-metier.js) à la place de l'ancienne erreur, et le test « lecture par tranches », remplacé par achatsarticles-donnees.test.js.
import { describe, it } from 'node:test'
import { expect, vi } from './fixtures/achats/attendre.js'
import {
  avertissementAvantValidation, AVERTISSEMENT_CORRECTION, coefficientDepuisAide, coefficientFr, construireListe, corpsCreationReference, corpsRefus, corpsValidation,
  CRITERES_ARTICLES_VIDES, etatArticle, filtrerArticles, fournisseursDe, lireNombre, messageErreur, MESSAGE_GENERIQUE, pastillesArticles, peutRefuser,
  grouperSuggestions, phraseApercu, phraseErreurSuggestions, phraseSuggestions, resultatClic, prixRamene, retirerPastille, statistiquesLignes, TEXTE_ERREUR_LECTURE, TEXTE_VIDE, trierArticles,
  verifierCoefficient, verifierNouvelleReference, normaliserUnite, arrondirCoefficient,
  corpsReprise, corpsDissociation, TEXTE_CONFIRMATION_DISSOCIATION, TEXTE_DISSOCIE_ANNULABLE, messageDissociationImpossible, messageAnnulationDissociationImpossible, lectureDeSecours, TEXTE_REFUSEES_INDISPONIBLES, CODES_A_RELIRE, DUREE_ANNULATION_MS, ETATS, libelleEtat, peutReprendre, texteAucunResultat, TEXTE_AUCUNE_REFUSEE, texteCompteur, TEXTE_REFUS_ANNULABLE, texteSuggestionRefusee,
} from '../js/modules/achatsarticles/logique.js'
import { ErreurAction as ErreurDecision, messageServeur } from '../js/os/actions-metier.js'
import { euros } from '../js/modules/achatsarticles/formats.js'


const sansEspaces = (s) => s.replace(/[\s  ]/g, ' ')
const art = (id, designation, fournisseur, o = {}) =>
  ({ id, fournisseur_id: 'f-' + (fournisseur ?? 'x'), reference: null, designation, unite: 'sac', fournisseurs: fournisseur ? { nom: fournisseur } : null, ...o })
const REF_CIMENT = { id: 'r1', nom: 'Sac de ciment 25 kg', unite_reference: 'sac', actif: true }
const REF_VIS = { id: 'r2', nom: 'Vis à bois 5x50', unite_reference: 'u', actif: true }
const REF_SABLE_INACTIVE = { id: 'r3', nom: 'Sable 0/4', unite_reference: 't', actif: false }
const rap = (af, ar, coefficient, valide, ia = true) =>
  ({ article_fournisseur_id: af, article_reference_id: ar, coefficient, valide_le: valide ? '2026-11-23T10:00:00Z' : null, valide_par: valide ? 'd@x.fr' : null, suggere_par_ia: ia })
const ligne = (id, af, quantite, montant, o = {}) =>
  ({ id, article_fournisseur_id: af, quantite, montant_ht: montant, factures: { statut: 'acceptee', type_document: 'facture', date_facture: '2026-11-01', created_at: '2026-11-01T08:00:00Z', ...o } })

describe('critère 1 : état d’un article', () => {
  it('1 : validé > suggéré > à rapprocher ; un validé issu d’une suggestion reste « Validé »', () => {
    expect(etatArticle(null)).toBe('a_rapprocher')
    expect(etatArticle(undefined)).toBe('a_rapprocher')
    expect(etatArticle(rap('a', 'r1', 1, false))).toBe('suggere')
    expect(etatArticle(rap('a', 'r1', 1, true, false))).toBe('valide')
    expect(etatArticle(rap('a', 'r1', 1, true, true))).toBe('valide') // suggere_par_ia gardé après validation
    const l = construireListe([art('a1', 'Ciment', 'ALPHA'), art('a2', 'Vis boîte de 200', 'ALPHA', { unite: 'boîte' }), art('a3', 'Sable', null)], [rap('a1', 'r1', 0.714286, true), rap('a2', 'r2', 0.005, false), rap('zz', 'r2', 1, true)], [REF_CIMENT, REF_VIS], new Map()) // « zz » : un autre article déjà rapproché à « Vis » : la suggestion de a2 n'est pas seule
    expect(l.map((x) => x.etat)).toEqual(['valide', 'suggere', 'a_rapprocher'])
    expect(l[0].reference?.nom).toBe('Sac de ciment 25 kg')
    expect(l[2].fournisseur).toBe('Fournisseur inconnu')
    expect(l[2].stats).toEqual({ nbLignes: 0, dernierPrix: null, derniereDate: null })
  })
  it('1 : nombre de lignes et dernier prix comme Metabase (acceptées, type facture, quantité > 0, prix net = montant / quantité)', () => {
    const s = statistiquesLignes([
      ligne('l1', 'a1', 4, 400, { date_facture: '2026-10-01' }), // 100 € l'unité
      ligne('l2', 'a1', 2, 150, { date_facture: '2026-11-05' }), // 75 € : le plus récent
      ligne('l3', 'a1', 1, 999, { statut: 'a_valider', date_facture: '2026-12-01' }),
      ligne('l4', 'a1', 1, 999, { type_document: 'avoir', date_facture: '2026-12-01' }),
      ligne('l5', 'a1', 0, 0, { date_facture: '2026-12-01' }),
      ligne('l6', 'a1', -1, -50, { date_facture: '2026-12-01' }),
      ligne('l7', 'a1', 3, null, { date_facture: '2026-12-01' }),
      { id: 'l8', article_fournisseur_id: 'a1', quantite: 1, montant_ht: 1, factures: null },
      ligne('l9', 'a2', 10, 100, { date_facture: null, created_at: '2026-11-20T23:30:00Z' }), // 21/11 à Paris
])
    expect(s.get('a1')).toEqual({ nbLignes: 2, dernierPrix: 75, derniereDate: '2026-11-05' })
    expect(s.get('a2')).toEqual({ nbLignes: 1, dernierPrix: 10, derniereDate: '2026-11-21' })
    expect(s.get('a3')).toBeUndefined()
  })
  it('1 : même date : la ligne au plus grand identifiant est la dernière (comme la vue)', () => {
    const s = statistiquesLignes([ligne('b', 'a1', 1, 20), ligne('a', 'a1', 1, 10)])
    expect(s.get('a1')?.dernierPrix).toBe(20)
  })
})

describe('critère 2 : filtres, recherche, tri', () => {
  const liste = construireListe([
    art('a1', 'Ciment gris sac 35 kg', 'ALPHA Matériaux', { reference: 'C-35' }),
    art('a2', 'Vis inox boîte de 200', 'BÊTA', { unite: 'boîte' }),
    art('a3', 'Électrode', 'ALPHA Matériaux'),
    art('a4', 'Sable', 'BÊTA'),
], [rap('a1', 'r1', 0.714286, true), rap('a2', 'r2', 0.005, false), rap('zz', 'r2', 1, true)], [REF_CIMENT, REF_VIS], // boîte de 200 vis vers « u » : 1 vis = 1/200 boîte = 0,005
  statistiquesLignes([ligne('l1', 'a3', 1, 50), ligne('l2', 'a3', 1, 60), ligne('l3', 'a4', 1, 5)]))
  it('2 : recherche sans accents ni casse, mot par mot (désignation, référence, fournisseur, article de référence)', () => {
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'electrode' }).map((x) => x.article.id)).toEqual(['a3'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'ÉLECTRODE' }).map((x) => x.article.id)).toEqual(['a3'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'beta vis' }).map((x) => x.article.id)).toEqual(['a2'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'c-35' }).map((x) => x.article.id)).toEqual(['a1'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'sac de ciment 25' }).map((x) => x.article.id)).toEqual(['a1'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: '   ' })).toHaveLength(4)
  })
  it('2 : espace au début / à la fin de la saisie = début / fin de mot (« ␣ha␣ » = mot entier)', () => {
    const l = construireListe([
      art('h1', 'Acier HA 10 mm', 'ALPHA Matériaux'), art('h2', 'Chape fluide', 'BÊTA'), art('h3', 'Béton chaînage', 'BÊTA'),
      art('h4', 'Treillis ha-10 soudé', 'BÊTA'), art('h5', 'Barre HA10', 'BÊTA'), art('h6', 'Hache', 'BÊTA'),
], [], [], new Map())
    const ids = (r) => filtrerArticles(l, { ...CRITERES_ARTICLES_VIDES, recherche: r }).map((x) => x.article.id).sort()
    expect(ids('ha')).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    expect(ids(' ha ')).toEqual(['h1', 'h4'])
    expect(ids(' HA ')).toEqual(['h1', 'h4'])
    expect(ids(' ha')).toEqual(['h1', 'h4', 'h5', 'h6'])
    expect(ids('ha ')).toEqual(['h1', 'h4'])
    expect(ids('cha ')).toEqual([])
    expect(ids(' chape')).toEqual(['h2'])
    expect(ids(' béton ')).toEqual(['h3'])
    expect(ids(' acier ha 10 ')).toEqual(['h1'])
    expect(ids(' mm ha')).toEqual(['h1'])
    expect(ids(' ha-10 ')).toEqual(['h1', 'h4'])
    expect(ids('  ')).toHaveLength(6)
  })
  it('2 : filtres par état et par fournisseur (« ou » dans un groupe, « et » entre groupes), pastilles retirables', () => {
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, etats: ['a_rapprocher'] }).map((x) => x.article.id).sort()).toEqual(['a3', 'a4'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, etats: ['valide', 'suggere'] }).map((x) => x.article.id).sort()).toEqual(['a1', 'a2'])
    const c = { ...CRITERES_ARTICLES_VIDES, etats: ['a_rapprocher'], fournisseurs: ['BÊTA'] }
    expect(filtrerArticles(liste, c).map((x) => x.article.id)).toEqual(['a4'])
    const p = pastillesArticles(c)
    expect(p.map((x) => x.libelle)).toEqual(['À rapprocher', 'BÊTA'])
    expect(retirerPastille(c, p[1])).toEqual({ ...c, fournisseurs: [] })
    expect(fournisseursDe(liste)).toEqual(['ALPHA Matériaux', 'BÊTA'])
  })
  it('2 : tri par défaut : « Validé » d’abord, puis « À rapprocher » puis « Suggéré » ; autres critères ; prix absent en dernier', () => {
    expect(trierArticles(liste, { critere: 'etat', sens: 'asc' }).map((x) => x.etat)).toEqual(['valide', 'a_rapprocher', 'a_rapprocher', 'suggere'])
    expect(trierArticles(liste, { critere: 'designation', sens: 'asc' }).map((x) => x.article.id)).toEqual(['a1', 'a3', 'a4', 'a2'])
    expect(trierArticles(liste, { critere: 'lignes', sens: 'desc' })[0].article.id).toBe('a3')
    const prix = trierArticles(liste, { critere: 'prix', sens: 'desc' }).map((x) => x.article.id)
    expect(prix.slice(0, 2)).toEqual(['a3', 'a4'])
    expect(trierArticles(liste, { critere: 'prix', sens: 'asc' }).map((x) => x.article.id).slice(0, 2)).toEqual(['a4', 'a3'])
    expect(trierArticles(liste, { critere: 'fournisseur', sens: 'desc' })[0].fournisseur).toBe('BÊTA')
  })
})

describe('critère 3 : prix ramené et coefficient', () => {
  it('3 : prix ramené = dernier prix × coefficient, arrondi seulement à l’affichage', () => {
    expect(prixRamene(100, 0.714286)).toBeCloseTo(71.4286, 6)
    expect(prixRamene(100, 1)).toBe(100)
    expect(prixRamene(null, 1)).toBeNull()
    expect(prixRamene(100, null)).toBeNull()
    expect(sansEspaces(phraseApercu(100, 0.714286, 'sac'))).toBe(sansEspaces(`Au dernier prix de ${euros(100)} HT, ça fait ${euros(71.4286)} HT par unité de référence (sac).`))
    expect(sansEspaces(euros(71.4286))).toBe('71,43 €')
  })
  it('3 : coefficient vide, nul, négatif ou non numérique refusé en français ; virgule acceptée', () => {
    expect(verifierCoefficient('').erreur).toMatch(/Indique le coefficient/)
    expect(verifierCoefficient('   ').erreur).toMatch(/Indique le coefficient/)
    expect(verifierCoefficient('0').erreur).toMatch(/plus grand que zéro/)
    expect(verifierCoefficient('0,0').erreur).toMatch(/plus grand que zéro/)
    expect(verifierCoefficient('-1').erreur).toMatch(/plus grand que zéro/)
    expect(verifierCoefficient('-0,5').erreur).toMatch(/plus grand que zéro/)
    expect(verifierCoefficient('-abc').erreur).toMatch(/un nombre/)
    expect(verifierCoefficient('abc').erreur).toMatch(/un nombre/)
    expect(verifierCoefficient('1,2,3').erreur).toMatch(/un nombre/)
    expect(verifierCoefficient('2000000').erreur).toMatch(/compris entre/)
    expect(verifierCoefficient('0,714').valeur).toBe(0.714)
    expect(verifierCoefficient('0.714').valeur).toBe(0.714)
    expect(verifierCoefficient(' 1 000 ').valeur).toBe(1000)
    expect(verifierCoefficient('1').valeur).toBe(1)
    expect(lireNombre('')).toBeNull()
    expect(lireNombre('25/35')).toBeNaN()
    expect(lireNombre('25/35', true)).toBeCloseTo(0.7142857, 6)
    expect(lireNombre('1/0', true)).toBeNaN()
  })
  it('3 : aucun prix (article sans ligne, par exemple après une réouverture) : phrase claire, pas de chiffre inventé', () => {
    expect(phraseApercu(null, 0.714286, 'sac')).toMatch(/Pas encore de prix/)
    expect(phraseApercu(null, 0.714286, 'sac')).not.toMatch(/€/)
  })
})

describe('critère 4 : aide au calcul dans le BON sens', () => {
  it('4 : fournisseur sac de 35 kg à 100 €, référence sac de 25 kg → coefficient 0,714 → 71,43 €, jamais 140 €', () => {
    // « 1 sac de référence (25 kg) = 25/35 sac du fournisseur » : le bon sens, direct.
    const direct = coefficientDepuisAide('reference_en_fournisseur', '25/35')
    expect(direct.valeur).toBeCloseTo(0.714, 3)
    expect(coefficientFr(direct.valeur)).toBe('0,714285714')
    const prix = prixRamene(100, direct.valeur)
    expect(sansEspaces(euros(prix))).toBe('71,43 €')
    expect(prix).not.toBeCloseTo(140, 0)
    // L'autre sens : « 1 sac du fournisseur (35 kg) = 1,4 sac de référence » → coefficient = 1 / 1,4.
    const inverse = coefficientDepuisAide('fournisseur_en_reference', '1,4')
    expect(inverse.valeur).toBeCloseTo(0.714286, 6)
    expect(sansEspaces(euros(prixRamene(100, inverse.valeur)))).toBe('71,43 €')
    expect(coefficientDepuisAide('fournisseur_en_reference', '35/25').valeur).toBeCloseTo(0.714286, 6)
  })
  it('4 : l’autre sens donne 1/Y ; saisie vide, nulle ou absurde refusée', () => {
    expect(coefficientDepuisAide('fournisseur_en_reference', '4').valeur).toBe(0.25)
    expect(coefficientDepuisAide('reference_en_fournisseur', '4').valeur).toBe(4)
    expect(coefficientDepuisAide('reference_en_fournisseur', '').erreur).toBeTruthy()
    expect(coefficientDepuisAide('reference_en_fournisseur', '0').erreur).toMatch(/plus grand que zéro/)
    expect(coefficientDepuisAide('fournisseur_en_reference', 'x').erreur).toMatch(/nombre/)
    expect(coefficientDepuisAide('fournisseur_en_reference', '0,0000001').erreur).toMatch(/limites/)
  })
})

describe('critère 5 : valider', () => {
  it('5 : le corps de valider_rapprochement n’a que les 3 champs, coefficient en NOMBRE, sans identité', () => {
    const c = corpsValidation('af1', 'r1', 0.714286)
    expect(c).toEqual({ article_fournisseur_id: 'af1', article_reference_id: 'r1', coefficient: 0.714286 })
    expect(typeof c.coefficient).toBe('number')
    expect(Object.keys(c).sort()).toEqual(['article_fournisseur_id', 'article_reference_id', 'coefficient'])
    expect(JSON.stringify(c)).not.toMatch(/qui|email|valide_par|valide_le/)
    expect(corpsRefus('af1')).toEqual({ article_fournisseur_id: 'af1' })
  })
})

describe('critère 6 : créer un article de référence', () => {
  const refs = [REF_CIMENT, REF_VIS, REF_SABLE_INACTIVE]
  it('6 : nom vide refusé ; unité vide refusée ; nom et unité rognés', () => {
    expect(verifierNouvelleReference('', 'sac', refs).erreur).toMatch(/nom .*obligatoire/)
    expect(verifierNouvelleReference('  --  ', 'sac', refs).erreur).toMatch(/nom .*obligatoire/)
    expect(verifierNouvelleReference('Mortier 25 kg', ' ', refs).erreur).toMatch(/unité/)
    expect(verifierNouvelleReference('x'.repeat(121), 'sac', refs).erreur).toMatch(/trop long/)
    expect(verifierNouvelleReference('  Mortier   25 kg ', ' sac ', refs).ok).toEqual({ nom: 'Mortier 25 kg', unite_reference: 'sac' })
    expect(corpsCreationReference('  Mortier   25 kg ', ' sac ')).toEqual({ nom: 'Mortier 25 kg', unite_reference: 'sac' })
  })
  it('6 : un nom qui existe déjà (même nom normalisé) est refusé et l’existant est proposé avec son unité, même inactif', () => {
    const r = verifierNouvelleReference('SAC DE CIMENT  25 KG', 'kg', refs)
    expect(r.existante).toEqual(REF_CIMENT)
    expect(r.ok).toBeUndefined()
    expect(verifierNouvelleReference('vis a bois 5x50', 'u', refs).existante?.id).toBe('r2')
    const inactive = verifierNouvelleReference('Sable 0-4', 't', refs)
    expect(inactive.existante?.id).toBe('r3')
  })
})

describe('critère 7 : refuser une suggestion, corriger un validé', () => {
  it('7 : on refuse une suggestion, jamais un rapprochement validé ; avertissement avant de corriger un validé', () => {
    expect(peutRefuser('suggere')).toBe(true)
    expect(peutRefuser('valide')).toBe(false)
    expect(peutRefuser('a_rapprocher')).toBe(false)
    expect(avertissementAvantValidation('valide')).toBe(AVERTISSEMENT_CORRECTION)
    expect(AVERTISSEMENT_CORRECTION).toBe('Ça change les prix de tout l’historique de cet article.')
    expect(avertissementAvantValidation('suggere')).toBeNull()
    expect(avertissementAvantValidation('a_rapprocher')).toBeNull()
  })
  it('7 : résultat « tout est passé » : groupes, articles, articles sans jumeau qui restent à rapprocher', () => {
    expect(phraseSuggestions({ suggestions: 95, groupes: 30, ignorees: 0, articles_envoyes: 166 })).toBe('L’IA a proposé 30 groupes (95 articles). 71 articles n’ont pas de jumeau et restent à rapprocher. Vérifie-les avant de valider.')
    expect(phraseSuggestions({ suggestions: 2, groupes: 1, articles_envoyes: 3 })).toBe('L’IA a proposé 1 groupe (2 articles). 1 article n’a pas de jumeau et reste à rapprocher. Vérifie-les avant de valider.')
    expect(phraseSuggestions({ suggestions: 2, groupes: 1, articles_envoyes: 2 })).toBe('L’IA a proposé 1 groupe (2 articles). Vérifie-les avant de valider.')
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, articles_envoyes: 40 })).toBe('L’IA n’a trouvé aucun groupe : aucun des 40 articles à rapprocher n’a de jumeau.')
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, ignorees: 0 })).toBe('Aucun nouveau groupe d’articles à rapprocher.')
  })
  it('20 : l’IA s’est arrêtée avant la fin : groupes gardés, reste approximatif, « Clique encore pour continuer »', () => {
    expect(phraseSuggestions({ suggestions: 9, groupes: 4, ignorees: 0, partiel: true, reste: 52 })).toBe('L’IA s’est arrêtée avant la fin (limite atteinte). 4 groupes ont été proposés; il reste environ 52 articles à traiter. Clique encore pour continuer.')
    expect(phraseSuggestions({ suggestions: 2, groupes: 1, partiel: true, reste: 1 })).toBe('L’IA s’est arrêtée avant la fin (limite atteinte). 1 groupe a été proposé; il reste environ 1 article à traiter. Clique encore pour continuer.')
    expect(phraseSuggestions({ suggestions: 2, groupes: 1, partiel: true, reste: 0 })).toBe('L’IA s’est arrêtée avant la fin (limite atteinte). 1 groupe a été proposé. Clique encore pour continuer.')
  })
  it('21 : arrêt de l’IA sans aucun groupe : phrase claire ; partiel absent ou faux : phrase habituelle', () => {
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, partiel: true, reste: 80 })).toBe('L’IA s’est arrêtée avant la fin (limite atteinte) sans avoir pu proposer de groupe. Clique encore pour réessayer.')
    expect(phraseSuggestions({ suggestions: 4, groupes: 2, ignorees: 0, partiel: false })).toBe('L’IA a proposé 2 groupes (4 articles). Vérifie-les avant de valider.')
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, ignorees: 0, partiel: false })).toBe('Aucun nouveau groupe d’articles à rapprocher.')
  })
  it('26 : un seul article libre : phrase au singulier, sans dire que l’IA a cherché', () => {
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, ignorees: 0, articles_envoyes: 1 })).toBe('Il ne reste qu’un article à rapprocher : pas de groupe possible.')
  })
  it('25 : « sans jumeau » seulement si rien n’a été écarté ; « au moins » quand le catalogue est plein (400)', () => {
    expect(phraseSuggestions({ suggestions: 4, groupes: 2, ignorees: 3, articles_envoyes: 20 })).toBe('L’IA a proposé 2 groupes (4 articles). 16 articles restent à rapprocher (certains n’ont pas de jumeau, d’autres ont été écartés). Vérifie-les avant de valider.')
    expect(phraseSuggestions({ suggestions: 0, groupes: 0, ignorees: 0, lignes_ignorees: 2, articles_envoyes: 20 })).toBe('L’IA n’a proposé aucun groupe utilisable : une partie de sa réponse était hors format ou refusée. Les 20 articles restent à rapprocher.')
    expect(phraseSuggestions({ suggestions: 4, groupes: 2, partiel: true, reste: 300, articles_envoyes: 400 })).toMatch(/il reste au moins 300 articles/)
  })
  it('22 : erreur sans rien écrit (délai, pas de réponse) : phrase claire sans terme technique ; autre code : phrase habituelle', () => {
    expect(phraseErreurSuggestions('ia_delai')).toBe('L’IA a mis trop de temps à répondre : rien n’a été enregistré. Clique encore dans quelques minutes.')
    expect(phraseErreurSuggestions('ia_indisponible')).toBe('L’IA n’a pas répondu : rien n’a été enregistré. Réessaie dans quelques minutes.')
    expect(phraseErreurSuggestions('autre')).toBeNull()
    expect(phraseErreurSuggestions(null)).toBeNull()
    expect(messageServeur(503, { code: 'ia_delai', erreur: 'x' })).toBe('Une erreur est survenue, réessaie dans un instant.') // c'est le code qui choisit la phrase, pas le serveur
  })
  it('23 : jamais de fin de clic sans message : succès, vide, partiel, erreurs de toute forme et réponses bizarres donnent toujours un texte non vide', () => {
    const reponses = [
      { ok: true, suggestions: 95, groupes: 30, articles_envoyes: 166 }, { ok: true, suggestions: 0, groupes: 0 }, { ok: true, partiel: true, reste: 12, groupes: 3, suggestions: 7 },
      { ok: true, partiel: true, groupes: 0 }, {}, null, undefined, 'texte', 42, { suggestions: 'x', groupes: NaN, reste: -5, partiel: true }, { ok: true },
]
    for (const r of reponses) { const x = resultatClic(r); expect(x.erreur).toBe(false); expect(x.texte.trim().length).toBeGreaterThan(10) }
    const erreurs = [new ErreurDecision('Connexion impossible, réessaie.', 'reseau'), new ErreurDecision('x', 'ia_delai'), new ErreurDecision('x', 'ia_indisponible'), new ErreurDecision('x', null), new Error(''), 'texte', null, { code: 5 }]
    for (const e of erreurs) { const x = resultatClic(undefined, e, messageErreur(e)); expect(x.erreur).toBe(true); expect(x.texte.trim().length).toBeGreaterThan(10) }
    expect(resultatClic(undefined, new ErreurDecision('Connexion impossible, réessaie.', 'reseau'), 'Connexion impossible, réessaie.').texte).toBe('Les suggestions n’ont pas pu être demandées : Connexion impossible, réessaie.')
  })
  it('24 : en-tête de l’écran : à rapprocher + suggestions IA à valider + rapprochés (la somme tombe juste, même source que la liste)', () => {
    const mk = (etat) => ({ etat })
    const liste = [...Array(71).fill(0).map(() => mk('a_rapprocher')), ...Array(122).fill(0).map(() => mk('suggere')), ...Array(40).fill(0).map(() => mk('valide'))]
    expect(texteCompteur(liste)).toBe('233 articles · 71 à rapprocher · 122 suggestions IA à valider · 40 rapprochés')
    expect(texteCompteur([mk('suggere')])).toBe('1 article · 0 à rapprocher · 1 suggestion IA à valider')
  })
})

describe('critère 8 : cas vide et cas d’erreur', () => {
  it('8 : textes du cas vide et de l’erreur de lecture', () => {
    expect(TEXTE_VIDE).toBe('Aucun article pour l’instant : ils apparaissent quand tu acceptes des factures avec leurs lignes.')
    expect(TEXTE_ERREUR_LECTURE).toMatch(/Impossible de charger les articles/)
  })
  it('8 : 4xx = message du serveur ; 5xx = phrase générique ; erreur sans message = phrase générique', () => {
    expect(messageServeur(409, { erreur: 'Cette suggestion n’existe plus (la liste a changé entre-temps) : recharge la liste.', code: 'suggestion_introuvable' })).toMatch(/n’existe plus/)
    expect(messageServeur(400, { erreur: 'Le coefficient doit être un nombre plus grand que zéro' })).toMatch(/coefficient/)
    expect(messageServeur(500, { erreur: 'détail technique' })).toBe(MESSAGE_GENERIQUE)
    expect(messageServeur(503, { erreur: 'L’IA n’a pas répondu.' })).toBe(MESSAGE_GENERIQUE)
    expect(messageErreur(new ErreurDecision('Cet article ou cet article de référence n’existe pas (ou plus) : recharge la liste puis réessaie.', 'article_introuvable'))).toMatch(/n’existe pas/)
    expect(messageErreur('pas une erreur')).toBe(MESSAGE_GENERIQUE)
    expect(messageErreur(new Error('  '))).toBe(MESSAGE_GENERIQUE)
  })
})

describe('corrections après la relecture Fable', () => {
  it('3 : coefficient gardé à 9 chiffres significatifs : 1/35000 survit à l’arrondi, à l’affichage et à la relecture du champ', () => {
    const k = 1 / 35000
    expect(arrondirCoefficient(k)).toBe(Number(k.toPrecision(9)))
    expect(arrondirCoefficient(k)).not.toBe(0.000029)
    const relu = verifierCoefficient(coefficientFr(arrondirCoefficient(k))).valeur
    expect(Math.abs(relu * 35000 - 1)).toBeLessThan(1e-8)
    expect(coefficientDepuisAide('fournisseur_en_reference', '35000').valeur).toBe(arrondirCoefficient(k))
  })
  it('6 : les unités se comparent comme dans la base (« Sacs » = « sac », « m² » = « m2 », « pièce » = « u »)', () => {
    expect(normaliserUnite('Sacs')).toBe('sac')
    expect(normaliserUnite('m²')).toBe('m2')
    expect(normaliserUnite('Pièce')).toBe('u')
    expect(normaliserUnite('Seau')).toBe('seau')
    expect(normaliserUnite('kg')).not.toBe(normaliserUnite('sac'))
  })
})

describe('refus réversible (décision du 23/11/2026, migration 017)', () => {
  const refusee = (af, ar, coefficient) =>
    ({ article_fournisseur_id: af, refuse_par: 'd@x.fr', refuse_le: '2026-11-24T10:00:00Z', article_reference_id: ar, coefficient })
  const articles = [art('a1', 'Ciment gris sac 35 kg', 'ALPHA'), art('a2', 'Vis boîte de 200', 'ALPHA', { unite: 'boîte' }), art('a3', 'Sable', 'BETA'),
    art('a4', 'Mortier', 'BETA'), art('a5', 'Chaux', 'BETA')]
  // a1 refusé (suggestion gardée, référence mise de côté) ; a2 refusé avant 017 (rien de gardé) ; a3 refusé PUIS suggéré (la suggestion passe avant) ;
  // a4 validé (et un refus resté par erreur : validé gagne) ; a5 à rapprocher.
  const liste = construireListe(articles, [rap('a3', 'r2', 1, false), rap('zz', 'r2', 1, true), rap('a4', 'r1', 1, true)], [REF_CIMENT, REF_VIS, REF_SABLE_INACTIVE], new Map(),
    [refusee('a1', 'r3', 0.714286), refusee('a2', null, null), refusee('a3', 'r1', 2), refusee('a4', 'r1', 1)])
  const de = (id) => liste.find((x) => x.article.id === id)

  it('12 : état « refusee » : libellé « Refusée » (sans « par toi » : un collègue a pu refuser), badge comme les factures refusées ; priorité validé > suggéré > refusée > à rapprocher', () => {
    expect(libelleEtat('refusee')).toBe('Refusée')
    expect(ETATS.find((e) => e.id === 'refusee')?.badge).toBe('badge-retard')
    expect(ETATS.map((e) => e.id)).toEqual(['a_rapprocher', 'suggere', 'refusee', 'valide'])
    expect(etatArticle(null, refusee('a', 'r1', 1))).toBe('refusee')
    expect(etatArticle(rap('a', 'r1', 1, false), refusee('a', 'r1', 1))).toBe('suggere')
    expect(etatArticle(rap('a', 'r1', 1, true), refusee('a', 'r1', 1))).toBe('valide')
    expect(etatArticle(null, null)).toBe('a_rapprocher')
    expect(liste.map((x) => x.etat)).toEqual(['refusee', 'refusee', 'suggere', 'valide', 'a_rapprocher'])
  })
  it('12 : la ligne refusée porte la suggestion refusée (référence, même inactive, et coefficient) ; texte de la colonne', () => {
    expect(de('a1').refus?.coefficient).toBe(0.714286)
    expect(de('a1').referenceRefusee?.nom).toBe('Sable 0/4')
    expect(de('a1').reference).toBeNull()
    expect(sansEspaces(texteSuggestionRefusee(de('a1')))).toBe('Refusé : Sable 0/4 · coefficient 0,714286 · t')
    expect(texteSuggestionRefusee(de('a2'))).toMatch(/non gardée/)
    // Un refus caché par une suggestion ou un validé n'est pas porté par la ligne.
    expect(de('a3').refus).toBeNull()
    expect(de('a4').refus).toBeNull()
    // Coefficient lu en texte par PostgREST (numeric) : converti en nombre.
    const l = construireListe([articles[0]], [], [REF_CIMENT], new Map(), [{ ...refusee('a1', 'r1', null), coefficient: '0.5' }])
    expect(l[0].refus?.coefficient).toBe(0.5)
  })
  it('12 : « Reprendre cette suggestion » seulement pour un refus dont la suggestion est gardée', () => {
    expect(peutReprendre(de('a1'))).toBe(true)
    expect(peutReprendre(de('a2'))).toBe(false) // refus d'avant 017
    expect(peutReprendre(de('a3'))).toBe(false)
    expect(peutReprendre(de('a5'))).toBe(false)
    expect(corpsReprise('a1')).toEqual({ article_fournisseur_id: 'a1' })
  })
  it('12 : filtre « Refusée », recherche dans la référence refusée, tri (refusées après les suggérées), compteur', () => {
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, etats: ['refusee'] }).map((x) => x.article.id)).toEqual(['a1', 'a2'])
    expect(filtrerArticles(liste, { ...CRITERES_ARTICLES_VIDES, recherche: 'sable 0/4' }).map((x) => x.article.id)).toEqual(['a1'])
    expect(pastillesArticles({ ...CRITERES_ARTICLES_VIDES, etats: ['refusee'] })[0].libelle).toBe('Refusés')
    expect(trierArticles(liste, { critere: 'etat', sens: 'asc' }).map((x) => x.etat)).toEqual(['valide', 'a_rapprocher', 'suggere', 'refusee', 'refusee'])
    expect(texteCompteur(liste)).toBe('5 articles · 1 à rapprocher · 1 suggestion IA à valider · 1 rapproché · 2 refusés')
    expect(texteCompteur(liste.filter((x) => x.article.id !== 'a2'))).toBe('4 articles · 1 à rapprocher · 1 suggestion IA à valider · 1 rapproché · 1 refusé')
    expect(texteCompteur(liste.filter((x) => x.etat !== 'refusee'))).toBe('3 articles · 1 à rapprocher · 1 suggestion IA à valider · 1 rapproché')
  })
  it('12 : cas vide « Aucune suggestion refusée » (seulement quand on ne regarde que les refusées, sans recherche)', () => {
    expect(TEXTE_AUCUNE_REFUSEE).toBe('Aucune suggestion refusée.')
    expect(texteAucunResultat({ ...CRITERES_ARTICLES_VIDES, etats: ['refusee'] })).toBe(TEXTE_AUCUNE_REFUSEE)
    expect(texteAucunResultat({ ...CRITERES_ARTICLES_VIDES, etats: ['refusee'], recherche: 'xyz' })).toMatch(/ne correspond/)
    expect(texteAucunResultat({ ...CRITERES_ARTICLES_VIDES, etats: ['refusee', 'suggere'] })).toMatch(/ne correspond/)
  })
  it('12 : bandeau d’annulation de 8 secondes ; erreurs de reprise relues et dites en français', () => {
    expect(DUREE_ANNULATION_MS).toBe(8000)
    expect(TEXTE_REFUS_ANNULABLE).toBe('Suggestion refusée.')
    for (const c of ['refus_introuvable', 'deja_rapproche', 'reference_introuvable']) expect(CODES_A_RELIRE).toContain(c)
    expect(messageErreur(new ErreurDecision(messageServeur(409, { code: 'deja_rapproche', erreur: 'Cet article a déjà un rapprochement : la suggestion refusée ne peut pas être reprise. Recharge la liste.' }), 'deja_rapproche')))
      .toMatch(/déjà un rapprochement/)
  })
  it('031 : dissociation : corps sans identité, erreurs relues, textes en français simple tutoyés', () => {
    expect(corpsDissociation('a1')).toEqual({ article_fournisseur_id: 'a1' })
    for (const c of ['rapprochement_introuvable', 'rapprochement_non_valide']) expect(CODES_A_RELIRE).toContain(c)
    expect(TEXTE_CONFIRMATION_DISSOCIATION).toBe('Dissocier ces deux articles ? Les prix de l’historique de cet article ne seront plus ramenés à l’article de référence. Il redeviendra à rapprocher.')
    expect(TEXTE_DISSOCIE_ANNULABLE).toBe('Dissocié.')
    expect(messageDissociationImpossible(new Error('Panne.'))).toBe('La dissociation n’a pas pu être faite : Panne.')
    expect(messageAnnulationDissociationImpossible(null)).toMatch(/pas pu être annulée/)
  })
  it('12 : repli : si la lecture des refusées échoue (017 pas encore appliquée), liste vide marquée indisponible, sans erreur ; sinon lue telle quelle', async () => {
    await expect(lectureDeSecours(async () => { throw new Error('column suggestions_refusees.coefficient does not exist') })).resolves.toEqual({ lignes: [], tronque: false, indisponible: true })
    await expect(lectureDeSecours(async () => ({ lignes: [1, 2], tronque: false }))).resolves.toEqual({ lignes: [1, 2], tronque: false, indisponible: false })
    expect(TEXTE_REFUSEES_INDISPONIBLES).toMatch(/À rapprocher/)
    expect(TEXTE_REFUSEES_INDISPONIBLES).not.toMatch(/column|suggestions_refusees|017/)
  })
})

describe('un rapprochement relie au moins deux articles (décision du 24/11/2026)', () => {
  const arts = [art('a1', 'Ciment gris', 'ALPHA'), art('a2', 'Ciment gris 25 kg', 'BETA'), art('a3', 'Vis', 'ALPHA')]
  const etats = (r) => construireListe(arts, r, [REF_CIMENT, REF_VIS], new Map()).map((x) => x.etat)
  it('N1 : une suggestion seule pour sa référence n’est plus une suggestion : l’article redevient « À rapprocher » (rien n’est supprimé en base)', () => {
    expect(etats([rap('a3', 'r2', 1, false)])).toEqual(['a_rapprocher', 'a_rapprocher', 'a_rapprocher'])
    const l = construireListe(arts, [rap('a3', 'r2', 1, false)], [REF_CIMENT, REF_VIS], new Map())
    expect(l[2].rapprochement).toBeNull(); expect(l[2].reference).toBeNull()
  })
  it('N2 : deux suggestions vers la même référence = un groupe, les deux restent « Suggéré par l’IA »', () => {
    expect(etats([rap('a1', 'r1', 1, false), rap('a2', 'r1', 0.7, false)])).toEqual(['suggere', 'suggere', 'a_rapprocher'])
  })
  it('N3 : un rapprochement VALIDÉ ne bouge jamais, même seul pour sa référence ; une suggestion qui rejoint un validé reste une suggestion', () => {
    expect(etats([rap('a1', 'r1', 1, true)])).toEqual(['valide', 'a_rapprocher', 'a_rapprocher'])
    expect(etats([rap('a1', 'r1', 1, true), rap('a2', 'r1', 0.7, false)])).toEqual(['valide', 'suggere', 'a_rapprocher'])
  })
  it('N4 : la vue groupée ne montre aucune carte d’un article seul', () => {
    const l = construireListe(arts, [rap('a1', 'r1', 1, false), rap('a3', 'r2', 1, false)], [REF_CIMENT, REF_VIS], new Map())
    expect(grouperSuggestions(filtrerArticles(l, { ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })).groupes).toHaveLength(0)
    expect(filtrerArticles(l, { ...CRITERES_ARTICLES_VIDES, etats: ['suggere'] })).toHaveLength(0)
  })
})
