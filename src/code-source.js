import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// Lecture seule du code des agents montés dans le conteneur (docker-compose.yml) :
// Claude s'en sert, via /api/code et le jeton des relevés, pour tenir les guides
// « Comment ça marche » à jour sans demander une sortie de commande à louis.
// Principe : on ne sert QUE ce qui ressemble à du code ou de la documentation
// (liste autorisée), jamais les secrets, bases, journaux ou données.
const DOSSIERS_EXCLUS = /(^|\/)(\.git|node_modules|__pycache__|\.venv|venv|env|data|logs?|stories|tmp|\.ssh)(\/|$)/i;
const NOMS_INTERDITS = /(token|credential|secret|passwd|password|id_rsa|id_ed25519|\.env|\.pem|\.key)/i;
const EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|py|md|markdown|yml|yaml|toml|txt|json|sh|bash|css|html|service)$/i;
const NOMS_SEULS = new Set(['dockerfile', 'makefile', '.gitignore', '.dockerignore']);
const TAILLE_MAX = 200 * 1024;
const FICHIERS_MAX = 500;
const PROFONDEUR_MAX = 6;

export function dossiersCode(env = process.env) {
  return {
    leviaro: env.CODE_LEVIARO || '/sources/leviaro-code',
    'histoires-vraies': env.CODE_HISTOIRES || '/sources/histoires-code',
  };
}

function cheminAutorise(chemin) {
  if (!chemin || chemin.includes('\0') || DOSSIERS_EXCLUS.test(chemin) || NOMS_INTERDITS.test(chemin)) return false;
  const nom = chemin.split('/').pop().toLowerCase();
  return EXTENSIONS.test(nom) || NOMS_SEULS.has(nom);
}

export async function listerCode(dossier) {
  const fichiers = [];
  const parcourir = async (relatif, profondeur) => {
    if (profondeur > PROFONDEUR_MAX || fichiers.length >= FICHIERS_MAX) return;
    const entrees = await readdir(path.join(dossier, relatif), { withFileTypes: true });
    for (const e of entrees.sort((a, b) => a.name.localeCompare(b.name))) {
      const chemin = relatif ? `${relatif}/${e.name}` : e.name;
      // Les liens symboliques ne sont ni listés ni suivis (isDirectory/isFile sont faux pour eux).
      if (e.isDirectory() && !DOSSIERS_EXCLUS.test(chemin + '/')) await parcourir(chemin, profondeur + 1);
      else if (e.isFile() && cheminAutorise(chemin) && fichiers.length < FICHIERS_MAX) {
        const { size } = await stat(path.join(dossier, chemin));
        fichiers.push({ chemin, taille: size });
      }
    }
  };
  await parcourir('', 0);
  return fichiers;
}

const refuse = () => Object.assign(new Error('Fichier hors du cadre de lecture (code et documentation seulement).'), { code: 'REFUSE' });

export async function lireCode(dossier, chemin) {
  const propre = path.posix.normalize(String(chemin ?? '').replaceAll('\\', '/'));
  if (path.isAbsolute(propre) || propre.split('/').includes('..') || !cheminAutorise(propre)) throw refuse();
  // Chemin réel : un lien symbolique vers un secret ou hors du dossier est refusé.
  const reel = await realpath(path.join(dossier, propre));
  const rel = path.relative(await realpath(dossier), reel).replaceAll('\\', '/');
  if (rel.startsWith('..') || path.isAbsolute(rel) || !cheminAutorise(rel)) throw refuse();
  const infos = await stat(reel);
  if (!infos.isFile()) throw refuse();
  if (infos.size > TAILLE_MAX) throw Object.assign(new Error(`Fichier trop gros (${infos.size} octets, limite ${TAILLE_MAX}).`), { code: 'REFUSE' });
  return readFile(reel, 'utf8');
}
