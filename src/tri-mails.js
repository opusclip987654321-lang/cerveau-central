// Les décisions de louis sur les vieux mails préparés jamais partis, par lots.
// Le cerveau n'envoie JAMAIS de mail : il note la décision ; une reprise se fait
// dans n8n ou via Claude, après vérification des envois et exclusions existants.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerTri(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { decisions: {} };
    throw err;
  }
}
export const sauverTri = sauverJson;

export const DECISIONS_TRI = {
  garder: 'Laisser en attente',
  envoyer: 'À faire repartir (après vérification)',
  abandonner: 'Abandonner',
};

export const cleTri = (nom) => createHash('sha256').update(`tri:${String(nom ?? '').trim().toLowerCase()}`).digest('hex').slice(0, 16);

// Note une décision pour chaque nom coché. `dejaEnvoyes` sert au garde-fou
// anti-doublon : « à faire repartir » sur un restaurant déjà servi est signalé.
export function decider(donnees, noms, decision, { dejaEnvoyes = new Set(), maintenant = new Date() } = {}) {
  if (!DECISIONS_TRI[decision]) return { erreur: 'Décision inconnue.' };
  const propres = [...new Set(noms.map((n) => String(n ?? '').trim()).filter(Boolean))].slice(0, 200);
  if (!propres.length) return { erreur: 'Aucun mail coché.' };
  let doublons = 0;
  for (const nom of propres) {
    const doublon = decision === 'envoyer' && dejaEnvoyes.has(nom);
    if (doublon) doublons++;
    donnees.decisions[cleTri(nom)] = { nom: nom.slice(0, 200), decision, quand: maintenant.toISOString(), doublon };
  }
  return { nombre: propres.length, doublons };
}
