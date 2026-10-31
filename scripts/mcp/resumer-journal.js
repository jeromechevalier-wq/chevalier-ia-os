// Résumé de la lenteur du serveur MCP à partir des journaux (aucune connexion, aucune donnée de client : seulement des durées).
// Mode d'emploi :
//   gcloud logging read 'resource.labels.service_name="mcpclients" AND jsonPayload.message="mcp"' \
//     --project=chevalier-ia-app --freshness=7d --limit=5000 --format=json | node scripts/mcp/resumer-journal.js
// (chez Jérôme : projet chevalier-ia-os et le service du MCP de Jérôme). La sortie est un tableau texte par outil :
// n, médiane et p90 de dureeMs (total) et de dureeOutilMs, moyenne des lectures, part de démarrages à froid ;
// puis, sur TOUTES les lignes (le démarrage à froid tombe souvent sur initialize ou tools/list, sans outil) : nombre de démarrages à froid,
// médiane de demarrageMs et de dureeMs de ces lignes, et la médiane de dureeAuthMs (outils seulement). Attention : dureeAuthMs chez les clients
// inclut la lecture des réglages de l'espace, pas chez Jérôme. Accepte aussi une liste de lignes déjà décodées (jsonPayload ou ligne brute).
import { fileURLToPath } from 'node:url';

const nombres = (v) => v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
/** Quantile « rang le plus proche » sur une liste triée ; null si vide. */
export function quantile(tries, q) {
  if (!tries.length) return null;
  return tries[Math.min(tries.length - 1, Math.max(0, Math.ceil(q * tries.length) - 1))];
}
const moyenne = (v) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
const charge = (l) => (l && typeof l.jsonPayload === 'object' && l.jsonPayload ? l.jsonPayload : l);

/** Lignes de journal -> { parOutil: [{ outil, n, medianeMs, p90Ms, medianeOutilMs, p90OutilMs, lecturesMoyennes, partFroid }], medianeAuthMs }. Les lignes sans `outil` sont ignorées. */
export function resumer(lignes) {
  const groupes = new Map();
  const auth = [];
  const froids = [];
  for (const brute of lignes ?? []) {
    const l = charge(brute);
    if (l && l.froid === true) froids.push(l);
    if (!l || typeof l.outil !== 'string') continue;
    if (!groupes.has(l.outil)) groupes.set(l.outil, []);
    groupes.get(l.outil).push(l);
    if (Number.isFinite(l.dureeAuthMs)) auth.push(l.dureeAuthMs);
  }
  const parOutil = [...groupes.entries()].map(([outil, ls]) => {
    const total = nombres(ls.map((l) => l.dureeMs));
    const outilMs = nombres(ls.map((l) => l.dureeOutilMs));
    return {
      outil, n: ls.length,
      medianeMs: quantile(total, 0.5), p90Ms: quantile(total, 0.9),
      medianeOutilMs: quantile(outilMs, 0.5), p90OutilMs: quantile(outilMs, 0.9),
      lecturesMoyennes: moyenne(nombres(ls.map((l) => l.lectures))),
      partFroid: ls.filter((l) => l.froid === true).length / ls.length,
    };
  }).sort((a, b) => b.n - a.n || a.outil.localeCompare(b.outil));
  return {
    parOutil, medianeAuthMs: quantile(nombres(auth), 0.5),
    froid: { n: froids.length, medianeDemarrageMs: quantile(nombres(froids.map((l) => l.demarrageMs)), 0.5), medianeDureeMs: quantile(nombres(froids.map((l) => l.dureeMs)), 0.5) },
  };
}

const cellule = (v) => (v === null || v === undefined ? '-' : String(v));
/** Tableau texte du résumé. */
export function formater({ parOutil, medianeAuthMs, froid }) {
  const tete = ['outil', 'n', 'med total', 'p90 total', 'med outil', 'p90 outil', 'lectures', 'froid %'];
  const lignes = parOutil.map((o) => [o.outil, o.n, o.medianeMs, o.p90Ms, o.medianeOutilMs, o.p90OutilMs, o.lecturesMoyennes, Math.round(o.partFroid * 100)].map(cellule));
  const largeurs = tete.map((t, i) => Math.max(t.length, ...lignes.map((l) => l[i].length)));
  const ligne = (c) => c.map((x, i) => x.padEnd(largeurs[i])).join('  ').trimEnd();
  return [ligne(tete), ...lignes.map(ligne), '', `médiane dureeAuthMs (appels d'outil) : ${cellule(medianeAuthMs)}`,
    `démarrages à froid : ${froid.n} (médiane demarrageMs ${cellule(froid.medianeDemarrageMs)}, médiane dureeMs de ces requêtes ${cellule(froid.medianeDureeMs)})`].join('\n');
}

async function main() {
  const morceaux = [];
  for await (const m of process.stdin) morceaux.push(m);
  const texte = Buffer.concat(morceaux).toString('utf8').trim();
  const lignes = texte ? JSON.parse(texte) : [];
  process.stdout.write(`${formater(resumer(Array.isArray(lignes) ? lignes : [lignes]))}\n`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
