// Loop VégéBudget (choix de louis du 19/10) : une boucle fermée qui vise 100 abonnés payants.
// Le site donne ses chiffres, la version en cours et les avis des visiteurs (src/vegebudget.js) ;
// le cerveau en tire le dossier de la semaine. Chaque lundi, la revue (tâche programmée de Claude,
// méthode dans content/loop/CONSIGNES.md du dépôt v-g-budget) lit ce dossier, décide seule,
// modifie le site et note le changement dans le journal du site, que cette page affiche.
import { createHash } from 'node:crypto';
import { jourParis } from './questions.js';

export const OBJECTIF_ABONNES = 100;

// L'adresse du dossier, tirée du jeton du cerveau (la revue la reçoit une fois de louis).
export const cheminDossierVege = (jeton) => `/loop/vegebudget/${createHash('sha256').update(`loop-vegebudget:${jeton}`).digest('hex').slice(0, 32)}`;

const lundiDe = (jour) => {
  const d = new Date(`${jour}T12:00:00Z`);
  return new Date(d - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const ETAPES = ['visiteurs', 'semaines', 'offreVue', 'inscrits', 'clicsPayer', 'reservations'];
const vide = () => Object.fromEntries(ETAPES.map((k) => [k, 0]));
const ajouter = (g, j) => { for (const k of ETAPES) g[k] += j[k] ?? 0; g.jours = (g.jours ?? 0) + 1; return g; };
const taux = (g) => ({ ...g, semainesPct: pct(g.semaines, g.visiteurs), inscritsPct: pct(g.inscrits, g.visiteurs), clicsPct: pct(g.clicsPayer, g.inscrits) });

// La version du site un jour donné, d'après le journal de la loop (la plus récente datée avant ce jour).
const versionDuJour = (journal, jour) => journal.filter((j) => j.date && j.date <= jour).sort((a, b) => a.version - b.version).at(-1)?.version ?? 0;

export function dossierVege(business, { maintenant = new Date() } = {}) {
  const vb = business?.sources?.vegebudget;
  if (!vb?.jours) return { indisponible: 'chiffres de vegebudget.fr pas encore lus' };
  const journal = vb.loop?.journal ?? [];
  const semaines = {};
  const versions = {};
  for (const j of vb.jours) {
    ajouter((semaines[lundiDe(j.jour)] ??= vide()), j);
    const v = versionDuJour(journal, j.jour);
    ajouter((versions[v] ??= vide()), j);
  }
  // Réponses aux questions : comptées par question et par choix, et les mots laissés par les visiteurs.
  const avis = {};
  for (const q of vb.loop?.questions ?? []) avis[q.id] = { question: q.question, reponses: 0, choix: Object.fromEntries(q.choix.map((c) => [c, 0])) };
  for (const a of vb.avis ?? []) {
    const q = (avis[a.question] ??= { question: a.question, reponses: 0, choix: {} });
    q.reponses += 1;
    if (a.choix) q.choix[a.choix] = (q.choix[a.choix] ?? 0) + 1;
  }
  return {
    genere: maintenant.toISOString(),
    luSurLeSite: vb.maj,
    objectif: { abonnesVises: OBJECTIF_ABONNES, abonnes: vb.totaux?.abonnes ?? 'indisponible', membres: vb.totaux?.membres ?? 'indisponible', reservationsFondateur: vb.totaux?.reservationsFondateur ?? 'indisponible' },
    loop: vb.loop ?? 'indisponible (le site n’a pas encore la loop)',
    parSemaine: Object.entries(semaines).sort(([a], [b]) => (a < b ? -1 : 1)).map(([lundi, g]) => ({ lundi, ...taux(g) })),
    parVersion: Object.entries(versions).map(([v, g]) => ({ version: Number(v), ...taux(g) })).sort((a, b) => a.version - b.version),
    sources: vb.sources ?? [],
    parcours: vb.parcours ? { visites: vb.parcours.visites, rebonds: vb.parcours.rebonds, constats: vb.parcours.constats, entonnoir: vb.parcours.entonnoir, pages: vb.parcours.pages.slice(0, 12), clics: vb.parcours.clics.slice(0, 12) } : 'indisponible',
    avis: vb.avis ? avis : 'indisponible',
    motsDesVisiteurs: (vb.avis ?? []).filter((a) => a.texte).slice(0, 60),
  };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '—');
const p = (x) => (x === null || x === undefined ? '—' : `${x} %`);

// Le bloc de la page VégéBudget : où en est l'objectif, ce que la loop essaie, ce qu'elle a changé et pourquoi.
export function htmlLoopVege(business, { jour = jourParis() } = {}) {
  const d = dossierVege(business);
  if (d.indisponible) return `<section class="bloc"><h3>🔁 Loop VégéBudget</h3><p class="vide">Indisponible : ${e(d.indisponible)}.</p></section>`;
  const l = typeof d.loop === 'object' ? d.loop : null;
  const abonnes = typeof d.objectif.abonnes === 'number' ? d.objectif.abonnes : null;
  const lignesVersion = d.parVersion.length
    ? `<table><tr><th>Version</th><th>Jours</th><th>Visiteurs</th><th>Semaines composées</th><th>Inscrits</th><th>Clics payer</th></tr>${d.parVersion.map((x) => `<tr><td>${x.version ? `v${x.version}` : 'avant la loop'}</td><td>${x.jours}</td><td>${x.visiteurs}</td><td>${x.semaines} (${p(x.semainesPct)})</td><td>${x.inscrits} (${p(x.inscritsPct)})</td><td>${x.clicsPayer}</td></tr>`).join('')}</table>`
    : '';
  const avis = typeof d.avis === 'object'
    ? Object.values(d.avis).map((q) => `<p><b>${e(q.question)}</b> · ${q.reponses} réponse${q.reponses > 1 ? 's' : ''}${q.reponses ? ` : ${Object.entries(q.choix).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${e(c)} (${n})`).join(' · ')}` : ''}</p>`).join('')
    : '';
  const mots = d.motsDesVisiteurs.slice(0, 5).map((a) => `<li>« ${e(a.texte)} » <small>${date(a.jour)}</small></li>`).join('');
  return `<section class="bloc"><h3>🔁 Loop VégéBudget</h3>
<p>Objectif : <b>${abonnes ?? 'indisponible'} abonné${abonnes > 1 ? 's' : ''} payant${abonnes > 1 ? 's' : ''} sur ${OBJECTIF_ABONNES}</b> · ${d.objectif.membres} membres inscrits.</p>
${l ? `<p>Version en cours : <b>v${l.version}</b> depuis le ${date(l.depuis)} · ${e(l.essai)}</p>` : '<p class="vide">Le site n’envoie pas encore la version de la loop.</p>'}
${lignesVersion}
${avis ? `<h4>Ce que disent les visiteurs</h4>${avis}${mots ? `<ul>${mots}</ul>` : ''}` : ''}
${l?.journal.length ? `<h4>Ce que la loop a changé, et pourquoi</h4><ul>${l.journal.slice(-5).reverse().map((j) => `<li><b>v${j.version}</b> · ${date(j.date)} : ${e(j.changements.join(' '))}<br><small>${e(j.pourquoi)}${j.mesure ? ` · À mesurer : ${e(j.mesure)}` : ''}</small></li>`).join('')}</ul>` : ''}
<p class="vide petit-texte">Revue chaque lundi par Claude : elle lit ces chiffres, décide seule et modifie le site ; un changement de prix, de cible ou un pivot complet attend ta réponse. Pour l’arrêter, dis-le dans le fil de la loop.</p></section>`;
}
