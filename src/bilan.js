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
export function lundiDe(jour = jourParis()) {
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
Chaque lundi tu analyses la semaine passée à partir des données ci-dessous et tu produis des fiches de problèmes, pas un long bilan.
Réponds UNIQUEMENT avec ce JSON, rien d'autre (pas de texte autour, pas de bloc de code) :
{"fiches":[{"projet":"nour-meet|leviaro|extrait-politique|histoires-vraies|impacteur|cambodge|vegebudget ou null si global","type":"blocage|amelioration|donnee_manquante","constat":"…","consequence":"…","proposition":"…"}]}
3 à 6 fiches, les blocages d'abord. En français simple, sans jargon, orienté business (la priorité de louis : l'argent qui rentre).
- constat : un fait observé dans les données, chiffré ou daté. N'invente rien ; une information absente est une fiche donnee_manquante, pas un zéro.
- consequence : ce que ça veut dire concrètement pour le projet ou l'argent.
- proposition : une amélioration ou une remise en marche de l'automatisation concernée (jamais une corvée manuelle comme seule solution, par exemple « appeler un par un ») ; pour une donnée manquante, dire quoi brancher ou vérifier ; pour un impact inconnu, le plan de diagnostic.
Pas de fiche pour féliciter ce qui marche ni pour donner une note générale. Ce sont des propositions : louis accepte ou refuse, rien ne se fait tout seul.`;

// La réponse doit être du JSON ; on tolère un bloc de code autour, rien de plus.
export function analyserFiches(texte) {
  try {
    const brut = String(texte).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
    const fiches = JSON.parse(brut).fiches;
    if (!Array.isArray(fiches) || !fiches.length) return null;
    const TYPES = new Set(['blocage', 'amelioration', 'donnee_manquante']);
    const propres = fiches
      .filter((f) => f && typeof f.constat === 'string' && f.constat.trim())
      .slice(0, 8)
      .map((f) => ({
        projet: typeof f.projet === 'string' && f.projet !== 'null' ? f.projet.slice(0, 40) : null,
        type: TYPES.has(f.type) ? f.type : 'amelioration',
        constat: String(f.constat).slice(0, 600),
        consequence: String(f.consequence ?? '').slice(0, 600),
        proposition: String(f.proposition ?? '').slice(0, 600),
      }));
    return propres.length ? propres.sort((a, b) => (b.type === 'blocage') - (a.type === 'blocage')) : null;
  } catch {
    return null;
  }
}

// Génère le bilan du jour `semaine` et l'archive. `client` injectable pour les tests.
export async function genererBilan(donnees, { client, contexte, semaine, plafondDollars = 10, maintenant = new Date() }) {
  const entree = { semaine, cree: maintenant.toISOString(), texte: null, fiches: null, cout: 0, erreur: null };
  if (depenseBilansDuMois(donnees, semaine) >= plafondDollars) {
    entree.erreur = `Plafond du mois atteint (${plafondDollars} $) : pas de bilan cette semaine, retour le mois prochain.`;
  } else {
    try {
      const reponse = await client.beta.messages.create({
        model: MODELE,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: `${CONSIGNE}\n\n${contexte}` }],
      });
      entree.cout = coutDollars(reponse.usage);
      if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé d’écrire ce bilan.');
      const brut = (reponse.content.find((b) => b.type === 'text')?.text ?? '').trim() || null;
      // Fiches si le JSON est bon ; sinon on le dit honnêtement au lieu d'afficher du JSON cassé.
      entree.fiches = brut && reponse.stop_reason !== 'max_tokens' ? analyserFiches(brut) : null;
      if (!entree.fiches && brut && /^[`{[]/.test(brut)) entree.erreur = 'Réponse illisible cette fois : clique « Refaire le bilan de cette semaine ».';
      else if (!entree.fiches) entree.texte = brut;
      if (entree.texte && reponse.stop_reason === 'max_tokens') entree.texte += '\n\n(Bilan coupé en route : utilise « Refaire le bilan » pour le réécrire.)';
      if (!entree.texte && !entree.fiches && !entree.erreur) entree.erreur = 'Réponse vide.';
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
