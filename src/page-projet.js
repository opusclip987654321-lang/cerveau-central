// Page d'un projet : tout son détail au même endroit (prospects, mails, réponses,
// vidéos…), sa carte business, et l'espace où louis propose ses modifications.
import { gabarit } from './page.js';
import { tableauDeBord } from './business.js';
import { carteProjet, PASTILLES } from './page-journal.js';
import { STATUTS_IDEE } from './idees.js';
import { jourParis } from './questions.js';
import { lienVideo, depuisHeureParis } from './histoires.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (j) => (j ? new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '—');

// Les étiquettes techniques, traduites pour louis.
const L = {
  prospect: { sans_email: 'sans email trouvé', contacte: 'contacté', relance1: 'relancé 1 fois', relance2: 'relancé 2 fois', propose: 'mail à valider', repondu: 'a répondu', ecarte: 'écarté', exclu: 'exclu' },
  envoi: { envoye: 'envoyé', echec: 'échec', en_attente: 'en attente', refuse: 'refusé' },
  leviaroEtat: { decouverte: 'découverte', analysee: 'analysée', a_approfondir: 'à approfondir', hors_perimetre: 'hors périmètre', contact_introuvable: 'contact introuvable', attente_validation: 'mail à valider', sequence_active: 'prospection en cours', discussion_active: 'en discussion', cloturee: 'clôturée', exclue: 'exclue' },
  leviaroMail: { brouillon: 'brouillon', attente_validation: 'à valider', autorise: 'autorisé', reserve: 'réservé', envoye: 'envoyé', annule: 'annulé', rejete: 'rejeté', erreur_temporaire: 'erreur passagère', erreur_permanente: 'échec définitif', livraison_inconnue: 'livraison incertaine' },
  reponse: { humaine: 'vraie réponse', absence: 'absence auto', technique: 'erreur technique', opposition: 'opposition (stop)' },
  impacteur: { A_VERIFIER: 'à vérifier', BLOQUE_ELIGIBILITE: 'bloqué (éligibilité)', ENVOYE: 'envoyé', A_VERIFIER_DECES: 'décès à vérifier', BROUILLON_CREE: 'brouillon créé' },
};
const lb = (table, v) => L[table]?.[v] ?? v ?? '—';

// Un tableau replié : `visibles` lignes affichées, le reste derrière « Voir plus ».
function table(titre, colonnes, lignes, { visibles = 8, vide = 'Rien pour l’instant.' } = {}) {
  if (!lignes.length) return `<section class="bloc"><h3>${e(titre)}</h3><p class="vide">${e(vide)}</p></section>`;
  const ligne = (l) => `<tr>${colonnes.map((c) => `<td>${l[c.cle] ?? '—'}</td>`).join('')}</tr>`;
  const tete = `<tr>${colonnes.map((c) => `<th>${e(c.titre)}</th>`).join('')}</tr>`;
  const reste = lignes.slice(visibles);
  return `<section class="bloc"><h3>${e(titre)} <small>(${lignes.length})</small></h3>
<table>${tete}${lignes.slice(0, visibles).map(ligne).join('')}${reste.length ? `<tbody class="plus" hidden>${reste.map(ligne).join('')}</tbody>` : ''}</table>
${reste.length ? `<button type="button" class="voir-plus" onclick="this.previousElementSibling.querySelector('.plus').hidden=false;this.remove()">Voir plus (${reste.length})</button>` : ''}
</section>`;
}

const etiquette = (texte, ton = '') => `<span class="etiq ${ton}">${e(texte)}</span>`;
const tonProspect = (s) => (s === 'repondu' ? 'ok' : s === 'propose' ? 'attente' : ['exclu', 'ecarte', 'echec'].includes(s) ? 'off' : '');

// Les sections de détail, selon le projet.
function sections(id, { business, journal, histoires }) {
  const notes = journal.evenements.filter((ev) => ev.projet === id).slice(0, 60);
  // Les chaînes YouTube du projet, quand elles sont branchées.
  const chaines = (business.sources?.youtube?.chaines ?? []).filter((c) => c.projet === id);
  const n = (x) => Number(x ?? 0).toLocaleString('fr-FR');
  const blocYoutube = chaines.length
    ? `<section class="bloc"><h3>Chaînes YouTube</h3><ul class="chaines">${chaines
        .map((c) => `<li><b>${e(c.titre)}</b> · ${n(c.abonnes)} abonnés · ${n(c.vues)} vues · ${n(c.nbVideos)} vidéos</li>`)
        .join('')}</ul></section>` +
      table('Dernières vidéos', [{ cle: 'q', titre: 'Publiée le' }, { cle: 't', titre: 'Vidéo' }, { cle: 'v', titre: 'Vues' }, { cle: 'a', titre: '👍' }],
        chaines
          .flatMap((c) => c.videos)
          .sort((a, b) => ((b.jour ?? '') > (a.jour ?? '') ? 1 : -1))
          .map((v) => ({ q: date(v.jour), t: `<a href="https://www.youtube.com/watch?v=${e(v.id)}" target="_blank" rel="noopener">${e(v.titre)}</a>`, v: n(v.vues), a: n(v.aimes) })), { visibles: 10 })
    : '';
  const fin = (reste) => blocYoutube + reste;
  const blocNotes = table(
    'Noté dans le journal',
    [{ cle: 'q', titre: 'Quand' }, { cle: 't', titre: 'Quoi' }],
    notes.map((n) => ({ q: date(n.jour), t: n.lien ? `<a href="${e(n.lien)}" target="_blank" rel="noopener">${e(n.titre)}</a>` : e(n.titre) })),
    { vide: 'Aucune note. Le bouton « Ajouter une note » du Journal les range ici.' },
  );

  if (id === 'nour-meet') {
    const pr = business.sources?.prospection;
    if (!pr) return `<p class="vide">La prospection n’est pas encore lue.</p>${fin(blocNotes)}`;
    const envois = pr.envois.filter((x) => x.jour).sort((a, b) => (b.jour > a.jour ? 1 : -1));
    const repondus = pr.prospects.filter((x) => x.reponse).sort((a, b) => (b.reponse > a.reponse ? 1 : -1));
    const aValider = pr.prospects.filter((x) => x.statut === 'propose');
    return [
      table('Réponses de restaurants', [{ cle: 'q', titre: 'Répondu le' }, { cle: 'n', titre: 'Restaurant' }, { cle: 'v', titre: 'Ville' }],
        repondus.map((x) => ({ q: date(x.reponse), n: e(x.nom ?? '?'), v: e(x.ville ?? '—') }))),
      table('Mails en attente de ta validation', [{ cle: 'n', titre: 'Restaurant' }, { cle: 's', titre: 'État' }],
        aValider.map((x) => ({ n: e(x.nom ?? '?'), s: etiquette('mail à valider', 'attente') })), { vide: 'Aucun mail à valider.' }),
      table('Derniers mails', [{ cle: 'q', titre: 'Quand' }, { cle: 'n', titre: 'Restaurant' }, { cle: 'o', titre: 'Objet' }, { cle: 's', titre: 'État' }],
        envois.map((x) => ({ q: date(x.jour), n: e(x.nom ?? '?'), o: e(x.objet ?? '—'), s: etiquette(lb('envoi', x.statut), x.statut === 'envoye' ? 'ok' : x.statut === 'echec' ? 'off' : '') }))),
      fin(blocNotes),
    ].join('');
  }

  if (id === 'leviaro') {
    const d = business.sources?.leviaro?.detail;
    if (!d) return `<p class="vide">Le détail arrive à la prochaine lecture (dans l’heure).</p>${fin(blocNotes)}`;
    return [
      table('Réponses reçues', [{ cle: 'q', titre: 'Reçue le' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'c', titre: 'Type' }, { cle: 'x', titre: 'Extrait' }],
        d.reponses.map((r) => ({ q: date(r.recu), n: e(r.entreprise || r.de), c: etiquette(lb('reponse', r.categorie), r.categorie === 'humaine' ? 'ok' : r.categorie === 'opposition' ? 'off' : ''), x: e((r.extrait ?? '').slice(0, 120)) }))),
      table('Mails', [{ cle: 'q', titre: 'Quand' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'o', titre: 'Objet' }, { cle: 'r', titre: 'Relance' }, { cle: 's', titre: 'État' }],
        d.messages.map((m) => ({ q: date(m.envoye ?? m.cree), n: e(m.entreprise), o: e(m.objet ?? '—'), r: m.etape ? `relance ${m.etape}` : 'premier mail', s: etiquette(lb('leviaroMail', m.etat), m.etat === 'envoye' ? 'ok' : m.etat?.startsWith('erreur') || m.etat === 'rejete' ? 'off' : m.etat === 'attente_validation' ? 'attente' : '') }))),
      table('Entreprises prospectées', [{ cle: 'q', titre: 'Trouvée le' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'v', titre: 'Ville' }, { cle: 's', titre: 'Où ça en est' }],
        d.entreprises.map((c) => ({ q: date(c.creee), n: e(c.nom), v: e(c.ville ?? '—'), s: etiquette(lb('leviaroEtat', c.etat), c.etat === 'discussion_active' ? 'ok' : ['exclue', 'cloturee', 'hors_perimetre'].includes(c.etat) ? 'off' : '') }))),
      fin(blocNotes),
    ].join('');
  }

  if (id === 'impacteur') {
    const im = business.sources?.impacteur;
    if (!im) return `<p class="vide">Le Sheet Impacteur n’est pas encore lu.</p>${fin(blocNotes)}`;
    const fiches = [...im.fiches].sort((a, b) => (b.envoi ?? '') > (a.envoi ?? '') ? 1 : -1);
    return [
      table('Invités', [{ cle: 'a', titre: 'Auteur' }, { cle: 'l', titre: 'Livre' }, { cle: 'c', titre: 'Chaîne' }, { cle: 's', titre: 'État' }, { cle: 'q', titre: 'Contacté le' }, { cle: 'o', titre: 'Mail ouvert' }],
        fiches.map((f) => ({ a: e(f.auteur ?? '?'), l: e(f.livre ?? '—'), c: e(f.chaine ?? '—'), s: etiquette(lb('impacteur', f.statut), f.statut === 'ENVOYE' ? 'ok' : f.statut?.startsWith('A_VERIFIER') ? 'attente' : f.statut === 'BLOQUE_ELIGIBILITE' ? 'off' : ''), q: date(f.envoi), o: f.ouvert ? `✓ ${date(f.ouvert)}` : '—' })), { visibles: 12 }),
      fin(blocNotes),
    ].join('');
  }

  if (id === 'histoires-vraies') {
    const pub = (histoires?.publiees ?? []).map((p) => ({ ...p, d: depuisHeureParis(p.date) })).sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
    return [
      table('Vidéos publiées', [{ cle: 'q', titre: 'Publiée le' }, { cle: 't', titre: 'Vidéo' }, { cle: 'r', titre: 'Réseaux' }],
        pub.map((p) => {
          const lien = lienVideo(p);
          const reseaux = [p.ig_media_id && 'Instagram', p.fb_video_id && 'Facebook'].filter(Boolean).join(' + ') || '—';
          return { q: p.d ? p.d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '—', t: lien ? `<a href="${e(lien)}" target="_blank" rel="noopener">${e(p.title ?? p.story_id)}</a>` : e(p.title ?? p.story_id), r: e(reseaux) };
        }), { visibles: 12 }),
      '<p class="vide">Les vues par vidéo ne sont pas encore branchées (il faudra l’accès Facebook/Instagram). Tes vidéos faites à la main se notent avec « Ajouter une note » du Journal.</p>',
      fin(blocNotes),
    ].join('');
  }

  return fin(blocNotes);
}

export function pageProjet(configJournal, id, { business, journal, pauses, histoires, idees, verifications = [], jour = jourParis(), message, aRepondre = 0 } = {}) {
  const projet = configJournal.projets.find((p) => p.id === id);
  if (!projet) return null;
  const tableau = tableauDeBord({ business, journal, configJournal, pauses, jour });
  const carte = tableau.cartes.find((c) => c.id === id);

  // La surveillance technique de ce projet, en une ligne par vérification.
  const surveillance = verifications.length
    ? `<details class="bloc technique"><summary>Surveillance technique (${verifications.length})</summary><ul>${verifications
        .map((v) => `<li>${PASTILLES[{ ok: 'vert', attention: 'orange', panne: 'rouge' }[v.etat] ?? 'gris']} ${e(v.nom)} : ${e(v.sens ?? v.detail)}</li>`)
        .join('')}</ul></details>`
    : '';

  const mesIdees = idees.idees.filter((i) => i.projet === id);
  const options = (actuel) => Object.entries(STATUTS_IDEE).map(([v, t]) => `<option value="${v}"${v === actuel ? ' selected' : ''}>${t}</option>`).join('');
  const blocIdees = `<section class="bloc idees"><h3>💡 Mes idées de modifications</h3>
<form method="post" action="/idees" class="nouvelle">
<input type="hidden" name="projet" value="${e(id)}">
<textarea name="texte" required maxlength="2000" rows="2" placeholder="ex. Relancer les restaurants qui ont ouvert le mail sans répondre"></textarea>
<button type="submit">Proposer</button>
</form>
${mesIdees.length ? `<ul>${mesIdees
    .map(
      (i) => `<li class="${e(i.statut)}"><div><p>${e(i.texte)}</p><small>proposée le ${date(i.cree.slice(0, 10))}${i.statut !== 'proposee' ? ` · ${STATUTS_IDEE[i.statut].toLowerCase()}` : ''}</small></div>
<form method="post" action="/idees/statut"><input type="hidden" name="id" value="${e(i.id)}"><input type="hidden" name="projet" value="${e(id)}"><select name="statut" onchange="this.form.submit()">${options(i.statut)}</select></form></li>`,
    )
    .join('')}</ul>` : '<p class="vide">Écris ici tout ce que tu voudrais changer sur ce projet : c’est gardé, avec un suivi. Dis-le moi aussi dans notre discussion Claude pour que je m’y mette.</p>'}
</section>`;

  const contenu = `${message ? `<p class="message">${e(message)}</p>` : ''}
<p class="retour"><a href="/journal">‹ Retour au tableau de bord</a></p>
${carte ? `<div class="bds une">${carteProjet({ ...carte, periode: tableau.periode }, 7)}</div>` : ''}
${blocIdees}
${sections(id, { business, journal, histoires })}
${surveillance}
<style>
.retour { margin:0 0 10px; } .retour a { color:var(--doux); text-decoration:none; }
.bds.une { display:grid; margin-bottom:14px; }
.bd { background:var(--carte); border:1px solid var(--bord); border-top:4px solid var(--bord); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; min-width:0; }
.bd.vert { border-top-color:var(--ok); } .bd.orange { border-top-color:var(--attention); } .bd.rouge { border-top-color:var(--panne); }
.bd h3 { margin:0; font-size:16px; } .bd h3 a { color:inherit; text-decoration:none; } .bd h3 .fleche { display:none; }
.chiffres { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; }
.chiffres div { display:flex; flex-direction:column; }
.chiffres b { font-size:22px; line-height:1.1; } .chiffres .principal b { font-size:28px; }
.chiffres span { font-size:13px; color:var(--doux); } .chiffres small { font-size:12px; color:var(--doux); }
.graphe { width:100%; height:auto; max-width:460px; }
.graphe .b1 { fill:var(--ok); opacity:.55; } .graphe .b2 { fill:var(--texte); opacity:.85; }
.graphe .axe { stroke:var(--bord); } .graphe text { font-size:9px; fill:var(--doux); }
.legende { margin:0; font-size:12px; color:var(--doux); display:flex; gap:6px; align-items:center; }
.legende i { width:10px; height:10px; border-radius:2px; display:inline-block; } .legende .l1 { background:var(--ok); opacity:.55; } .legende .l2 { background:var(--texte); margin-left:8px; }
.decider { background:var(--fond); border-radius:8px; padding:8px 10px; font-size:14px; } .decider ul { margin:4px 0 0; padding-left:18px; }
.obj { margin:0; font-size:13px; color:var(--doux); display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.obj input[type=number] { width:70px; font:inherit; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.obj button { padding:4px 10px; font-size:13px; }
.manque { margin:0; font-size:12px; color:var(--doux); font-style:italic; }
.bloc { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 14px; margin-bottom:14px; overflow-x:auto; }
.bloc h3 { margin:0 0 8px; font-size:15px; }
.chaines { list-style:none; margin:0; padding:0; } .chaines li { padding:3px 0; font-size:14px; } .bloc h3 small { color:var(--doux); font-weight:400; }
.bloc table { border-collapse:collapse; width:100%; font-size:13px; }
.bloc th { text-align:left; color:var(--doux); font-weight:500; padding:4px 10px 4px 0; border-bottom:1px solid var(--bord); white-space:nowrap; }
.bloc td { padding:5px 10px 5px 0; border-bottom:1px solid var(--bord); vertical-align:top; }
.bloc tr:last-child td { border-bottom:0; }
.voir-plus { margin-top:8px; font-size:13px; }
.etiq { display:inline-block; padding:1px 8px; border-radius:10px; background:var(--fond); border:1px solid var(--bord); font-size:12px; white-space:nowrap; }
.etiq.ok { color:var(--ok); border-color:var(--ok); } .etiq.off { color:var(--doux); } .etiq.attente { color:var(--attention); border-color:var(--attention); }
.idees textarea { width:100%; font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); box-sizing:border-box; }
.idees .nouvelle { display:flex; flex-direction:column; gap:8px; align-items:flex-start; margin-bottom:10px; }
.idees ul { list-style:none; margin:0; padding:0; }
.idees li { display:flex; gap:10px; justify-content:space-between; align-items:flex-start; padding:8px 0; border-top:1px solid var(--bord); }
.idees li p { margin:0; font-size:14px; } .idees li small { color:var(--doux); }
.idees li.faite p { text-decoration:line-through; color:var(--doux); }
.idees li.ecartee p { color:var(--doux); }
.idees select { font:inherit; font-size:13px; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.technique summary { cursor:pointer; font-weight:600; font-size:15px; }
.technique ul { list-style:none; margin:8px 0 0; padding:0; } .technique li { padding:4px 0; font-size:14px; }
.vide { color:var(--doux); font-size:14px; }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>`;
  return gabarit({ onglet: 'journal', aRepondre, contenu });
}
