// Lancé dans un processus à part par maison-comptes-de-service.test.js : charge un index.js de fonctions et écrit, pour chaque fonction exportée,
// le compte de service de son manifeste (null : aucun ; « <ResetValue> » : compte par défaut). GCLOUD_PROJECT est donné par l'appelant.
const m = await import(process.argv[2]);
const sortie = {};
for (const nom of Object.keys(m).sort()) {
  const e = m[nom]?.__endpoint;
  if (!e) continue;
  const v = e.serviceAccountEmail;
  sortie[nom] = v === undefined ? null : (typeof v === 'string' ? v : `<${v?.constructor?.name}>`);
}
process.stdout.write(JSON.stringify(sortie));
