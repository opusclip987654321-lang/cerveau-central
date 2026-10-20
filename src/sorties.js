// Les sorties des commandes lancées par louis sur le VPS Nūr (revue du système du 20/10).
// scripts/envoyer.sh lance la commande, l'affiche à l'écran comme d'habitude et
// l'envoie ici (POST /api/sorties) ; le fil Claude la relit par GET /api/sorties
// au lieu de demander à louis de la coller. Les jetons sont masqués avant d'être gardés.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export const GARDEES = 100;
export const TAILLE_MAX = 400_000;

export async function chargerSorties(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { sorties: [] };
    throw err;
  }
}
export const sauverSorties = sauverJson;

const MASQUE = '[masqué]';
// Une valeur au nom anodin mais à l'allure de jeton (longue, lettres et chiffres mêlés, pas un chemin).
const pareilJeton = (v) => /^[A-Za-z0-9_\-+/=.]{24,}$/.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && !v.startsWith('/');
const NOMS_SECRETS = /^[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASS|JETON|MOT_DE_PASSE|REFRESH|CREDENTIALS?)[A-Z0-9_]*$/;

// Masque ce qui ressemble à un secret : les valeurs du .env (que le conteneur connaît),
// les lignes CLE=valeur aux noms de secrets, les en-têtes Bearer et les formats de clés connus.
export function masquerSecrets(texte, env = {}) {
  let t = String(texte ?? '');
  const valeurs = Object.entries(env)
    .filter(([nom, v]) => typeof v === 'string' && v.length >= 12 && (NOMS_SECRETS.test(nom) || pareilJeton(v)))
    .map(([, v]) => v)
    .sort((a, b) => b.length - a.length);
  for (const v of valeurs) t = t.split(v).join(MASQUE);
  return t
    .replace(/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|JETON|MOT_DE_PASSE|REFRESH)[A-Z0-9_]*)\s*([=:])\s*(["']?)[^\s"']{6,}\3/g, `$1$2${MASQUE}`)
    .replace(/(["'](?:[a-z_]*(?:api_?key|apikey|token|secret|password|jeton))["']\s*:\s*)"[^"]{6,}"/gi, `$1"${MASQUE}"`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${MASQUE}`)
    .replace(/\b(?:sk-ant-|sk-|ghp_|gho_|github_pat_|xox[abp]-|AIza)[A-Za-z0-9_-]{16,}/g, MASQUE)
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, MASQUE)
    .replace(/\bbot\d{6,}:[A-Za-z0-9_-]{30,}/g, `bot${MASQUE}`)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi, (m) => m.replace(/:[^:@]+@$/, `:${MASQUE}@`));
}

// Une sortie trop longue garde le début et la fin, là où sont les bilans et les erreurs.
export function couper(texte, max = TAILLE_MAX) {
  if (texte.length <= max) return texte;
  const moitie = Math.floor(max / 2);
  return `${texte.slice(0, moitie)}\n\n[… ${texte.length - max} caractères coupés …]\n\n${texte.slice(-moitie)}`;
}

const propre = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const date = (v, defaut) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : defaut);

// Le corps envoyé par scripts/envoyer.sh : des lignes « champ: valeur », une ligne vide, puis la sortie.
export function lireEnvoi(corps) {
  const texte = String(corps ?? '');
  const fin = texte.indexOf('\n\n');
  const entete = fin < 0 ? texte : texte.slice(0, fin);
  const champs = {};
  for (const ligne of entete.split('\n')) {
    const m = /^([a-z]+):\s?(.*)$/.exec(ligne);
    if (m) champs[m[1]] = m[2];
  }
  return { ...champs, sortie: fin < 0 ? '' : texte.slice(fin + 2) };
}

export function enregistrerSortie(donnees, envoi, { env = {}, maintenant = new Date() } = {}) {
  const commande = masquerSecrets(propre(envoi.commande, 500), env);
  const script = propre(envoi.script, 80) || propre(commande.split(' ')[0], 80);
  if (!script) return { erreur: 'Nom du script manquant.' };
  const code = /^-?\d+$/.test(String(envoi.code ?? '').trim()) ? Number(envoi.code) : null;
  const sortie = {
    id: randomBytes(5).toString('hex'),
    script,
    commande,
    serveur: propre(envoi.serveur, 80) || null,
    code,
    ok: code === 0,
    debut: date(envoi.debut, null),
    fin: date(envoi.fin, maintenant.toISOString()),
    recu: maintenant.toISOString(),
    sortie: couper(masquerSecrets(envoi.sortie, env)),
  };
  donnees.sorties.unshift(sortie);
  donnees.sorties = donnees.sorties.slice(0, GARDEES);
  return { sortie };
}

// GET /api/sorties : les dernières, de la plus récente à la plus ancienne.
// ?script= (nom ou morceau de nom), ?depuis= (date ISO), ?n= (10 par défaut), ?id= (une seule).
export function listerSorties(donnees, { script, depuis, n, id } = {}) {
  let liste = donnees.sorties ?? [];
  if (id) return liste.filter((s) => s.id === id);
  if (script) liste = liste.filter((s) => s.script.toLowerCase().includes(String(script).toLowerCase()));
  if (depuis && !Number.isNaN(Date.parse(depuis))) liste = liste.filter((s) => Date.parse(s.recu) >= Date.parse(depuis));
  const combien = Math.min(Math.max(Number.parseInt(n, 10) || 10, 1), GARDEES);
  return liste.slice(0, combien);
}
