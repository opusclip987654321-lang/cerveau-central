// Loop Nūr Meet restaurateurs (choix de louis du 19/10) : une boucle fermée qui
// vise des restaurateurs abonnés. Elle mesure (réponses triées par Claude, reliées
// au mail et à la version de texte qui les a déclenchées), retient (data/loop-nour-meet.json),
// décide seule chaque semaine de la « méthode » (textes, recherches, relances, volume)
// que « Nour Meet 1 » et « Nour Meet 3 » lisent chaque matin, et écrit ce qu'elle a
// changé et pourquoi. Un pivot jugé trop radical attend la réponse de louis.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';
import { jourParis } from './questions.js';

export const MODELE_TRI = 'claude-haiku-5-5';
export const MODELE_REVUE = 'claude-opus-5-5';
// Dollars par million de jetons (entrée, sortie).
const PRIX = { [MODELE_TRI]: [0.1, 0.5], [MODELE_REVUE]: [4, 20] };
const cout = (modele, u = {}) => {
  const [e, s] = PRIX[modele] ?? PRIX[MODELE_REVUE];
  return ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) * (e / 1e6) + (u.output_tokens ?? 0) * (s / 1e6);
};

// Les types de réponse. Les deux premiers sont le succès que la loop cherche.
export const TYPES_REPONSE = {
  INTERESSE: 'intéressé (veut parler, rappel, rendez-vous)',
  QUESTION: 'pose une question (prix, fonctionnement…)',
  REFUS: 'refus ou « stop »',
  AUTOMATIQUE: 'message automatique ou adresse morte',
  AUTRE: 'autre',
};
export const POSITIFS = new Set(['INTERESSE', 'QUESTION']);

// Les gabarits : {nom}, {lieu} (« nom à ville »), {accroche} (phrase tirée du site du
// restaurant), {lien} (page restaurateurs, marquée par version et type de mail), {pied}
// (signature et ligne « STOP », obligatoires). Nour Meet 1 et 3 font le même remplacement.
const PIED_OBLIGATOIRE = ['{lien}', '{pied}'];

// La méthode d'avant la loop, recopiée de Nour Meet 1 et 3 le 19/10 (version 1).
export const METHODE_DEPART = {
  version: 1,
  textes: {
    initial: {
      objet: '{nom} : proposer vos soirées rencontre et networking sur Nūr Meet',
      corps:
        "Bonjour,\n\nJe vous écris au nom de Nūr Meet, une plateforme qui publie des soirées de rencontre et de networking organisées dans des restaurants d'Île-de-France.\n\n{accroche}\n\nLe principe est simple :\n- vous proposez vos propres soirées payantes, de rencontre ou de networking, et publiez l'annonce sur Nūr Meet ;\n- vous restez l'organisateur de la soirée dans votre établissement ;\n- notre équipe valide chaque annonce avant sa publication.\n\nPour candidater, il suffit de créer votre compte ici : {lien}\n\nJe reste disponible pour répondre à vos questions par simple retour de mail.\n\n{pied}",
    },
    relance1: {
      objet: 'Nūr Meet : vos soirées chez {nom} ?',
      corps:
        "Bonjour,\n\nJe me permets de revenir vers vous au sujet de Nūr Meet. Si l'idée d'organiser des soirées de rencontre ou de networking chez {nom} vous intéresse, la candidature se fait en quelques minutes : {lien}\n\nNous validons chaque annonce avant publication, et vous restez l'organisateur de vos soirées.\n\n{pied}",
    },
    relance2: {
      objet: 'Dernier message : Nūr Meet et {nom}',
      corps:
        "Bonjour,\n\nJe vous adresse un dernier message au sujet de Nūr Meet. Si ce n'est pas le bon moment, aucun souci, je ne vous relancerai plus.\n\nSi l'idée vous tente plus tard, vous pourrez toujours candidater ici : {lien}\n\n{pied}",
    },
  },
  recherches: ['restaurant halal haut de gamme', 'restaurant sans alcool chic', 'restaurant privatisable pour soirée', 'restaurant lounge chicha', 'restaurant gastronomique halal'],
  relanceJours: [4, 9],
  parJour: 50,
};

// Version 2, écrite par Claude dans le fil de la loop le 19/10 à partir de l'état des
// lieux : les seuls restaurants intéressés ont répondu au mail le plus court et le plus
// franc, et ils demandaient le prix et ce que la plateforme leur apporte. Le premier
// mail dit donc ce que le restaurant y gagne, le prix et propose un rappel.
export const METHODE_V2 = {
  ...METHODE_DEPART,
  version: 2,
  textes: {
    initial: {
      objet: '{nom} : des soirées rencontre et networking pour remplir vos tables',
      corps:
        "Bonjour,\n\nJe suis Walid, de Nūr Meet. Nous aidons les restaurants d'Île-de-France à remplir leurs soirées avec des événements speed dating et networking.\n\n{accroche}\n\nConcrètement :\n- vous fixez la date, le prix et ce qui est compris ;\n- Nūr Meet présente la soirée à ses membres et s'occupe de la billetterie, du paiement en ligne et des remboursements ;\n- les places sont payées d'avance et les participants sont vérifiés.\n\nL'abonnement commence à 69 € HT par mois, sans engagement. Tout est expliqué ici : {lien}\n\nSi vous préférez en parler de vive voix, répondez simplement avec un numéro et un créneau : je vous rappelle.\n\n{pied}",
    },
    relance1: {
      objet: 'Nūr Meet : une soirée networking chez {nom} ?',
      corps:
        "Bonjour,\n\nJe reviens vers vous pour Nūr Meet : vous organisez chez {nom} des soirées rencontre ou networking au prix que vous fixez, nous les présentons à nos membres et gérons la billetterie.\n\nIntéressé ? Répondez avec un numéro, je vous rappelle. Les détails et les tarifs : {lien}\n\n{pied}",
    },
    relance2: {
      objet: 'Dernier message : Nūr Meet et {nom}',
      corps:
        "Bonjour,\n\nJe vous adresse un dernier message au sujet de Nūr Meet. Si ce n'est pas le bon moment, aucun souci, je ne vous relancerai plus.\n\nSi l'idée vous tente, répondez simplement avec un numéro pour en parler, ou retrouvez tout ici : {lien}\n\n{pied}",
    },
  },
};

export async function chargerLoop(fichier, maintenant = new Date()) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return loopDeDepart(maintenant);
  }
}
export const sauverLoop = sauverJson;

export function loopDeDepart(maintenant = new Date()) {
  return {
    pause: false,
    ia: {},
    lecons: [],
    methode: structuredClone(METHODE_V2),
    historique: [
      { version: 1, quand: '2026-09-26T09:00:00Z', par: 'départ', changements: ['Textes, recherches et relances d’avant la loop.'], pourquoi: 'Méthode de départ.', methode: structuredClone(METHODE_DEPART) },
      {
        version: 2,
        quand: maintenant.toISOString(),
        par: 'Claude (fil de la loop)',
        changements: ['Premier mail réécrit : ce que le restaurant y gagne, le prix (69 € HT/mois, sans engagement) et une proposition de rappel.', 'Relances plus courtes, qui proposent un rappel.', 'Lien des mails marqué (version et type de mail) pour relier visites et inscriptions.'],
        pourquoi: 'État des lieux du 19/10 : 595 restaurants contactés, 3 intéressés, tous après le dernier mail (le plus court) ; L’Annexe demandait tarifs et fonctionnement, que le premier mail ne donnait pas.',
        methode: structuredClone(METHODE_V2),
      },
    ],
    reponses: {},
    revues: [],
    propositionRadicale: null,
  };
}

// Le lundi de la semaine d'un jour (même calcul que bilan.js, sans charger le client Claude).
const lundiDe = (jour) => {
  const d = new Date(`${jour}T12:00:00Z`);
  return jourParis(new Date(d - ((d.getUTCDay() + 6) % 7) * 86_400_000));
};

export const depenseLoopDuMois = (loop, jour = jourParis()) => loop.ia?.[jour.slice(0, 7)] ?? 0;
const ajouterCout = (loop, dollars, jour = jourParis()) => {
  loop.ia ??= {};
  const m = jour.slice(0, 7);
  loop.ia[m] = Math.round(((loop.ia[m] ?? 0) + dollars) * 10_000) / 10_000;
};

// L'adresse que lisent Nour Meet 1 et 3, tirée du jeton (même calcul que scripts/nour-meet-loop-n8n.py).
export const cheminMethode = (jeton) => `/loop/nour-meet/${createHash('sha256').update(`loop-nour-meet:${jeton}`).digest('hex').slice(0, 32)}`;

// Ce que n8n reçoit : la méthode en cours, rien d'autre.
export const methodePourN8n = (loop) => ({ ...loop.methode, pause: Boolean(loop.pause) });

// Même remplacement que dans n8n, pour l'aperçu de la page.
export function remplir(gabarit, { nom = 'Le Restaurant', ville = 'Paris', accroche = '', lien = 'https://nourmeet.com/restaurateurs', pied = 'Bien cordialement,\nWalid\nNūr Meet' } = {}) {
  const lieu = ville ? `${nom} à ${ville}` : nom;
  return String(gabarit).replace(/\{(nom|lieu|accroche|lien|pied)\}/g, (_, k) => ({ nom, lieu, accroche, lien, pied })[k]);
}

export const cleReponseLoop = (r) => createHash('sha256').update(`${r.jour}|${r.de}|${r.objet}|${String(r.texte ?? '').slice(0, 200)}`).digest('hex').slice(0, 16);

// Version d'un mail envoyé, lue dans son lien (utm_campaign=v2-initial).
export const versionDuMail = (corps) => Number((String(corps ?? '').match(/utm_campaign=v(\d+)-/) ?? [])[1]) || 1;
// Type d'un mail : dans son lien depuis la version 2, sinon d'après l'objet des textes de départ.
const typeDuMail = (objet, corps) =>
  (String(corps ?? '').match(/utm_campaign=v\d+-(initial|relance1|relance2)/) ?? [])[1] ?? (/^dernier message/i.test(objet ?? '') ? 'relance2' : /\?\s*$/.test(objet ?? '') ? 'relance1' : 'initial');

export const CONSIGNE_TRI = `Tu tries les réponses de restaurants à un mail de prospection de Nūr Meet (soirées rencontre et networking organisées dans des restaurants, abonnement mensuel pour le restaurant).
Pour chaque réponse, donne son type :
- INTERESSE : veut en parler, demande un rappel ou un rendez-vous, donne un numéro, dit être intéressé ;
- QUESTION : pose une vraie question (prix, fonctionnement, clientèle…) sans dire non ;
- REFUS : refuse, demande d'arrêter, « stop » ;
- AUTOMATIQUE : accusé de réception, absence, adresse inexistante, publicité automatique pour le restaurant, réaction emoji ;
- AUTRE : le reste (transmis à l'équipe, devis…).
Réponds UNIQUEMENT avec ce JSON : {"reponses":[{"i":0,"type":"…","resume":"une phrase en français, sans adresse ni téléphone"}]}`;

// Les réponses pas encore triées (texte gardé par Nour Meet 4), coupées avant la citation du mail d'origine.
export function reponsesATrier(loop, business, max = 40) {
  return (business.sources?.prospection?.reponses ?? [])
    .filter((r) => r.texte?.trim() || r.objet)
    .map((r) => ({ cle: cleReponseLoop(r), r }))
    .filter(({ cle }) => !loop.reponses[cle]?.type)
    .slice(0, max)
    .map(({ cle, r }) => ({ cle, r, objet: String(r.objet ?? '').slice(0, 150), texte: String(r.texte ?? '').split(/\n\s*(?:>|Le .{0,120}a écrit|De ?:|From ?:)/)[0].slice(0, 800) }));
}

// Range le tri (de Haiku par l'API, ou de la tâche Claude sur l'abonnement) : [{ cle, type, resume }].
export function noterTri(loop, aTrier, tries, maintenant = new Date()) {
  const parCle = new Map(aTrier.map((x) => [x.cle, x]));
  const nouvelles = [];
  for (const x of Array.isArray(tries) ? tries : []) {
    const item = parCle.get(x?.cle);
    if (!item || !TYPES_REPONSE[x.type] || loop.reponses[item.cle]?.type) continue;
    loop.reponses[item.cle] = { type: x.type, resume: String(x.resume ?? '').slice(0, 300), jour: item.r.jour, nom: item.r.nom ?? null, trie: maintenant.toISOString() };
    nouvelles.push({ ...loop.reponses[item.cle], cle: item.cle, objet: item.r.objet });
  }
  return nouvelles;
}

// Trie les nouvelles réponses par l'API Anthropic (mode « api »). Sans Claude ou en cas
// d'erreur, elles restent à trier et seront relues au tour suivant.
export async function trierReponses(loop, business, { client, plafondDollars = 11, maintenant = new Date(), max = 40 } = {}) {
  if (!business.sources?.prospection || !client) return { nouvelles: [] };
  const jour = jourParis(maintenant);
  const aTrier = reponsesATrier(loop, business, max);
  if (!aTrier.length) return { nouvelles: [] };
  if (depenseLoopDuMois(loop, jour) >= plafondDollars) return { nouvelles: [], erreur: 'plafond' };
  try {
    const liste = aTrier.map((x, i) => `#${i} objet « ${x.objet} » : ${x.texte}`).join('\n\n');
    const rep = await client.messages.create({ model: MODELE_TRI, max_tokens: 4000, messages: [{ role: 'user', content: `${CONSIGNE_TRI}\n\n${liste}` }] });
    ajouterCout(loop, cout(MODELE_TRI, rep.usage), jour);
    const brut = (rep.content.find((b) => b.type === 'text')?.text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
    const tries = (JSON.parse(brut).reponses ?? []).map((x) => ({ ...x, cle: aTrier[x.i]?.cle }));
    return { nouvelles: noterTri(loop, aTrier, tries, maintenant) };
  } catch (err) {
    return { nouvelles: [], erreur: err.message };
  }
}

// Le message Telegram d'un restaurant intéressé : une action claire pour louis.
export function alerteInteresse(r) {
  const qui = r.nom ?? `l’expéditeur de « ${String(r.objet ?? '').slice(0, 60)} »`;
  return `🍽 <b>${qui}</b> ${r.type === 'INTERESSE' ? 'est intéressé par Nūr Meet' : 'pose une question'} : ${r.resume}\n→ Réponds-lui depuis contact@nourmeet.com (ou appelle s’il a laissé un numéro).`;
}

// Les chiffres de la loop : par version de texte et par type de mail, puis par profil.
export function statsLoop(business, loop) {
  const pr = business.sources?.prospection;
  if (!pr) return null;
  const envoyes = pr.envois.filter((x) => x.statut === 'envoye');
  const positifsParNom = new Map();
  for (const r of pr.reponses ?? []) {
    const t = loop.reponses[cleReponseLoop(r)]?.type;
    if (!r.nom || !t) continue;
    // Une réponse positive l'emporte sur les autres réponses du même restaurant.
    const avant = positifsParNom.get(r.nom);
    if (!avant || (!POSITIFS.has(avant.type) && POSITIFS.has(t))) positifsParNom.set(r.nom, { jour: r.jour, type: t });
  }
  // Une réponse positive est rendue au dernier mail parti avant elle (sa version et son type).
  const parCle = {};
  const cle = (v, t) => (parCle[`v${v} ${t}`] ??= { version: v, type: t, envoyes: 0, positifs: 0 });
  for (const m of envoyes) cle(versionDuMail(m.corps), typeDuMail(m.objet, m.corps)).envoyes += 1;
  for (const [nom, p] of positifsParNom) {
    if (!p || !POSITIFS.has(p.type)) continue;
    const avant = envoyes.filter((m) => m.nom === nom && (!p.jour || !m.jour || m.jour <= p.jour)).sort((a, b) => (a.jour > b.jour ? -1 : 1))[0];
    if (avant) cle(versionDuMail(avant.corps), typeDuMail(avant.objet, avant.corps)).positifs += 1;
  }
  const contactes = pr.prospects.filter((x) => x.premier);
  const segment = (f) => {
    const g = {};
    for (const p of contactes) {
      const k = f(p) ?? '?';
      g[k] ??= { contactes: 0, positifs: 0 };
      g[k].contactes += 1;
      if (POSITIFS.has(positifsParNom.get(p.nom)?.type)) g[k].positifs += 1;
    }
    return g;
  };
  const types = {};
  for (const v of Object.values(loop.reponses)) types[v.type] = (types[v.type] ?? 0) + 1;
  return {
    contactes: contactes.length,
    envoyes: envoyes.length,
    reponsesTriees: types,
    positifs: [...positifsParNom.values()].filter((p) => p && POSITIFS.has(p.type)).length,
    parVersionEtType: Object.values(parCle).sort((a, b) => a.version - b.version || a.type.localeCompare(b.type)),
    parZone: segment((p) => (p.dep === '75' ? 'Paris' : p.dep ? `dép. ${p.dep}` : null)),
    parRecherche: segment((p) => p.recherche),
    parPrix: segment((p) => p.prix),
    halal: segment((p) => (p.halal ? 'halal confirmé' : 'non confirmé')),
    privatisation: segment((p) => (p.privatisation ? 'privatisable confirmé' : 'non confirmé')),
    sansEmail: pr.prospects.filter((x) => x.statut === 'sans_email').length,
  };
}

// La revue de la méthode : une fois par semaine, le lundi après 9 h.
export function revueAFaire(loop, { heure = 9, maintenant = new Date() } = {}) {
  if (loop.pause) return null;
  const jour = jourParis(maintenant);
  const h = Number(new Date(maintenant).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }));
  if (new Date(`${jour}T12:00:00Z`).getUTCDay() !== 1 || h < heure) return null;
  // Une version doit avoir tourné ~une semaine avant d'être jugée.
  const derniere = loop.historique.at(-1);
  if (derniere && new Date(maintenant) - new Date(derniere.quand) < 6 * 86_400_000) return null;
  // Revue faite cette semaine ; une revue en erreur (limite Anthropic…) est retentée 6 h plus tard.
  const faite = loop.revues.some((r) => r.semaine === lundiDe(jour) && (!r.erreur || r.erreur.startsWith('Plafond') || new Date(maintenant) - new Date(r.quand) < 6 * 3_600_000));
  return faite ? null : lundiDe(jour);
}

export const CONSIGNE_REVUE = `Tu pilotes seul la loop de prospection des restaurateurs de Nūr Meet (soirées speed dating et networking dans des restaurants d'Île-de-France ; le restaurant paie un abonnement, prix dans les données).
OBJECTIF : 20 restaurateurs abonnés payants. Étapes : réponse positive, inscription, abonnement.
Commence par relire tes LEÇONS : ne refais pas un essai déjà raté sans raison nouvelle. Puis décide la méthode de la semaine, un essai à la fois quand c'est possible. Si les données sont trop maigres, ne change rien et dis-le.
Tu peux changer : textes (objet et corps de initial, relance1, relance2), recherches Google Maps (1 à 10), jours de relance, premiers mails par jour (10 à 80).
Règles fixes : français, vouvoiement ; chaque corps contient {lien} et {pied} ; variables {nom} {lieu} {accroche} {lien} {pied} ; n'invente rien sur Nūr Meet (ni chiffres, ni clients, ni promesse) ; aucune adresse mail ni numéro.
« radical » = changer l'offre ou le prix, viser autre chose que des restaurants, ou quitter l'Île-de-France : rien n'est appliqué, ta question va à louis.
PISTES DE LOUIS (à peser, pas des ordres) : tunnel pour voir où l'on perd (le restaurateur comprend-il Nūr Meet ? s'inscrit-il ? paie-t-il ?) ; tester objets et corps des mails avec les ouvertures (pixel en place) et, si utile, les clics. Un outil qui manque se propose dans « changements ».
ORGANIQUE IA (louis, 21/10, à peser) : une page « remplir son restaurant en semaine » avec le cas du Casanova après sa soirée, citée dans les mails ; 2 posts LinkedIn par semaine écrits pour louis, qu'il publie ; fiche Google Business et pages par ville, pour être cité par Google et les IA ; louis peut tourner 2 vidéos de 30 s par semaine pour les restaurateurs. Ce qui demande un outil ou louis se propose dans « changements ».
RECHERCHE WEB : autorisée sans demander à louis (règle du 21/10), chaque fois qu'elle aide l'objectif : concurrents, idées, être cité par les IA (ChatGPT, Perplexity, Google).
« pourquoi » est ton journal de décisions, daté et publié dans Notion : même si tu ne changes rien, dis ce que tu as remis en question et pourquoi tu gardes, chiffres à l'appui.
« lecons » : ce que cette semaine t'apprend, une ligne par essai jugé (essai, chiffre, gardé ou arrêté), ou une erreur à ne pas refaire ; vide si rien de neuf.
Réponds UNIQUEMENT avec ce JSON :
{"changer":true|false,"methode":{"textes":{…},"recherches":[…],"relanceJours":[a,b],"parJour":n},"changements":["une phrase par changement"],"pourquoi":"2 à 4 phrases chiffrées","lecons":["une ligne"],"radical":false,"question":"pour louis si radical, sinon vide"}
« methode » ne contient que ce qui change.`;

// Le carnet de leçons (bonne pratique du 20/10) : la revue y note ses essais jugés et
// ses erreurs, et le relit avant de décider. Les 40 dernières suffisent.
export function noterLecons(loop, lecons, semaine) {
  const neuves = (Array.isArray(lecons) ? lecons : []).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 5);
  loop.lecons = [...(loop.lecons ?? []), ...neuves.map((texte) => ({ semaine, texte }))].slice(-40);
}

// Vérifie et fusionne une méthode proposée ; renvoie une erreur lisible sinon.
export function verifierMethode(actuelle, changement = {}) {
  const m = structuredClone(actuelle);
  if (changement.textes) {
    for (const [t, v] of Object.entries(changement.textes)) {
      if (!['initial', 'relance1', 'relance2'].includes(t)) return { erreur: `type de mail inconnu : ${t}` };
      const objet = String(v?.objet ?? m.textes[t].objet).slice(0, 200);
      const corps = String(v?.corps ?? m.textes[t].corps).slice(0, 3000);
      if (PIED_OBLIGATOIRE.some((x) => !corps.includes(x))) return { erreur: `le mail ${t} doit contenir {lien} et {pied}` };
      if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(corps + objet)) return { erreur: `le mail ${t} contient une adresse e-mail` };
      m.textes[t] = { objet, corps };
    }
  }
  if (changement.recherches) {
    const r = [...new Set(changement.recherches.map((x) => String(x).trim().slice(0, 80)).filter(Boolean))];
    if (r.length < 1 || r.length > 10) return { erreur: '1 à 10 recherches' };
    m.recherches = r;
  }
  if (changement.relanceJours) {
    const [a, b] = changement.relanceJours.map(Number);
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 2 && b > a && b <= 30)) return { erreur: 'jours de relance invalides' };
    m.relanceJours = [a, b];
  }
  if (changement.parJour !== undefined) {
    const n = Number(changement.parJour);
    if (!(Number.isInteger(n) && n >= 10 && n <= 80)) return { erreur: '10 à 80 mails par jour' };
    m.parJour = n;
  }
  return { methode: m };
}

function appliquer(loop, methode, { par, changements, pourquoi, maintenant = new Date() }) {
  methode.version = Math.max(...loop.historique.map((h) => h.version)) + 1;
  loop.methode = methode;
  loop.historique.push({ version: methode.version, quand: maintenant.toISOString(), par, changements, pourquoi, methode: structuredClone(methode) });
  loop.historique = loop.historique.slice(-60);
  return methode.version;
}

// Ce que lit la revue : méthode, leçons, historique, chiffres et réponses triées.
export const donneesRevue = (loop, business, contexteSite = '') => ({
  methode: loop.methode,
  lecons: loop.lecons ?? [],
  historique: loop.historique.map(({ methode, ...h }) => h).slice(-10),
  chiffres: statsLoop(business, loop),
  reponses: Object.values(loop.reponses).sort((a, b) => ((b.jour ?? '') > (a.jour ?? '') ? 1 : -1)).slice(0, 60),
  abonnements: business.sources?.stripe?.abonnements ?? 'indisponible',
  site: contexteSite || 'indisponible',
});

// Applique la décision d'une revue (le JSON demandé par CONSIGNE_REVUE), avec les mêmes
// garde-fous qu'elle vienne de l'API ou de la tâche Claude : méthode vérifiée, radical en attente de louis.
export function appliquerRevue(loop, d, entree, maintenant = new Date()) {
  entree.changements = (d.changements ?? []).map((x) => String(x).slice(0, 400)).slice(0, 10);
  entree.pourquoi = String(d.pourquoi ?? '').slice(0, 1500);
  noterLecons(loop, d.lecons, entree.semaine);
  if (d.changer && d.radical) {
    const v = verifierMethode(loop.methode, d.methode);
    entree.question = String(d.question || 'Ce changement est important : je l’applique ?').slice(0, 600);
    if (v.erreur) entree.erreur = `Proposition écartée : ${v.erreur}`;
    else loop.propositionRadicale = { semaine: entree.semaine, quand: entree.quand, methode: v.methode, changements: entree.changements, pourquoi: entree.pourquoi, question: entree.question };
  } else if (d.changer) {
    const v = verifierMethode(loop.methode, d.methode);
    if (v.erreur) entree.erreur = `Changement écarté : ${v.erreur}`;
    else {
      entree.changer = true;
      entree.version = appliquer(loop, v.methode, { par: 'la loop (revue du lundi)', changements: entree.changements, pourquoi: entree.pourquoi, maintenant });
    }
  }
  return entree;
}

const nouvelleEntree = (semaine, maintenant) => ({ semaine, quand: maintenant.toISOString(), changer: false, version: null, changements: [], pourquoi: '', question: null, erreur: null, cout: 0 });
const garderEntree = (loop, entree) => {
  loop.revues.unshift(entree);
  loop.revues = loop.revues.slice(0, 30);
  return entree;
};

// La revue rendue par la tâche Claude du lundi (abonnement Claude, pas l'API) : coût nul pour le budget API.
export function noterRevue(loop, d, { semaine, maintenant = new Date() }) {
  const entree = nouvelleEntree(semaine, maintenant);
  if (!d || typeof d !== 'object') entree.erreur = 'Revue illisible.';
  else appliquerRevue(loop, d, entree, maintenant);
  return garderEntree(loop, entree);
}

// La revue de la semaine `semaine` par l'API (mode « api ») : Claude Opus lit les chiffres et décide.
export async function revoirMethode(loop, business, { client, semaine, contexteSite = '', plafondDollars = 11, maintenant = new Date() }) {
  const entree = nouvelleEntree(semaine, maintenant);
  if (depenseLoopDuMois(loop, semaine) >= plafondDollars) entree.erreur = `Plafond du mois atteint (${plafondDollars} $) : pas de revue, retour le mois prochain.`;
  else {
    try {
      const rep = await client.beta.messages.create({
        model: MODELE_REVUE,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: `${CONSIGNE_REVUE}\n\nDONNÉES :\n${JSON.stringify(donneesRevue(loop, business, contexteSite))}` }],
      });
      entree.cout = cout(MODELE_REVUE, rep.usage);
      if (rep.stop_reason === 'refusal') throw new Error('Claude a refusé cette revue.');
      const brut = (rep.content.find((b) => b.type === 'text')?.text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
      appliquerRevue(loop, JSON.parse(brut), entree, maintenant);
    } catch (err) {
      entree.erreur = `Revue impossible : ${err.message}`;
    }
  }
  if (entree.cout) ajouterCout(loop, entree.cout, semaine);
  return garderEntree(loop, entree);
}

// Les gestes de louis depuis le cerveau.
export function piloter(loop, geste, maintenant = new Date()) {
  if (geste === 'pause') loop.pause = true;
  else if (geste === 'reprendre') loop.pause = false;
  else if (geste === 'annuler') {
    if (loop.historique.length < 2) return { erreur: 'Rien à annuler.' };
    const avant = loop.historique[loop.historique.length - 2];
    appliquer(loop, structuredClone(avant.methode), { par: 'louis (annulation)', changements: [`Retour à la méthode de la version ${avant.version}.`], pourquoi: 'Annulé par louis depuis le cerveau.', maintenant });
  } else if (geste === 'accepter' || geste === 'refuser') {
    const p = loop.propositionRadicale;
    if (!p) return { erreur: 'Aucune proposition en attente.' };
    if (geste === 'accepter') appliquer(loop, structuredClone(p.methode), { par: 'la loop (accepté par louis)', changements: p.changements, pourquoi: p.pourquoi, maintenant });
    loop.propositionRadicale = null;
  } else return { erreur: 'Geste inconnu.' };
  return { ok: true };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '—');
const bouton = (geste, texte) => `<form method="post" action="/loop/nour-meet" style="display:inline"><input type="hidden" name="geste" value="${geste}"><button type="submit">${texte}</button></form>`;

// Le bloc de la page Nūr Meet : ce que fait la loop, ce qu'elle a changé et pourquoi.
export function htmlLoop(loop, business, { plafondDollars = 11, jour = jourParis(), abonnement = false } = {}) {
  if (!loop) return '';
  const s = statsLoop(business, loop);
  const m = loop.methode;
  const derniers = loop.historique.slice(-5).reverse();
  const types = s ? Object.entries(s.reponsesTriees).map(([t, n]) => `${n} ${TYPES_REPONSE[t]?.split(' (')[0] ?? t}`).join(' · ') : '';
  const lignesVersion = s?.parVersionEtType.length
    ? `<table><tr><th>Version</th><th>Mail</th><th>Envoyés</th><th>Réponses positives</th></tr>${s.parVersionEtType.map((x) => `<tr><td>v${x.version}</td><td>${e(x.type)}</td><td>${x.envoyes}</td><td>${x.positifs}</td></tr>`).join('')}</table>`
    : '';
  const prop = loop.propositionRadicale
    ? `<div class="bloc"><b>La loop te demande ton avis :</b> ${e(loop.propositionRadicale.question)}<br><small>${e(loop.propositionRadicale.pourquoi)}</small><ul>${loop.propositionRadicale.changements.map((c) => `<li>${e(c)}</li>`).join('')}</ul>${bouton('accepter', 'Appliquer')} ${bouton('refuser', 'Refuser')}</div>`
    : '';
  return `<section class="bloc"><h3>🔁 Loop restaurateurs ${loop.pause ? '(en pause)' : ''}</h3>
<p>Méthode en cours : <b>version ${m.version}</b> · ${m.parJour} premiers mails par jour · relances à J+${m.relanceJours[0]} et J+${m.relanceJours[1]} · ${abonnement ? 'IA : abonnement Claude (0 $ d’API)' : `IA ce mois-ci : ${depenseLoopDuMois(loop, jour).toFixed(2)} $ sur ${plafondDollars} $`}.</p>
${s ? `<p>${s.contactes} restaurants contactés · <b>${s.positifs} réponses positives</b>${types ? ` · réponses triées : ${e(types)}` : ' · réponses pas encore triées par Claude'}.</p>` : '<p class="vide">Prospection pas encore lue.</p>'}
${prop}
${lignesVersion}
${loop.lecons?.length ? `<h4>Ce que la loop a appris</h4><ul>${loop.lecons.slice(-5).reverse().map((l) => `<li>${quand(l.semaine)} · ${e(l.texte)}</li>`).join('')}</ul>` : ''}
<h4>Ce que la loop a changé, et pourquoi</h4>
<ul>${derniers.map((h) => `<li><b>v${h.version}</b> · ${quand(h.quand)} · ${e(h.par)} : ${e(h.changements.join(' '))}<br><small>${e(h.pourquoi)}</small></li>`).join('')}</ul>
<details><summary>Textes de la version ${m.version}</summary>${['initial', 'relance1', 'relance2'].map((t) => `<p><b>${t}</b> · ${e(remplir(m.textes[t].objet))}</p><pre style="white-space:pre-wrap">${e(remplir(m.textes[t].corps, { accroche: 'En découvrant Le Restaurant à Paris, nous avons pensé que votre établissement pourrait accueillir ce type de soirée.' }))}</pre>`).join('')}<p><b>Recherches</b> : ${e(m.recherches.join(' · '))}</p></details>
<p>${loop.pause ? bouton('reprendre', 'Reprendre la loop') : bouton('pause', 'Mettre la loop en pause')} ${loop.historique.length > 1 ? bouton('annuler', 'Annuler le dernier changement') : ''}</p>
<p class="vide petit-texte">En pause, la loop ne change plus rien (la méthode en cours continue de s’appliquer) ; elle trie toujours les réponses. ${abonnement ? 'Tri des réponses à 12h37 et 18h52, revue de la méthode le lundi à 9h23, par des tâches Claude sur l’abonnement.' : 'Revue de la méthode chaque lundi après 9 h.'}</p></section>`;
}
