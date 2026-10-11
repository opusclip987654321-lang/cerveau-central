// L'analyse du matin : chaque jour vers 7 h, Claude lit les chiffres de la veille
// projet par projet et écrit, pour chacun, une phrase qui challenge louis (page
// Aujourd'hui), ouvre au besoin UNE fiche (question ou action proposée) et répond
// aux fiches où louis a écrit. Budget à part, affiché dans Argent. Rien ne se
// change tout seul : le cerveau propose, louis décide dans la fiche.
import { readFile } from 'node:fs/promises';
import { sauverEtat as sauverJson } from './etat.js';
import { MODELE, coutDollars } from './factures.js';
import { jourParis } from './questions.js';

export async function chargerMatin(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { ia: {}, jours: {} };
    throw err;
  }
}
export const sauverMatin = sauverJson;

export const depenseMatinDuMois = (donnees, jour = jourParis()) => donnees.ia?.[jour.slice(0, 7)] ?? 0;

const heureParis = (d) => Number(new Date(d).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }));

// Il est assez tard et l'analyse du jour n'existe pas encore ?
export function matinAFaire(donnees, { heure = 7, maintenant = new Date() } = {}) {
  const jour = jourParis(maintenant);
  if (heureParis(maintenant) < heure || donnees.jours?.[jour]) return null;
  return jour;
}

// Les phrases du jour pour la page Aujourd'hui : celles du jour, sinon celles de
// la veille (l'analyse passe à 7 h ; avant, la page montre la veille), sinon rien.
export function analysesDuJour(donnees, jour = jourParis()) {
  const hier = jourParis(new Date(new Date(`${jour}T12:00:00Z`) - 86_400_000));
  const entree = donnees.jours?.[jour] ?? donnees.jours?.[hier];
  if (!entree?.projets) return {};
  return Object.fromEntries(Object.entries(entree.projets).filter(([, p]) => p.phrase).map(([id, p]) => [id, { phrase: p.phrase, jour: entree.jour }]));
}

// Les chiffres de chaque projet, tels que les cartes les portent, en texte pour Claude.
export function contexteProjets({ cartes7, cartes1, nomProjet = (id) => id }) {
  const lignes = cartes7.map((c) => {
    const c1 = cartes1.find((x) => x.id === c.id);
    if (c.couleur === 'gris') return `- ${c.nom} (${c.id}) : pas branché, données manquantes : ${c.manque.join(', ') || '?'}`;
    if (c.couleur === 'pause') return `- ${c.nom} (${c.id}) : en pause à la demande de louis`;
    const p = c.principal;
    const chiffres = c.chiffres.map((x) => `${x.titre} : ${x.valeur}${x.detail ? ` (${x.detail})` : ''}`).join(' ; ');
    return [
      `- ${c.nom} (${c.id}) : ${p.titre} = ${p.total} sur 7 jours (7 jours d'avant : ${p.precedent ?? '?'}), hier/aujourd'hui = ${c1?.principal.total ?? '?'}${c.objectif?.valide ? ` ; objectif validé ${c.objectif.valide} par semaine` : ' ; objectif pas encore validé'}`,
      chiffres ? `  autres chiffres : ${chiffres}` : '',
      c.silence ? `  silence : aucun ${p.unite} depuis ${c.silence} jours` : '',
      c.aDecider?.length ? `  à décider (déjà repéré) : ${c.aDecider.join(' / ')}` : '',
      c.manque?.length ? `  pas branché : ${c.manque.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
  void nomProjet;
  return `## Chiffres par projet (cartes du cerveau)\n${lignes.join('\n')}`;
}

const CONSIGNE = `Tu es le cerveau central de louis, son partenaire business quotidien : tu le challenges chaque matin, projet par projet, à partir des chiffres de la veille.
Sa priorité : l'argent qui rentre. Il écrit et lit en français, court et simple ; pas de jargon, pas de compliments, pas de généralités.
Pour chaque projet listé, écris UNE phrase (deux au plus) qui dit ce que les chiffres d'hier veulent dire pour le projet et ce qu'il devrait regarder ou décider : un fait chiffré ou daté, puis la question ou l'enjeu. N'invente rien : une donnée absente se dit « pas branché », jamais 0. Un projet en pause ou pas branché : une phrase courte qui le dit.
Si, pour un projet, un point précis demande une décision de louis aujourd'hui, ouvre une fiche : type « question » (il te manque une information que lui seul a) ou « proposition » (une action concrète à valider : remettre en marche, changer une règle, brancher une donnée ; jamais une corvée manuelle comme seule solution). Une fiche au plus par projet, et aucune si une fiche ouverte porte déjà sur ce sujet (liste fournie). Sinon type « aucune ».
Pour chaque fiche de la liste « Fiches où louis attend ta réponse », réponds-lui (8 lignes au plus) et dis ce que tu attends ensuite : suite « question » si tu as besoin d'une précision, « proposition » si tu lui proposes une action concrète ou de clore la fiche.
Rien ne se change tout seul : tu proposes, louis décide.`;

const SCHEMA = {
  type: 'object',
  properties: {
    projets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          phrase: { type: 'string' },
          fiche: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['aucune', 'question', 'proposition'] },
              titre: { type: 'string', description: 'Le problème en une ligne (vide si aucune)' },
              texte: { type: 'string', description: 'Ta question, ou ton action proposée avec son pourquoi (vide si aucune)' },
            },
            required: ['type', 'titre', 'texte'],
            additionalProperties: false,
          },
        },
        required: ['id', 'phrase', 'fiche'],
        additionalProperties: false,
      },
    },
    reponses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          texte: { type: 'string' },
          suite: { type: 'string', enum: ['question', 'proposition'] },
        },
        required: ['id', 'texte', 'suite'],
        additionalProperties: false,
      },
    },
  },
  required: ['projets', 'reponses'],
  additionalProperties: false,
};

// Lance l'analyse du jour `jour` et l'archive dans `donnees`. `client` injectable.
// `fichesAttente` : les fiches « Réponse du cerveau attendue » avec le dernier mot de louis ;
// `fichesOuvertes` : titres des fiches ouvertes par projet, pour ne pas doublonner.
export async function analyserMatin(donnees, { client, contexte, projets, fichesAttente = [], fichesOuvertes = [], jour, plafondDollars = 5, maintenant = new Date() }) {
  const entree = { jour, cree: maintenant.toISOString(), projets: {}, reponses: [], cout: 0, erreur: null };
  if (!client) entree.erreur = 'La clé Claude n’est pas branchée sur le cerveau.';
  else if (depenseMatinDuMois(donnees, jour) >= plafondDollars) entree.erreur = `Plafond du mois atteint (${plafondDollars} $) : pas d’analyse ce matin, retour le mois prochain.`;
  else {
    const attente = fichesAttente.length
      ? `## Fiches où louis attend ta réponse\n${fichesAttente
          .map((f) => `- id ${f.id} [${f.projet || 'cerveau'}] ${f.titre}\n  problème : ${f.constat}\n  derniers échanges :\n${(f.discussion ?? []).slice(-4).map((m) => `    ${m.role === 'louis' ? 'louis' : 'cerveau'} : ${m.texte}`).join('\n') || '    (aucun)'}`)
          .join('\n')}`
      : '## Fiches où louis attend ta réponse\naucune';
    const ouvertes = fichesOuvertes.length ? `## Fiches déjà ouvertes (ne pas doublonner)\n${fichesOuvertes.map((f) => `- [${f.projet || 'cerveau'}] ${f.titre} (${f.statut})`).join('\n')}` : '## Fiches déjà ouvertes\naucune';
    const liste = `## Projets à analyser (id : nom)\n${projets.map((p) => `- ${p.id} : ${p.nom}`).join('\n')}`;
    try {
      const reponse = await client.beta.messages.create({
        model: MODELE,
        max_tokens: 6000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: `${CONSIGNE}\n\nNous sommes le ${jour}.\n\n${liste}\n\n${contexte}\n\n${ouvertes}\n\n${attente}` }],
      });
      entree.cout = coutDollars(reponse.usage);
      if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé cette analyse.');
      const lu = JSON.parse(reponse.content.find((b) => b.type === 'text')?.text ?? '');
      const ids = new Set(projets.map((p) => p.id));
      for (const p of lu.projets ?? []) {
        if (!ids.has(p.id) || !String(p.phrase ?? '').trim()) continue;
        const f = p.fiche && p.fiche.type !== 'aucune' && String(p.fiche.titre ?? '').trim() ? { type: p.fiche.type, titre: String(p.fiche.titre).trim().slice(0, 300), texte: String(p.fiche.texte ?? '').trim().slice(0, 2000) } : null;
        entree.projets[p.id] = { phrase: String(p.phrase).trim().slice(0, 400), fiche: f };
      }
      const attendues = new Set(fichesAttente.map((f) => f.id));
      entree.reponses = (lu.reponses ?? []).filter((r) => attendues.has(r.id) && String(r.texte ?? '').trim()).map((r) => ({ id: r.id, texte: String(r.texte).trim().slice(0, 4000), suite: r.suite === 'question' ? 'question' : 'proposition' }));
      if (!Object.keys(entree.projets).length) entree.erreur = 'Réponse vide ce matin.';
    } catch (err) {
      entree.erreur = `Analyse impossible : ${err.message}`;
    }
  }
  if (entree.cout) {
    donnees.ia ??= {};
    const mois = jour.slice(0, 7);
    donnees.ia[mois] = Math.round(((donnees.ia[mois] ?? 0) + entree.cout) * 10_000) / 10_000;
  }
  donnees.jours ??= {};
  donnees.jours[jour] = entree;
  // On garde 60 jours.
  for (const j of Object.keys(donnees.jours).sort().slice(0, -60)) delete donnees.jours[j];
  return entree;
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Le message Telegram du matin : une ligne par projet, puis les fiches ouvertes.
export function messageMatin(entree, nomProjet = (id) => id) {
  if (entree.erreur && !Object.keys(entree.projets ?? {}).length) return `🧠 Analyse du matin : ${echapper(entree.erreur)}`;
  const lignes = ['🧠 <b>Ce matin, projet par projet</b>'];
  const fiches = [];
  for (const [id, p] of Object.entries(entree.projets)) {
    lignes.push(`• <b>${echapper(nomProjet(id))}</b> : ${echapper(p.phrase)}`);
    if (p.fiche) fiches.push(`${p.fiche.type === 'question' ? '❓' : '💡'} ${echapper(nomProjet(id))} : ${echapper(p.fiche.titre)}`);
  }
  if (fiches.length) lignes.push('', 'À toi de décider dans Actions :', ...fiches);
  if (entree.reponses?.length) lignes.push('', `${entree.reponses.length} réponse(s) du cerveau sur tes fiches.`);
  return lignes.join('\n');
}
