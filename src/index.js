// Point d'entrée : vérifie tout à intervalle régulier et sert la page d'état.
import http from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
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
import { chargerArgent, sauverArgent, lireLigne, rappelsARenvoyer, messageRappels } from './argent.js';
import { lireHistoires, synchroniserHistoires } from './histoires.js';
import { deposerFacture, supprimerFacture, lireFacture, appliquerLecture, creerClient, corrigerDepuisFactures, annulerCorrection, marquerOrphelinesARelire, messageCorrections } from './factures.js';
import { pageArgent } from './page-argent.js';
import { chargerServeurs, sauverServeurs, lireReleve, enregistrerReleve } from './serveurs.js';
import { pageServeurs } from './page-serveurs.js';
import { chargerJournal, sauverJournal, ajouterEvenement, synchroniserN8n, messageHier } from './journal.js';
import { pageJournal } from './page-journal.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const fichierConfig = env.CONFIG ?? path.join(racine, 'config/surveillance.json');
const fichierEtat = env.FICHIER_ETAT ?? path.join(racine, 'data/etat.json');
const fichierQuestions = env.QUESTIONS ?? path.join(racine, 'config/questions.json');
const fichierReponses = env.FICHIER_REPONSES ?? path.join(racine, 'data/reponses.json');
const fichierArgent = env.FICHIER_ARGENT ?? path.join(racine, 'data/argent.json');
const fichierArgentDepart = path.join(racine, 'config/argent.json');
const dossierFactures = path.join(path.dirname(fichierEtat), 'factures');
const plafondIa = Number(env.PLAFOND_IA_DOLLARS ?? 10);
const clientClaude = creerClient(env.ANTHROPIC_API_KEY);
const fichierServeurs = env.FICHIER_SERVEURS ?? path.join(racine, 'data/serveurs.json');
const fichierJournal = env.FICHIER_JOURNAL ?? path.join(racine, 'data/journal.json');
const intervalleMinutes = Number(env.INTERVALLE_MINUTES ?? 180);

const config = JSON.parse(await readFile(fichierConfig, 'utf8'));
config.intervalleMinutes = intervalleMinutes;
const configQuestions = JSON.parse(await readFile(fichierQuestions, 'utf8'));
const configArgent = JSON.parse(await readFile(fichierArgentDepart, 'utf8'));
const configServeurs = JSON.parse(await readFile(path.join(racine, 'config/serveurs.json'), 'utf8'));
const configJournal = JSON.parse(await readFile(path.join(racine, 'config/journal.json'), 'utf8'));

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

// Même principe pour les données de l'onglet Argent.
let fileArgent = Promise.resolve();
function avecArgent(fn) {
  const suite = fileArgent.then(async () => {
    const donnees = await chargerArgent(fichierArgent, fichierArgentDepart);
    const resultat = await fn(donnees);
    await sauverArgent(fichierArgent, donnees);
    return resultat;
  });
  fileArgent = suite.catch(() => {});
  return suite;
}

// Lit les factures pas encore lues, une à la fois, en tâche de fond.
let lectureEnCours = null;
function lireFacturesEnAttente() {
  if (!clientClaude) return;
  lectureEnCours ??= (async () => {
    await avecArgent((d) => marquerOrphelinesARelire(d));
    for (;;) {
      const { donnees, facture } = await avecArgent((d) => ({ donnees: structuredClone(d), facture: d.factures?.find((f) => !f.lecture && !f.erreur) }));
      if (!facture) break;
      const resultat = await lireFacture(donnees, dossierFactures, facture, { client: clientClaude, plafondDollars: plafondIa, projets: configArgent.projets });
      const corrections = await avecArgent((d) => {
        appliquerLecture(d, facture.id, resultat);
        return corrigerDepuisFactures(d);
      });
      if (corrections.length) await envoyer(messageCorrections(corrections)).catch((err) => console.error(`Telegram : ${err.message}`));
      if (!resultat.lecture && !resultat.erreur) break;
    }
  })()
    .catch((err) => console.error(`Lecture des factures : ${err.message}`))
    .finally(() => (lectureEnCours = null));
}

// Relevés des VPS : écrits l'un après l'autre.
let fileServeurs = Promise.resolve();
function avecServeurs(fn) {
  const suite = fileServeurs.then(async () => {
    const donnees = await chargerServeurs(fichierServeurs);
    const resultat = await fn(donnees);
    await sauverServeurs(fichierServeurs, donnees);
    return resultat;
  });
  fileServeurs = suite.catch(() => {});
  return suite;
}

// Journal : même principe.
let fileJournal = Promise.resolve();
function avecJournal(fn) {
  const suite = fileJournal.then(async () => {
    const journal = await chargerJournal(fichierJournal);
    const resultat = await fn(journal);
    await sauverJournal(fichierJournal, journal);
    return resultat;
  });
  fileJournal = suite.catch(() => {});
  return suite;
}

// Compte les exécutions n8n de l'heure écoulée pour le journal.
async function synchroniserJournal() {
  try {
    for (const [instance, { url, cle }] of Object.entries(instancesN8n)) {
      try {
        await avecJournal((j) => synchroniserN8n(j, { url, cle, instance }));
      } catch (err) {
        console.error(`Journal n8n (${instance}) : ${err.message}`);
      }
    }
    const histoires = await lireHistoires(dossierHistoires);
    await avecJournal((j) => synchroniserHistoires(j, configJournal, histoires));
  } catch (err) {
    console.error(`Journal : ${err.message}`);
  }
}

// Jeton partagé avec scripts/releve.sh et les automatisations n8n, comparé sans fuite de temps.
const empreinteJeton = (t) => createHash('sha256').update(String(t)).digest();
const jetonReleveValide = (entete) =>
  Boolean(env.RELEVE_JETON) && env.RELEVE_JETON.length >= 20 && timingSafeEqual(empreinteJeton(entete), empreinteJeton(`Bearer ${env.RELEVE_JETON}`));

async function lireTexte(req, limite) {
  let corps = '';
  for await (const morceau of req) {
    corps += morceau;
    if (corps.length > limite) throw Object.assign(new Error('trop long'), { statut: 413 });
  }
  return corps;
}

const lireJson = async (req, limite) => JSON.parse(await lireTexte(req, limite));

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
    if (n === null) return;
    await envoyer(resumeQuotidien(await chargerEtat(fichierEtat), n));
    const hier = await avecJournal((j) => messageHier(j, configJournal));
    if (hier) await envoyer(hier);
    const rappels = await avecArgent((d) => rappelsARenvoyer(d, { joursAvant: configArgent.rappelJoursAvant ?? 3 }));
    if (rappels.length) await envoyer(messageRappels(rappels));
  } catch (err) {
    console.error(`Résumé du matin impossible : ${err.message}`);
  }
}

const envoyer = (texte) => envoyerTelegram(texte, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
// Les n8n de louis : n8n.nourmeet.com (Nūr Meet, Impacteur) et n8n.actualitevideo.fr (VPS YouTube).
const instancesN8n = {
  principal: { url: env.N8N_URL, cle: env.N8N_API_KEY },
  actualite: { url: env.N8N_ACTUALITE_URL || 'https://n8n.actualitevideo.fr', cle: env.N8N_ACTUALITE_API_KEY },
};
// Dossier data/ de Petites histoires vraies, monté en lecture seule (docker-compose.yml).
const dossierHistoires = env.HISTOIRES_DOSSIER || '/sources/histoires';
const options = { n8n: instancesN8n, releve: { fichier: fichierServeurs }, histoires: { dossier: dossierHistoires } };

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
    if (req.method === 'POST' && url.pathname === '/api/releve') {
      const id = url.searchParams.get('serveur');
      if (!jetonReleveValide(req.headers.authorization ?? '')) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Jeton de relevé invalide');
      }
      if (!configServeurs.serveurs.some((s) => s.id === id)) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end(`Serveur inconnu : ${id}`);
      }
      const releve = lireReleve(await lireTexte(req, 2_000_000));
      await avecServeurs((d) => enregistrerReleve(d, id, releve));
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(`Relevé reçu : ${releve.conteneurs.length} conteneur(s), ${releve.disques.length} disque(s)\n`);
    }
    if (req.method === 'POST' && url.pathname === '/api/journal') {
      if (!jetonReleveValide(req.headers.authorization ?? '')) {
        res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Jeton invalide');
      }
      const corps = await lireJson(req, 50_000);
      const liste = Array.isArray(corps) ? corps.slice(0, 100) : [corps];
      const resultats = await avecJournal((j) => liste.map((c) => ajouterEvenement(j, configJournal, c ?? {}, { source: 'n8n' })));
      const erreurs = resultats.filter((r) => r.erreur).map((r) => r.erreur);
      res.writeHead(erreurs.length === liste.length ? 400 : 200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ajoutes: liste.length - erreurs.length, erreurs }));
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
    if (req.method === 'GET' && url.pathname === '/argent') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      const html = await avecArgent((d) => (corrigerDepuisFactures(d), d)).then((d) =>
        pageArgent(configArgent, d, { message: url.searchParams.get('message') ?? undefined, aRepondre, lectureActive: Boolean(clientClaude), plafondIa }),
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (req.method === 'POST' && url.pathname === '/argent/ajouter') {
      const champs = await lireCorps(req);
      const message = await avecArgent((d) => {
        const { ligne, erreur } = lireLigne(champs, configArgent.projets);
        if (erreur) return erreur;
        d.lignes.push(ligne);
        const f = d.factures?.find((x) => x.id === champs.facture);
        if (f?.lecture) f.lecture.ligne = ligne.id;
        return `« ${ligne.libelle} » ajouté`;
      });
      res.writeHead(303, { location: `/argent?message=${encodeURIComponent(message)}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/argent/supprimer') {
      const { id } = await lireCorps(req, 4_000);
      await avecArgent((d) => {
        d.lignes = d.lignes.filter((l) => l.id !== id);
        for (const f of d.factures ?? []) if (f.lecture?.ligne === id) f.lecture.ligne = '';
      });
      res.writeHead(303, { location: '/argent?message=' + encodeURIComponent('Dépense retirée') });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/argent/factures') {
      const fichier = await lireJson(req, 15_000_000);
      const { erreur } = await avecArgent((d) => deposerFacture(d, dossierFactures, fichier));
      if (erreur) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end(erreur);
      }
      lireFacturesEnAttente();
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/argent/factures/supprimer') {
      const { id } = await lireCorps(req, 4_000);
      await avecArgent((d) => supprimerFacture(d, dossierFactures, id));
      res.writeHead(303, { location: '/argent?message=' + encodeURIComponent('Facture supprimée') });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/argent/corrections/annuler') {
      const { id } = await lireCorps(req, 4_000);
      const ok = await avecArgent((d) => annulerCorrection(d, id));
      res.writeHead(303, { location: '/argent?message=' + encodeURIComponent(ok ? 'Correction annulée' : 'Correction introuvable') });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/argent/factures/relire') {
      const { id } = await lireCorps(req, 4_000);
      await avecArgent((d) => appliquerLecture(d, id, { lecture: null, erreur: null, cout: 0 }));
      lireFacturesEnAttente();
      res.writeHead(303, { location: '/argent?message=' + encodeURIComponent('Nouvelle lecture en cours') });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/journal') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      const projet = configJournal.projets.some((p) => p.id === url.searchParams.get('projet')) ? url.searchParams.get('projet') : null;
      const jours = url.searchParams.get('jours') === '30' ? 30 : 7;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageJournal(configJournal, await chargerJournal(fichierJournal), { projet, jours, aRepondre, message: url.searchParams.get('message') ?? undefined }));
    }
    if (req.method === 'POST' && url.pathname === '/journal') {
      const champs = await lireCorps(req);
      const { erreur } = await avecJournal((j) => ajouterEvenement(j, configJournal, champs, { source: 'page' }));
      res.writeHead(303, { location: `/journal?message=${encodeURIComponent(erreur ?? 'Note ajoutée')}` });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/journal') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerJournal(fichierJournal)));
    }
    if (req.method === 'GET' && url.pathname === '/serveurs') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageServeurs(configServeurs, await chargerServeurs(fichierServeurs), { aRepondre }));
    }
    if (req.method === 'GET' && url.pathname === '/api/serveurs') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerServeurs(fichierServeurs)));
    }
    if (req.method === 'GET' && url.pathname === '/api/argent') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerArgent(fichierArgent, fichierArgentDepart)));
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
    if (err.statut === 413) {
      res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Fichier trop lourd (10 Mo au plus).');
    }
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
lireFacturesEnAttente();
synchroniserJournal();
setInterval(synchroniserJournal, 60 * 60_000);
setInterval(verifier, intervalleMinutes * 60_000);
rappelDuMatin();
setInterval(rappelDuMatin, 10 * 60_000);
