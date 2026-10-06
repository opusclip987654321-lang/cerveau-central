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
import { pageActions } from './page-actions.js';
import { chargerPauses, sauverPauses, pauserProjet, reprendreProjet, alertesCoupees, HORS_N8N, SURVEILLANCE } from './pauses.js';
import { repondre, CONSIGNE_ACTION } from './discussion.js';
import { chargerActions, sauverActions, synchroniserActions, changerStatutAction, enregistrerEchange, dossierPourClaude, ouvrirAction, ajouterEchangeAction, cleProbleme } from './actions.js';
import { pageAction } from './page-action.js';
import { contexteCerveau } from './contexte.js';
import { synchroniserYoutube, synchroniserRevenus, urlAutorisation, echangerCode } from './youtube.js';
import { gabarit } from './page.js';
import { synchroniserStripe } from './stripe.js';
import { synchroniserCambodge } from './cambodge.js';
import { chargerFonctionnement } from './fonctionnement.js';
import { pageFonctionnement } from './page-fonctionnement.js';
import { chargerIdees, sauverIdees, ajouterIdee, changerStatutIdee } from './idees.js';
import { chargerSuivi, sauverSuivi, changerSuivi } from './suivi.js';
import { chargerTri, sauverTri, decider } from './tri-mails.js';
import { chargerVerifs, sauverVerifs, choisirVerif, CHOIX_VERIF } from './verifs-impacteur.js';
import { chargerBilans, sauverBilans, bilanAFaire, genererBilan, lundiDe } from './bilan.js';
import { pageAnalyses } from './page-analyses.js';
import { pageProjet } from './page-projet.js';
import { depenseIaDuMois } from './factures.js';
import { synchroniserLeviaro } from './leviaro.js';
import { chargerBusiness, sauverBusiness, synchroniserProspection, synchroniserImpacteur, tableauDeBord, messageSilences, validerObjectif } from './business.js';
import { dossiersCode, listerCode, lireCode } from './code-source.js';

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
const fichierPauses = path.join(path.dirname(fichierEtat), 'pauses.json');
// data/discussion.json (l'ancien chat global) est gardé sur le disque mais n'est plus affiché.
const fichierActions = path.join(path.dirname(fichierEtat), 'actions.json');
const fichierBusiness = path.join(path.dirname(fichierEtat), 'business.json');
const fichierIdees = path.join(path.dirname(fichierEtat), 'idees.json');
const fichierSuivi = path.join(path.dirname(fichierEtat), 'suivi-reponses.json');
const fichierTri = path.join(path.dirname(fichierEtat), 'tri-mails.json');
const fichierVerifs = path.join(path.dirname(fichierEtat), 'verifs-impacteur.json');
const fichierBilans = path.join(path.dirname(fichierEtat), 'bilans.json');
const plafondBilans = Number(env.PLAFOND_BILAN_DOLLARS ?? 10);

const config = JSON.parse(await readFile(fichierConfig, 'utf8'));
config.intervalleMinutes = intervalleMinutes;
const configQuestions = JSON.parse(await readFile(fichierQuestions, 'utf8'));
const configArgent = JSON.parse(await readFile(fichierArgentDepart, 'utf8'));
const configServeurs = JSON.parse(await readFile(path.join(racine, 'config/serveurs.json'), 'utf8'));
const configJournal = JSON.parse(await readFile(path.join(racine, 'config/journal.json'), 'utf8'));
const configYoutube = JSON.parse(await readFile(path.join(racine, 'config/youtube.json'), 'utf8'));
const guidesFonctionnement = await chargerFonctionnement(path.join(racine, 'config/fonctionnement'));

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

// Lecture / écriture d'un fichier de data/, une opération à la fois.
function fileDAttente(charger, sauver, fichier) {
  let queue = Promise.resolve();
  return (fn) => {
    const suite = queue.then(async () => {
      const donnees = await charger(fichier);
      const resultat = await fn(donnees);
      await sauver(fichier, donnees);
      return resultat;
    });
    queue = suite.catch(() => {});
    return suite;
  };
}
const avecPauses = fileDAttente(chargerPauses, sauverPauses, fichierPauses);
const avecActions = fileDAttente(chargerActions, sauverActions, fichierActions);
const avecTri = fileDAttente(chargerTri, sauverTri, fichierTri);
const avecVerifs = fileDAttente(chargerVerifs, sauverVerifs, fichierVerifs);
const avecBusiness = fileDAttente(chargerBusiness, sauverBusiness, fichierBusiness);
const avecIdees = fileDAttente(chargerIdees, sauverIdees, fichierIdees);
const avecSuivi = fileDAttente(chargerSuivi, sauverSuivi, fichierSuivi);
const avecBilans = fileDAttente(chargerBilans, sauverBilans, fichierBilans);

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
    // Tableau de bord : la prospection Nūr Meet (tableaux de données du n8n principal).
    try {
      await avecBusiness((b) => synchroniserProspection(b, instancesN8n.principal ?? {}));
    } catch (err) {
      console.error(`Tableau de bord (prospection) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserLeviaro(b, dossierLeviaro));
    } catch (err) {
      console.error(`Tableau de bord (Leviaro) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserImpacteur(b, { url: instancesN8n.principal?.url, jeton: env.RELEVE_JETON }));
    } catch (err) {
      console.error(`Tableau de bord (Impacteur) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserYoutube(b, { cle: env.YOUTUBE_API_KEY, chaines: configYoutube.chaines }));
    } catch (err) {
      console.error(`Tableau de bord (YouTube) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserRevenus(b, { clientId: env.YT_OAUTH_CLIENT_ID, clientSecret: env.YT_OAUTH_CLIENT_SECRET, refresh: env.YT_OAUTH_REFRESH }));
    } catch (err) {
      console.error(`Tableau de bord (revenus YouTube) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserStripe(b, { cle: env.STRIPE_CLE }));
    } catch (err) {
      console.error(`Tableau de bord (Stripe) : ${err.message}`);
    }
    try {
      await avecBusiness((b) => synchroniserCambodge(b, { url: instancesN8n.principal?.url, jeton: env.RELEVE_JETON }));
    } catch (err) {
      console.error(`Tableau de bord (Cambodge) : ${err.message}`);
    }
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

// Comme lireCorps, mais garde les champs répétés (cases à cocher d'un lot).
async function lireCorpsMulti(req, limite = 64_000) {
  let corps = '';
  for await (const morceau of req) {
    corps += morceau;
    if (corps.length > limite) throw new Error('trop long');
  }
  return new URLSearchParams(corps);
}

async function rappelDuMatin() {
  try {
    const n = await avecReponses((h) => matinARappeler(configQuestions, h, { heure: Number(env.RESUME_HEURE ?? env.QUESTIONS_HEURE ?? 9) }));
    if (n === null) return;
    await envoyer(resumeQuotidien(await chargerEtat(fichierEtat), n));
    const hier = await avecJournal((j) => messageHier(j, configJournal));
    if (hier) await envoyer(hier);
    const silences = messageSilences(
      tableauDeBord({ business: await chargerBusiness(fichierBusiness), journal: await chargerJournal(fichierJournal), configJournal, pauses: await chargerPauses(fichierPauses) }),
    );
    if (silences) await envoyer(silences);
    const rappels = await avecArgent((d) => rappelsARenvoyer(d, { joursAvant: configArgent.rappelJoursAvant ?? 3 }));
    if (rappels.length) await envoyer(messageRappels(rappels));
  } catch (err) {
    console.error(`Résumé du matin impossible : ${err.message}`);
  }
}

const envoyer = (texte) => envoyerTelegram(texte, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });

// Écrit (ou réécrit) le bilan de la semaine `semaine` : utilisé par le rendez-vous
// du lundi et par le bouton « Refaire le bilan » de la page Analyses.
async function ecrireBilan(semaine) {
  const contexte = contexteCerveau({
    etat: await chargerEtat(fichierEtat),
    argent: await chargerArgent(fichierArgent, fichierArgentDepart),
    journal: await chargerJournal(fichierJournal),
    serveurs: await chargerServeurs(fichierServeurs),
    configServeurs,
    configJournal,
    pauses: await chargerPauses(fichierPauses),
    business: await chargerBusiness(fichierBusiness),
    reponses: await chargerReponses(fichierReponses),
  });
  const entree = await avecBilans((d) => {
    d.bilans = d.bilans.filter((b) => b.semaine !== semaine);
    return genererBilan(d, { client: clientClaude, contexte, semaine, plafondDollars: plafondBilans });
  });
  // Chaque fiche du bilan ouvre (ou retrouve) son action : le bouton « Ouvrir
  // l'action » de la page Analyses mène à la fiche où louis décide.
  if (entree.fiches?.length) {
    const nomB = (id) => configJournal.projets.find((p) => p.id === id)?.nom ?? id;
    const ids = await avecActions((d) =>
      entree.fiches.map((f) => {
        const action = ouvrirAction(d, {
          cle: cleProbleme(`analyse:${f.projet ?? 'cerveau'}`, f.constat),
          projet: f.projet ? nomB(f.projet) : '',
          titre: f.constat,
          constat: f.constat,
          consequence: f.consequence || null,
          source: { type: 'analyse', semaine },
        });
        if (f.proposition) ajouterEchangeAction(action, 'cerveau', `Proposition du bilan du ${semaine} : ${f.proposition}`);
        if (action.statut === 'a_analyser') action.statut = 'proposition_a_valider';
        return action.id;
      }),
    );
    entree.fiches.forEach((f, i) => { f.action = ids[i]; });
    await avecBilans((d) => {
      const b = d.bilans.find((x) => x.cree === entree.cree);
      if (b) b.fiches = entree.fiches;
    });
  }
  return entree;
}

// Le bilan du lundi : vérifié toutes les 10 minutes, écrit une fois par semaine.
async function bilanDuLundi() {
  if (!clientClaude) return;
  try {
    const semaine = bilanAFaire(await chargerBilans(fichierBilans), { heure: Number(env.BILAN_HEURE ?? 8) });
    if (!semaine) return;
    const entree = await ecrireBilan(semaine);
    const resume = entree.fiches?.length
      ? entree.fiches.map((f) => `• ${f.constat}\n→ ${f.proposition || f.consequence}`).join('\n')
      : entree.texte;
    await envoyer(
      resume
        ? `📊 <b>Bilan du lundi</b>\n${resume.slice(0, 3500)}\n\nLe détail et les décisions sont dans l’onglet Analyses du cerveau.`
        : `📊 Bilan du lundi : ${entree.erreur}`,
    );
  } catch (err) {
    console.error(`Bilan du lundi impossible : ${err.message}`);
  }
}
// Les n8n de louis : n8n.nourmeet.com (Nūr Meet, Impacteur) et n8n.actualitevideo.fr (VPS YouTube).
const instancesN8n = {
  principal: { url: env.N8N_URL, cle: env.N8N_API_KEY },
  actualite: { url: env.N8N_ACTUALITE_URL || 'https://n8n.actualitevideo.fr', cle: env.N8N_ACTUALITE_API_KEY },
};
// Dossier data/ de Petites histoires vraies, monté en lecture seule (docker-compose.yml).
const dossierHistoires = env.HISTOIRES_DOSSIER || '/sources/histoires';
// Dossier data/ de leviaro-agent (base leviaro.db), monté en lecture seule.
const dossierLeviaro = env.LEVIARO_DOSSIER || '/sources/leviaro';
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
  enCours ??= chargerPauses(fichierPauses)
    .then((pauses) => toutVerifier({ config, fichierEtat, envoyer, options, enPause: alertesCoupees(pauses) }))
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
    // Les logos des chaînes, publics (pas de mot de passe) : ils doivent être
    // visibles dans les mails reçus par les invités, donc lisibles par n'importe qui.
    if (req.method === 'GET' && url.pathname.startsWith('/logos/')) {
      const nom = url.pathname.slice('/logos/'.length);
      try {
        if (!/^[a-z0-9-]+\.png$/.test(nom)) throw new Error('nom invalide');
        const image = await readFile(path.join(racine, 'config/logos', nom));
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
        return res.end(image);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Logo inconnu');
      }
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
        res.writeHead(303, { location: '/journal', 'set-cookie': `${COOKIE}=${acces.jeton()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${securise}` });
        return res.end();
      }
      if (url.pathname === '/deconnexion') {
        res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
        return res.end();
      }
      // Le jeton des relevés ouvre aussi les API : c'est par là que Claude vient
      // lire les idées (et le reste) sans mot de passe. Accord de louis du 05/10.
      if (!acces.jetonValide(lireCookie(req, COOKIE)) && !(url.pathname.startsWith('/api/') && jetonReleveValide(req.headers.authorization ?? ''))) {
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
      const pauses = await chargerPauses(fichierPauses);
      const projets = configJournal.projets.filter((p) => p.id !== 'autre');
      return res.end(pageEtat(config, await chargerEtat(fichierEtat), aRepondre, { projets, pauses, horsN8n: HORS_N8N, message: url.searchParams.get('message') ?? undefined }));
    }
    if (req.method === 'POST' && (url.pathname === '/projets/pause' || url.pathname === '/projets/reprendre')) {
      const { projet } = await lireCorps(req, 4_000);
      const p = configJournal.projets.find((x) => x.id === projet && x.id !== 'autre');
      let message = 'Projet inconnu';
      if (p && url.pathname === '/projets/pause') {
        const r = await avecPauses((d) => pauserProjet(d, p.id, { instances: instancesN8n, configJournal }));
        message = r.deja ? `${p.nom} était déjà en pause` : `${p.nom} en pause : ${r.coupes.length} automatisation(s) n8n arrêtée(s), alertes coupées${r.erreurs.length ? `. Problème : ${r.erreurs.join(' ; ')}` : ''}`;
        console.log(`${new Date().toISOString()} pause ${p.id} : ${r.coupes?.map((w) => w.nom).join(', ') || 'aucune automatisation'}`);
      } else if (p) {
        const r = await avecPauses((d) => reprendreProjet(d, p.id, { instances: instancesN8n }));
        message = r.deja ? `${p.nom} n'était pas en pause` : `${p.nom} relancé : ${r.relances.length} automatisation(s) n8n remise(s) en route${r.erreurs.length ? `. Pas relancé : ${r.erreurs.join(' ; ')} (le projet reste en pause, réessaie)` : ''}`;
        console.log(`${new Date().toISOString()} reprise ${p.id}`);
      }
      res.writeHead(303, { location: '/?message=' + encodeURIComponent(message) });
      return res.end();
    }
    // L'ancien chat global « Discuter » a été supprimé (demande de louis du 06/10) :
    // les échanges avec l'IA se font sur la fiche de chaque action.
    if (url.pathname === '/discuter') {
      res.writeHead(302, { location: '/actions' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/action') {
      const donnees = await chargerActions(fichierActions);
      const action = donnees.actions.find((a) => a.id === url.searchParams.get('id'));
      if (!action) {
        res.writeHead(302, { location: '/actions' });
        return res.end();
      }
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      const depenseIa = depenseIaDuMois(await chargerArgent(fichierArgent, fichierArgentDepart));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageAction(action, { aRepondre, actif: Boolean(clientClaude), depenseIa, plafondIa, message: url.searchParams.get('message') ?? undefined }));
    }
    if (req.method === 'POST' && url.pathname === '/action/statut') {
      const { id, statut } = await lireCorps(req, 4_000);
      const r = await avecActions((d) => changerStatutAction(d, id, statut));
      res.writeHead(303, { location: r.erreur ? '/actions' : `/action?id=${encodeURIComponent(id)}&message=${encodeURIComponent(statut === 'resolu' ? 'Marqué résolu. Bien joué.' : 'Statut changé.')}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/action/discuter') {
      const corps = await lireCorps(req, 16_000);
      const id = String(corps.id ?? '');
      const question = String(corps.question ?? '').trim().slice(0, 2000);
      const action = (await chargerActions(fichierActions)).actions.find((a) => a.id === id);
      if (action && question) {
        const argent = await chargerArgent(fichierArgent, fichierArgentDepart);
        let resultat;
        if (depenseIaDuMois(argent) >= plafondIa) resultat = { erreur: `Plafond IA du mois atteint (${plafondIa} $) : je pourrai répondre le mois prochain.`, cout: 0 };
        else {
          const contexte = `${contexteCerveau({
            etat: await chargerEtat(fichierEtat),
            argent,
            journal: await chargerJournal(fichierJournal),
            serveurs: await chargerServeurs(fichierServeurs),
            configServeurs,
            configJournal,
            pauses: await chargerPauses(fichierPauses),
            business: await chargerBusiness(fichierBusiness),
            reponses: await chargerReponses(fichierReponses),
          })}\n\n## La fiche d'action discutée\n${dossierPourClaude(action)}`;
          resultat = await repondre(action.discussion.filter((m) => !m.erreur), question, { client: clientClaude, contexte, consigne: CONSIGNE_ACTION });
        }
        if (resultat.cout) await avecArgent((d) => appliquerLecture(d, null, { lecture: null, erreur: null, cout: resultat.cout }));
        await avecActions((d) => enregistrerEchange(d, id, question, resultat));
      }
      res.writeHead(303, { location: `/action?id=${encodeURIComponent(id)}` });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/action/dossier') {
      const donnees = await chargerActions(fichierActions);
      const action = donnees.actions.find((a) => a.id === url.searchParams.get('id'));
      if (!action) {
        res.writeHead(302, { location: '/actions' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="action-${action.id}.md"` });
      return res.end(dossierPourClaude(action));
    }
    // Connexion des revenus YouTube : louis autorise une fois chez Google, puis
    // colle le jeton durable dans .env. Rien n'est stocké ailleurs que dans .env.
    const pageOauth = (contenu) => gabarit({ onglet: 'journal', titre: 'Revenus YouTube', contenu: `${contenu}
<style>.oauth { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:16px 20px; max-width:720px; } .oauth code { background:var(--fond); border:1px solid var(--bord); border-radius:6px; padding:2px 6px; word-break:break-all; } .oauth p { margin:8px 0; }</style>` });
    const adresseRetour = (req2) => `${req2.headers['x-forwarded-proto'] ?? 'http'}://${req2.headers['x-forwarded-host'] ?? req2.headers.host}/oauth/youtube/retour`;
    const eHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (req.method === 'GET' && url.pathname === '/oauth/youtube') {
      if (env.YT_OAUTH_CLIENT_ID && env.YT_OAUTH_CLIENT_SECRET) {
        res.writeHead(302, { location: urlAutorisation({ clientId: env.YT_OAUTH_CLIENT_ID, retour: adresseRetour(req) }) });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageOauth(`<section class="oauth"><h2>Brancher les revenus YouTube</h2>
<p>Il manque les deux lignes <code>YT_OAUTH_CLIENT_ID</code> et <code>YT_OAUTH_CLIENT_SECRET</code> dans le fichier .env du serveur.</p>
<p>Elles viennent du projet Google Cloud « cerveau » (celui du Gmail Walid) : un identifiant OAuth de type « application Web », avec cette adresse de retour autorisée :</p>
<p><code>${eHtml(adresseRetour(req))}</code></p>
<p>Une fois les deux lignes ajoutées et le cerveau redémarré, reviens sur cette page : elle t'enverra chez Google pour donner ton accord, une seule fois.</p></section>`));
    }
    if (req.method === 'GET' && url.pathname === '/oauth/youtube/retour') {
      const code = url.searchParams.get('code');
      const refus = url.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (refus || !code)
        return res.end(pageOauth(`<section class="oauth"><h2>Connexion non terminée</h2>
<p>Google n'a pas donné d'accord${refus ? ` (réponse : ${eHtml(refus)})` : ''}. Rien n'a changé.</p>
<p><a href="/oauth/youtube">Réessayer ›</a></p></section>`));
      try {
        const { refresh } = await echangerCode({ code, clientId: env.YT_OAUTH_CLIENT_ID, clientSecret: env.YT_OAUTH_CLIENT_SECRET, retour: adresseRetour(req) });
        if (!refresh) throw new Error('Google n’a pas renvoyé de jeton durable : refais la connexion depuis /oauth/youtube');
        return res.end(pageOauth(`<section class="oauth"><h2>Accord reçu ✅ — dernière étape</h2>
<p>Ajoute cette ligne dans le fichier .env du serveur, puis redémarre le cerveau :</p>
<p><code>YT_OAUTH_REFRESH=${eHtml(refresh)}</code></p>
<p>Ensuite, les revenus estimés apparaissent sur la carte L’extrait politique à la prochaine synchronisation (YouTube les donne avec 2 à 3 jours de retard). Ce jeton ne vit que dans .env, nulle part ailleurs.</p></section>`));
      } catch (err) {
        return res.end(pageOauth(`<section class="oauth"><h2>Échange refusé</h2>
<p>${eHtml(err.message)}</p>
<p><a href="/oauth/youtube">Réessayer ›</a></p></section>`));
      }
    }
    if (req.method === 'GET' && url.pathname === '/questions') {
      const n = url.searchParams.get('enregistre');
      const message = n === null ? undefined : `${n} réponse(s) enregistrée(s). Le cerveau s'en sert au prochain bilan du lundi et dans les fiches d'action.`;
      const actionsQ = (await chargerActions(fichierActions)).actions;
      const html = await avecReponses((h) => pageQuestions(configQuestions, h, { message, actions: actionsQ }));
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
      const jours = ['30', '365'].includes(url.searchParams.get('jours')) ? Number(url.searchParams.get('jours')) : 7;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        pageJournal(configJournal, await chargerJournal(fichierJournal), {
          projet,
          jours,
          vue: url.searchParams.get('vue') === 'activite' ? 'activite' : 'pilotage',
          aRepondre,
          business: await chargerBusiness(fichierBusiness),
          pauses: await chargerPauses(fichierPauses),
          etat: await chargerEtat(fichierEtat),
          actions: (await chargerActions(fichierActions)).actions,
          message: url.searchParams.get('message') ?? undefined,
        }),
      );
    }
    if (req.method === 'GET' && url.pathname === '/analyses') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        pageAnalyses(await chargerBilans(fichierBilans), {
          aRepondre,
          plafond: plafondBilans,
          actif: Boolean(clientClaude),
          nomProjet: (id) => configJournal.projets.find((p) => p.id === id)?.nom ?? id,
        }),
      );
    }
    // Réécrit le bilan de la semaine en cours (si le premier est coupé ou raté). Pas de Telegram ici.
    if (req.method === 'POST' && url.pathname === '/analyses/refaire') {
      if (clientClaude) await ecrireBilan(lundiDe());
      res.writeHead(303, { location: '/analyses' });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/actions') {
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      const tableau = tableauDeBord({
        business: await chargerBusiness(fichierBusiness),
        journal: await chargerJournal(fichierJournal),
        configJournal,
        pauses: await chargerPauses(fichierPauses),
      });
      // Les fiches suivent les signaux réels (pannes, « À décider ») à chaque affichage.
      const etatCourant = await chargerEtat(fichierEtat);
      const actions = await avecActions((d) => synchroniserActions(d, { etat: etatCourant, cartes: tableau.cartes, config, configJournal }));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        pageActions({
          configJournal,
          actions,
          cartes: tableau.cartes,
          idees: (await chargerIdees(fichierIdees)).idees,
          aRepondre,
        }),
      );
    }
    if (req.method === 'GET' && url.pathname === '/fonctionnement') {
      const id = url.searchParams.get('projet');
      const guide = guidesFonctionnement.get(id);
      const page = guide ? pageFonctionnement(configJournal, id, guide, { aRepondre: await avecReponses((h) => enAttente(configQuestions, h)) }) : null;
      if (!page) {
        res.writeHead(302, { location: '/journal' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page);
    }
    if (req.method === 'GET' && url.pathname === '/projet') {
      const id = url.searchParams.get('projet');
      if (!configJournal.projets.some((p) => p.id === id && p.id !== 'autre')) {
        res.writeHead(302, { location: '/journal' });
        return res.end();
      }
      const aRepondre = await avecReponses((h) => enAttente(configQuestions, h));
      const etatCourant = await chargerEtat(fichierEtat);
      // Les vérifications techniques rattachées à ce projet business (mêmes ids, voir pauses.js).
      const idsSurveillance = new Set([id, ...(SURVEILLANCE[id] ?? [])]);
      const verifications = Object.values(etatCourant.verifications).filter((v) => idsSurveillance.has(v.projet));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        pageProjet(configJournal, id, {
          business: await chargerBusiness(fichierBusiness),
          journal: await chargerJournal(fichierJournal),
          pauses: await chargerPauses(fichierPauses),
          histoires: id === 'histoires-vraies' ? await lireHistoires(dossierHistoires).catch(() => null) : null,
          idees: await chargerIdees(fichierIdees),
          suivi: id === 'nour-meet' ? await chargerSuivi(fichierSuivi) : undefined,
          tri: id === 'nour-meet' ? await chargerTri(fichierTri) : undefined,
          verifs: id === 'impacteur' ? await chargerVerifs(fichierVerifs) : undefined,
          verifications,
          aRepondre,
          message: url.searchParams.get('message') ?? undefined,
          guide: guidesFonctionnement.has(id),
        }),
      );
    }
    if (req.method === 'POST' && url.pathname === '/idees') {
      const { projet, texte } = await lireCorps(req, 8_000);
      const connu = configJournal.projets.some((p) => p.id === projet && p.id !== 'autre');
      const r = connu ? await avecIdees((d) => ajouterIdee(d, projet, texte)) : { erreur: 'Projet inconnu.' };
      if (r.idee) {
        const nom = configJournal.projets.find((p) => p.id === projet)?.nom ?? projet;
        envoyer(`💡 <b>Idée notée</b> (${nom})\n${r.idee.texte.slice(0, 300)}`).catch(() => {});
      }
      res.writeHead(303, { location: `/projet?projet=${encodeURIComponent(projet)}&message=${encodeURIComponent(r.erreur ?? 'Idée notée. Claude vient lire les idées deux fois par jour et te répond dans votre discussion.')}` });
      return res.end();
    }
    // Tri par lots des vieux mails jamais partis : le cerveau note la décision,
    // il n'envoie rien ; « à faire repartir » sur un restaurant déjà servi est signalé.
    if (req.method === 'POST' && url.pathname === '/tri-mails') {
      const corps = await lireCorpsMulti(req, 32_000);
      const pr = (await chargerBusiness(fichierBusiness)).sources?.prospection;
      const dejaEnvoyes = new Set((pr?.envois ?? []).filter((x) => x.statut === 'envoye').map((x) => x.nom).filter(Boolean));
      const r = await avecTri((d) => decider(d, corps.getAll('noms'), corps.get('decision'), { dejaEnvoyes }));
      const message = r.erreur ?? `${r.nombre} décision(s) notée(s)${r.doublons ? ` · ⚠ ${r.doublons} doublon(s) possible(s) : déjà un mail envoyé, à vérifier avant de faire repartir` : ''}. Rien n'est envoyé d'ici.`;
      res.writeHead(303, { location: `/projet?projet=nour-meet&message=${encodeURIComponent(message)}` });
      return res.end();
    }
    // Choix de louis sur une fiche d'invité « à vérifier » (Impacteur) : noté dans
    // le cerveau, rien ne part d'ici ; le ✅/🗑 Telegram reste l'interrupteur tant
    // que le branchement n8n n'est pas montré à louis puis activé par lui.
    if (req.method === 'POST' && url.pathname === '/verif-fiche') {
      const { auteur, livre, choix } = await lireCorps(req, 4_000);
      const r = await avecVerifs((d) => choisirVerif(d, { auteur, livre, choix }));
      const message = r.erreur ?? `Choix noté (${CHOIX_VERIF[r.choix]}). Rien ne part d'ici : le ✅/🗑 Telegram reste l'interrupteur tant que le branchement n'est pas activé.`;
      res.writeHead(303, { location: `/projet?projet=impacteur&message=${encodeURIComponent(message)}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/suivi-reponse') {
      const { cle, etat, action, echeance } = await lireCorps(req, 4_000);
      const r = await avecSuivi((d) => changerSuivi(d, cle, { etat, action, echeance }));
      res.writeHead(303, { location: `/projet?projet=nour-meet&message=${encodeURIComponent(r.erreur ?? 'Suivi enregistré')}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/idees/statut') {
      const { id, statut, projet } = await lireCorps(req, 4_000);
      const r = await avecIdees((d) => changerStatutIdee(d, id, statut));
      res.writeHead(303, { location: `/projet?projet=${encodeURIComponent(projet ?? '')}&message=${encodeURIComponent(r.erreur ?? 'Suivi mis à jour')}` });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/idees') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(await chargerIdees(fichierIdees)));
    }
    // Lecture seule du code des agents montés dans le conteneur : Claude s'en sert
    // pour tenir les guides « Comment ça marche » à jour sans rien demander à louis.
    if (req.method === 'GET' && url.pathname === '/api/code') {
      const projet = url.searchParams.get('projet') ?? '';
      const dossier = dossiersCode(env)[projet];
      const json = (code, corps) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(corps));
      };
      if (!dossier) return json(404, { erreur: 'Projet inconnu (leviaro ou histoires-vraies).' });
      try {
        const fichier = url.searchParams.get('fichier');
        if (fichier) {
          const texte = await lireCode(dossier, fichier);
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          return res.end(texte);
        }
        return json(200, { projet, fichiers: await listerCode(dossier) });
      } catch (err) {
        if (err.code === 'ENOENT') return json(404, { erreur: 'Introuvable (fichier absent, ou dossier pas encore monté sur ce serveur).' });
        if (err.code === 'REFUSE') return json(403, { erreur: err.message });
        return json(500, { erreur: 'Lecture impossible.' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/journal/objectif') {
      const { projet, valeur } = await lireCorps(req, 2_000);
      const connu = configJournal.projets.some((p) => p.id === projet && p.id !== 'autre');
      const r = connu ? await avecBusiness((b) => validerObjectif(b, projet, valeur)) : { erreur: 'Projet inconnu.' };
      res.writeHead(303, { location: `/journal?message=${encodeURIComponent(r.erreur ?? 'Objectif validé')}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/journal') {
      const champs = await lireCorps(req);
      const { erreur } = await avecJournal((j) => ajouterEvenement(j, configJournal, champs, { source: 'page' }));
      res.writeHead(303, { location: `/journal?${champs.vue === 'activite' ? 'vue=activite&' : ''}message=${encodeURIComponent(erreur ?? 'Note ajoutée')}` });
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
bilanDuLundi();
setInterval(bilanDuLundi, 10 * 60_000);
