// Les idées de modifications de louis, notées sur la page de chaque projet.
// Chaque idée a un suivi simple : proposée → en cours → faite (ou écartée).
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerIdees(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { idees: [] };
    throw err;
  }
}
export const sauverIdees = sauverJson;

export const STATUTS_IDEE = { proposee: 'Proposée', en_cours: 'En cours', faite: 'Faite', ecartee: 'Écartée' };

export function ajouterIdee(donnees, projet, texte, maintenant = new Date()) {
  const propre = String(texte ?? '').trim().slice(0, 2000);
  if (!propre) return { erreur: 'L’idée est vide.' };
  const idee = { id: randomBytes(6).toString('hex'), projet: String(projet), texte: propre, statut: 'proposee', cree: maintenant.toISOString(), maj: maintenant.toISOString() };
  donnees.idees.unshift(idee);
  donnees.idees = donnees.idees.slice(0, 500);
  return { idee };
}

export function changerStatutIdee(donnees, id, statut, maintenant = new Date()) {
  if (!STATUTS_IDEE[statut]) return { erreur: 'Statut inconnu.' };
  const idee = donnees.idees.find((i) => i.id === id);
  if (!idee) return { erreur: 'Idée introuvable.' };
  idee.statut = statut;
  idee.maj = maintenant.toISOString();
  return { idee };
}
