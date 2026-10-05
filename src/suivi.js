// Suivi manuel des réponses de restaurants (fiche Nūr Meet) : louis note où en est
// chaque conversation. Changer un état n'envoie JAMAIS de mail et n'arrête aucune
// automatisation : c'est une étiquette pour s'y retrouver, rien d'autre.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerSuivi(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { reponses: {} };
    throw err;
  }
}
export const sauverSuivi = sauverJson;

export const ETATS_SUIVI = {
  a_lire: 'À lire',
  en_cours: 'Suivi en cours',
  attente_restaurant: 'En attente du restaurant',
  a_relancer: 'À relancer',
  traite: 'Traité',
  refus: 'Refus',
  opposition: 'Opposition',
};
// États où la conversation ne demande plus rien à louis.
export const ETATS_FINIS = new Set(['traite', 'refus', 'opposition']);

// Clé stable d'une réponse, recalculable d'une lecture n8n à l'autre.
export const cleReponse = (r) => createHash('sha256').update(`${r.jour ?? ''}|${r.de ?? r.nom ?? ''}|${r.objet ?? ''}`).digest('hex').slice(0, 16);

export function changerSuivi(donnees, cle, { etat, action, echeance } = {}, maintenant = new Date()) {
  if (!/^[0-9a-f]{16}$/.test(String(cle ?? ''))) return { erreur: 'Réponse inconnue.' };
  if (!ETATS_SUIVI[etat]) return { erreur: 'État inconnu.' };
  const propre = String(action ?? '').trim().slice(0, 300);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(echeance ?? '')) ? echeance : null;
  donnees.reponses[cle] = { etat, action: propre || null, echeance: date, maj: maintenant.toISOString() };
  return { suivi: donnees.reponses[cle] };
}
