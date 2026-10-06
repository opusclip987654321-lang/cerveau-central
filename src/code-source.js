import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Lecture seule du code des agents montés dans le conteneur (docker-compose.yml) :
// Claude s'en sert, via /api/code et le jeton des relevés, pour tenir les guides
// « Comment ça marche » à jour sans demander une sortie de commande à louis.
// Jamais de secrets ni de données : .env, bases et dossiers data sont exclus.
const EXCLUS = /(^|\/)(\.env[^/]*|\.git|node_modules|__pycache__|\.venv|venv|data)(\/|$)|\.(db|sqlite3?|pem|key|png|jpe?g|gif|mp4|mp3|wav|zip|gz|tar|pyc|woff2?|ttf)$/i;
const TAILLE_MAX = 200 * 1024;
const FICHIERS_MAX = 500;
const PROFONDEUR_MAX = 6;

export function dossiersCode(env = process.env) {
  return {
    leviaro: env.CODE_LEVIARO || '/sources/leviaro-code',
    'histoires-vraies': env.CODE_HISTOIRES || '/sources/histoires-code',
  };
}

export async function listerCode(dossier) {
  const fichiers = [];
  const parcourir = async (relatif, profondeur) => {
    if (profondeur > PROFONDEUR_MAX || fichiers.length >= FICHIERS_MAX) return;
    const entrees = await readdir(path.join(dossier, relatif), { withFileTypes: true });
    for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
      const chemin = relatif ? `${relatif}/${e.name}` : e.name;
      if (EXCLUS.test(chemin + (e.isDirectory() ? '/' : ''))) continue;
      if (e.isDirectory()) await parcourir(chemin, profondeur + 1);
      else if (e.isFile() && fichiers.length < FICHIERS_MAX) {
        const { size } = await stat(path.join(dossier, chemin));
        fichiers.push({ chemin, taille: size });
      }
    }
  };
  await parcourir('', 0);
  return fichiers;
}

export async function lireCode(dossier, chemin) {
  const propre = String(chemin ?? '');
  if (!propre || path.isAbsolute(propre) || propre.split('/').includes('..') || EXCLUS.test(propre)) {
    throw Object.assign(new Error('Fichier hors du dossier de code.'), { code: 'REFUSE' });
  }
  const complet = path.join(dossier, propre);
  if (path.relative(dossier, complet).startsWith('..')) {
    throw Object.assign(new Error('Fichier hors du dossier de code.'), { code: 'REFUSE' });
  }
  const infos = await stat(complet);
  if (!infos.isFile()) throw Object.assign(new Error('Pas un fichier.'), { code: 'REFUSE' });
  if (infos.size > TAILLE_MAX) throw Object.assign(new Error(`Fichier trop gros (${infos.size} octets, limite ${TAILLE_MAX}).`), { code: 'REFUSE' });
  return readFile(complet, 'utf8');
}
