// Version du serveur MCP : celle de functions/package.json (une seule source).
import { readFileSync } from 'node:fs';

export const { version: VERSION_SERVEUR } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
