// Fabrique une facture d'essai en PDF, réaliste et cohérente, pour essayer le dépôt de factures (« + Facture », n8n, lecture IA).
// Demandé par Jérôme le 28/11/2026 : « valide, avec un IBAN valide, avec un fournisseur connu, une nouvelle date et un nouveau montant
// à chaque fois, facile en 2 clics ».
//
//   node scripts/facture-essai.js                     une facture du jour, montant tiré au hasard, rangée HORS du dépôt
//   node scripts/facture-essai.js --sortie <dossier>  ailleurs (par défaut ~/Code-Chevalier-IA/factures-essai)
//   node scripts/facture-essai.js --client "<nom>"   nom du client écrit sur la facture (par défaut « Client d'essai » ; jamais un nom de client dans ce fichier)
//
// Le fournisseur est TOUJOURS le même (fictif, mais SIRET, n° de TVA et IBAN aux clés justes) : la 1re facture le fait connaître
// dans la base, les suivantes tombent sur un fournisseur connu. Aucune donnée de client ici (dépôt public).
// Chaque passage : date du jour, numéro unique (date + heure), 2 à 4 lignes et un total différents (jamais un doublon).
// Le PDF est fabriqué par Chrome sans fenêtre (installé sur le Mac) à partir d'une page HTML ; rien n'est envoyé nulle part.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Clé de Luhn (SIREN, SIRET). */
export function luhnValide(chiffres) {
  let somme = 0;
  [...chiffres].reverse().forEach((c, i) => { let n = Number(c); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } somme += n; });
  return somme % 10 === 0;
}
/** Complète un préfixe de chiffres avec le dernier chiffre qui rend le nombre valide selon Luhn. */
export function completerLuhn(prefixe) {
  for (let d = 0; d <= 9; d++) if (luhnValide(prefixe + d)) return prefixe + d;
  throw new Error('impossible');
}
/** Reste modulo 97 d'un grand nombre écrit en chiffres. */
const mod97 = (s) => [...s].reduce((r, c) => (r * 10 + Number(c)) % 97, 0);
/** Clé RIB française (banque 5, guichet 5, compte 11 chiffres). */
export const cleRib = (banque, guichet, compte) => String(97 - mod97(`${banque}${guichet}${compte}00`)).padStart(2, '0');
/** IBAN français complet à partir du RIB. */
export function ibanFrancais(banque, guichet, compte) {
  const bban = `${banque}${guichet}${compte}${cleRib(banque, guichet, compte)}`;
  const cle = String(98 - mod97(`${bban}152700`)).padStart(2, '0'); // F=15, R=27, puis « 00 »
  return `FR${cle}${bban}`;
}
/** Vrai si l'IBAN a une clé juste (norme ISO 13616). */
export function ibanValide(iban) {
  const s = iban.replace(/\s/g, '').toUpperCase();
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  return mod97(r) === 1;
}
/** N° de TVA intracommunautaire français à partir du SIREN. */
export const tvaIntracom = (siren) => `FR${String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, '0')}${siren}`;

// SIREN commençant par 0 : absent de l'annuaire officiel (vérifié le 28/11/2026) ; le contrôle « annuaire » sera rouge, c'est attendu.
// Le 912345675 d'abord choisi était celui d'une vraie entreprise (relecture Fable).
const SIREN = completerLuhn('01234567');
export const FOURNISSEUR = Object.freeze({
  nom: 'Matériaux Essai Provence SARL',
  adresse: ['12 avenue des Essais', '04100 Manosque'],
  siren: SIREN,
  siret: completerLuhn(`${SIREN}0001`),
  tva: tvaIntracom(SIREN),
  // IBAN d'exemple publié partout (documentation des banques), aux clés justes : jamais un vrai compte.
  iban: 'FR7630006000011234567890189',
  bic: 'AGRIFRPPXXX',
});

const ARTICLES = [
  ['Sac de ciment 35 kg', 'sac', 9.8], ['Plaque de plâtre BA13', 'plaque', 7.9], ['Rouleau de laine de verre 100 mm', 'rouleau', 32.5],
  ['Tube PVC 100 mm (3 m)', 'tube', 14.2], ['Cartouche de mastic acrylique', 'cartouche', 4.6], ['Parpaing creux 20x20x50', 'u', 1.85],
  ['Sable 0/4 (big bag)', 'm3', 58], ['Palette de briques', 'palette', 245], ['Seau d\'enduit 25 kg', 'seau', 27.4], ['Câble R2V 3G2,5 (100 m)', 'rouleau', 89],
];
const euros = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const arrondi = (n) => Math.round(n * 100) / 100;
const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Lignes et totaux d'une facture ; `hasard` remplaçable dans les tests. */
export function composerFacture(maintenant = new Date(), hasard = Math.random) {
  const choix = [...ARTICLES].sort(() => hasard() - 0.5).slice(0, 2 + Math.floor(hasard() * 3));
  const lignes = choix.map(([libelle, unite, pu]) => {
    const qte = 1 + Math.floor(hasard() * 12);
    const prix = arrondi(pu * (0.9 + hasard() * 0.2));
    return { libelle, unite, qte, pu: prix, total: arrondi(qte * prix) };
  });
  const ht = arrondi(lignes.reduce((s, l) => s + l.total, 0));
  const tva = arrondi(ht * 0.2);
  const p = (n) => String(n).padStart(2, '0');
  const jour = `${p(maintenant.getDate())}/${p(maintenant.getMonth() + 1)}/${maintenant.getFullYear()}`;
  const echeance = new Date(maintenant.getTime() + 30 * 86400000);
  return {
    numero: `FE-${maintenant.getFullYear()}${p(maintenant.getMonth() + 1)}${p(maintenant.getDate())}-${p(maintenant.getHours())}${p(maintenant.getMinutes())}${p(maintenant.getSeconds())}-${String(Math.floor(hasard() * 1000)).padStart(3, '0')}`,
    date: jour, echeance: `${p(echeance.getDate())}/${p(echeance.getMonth() + 1)}/${echeance.getFullYear()}`,
    lignes, ht, tva, ttc: arrondi(ht + tva),
  };
}

export function htmlFacture(f, four = FOURNISSEUR, client = 'Client d\'essai') {
  const lignes = f.lignes.map((l) => `<tr><td>${echapper(l.libelle)}</td><td class="n">${l.qte}</td><td>${echapper(l.unite)}</td><td class="n">${euros(l.pu)}</td><td class="n">${euros(l.total)}</td></tr>`).join('');
  const ibanLisible = four.iban.replace(/(.{4})/g, '$1 ').trim();
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><style>
body{font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#222;margin:40px}h1{font-size:22px;margin:0 0 4px}
.entete{display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}.n{text-align:right}.totaux{margin-left:auto;width:260px;margin-top:12px}
.totaux td{border:none;padding:3px 6px}.pied{margin-top:40px;font-size:10px;color:#666}</style>
<div class="entete"><div><h1>${echapper(four.nom)}</h1>${four.adresse.map(echapper).join('<br>')}<br>SIRET : ${four.siret}<br>N° TVA : ${four.tva}</div>
<div><h1>FACTURE</h1>N° ${f.numero}<br>Date : ${f.date}<br>Échéance : ${f.echeance}</div></div>
<p style="margin-top:24px"><b>Client :</b> ${echapper(client)}</p>
<table><tr><th>Désignation</th><th class="n">Qté</th><th>Unité</th><th class="n">PU HT</th><th class="n">Total HT</th></tr>${lignes}</table>
<table class="totaux"><tr><td>Total HT</td><td class="n">${euros(f.ht)}</td></tr><tr><td>TVA 20 %</td><td class="n">${euros(f.tva)}</td></tr>
<tr><td><b>Total TTC</b></td><td class="n"><b>${euros(f.ttc)}</b></td></tr></table>
<p><b>Règlement par virement</b> — IBAN : ${ibanLisible} — BIC : ${four.bic}</p>
<p class="pied">Document d'essai fabriqué par Chevalier IA OS (fournisseur fictif) : ne pas payer.</p></html>`;
}

/** Arguments : --sortie <dossier>, --client <nom> ; tout le reste est refusé. */
export function lireArguments(args) {
  const r = { sortie: join(homedir(), 'Code-Chevalier-IA', 'factures-essai'), client: 'Client d\'essai' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sortie' || a === '--client') {
      const v = args[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} demande une valeur`);
      r[a.slice(2)] = a === '--sortie' ? resolve(v) : v;
    } else throw new Error(`argument inconnu : ${a} (permis : --sortie <dossier>, --client <nom>)`);
  }
  return r;
}

function principal() {
  const a = lireArguments(process.argv.slice(2));
  const f = composerFacture();
  mkdirSync(a.sortie, { recursive: true });
  const pdf = join(a.sortie, `facture-essai-${f.numero}.pdf`);
  if (existsSync(pdf)) throw new Error('ce fichier existe déjà : relance la commande');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error('Chrome introuvable : il sert à fabriquer le PDF');
  const html = join(tmpdir(), `facture-essai-${process.pid}-${Date.now()}.html`);
  try {
    writeFileSync(html, htmlFacture(f, FOURNISSEUR, a.client));
    execFileSync(chrome, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: 'ignore' });
  } finally { rmSync(html, { force: true }); }
  if (!existsSync(pdf)) throw new Error('le PDF n\'a pas été fabriqué');
  console.log(`Facture ${f.numero} du ${f.date} : ${f.lignes.length} ligne(s), ${euros(f.ttc)} TTC.`);
  console.log(pdf);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { principal(); } catch (e) { console.error(`Refusé : ${e.message}`); process.exit(1); }
}
