// Serveurs : chaque VPS envoie un relevé par heure (scripts/releve.sh). Le cerveau
// garde le dernier et l'évolution de la place, et en tire des conseils simples.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerServeurs(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { serveurs: {} };
    throw err;
  }
}
export const sauverServeurs = sauverJson;

// « 1.2GB », « 512MiB », « 0B », « 12.5kB » → octets.
export function octets(texte) {
  const m = String(texte ?? '').trim().match(/^([\d.]+)\s*([kKMGTP]?)(i?)B$/);
  if (!m) return 0;
  const base = m[3] ? 1024 : 1000;
  return Math.round(Number(m[1]) * base ** ' KMGTP'.indexOf(m[2].toUpperCase() || ' '));
}

const lignesJson = (texte) =>
  texte
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });

// Découpe le texte envoyé par releve.sh en un relevé structuré.
export function lireReleve(texte) {
  const sections = {};
  let courante = null;
  for (const ligne of texte.split('\n')) {
    const m = ligne.match(/^### (\w+)$/);
    if (m) sections[(courante = m[1])] = [];
    else if (courante) sections[courante].push(ligne);
  }
  const s = (nom) => (sections[nom] ?? []).join('\n').trim();

  const mem = (cle) => Number(s('memoire').match(new RegExp(`^${cle}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) * 1024;
  const disques = s('disques')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length >= 6 && /^\d+$/.test(c[1]))
    .map((c) => ({ point: c[5], total: Number(c[1]), utilise: Number(c[2]) }));

  const stats = new Map(lignesJson(s('stats')).map((x) => [x.Name, x]));
  const conteneurs = lignesJson(s('conteneurs')).map((c) => {
    const st = stats.get(c.Names);
    return {
      nom: c.Names,
      image: c.Image,
      enMarche: c.State === 'running',
      statut: c.Status,
      compose: /com\.docker\.compose\.project=([^,]+)/.exec(c.Labels ?? '')?.[1] ?? null,
      taille: octets(String(c.Size ?? '').split(' ')[0]),
      memoire: st ? octets(String(st.MemUsage).split('/')[0]) : 0,
      cpu: st ? Number(String(st.CPUPerc).replace('%', '')) || 0 : 0,
    };
  });

  const docker = {};
  for (const d of lignesJson(s('docker'))) {
    const cle = { Images: 'images', Containers: 'conteneurs', 'Local Volumes': 'volumes', 'Build Cache': 'cache' }[d.Type];
    if (cle) docker[cle] = { taille: octets(d.Size), recuperable: octets(String(d.Reclaimable).split(' ')[0]) };
  }
  let volumes = [];
  try {
    volumes = (JSON.parse(s('volumes') || '[]') ?? []).map((v) => ({ nom: v.Name, taille: octets(v.Size) })).filter((v) => v.taille > 0);
  } catch {}
  const dossiers = s('dossiers')
    .split('\n')
    .map((l) => l.match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ chemin: m[2], taille: Number(m[1]) }));

  return {
    hote: s('hote'),
    coeurs: Number(s('coeurs')) || 1,
    charge: Number(s('charge').split(/\s+/)[2]) || 0,
    memoire: { total: mem('MemTotal'), dispo: mem('MemAvailable') },
    disques,
    conteneurs,
    docker,
    volumes: volumes.sort((a, b) => b.taille - a.taille),
    dossiers,
  };
}

// Le disque principal : celui monté sur / (sinon le plus gros).
export const disquePrincipal = (r) => r.disques.find((d) => d.point === '/') ?? [...r.disques].sort((a, b) => b.total - a.total)[0] ?? null;

export function enregistrerReleve(donnees, id, releve, date = new Date().toISOString()) {
  const s = (donnees.serveurs[id] ??= { historique: [] });
  s.dernier = releve;
  s.recu = date;
  const d = disquePrincipal(releve);
  s.historique.push({ date, disque: d?.utilise ?? null, total: d?.total ?? null, memoire: releve.memoire.total - releve.memoire.dispo });
  s.historique = s.historique.slice(-24 * 90);
  return s;
}

// À quel projet appartient un conteneur ou un dossier.
export function projetDe(nom, motifs, defaut = 'Autre') {
  return motifs.find((m) => new RegExp(m.motif).test(nom))?.projet ?? defaut;
}

// Pente de l'espace disque (octets par jour) sur les `jours` derniers jours.
export function croissanceParJour(historique, maintenant = new Date(), jours = 14) {
  const depuis = maintenant - jours * 86_400_000;
  const points = historique.filter((h) => h.disque != null && new Date(h.date) >= depuis).map((h) => [new Date(h.date) / 86_400_000, h.disque]);
  if (points.length < 2 || points.at(-1)[0] - points[0][0] < 1) return null;
  const mx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const my = points.reduce((a, p) => a + p[1], 0) / points.length;
  const num = points.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const den = points.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return den ? num / den : null;
}

export const goLisible = (o) => {
  if (o >= 1024 ** 3) return `${(o / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
  if (o >= 1024 ** 2) return `${Math.round(o / 1024 ** 2)} Mo`;
  return `${Math.round(o / 1024)} Ko`;
};

// Regarde un serveur et dit ce qui mérite l'attention, en clair.
export function analyser(serveur, config, maintenant = new Date()) {
  const conseils = [];
  if (!serveur?.dernier) return { conseils, joursAvantPlein: null, pctDisque: null, pctMemoire: null, enRetard: false };
  const r = serveur.dernier;
  const minutes = (maintenant - new Date(serveur.recu)) / 60_000;
  const enRetard = minutes > (config.releveMaxMinutes ?? 180);
  if (enRetard) conseils.push({ niveau: 'panne', texte: `Pas de relevé depuis ${Math.round(minutes / 60)} h : le serveur est peut-être éteint, ou le relevé ne part plus.` });

  const d = disquePrincipal(r);
  const pctDisque = d ? Math.round((d.utilise / d.total) * 100) : null;
  const pente = croissanceParJour(serveur.historique, maintenant);
  const joursAvantPlein = d && pente > 0 ? Math.max(0, Math.round((d.total * 0.95 - d.utilise) / pente)) : null;
  if (pctDisque >= 90) conseils.push({ niveau: 'panne', texte: `Disque presque plein (${pctDisque} %). Il faut libérer de la place ou passer à un VPS plus grand.` });
  else if (pctDisque >= 80) conseils.push({ niveau: 'attention', texte: `Disque rempli à ${pctDisque} %.` });
  if (joursAvantPlein !== null && joursAvantPlein < 60)
    conseils.push({ niveau: joursAvantPlein < 14 ? 'panne' : 'attention', texte: `Au rythme actuel (+${goLisible(pente)} par jour), le disque sera plein dans environ ${joursAvantPlein} jours.` });

  const recuperable = (r.docker.images?.recuperable ?? 0) + (r.docker.cache?.recuperable ?? 0);
  if (recuperable >= 1024 ** 3)
    conseils.push({ niveau: 'info', texte: `${goLisible(recuperable)} sont pris par d'anciennes images Docker et du cache inutilisés. Un nettoyage (avec ton accord) les libérerait sans rien casser.` });
  const arretes = r.conteneurs.filter((c) => !c.enMarche);
  if (arretes.length) conseils.push({ niveau: 'info', texte: `${arretes.length} conteneur(s) arrêté(s) : ${arretes.map((c) => c.nom).join(', ')}. À supprimer s'ils ne servent plus.` });

  const pctMemoire = r.memoire.total ? Math.round(((r.memoire.total - r.memoire.dispo) / r.memoire.total) * 100) : null;
  if (pctMemoire >= 85) conseils.push({ niveau: 'attention', texte: `Mémoire utilisée à ${pctMemoire} %.` });
  const gourmand = [...r.conteneurs].sort((a, b) => b.memoire - a.memoire)[0];
  if (gourmand && r.memoire.total && gourmand.memoire / r.memoire.total > 0.4)
    conseils.push({ niveau: 'info', texte: `${gourmand.nom} utilise à lui seul ${Math.round((gourmand.memoire / r.memoire.total) * 100)} % de la mémoire.` });

  return { conseils, joursAvantPlein, pctDisque, pctMemoire, enRetard, pente };
}

// Conseils qui comparent les serveurs entre eux (rééquilibrer la charge).
export function conseilsEntreServeurs(config, donnees, analyses) {
  const conseils = [];
  const connus = config.serveurs.filter((s) => analyses[s.id]?.pctDisque != null);
  for (const plein of connus)
    for (const vide of connus) {
      const a = analyses[plein.id];
      const b = analyses[vide.id];
      if (plein === vide || a.pctDisque < 75 || b.pctDisque > 50) continue;
      const gros = Object.entries(parProjet(donnees.serveurs[plein.id].dernier, config))
        .filter(([p]) => p !== 'Caddy (adresses web)' && p !== 'Système')
        .sort((x, y) => y[1].disque - x[1].disque)[0];
      conseils.push({
        niveau: 'info',
        texte: `${plein.nom} est rempli à ${a.pctDisque} % et ${vide.nom} à ${b.pctDisque} %.${gros ? ` Déplacer « ${gros[0]} » (${goLisible(gros[1].disque)}) vers ${vide.nom} équilibrerait.` : ''}`,
      });
    }
  return conseils;
}

// Regroupe conteneurs, volumes et dossiers par projet.
export function parProjet(releve, config) {
  const projets = {};
  const p = (nom) => (projets[nom] ??= { conteneurs: [], memoire: 0, disque: 0, cpu: 0, dossiers: [] });
  const conteneurDuVolume = new Map();
  for (const c of releve.conteneurs) {
    const x = p(projetDe(c.nom, config.motifs));
    x.conteneurs.push(c);
    x.memoire += c.memoire;
    x.cpu += c.cpu;
    x.disque += c.taille;
    if (c.compose) conteneurDuVolume.set(c.compose, projetDe(c.nom, config.motifs));
  }
  for (const v of releve.volumes) {
    const compose = [...conteneurDuVolume.keys()].find((k) => v.nom.startsWith(`${k}_`));
    p(compose ? conteneurDuVolume.get(compose) : projetDe(v.nom, config.motifs)).disque += v.taille;
  }
  for (const d of releve.dossiers) {
    const nom = projetDe(d.chemin, config.dossiers ?? [], null);
    if (!nom) continue;
    p(nom).disque += d.taille;
    p(nom).dossiers.push(d);
  }
  return projets;
}
