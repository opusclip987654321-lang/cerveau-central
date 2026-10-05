// YouTube : vues, abonnés et vidéos des chaînes de louis, via l'API publique
// (clé YOUTUBE_API_KEY, lecture seule). Les revenus demandent un autre accès (OAuth),
// pas encore branché. config/youtube.json dit quelles chaînes appartiennent à quel projet.
import { jourDe } from './business.js';
import { jourParis } from './questions.js';

// « https://www.youtube.com/@machin », « @machin » ou « UC… » → ce que l'API attend.
export function referenceChaine(texte) {
  const t = String(texte ?? '').trim();
  const m = t.match(/youtube\.com\/(?:channel\/)?(@[\w.-]+|UC[\w-]{10,})/i) ?? t.match(/^(@[\w.-]+|UC[\w-]{10,})$/);
  if (!m) return null;
  return m[1].startsWith('@') ? { forHandle: m[1] } : { id: m[1] };
}

const appelParDefaut = (cle, delaiMs) => (chemin, params) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${chemin}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', cle);
  return fetch(url, { signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
    if (!r.ok) throw new Error(`YouTube répond ${r.status}${r.status === 403 ? ' (clé refusée ou quota dépassé)' : ''}`);
    return r.json();
  });
};

// Lit chaque chaîne (3 petits appels : chaîne, liste des vidéos, stats des vidéos)
// et garde un relevé par jour pour calculer « vues et abonnés gagnés sur la période ».
export async function synchroniserYoutube(business, { cle, chaines = {}, delaiMs = 20_000, appel, maintenant = new Date() } = {}) {
  const entrees = Object.entries(chaines).flatMap(([projet, liste]) => (liste ?? []).map((c) => ({ projet, ref: referenceChaine(c), brut: c })));
  if (!entrees.length) return { ignore: true };
  if (!appel && !cle) return { ignore: true };
  appel ??= appelParDefaut(cle, delaiMs);

  const yt = (business.sources.youtube ??= { chaines: [], historique: {} });
  const lues = [];
  for (const { projet, ref, brut } of entrees) {
    if (!ref) throw new Error(`chaîne illisible dans config/youtube.json : ${brut}`);
    const rep = await appel('channels', { part: 'snippet,statistics,contentDetails', ...ref });
    const c = rep.items?.[0];
    if (!c) throw new Error(`chaîne introuvable : ${brut}`);
    const envois = c.contentDetails?.relatedPlaylists?.uploads;
    let videos = [];
    if (envois) {
      const liste = await appel('playlistItems', { part: 'contentDetails', playlistId: envois, maxResults: '25' });
      const ids = (liste.items ?? []).map((v) => v.contentDetails?.videoId).filter(Boolean);
      if (ids.length) {
        const stats = await appel('videos', { part: 'snippet,statistics', id: ids.join(',') });
        videos = (stats.items ?? []).map((v) => ({
          id: v.id,
          titre: String(v.snippet?.title ?? '').slice(0, 120),
          jour: jourDe(v.snippet?.publishedAt),
          vues: Number(v.statistics?.viewCount ?? 0),
          aimes: Number(v.statistics?.likeCount ?? 0),
        }));
      }
    }
    lues.push({
      projet,
      id: c.id,
      titre: String(c.snippet?.title ?? '').slice(0, 80),
      abonnes: Number(c.statistics?.subscriberCount ?? 0),
      vues: Number(c.statistics?.viewCount ?? 0),
      nbVideos: Number(c.statistics?.videoCount ?? 0),
      videos,
    });
  }
  yt.chaines = lues;
  yt.maj = maintenant.toISOString();
  // Un relevé par jour et par chaîne (le dernier de la journée gagne), gardé 120 jours.
  const jour = jourParis(maintenant);
  (yt.historique[jour] ??= {});
  for (const c of lues) yt.historique[jour][c.id] = { abonnes: c.abonnes, vues: c.vues };
  const garder = jourParis(new Date(maintenant - 120 * 86_400_000));
  for (const j of Object.keys(yt.historique)) if (j < garder) delete yt.historique[j];
  return { chaines: lues.length };
}

// Vues et abonnés gagnés entre le début de la période et le dernier relevé.
export function gainsPeriode(yt, chaines, periode) {
  const jours = Object.keys(yt.historique ?? {}).sort();
  const avant = jours.filter((j) => j < periode[0]).at(-1);
  const dedans = jours.filter((j) => j >= periode[0] && j <= periode.at(-1));
  const reference = avant ?? dedans[0];
  const dernier = dedans.at(-1);
  if (!reference || !dernier || reference === dernier) return null;
  let vues = 0;
  let abonnes = 0;
  for (const c of chaines) {
    const a = yt.historique[reference]?.[c.id];
    const b = yt.historique[dernier]?.[c.id];
    if (!a || !b) return null;
    vues += b.vues - a.vues;
    abonnes += b.abonnes - a.abonnes;
  }
  return { vues, abonnes };
}
