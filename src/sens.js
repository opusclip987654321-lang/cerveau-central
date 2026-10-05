// Traduit un incident technique en ce qu'il veut dire pour le business :
// quel projet est touché, et ce que ça change concrètement.

// À quel projet business appartient une automatisation n8n, d'après son nom.
const PROJETS_N8N = [
  [/nour|n[uū]r|restaurant|carrousel/i, 'Nūr Meet'],
  [/impacteur|frexit|afrique|invit/i, 'Impacteur'],
  [/leviaro/i, 'Leviaro'],
  [/histoire/i, 'Petites histoires vraies'],
  [/cambodge|emploi/i, 'Emploi Cambodge'],
];

// Ce que fait une automatisation, en clair, d'après son nom.
const TACHES = [
  [/veille|moments? forts?|d[ée]tection/i, 'le repérage des moments forts de l’actualité', 'il y aura moins de sujets pour les vidéos du jour'],
  [/zapping/i, 'le zapping du soir', 'le zapping de 19 h risque de ne pas sortir'],
  [/production|montage|fabrication/i, 'la fabrication des vidéos', 'des vidéos ne seront pas fabriquées'],
  [/publi/i, 'la publication', 'des contenus prêts ne seront pas publiés'],
  [/alerte/i, 'le système qui te prévient des problèmes', 'tu pourrais ne pas être prévenu d’un autre souci'],
  [/ouverture|tracking/i, 'le suivi des mails ouverts', 'tes chiffres d’ouverture seront faussés, mais les mails partent quand même'],
  [/envoi|mail|relance/i, 'l’envoi des mails de prospection', 'des prospects ne recevront pas leur mail'],
  [/d[ée]couverte|recherche|prospect/i, 'la recherche de nouveaux prospects', 'moins de nouveaux contacts à démarcher'],
  [/telegram|validation/i, 'les validations par Telegram', 'tu ne recevras peut-être pas les mails ou vidéos à valider'],
];

// Ce que la panne d'un site empêche, selon le site.
const SITES = [
  [/api\.nourmeet/i, 'Nūr Meet', 'Le site s’affiche peut-être, mais les inscriptions, réservations et paiements ne marchent plus.'],
  [/nourmeet\.com\/?$|^nourmeet\.com|site nourmeet/i, 'Nūr Meet', 'Participants et restaurants ne peuvent plus voir les soirées ni s’inscrire.'],
  [/admin\.leviaro/i, 'Leviaro', 'Tu ne peux plus gérer Leviaro, mais tes prospects ne voient rien.'],
  [/leviaro/i, 'Leviaro', 'Les prospects qui cliquent sur le lien de tes mails tombent sur une erreur : tu peux perdre des clients.'],
  [/n8n\.actualitevideo/i, 'L’extrait politique', 'Plus aucune vidéo de L’extrait politique n’est fabriquée ni publiée tant que ça dure.'],
  [/n8n\.nourmeet|n8n/i, 'Nūr Meet et Impacteur', 'Toutes leurs automatisations sont à l’arrêt : plus de mails de prospection ni de publications.'],
];

const quiPourSite = (texte) => SITES.find(([re]) => re.test(texte)) ?? [null, null, 'Le site ne répond plus.'];

function projetsDesWorkflows(noms, instance) {
  if (instance === 'actualite') return ['L’extrait politique'];
  const p = new Set(noms.map((n) => PROJETS_N8N.find(([re]) => re.test(n))?.[1] ?? 'automatisations diverses'));
  return [...p];
}

const liste = (t) => (t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} et ${t.at(-1)}`);

// projet : { id, nom } de la surveillance ; verif : la vérification ; resultat : { etat, detail, erreurs? }.
// Renvoie { pour, texte } : le projet business touché et l'explication en clair.
export function expliquer(projet, verif, resultat, type = resultat.etat) {
  const nomVerif = `${verif.nom ?? ''} ${verif.url ?? ''} ${verif.hote ?? ''}`;
  const detail = String(resultat.detail ?? '');

  if (type === 'retabli' || resultat.etat === 'ok') {
    const [, pour] = verif.type === 'site' || verif.type === 'certificat' ? quiPourSite(nomVerif) : [];
    return { pour: pour ?? projet.nom, texte: 'Revenu à la normale, rien à faire.' };
  }

  switch (verif.type) {
    case 'site': {
      const [, pour, consequence] = quiPourSite(nomVerif);
      if (resultat.etat === 'attention')
        return { pour: pour ?? projet.nom, texte: /n8n/i.test(nomVerif) ? 'Les automatisations répondent lentement. Souvent passager ; si ça dure, elles prennent du retard.' : `Le site met ${detail.match(/[\d.,]+ s/)?.[0] ?? 'longtemps'} à s’ouvrir : des visiteurs risquent de partir avant de voir la page.` };
      return { pour: pour ?? projet.nom, texte: `${consequence} Si ça dure plus d’une heure, il faut regarder le serveur.` };
    }
    case 'certificat': {
      const [, pour] = quiPourSite(nomVerif);
      const hote = verif.hote ?? 'le site';
      if (/illisible|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRE/i.test(detail))
        return { pour: pour ?? projet.nom, texte: `Le cerveau n’a pas pu vérifier le cadenas de sécurité de ${hote}, le plus souvent à cause d’un souci réseau passager. Si ça dure, les visiteurs pourraient voir « site non sécurisé » et partir.` };
      const jours = detail.match(/(\d+) jour/)?.[1];
      return {
        pour: pour ?? projet.nom,
        texte: `Le cadenas de sécurité de ${hote} ${/expiré/.test(detail) ? 'a expiré' : `expire dans ${jours ?? 'peu de'} jours`} : ensuite, les navigateurs afficheront « site dangereux » et les visiteurs fuiront. Il se renouvelle normalement tout seul ; s’il ne l’a pas fait, il faut intervenir.`,
      };
    }
    case 'n8n': {
      if (!resultat.erreurs?.length)
        return { pour: verif.instance === 'actualite' ? 'L’extrait politique' : 'Nūr Meet et Impacteur', texte: 'Le cerveau n’arrive plus à lire tes automatisations : impossible de savoir si elles tournent. À vérifier si ça dure.' };
      const noms = [...new Set(resultat.erreurs.map((e) => e.workflow))];
      const taches = [...new Map(noms.map((n) => { const t = TACHES.find(([re]) => re.test(n)); return [t ? t[1] : `« ${n} »`, t?.[2]]; })).entries()];
      const n = resultat.erreurs.length;
      const consequences = [...new Set(taches.map(([, c]) => c).filter(Boolean))];
      return {
        pour: liste(projetsDesWorkflows(noms, verif.instance)),
        texte: `${liste(taches.map(([t]) => t)).replace(/^./, (c) => c.toUpperCase())} ${n > 1 ? `a planté ${n} fois` : 'a planté une fois'}. Une erreur isolée n’est pas grave ; si ça se répète, ${consequences.length ? consequences.join(', et ') : 'ce travail ne sera pas fait'}.`,
      };
    }
    case 'disque':
    case 'releve':
      if (/aucun relevé/.test(detail))
        return { pour: projet.nom, texte: `Le serveur ne donne plus de nouvelles (${detail}) : il est peut-être éteint, et les projets qui tournent dessus avec lui.` };
      return { pour: projet.nom, texte: `Le disque du serveur se remplit (${detail}). S’il est plein, tous les sites et automatisations qui tournent dessus s’arrêtent.` };
    case 'memoire':
      return { pour: projet.nom, texte: 'Le serveur manque de mémoire : tes sites et automatisations peuvent ralentir ou planter.' };
    case 'charge':
      return { pour: projet.nom, texte: 'Le serveur est très sollicité : sites et automatisations tournent au ralenti.' };
    case 'histoires':
      return { pour: projet.nom, texte: detail };
    default:
      return { pour: projet.nom, texte: detail };
  }
}

// Pour les incidents enregistrés avant cette traduction : on devine le type de vérification.
export function expliquerAncien(h) {
  const v = h.verification ?? '';
  const type = /^certificat/i.test(v) ? 'certificat' : /exécutions en erreur/i.test(v) ? 'n8n' : /disque/i.test(v) ? 'disque' : /mémoire/i.test(v) ? 'memoire' : /charge/i.test(v) ? 'charge' : /relevé/i.test(v) ? 'releve' : 'site';
  const instance = /actualitevideo/i.test(v) ? 'actualite' : undefined;
  const erreurs = type === 'n8n' ? (String(h.detail).split(' : ')[1] ?? '').split(', ').filter(Boolean).map((workflow) => ({ workflow })) : undefined;
  // Le nombre d'exécutions est dans le détail (« 2 exécution(s) en erreur : … »).
  const n = Number(String(h.detail).match(/^(\d+) exécution/)?.[1]);
  if (erreurs?.length && n > erreurs.length) while (erreurs.length < n) erreurs.push(erreurs[0]);
  const hote = v.replace(/^certificat\s+/i, '');
  return expliquer({ nom: h.projet }, { type, nom: v, instance, hote: type === 'certificat' ? hote : undefined }, { etat: h.type === 'retabli' ? 'ok' : h.type === 'evenement' ? 'attention' : h.type, detail: h.detail, erreurs }, h.type);
}
