// Le tableau de bord Notion « 🧠 Mes projets » (choix de louis du 21/10) : une ligne par
// loop sur la page « Loops des projets », un clic ouvre la page complète du projet. Toutes
// les 10 minutes, sans IA, le cerveau y écrit le chiffre qui prouve le succès, un deuxième
// chiffre pour voir si ça bouge, l'état et la dernière décision (lue dans la table
// « Décisions des loops », qui reçoit aussi ce que les autres projets Claude y écrivent).
// L'objectif et la page du projet restent écrits à la main. Une donnée absente s'affiche
// « indisponible », jamais 0.
import { statsLoop } from './loop-nour-meet.js';
import { alertesNourPublic } from './nour-public.js';
import { SOURCE_NOTION } from './decisions.js';
import { jourParis } from './questions.js';

// La table « 🧠 Mes projets » (créée le 21/10 sous « Loops des projets »).
export const SOURCE_PROJETS = '2d1bfb3e-d21e-4f95-a279-fa859cb302aa';
export const LIEN_PROJETS = 'https://app.notion.com/p/c0c71087a80f41eca860ebf6cc8bf39a';

// Colonne « Clé » de chaque ligne → nom de la loop dans la table des décisions.
export const PROJETS = {
  'nour-restos': 'Nūr Meet restaurateurs',
  'nour-grand-public': 'Nūr Meet grand public',
  vegebudget: 'VégéBudget',
  'petites-histoires': 'Petites histoires vraies',
  impacteur: 'Impacteur invitations',
  'impacteur-sponsors': 'Impacteur Sponsors',
  leviaro: 'Leviaro',
};

const INDISPO = 'indisponible';
const nb = (x) => Number(x).toLocaleString('fr-FR');
const pl = (n, mot, motPluriel = `${mot}s`) => `${nb(n)} ${n > 1 ? motPluriel : mot}`;
const somme = (l) => l.reduce((a, b) => a + (b ?? 0), 0);
const depuisJours = (jour, n, maintenant) => jour && jour >= jourParis(new Date(maintenant - (n - 1) * 86_400_000));

// Les deux chiffres et les alertes de chaque projet, d'après ce que le cerveau lit déjà.
export function chiffresProjets({ business, loopNour, loopHistoires, maintenant = new Date() } = {}) {
  const s = business?.sources ?? {};
  const r = {};

  const pr = s.prospection;
  const stats = pr && loopNour ? statsLoop(business, loopNour) : null;
  r['nour-restos'] = {
    principal: s.stripe?.abonnements ? pl(s.stripe.abonnements.actifs, 'resto payant', 'restos payants') : INDISPO,
    secondaire: stats ? `${pl(stats.positifs, 'intéressé')} · ${pl(stats.contactes, 'contacté')}` : INDISPO,
    donnees: Boolean(pr),
  };

  const np = s.nourPublic;
  const umami = s.visites?.sites?.['nour-meet']?.parJour;
  r['nour-grand-public'] = {
    principal: np?.comptesTotal != null ? pl(np.comptesTotal, 'compte particulier', 'comptes particuliers') : INDISPO,
    secondaire: umami ? `${pl(somme(umami.filter((j) => depuisJours(j.jour, 7, maintenant)).map((j) => j.visites)), 'visite')} sur 7 j` : INDISPO,
    donnees: Boolean(np),
    alerte: alertesNourPublic(np, maintenant).length > 0,
  };

  const vb = s.vegebudget;
  r.vegebudget = {
    principal: vb?.totaux?.abonnes != null ? pl(vb.totaux.abonnes, 'abonné payant', 'abonnés payants') : INDISPO,
    secondaire: vb?.jours
      ? [vb.totaux?.membres != null ? pl(vb.totaux.membres, 'inscrit') : null, `${nb(somme(vb.jours.slice(-30).map((j) => j.visiteurs)))} visiteurs sur 30 j`].filter(Boolean).join(' · ')
      : INDISPO,
    donnees: Boolean(vb),
  };

  const lh = loopHistoires && !loopHistoires.erreur ? loopHistoires : null;
  const abonnes = lh?.objectifs?.abonnes?.actuel;
  const heures = lh?.objectifs?.heures?.actuel;
  r['petites-histoires'] = {
    principal: typeof abonnes === 'number' ? pl(abonnes, 'abonné YouTube', 'abonnés YouTube') : INDISPO,
    secondaire: typeof heures === 'number' ? `${nb(heures)} h de vues` : INDISPO,
    donnees: Boolean(lh),
    // La loop envoie son compte rendu chaque dimanche : au-delà de 9 jours, quelque chose cloche.
    alerte: Boolean(loopHistoires) && (!lh || Number.isNaN(Date.parse(lh.maj)) || (maintenant - new Date(lh.maj)) / 86_400_000 > 9),
  };

  const im = s.impacteur;
  const reponses = (im?.fiches ?? []).filter((f) => f.reponseType);
  const compte = (mot) => reponses.filter((f) => f.reponseType.includes(mot)).length;
  const aClasser = compte('A_CLASSER');
  r.impacteur = {
    principal: im?.reponsesMesurees
      ? `${pl(compte('OUI_INTERVIEW'), 'oui interview', 'oui interview')} · ${pl(compte('LIVRE_ACCEPTE'), 'livre accepté', 'livres acceptés')}${aClasser ? ` (${aClasser} à classer)` : ''}`
      : INDISPO,
    secondaire: im ? `${pl(im.fiches.filter((f) => depuisJours(f.envoi, 7, maintenant)).length, 'invitation')} sur 7 j` : INDISPO,
    donnees: Boolean(im),
  };

  // Impacteur Sponsors vit sur son propre serveur (projet « 12_Prospection sponsors ») :
  // le cerveau n'en lit aucun chiffre. Depuis le 22/10, sa loop écrit elle-même ses deux
  // chiffres dans sa ligne à chaque tour : le cerveau n'y touche plus (état, décision, heure).
  r['impacteur-sponsors'] = { principal: INDISPO, secondaire: INDISPO, donnees: false, chiffresParLeProjet: true };

  const lv = s.leviaro;
  r.leviaro = {
    principal: lv ? `${pl(lv.reponses.length, 'réponse')}${lv.enDiscussion ? ` · ${nb(lv.enDiscussion)} en discussion` : ''}` : INDISPO,
    secondaire: lv ? `${pl(lv.envois.filter((m) => m.etape === 0).length, 'mail envoyé', 'mails envoyés')}` : INDISPO,
    donnees: Boolean(lv),
  };
  return r;
}

// La dernière décision de chaque loop, d'après les lignes de la table Notion.
export function dernieresDecisions(lignes) {
  const par = {};
  for (const l of lignes) {
    if (!l.loop || !l.date || !l.quoi) continue;
    if (!par[l.loop] || l.date >= par[l.loop].date) par[l.loop] = l;
  }
  return par;
}

const court = (t, max) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
export const texteDecision = (d) => (d ? court(`${d.date.slice(8, 10)}/${d.date.slice(5, 7)} : ${d.quoi}`, 160) : 'aucune pour l’instant');

// L'état d'une ligne : bloqué si une alerte est levée, pas démarré si le cerveau n'a ni
// chiffre ni décision, en attente si une loop sans chiffre n'a rien décidé depuis 7 jours.
export function etatProjet({ donnees, alerte, decision }, maintenant = new Date()) {
  if (alerte) return 'Bloqué';
  if (!donnees && !decision) return 'Pas démarré';
  if (!donnees && decision.date < jourParis(new Date(maintenant - 7 * 86_400_000))) return 'En attente';
  return 'Tourne';
}

const texte = (t) => [{ type: 'text', text: { content: String(t).slice(0, 1990) } }];
const lireTexte = (p, nom) => (p?.[nom]?.rich_text ?? p?.[nom]?.title ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');

export const proprietesLigne = ({ principal, secondaire, etat, decision, chiffresParLeProjet }, maintenant = new Date()) => ({
  ...(chiffresParLeProjet ? {} : { 'Chiffre principal': { rich_text: texte(principal) }, 'Chiffre secondaire': { rich_text: texte(secondaire) } }),
  'Dernière décision': { rich_text: texte(texteDecision(decision)) },
  État: { select: { name: etat } },
  'Mis à jour': { date: { start: maintenant.toISOString() } },
});

// Lit les deux tables Notion et réécrit chaque ligne du tableau de bord.
export async function tenirTableauNotion(chiffres, { jeton, sourceProjets = SOURCE_PROJETS, sourceDecisions = SOURCE_NOTION, fetch: f = fetch, maintenant = new Date() } = {}) {
  if (!jeton) return { ignore: true };
  const entetes = { authorization: `Bearer ${jeton}`, 'notion-version': '2025-09-03', 'content-type': 'application/json' };
  const appel = async (methode, chemin, corps) => {
    const r = await f(`https://api.notion.com/v1/${chemin}`, { method: methode, headers: entetes, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`Notion ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const toutes = async (source) => {
    const pages = [];
    let curseur;
    do {
      const r = await appel('POST', `data_sources/${source}/query`, { page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) });
      pages.push(...(r.results ?? []));
      curseur = r.has_more ? r.next_cursor : null;
    } while (curseur);
    return pages;
  };

  const decisions = dernieresDecisions(
    (await toutes(sourceDecisions)).map((p) => ({
      loop: p.properties?.Loop?.select?.name,
      date: p.properties?.Date?.date?.start?.slice(0, 10),
      quoi: lireTexte(p.properties, 'Décision'),
    })),
  );
  let ecrites = 0;
  for (const p of await toutes(sourceProjets)) {
    const cle = lireTexte(p.properties, 'Clé').trim();
    const c = chiffres[cle];
    if (!c) continue;
    const decision = decisions[PROJETS[cle]] ?? null;
    await appel('PATCH', `pages/${p.id}`, { properties: proprietesLigne({ ...c, etat: etatProjet({ ...c, decision }, maintenant), decision }, maintenant) });
    ecrites += 1;
  }
  return { ecrites };
}
