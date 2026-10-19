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

// Recherche web de Claude (choix de louis du 19/10) : seulement quand la question
// porte sur un fait extérieur, 3 recherches au plus par réponse, ~1 centime l'une.
const RECHERCHE_WEB = { type: 'web_search_20260209', name: 'web_search', max_uses: 3 };
const WEB = `Tu peux chercher sur internet, mais seulement quand la question porte sur un fait extérieur que ces données ne contiennent pas (un outil, un prix, une entreprise, une actualité) ; dis alors clairement ce qui vient du web. Pour le reste, ne cherche pas. Les liens de tes sources s'affichent sous ta réponse.`;

const CONSIGNE = `Tu es le « cerveau central » de louis : tu surveilles ses projets (Nūr Meet, Leviaro, L'extrait politique, Petites histoires vraies, Impacteur Afrique / Frexit, Emploi Cambodge), leurs coûts et ses deux serveurs.
louis écrit en français, de façon courte. Réponds en français, simplement, sans jargon technique, avec un point de vue business : ce qui rapporte, ce qui coûte, ce qu'il faut décider. Sois direct et franc, 6 lignes au plus sauf s'il demande du détail.
Pour ses projets, appuie-toi sur les données ci-dessous ; si une information n'y est pas, dis-le au lieu d'inventer.
${WEB}
Tu ne peux rien modifier toi-même depuis cette discussion. S'il demande un changement (code, serveur, nouvelle fonction), dis-lui de le demander dans son projet Claude, où il sera construit.`;

// Pour la discussion attachée à une fiche d'action : le cerveau aide à résoudre CE problème.
export const CONSIGNE_ACTION = `Tu es le « cerveau central » de louis : tu surveilles ses projets, leurs coûts et ses deux serveurs.
Cette discussion porte sur UNE fiche d'action précise (un problème à résoudre), décrite dans les données sous « La fiche d'action discutée ».
Aide louis à comprendre la cause et à décider : distingue les faits vérifiés des hypothèses, propose un diagnostic et des solutions concrètes qui améliorent ou rétablissent ses automatisations (jamais « fais-le à la main » comme seule réponse).
Pour ses projets, appuie-toi sur les données ci-dessous ; si une information manque, dis laquelle et comment l'obtenir, au lieu d'inventer.
${WEB}
Rien ne se change tout seul : tu proposes, louis décide, et les corrections passent par Claude ou les outils après son accord.
Réponds en français simple, sans jargon, 8 lignes au plus sauf s'il demande du détail.
Termine toujours par ce que tu attends de lui : soit une question précise (suite = question), soit une action concrète à valider, y compris « clore la fiche » si tout est réglé (suite = proposition).`;

// Sur une fiche, la réponse dit aussi ce qu'elle change : une question posée à
// louis, ou une action proposée qu'il valide. C'est elle qui fixe le statut.
const SCHEMA_FICHE = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: 'Ta réponse à louis, en français simple, 8 lignes au plus' },
    suite: { type: 'string', enum: ['question', 'proposition'], description: 'question : tu as besoin d’une précision de louis ; proposition : tu lui proposes une action concrète (ou de clore) qu’il valide' },
    sources: { type: 'array', items: { type: 'string' }, description: 'adresses des pages web utilisées pour répondre, vide si tu n’as pas cherché sur internet' },
  },
  required: ['reponse', 'suite', 'sources'],
  additionalProperties: false,
};

// `client` est injectable pour les tests. Renvoie { texte, cout } ou { erreur, cout }.
// Avec `fiche: true`, renvoie aussi `suite` ('question' ou 'proposition').
export async function repondre(historique, question, { client, contexte, maxEchanges = 10, consigne = CONSIGNE, fiche = false }) {
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
  const base = {
    model: MODELE,
    max_tokens: 3000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: fiche ? { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_FICHE } } : { effort: 'low' },
    system: `${consigne}\n\nDonnées du cerveau au ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} :\n${contexte}`,
  };
  const messages = [...passes, { role: 'user', content: question }];
  let cout = 0;
  // Une recherche longue peut s'arrêter en pause (pause_turn) : on relance la suite, deux fois au plus.
  const demander = async (outils) => {
    const blocs = [];
    let suite = messages;
    for (let tour = 0; tour < 3; tour++) {
      const reponse = await client.beta.messages.create({ ...base, ...(outils ? { tools: outils } : {}), messages: suite });
      cout += coutDollars(reponse.usage);
      blocs.push(...reponse.content);
      if (reponse.stop_reason !== 'pause_turn') break;
      suite = [...messages, { role: 'assistant', content: blocs }];
    }
    return blocs;
  };
  try {
    let blocs;
    try {
      blocs = await demander([RECHERCHE_WEB]);
    } catch (err) {
      // Si l'API refuse la recherche web (requête invalide), on répond sans internet plutôt que pas du tout.
      if (err?.status !== 400) throw err;
      blocs = await demander(null);
    }
    // La réponse est le texte écrit après la dernière recherche (avant, Claude annonce
    // seulement ce qu'il va chercher). Il arrive en morceaux, un par citation : on les recolle tels quels.
    const apres = blocs.slice(blocs.findLastIndex((b) => b.type === 'web_search_tool_result') + 1);
    const brut = apres.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!brut) throw new Error('réponse vide');
    if (!fiche) return { texte: avecSources(brut, sourcesWeb(blocs)), cout };
    const lu = JSON.parse(brut);
    if (!String(lu.reponse ?? '').trim()) throw new Error('réponse vide');
    const texte = avecSources(String(lu.reponse).trim(), sourcesWeb(blocs, lu.sources));
    return { texte, suite: lu.suite === 'question' ? 'question' : 'proposition', cout };
  } catch (err) {
    return { erreur: `Réponse impossible : ${err.message}`, cout };
  }
}

// Pages web réellement trouvées par la recherche : citations du texte, puis les
// adresses que Claude dit avoir utilisées (gardées seulement si la recherche les
// a bien renvoyées, pour ne jamais afficher un lien inventé). Un résultat de
// recherche en erreur a un objet à la place de la liste : il est ignoré.
export function sourcesWeb(blocs, declarees = []) {
  const trouvees = new Map();
  for (const b of blocs)
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content))
      for (const r of b.content) if (r?.url) trouvees.set(r.url, r.title || r.url);
  const sources = new Map();
  for (const b of blocs)
    if (b.type === 'text')
      for (const c of b.citations ?? []) if (c?.url) sources.set(c.url, c.title || trouvees.get(c.url) || c.url);
  for (const url of Array.isArray(declarees) ? declarees : []) if (trouvees.has(url)) sources.set(url, trouvees.get(url));
  return [...sources].slice(0, 5).map(([url, titre]) => ({ url, titre }));
}

const avecSources = (texte, sources) =>
  sources.length ? `${texte}\n\nSources (web) :\n${sources.map((s) => `- ${s.titre} : ${s.url}`).join('\n')}` : texte;

export function ajouterEchange(donnees, question, { texte, erreur }, maintenant = new Date()) {
  const quand = maintenant.toISOString();
  donnees.messages.push({ role: 'louis', texte: question, quand });
  donnees.messages.push({ role: 'cerveau', texte: texte ?? erreur, quand: new Date().toISOString(), erreur: Boolean(erreur) });
  donnees.messages = donnees.messages.slice(-400);
}
