// Vérifie un VPS à partir de son dernier relevé : arrivé à temps, et place sur le disque.
import { chargerServeurs, disquePrincipal } from '../serveurs.js';

export async function verifierReleve(verif, seuils, { fichier, maintenant = new Date() } = {}) {
  const s = (await chargerServeurs(fichier)).serveurs[verif.serveur];
  if (!s?.dernier) return { etat: 'ignore', detail: 'relevé pas encore installé' };
  const minutes = (maintenant - new Date(s.recu)) / 60_000;
  if (minutes > (verif.maxMinutes ?? 180)) return { etat: 'panne', detail: `aucun relevé depuis ${Math.round(minutes / 60)} h` };
  const d = disquePrincipal(s.dernier);
  if (!d) return { etat: 'ok', detail: 'relevé reçu' };
  const pct = Math.round((d.utilise / d.total) * 100);
  const detail = `disque ${pct} % utilisé, ${((d.total - d.utilise) / 1024 ** 3).toFixed(1).replace('.', ',')} Go libres`;
  if (pct >= seuils.disqueCritique) return { etat: 'panne', detail };
  if (pct >= seuils.disqueAttention) return { etat: 'attention', detail };
  return { etat: 'ok', detail };
}
