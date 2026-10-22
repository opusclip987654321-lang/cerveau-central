// L'associé business (22/10, projet « 13_AIde pour construire une fortune » repris par le
// cerveau, choix A de louis) : une loop « fortune » hebdo qui classe les projets par
// « délai avant le 1er € × montant », donne un avis franc (pousser, maintenir, geler) et
// arbitre les dépenses, plus 10 idées par jour. L'IA tourne dans les tâches programmées
// du fil « Associé business » (abonnement Claude) ; le cerveau ne fabrique rien, il
// affiche ce que ce fil pousse par PR :
// - config/loops/fortune.json : avis, propositions, classement, dépenses, leçons, décisions, question à louis ;
// - config/idees-jour.json : les idées du jour, 14 jours gardés.
// ./config est monté dans le conteneur : lu dès le git pull du serveur, sans reconstruire.
import { readFile } from 'node:fs/promises';

export async function lireAssocie(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return { erreur: `fichier illisible (${err.message})` };
  }
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x) => (typeof x === 'number' ? x.toLocaleString('fr-FR') : 'indisponible');
const quand = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
};
const jours = (iso, maintenant) => (maintenant - new Date(iso)) / 86_400_000;

export const DECISIONS = { Pousser: '🚀', Maintenir: '⏸', Geler: '🧊', 'À clarifier': '❓', Outil: '🔧', 'En pause': '⏹' };
export const CATEGORIES = { 'projet-neuf': '🌱 Projet neuf', developpement: '📈 Développer un projet', economie: '💶 Économie', connaissance: '📚 Connaissance' };
export const LIEN_NOTION_DECISIONS = 'https://app.notion.com/p/1d6b9e2267e94c41b05a5a2a39b1f7e2';

// Les idées du jour le plus récent (ou celles d'une date donnée).
export function ideesDuJour(idees, jour) {
  const liste = (idees?.jours ?? []).filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(String(j.date ?? '')));
  liste.sort((a, b) => b.date.localeCompare(a.date));
  return (jour ? liste.find((j) => j.date === jour) : liste[0]) ?? null;
}

function blocIdees(idees) {
  if (!idees) return '<p class="vide">Pas encore d’idées : la première livraison arrive à l’heure choisie.</p>';
  if (idees.erreur) return `<p class="vide">Idées indisponibles : ${e(idees.erreur)}.</p>`;
  const j = ideesDuJour(idees);
  if (!j) return '<p class="vide">Pas encore d’idées : la première livraison arrive à l’heure choisie.</p>';
  const items = (j.idees ?? [])
    .map(
      (i) => `<li><span class="etiquette">${e(CATEGORIES[i.categorie] ?? i.categorie ?? '')}</span>${i.projet ? ` <small>${e(i.projet)}</small>` : ''}<br><b>${e(i.titre)}</b>${i.detail ? `<br>${e(i.detail)}` : ''}${
        i.source ? `<br><small><a href="${e(i.source)}" target="_blank" rel="noopener">source</a></small>` : ''
      }</li>`,
    )
    .join('');
  const autres = (idees.jours ?? []).length - 1;
  return `<p class="petit-texte">Idées du ${e(quand(j.date))}${autres > 0 ? ` · ${autres} jour(s) précédent(s) gardés dans le fil` : ''}</p><ol class="idees">${items}</ol>`;
}

function blocClassement(f) {
  const lignes = (f.classement ?? [])
    .map(
      (c, i) => `<tr><td>${e(c.rang ?? i + 1)}</td><td><b>${e(c.projet)}</b></td><td>${DECISIONS[c.decision] ?? ''} ${e(c.decision)}</td><td>${e(c.delai ?? '—')}</td><td>${e(c.montant ?? '—')}</td><td>${e(c.preuve ?? '')}${c.pourquoi ? `<br><small>${e(c.pourquoi)}</small>` : ''}</td></tr>`,
    )
    .join('');
  return lignes
    ? `<table><tr><th>#</th><th>Projet</th><th>Avis</th><th>1er € dans</th><th>Une vente</th><th>Preuve et pourquoi</th></tr>${lignes}</table>`
    : '<p class="vide">Pas encore de classement.</p>';
}

function blocDepenses(d) {
  if (!d) return '';
  const pistes = (d.pistes ?? [])
    .map((p) => `<li><b>${e(p.quoi)}</b>${p.gain ? ` : ${e(p.gain)}` : ''} <small>(${e(p.etat ?? 'proposé')})</small>${p.pourquoi ? `<br><small>${e(p.pourquoi)}</small>` : ''}</li>`)
    .join('');
  return `<section class="bloc"><h3>💶 Dépenses</h3>
<p>Coût fixe : <b>${n(d.fixeMois)} €/mois</b>${d.encaisse !== undefined ? ` · encaissé : <b>${n(d.encaisse)} €</b>` : ''}${d.note ? `<br><small>${e(d.note)}</small>` : ''}</p>
${pistes ? `<h4>Pistes d’économie</h4><ul>${pistes}</ul>` : ''}
<p class="vide petit-texte">L’associé ne coupe aucun abonnement et n’engage aucune dépense sans ton accord : chaque piste te sera posée en question.</p></section>`;
}

// La page « Associé » : avis de la semaine, classement, dépenses, idées du jour, décisions, leçons.
export function htmlAssocie(fortune, idees, { maintenant = new Date() } = {}) {
  const pied = `<p class="vide petit-texte">Ton associé business tourne sur ton abonnement Claude, dans le fil « Associé business » : revue « fortune » chaque semaine, idées chaque jour. Ses décisions sont aussi dans Notion, <a href="${LIEN_NOTION_DECISIONS}" target="_blank" rel="noopener">Décisions des loops</a>. Il recommande, il ne gèle rien seul : tes choix (loops libres, Nūr Meet n°1) passent avant son avis.</p>`;
  const idee = `<section class="bloc"><h3>💡 Les idées du jour</h3>${blocIdees(idees)}</section>`;
  if (!fortune) return `${idee}<section class="bloc"><h3>🏆 Classement des projets</h3><p class="vide">Pas encore de revue « fortune ».</p></section>${pied}`;
  if (fortune.erreur) return `${idee}<section class="bloc"><h3>🏆 Classement des projets</h3><p class="vide">Revue indisponible : ${e(fortune.erreur)}.</p></section>${pied}`;
  const vieux = Number.isNaN(Date.parse(fortune.maj)) || jours(fortune.maj, maintenant) > 9;
  const decisions = (fortune.decisions ?? []).slice(-8).reverse();
  const lecons = (fortune.lecons ?? []).slice(-10).reverse();
  return `<section class="bloc"><h3>🧭 L’avis de ton associé <small>revue du ${e(quand(fortune.maj))}${fortune.cycle ? ` · cycle ${e(fortune.cycle)}` : ''}${vieux ? ' · ⚠️ ancienne' : ''}</small></h3>
${fortune.question ? `<div class="bloc"><b>Il te demande :</b> ${e(fortune.question)}<br><small>Réponds dans le fil « Associé business ».</small></div>` : ''}
${fortune.avis ? `<p>${e(fortune.avis)}</p>` : ''}
${fortune.objectifCycle ? `<p><b>Objectif de la semaine :</b> ${e(fortune.objectifCycle)}</p>` : ''}
</section>
${(fortune.propositions ?? []).length ? `<section class="bloc"><h3>🎯 Ce que ton associé propose</h3><ol>${fortune.propositions.map((x) => `<li><b>${e(x.quoi)}</b>${x.qui ? ` <small>(${e(x.qui)})</small>` : ''}${x.pourquoi ? `<br><small>${e(x.pourquoi)}</small>` : ''}</li>`).join('')}</ol></section>` : ''}
${idee}
<section class="bloc"><h3>🏆 Classement des projets</h3><p class="petit-texte">Critère : délai avant le 1er € × montant d’une vente. Une preuve compte plus qu’une promesse.</p>${blocClassement(fortune)}</section>
${blocDepenses(fortune.depenses)}
${decisions.length ? `<section class="bloc"><h3>📜 Ce que l’associé a décidé, et pourquoi</h3><ul>${decisions.map((d) => `<li><b>${e(d.date)}</b>${d.type ? ` · ${e(d.type)}` : ''} : ${e(d.quoi)}${d.pourquoi ? `<br><small>${e(d.pourquoi)}</small>` : ''}</li>`).join('')}</ul></section>` : ''}
${lecons.length ? `<section class="bloc"><h3>📒 Carnet de leçons</h3><ul>${lecons.map((l) => `<li>${l.date ? `<b>${e(l.date)}</b> : ` : ''}${e(typeof l === 'string' ? l : l.texte)}</li>`).join('')}</ul></section>` : ''}
${fortune.prochaine ? `<p>Prochaine étape : ${e(fortune.prochaine)}</p>` : ''}
${pied}`;
}
