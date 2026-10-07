// Pause / Reprendre d'un projet, depuis la page. Pause : le cerveau désactive dans
// n8n les automatisations actives du projet (et retient lesquelles) et coupe ses
// alertes. Reprendre : il réactive exactement celles-là. C'est louis qui clique :
// c'est son accord pour cette action, et seulement celle-là.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { projetDuWorkflow } from './journal.js';

export async function chargerPauses(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { projets: {} };
    throw err;
  }
}
export const sauverPauses = sauverJson;

// Ce qui tourne hors n8n : le bouton ne peut pas l'arrêter, on le dit sur la page.
export const HORS_N8N = {
  leviaro: 'ses conteneurs leviaro-agent continuent de tourner (hors n8n)',
  'histoires-vraies': 'programme hors n8n, sa fabrication automatique est déjà en pause',
  vegebudget: 'le site reste en ligne (hors n8n) ; seules ses alertes se taisent',
};

// Projets de la surveillance dont les alertes se taisent quand un projet est en pause.
export const SURVEILLANCE = { 'nour-meet': ['nour-meet'], leviaro: ['leviaro'], 'histoires-vraies': ['histoires-vraies'], 'extrait-politique': ['vps-youtube'], vegebudget: ['vegebudget'] };
export const alertesCoupees = (pauses) => new Set(Object.keys(pauses.projets).flatMap((p) => SURVEILLANCE[p] ?? []));

function client(url, cle, delaiMs = 15_000) {
  return (chemin, methode = 'GET') =>
    fetch(new URL(chemin, url), { method: methode, headers: { 'X-N8N-API-KEY': cle, accept: 'application/json' }, signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
}

// `appels` : { instance: fonction d'appel } injectable pour les tests.
export async function pauserProjet(pauses, projet, { instances, configJournal, appels = {}, maintenant = new Date() }) {
  if (pauses.projets[projet]) return { deja: true };
  const coupes = [];
  const erreurs = [];
  for (const [instance, { url, cle }] of Object.entries(instances)) {
    const appel = appels[instance] ?? (url && cle ? client(url, cle) : null);
    if (!appel) continue;
    try {
      const liste = await appel('/api/v1/workflows?limit=250');
      for (const w of liste.data ?? []) {
        if (!w.active || projetDuWorkflow(w.name, configJournal, instance) !== projet) continue;
        try {
          await appel(`/api/v1/workflows/${encodeURIComponent(w.id)}/deactivate`, 'POST');
          coupes.push({ instance, id: String(w.id), nom: w.name });
        } catch (err) {
          erreurs.push(`${w.name} : ${err.message}`);
        }
      }
    } catch (err) {
      erreurs.push(`n8n ${instance} : ${err.message}`);
    }
  }
  pauses.projets[projet] = { depuis: maintenant.toISOString(), workflows: coupes };
  return { coupes, erreurs };
}

export async function reprendreProjet(pauses, projet, { instances, appels = {} }) {
  const p = pauses.projets[projet];
  if (!p) return { deja: true };
  const relances = [];
  const erreurs = [];
  const restants = [];
  for (const w of p.workflows) {
    const { url, cle } = instances[w.instance] ?? {};
    const appel = appels[w.instance] ?? (url && cle ? client(url, cle) : null);
    try {
      if (!appel) throw new Error('clé n8n absente');
      await appel(`/api/v1/workflows/${encodeURIComponent(w.id)}/activate`, 'POST');
      relances.push(w);
    } catch (err) {
      erreurs.push(`${w.nom} : ${err.message}`);
      restants.push(w);
    }
  }
  // Si une automatisation n'a pas pu repartir, le projet reste en pause pour réessayer.
  if (restants.length) p.workflows = restants;
  else delete pauses.projets[projet];
  return { relances, erreurs };
}
