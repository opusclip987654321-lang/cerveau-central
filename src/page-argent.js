// Page « Argent » : ce que coûtent les projets, et les factures déposées par louis.
import { gabarit } from './page.js';
import { bilan, prochaineEcheance, totalLisible, montantLisible, FREQUENCES, DEVISES } from './argent.js';
import { rapprochement, depenseIaDuMois, TYPES, TAILLE_MAX } from './factures.js';
import { jourParis } from './questions.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateCourte = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }) : '');

export function pageArgent(config, donnees, { jour = jourParis(), message, aRepondre = 0, lectureActive = false, plafondIa = 10 } = {}) {
  const nomProjet = (id) => config.projets.find((p) => p.id === id)?.nom ?? id;
  const b = bilan(donnees.lignes, jour);
  const r = rapprochement(donnees, jour);
  const etatLigne = new Map(r.lignes.map((x) => [x.ligne.id, x]));
  const factures = donnees.factures ?? [];
  const aJour = r.lignes.filter((x) => x.aJour).length;

  const tuile = (titre, valeur, detail = '') => `<div class="tuile"><span>${titre}</span><b>${valeur}</b>${detail ? `<small>${detail}</small>` : ''}</div>`;
  const tuiles = `<div class="tuiles">
${tuile('Ce mois-ci', totalLisible(b.ceMois), 'abonnements + recharges du mois')}
${tuile('Fixe par mois', totalLisible(b.fixe), 'abonnements et domaines lissés')}
${tuile('Recharges, 30 derniers jours', totalLisible(b.trenteJours))}
${tuile('Factures', factures.length ? `${aJour} / ${r.lignes.length} à jour` : 'aucune', factures.length ? 'lignes couvertes par une facture récente' : 'dépose-les ci-dessous')}
</div>`;

  const statutFacture = (l) => {
    const x = etatLigne.get(l.id);
    if (!x?.derniere) return '<span class="manque">pas de facture</span>';
    const f = x.derniere.lecture;
    const ecart = x.ecart ? `<br><span class="manque">⚠️ ${montantLisible(f.montant, f.devise)} sur la facture</span>` : '';
    return `<span class="${x.aJour ? 'ok' : 'manque'}">${x.aJour ? '✅' : '⏳'} ${dateCourte(f.date)}</span>${ecart}`;
  };
  const lignes = [...donnees.lignes]
    .sort((a, b2) => ['mois', 'an', 'une-fois'].indexOf(a.frequence) - ['mois', 'an', 'une-fois'].indexOf(b2.frequence) || (b2.date ?? '').localeCompare(a.date ?? ''))
    .map((l) => {
      const echeance = prochaineEcheance(l, jour);
      const quand = l.frequence === 'une-fois' ? dateCourte(l.date) : echeance ? `prochain : ${dateCourte(echeance)}` : '<span class="doux">date à préciser</span>';
      return `<tr><td>${e(l.libelle)}<small>${e(nomProjet(l.projet))}</small></td><td class="num">${montantLisible(l.montant, l.devise)}<small>${FREQUENCES[l.frequence]}</small></td><td>${quand}</td><td>${statutFacture(l)}</td>
<td><form method="post" action="/argent/supprimer" onsubmit="return confirm('Retirer « ${e(l.libelle).replace(/'/g, '’')} » de la liste ?')"><input type="hidden" name="id" value="${e(l.id)}"><button class="petit" title="Retirer">✕</button></form></td></tr>`;
    })
    .join('\n');

  const parProjet = Object.entries(b.projets)
    .sort(([, x], [, y]) => (y.ceMois['€'] ?? 0) - (x.ceMois['€'] ?? 0))
    .map(([id, x]) => `<tr><td>${e(nomProjet(id))}</td><td class="num">${totalLisible(x.fixe)}</td><td class="num">${totalLisible(x.ceMois)}</td></tr>`)
    .join('');

  const ligneFacture = (f) => {
    const l = f.lecture;
    let corps;
    if (l && !l.estUneFacture) corps = '<span class="manque">ce document ne ressemble pas à une facture</span>';
    else if (l) {
      const cible = donnees.lignes.find((x) => x.id === l.ligne);
      corps = `${e(l.fournisseur)} · <b>${montantLisible(l.montant, l.devise)}</b> · ${dateCourte(l.date)}${l.periode ? ` (${e(l.periode)})` : ''}<br>${
        cible
          ? `<span class="ok">→ ${e(cible.libelle)}</span>`
          : `<span class="manque">ne correspond à aucune ligne</span>
<form method="post" action="/argent/ajouter" class="enligne"><input type="hidden" name="libelle" value="${e(l.fournisseur)}"><input type="hidden" name="montant" value="${e(l.montant)}"><input type="hidden" name="devise" value="${l.devise === '$' ? '$' : '€'}"><input type="hidden" name="frequence" value="une-fois"><input type="hidden" name="date" value="${e(l.date)}"><input type="hidden" name="projet" value="commun"><input type="hidden" name="facture" value="${e(f.id)}"><button class="petit">Ajouter à la liste</button></form>`
      }`;
    } else if (f.erreur) corps = `<span class="manque">${e(f.erreur)}</span>`;
    else corps = lectureActive ? '<span class="doux">lecture en cours…</span>' : '<span class="doux">en attente : la lecture démarrera quand la clé Claude sera branchée</span>';
    const relire = f.lecture || f.erreur ? `<form method="post" action="/argent/factures/relire" class="enligne"><input type="hidden" name="id" value="${e(f.id)}"><button class="petit" title="Relire">↻</button></form>` : '';
    return `<li><div><b>${e(f.nom)}</b><br>${corps}</div><div class="boutons">${relire}<form method="post" action="/argent/factures/supprimer" class="enligne" onsubmit="return confirm('Supprimer cette facture ?')"><input type="hidden" name="id" value="${e(f.id)}"><button class="petit" title="Supprimer">✕</button></form></div></li>`;
  };

  const options = (liste, choisi) => liste.map(([v, t]) => `<option value="${e(v)}"${v === choisi ? ' selected' : ''}>${e(t)}</option>`).join('');

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
${tuiles}

<section class="bloc">
<h3>Factures</h3>
<label class="depot" id="depot"><input type="file" id="fichiers" accept="${Object.keys(TYPES).join(',')}" multiple hidden>
<b>📎 Dépose tes factures ici</b><span>ou clique pour les choisir · PDF ou photo · ${TAILLE_MAX / 1024 / 1024} Mo max</span></label>
<p id="envoi" class="doux"></p>
${factures.length ? `<ul class="factures">${factures.map(ligneFacture).join('')}</ul>` : ''}
<p class="doux petit-texte">Le cerveau lit chaque facture avec Claude (environ 1 centime par facture) et la rapproche de ta liste. Dépense IA ce mois : ${montantLisible(Math.round(depenseIaDuMois(donnees, jour) * 100) / 100, '$')} sur ${plafondIa} $ de plafond.</p>
</section>

<section class="bloc">
<h3>Dépenses</h3>
<div class="defile"><table class="depenses"><thead><tr><th>Dépense</th><th class="num">Montant</th><th>Quand</th><th>Facture</th><th></th></tr></thead><tbody>
${lignes}
</tbody></table></div>
<details class="ajout"><summary>+ Ajouter une dépense</summary>
<form method="post" action="/argent/ajouter" class="formulaire">
<label>Nom<input name="libelle" required maxlength="80" placeholder="ex. Recharge OpenAI"></label>
<label>Montant<input name="montant" required inputmode="decimal" placeholder="12,50"></label>
<label>Devise<select name="devise">${options(DEVISES.map((d) => [d, d]), '€')}</select></label>
<label>Fréquence<select name="frequence">${options(Object.entries(FREQUENCES), 'une-fois')}</select></label>
<label>Date<input type="date" name="date" value="${jour}"><small>pour un abonnement : date du prochain paiement</small></label>
<label>Projet<select name="projet">${options(config.projets.map((p) => [p.id, p.nom]), 'commun')}</select></label>
<button type="submit">Ajouter</button>
</form></details>
</section>

<section class="bloc">
<h3>Par projet</h3>
<div class="defile"><table><thead><tr><th>Projet</th><th class="num">Fixe par mois</th><th class="num">Ce mois-ci</th></tr></thead><tbody>${parProjet}</tbody></table></div>
<p class="doux petit-texte">Les dépenses partagées (VPS Nūr, Claude, ChatGPT…) sont dans « Commun ». L'argent qui rentre (Stripe, YouTube) arrivera ici quand on les branchera.</p>
</section>

<style>
.tuiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:12px; margin-bottom:20px; }
.tuile { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:2px; }
.tuile span, .tuile small { color:var(--doux); font-size:13px; }
.tuile b { font-size:22px; font-variant-numeric:tabular-nums; }
.bloc { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:14px 16px; margin-bottom:16px; }
.bloc h3 { margin:0 0 10px; }
.defile { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; color:var(--doux); font-weight:500; font-size:13px; padding:6px 8px; border-bottom:1px solid var(--bord); }
td { padding:8px; border-top:1px solid var(--bord); vertical-align:top; }
td small { display:block; color:var(--doux); font-size:12px; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.ok { color:var(--ok); } .manque { color:var(--attention); } .doux { color:var(--doux); }
.petit-texte { font-size:13px; margin:10px 0 0; }
button.petit { padding:2px 8px; font-size:13px; }
.enligne { display:inline; }
.depot { display:flex; flex-direction:column; align-items:center; gap:4px; padding:22px 12px; border:2px dashed var(--bord); border-radius:12px; cursor:pointer; text-align:center; }
.depot span { color:var(--doux); font-size:13px; }
.depot.survol { border-color:var(--ok); }
.factures { list-style:none; padding:0; margin:12px 0 0; }
.factures li { display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-top:1px solid var(--bord); font-size:14px; }
.factures .boutons { display:flex; gap:4px; align-items:flex-start; }
.formulaire { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-top:10px; align-items:end; }
.formulaire label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--doux); }
.formulaire small { font-size:11px; }
.formulaire input, .formulaire select { font:inherit; padding:7px 9px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.ajout summary { cursor:pointer; margin-top:12px; font-weight:600; }
@media (max-width:600px) {
  .depenses thead { display:none; }
  .depenses tr { display:grid; grid-template-columns:1fr auto auto; gap:2px 10px; padding:9px 0; border-top:1px solid var(--bord); }
  .depenses td { border:0; padding:0; }
  .depenses td:nth-child(3), .depenses td:nth-child(4) { grid-column:1 / 3; font-size:13px; }
  .depenses td:nth-child(5) { grid-row:1; grid-column:3; }
}
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>
<script>
const zone = document.getElementById('depot'), champ = document.getElementById('fichiers'), info = document.getElementById('envoi');
const lire = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(f); });
async function envoyer(fichiers) {
  let n = 0;
  for (const f of fichiers) {
    info.textContent = 'Envoi de ' + f.name + '…';
    const rep = await fetch('/argent/factures', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nom: f.name, type: f.type, base64: await lire(f) }) });
    if (!rep.ok) { info.textContent = f.name + ' : ' + (await rep.text()); return; }
    n++;
  }
  location.href = '/argent?message=' + encodeURIComponent(n + ' facture(s) déposée(s), lecture en cours');
}
champ.onchange = () => envoyer([...champ.files]);
zone.ondragover = (ev) => { ev.preventDefault(); zone.classList.add('survol'); };
zone.ondragleave = () => zone.classList.remove('survol');
zone.ondrop = (ev) => { ev.preventDefault(); zone.classList.remove('survol'); envoyer([...ev.dataTransfer.files]); };
${factures.some((f) => !f.lecture && !f.erreur) && lectureActive ? "setTimeout(() => location.reload(), 6000);" : ''}
</script>`;
  return gabarit({ onglet: 'argent', aRepondre, contenu });
}
