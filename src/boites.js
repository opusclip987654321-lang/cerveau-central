// Les boîtes Gmail de louis : le cerveau y repère les mails urgents à traiter.
// L'automatisation n8n « CERVEAU - lecture des boîtes » (scripts/boites-n8n.py)
// renvoie les mails de la boîte de réception des 3 derniers jours (hors promotions,
// réseaux sociaux et forums) ; le tri se fait ici, par règles, sans IA.
import { createHash } from 'node:crypto';
import { jourDe } from './business.js';

// Même ordre et mêmes noms de nœuds que scripts/boites-n8n.py.
export const BOITES = [
  { id: 'opusclip', adresse: 'opusclip987654321@gmail.com' },
  { id: 'walidvideos12', adresse: 'walidvideos12@gmail.com' },
  { id: 'impacteurmedia', adresse: 'impacteurmedia@gmail.com' },
  { id: 'gougamwalid', adresse: 'gougamwalid@gmail.com' },
  { id: 'impacteurfrexit', adresse: 'impacteurfrexit@gmail.com' },
  { id: 'impacteurafrique', adresse: 'impacteurafrique@gmail.com' },
];

// Adresse secrète de l'automatisation (même calcul que scripts/boites-n8n.py).
export const cheminBoites = (jeton) => `cerveau-boites-${createHash('sha256').update(`boites:${jeton}`).digest('hex').slice(0, 32)}`;

const texte = (v) => (v == null ? '' : String(v));
const ADRESSES = BOITES.map((b) => b.adresse);

const EXPEDITEUR_AUTO = /no-?reply|do-?not-?reply|donotreply|ne-?pas-?r[ée]pondre|mailer-?daemon|postmaster|notifications?@|notify@|alerts?@|news(letter)?@|marketing@|bounce/i;
// Un compte ou un paiement en danger : à traiter même si le mail est automatique.
const ALERTE = /alerte de s[ée]curit[ée]|security alert|connexion (suspecte|inhabituelle)|suspicious (sign-in|activity)|compte (a [ée]t[ée] )?(suspendu|d[ée]sactiv[ée]|bloqu[ée]|restreint|pirat[ée])|account (has been )?(suspended|disabled|restricted|locked|compromised)|violation|copyright|droits? d'auteur|avertissement|strike|r[ée]clamation|paiement (refus[ée]|[ée]chou[ée]|rejet[ée])|[ée]chec (du |de )?paiement|payment (failed|declined)|impay[ée]|past due|overdue|dernier rappel|final notice|mise en demeure|huissier|urssaf|imp[ôo]ts|amende|action (requise|required)/i;
// Un humain qui parle d'argent, d'un contrat ou d'un rendez-vous.
const AFFAIRE = /devis|facture|commande|partenariat|sponsor|collaboration|contrat|proposition|rendez-vous|\brdv\b|entretien|interview|invitation|abonnement|paiement|virement|tarif|\bprix\b|urgent|asap|au plus vite|rapidement|relance/i;

export const NIVEAUX = { urgent: 'Urgent', 'a-traiter': 'À traiter' };

// Classe un mail : { niveau, raison } ou null s'il n'y a rien à faire.
export function classerMail(m) {
  const de = m.de.toLowerCase();
  if (ADRESSES.some((a) => de.includes(a))) return null;
  const contenu = `${m.objet} ${m.extrait}`;
  if (ALERTE.test(contenu)) return { niveau: 'urgent', raison: 'Compte ou paiement en danger' };
  if (EXPEDITEUR_AUTO.test(de)) return null;
  if (AFFAIRE.test(contenu)) return { niveau: 'urgent', raison: 'Une personne parle argent, contrat ou rendez-vous' };
  if (m.nonLu) return { niveau: 'a-traiter', raison: 'Une personne t’a écrit, pas encore lu' };
  return null;
}

export async function synchroniserBoites(business, { url, jeton, delaiMs = 90_000, appel, maintenant = new Date() } = {}) {
  if (!appel && (!url || !jeton)) return { ignore: true };
  appel ??= () =>
    fetch(new URL(`/webhook/${cheminBoites(jeton)}`, url), { signal: AbortSignal.timeout(delaiMs) }).then(async (r) => {
      if (!r.ok) throw new Error(`n8n répond ${r.status}`);
      return r.json();
    });
  const rep = await appel();
  const lignes = (Array.isArray(rep) ? rep : [rep]).filter((l) => l && l.boite);
  const etat = {};
  for (const b of BOITES) etat[b.id] = { lue: false, erreur: 'pas dans la réponse de n8n' };
  for (const l of lignes.filter((x) => !x.id)) etat[l.boite] = l.erreur ? { lue: false, erreur: texte(l.erreur).slice(0, 300) } : { lue: true, n: Number(l.lus) || 0 };
  const vus = new Set();
  const mails = lignes
    .filter((l) => l.id && etat[l.boite] && !vus.has(`${l.boite}:${l.id}`) && vus.add(`${l.boite}:${l.id}`))
    .map((l) => {
      const libelles = Array.isArray(l.labelIds) ? l.labelIds.map(String) : [];
      const date = l.date ?? (l.internalDate ? new Date(Number(l.internalDate)).toISOString() : null);
      return {
        boite: l.boite,
        id: texte(l.id),
        fil: texte(l.threadId || l.id),
        quand: date ? new Date(date).toISOString() : null,
        jour: jourDe(date ? new Date(date).toISOString() : null),
        de: texte(l.From ?? l.from).slice(0, 120),
        objet: texte(l.Subject ?? l.subject).slice(0, 200),
        extrait: texte(l.snippet).slice(0, 300),
        nonLu: libelles.includes('UNREAD'),
      };
    })
    .map((m) => ({ ...m, ...classerMail(m) }))
    .filter((m) => m.niveau)
    .sort((a, b) => (a.niveau === b.niveau ? ((b.quand ?? '') > (a.quand ?? '') ? 1 : -1) : a.niveau === 'urgent' ? -1 : 1));
  business.sources.boites = { maj: maintenant.toISOString(), etat, mails };
  // Une boîte en panne ne cache pas les autres, mais se voit dans Connexions.
  const enPanne = Object.entries(etat).filter(([, x]) => !x.lue);
  if (enPanne.length === BOITES.length) throw new Error(`aucune boîte lue (${enPanne[0][1].erreur})`);
  return { mails: mails.length, enPanne: enPanne.map(([id]) => id) };
}

const h = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nomCourt = (de) => (de.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? de).trim();
export const lienGmail = (m) => `https://mail.google.com/mail/?authuser=${BOITES.find((b) => b.id === m.boite)?.adresse ?? ''}#all/${m.fil}`;

// Un seul Telegram par passage, pour les mails urgents jamais signalés.
export function alerteBoites(business, { max = 5 } = {}) {
  const deja = (business.alertesBoites ??= {});
  const nouveaux = (business.sources.boites?.mails ?? []).filter((m) => m.niveau === 'urgent' && !deja[`${m.boite}:${m.id}`]);
  if (!nouveaux.length) return null;
  const quand = new Date().toISOString();
  for (const m of nouveaux) deja[`${m.boite}:${m.id}`] = quand;
  // On n'oublie qu'au bout de 30 jours (les mails lus ne remontent que sur 3 jours).
  for (const [cle, q] of Object.entries(deja)) if (Date.now() - Date.parse(q) > 30 * 86_400_000) delete deja[cle];
  const lignes = nouveaux.slice(0, max).map((m) => `• <b>${h(nomCourt(m.de))}</b> (${h(m.boite)}) : ${h(m.objet || '(sans objet)')}\n  ${h(m.raison)}`);
  const reste = nouveaux.length > max ? `\n… et ${nouveaux.length - max} autre(s).` : '';
  return `📬 ${nouveaux.length} mail(s) urgent(s) à traiter :\n${lignes.join('\n')}${reste}\nTout est sur la page Aujourd’hui du cerveau.`;
}

// Bloc de la page Aujourd'hui : les mails à traiter, urgents d'abord.
export function htmlBoites(source, { max = 15 } = {}) {
  if (!source) return '<p class="vide">Boîtes mail pas encore lues : l’automatisation n8n « CERVEAU - lecture des boîtes » n’est pas branchée.</p>';
  const panne = Object.entries(source.etat ?? {}).filter(([, x]) => !x.lue).map(([id]) => id);
  const avert = panne.length ? `<p class="boites-panne">⚠️ Pas lue(s) : ${panne.map(h).join(', ')} (voir <a href="/connexions">Connexions</a>).</p>` : '';
  const mails = source.mails ?? [];
  if (!mails.length) return `${avert}<p class="calme">🟢 Rien d’urgent dans tes boîtes sur les 3 derniers jours.</p>`;
  const lignes = mails
    .slice(0, max)
    .map(
      (m) => `<li class="${h(m.niveau)}"><span class="niveau">${NIVEAUX[m.niveau]}</span><div><a href="${h(lienGmail(m))}" target="_blank" rel="noopener"><b>${h(m.objet || '(sans objet)')}</b></a>
<small>${h(nomCourt(m.de))} · ${h(m.boite)}${m.quand ? ` · ${new Date(m.quand).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}` : ''} · ${h(m.raison)}</small>
<span class="extrait">${h(m.extrait)}</span></div></li>`,
    )
    .join('');
  return `${avert}<ul class="boites">${lignes}</ul>${mails.length > max ? `<p class="autres">… et ${mails.length - max} autre(s) dans Gmail.</p>` : ''}
<style>
.boites { list-style:none; padding:0; margin:0; background:var(--carte); border:1px solid var(--bord); border-radius:12px; }
.boites li { display:flex; gap:10px; padding:10px 14px; border-top:1px solid var(--bord); }
.boites li:first-child { border-top:0; }
.boites li.urgent { border-left:4px solid var(--panne); } .boites li.a-traiter { border-left:4px solid var(--attention); }
.boites .niveau { font-size:11px; font-weight:700; color:var(--doux); min-width:62px; text-transform:uppercase; }
.boites div { display:flex; flex-direction:column; gap:2px; min-width:0; }
.boites a { color:inherit; text-decoration:none; } .boites a:hover { text-decoration:underline; }
.boites small { color:var(--doux); font-size:12px; }
.boites .extrait { font-size:13px; color:var(--doux); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.boites-panne { font-size:13px; margin:0 0 8px; }
</style>`;
}
