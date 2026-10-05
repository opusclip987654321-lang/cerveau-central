// Le parcours de chaque projet en étapes compréhensibles, pour montrer où ça
// bloque. L'étape en erreur n'est mise en évidence que si on la reconnaît
// vraiment dans l'incident : sinon le schéma s'affiche sans supposer.
const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Étapes par projet business ; `re` sert à reconnaître l'étape dans le texte d'un incident.
export const PARCOURS = {
  'nour-meet': [
    { nom: 'Trouver des restaurants', re: /recherche de nouveaux|d[ée]couverte|recherche restaurant/i },
    { nom: 'Trouver leur email', re: /email introuvable|sans email|contact introuvable/i },
    { nom: 'Écrire et envoyer le mail', re: /envoi|r[ée]daction|carrousel|mail/i },
    { nom: 'Relancer', re: /relance/i },
    { nom: 'Réponse reçue', re: /r[ée]ponse|lecture/i },
    { nom: 'Tu conclus', re: /jamais/i },
  ],
  leviaro: [
    { nom: 'Découvrir des entreprises', re: /d[ée]couverte|recherche/i },
    { nom: 'Les étudier', re: /[ée]tude|analys/i },
    { nom: 'Mail validé par toi', re: /valid/i },
    { nom: 'Envoyer et relancer', re: /envoi|relance|mail/i },
    { nom: 'Réponse reçue', re: /r[ée]ponse/i },
    { nom: 'Tu conclus', re: /jamais/i },
  ],
  impacteur: [
    { nom: 'Trouver des invités', re: /recherche|d[ée]couverte|invit[ée]s? trouv/i },
    { nom: 'Vérifier la fiche', re: /v[ée]rif|d[ée]c[èe]s/i },
    { nom: 'Préparer le mail', re: /brouillon|r[ée]daction/i },
    { nom: 'Envoyer', re: /envoi|mail/i },
    { nom: 'Réponse reçue', re: /r[ée]ponse|ouverture/i },
  ],
  'histoires-vraies': [
    { nom: 'Trouver une histoire', re: /veille|histoire|sujet/i },
    { nom: 'Fabriquer la vidéo', re: /fabrication|production|montage/i },
    { nom: 'Publier', re: /publi/i },
  ],
  'extrait-politique': [
    { nom: 'Repérer les moments forts', re: /veille|moments? forts?|d[ée]tection/i },
    { nom: 'Monter les vidéos', re: /production|montage|zapping|fabrication/i },
    { nom: 'Publier', re: /publi/i },
  ],
  cambodge: [
    { nom: 'Candidature envoyée', re: /candidature|envoi/i },
    { nom: 'Accusé de réception', re: /accus[ée]/i },
    { nom: 'Vraie réponse', re: /r[ée]ponse|lecture/i },
  ],
};

// Quels projets business un incident de surveillance touche.
export const PROJETS_TOUCHES = {
  'nour-meet': ['nour-meet'],
  leviaro: ['leviaro'],
  n8n: ['nour-meet', 'impacteur'],
  serveur: ['nour-meet', 'leviaro', 'impacteur', 'histoires-vraies'],
  'histoires-vraies': ['histoires-vraies'],
  'vps-youtube': ['extrait-politique'],
};

// L'étape reconnue dans le texte de l'incident, ou null si on ne sait pas.
export function etapeBloquee(projetBusiness, texte) {
  const etapes = PARCOURS[projetBusiness] ?? [];
  const i = etapes.findIndex((et) => et.re.test(String(texte)));
  return i === -1 ? null : i;
}

// Le schéma HTML du parcours, avec l'étape bloquée marquée quand on la connaît.
export function schemaParcours(projetBusiness, { nom, etape = null } = {}) {
  const etapes = PARCOURS[projetBusiness];
  if (!etapes) return '';
  const pas = etapes
    .map((et, i) => `<span class="etape-p${i === etape ? ' bloquee' : ''}">${e(et.nom)}</span>`)
    .join('<span class="fleche-pp">›</span>');
  return `<div class="parcours-p">${nom ? `<b>${e(nom)}</b>` : ''}<div class="chaine">${pas}</div>${etape === null ? '<small>Étape exacte à confirmer : le détail est sur la fiche du problème.</small>' : ''}</div>`;
}

export const CSS_PARCOURS = `.parcours-p { margin:10px 0 0; }
.parcours-p b { font-size:13px; }
.parcours-p .chaine { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:6px; }
.etape-p { font-size:12px; padding:4px 10px; border-radius:999px; border:1px solid var(--bord); background:var(--carte2); color:var(--doux); }
.etape-p.bloquee { border-color:var(--panne); color:var(--panne); font-weight:650; background:color-mix(in srgb, var(--panne) 12%, transparent); }
.fleche-pp { color:var(--doux); }
.parcours-p small { display:block; margin-top:4px; color:var(--doux); font-size:12px; }`;
