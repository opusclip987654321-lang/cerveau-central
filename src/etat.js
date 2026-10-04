// Garde en mémoire le dernier état connu de chaque vérification, pour repérer les changements.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

export async function chargerEtat(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { derniereVerification: null, verifications: {}, historique: [] };
    throw err;
  }
}

export async function sauverEtat(fichier, etat) {
  await mkdir(path.dirname(fichier), { recursive: true });
  const temporaire = `${fichier}.tmp`;
  await writeFile(temporaire, JSON.stringify(etat, null, 2));
  await rename(temporaire, fichier);
}

const GRAVITE = { ok: 0, ignore: 0, attention: 1, panne: 2 };

// Compare l'ancien et le nouveau résultat et dit s'il faut prévenir louis.
export function changement(avant, apres) {
  if (apres.evenement) return apres.erreurs?.length ? 'evenement' : null;
  if (apres.etat === 'ignore') return null;
  const ancien = avant?.etat ?? 'ok';
  if (GRAVITE[apres.etat] > GRAVITE[ancien]) return apres.etat;
  if (apres.etat === 'ok' && GRAVITE[ancien] > 0) return 'retabli';
  return null;
}
