// Bilan du lundi : chaque lundi matin, Claude écrit une analyse business de la
// semaine, archivée ici. Ce sont des PROPOSITIONS : rien ne se change tout seul.
// Budget séparé des factures/Discuter, avec mode dégradé honnête quand il est atteint.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { MODELE, coutDollars } from './factures.js';
import { jourParis } from './questions.js';

export async function chargerBilans(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { ia: {}, bilans: [] };
    throw err;
  }
}
export const sauverBilans = sauverJson;

export const depenseBilansDuMois = (donnees, jour = jourParis()) => donnees.ia?.[jour.slice(0, 7)] ?? 0;

const heureParis = (d) => Number(new Date(d).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }));

// Le lundi de la semaine d'un jour donné (le bilan porte ce jour-là comme identifiant).
export function lundiDe(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  return jourParis(new Date(d - ((d.getUTCDay() + 6) % 7) * 86_400_000));
}

// C'est lundi, il est assez tard, et le bilan de la semaine n'existe pas encore ?
export function bilanAFaire(donnees, { heure = 8, maintenant = new Date() } = {}) {
  const jour = jourParis(maintenant);
  if (new Date(`${jour}T12:00:00Z`).getUTCDay() !== 1 || heureParis(maintenant) < heure) return null;
  return donnees.bilans.some((b) => b.semaine === jour) ? null : jour;
}

const CONSIGNE = `Tu es le cerveau central de louis : tu surveilles ses projets et tu l'aides à décider.
Chaque lundi tu écris le bilan de la semaine passée à partir des données ci-dessous.
Écris en français simple, orienté business (la priorité de louis : l'argent qui rentre). Pas de jargon technique.
Structure, en 400 mots maximum :
1. La semaine passée, projet par projet : ce qui a avancé, en une ou deux lignes chacun.
2. Ce qui bloque ou n'avance pas, et ce que ça veut dire pour l'argent.
3. Trois propositions pour cette semaine, la plus utile d'abord, chacune en une phrase.
Ce sont des propositions : louis accepte ou refuse, rien ne se fait tout seul. Ne promets rien que les données ne montrent pas.`;

// Génère le bilan du jour `semaine` et l'archive. `client` injectable pour les tests.
export async function genererBilan(donnees, { client, contexte, semaine, plafondDollars = 10, maintenant = new Date() }) {
  const entree = { semaine, cree: maintenant.toISOString(), texte: null, cout: 0, erreur: null };
  if (depenseBilansDuMois(donnees, semaine) >= plafondDollars) {
    entree.erreur = `Plafond du mois atteint (${plafondDollars} $) : pas de bilan cette semaine, retour le mois prochain.`;
  } else {
    try {
      const reponse = await client.beta.messages.create({
        model: MODELE,
        max_tokens: 1500,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: `${CONSIGNE}\n\n${contexte}` }],
      });
      entree.cout = coutDollars(reponse.usage);
      if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé d’écrire ce bilan.');
      entree.texte = (reponse.content.find((b) => b.type === 'text')?.text ?? '').trim() || null;
      if (!entree.texte) entree.erreur = 'Réponse vide.';
    } catch (err) {
      entree.erreur = `Bilan impossible : ${err.message}`;
    }
  }
  if (entree.cout) {
    donnees.ia ??= {};
    const mois = semaine.slice(0, 7);
    donnees.ia[mois] = Math.round(((donnees.ia[mois] ?? 0) + entree.cout) * 10_000) / 10_000;
  }
  donnees.bilans.unshift(entree);
  donnees.bilans = donnees.bilans.slice(0, 60);
  return entree;
}
