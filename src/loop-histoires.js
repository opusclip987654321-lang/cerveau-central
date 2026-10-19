// Loop Petites histoires vraies (19/10) : la chaîne est fabriquée et pilotée par les
// sessions Claude du projet « 3_PETITES HISTOIRES » (épisodes, Shorts, analyse du
// dimanche, boucle d'apprentissage qui décide seule). Le cerveau ne fabrique rien : il
// affiche ce que cette loop lui envoie dans config/loops/petites-histoires.json (dépôt
// public, mis à jour par PR depuis l'autre projet ; ./config est monté dans le conteneur,
// le fichier est donc lu dès le git pull du serveur, sans reconstruire).
import { readFile } from 'node:fs/promises';

export async function lireLoopHistoires(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return { erreur: `fichier illisible (${err.message})` };
  }
}

const jours = (iso, maintenant) => (maintenant - new Date(iso)) / 86_400_000;

// Vérification : la loop envoie son compte rendu au moins chaque semaine (analyse du dimanche).
export async function verifierLoopHistoires(verif, _seuils, { fichier, maintenant = new Date() } = {}) {
  const etat = await lireLoopHistoires(fichier);
  if (!etat) return { etat: 'ignore', detail: 'la loop de la chaîne n’a pas encore envoyé son premier compte rendu' };
  if (etat.erreur) return { etat: 'attention', detail: `compte rendu de la loop ${etat.erreur}` };
  const t = Date.parse(etat.maj);
  if (Number.isNaN(t)) return { etat: 'attention', detail: 'compte rendu de la loop sans date' };
  const age = jours(etat.maj, maintenant);
  const max = verif.joursMax ?? 9;
  if (age > max) return { etat: 'attention', detail: `aucun compte rendu de la loop depuis ${Math.floor(age)} jours (attendu chaque dimanche)` };
  const derniere = (etat.decisions ?? []).at(-1);
  return { etat: 'ok', detail: derniere ? `dernière décision le ${derniere.date} : ${derniere.quoi}` : 'compte rendu reçu' };
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x) => (typeof x === 'number' ? x.toLocaleString('fr-FR') : 'indisponible');
const quand = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
};

function objectif(titre, o, unite = '') {
  if (!o) return '';
  const actuel = typeof o.actuel === 'number' ? o.actuel : null;
  const pct = actuel !== null && o.cible ? Math.min(100, Math.round((actuel / o.cible) * 100)) : null;
  return `<tr><td>${e(titre)}</td><td><b>${actuel === null ? 'indisponible' : `${n(actuel)}${unite}`}</b></td><td>${n(o.cible)}${unite}</td><td>${pct === null ? '—' : `${pct} %`}</td></tr>`;
}

// Le bloc de la page Petites histoires vraies : objectifs, chiffres, décisions de la loop.
export function htmlLoopHistoires(etat, { maintenant = new Date() } = {}) {
  const pied = '<p class="vide petit-texte">La chaîne est fabriquée et pilotée par le projet Claude « 3_PETITES HISTOIRES » : 4 épisodes par semaine avec leur Short, analyse chaque dimanche, et une loop qui décide seule (sujets, format, rythme). Elle ne te demande ton avis que pour un pivot radical.</p>';
  if (!etat) return `<section class="bloc"><h3>🔁 Loop de la chaîne</h3><p class="vide">Pas encore de compte rendu de la loop : il arrive après sa prochaine analyse.</p>${pied}</section>`;
  if (etat.erreur) return `<section class="bloc"><h3>🔁 Loop de la chaîne</h3><p class="vide">Compte rendu indisponible : ${e(etat.erreur)}.</p>${pied}</section>`;
  const o = etat.objectifs ?? {};
  const c = etat.chiffres ?? {};
  const vieux = Number.isNaN(Date.parse(etat.maj)) || jours(etat.maj, maintenant) > 9;
  const decisions = (etat.decisions ?? []).slice(-6).reverse();
  return `<section class="bloc"><h3>🔁 Loop de la chaîne <small>compte rendu du ${quand(etat.maj)}${vieux ? ' · ⚠️ ancien' : ''}</small></h3>
${etat.question ? `<div class="bloc"><b>La loop te demande ton avis :</b> ${e(etat.question)}<br><small>Réponds-lui dans le fil « Production automatique » du projet 3_PETITES HISTOIRES.</small></div>` : ''}
<table><tr><th>Objectif</th><th>Aujourd’hui</th><th>Cible</th><th>Avancement</th></tr>${objectif('Abonnés YouTube', o.abonnes)}${objectif('Heures de visionnage (12 mois)', o.heures, ' h')}${objectif('Revenus YouTube du mois', o.revenusMois, ' €')}</table>
<p>Vues des Shorts : <b>${n(c.shorts7j)}</b> sur 7 jours, ${n(c.shorts28j)} sur 28 jours · vidéos longues : <b>${n(c.longues7j)}</b> sur 7 jours, ${n(c.longues28j)} sur 28 jours${c.meilleurShort ? ` · meilleur Short : ${e(c.meilleurShort)}` : ''}.</p>
${etat.rythme ? `<p>Rythme : ${e(etat.rythme)}</p>` : ''}
${etat.hypothese ? `<p>Ce qu’elle teste : ${e(etat.hypothese)}</p>` : ''}
${decisions.length ? `<h4>Ce que la loop a changé, et pourquoi</h4><ul>${decisions.map((d) => `<li><b>${e(d.date)}</b> : ${e(d.quoi)}<br><small>${e(d.pourquoi)}</small></li>`).join('')}</ul>` : ''}
${etat.prochaine ? `<p>Prochaine étape : ${e(etat.prochaine)}</p>` : ''}
${pied}</section>`;
}
