// Porte de la base (basePorte, 26/11/2026) : la traduction PostgREST → SQL (functions/src/base/porte-requetes.js), sans réseau ni base.
// Chaque opérateur, not., in échappé, * littéral, noms inconnus ou réservés refusés, injection dans un nom ou une valeur, pagination et Content-Range, objet unique, rpc.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserRoute, normaliserChemin, analyserRequete, analyserFiltre, listeIn, motifLike, sqlLecture, sqlCompte, sqlInsertion, sqlMiseAJour, sqlRpc,
  resultatRpc, construireCatalogue, reponseErreur, lirePrefer, veutObjet, contentRange, cheminObjet, ErreurPorte, LIMITE_MAX,
} from '../functions/src/base/porte-requetes.js';

const CATALOGUE = construireCatalogue(
  [
    ...['id:uuid', 'numero:text', 'statut:text', 'montant_ttc:numeric', 'donnees:jsonb', 'etiquettes:text[]', 'email_message_id:text', 'archivee_le:timestamp with time zone']
      .map((c) => ({ relation: 'factures', colonne: c.split(':')[0], type: c.split(':')[1] })),
    { relation: 'couts_ia', colonne: 'taux_usd_eur', type: 'numeric' },
    { relation: 'couts_ia', colonne: 'cree_le', type: 'timestamp with time zone' },
    { relation: 'Bizarre', colonne: 'x', type: 'text' }, // nom exotique : jamais adressable
  ],
  [
    { nom: 'lister_favoris_os', ensemble: true, composite: false, vide: false, noms: [], modes: [], types: [] },
    { nom: 'demander_ticket_n8n', ensemble: false, composite: false, vide: false, noms: ['p_usage'], modes: [], types: ['text'] },
    { nom: 'basculer_favori_os', ensemble: false, composite: false, vide: true, noms: ['p_cle'], modes: [], types: ['text'] },
    { nom: 'consommer_ticket_porte', ensemble: true, composite: true, vide: false, noms: ['p_ticket', 'p_usage', 'courriel', 'espace', 'utilisateur'], modes: ['i', 'i', 't', 't', 't'], types: ['text', 'text', 'text', 'text', 'text'] },
    { nom: 'remplacer_lignes_facture', ensemble: false, composite: false, vide: false, noms: ['p_facture', 'p_lignes', 'p_qui'], modes: [], types: ['uuid', 'jsonb', 'text'] },
    { nom: 'resume_facture', ensemble: false, composite: true, vide: false, noms: ['p_id'], modes: [], types: ['uuid'] },
    { nom: 'double', ensemble: false, composite: false, vide: false, noms: ['p_a'], modes: [], types: ['text'] },
    { nom: 'double', ensemble: false, composite: false, vide: false, noms: ['p_a'], modes: [], types: ['integer'] },
  ],
);

const refuse = (fn, code, statut = 400) => assert.throws(fn, (e) => e instanceof ErreurPorte && e.code === code && e.statut === statut);

describe('1 routes', () => {
  test('1.1 tables, fonctions, stockage et /auth/v1/user ; préfixe /basePorte retiré', () => {
    assert.deepEqual(analyserRoute('GET', '/rest/v1/factures'), { type: 'table', nom: 'factures' });
    assert.deepEqual(analyserRoute('POST', '/basePorte/rest/v1/rpc/lister_favoris_os'), { type: 'rpc', nom: 'lister_favoris_os' });
    assert.deepEqual(analyserRoute('GET', '/auth/v1/user'), { type: 'auth' });
    assert.deepEqual(analyserRoute('POST', '/storage/v1/object/sign/factures/a/b.pdf'), { type: 'signer', dossier: 'factures', segments: ['a', 'b.pdf'] });
    assert.deepEqual(analyserRoute('GET', '/storage/v1/object/sign/factures/a/b.pdf'), { type: 'lien', dossier: 'factures', segments: ['a', 'b.pdf'] });
    assert.deepEqual(analyserRoute('POST', '/storage/v1/object/factures/a/b.pdf'), { type: 'deposer', dossier: 'factures', segments: ['a', 'b.pdf'] });
    assert.equal(analyserRoute('GET', '/rest/v1/').type, 'inconnu');
    assert.equal(analyserRoute('GET', '/rest/v1/a/b').type, 'inconnu');
    assert.equal(analyserRoute('GET', '/').type, 'inconnu');
    assert.equal(normaliserChemin('/baseporteX/rest'), '/baseporteX/rest');
  });
  test('1.2 chemin d\'objet : « .. », segment vide, barre oblique encodée, contrôle refusés ; accents et espaces décodés', () => {
    assert.equal(cheminObjet(['2026', 'Facture%20n%C2%B01.pdf']), '2026/Facture n°1.pdf');
    for (const mauvais of [['..', 'x'], ['a', ''], ['a%2Fb'], ['a%5Cb'], ['%00'], ['%E0%A4%A'], []]) refuse(() => cheminObjet(mauvais), 'chemin_refuse');
  });
});

describe('2 filtres', () => {
  test('2.1 chaque opérateur : eq neq gt gte lt lte ; valeur TOUJOURS en paramètre', () => {
    const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    for (const [op, sql] of Object.entries(ops)) {
      const a = analyserRequete([['select', 'id'], ['montant_ttc', `${op}.100`]], CATALOGUE, 'factures');
      const l = sqlLecture('factures', a);
      assert.match(l.sql, new RegExp(`where "montant_ttc" ${sql.replace(/[<>=]/g, (c) => `\\${c}`)} \\$1 `));
      assert.equal(l.valeurs[0], '100');
    }
  });
  test('2.2 not. inverse le filtre ; not.is.null → is not null (forme de n8n)', () => {
    const a = analyserRequete([['select', 'taux_usd_eur'], ['taux_usd_eur', 'not.is.null'], ['order', 'cree_le.desc'], ['limit', '1']], CATALOGUE, 'couts_ia');
    const l = sqlLecture('couts_ia', a);
    assert.equal(l.sql, 'select "taux_usd_eur" from public."couts_ia" where "taux_usd_eur" is not null order by "cree_le" desc limit $1 offset $2');
    assert.deepEqual(l.valeurs, [1, 0]);
    const b = sqlLecture('factures', analyserRequete([['statut', 'not.eq.refusee']], CATALOGUE, 'factures'));
    assert.match(b.sql, /where not \("statut" = \$1\)/);
  });
  test('2.3 is : null, true, false, unknown seulement ; rien d\'autre', () => {
    assert.match(sqlLecture('factures', analyserRequete([['archivee_le', 'is.null']], CATALOGUE, 'factures')).sql, /"archivee_le" is null/);
    assert.equal(analyserFiltre('is.unknown').valeur, 'unknown');
    refuse(() => analyserFiltre('is.drop'), 'filtre_refuse');
  });
  test('2.4 in : liste avec guillemets, virgule et \\" échappés (format de js/os/supabase.js) → = any($1)', () => {
    assert.deepEqual(listeIn('(a,b)'), ['a', 'b']);
    assert.deepEqual(listeIn('("a,b","c\\"d","e\\\\f")'), ['a,b', 'c"d', 'e\\f']);
    assert.deepEqual(listeIn('()'), []);
    refuse(() => listeIn('a,b'), 'filtre_refuse');
    refuse(() => listeIn('("a)'), 'filtre_refuse');
    const l = sqlLecture('factures', analyserRequete([['statut', 'in.("a_valider","acceptee")']], CATALOGUE, 'factures'));
    assert.match(l.sql, /"statut" = any\(\$1\)/);
    assert.deepEqual(l.valeurs[0], ['a_valider', 'acceptee']);
  });
  test('2.5 like/ilike : * joker → %, \\* étoile littérale, \\% pourcentage littéral', () => {
    assert.equal(motifLike('*abc*'), '%abc%');
    assert.equal(motifLike('a\\*b'), 'a*b');
    assert.equal(motifLike('100\\%'), '100\\%');
    assert.equal(motifLike('fin\\'), 'fin\\\\');
    const l = sqlLecture('factures', analyserRequete([['numero', 'ilike.*F\\*2*']], CATALOGUE, 'factures'));
    assert.match(l.sql, /"numero"::text ilike \$1/);
    assert.equal(l.valeurs[0], '%F*2%');
  });
  test('2.6 opérateur inconnu, filtre mal formé refusés', () => {
    refuse(() => analyserFiltre('fts.x'), 'operateur_inconnu');
    refuse(() => analyserFiltre('eq'), 'filtre_refuse');
    refuse(() => analyserFiltre('.x'), 'filtre_refuse');
  });
});

describe('3 noms et injection', () => {
  test('3.1 colonne inconnue → 400 colonne_inconnue ; table inconnue → 404', () => {
    refuse(() => analyserRequete([['mot_de_passe', 'eq.1']], CATALOGUE, 'factures'), 'colonne_inconnue');
    refuse(() => analyserRequete([['select', 'id,secret']], CATALOGUE, 'factures'), 'colonne_inconnue');
    refuse(() => analyserRequete([], CATALOGUE, 'pg_authid'), 'relation_inconnue', 404);
    refuse(() => analyserRequete([], CATALOGUE, 'Bizarre'), 'nom_refuse');
  });
  test('3.2 injection SQL dans un nom (colonne, table, tri, select, fonction, argument) : refusée avant tout SQL', () => {
    const essais = [
      () => analyserRequete([['id"; drop table factures; --', 'eq.1']], CATALOGUE, 'factures'),
      () => analyserRequete([['select', 'id,(select 1)']], CATALOGUE, 'factures'),
      () => analyserRequete([['select', 'id::text']], CATALOGUE, 'factures'),
      () => analyserRequete([['order', 'id;drop.asc']], CATALOGUE, 'factures'),
      () => analyserRequete([], CATALOGUE, 'factures;drop'),
      () => sqlRpc('lister_favoris_os(); drop', {}, CATALOGUE),
      () => sqlRpc('demander_ticket_n8n', { 'p_usage" => 1); --': 'x' }, CATALOGUE),
    ];
    for (const e of essais) assert.throws(e, (x) => x instanceof ErreurPorte && x.statut === 400);
  });
  test('3.3 injection SQL dans une VALEUR : jamais dans le texte SQL, toujours en paramètre', () => {
    const mal = "x' or 1=1; drop table factures; --";
    for (const filtre of [`eq.${mal}`, `like.${mal}`, `in.(${encodeURIComponent(mal)})`, `not.neq.${mal}`]) {
      const l = sqlLecture('factures', analyserRequete([['numero', filtre]], CATALOGUE, 'factures'));
      assert.ok(!l.sql.includes('drop'), l.sql);
      assert.ok(!l.sql.includes("'"), l.sql);
    }
    const ins = sqlInsertion('factures', { numero: mal }, CATALOGUE, ['id']);
    assert.ok(!ins.sql.includes('drop'));
    assert.deepEqual(ins.valeurs, [mal]);
    const rpc = sqlRpc('demander_ticket_n8n', { p_usage: mal }, CATALOGUE);
    assert.ok(!rpc.sql.includes('drop'));
  });
  test('3.4 réglages non compris (or, and, not, columns) et réglage en double : refusés', () => {
    refuse(() => analyserRequete([['or', '(id.eq.1,id.eq.2)']], CATALOGUE, 'factures'), 'reglage_refuse');
    refuse(() => analyserRequete([['and', '(id.eq.1)']], CATALOGUE, 'factures'), 'reglage_refuse');
    refuse(() => analyserRequete([['columns', 'id']], CATALOGUE, 'factures'), 'reglage_refuse');
    refuse(() => analyserRequete([['limit', '1'], ['limit', '2']], CATALOGUE, 'factures'), 'reglage_double');
  });
});

describe('4 lecture, pagination, comptage', () => {
  test('4.1 select absent ou * : toutes les colonnes nommées une à une (jamais « select * »)', () => {
    const l = sqlLecture('couts_ia', analyserRequete([], CATALOGUE, 'couts_ia'));
    assert.equal(l.sql, 'select "taux_usd_eur", "cree_le" from public."couts_ia" limit $1 offset $2');
    assert.deepEqual(l.valeurs, [LIMITE_MAX, 0]);
  });
  test('4.2 limit plafonné à 1000, offset entier, valeurs négatives ou texte refusées ; tri à plusieurs clés', () => {
    const a = analyserRequete([['limit', '5000'], ['offset', '2000'], ['order', 'numero.asc,id.desc.nullslast']], CATALOGUE, 'factures');
    assert.equal(a.limit, 1000);
    const l = sqlLecture('factures', a);
    assert.match(l.sql, /order by "numero" asc, "id" desc nulls last limit \$1 offset \$2$/);
    assert.deepEqual(l.valeurs, [1000, 2000]);
    refuse(() => analyserRequete([['limit', '-1']], CATALOGUE, 'factures'), 'pagination_refusee');
    refuse(() => analyserRequete([['offset', '1;drop']], CATALOGUE, 'factures'), 'pagination_refusee');
    refuse(() => analyserRequete([['offset', '1000001']], CATALOGUE, 'factures'), 'pagination_refusee'); // offset au-delà du plafond : refusé, jamais ramené en silence
    assert.equal(analyserRequete([['offset', '1000000']], CATALOGUE, 'factures').offset, 1_000_000);
    refuse(() => analyserRequete([['order', 'id.sideways']], CATALOGUE, 'factures'), 'ordre_refuse');
  });
  test('4.3 Prefer: count=exact → COUNT des mêmes filtres ; Content-Range à la manière de PostgREST', () => {
    const a = analyserRequete([['statut', 'eq.a_valider']], CATALOGUE, 'factures');
    assert.deepEqual(sqlCompte('factures', a), { sql: 'select count(*) as total from public."factures" where "statut" = $1', valeurs: ['a_valider'] });
    assert.equal(contentRange(0, 25, 120), '0-24/120');
    assert.equal(contentRange(1000, 3, 1003), '1000-1002/1003');
    assert.equal(contentRange(0, 0, 0), '*/0');
    assert.equal(contentRange(0, 2, null), '0-1/*');
    assert.deepEqual(lirePrefer('count=exact, return=representation,resolution=ignore-duplicates'), { count: 'exact', retour: 'representation', resolution: 'ignore-duplicates' });
    assert.deepEqual(lirePrefer(undefined), { count: null, retour: 'minimal', resolution: null });
  });
  test('4.4 objet unique : Accept application/vnd.pgrst.object+json reconnu', () => {
    assert.equal(veutObjet('application/vnd.pgrst.object+json'), true);
    assert.equal(veutObjet('application/json'), false);
  });
});

describe('5 écritures et fonctions', () => {
  test('5.1 insertion : colonnes connues, JSON passé en texte, tableau Postgres gardé, returning des colonnes demandées', () => {
    const ins = sqlInsertion('factures', { numero: 'F1', donnees: { a: 1 }, etiquettes: ['x', 'y'] }, CATALOGUE, ['id']);
    assert.equal(ins.sql, 'insert into public."factures" ("numero", "donnees", "etiquettes") values ($1, $2, $3) returning "id"');
    assert.deepEqual(ins.valeurs, ['F1', '{"a":1}', ['x', 'y']]);
    refuse(() => sqlInsertion('factures', { espace_id: 'autre' }, CATALOGUE, null), 'colonne_inconnue');
    refuse(() => sqlInsertion('factures', [1], CATALOGUE, null), 'corps_refuse');
  });
  test('5.2 mise à jour : au moins un filtre ; corps non vide', () => {
    const a = analyserRequete([['id', 'eq.u1'], ['statut', 'eq.a_valider'], ['select', 'id']], CATALOGUE, 'factures');
    const m = sqlMiseAJour('factures', { numero: 'F2' }, a, CATALOGUE, ['id']);
    assert.equal(m.sql, 'update public."factures" set "numero" = $1 where "id" = $2 and "statut" = $3 returning "id"');
    assert.deepEqual(m.valeurs, ['F2', 'u1', 'a_valider']);
    refuse(() => sqlMiseAJour('factures', { numero: 'x' }, analyserRequete([], CATALOGUE, 'factures'), CATALOGUE, null), 'filtre_obligatoire');
    refuse(() => sqlMiseAJour('factures', {}, a, CATALOGUE, null), 'corps_refuse');
  });
  test('5.3 rpc : appel nommé, type de chaque argument lu dans le catalogue, forme du résultat (ensemble, ligne, valeur, vide)', () => {
    const t = sqlRpc('demander_ticket_n8n', { p_usage: 'validation' }, CATALOGUE);
    assert.equal(t.sql, 'select public."demander_ticket_n8n"("p_usage" => $1::text) as valeur');
    assert.equal(resultatRpc(t.forme, [{ valeur: 'tk' }]), 'tk');
    const r = sqlRpc('remplacer_lignes_facture', { p_facture: 'u1', p_lignes: [{ q: 1 }], p_qui: 'n8n' }, CATALOGUE);
    assert.match(r.sql, /"p_lignes" => \$2::jsonb/);
    assert.equal(r.valeurs[1], '[{"q":1}]');
    const e = sqlRpc('consommer_ticket_porte', { p_ticket: 't', p_usage: 'validation' }, CATALOGUE);
    assert.equal(e.forme, 'ensemble');
    assert.match(e.sql, /^select \* from public\."consommer_ticket_porte"/);
    assert.deepEqual(resultatRpc('ensemble', [{ a: 1 }]), [{ a: 1 }]);
    assert.deepEqual(resultatRpc(sqlRpc('resume_facture', { p_id: 'u' }, CATALOGUE).forme, [{ n: 1 }]), { n: 1 });
    assert.equal(resultatRpc(sqlRpc('basculer_favori_os', { p_cle: 'x' }, CATALOGUE).forme, [{}]), null);
    assert.equal(sqlRpc('lister_favoris_os', {}, CATALOGUE).sql, 'select * from public."lister_favoris_os"()');
  });
  test('5.4 rpc : fonction inconnue 404, argument inconnu, appel ambigu, corps non objet refusés', () => {
    refuse(() => sqlRpc('pg_sleep', {}, CATALOGUE), 'fonction_inconnue', 404);
    refuse(() => sqlRpc('demander_ticket_n8n', { p_autre: 1 }, CATALOGUE), 'argument_inconnu');
    refuse(() => sqlRpc('double', { p_a: 1 }, CATALOGUE), 'fonction_ambigue');
    refuse(() => sqlRpc('demander_ticket_n8n', [1], CATALOGUE), 'corps_refuse');
  });
});

describe('6 erreurs de la base', () => {
  test('6.1 P0001 → 400 avec message et details (forme PostgREST) ; 23505 → 409 ; 42501 → 403', () => {
    assert.deepEqual(reponseErreur({ code: 'P0001', message: 'Facture déjà décidée', detail: 'facture_deja_decidee' }), { statut: 400, corps: { code: 'P0001', message: 'Facture déjà décidée', details: 'facture_deja_decidee', hint: null } });
    assert.equal(reponseErreur({ code: '23505', message: 'duplicate key value violates unique constraint "x" on host 10.0.0.1' }).statut, 409);
    assert.equal(reponseErreur({ code: '42501' }).statut, 403);
    for (const code of ['42883', '42804', '42703']) {
      const r = reponseErreur({ code, message: 'function x(integer) does not exist' });
      assert.equal(r.statut, 400, code);
      assert.equal(r.corps.message, 'Demande refusée par la base.');
    }
  });
  test('6.2 toute autre erreur : message FIXE, jamais le texte de pg (qui peut citer la base ou l\'hôte)', () => {
    for (const e of [{ code: '22P02', message: 'invalid input syntax for type uuid: "secret"' }, { code: '42P01', message: 'relation "x" does not exist' }, new Error('connect ECONNREFUSED 10.1.2.3:5432')]) {
      const { corps } = reponseErreur(e);
      assert.ok(!JSON.stringify(corps).includes('secret') && !JSON.stringify(corps).includes('10.') && !JSON.stringify(corps).includes('relation'), JSON.stringify(corps));
    }
    assert.equal(reponseErreur({ code: '22P02' }).statut, 400);
    assert.equal(reponseErreur(new Error('x')).statut, 500);
  });
});
