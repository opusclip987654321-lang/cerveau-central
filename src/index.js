// Point d'entrée : vérifie tout à intervalle régulier et sert la page d'état.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { toutVerifier } from './verifier.js';
import { chargerEtat } from './etat.js';
import { envoyerTelegram } from './telegram.js';
import { pageEtat } from './page.js';
import { resumeQuotidien } from './resume.js';
import { creerAcces, lireCookie, pageConnexion } from './acces.js';
import { pageQuestions } from './page-questions.js';
import { chargerReponses, sauverReponses, enAttente, enregistrerReponses, matinARappeler } from './questions.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const fichierConfig = env.CONFIG ?? path.join(racine, 'config/surveillance.json');
const fichierEtat = env.FICHIER_ETAT ?? path.join(racine, 'data/etat.json');
const fichierQuestions = env.QUESTIONS ?? path.join(racine, 'config/questions.json');
const fichierReponses = env.FICHIER_REPONSES ?? path.join(racine, 'data/reponses.json');
const intervalleMinutes = Number(env.INTERVALLE_MINUTES ?? 180);

const config = JSON.parse(await readFile(fichierConfig, 'utf8'));
config.intervalleMinutes = intervalleMinutes;
const configQuestions = JSON.parse(await readFile(fichierQuestions, 'utf8'));

// Les réponses sont lues et écrites l'une après l'autre, jamais en même temps.
let file = Promise.resolve();
function avecReponses(fn) {
  const suite = file.then(async () => {
    const historique = await chargerReponses(fichierReponses);
    const resultat = await fn(historique);
    await sauverReponses(fichierReponses, historique);
    return resultat;
  });
  file = suite.catch(() => {});
  return suite;
}

async function lireCorps(req, limite = 64_000) {
  let corps = '';
  for await (const morceau of req) {
    corps += morceau;
    if (corps.length > limite) throw new Error('trop long');
  }
  return Object.fromEntries(new URLSearchParams(corps));
}

async function rappelDuMatin() {
  try {
    const n = await avecReponses((h) => matinARappeler(configQuestions, h, { heure: Number(env.RESUME_HEURE ?? env.QUESTIONS_HEURE ?? 9) }));
    if (n !== null) await envoyer(resumeQuotidien(await chargerEtat(fichierEtat), n));
  } catch (err) {
    console.error(`Résumé du matin impossible : ${err.message}`);
  }
}

const envoyer = (texte) => envoyerTelegram(texte, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
const options = { n8n: { url: env.N8N_URL, cle: env.N8N_API_KEY } };

// Secret qui signe les sessions, créé au premier démarrage et gardé dans data/.
const fichierSecret = path.join(path.dirname(fichierEtat), 'secret');
let secret;
try {
  secret = (await readFile(fichierSecret, 'utf8')).trim();
} catch {
  secret = randomBytes(32).toString('hex');
  await mkdir(path.dirname(fichierSecret), { recursive: true });
  await writeFile(fichierSecret, secret, { mode: 0o600 });
}
const acces = creerAcces({ empreinteMotDePasse: env.MOT_DE_PASSE_EMPREINTE, secret });
const COOKIE = 'cerveau';

// Adresse du visiteur : celle donnée par Caddy quand la demande passe par lui.
function adresse(req) {
  const directe = req.socket.remoteAddress ?? '';
  const viaProxy = /^(127\.|::1|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:(10|172|192)\.)/.test(directe);
  return (viaProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || directe;
}

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
    const url = new URL(req.url, 'http://local');
    if (req.method === 'GET' && url.pathname === '/sante') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    if (acces.actif) {
      if (req.method === 'POST' && url.pathname === '/connexion') {
        const { motDePasse } = await lireCorps(req, 4_000);
        const resultat = acces.essayer(adresse(req), motDePasse);
        if (resultat !== 'ok') {
          console.warn(`${new Date().toISOString()} connexion refusée depuis ${adresse(req)} (${resultat})`);
          res.writeHead(resultat === 'bloque' ? 429 : 401, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(pageConnexion(resultat === 'bloque' ? 'Trop d’essais. Réessaie dans 15 minutes.' : 'Mot de passe incorrect.'));
        }
        const securise = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=${acces.jeton()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${securise}` });
        return res.end();
      }
      if (url.pathname === '/deconnexion') {
        res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
        return res.end();
      }
      if (!acces.jetonValide(lireCookie(req, COOKIE))) {
        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(pageConnexion());
        }
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Connexion nécessaire');
      }
    }
    if (req.method === 'GET' && url.pathname === '/') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageEtat(config, await chargerEtat(fichierEtat), aRepondre));
    }
    if (req.method === 'GET' && url.pathname === '/questions') {
      const n = url.searchParams.get('enregistre');
      const message = n === null ? undefined : `${n} réponse(s) enregistrée(s)`;
      const html = await avecReponses((h) => pageQuestions(configQuestions, h, { message }));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (req.method === 'POST' && url.pathname === '/questions') {
      const champs = await lireCorps(req);
      const n = await avecReponses((h) => enregistrerReponses(configQuestions, h, champs));
      res.writeHead(303, { location: `/questions?enregistre=${n}` });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/reponses') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerReponses(fichierReponses)));
    }
    if (req.method === 'GET' && url.pathname === '/api/etat') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerEtat(fichierEtat)));
    }
    if (req.method === 'POST' && url.pathname === '/api/verifier') {
      await verifier();
      res.writeHead(204);
      return res.end();
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
serveur.listen(port, hote, () =>
  console.log(`Cerveau central : page d'état sur http://${hote}:${port} (${acces.actif ? 'protégée par mot de passe' : 'sans mot de passe : à ouvrir seulement par tunnel SSH'})`),
);

verifier();
setInterval(verifier, intervalleMinutes * 60_000);
rappelDuMatin();
setInterval(rappelDuMatin, 10 * 60_000);
