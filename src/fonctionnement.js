// Les guides « Comment ça marche » de chaque projet : un fichier JSON par projet
// dans config/fonctionnement/, au format du guide v4 de louis (journée type,
// circuits, règles, alertes, rôle). Chargés une fois au démarrage.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function chargerFonctionnement(dossier) {
  const guides = new Map();
  let fichiers = [];
  try {
    fichiers = await readdir(dossier);
  } catch (err) {
    if (err.code === 'ENOENT') return guides;
    throw err;
  }
  for (const f of fichiers.filter((x) => x.endsWith('.json')).sort()) {
    guides.set(path.basename(f, '.json'), JSON.parse(await readFile(path.join(dossier, f), 'utf8')));
  }
  return guides;
}
