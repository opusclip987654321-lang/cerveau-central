// Petites histoires vraies : le programme /opt/nour-video-agent (VPS Nūr), hors n8n.
// Le cerveau lit son dossier data/ (monté en lecture seule) : published.json pour
// les vidéos publiées, jobs/ pour les histoires lancées (un dossier par lancement).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ajouterEvenement } from './journal.js';

// Les dates du programme sont à l'heure de Paris, sans fuseau : on les convertit.
export function depuisHeureParis(naive) {
  const iso = String(naive ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return null;
  const commeUtc = new Date(`${iso.slice(0, 19)}Z`);
  if (Number.isNaN(commeUtc.getTime())) return null;
  const vuAParis = new Date(commeUtc.toLocaleString('en-US', { timeZone: 'Europe/Paris' }) + ' UTC');
  return new Date(commeUtc.getTime() - (vuAParis - commeUtc));
}

// « 19-amira-20261003-070001 » → histoire « 19-amira », lancée le 3 octobre à 7h.
export function lireJob(nom) {
  const m = /^(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(nom);
  if (!m) return null;
  const [, histoire, a, mo, j, h, mi, s] = m;
  return { nom, histoire, date: depuisHeureParis(`${a}-${mo}-${j}T${h}:${mi}:${s}`) };
}

export async function lireHistoires(dossier) {
  if (!dossier) return null;
  let publiees;
  try {
    publiees = JSON.parse(await readFile(path.join(dossier, 'published.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const jobs = (await readdir(path.join(dossier, 'jobs')).catch(() => [])).map(lireJob).filter(Boolean);
  return { publiees: Array.isArray(publiees) ? publiees : [], jobs };
}

export const lienVideo = (p) => (p.fb_video_id ? `https://www.facebook.com/watch/?v=${encodeURIComponent(p.fb_video_id)}` : null);

// Ajoute au journal les vidéos publiées pas encore vues.
export function synchroniserHistoires(journal, config, donnees) {
  if (!donnees) return 0;
  const vues = new Set((journal.histoires ??= { vues: [] }).vues);
  let n = 0;
  for (const p of donnees.publiees) {
    const cle = `${p.story_id}|${p.date}`;
    if (vues.has(cle)) continue;
    const reseaux = [p.ig_media_id && 'Instagram', p.fb_video_id && 'Facebook'].filter(Boolean).join(' + ');
    const { evenement } = ajouterEvenement(
      journal,
      config,
      { projet: 'histoires-vraies', type: 'video', titre: `Vidéo publiée : ${p.title ?? p.story_id}`, lien: lienVideo(p), date: depuisHeureParis(p.date)?.toISOString(), details: reseaux ? `Publiée sur ${reseaux}` : null },
      { source: 'histoires' },
    );
    if (evenement) {
      vues.add(cle);
      n++;
    }
  }
  journal.histoires.vues = [...vues].slice(-2000);
  return n;
}

const joursDepuis = (date, maintenant) => (maintenant - date) / 86_400_000;
const dateCourte = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

// Vérification : le programme tourne (une histoire lancée récemment). Ne pas publier
// n'est pas une panne : louis refuse lui-même les vidéos ratées à la validation.
export async function verifierHistoires(verif, _seuils, { dossier, maintenant = new Date() } = {}) {
  const d = await lireHistoires(dossier);
  if (!d) return { etat: 'ignore', detail: 'dossier du programme pas encore relié au cerveau' };
  const derniere = d.publiees.map((p) => ({ p, date: depuisHeureParis(p.date) })).filter((x) => x.date).sort((a, b) => b.date - a.date)[0];
  const dernierJob = d.jobs.filter((j) => j.date).sort((a, b) => b.date - a.date)[0];
  const publiees = new Set(d.publiees.map((p) => p.story_id));
  const refusees = new Set(d.jobs.filter((j) => !publiees.has(j.histoire)).map((j) => j.nom)).size;
  const infos = [
    derniere ? `dernière vidéo publiée : « ${derniere.p.title} », le ${dateCourte(derniere.date)}` : 'aucune vidéo publiée',
    refusees ? `${refusees} essai(s) non publié(s) depuis` : null,
  ].filter(Boolean);
  // Vidéos faites à la main (depuis le 05/10) : le programme est en pause, pas d'alerte.
  if (verif.automatique === false) return { etat: 'ok', detail: `fabrication automatique en pause ; ${infos.join(' ; ')}` };
  const sans = dernierJob ? joursDepuis(dernierJob.date, maintenant) : Infinity;
  if (sans > (verif.joursMax ?? 4))
    return { etat: 'attention', detail: `le programme n'a lancé aucune histoire depuis ${dernierJob ? `${Math.floor(sans)} jours` : 'le début'} (il devrait tous les 2 jours) ; ${infos.join(' ; ')}` };
  return { etat: 'ok', detail: infos.join(' ; ') };
}
