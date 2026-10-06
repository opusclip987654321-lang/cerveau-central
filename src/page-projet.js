// Page d'un projet : tout son détail au même endroit (prospects, mails, réponses,
// vidéos…), sa carte business, et l'espace où louis propose ses modifications.
import { gabarit } from './page.js';
import { tableauDeBord } from './business.js';
import { carteProjet, PASTILLES, CSS_CARTE } from './page-journal.js';
import { STATUTS_IDEE } from './idees.js';
import { ETATS_SUIVI, ETATS_FINIS, cleReponse } from './suivi.js';
import { jourParis } from './questions.js';
import { lienVideo, depuisHeureParis } from './histoires.js';
import { grouperParJour, exempleDuJour, reponseAutomatique, lienGmail } from './mails.js';
import { DECISIONS_TRI, cleTri } from './tri-mails.js';

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const date = (j) => (j ? new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : '—');

// Les étiquettes techniques, traduites pour louis.
const L = {
  prospect: { sans_email: 'sans email trouvé', contacte: 'contacté', relance1: 'relancé 1 fois', relance2: 'relancé 2 fois', propose: 'mail préparé, jamais parti', repondu: 'a répondu', ecarte: 'écarté', exclu: 'exclu' },
  envoi: { envoye: 'envoyé', echec: 'échec', en_attente: 'en attente', refuse: 'refusé' },
  leviaroEtat: { decouverte: 'découverte', analysee: 'analysée', a_approfondir: 'à approfondir', hors_perimetre: 'hors périmètre', contact_introuvable: 'contact introuvable', attente_validation: 'mail à valider', sequence_active: 'prospection en cours', discussion_active: 'en discussion', cloturee: 'clôturée', exclue: 'exclue' },
  leviaroMail: { brouillon: 'brouillon', attente_validation: 'à valider', autorise: 'autorisé', reserve: 'réservé', envoye: 'envoyé', annule: 'annulé', rejete: 'rejeté', erreur_temporaire: 'erreur passagère', erreur_permanente: 'échec définitif', livraison_inconnue: 'livraison incertaine' },
  reponse: { humaine: 'vraie réponse', absence: 'absence auto', technique: 'erreur technique', opposition: 'opposition (stop)' },
  impacteur: { A_VERIFIER: 'à vérifier', BLOQUE_ELIGIBILITE: 'bloqué (éligibilité)', ENVOYE: 'envoyé', A_VERIFIER_DECES: 'décès à vérifier', BROUILLON_CREE: 'brouillon créé' },
};
const lb = (table, v) => L[table]?.[v] ?? v ?? '—';

// Ce que veulent dire ces états, en clair (le petit ℹ️ au-dessus des tableaux).
const AIDE = {
  leviaroEtat: [
    ['découverte', 'l’agent vient de trouver cette entreprise, il ne l’a pas encore étudiée'],
    ['analysée', 'l’agent a étudié l’entreprise, la suite arrive'],
    ['à approfondir', 'cible qui semble intéressante, l’agent doit creuser avant de la contacter'],
    ['hors périmètre', 'ne correspond pas aux clients recherchés, on laisse tomber'],
    ['contact introuvable', 'bonne cible, mais aucune adresse mail trouvée'],
    ['mail à valider', 'un mail est prêt, il attend ton accord avant de partir'],
    ['prospection en cours', 'le premier mail est parti, les relances suivent toutes seules'],
    ['en discussion', 'l’entreprise a répondu, un vrai échange est en cours'],
    ['clôturée', 'l’échange est terminé'],
    ['exclue', 'retirée de la prospection, on ne la contactera plus'],
  ],
  leviaroMail: [
    ['brouillon', 'mail écrit par l’agent, pas encore proposé'],
    ['à valider', 'attend ton accord avant l’envoi'],
    ['autorisé', 'tu as dit oui, il part au prochain créneau'],
    ['réservé', 'l’agent est en train de l’envoyer'],
    ['envoyé', 'parti chez l’entreprise'],
    ['annulé', 'abandonné avant de partir'],
    ['rejeté', 'tu as dit non, il ne partira pas'],
    ['erreur passagère', 'l’envoi a raté, l’agent réessaiera tout seul'],
    ['échec définitif', 'l’adresse ne marche pas, l’agent n’insistera plus'],
    ['livraison incertaine', 'parti, mais sans certitude qu’il soit bien arrivé'],
  ],
  reponse: [
    ['vraie réponse', 'une personne a vraiment répondu : à lire'],
    ['absence auto', 'simple message automatique d’absence, rien à faire'],
    ['erreur technique', 'le mail n’est pas arrivé (adresse invalide, boîte pleine…)'],
    ['opposition (stop)', 'l’entreprise demande qu’on arrête de la contacter'],
  ],
  envoi: [
    ['envoyé', 'le mail est parti chez le restaurant'],
    ['échec', 'l’envoi a raté ; quand l’automatisation enregistre la cause (adresse invalide, blocage du serveur…), elle s’affiche à côté du mail — sinon elle reste dans n8n, le cerveau ne l’invente pas'],
    ['en attente', 'préparé, il attend son créneau d’envoi'],
    ['refusé', 'tu avais dit non du temps de la validation Telegram'],
    ['jamais parti', 'préparé par l’ancien circuit de validation et resté en attente : à trier dans le bloc dédié'],
    ['★ exemple du jour', 'un mail de la journée tiré au sort, toujours le même pour une même date'],
    ['Important', 'le texte réel d’un mail s’affiche dès que l’automatisation le copie dans le cerveau ; tant qu’il manque, c’est dit tel quel et « Chercher dans Gmail » ouvre l’échange réel, rien n’est inventé à la place'],
  ],
  triMails: [
    ['Laisser en attente', 'rien ne change, tu décideras plus tard'],
    ['À faire repartir (après vérification)', 'ta décision est notée ; la reprise réelle passe par n8n ou Claude, après contrôle des envois déjà faits — le cerveau n’envoie rien lui-même'],
    ['Abandonner', 'ce mail ne partira pas, la fiche est classée'],
    ['⚠ doublon possible', 'ce restaurant a déjà reçu un mail envoyé : repartir risquerait une relance en double'],
    ['Important', 'trier ces anciens mails ne remet aucune validation sur les envois automatiques futurs'],
  ],
  impacteur: [
    ['à vérifier', 'la fiche attend ta vérification avant l’envoi'],
    ['décès à vérifier', 'l’auteur est peut-être décédé : à vérifier avant tout contact'],
    ['brouillon créé', 'le mail est prêt dans Gmail, pas encore envoyé'],
    ['envoyé', 'le mail d’invitation est parti'],
    ['bloqué (éligibilité)', 'la fiche ne remplit pas les critères, elle ne sera pas contactée'],
    ['Important', 'la « chaîne » affichée vient du Sheet : tant que l’automatisation n’enregistre pas le compte Gmail réellement utilisé, c’est une déclaration, pas une preuve ; dès qu’elle l’enregistre, le compte s’affiche sur chaque mail'],
  ],
  suivi: [
    ['À traiter', 'la liste compte les réponses qui attendent une suite de ta part ; les réponses automatiques probables (absence, accusé…) sont rangées à part'],
    ['À lire', 'réponse pas encore prise en main'],
    ['Suivi en cours', 'tu t’en occupes (appel prévu, échange en cours)'],
    ['En attente du restaurant', 'la balle est chez eux, tu attends leur retour'],
    ['À relancer', 'pas de nouvelles : prévoir une relance à la main'],
    ['Traité', 'conversation terminée, la ligne part dans « Réponses traitées »'],
    ['Refus', 'le restaurant a dit non'],
    ['Opposition', 'il demande qu’on arrête de le contacter'],
    ['Important', 'changer l’état n’envoie aucun mail et n’arrête aucune automatisation : c’est juste une étiquette pour toi'],
  ],
};
const aide = (cle) =>
  AIDE[cle]
    ? `<details class="aide"><summary>ℹ️ Que veulent dire ces mots ?</summary><ul>${AIDE[cle]
        .map(([t, x]) => `<li><b>${e(t)}</b> : ${e(x)}.</li>`)
        .join('')}</ul></details>`
    : '';

// Un tableau replié : `visibles` lignes affichées, le reste derrière « Voir plus ».
function table(titre, colonnes, lignes, { visibles = 8, vide = 'Rien pour l’instant.', aide: blocAide = '' } = {}) {
  if (!lignes.length) return `<section class="bloc"><h3>${e(titre)}</h3><p class="vide">${e(vide)}</p></section>`;
  const ligne = (l) => `<tr>${colonnes.map((c) => `<td>${l[c.cle] ?? '—'}</td>`).join('')}</tr>`;
  const tete = `<tr>${colonnes.map((c) => `<th>${e(c.titre)}</th>`).join('')}</tr>`;
  const reste = lignes.slice(visibles);
  return `<section class="bloc"><h3>${e(titre)} <small>(${lignes.length})</small></h3>${blocAide}
<table>${tete}${lignes.slice(0, visibles).map(ligne).join('')}${reste.length ? `<tbody class="plus" hidden>${reste.map(ligne).join('')}</tbody>` : ''}</table>
${reste.length ? `<button type="button" class="voir-plus" onclick="this.previousElementSibling.querySelector('.plus').hidden=false;this.remove()">Voir plus (${reste.length})</button>` : ''}
</section>`;
}

const etiquette = (texte, ton = '') => `<span class="etiq ${ton}">${e(texte)}</span>`;

// Un texte long se replie : on voit le début, un clic montre tout.
const texteCellule = (t) => {
  const plein = String(t ?? '').trim();
  if (!plein) return '—';
  if (plein.length <= 90) return e(plein);
  return `<details class="texte"><summary>${e(plein.slice(0, 90))}…</summary><p>${e(plein)}</p></details>`;
};
const tonProspect = (s) => (s === 'repondu' ? 'ok' : s === 'propose' ? 'attente' : ['exclu', 'ecarte', 'echec'].includes(s) ? 'off' : '');

// Les sections de détail, selon le projet.
function sections(id, { business, journal, histoires, suivi, tri }) {
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
  // Le bloc des notes est masqué tant qu'il est vide (demande de louis du 06/10) :
  // « Ajouter une note » reste expliqué sur la page Activité, où il se trouve.
  const blocNotes = notes.length
    ? table(
        'Noté dans le journal',
        [{ cle: 'q', titre: 'Quand' }, { cle: 't', titre: 'Quoi' }],
        notes.map((n) => ({ q: date(n.jour), t: n.lien ? `<a href="${e(n.lien)}" target="_blank" rel="noopener">${e(n.titre)}</a>` : e(n.titre) })),
      )
    : '';

  if (id === 'nour-meet') {
    const pr = business.sources?.prospection;
    if (!pr) return `<p class="vide">La prospection n’est pas encore lue.</p>${fin(blocNotes)}`;
    const envois = pr.envois.filter((x) => x.jour).sort((a, b) => (b.jour > a.jour ? 1 : -1));
    const repondus = pr.prospects.filter((x) => x.reponse).sort((a, b) => (b.reponse > a.reponse ? 1 : -1));
    const aValider = pr.prospects.filter((x) => x.statut === 'propose');
    // Les réponses dont on a le texte (gardées depuis le 05/10/2026) ; les plus anciennes n'ont que la date.
    const textes = pr.reponses ?? [];
    const nomsAvecTexte = new Set(textes.map((r) => r.nom).filter(Boolean));

    // Le parcours commercial compte des restaurants, pas des messages.
    const ab = business.sources?.stripe?.abonnements;
    const etapes = [
      { n: pr.prospects.length, t: 'trouvés' },
      { n: pr.prospects.filter((x) => x.email).length, t: 'contactables' },
      { n: pr.prospects.filter((x) => x.premier).length, t: 'contactés' },
      { n: repondus.length, t: 'ont répondu' },
      { n: ab?.actifs ?? '?', t: 'abonnés payants' },
    ];
    const parcours = `<section class="bloc"><h3>Parcours commercial <small>(restaurants, depuis le début)</small></h3>
<div class="parcours">${etapes.map((s) => `<div class="etape"><b>${s.n}</b><span>${s.t}</span></div>`).join('<span class="fleche-p">›</span>')}</div>
<p class="vide">${envois.filter((x) => x.statut === 'envoye').length} mails envoyés au total, relances comprises. L’inscription sur le site n’est pas encore branchée${ab ? '' : ' ; Stripe non plus' }.</p></section>`;

    // Chaque réponse porte son suivi manuel (une étiquette : ça n'envoie jamais de mail).
    // Une réponse détectée sans texte est dite telle quelle, avec le lien Gmail : rien d'inventé.
    const sansTexte = (nom) =>
      `<span class="vide">Réponse détectée, contenu indisponible.</span> <a href="${lienGmail(nom)}" target="_blank" rel="noopener">Chercher dans Gmail ›</a>`;
    const lignes = [
      ...textes.map((r) => ({ cle: cleReponse(r), j: r.jour ?? '', q: date(r.jour), n: e(r.nom ?? r.de ?? '?'), v: e(r.ville ?? '—'), x: r.texte?.trim() ? texteCellule(r.texte) : sansTexte(r.nom ?? r.de), auto: reponseAutomatique(r) }),
      ),
      ...repondus.filter((x) => !nomsAvecTexte.has(x.nom)).map((x) => ({ cle: cleReponse({ jour: x.reponse, nom: x.nom }), j: x.reponse ?? '', q: date(x.reponse), n: e(x.nom ?? '?'), v: e(x.ville ?? '—'), x: sansTexte(x.nom), auto: false })),
    ]
      .sort((a, b) => (b.j > a.j ? 1 : -1))
      .map((l) => ({ ...l, suivi: suivi?.reponses?.[l.cle] }));
    const formSuivi = (l) => {
      const s = l.suivi ?? { etat: 'a_lire' };
      return `<form method="post" action="/suivi-reponse" class="suivi-form"><input type="hidden" name="cle" value="${l.cle}"><select name="etat">${Object.entries(ETATS_SUIVI)
        .map(([v, t]) => `<option value="${v}"${s.etat === v ? ' selected' : ''}>${t}</option>`)
        .join('')}</select><input name="action" maxlength="300" placeholder="prochaine action" value="${e(s.action ?? '')}"><input name="echeance" type="date" value="${s.echeance ?? ''}"><button type="submit">OK</button></form>`;
    };
    const colonnes = [{ cle: 'q', titre: 'Reçue le' }, { cle: 'n', titre: 'Restaurant' }, { cle: 'v', titre: 'Ville' }, { cle: 'x', titre: 'Leur réponse' }, { cle: 's', titre: 'Suivi' }];
    const enCours = lignes.filter((l) => !ETATS_FINIS.has(l.suivi?.etat) && !l.auto).map((l) => ({ ...l, s: formSuivi(l) }));
    const autos = lignes.filter((l) => !ETATS_FINIS.has(l.suivi?.etat) && l.auto).map((l) => ({ ...l, s: formSuivi(l) }));
    const finies = lignes.filter((l) => ETATS_FINIS.has(l.suivi?.etat)).map((l) => ({ ...l, s: formSuivi(l) }));

    // L'échange complet d'un restaurant : premier mail, relances, réponses connues, dans l'ordre.
    // Le texte envoyé s'affiche quand l'automatisation l'a copié (np_envois.corps) ; sinon c'est dit.
    const echange = (nomResto) => {
      const envoisResto = envois.filter((x) => x.nom === nomResto);
      const fils = [
        ...envoisResto.map((x) => ({
          j: x.jour,
          h: `→ ${date(x.jour)} · ${e(x.objet ?? 'objet non enregistré')} ${etiquette(lb('envoi', x.statut), x.statut === 'envoye' ? 'ok' : x.statut === 'echec' ? 'off' : '')}${x.statut === 'echec' && x.erreur ? ` <small class="cause-echec">cause : ${e(x.erreur)}</small>` : ''}${x.corps ? `<span class="corps-mail">${texteCellule(x.corps)}</span>` : ''}`,
        })),
        ...textes.filter((r) => r.nom === nomResto).map((r) => ({ j: r.jour, h: `← ${date(r.jour)} · réponse : ${texteCellule(r.texte)}` })),
      ].sort((a, b) => ((a.j ?? '') > (b.j ?? '') ? 1 : -1));
      const manquants = envoisResto.filter((x) => !x.corps).length;
      return `<div class="echange-mail">${fils.map((f) => `<p>${f.h}</p>`).join('')}
${manquants ? `<p class="note-mail">Le texte de ${manquants === envoisResto.length ? (manquants === 1 ? 'ce mail' : 'ces mails') : `${manquants} mail(s)`} n’est pas copié dans le cerveau (contenu non récupéré). <a href="${lienGmail(nomResto)}" target="_blank" rel="noopener">Chercher l’échange dans Gmail ›</a></p>` : ''}</div>`;
    };

    // Une seule ligne par journée d'envoi ; chaque mail s'ouvre sur son échange.
    const parJour = grouperParJour(envois).slice(0, 60);
    const blocJours = parJour.length
      ? `<section class="bloc"><h3>Mails envoyés, jour par jour <small>(${parJour.length} journée(s))</small></h3>${aide('envoi')}
${parJour
  .map(([j, liste]) => {
    const envoyes = liste.filter((x) => x.statut === 'envoye').length;
    const echecs = liste.filter((x) => x.statut === 'echec').length;
    const ex = exempleDuJour(j, liste.length);
    return `<details class="jour-mails"><summary><b>${date(j)}</b> · ${envoyes} mail(s) envoyé(s)${echecs ? ` · <span class="etiq off">${echecs} échec(s)</span>` : ''}<span class="voir">Voir les ${liste.length} mails ›</span></summary>
${liste.map((m, i) => `<details class="mail"><summary>${i === ex ? '★ ' : ''}${e(m.nom ?? '?')} — ${e(m.objet ?? 'objet non enregistré')} ${etiquette(lb('envoi', m.statut), m.statut === 'envoye' ? 'ok' : m.statut === 'echec' ? 'off' : '')}${m.statut === 'echec' && m.erreur ? ` <small class="cause-echec">${e(m.erreur)}</small>` : ''}${i === ex ? ' <small class="ex">exemple du jour</small>' : ''}</summary>${echange(m.nom)}</details>`).join('')}
</details>`;
  })
  .join('')}</section>`
      : '';

    // Les vieux mails jamais partis se trient par lots : le cerveau NOTE la
    // décision, il n'envoie rien (la reprise passe par n8n ou Claude).
    const dejaDecide = (nom) => tri?.decisions?.[cleTri(nom)];
    const blocTri = aValider.length
      ? `<section class="bloc"><h3>Mails préparés jamais partis <small>(${aValider.length})</small></h3>${aide('triMails')}
<form method="post" action="/tri-mails">
<table><tr><th></th><th>Restaurant</th><th>Ta décision</th></tr>
${aValider
  .map((x) => {
    const d = dejaDecide(x.nom);
    return `<tr><td><input type="checkbox" name="noms" value="${e(x.nom ?? '')}"></td><td>${e(x.nom ?? '?')}</td><td>${
      d ? `${etiquette(DECISIONS_TRI[d.decision] ?? d.decision, d.decision === 'abandonner' ? 'off' : d.decision === 'envoyer' ? 'ok' : '')}${d.doublon ? ' <span class="etiq off">⚠ doublon possible</span>' : ''}` : etiquette('jamais parti', 'attente')
    }</td></tr>`;
  })
  .join('')}</table>
<div class="barre-tri"><label>Décision pour les cochés <select name="decision">${Object.entries(DECISIONS_TRI).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label><button>Noter</button></div>
<p class="note-mail">Rien ne part d’ici : ta décision est notée, la reprise réelle se fait dans n8n ou via Claude après vérification des envois déjà faits.</p>
</form></section>`
      : `<section class="bloc"><h3>Mails préparés jamais partis</h3><p class="vide">Rien en attente : tous les mails préparés sont partis.</p></section>`;

    return [
      parcours,
      table('Réponses à traiter', colonnes, enCours, { vide: 'Aucune réponse en attente de suivi.', aide: aide('suivi') }),
      autos.length ? table('Réponses automatiques probables', colonnes, autos, { visibles: 3 }) : '',
      finies.length ? table('Réponses traitées', colonnes, finies, { visibles: 5 }) : '',
      blocTri,
      blocJours,
      fin(blocNotes),
    ].join('');
  }

  if (id === 'leviaro') {
    const d = business.sources?.leviaro?.detail;
    if (!d) return `<p class="vide">Le détail arrive à la prochaine lecture (dans l’heure).</p>${fin(blocNotes)}`;
    return [
      table('Réponses reçues', [{ cle: 'q', titre: 'Reçue le' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'c', titre: 'Type' }, { cle: 'x', titre: 'Extrait' }],
        d.reponses.map((r) => ({ q: date(r.recu), n: e(r.entreprise || r.de), c: etiquette(lb('reponse', r.categorie), r.categorie === 'humaine' ? 'ok' : r.categorie === 'opposition' ? 'off' : ''), x: e((r.extrait ?? '').slice(0, 120)) })), { aide: aide('reponse') }),
      table('Mails', [{ cle: 'q', titre: 'Quand' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'o', titre: 'Objet' }, { cle: 'r', titre: 'Relance' }, { cle: 's', titre: 'État' }],
        d.messages.map((m) => ({ q: date(m.envoye ?? m.cree), n: e(m.entreprise), o: e(m.objet ?? '—'), r: m.etape ? `relance ${m.etape}` : 'premier mail', s: etiquette(lb('leviaroMail', m.etat), m.etat === 'envoye' ? 'ok' : m.etat?.startsWith('erreur') || m.etat === 'rejete' ? 'off' : m.etat === 'attente_validation' ? 'attente' : '') })), { aide: aide('leviaroMail') }),
      table('Entreprises prospectées', [{ cle: 'q', titre: 'Trouvée le' }, { cle: 'n', titre: 'Entreprise' }, { cle: 'v', titre: 'Ville' }, { cle: 's', titre: 'Où ça en est' }],
        d.entreprises.map((c) => ({ q: date(c.creee), n: e(c.nom), v: e(c.ville ?? '—'), s: etiquette(lb('leviaroEtat', c.etat), c.etat === 'discussion_active' ? 'ok' : ['exclue', 'cloturee', 'hors_perimetre'].includes(c.etat) ? 'off' : '') })), { aide: aide('leviaroEtat') }),
      fin(blocNotes),
    ].join('');
  }

  if (id === 'impacteur') {
    const im = business.sources?.impacteur;
    if (!im) return `<p class="vide">Le Sheet Impacteur n’est pas encore lu.</p>${fin(blocNotes)}`;
    const fiches = [...im.fiches].sort((a, b) => (b.envoi ?? '') > (a.envoi ?? '') ? 1 : -1);
    const tonIm = (s) => (s === 'ENVOYE' ? 'ok' : s?.startsWith('A_VERIFIER') ? 'attente' : s === 'BLOQUE_ELIGIBILITE' ? 'off' : '');

    // Une ligne par journée d'envoi, avec le compte par chaîne (Afrique / Frexit visibles ensemble).
    const parJour = grouperParJour(fiches.filter((f) => f.envoi), (f) => f.envoi).slice(0, 60);
    const blocJours = parJour.length
      ? `<section class="bloc"><h3>Invités contactés, jour par jour <small>(${parJour.length} journée(s))</small></h3>${aide('impacteur')}
${parJour
  .map(([j, liste]) => {
    const parChaine = Object.entries(Object.groupBy(liste, (f) => f.chaine ?? 'chaîne non déclarée'))
      .map(([c, l]) => `${l.length} ${e(c)}`)
      .join(' · ');
    const ex = exempleDuJour(j, liste.length);
    return `<details class="jour-mails"><summary><b>${date(j)}</b> · ${liste.length} invité(s) contacté(s) <small>(${parChaine})</small><span class="voir">Voir les ${liste.length} mails ›</span></summary>
${liste
  .map(
    (f, i) => `<details class="mail"><summary>${i === ex ? '★ ' : ''}${e(f.auteur ?? '?')} — ${e(f.livre ?? 'livre non noté')} ${etiquette(f.chaine ?? 'chaîne non déclarée', 'or')} ${etiquette(lb('impacteur', f.statut), tonIm(f.statut))}${f.ouvert ? ` <small>ouvert le ${date(f.ouvert)}</small>` : ''}${i === ex ? ' <small class="ex">exemple du jour</small>' : ''}</summary>
<div class="echange-mail"><p>→ ${date(f.envoi)} · invitation ${e(f.chaine ?? '?')} ${f.ouvert ? `· ouverte le ${date(f.ouvert)}` : '· pas d’ouverture enregistrée'}</p>
${f.corps ? `<p>Texte envoyé : ${texteCellule(f.corps)}</p>` : ''}
<p class="note-mail">${f.compte ? `Compte d’envoi enregistré par l’automatisation : ${e(f.compte)}.` : 'Compte d’envoi réellement utilisé : non enregistré par l’automatisation (la chaîne affichée vient du Sheet, c’est une déclaration, pas une preuve).'}${f.corps ? '' : ' Texte du mail non récupéré.'} <a href="${lienGmail(f.auteur)}" target="_blank" rel="noopener">Chercher dans Gmail ›</a></p></div></details>`,
  )
  .join('')}
</details>`;
  })
  .join('')}</section>`
      : '';

    const sansEnvoi = fiches.filter((f) => !f.envoi);
    return [
      blocJours,
      table('Fiches sans envoi (à vérifier, brouillons, bloquées)', [{ cle: 'a', titre: 'Auteur' }, { cle: 'l', titre: 'Livre' }, { cle: 'c', titre: 'Chaîne' }, { cle: 's', titre: 'État' }],
        sansEnvoi.map((f) => ({ a: e(f.auteur ?? '?'), l: e(f.livre ?? '—'), c: e(f.chaine ?? '—'), s: etiquette(lb('impacteur', f.statut), tonIm(f.statut)) })), { visibles: 12, vide: 'Toutes les fiches du Sheet ont été traitées.' }),
      fin(blocNotes),
    ].join('');
  }

  if (id === 'cambodge') {
    const cb = business.sources?.cambodge;
    if (!cb) return `<p class="vide">La boîte mail Cambodge n’est pas encore lue : lance le branchement (scripts/cambodge-n8n.py), puis les mails étiquetés « Cambodge » apparaîtront ici.</p>${fin(blocNotes)}`;
    const recues = cb.mails.filter((m) => !m.deMoi && !m.automatique);
    const envoyees = cb.mails.filter((m) => m.deMoi || m.automatique);
    const contact = (m) => e((m.deMoi ? m.a : m.de) || '?');
    return [
      table('Vraies réponses reçues', [{ cle: 'q', titre: 'Reçue le' }, { cle: 'n', titre: 'De' }, { cle: 'o', titre: 'Objet' }, { cle: 'x', titre: 'Leur réponse' }],
        recues.map((m) => ({ q: date(m.jour), n: contact(m), o: e(m.objet || '—'), x: texteCellule(m.extrait) })), { vide: 'Pas encore de vraie réponse (les accusés de réception automatiques ne comptent pas).' }),
      table('Candidatures envoyées', [{ cle: 'q', titre: 'Quand' }, { cle: 'o', titre: 'Candidature' }, { cle: 's', titre: 'Trace' }],
        envoyees.map((m) => ({ q: date(m.jour), o: e(m.objet || m.a || '—'), s: m.deMoi ? etiquette('mail envoyé', 'ok') : etiquette('confirmation automatique', '') })), { vide: 'Aucune candidature trouvée sous l’étiquette « Cambodge ».' }),
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

export function pageProjet(configJournal, id, { business, journal, pauses, histoires, idees, suivi, tri, verifications = [], jour = jourParis(), message, aRepondre = 0, guide = false } = {}) {
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
<p class="retour"><a href="/journal">‹ Retour au tableau de bord</a>${guide ? `<a class="guide-lien" href="/fonctionnement?projet=${e(id)}">⚙️ Comment ça marche</a>` : ''}</p>
${carte ? `<div class="bds une">${carteProjet({ ...carte, periode: tableau.periode }, 7)}</div>` : ''}
${blocIdees}
${sections(id, { business, journal, histoires, suivi, tri })}
${surveillance}
<style>
.retour { margin:0 0 10px; display:flex; justify-content:space-between; gap:10px; } .retour a { color:var(--doux); text-decoration:none; }
.retour .guide-lien { border:1px solid var(--bord); border-radius:8px; padding:3px 10px; font-size:13px; color:var(--texte); }
.bds.une { display:grid; margin-bottom:14px; }
${CSS_CARTE}
.une .pied { display:none; }
.graphe { max-width:460px; }
.bloc { background:var(--carte); border:1px solid var(--bord); border-radius:12px; padding:12px 14px; margin-bottom:14px; overflow-x:auto; }
.bloc h3 { margin:0 0 8px; font-size:15px; }
.chaines { list-style:none; margin:0; padding:0; } .chaines li { padding:3px 0; font-size:14px; } .bloc h3 small { color:var(--doux); font-weight:400; }
.bloc table { border-collapse:collapse; width:100%; font-size:13px; }
.bloc th { text-align:left; color:var(--doux); font-weight:500; padding:4px 10px 4px 0; border-bottom:1px solid var(--bord); white-space:nowrap; }
.bloc td { padding:5px 10px 5px 0; border-bottom:1px solid var(--bord); vertical-align:top; }
.bloc tr:last-child td { border-bottom:0; }
.voir-plus { margin-top:8px; font-size:13px; }
.aide { margin:0 0 8px; font-size:13px; color:var(--doux); }
.aide summary { cursor:pointer; user-select:none; }
.aide ul { margin:6px 0 4px; padding-left:18px; }
.aide li { margin:2px 0; } .aide b { color:var(--texte); font-weight:600; }
td .texte summary { cursor:pointer; }
td .texte p { white-space:pre-wrap; margin:6px 0 2px; max-width:560px; }
.parcours { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:4px 0 10px; }
.etape { display:flex; flex-direction:column; min-width:72px; }
.etape b { font-size:22px; line-height:1.1; }
.etape span { font-size:12px; color:var(--doux); }
.fleche-p { color:var(--doux); font-size:18px; }
.suivi-form { display:flex; flex-direction:column; gap:4px; min-width:170px; }
.suivi-form select, .suivi-form input { font:inherit; font-size:12px; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.suivi-form button { align-self:flex-start; padding:3px 10px; font-size:12px; }
.etiq { display:inline-block; padding:1px 8px; border-radius:10px; background:var(--fond); border:1px solid var(--bord); font-size:12px; white-space:nowrap; }
.etiq.ok { color:var(--ok); border-color:var(--ok); } .etiq.off { color:var(--doux); } .etiq.attente { color:var(--attention); border-color:var(--attention); }
.idees textarea { width:100%; font:inherit; padding:8px 10px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); box-sizing:border-box; }
.idees .nouvelle { display:flex; flex-direction:column; gap:8px; align-items:flex-start; margin-bottom:10px; }
.idees ul { list-style:none; margin:0; padding:0; }
.idees li { display:flex; gap:10px; justify-content:space-between; align-items:flex-start; padding:8px 0; border-top:1px solid var(--bord); }
.idees li p { margin:0; font-size:14px; } .idees li small { color:var(--doux); }
.idees li.faite p { text-decoration:line-through; color:var(--doux); }
.jour-mails { border-top:1px solid var(--bord); padding:8px 0; }
.jour-mails:first-of-type { border-top:0; }
.jour-mails > summary { cursor:pointer; display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:14px; }
.jour-mails > summary .voir { margin-left:auto; color:var(--or); font-size:13px; font-weight:600; }
.jour-mails > summary small { color:var(--doux); }
.mail { margin:6px 0 0 14px; }
.mail > summary { cursor:pointer; font-size:13px; }
.mail small.ex { color:var(--or); font-weight:600; }
.echange-mail { margin:6px 0 4px 16px; border-left:2px solid var(--bord); padding-left:12px; }
.echange-mail p { margin:4px 0; font-size:13px; }
.corps-mail { display:block; margin:4px 0 6px 14px; white-space:pre-wrap; color:var(--doux); }
.cause-echec { color:var(--doux); font-style:italic; }
.corps-mail details.texte p { white-space:pre-wrap; }
.note-mail { color:var(--doux); font-size:12px !important; }
.barre-tri { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:10px; }
.barre-tri label { display:flex; gap:8px; align-items:center; font-size:13px; color:var(--doux); }
.barre-tri select { font:inherit; padding:6px 8px; border-radius:8px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.idees li.ecartee p { color:var(--doux); }
.idees select { font:inherit; font-size:13px; padding:4px 6px; border-radius:6px; border:1px solid var(--bord); background:var(--fond); color:var(--texte); }
.technique summary { cursor:pointer; font-weight:600; font-size:15px; }
.technique ul { list-style:none; margin:8px 0 0; padding:0; } .technique li { padding:4px 0; font-size:14px; }
.vide { color:var(--doux); font-size:14px; }
.message { background:var(--carte); border:1px solid var(--bord); border-left:4px solid var(--ok); border-radius:8px; padding:10px 12px; }
</style>`;
  return gabarit({ onglet: 'journal', aRepondre, contenu });
}
