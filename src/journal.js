// Journal : ce qui a été fait chaque jour, projet par projet. Trois sources :
// les événements envoyés par n8n (vidéo publiée, mails envoyés…), les exécutions
// n8n comptées automatiquement, et les notes ajoutées à la main sur la page.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';

export async function chargerJournal(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { evenements: [], n8n: { jours: {}, dernierId: null } };
    throw err;
  }
}
export const sauverJournal = sauverJson;

const lienSur = (l) => {
  try {
    const u = new URL(String(l));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
};

// Vérifie un événement (envoyé par n8n ou saisi sur la page) et l'ajoute.
export function ajouterEvenement(journal, config, champs, { source = 'n8n', maintenant = new Date() } = {}) {
  const projet = config.projets.find((p) => p.id === champs.projet);
  if (!projet) return { erreur: `Projet inconnu : ${champs.projet}. Projets possibles : ${config.projets.map((p) => p.id).join(', ')}` };
  const titre = String(champs.titre ?? '').trim().slice(0, 200);
  if (!titre) return { erreur: 'Il manque le titre.' };
  const type = config.types[champs.type] ? champs.type : source === 'page' ? 'note' : 'autre';
  const date = champs.date && !Number.isNaN(Date.parse(champs.date)) ? new Date(champs.date) : maintenant;
  const evenement = {
    id: randomBytes(6).toString('hex'),
    date: date.toISOString(),
    jour: jourParis(date),
    projet: projet.id,
    type,
    titre,
    lien: champs.lien ? lienSur(champs.lien) : null,
    details: champs.details ? String(champs.details).slice(0, 500) : null,
    source,
  };
  journal.evenements.unshift(evenement);
  journal.evenements = journal.evenements.slice(0, 5000);
  return { evenement };
}

export const projetDuWorkflow = (nom, config) =>
  config.projets.find((p) => p.motifs.some((m) => new RegExp(m, 'i').test(nom)))?.id ?? 'autre';

// Compte les exécutions n8n par jour et par automatisation, sans recompter les
// mêmes : on avance jusqu'à la dernière exécution déjà vue.
export async function synchroniserN8n(journal, { url, cle, instance = 'principal', delaiMs = 15_000, maxPages = 10, appel } = {}) {
  if (!appel && (!url || !cle)) return { nouvelles: 0, ignore: true };
  appel ??= (chemin) =>
    fetch(new URL(chemin, url), { headers: { 'X-N8N-API-KEY': cle, accept: 'application/json' }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
  const workflows = await appel('/api/v1/workflows?limit=250');
  const noms = new Map((workflows.data ?? []).map((w) => [String(w.id), w.name]));
  // Chaque n8n a sa propre suite d'identifiants ; le principal garde l'ancien champ.
  const curseurs = (journal.n8n.curseurs ??= {});
  const lu = instance === 'principal' ? journal.n8n.dernierId : curseurs[instance];
  const dejaVu = lu != null ? Number(lu) : null;
  const limite = Date.now() - 8 * 86_400_000;
  let curseur = null;
  let plusRecent = dejaVu;
  let nouvelles = 0;
  pages: for (let page = 0; page < maxPages; page++) {
    const rep = await appel(`/api/v1/executions?limit=250${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`);
    for (const ex of rep.data ?? []) {
      const id = Number(ex.id);
      if ((dejaVu !== null && id <= dejaVu) || new Date(ex.startedAt) < limite) break pages;
      if (ex.status === 'running' || ex.status === 'waiting' || ex.status === 'new') continue;
      plusRecent = Math.max(plusRecent ?? id, id);
      const jour = jourParis(new Date(ex.startedAt));
      const nom = noms.get(String(ex.workflowId)) ?? `Automatisation ${ex.workflowId}`;
      const c = ((journal.n8n.jours[jour] ??= {})[nom] ??= { ok: 0, erreur: 0 });
      if (ex.status === 'success') c.ok++;
      else if (ex.status === 'error' || ex.status === 'crashed') c.erreur++;
      else continue;
      nouvelles++;
    }
    if (!rep.nextCursor) break;
    curseur = rep.nextCursor;
  }
  if (plusRecent !== null) {
    if (instance === 'principal') journal.n8n.dernierId = String(plusRecent);
    else curseurs[instance] = String(plusRecent);
  }
  // On garde 120 jours de comptes.
  const garder = jourParis(new Date(Date.now() - 120 * 86_400_000));
  for (const j of Object.keys(journal.n8n.jours)) if (j < garder) delete journal.n8n.jours[j];
  return { nouvelles };
}

// Ce qui s'est passé un jour donné, projet par projet.
export function journee(journal, config, jour, filtreProjet = null) {
  const projets = new Map();
  const p = (id) => {
    if (!projets.has(id)) projets.set(id, { projet: config.projets.find((x) => x.id === id) ?? { id, nom: id }, evenements: [], automatisations: [] });
    return projets.get(id);
  };
  for (const e of journal.evenements) if (e.jour === jour && (!filtreProjet || e.projet === filtreProjet)) p(e.projet).evenements.push(e);
  for (const [nom, c] of Object.entries(journal.n8n.jours[jour] ?? {})) {
    const id = projetDuWorkflow(nom, config);
    if (!filtreProjet || id === filtreProjet) p(id).automatisations.push({ nom, ...c });
  }
  const ordre = config.projets.map((x) => x.id);
  return [...projets.values()]
    .map((x) => ({ ...x, evenements: x.evenements.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => ordre.indexOf(a.projet.id) - ordre.indexOf(b.projet.id));
}

// Totaux par projet et par type sur les `jours` derniers jours.
export function bilanSemaine(journal, config, jour = jourParis(), jours = 7) {
  const depuis = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - (jours - 1) * 86_400_000));
  const totaux = {};
  for (const e of journal.evenements) {
    if (e.jour < depuis || e.jour > jour) continue;
    const t = ((totaux[e.projet] ??= { types: {}, executions: 0, erreurs: 0 }).types[e.type] ??= 0);
    totaux[e.projet].types[e.type] = t + 1;
  }
  for (const [j, wf] of Object.entries(journal.n8n.jours)) {
    if (j < depuis || j > jour) continue;
    for (const [nom, c] of Object.entries(wf)) {
      const x = (totaux[projetDuWorkflow(nom, config)] ??= { types: {}, executions: 0, erreurs: 0 });
      x.executions += c.ok;
      x.erreurs += c.erreur;
    }
  }
  return totaux;
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Les lignes « hier » du résumé Telegram du matin.
export function messageHier(journal, config, jour = jourParis()) {
  const hier = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - 86_400_000));
  const j = journee(journal, config, hier).filter((x) => x.evenements.length || x.automatisations.length);
  if (!j.length) return null;
  const lignes = ['📒 <b>Hier, projet par projet</b>'];
  for (const x of j) {
    const parts = x.evenements.slice(0, 4).map((e) => `${config.types[e.type]} ${echapper(e.titre)}`);
    if (x.evenements.length > 4) parts.push(`+ ${x.evenements.length - 4} autre(s)`);
    const ok = x.automatisations.reduce((a, c) => a + c.ok, 0);
    const ko = x.automatisations.reduce((a, c) => a + c.erreur, 0);
    if (ok || ko) parts.push(`⚙️ ${ok} exécution(s)${ko ? `, ${ko} en erreur` : ''}`);
    lignes.push(`<b>${echapper(x.projet.nom)}</b> : ${parts.join(' · ')}`);
  }
  return lignes.join('\n');
}
