// Les choix de louis sur les fiches d'invités « à vérifier » (Impacteur), notés
// depuis la page du cerveau. Le cerveau n'écrit ni dans le Sheet ni dans Gmail :
// tant que le branchement n8n n'est pas montré à louis puis activé par lui, le
// ✅/🗑 Telegram reste le vrai interrupteur et le choix noté ici reste une note.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerVerifs(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { choix: {} };
    throw err;
  }
}
export const sauverVerifs = sauverJson;

export const CHOIX_VERIF = { valider: 'Validée par toi', rejeter: 'Rejetée par toi' };

export const cleVerif = (auteur, livre) =>
  createHash('sha256')
    .update(`verif:${String(auteur ?? '').trim().toLowerCase()}|${String(livre ?? '').trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);

// Note le choix (valider / rejeter) pour une fiche ; recliquer écrase, donc une
// erreur de clic se corrige en choisissant l'autre bouton.
export function choisirVerif(donnees, { auteur, livre, choix }, { maintenant = new Date() } = {}) {
  if (!CHOIX_VERIF[choix]) return { erreur: 'Choix inconnu.' };
  const a = String(auteur ?? '').trim();
  if (!a) return { erreur: 'Fiche sans auteur : choix impossible.' };
  const l = String(livre ?? '').trim();
  donnees.choix[cleVerif(a, l)] = { auteur: a.slice(0, 80), livre: l.slice(0, 120), choix, quand: maintenant.toISOString() };
  return { choix };
}
