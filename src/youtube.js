// YouTube : vues, abonnés et vidéos des chaînes de louis, via l'API publique
// (clé YOUTUBE_API_KEY, lecture seule). Les revenus passent par un accès OAuth à part
// (YT_OAUTH_CLIENT_ID / YT_OAUTH_CLIENT_SECRET / YT_OAUTH_REFRESH dans .env, créés via
// la page /oauth/youtube). config/youtube.json dit quelles chaînes appartiennent à quel projet.
import { jourDe } from './business.js';
import { jourParis } from './questions.js';

// Durée « PT1H2M3S » de l'API → secondes (null si absente).
export function dureeSecondes(iso) {
  const m = String(iso ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}
// Short ou vidéo longue, déduit de la durée (YouTube accepte les Shorts jusqu'à
// 3 minutes) : l'API ne dit pas le format, c'est une déduction, la page le précise.
export const formatVideo = (secondes) => (secondes === null ? null : secondes <= 180 ? 'short' : 'longue');

// Le jour où une vidéo est vraiment sortie. YouTube donne trois dates : celle de
// l'envoi (snippet.publishedAt, qui reste la date d'envoi pour une vidéo programmée
// ou rendue publique plus tard), celle de la mise en ligne publique dans la liste des
// envois (videoPublishedAt) et, pour une première, le début réel. On garde la plus
// tardive : une vidéo ne sort jamais avant d'être envoyée.
export function jourPublication({ envoi, publication, premiere } = {}) {
  const dates = [envoi, publication, premiere].map((d) => (d ? new Date(d) : null)).filter((d) => d && !Number.isNaN(d));
  if (!dates.length) return null;
  return jourDe(new Date(Math.max(...dates)).toISOString());
}

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
      // Date de mise en ligne publique selon la liste des envois : pour une vidéo
      // programmée, c'est elle qui donne le vrai jour de sortie.
      const publications = new Map((liste.items ?? []).filter((v) => v.contentDetails?.videoId).map((v) => [v.contentDetails.videoId, v.contentDetails.videoPublishedAt]));
      const ids = [...publications.keys()];
      if (ids.length) {
        const stats = await appel('videos', { part: 'snippet,statistics,contentDetails,liveStreamingDetails', id: ids.join(',') });
        videos = (stats.items ?? []).map((v) => {
          const secondes = dureeSecondes(v.contentDetails?.duration);
          return {
            id: v.id,
            titre: String(v.snippet?.title ?? '').slice(0, 120),
            jour: jourPublication({ envoi: v.snippet?.publishedAt, publication: publications.get(v.id), premiere: v.liveStreamingDetails?.actualStartTime }),
            vues: Number(v.statistics?.viewCount ?? 0),
            aimes: Number(v.statistics?.likeCount ?? 0),
            secondes,
            format: formatVideo(secondes),
          };
        });
      }
    }
    lues.push({
      projet,
      source: brut,
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

// --- Flux public des chaînes (sans clé, sans quota) ----------------------------
// Chaque chaîne a un flux RSS public de ses 15 dernières vidéos. Le cerveau le lit
// chaque heure à côté de l'API : si la clé est refusée ou le quota dépassé, les
// vidéos publiées restent justes. Les vidéos du flux sont gardées 120 jours.

const lireTexteParDefaut = (delaiMs) => (url) =>
  // SOCS : passe la page de consentement que YouTube montre aux serveurs européens.
  fetch(url, { headers: { cookie: 'SOCS=CAI' }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
    if (!r.ok) throw new Error(`YouTube répond ${r.status} (${new URL(url).pathname})`);
    return r.text();
  });

const texteXml = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Les vidéos d'un flux RSS de chaîne. Le lien dit si c'est un Short (/shorts/…).
export function lireFlux(xml) {
  return [...String(xml ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, e]) => {
      const champ = (re) => e.match(re)?.[1] ?? null;
      const lien = champ(/<link[^>]*href="([^"]+)"/) ?? '';
      const vues = champ(/<media:statistics[^>]*views="(\d+)"/);
      return {
        id: champ(/<yt:videoId>([^<]+)</),
        titre: texteXml(champ(/<title>([^<]*)</)).slice(0, 120),
        jour: jourDe(champ(/<published>([^<]+)</)),
        vues: vues === null ? null : Number(vues),
        format: /\/shorts\//.test(lien) ? 'short' : /watch\?v=/.test(lien) ? 'longue' : null,
      };
    })
    .filter((v) => v.id && v.jour);
}

// L'identifiant UC… d'une chaîne : écrit dans config/youtube.json, déjà trouvé par
// l'API ou une lecture précédente, sinon lu une fois sur la page de la chaîne.
async function idChaine(brut, yt, lire) {
  const ref = referenceChaine(brut);
  if (!ref) throw new Error(`chaîne illisible dans config/youtube.json : ${brut}`);
  if (ref.id) return ref.id;
  const connu = yt.flux.ids[ref.forHandle] ?? yt.chaines?.find((c) => c.source === brut)?.id;
  if (connu) return (yt.flux.ids[ref.forHandle] = connu);
  const page = await lire(`https://www.youtube.com/${ref.forHandle}`);
  const id = page.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1] ?? page.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1];
  if (!id) throw new Error(`identifiant introuvable pour ${ref.forHandle}`);
  return (yt.flux.ids[ref.forHandle] = id);
}

export async function synchroniserFluxYoutube(business, { chaines = {}, lire, delaiMs = 20_000, maintenant = new Date() } = {}) {
  const entrees = Object.entries(chaines).flatMap(([projet, liste]) => (liste ?? []).map((brut) => ({ projet, brut })));
  if (!entrees.length) return { ignore: true };
  lire ??= lireTexteParDefaut(delaiMs);
  const yt = (business.sources.youtube ??= { chaines: [], historique: {} });
  yt.flux ??= {};
  yt.flux.ids ??= {};
  yt.flux.chaines ??= {};
  const garder = jourParis(new Date(maintenant - 120 * 86_400_000));
  const erreurs = [];
  let lues = 0;
  for (const { projet, brut } of entrees) {
    try {
      const id = await idChaine(brut, yt, lire);
      const xml = await lire(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
      const nouvelles = lireFlux(xml);
      const avant = yt.flux.chaines[id]?.videos ?? [];
      const ids = new Set(nouvelles.map((v) => v.id));
      const videos = [...nouvelles, ...avant.filter((v) => !ids.has(v.id))].filter((v) => v.jour >= garder).sort((a, b) => b.jour.localeCompare(a.jour));
      const titre = texteXml(String(xml).match(/<title>([^<]*)</)?.[1]).slice(0, 80);
      yt.flux.chaines[id] = { projet, titre, videos };
      lues++;
    } catch (err) {
      erreurs.push(`${brut} : ${err.message}`);
    }
  }
  if (!lues) throw new Error(erreurs.join(' ; ').slice(0, 280));
  yt.flux.maj = maintenant.toISOString();
  yt.flux.erreurs = erreurs;
  return { chaines: lues, erreurs: erreurs.length };
}

// Les chaînes d'un projet (ou toutes), vidéos de l'API complétées par celles du flux.
// Une chaîne connue seulement par le flux n'a ni abonnés ni vues totales : null,
// affiché « indisponible », jamais 0.
export function chainesYoutube(business, projet = null) {
  const yt = business?.sources?.youtube;
  const flux = yt?.flux?.chaines ?? {};
  const duProjet = (p) => !projet || p === projet;
  const res = (yt?.chaines ?? []).filter((c) => duProjet(c.projet)).map((c) => {
    const parId = new Map((flux[c.id]?.videos ?? []).map((v) => [v.id, v]));
    const api = c.videos.map((v) => (parId.has(v.id) ? { ...v, vues: Math.max(v.vues ?? 0, parId.get(v.id).vues ?? 0) } : v));
    const connues = new Set(api.map((v) => v.id));
    const videos = [...api, ...[...parId.values()].filter((v) => !connues.has(v.id))].sort((a, b) => (b.jour ?? '').localeCompare(a.jour ?? ''));
    return { ...c, videos };
  });
  for (const [id, f] of Object.entries(flux))
    if (duProjet(f.projet) && !res.some((c) => c.id === id)) res.push({ projet: f.projet, id, titre: f.titre, abonnes: null, vues: null, nbVideos: null, videos: f.videos });
  return res;
}

// --- Revenus (OAuth, à part de la clé publique) ---------------------------------

const SCOPE_REVENUS = 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly';

// Adresse Google où louis donne son accord (une fois) pour la lecture des revenus.
export function urlAutorisation({ clientId, retour }) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', retour);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE_REVENUS);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

const formulaire = (champs) => new URLSearchParams(champs).toString();
const appelJetonParDefaut = (delaiMs = 20_000) => (champs) =>
  fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formulaire(champs),
    signal: AbortSignal.timeout(delaiMs),
  }).then(async (r) => {
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google répond ${r.status}${corps.error ? ` (${corps.error})` : ''}`);
    return corps;
  });

// Échange le code (reçu au retour de Google) contre le jeton durable à mettre dans .env.
export async function echangerCode({ code, clientId, clientSecret, retour, appelJeton = appelJetonParDefaut() }) {
  const rep = await appelJeton({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: retour, grant_type: 'authorization_code' });
  return { refresh: rep.refresh_token ?? null, acces: rep.access_token ?? null };
}

// Lit les revenus estimés, jour par jour, de chaque chaîne déjà connue (synchroniserYoutube
// d'abord). Une chaîne qui refuse (pas monétisée, autre compte Google…) est notée en erreur,
// jamais devinée : la carte affichera « indisponible », pas 0.
export async function synchroniserRevenus(business, { clientId, clientSecret, refresh, appel, appelJeton = appelJetonParDefaut(), delaiMs = 20_000, maintenant = new Date() } = {}) {
  const yt = business.sources?.youtube;
  if (!yt?.chaines?.length) return { ignore: true };
  if (!appel && (!clientId || !clientSecret || !refresh)) return { ignore: true };
  if (!appel) {
    const { access_token: jeton } = await appelJeton({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: 'refresh_token' });
    appel = (params) => {
      const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return fetch(url, { headers: { authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
        const corps = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`YouTube Analytics répond ${r.status}${corps.error?.message ? ` (${String(corps.error.message).slice(0, 120)})` : ''}`);
        return corps;
      });
    };
  }
  const jour = jourParis(maintenant);
  const depuis = jourParis(new Date(maintenant - 90 * 86_400_000));
  const revenus = { maj: maintenant.toISOString(), devise: 'EUR', parChaine: {}, erreurs: {} };
  for (const c of yt.chaines) {
    try {
      const rep = await appel({ ids: `channel==${c.id}`, startDate: depuis, endDate: jour, metrics: 'estimatedRevenue', dimensions: 'day', currency: 'EUR' });
      const parJour = {};
      for (const [j, montant] of rep.rows ?? []) if (j && montant != null) parJour[j] = Number(montant);
      revenus.parChaine[c.id] = parJour;
    } catch (err) {
      revenus.erreurs[c.id] = String(err.message).slice(0, 200);
    }
  }
  yt.revenus = revenus;
  return { chaines: Object.keys(revenus.parChaine).length, erreurs: Object.keys(revenus.erreurs).length };
}

// Total (et série par jour) des revenus des chaînes données sur la période.
// null tant qu'aucune de ces chaînes n'a de chiffres : la donnée est indisponible, pas nulle.
export function revenusPeriode(yt, chaines, periode) {
  const rev = yt?.revenus?.parChaine;
  if (!rev) return null;
  // Une chaîne sans aucune ligne renvoyée ne compte pas : « indisponible », jamais un faux 0.
  const connues = chaines.filter((c) => rev[c.id] && Object.keys(rev[c.id]).length);
  if (!connues.length) return null;
  const serie = periode.map((j) => connues.reduce((somme, c) => somme + (rev[c.id][j] ?? 0), 0));
  return { total: Math.round(serie.reduce((a, b) => a + b, 0) * 100) / 100, serie };
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
