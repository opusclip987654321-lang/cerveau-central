// Point d'entrée : vérifie tout à intervalle régulier et sert la page d'état.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toutVerifier } from './verifier.js';
import { chargerEtat } from './etat.js';
import { envoyerTelegram } from './telegram.js';
import { pageEtat } from './page.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const fichierConfig = env.CONFIG ?? path.join(racine, 'config/surveillance.json');
const fichierEtat = env.FICHIER_ETAT ?? path.join(racine, 'data/etat.json');
const intervalleMinutes = Number(env.INTERVALLE_MINUTES ?? 15);

const config = JSON.parse(await readFile(fichierConfig, 'utf8'));
config.intervalleMinutes = intervalleMinutes;

const envoyer = (texte) => envoyerTelegram(texte, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
const options = { n8n: { url: env.N8N_URL, cle: env.N8N_API_KEY } };

let enCours = null;
function verifier() {
  enCours ??= toutVerifier({ config, fichierEtat, envoyer, options })
    .then(({ messages }) => console.log(`${new Date().toISOString()} vérification terminée, ${messages.length} alerte(s)`))
    .catch((err) => console.error(`Vérification échouée : ${err.stack}`))
    .finally(() => (enCours = null));
  return enCours;
}

if (process.argv.includes('--une-fois')) {
  await verifier();
  const etat = await chargerEtat(fichierEtat);
  for (const v of Object.values(etat.verifications)) console.log(`${v.etat.padEnd(9)} ${v.projet.padEnd(10)} ${v.nom} : ${v.detail}`);
  process.exit(0);
}

const serveur = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageEtat(config, await chargerEtat(fichierEtat)));
    }
    if (req.method === 'GET' && req.url === '/api/etat') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerEtat(fichierEtat)));
    }
    if (req.method === 'POST' && req.url === '/api/verifier') {
      await verifier();
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/sante') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Page introuvable');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Erreur interne');
  }
});

const hote = env.HOTE ?? '127.0.0.1';
const port = Number(env.PORT ?? 8090);
serveur.listen(port, hote, () => console.log(`Cerveau central : page d'état sur http://${hote}:${port}`));

verifier();
setInterval(verifier, intervalleMinutes * 60_000);
