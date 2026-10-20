import { createHash, timingSafeEqual } from 'node:crypto';

// La clé des loops sur l'abonnement Claude (20/10) : les tâches programmées Claude trient,
// revoient et écrivent par l'API du cerveau sans le jeton des relevés. Tirée du jeton
// (même calcul que scripts/cle-loops.sh), elle n'ouvre que les routes ci-dessous.
export const cleLoops = (jeton) => createHash('sha256').update(`loops-abonnement:${jeton}`).digest('hex').slice(0, 40);

export const routeDeLaCle = (methode, chemin) =>
  chemin.startsWith('/api/loop/') || (methode === 'GET' && ['/api/code', '/api/decisions', '/api/sorties'].includes(chemin));

const empreinte = (t) => createHash('sha256').update(String(t)).digest();
export const cleLoopsValide = (entete, jeton) =>
  Boolean(jeton) && jeton.length >= 20 && timingSafeEqual(empreinte(entete ?? ''), empreinte(`Bearer ${cleLoops(jeton)}`));
