// Petit serveur statique pour les tests (sert la racine du dépôt sur http://localhost:5050).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.PORT || 5050);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    const fichier = normalize(join(RACINE, chemin));
    if (!fichier.startsWith(RACINE) || /\/(tests|docs|ressources|node_modules)\//.test(fichier.slice(RACINE.length - 1))) {
      res.writeHead(404).end();
      return;
    }
    await stat(fichier);
    const contenu = await readFile(fichier);
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenu);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Introuvable');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Serveur de test sur http://localhost:${PORT}`));
