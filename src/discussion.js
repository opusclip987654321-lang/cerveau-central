// Discuter avec le cerveau depuis la page : louis écrit, Claude répond en
// connaissant l'état des projets, l'argent, les serveurs et le journal.
// Le cerveau ne fait que répondre : il n'agit sur rien depuis cette discussion.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { MODELE, coutDollars } from './factures.js';

export async function chargerDiscussion(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { messages: [] };
    throw err;
  }
}
export const sauverDiscussion = sauverJson;

const CONSIGNE = `Tu es le « cerveau central » de louis : tu surveilles ses projets (Nūr Meet, Leviaro, L'extrait politique, Petites histoires vraies, Impacteur Afrique / Frexit, Emploi Cambodge), leurs coûts et ses deux serveurs.
louis écrit en français, de façon courte. Réponds en français, simplement, sans jargon technique, avec un point de vue business : ce qui rapporte, ce qui coûte, ce qu'il faut décider. Sois direct et franc, 6 lignes au plus sauf s'il demande du détail.
Appuie-toi uniquement sur les données ci-dessous ; si une information n'y est pas, dis-le au lieu d'inventer.
Tu ne peux rien modifier toi-même depuis cette discussion. S'il demande un changement (code, serveur, nouvelle fonction), dis-lui de le demander dans son projet Claude, où il sera construit.`;

// `client` est injectable pour les tests. Renvoie { texte, cout } ou { erreur, cout }.
export async function repondre(historique, question, { client, contexte, maxEchanges = 10 }) {
  if (!client) return { erreur: 'La clé Claude n’est pas branchée sur le cerveau.', cout: 0 };
  const passes = historique.slice(-maxEchanges * 2).map((m) => ({ role: m.role === 'louis' ? 'user' : 'assistant', content: m.texte }));
  // L'API veut une alternance qui commence par louis : on fusionne les messages
  // consécutifs du même côté (une question restée sans réponse, par exemple).
  while (passes.length && passes[0].role !== 'user') passes.shift();
  for (let i = passes.length - 1; i > 0; i--)
    if (passes[i].role === passes[i - 1].role) {
      passes[i - 1].content += `\n\n${passes[i].content}`;
      passes.splice(i, 1);
    }
  if (passes.at(-1)?.role === 'user') passes.push({ role: 'assistant', content: '(pas de réponse à ce message)' });
  let cout = 0;
  try {
    const reponse = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 1500,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: `${CONSIGNE}\n\nDonnées du cerveau au ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} :\n${contexte}`,
      messages: [...passes, { role: 'user', content: question }],
    });
    cout = coutDollars(reponse.usage);
    const texte = reponse.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!texte) throw new Error('réponse vide');
    return { texte, cout };
  } catch (err) {
    return { erreur: `Réponse impossible : ${err.message}`, cout };
  }
}

export function ajouterEchange(donnees, question, { texte, erreur }, maintenant = new Date()) {
  const quand = maintenant.toISOString();
  donnees.messages.push({ role: 'louis', texte: question, quand });
  donnees.messages.push({ role: 'cerveau', texte: texte ?? erreur, quand: new Date().toISOString(), erreur: Boolean(erreur) });
  donnees.messages = donnees.messages.slice(-400);
}
