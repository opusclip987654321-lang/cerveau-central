# Cerveau central

Surveille les projets de louis, le prévient sur Telegram quand quelque chose casse ou se répare, et affiche une page d'état.

C'est l'**étape 2** du cahier des charges : « Est-ce que tout tourne ? ». Le cerveau **ne corrige rien** : il observe et prévient.

## Ce qu'il fait

- Vérifie toutes les 3 heures que tout tourne, et prévient sur Telegram.
- Envoie chaque matin un résumé sur Telegram : état des projets, incidents des dernières 24 h, questions du jour.
- Pose 3 questions par jour et par projet sur la page.

## Ce qu'il vérifie

| Projet | Vérifications |
|---|---|
| Nūr Meet | le site répond, l'API et sa base de données répondent (`/health/ready`), certificats HTTPS |
| Leviaro | le site et l'admin répondent, certificats HTTPS |
| n8n | n8n répond (`/healthz`), certificat, et (avec une clé API en lecture) les exécutions tombées en erreur, avec le nom de l'automatisation |
| Serveur OVH | espace disque, mémoire, charge du processeur |

La liste se modifie dans [`config/surveillance.json`](config/surveillance.json), sans toucher au code.

Règles des alertes :

- 🔴 **panne** : le site ne répond pas, répond une erreur, certificat expiré ou à moins de 3 jours, disque plein à 95 %.
- 🟠 **à surveiller** : site lent (plus de 4 s), certificat à moins de 14 jours, disque à 85 %, mémoire à 90 %, nouvelles erreurs n8n.
- 🟢 **rétabli** : avec la durée de la panne.
- Un site qui rate une fois est revérifié 30 secondes plus tard avant d'alerter (pas de fausse alerte pour un raté passager).
- Une seule alerte par panne : pas de répétition tant qu'elle dure.

## Questions du jour

Chaque jour, l'onglet « Questions du jour » pose 3 questions par projet (les 7 projets) : une note sur 5 chaque jour, pour suivre la tendance, et deux questions qui changent. Une question déjà posée revient au plus tôt 7 jours plus tard. On répond à ce qu'on veut, le reste peut rester vide.

Le résumé Telegram du matin (9 h par défaut, `RESUME_HEURE`) rappelle combien de questions attendent. Les réponses sont gardées dans `data/reponses.json` ; l'analyse quotidienne par l'IA (étape suivante) s'en servira pour repérer les axes de progrès de chaque projet.

Les questions se modifient dans [`config/questions.json`](config/questions.json) (types : `note`, `nombre`, `choix`, `texte`).

## Argent

L'onglet **Argent** liste les abonnements et recharges (pré-remplis avec le récap du 05/10/2026, dans `config/argent.json`, puis modifiables depuis la page) : total du mois, coût fixe, répartition par projet, rappel Telegram 3 jours avant un renouvellement quand sa date est connue.

On peut y **déposer ses factures** (PDF ou photo). Si `ANTHROPIC_API_KEY` est dans `.env`, le cerveau les lit avec Claude Sonnet 5.5 (environ 1 centime par facture), les rapproche de la liste et montre ce qui est à jour, ce qui manque et les montants différents. La dépense IA est plafonnée par mois (`PLAFOND_IA_DOLLARS`, 10 $ par défaut). Les factures restent sur le serveur, dans le volume `data/factures`.

## Installer sur le VPS

Prérequis : Docker (déjà présent sur le serveur).

```bash
git clone https://github.com/opusclip987654321-lang/cerveau-central.git /opt/cerveau-central
cd /opt/cerveau-central
cp .env.example .env
nano .env          # remplir le bot Telegram (voir plus bas), puis enregistrer
chmod 600 .env     # lisible seulement par root
docker compose up -d --build
docker compose logs -f   # doit afficher « vérification terminée »
```

Les clés restent dans `.env` sur le serveur. Ce fichier n'est **jamais** envoyé sur GitHub (il est dans `.gitignore`).

Mettre à jour plus tard :

```bash
cd /opt/cerveau-central && git pull && docker compose up -d --build
```

## Ouvrir la page depuis ton Mac

La page s'ouvre sur **https://cerveau.nourmeet.com**, protégée par un mot de passe. Après 5 mauvais essais, l'adresse est bloquée 15 minutes. Une fois connecté, le navigateur s'en souvient 30 jours.

1. **Choisir le mot de passe** (12 caractères ou plus), sur le serveur :
   ```bash
   docker compose run --rm cerveau node src/mot-de-passe.js
   ```
   Coller la ligne `MOT_DE_PASSE_EMPREINTE=…` qu'il affiche dans `.env`. Le mot de passe lui-même n'est enregistré nulle part.
2. **Nom de domaine** : chez OVH, ajouter un enregistrement `A` pour `cerveau.nourmeet.com` vers l'adresse IP du serveur (la même que `n8n.nourmeet.com`).
3. **Réseau de Caddy** : `docker network ls`, repérer le réseau du projet nour-meet (souvent `nour-meet_default`) et le mettre dans `RESEAU_CADDY` dans `.env`.
4. **Caddy** : ajouter ce bloc au `Caddyfile` (dépôt nour-meet, `infra/Caddyfile`), puis recharger Caddy :
   ```
   cerveau.nourmeet.com {
   	reverse_proxy cerveau-central:8090
   }
   ```
5. `docker compose up -d --build`

Sans `MOT_DE_PASSE_EMPREINTE`, la page n'a pas de mot de passe : ne pas ajouter le bloc Caddy dans ce cas, et l'ouvrir seulement par tunnel SSH :

```bash
ssh -L 8090:127.0.0.1:8090 utilisateur@ip-du-vps
```

puis <http://localhost:8090>.

## Brancher Telegram

Les alertes passent par le bot du récap hebdo.

1. `TELEGRAM_BOT_TOKEN` : le jeton du bot, donné par @BotFather (`/mybots` → le bot → *API Token*).
2. `TELEGRAM_CHAT_ID` : envoyer un message au bot, puis ouvrir `https://api.telegram.org/bot<JETON>/getUpdates` ; le chiffre après `"chat":{"id":` est l'identifiant.

Sans ces deux valeurs, le cerveau tourne quand même et écrit les alertes dans ses journaux.

## Brancher n8n (facultatif)

Dans n8n : *Settings → n8n API → Create an API key*, puis la mettre dans `N8N_API_KEY`. Le cerveau ne fait que **lire** la liste des automatisations et des exécutions en erreur.

## Si le serveur lui-même tombe

Le cerveau tourne sur le serveur qu'il surveille : si le serveur tombe, il ne peut plus prévenir. Pour ça, ajouter un veilleur externe gratuit (par exemple UptimeRobot) qui vérifie `https://nourmeet.com` et `https://leviaro.fr` toutes les 5 minutes et prévient par mail ou Telegram.

## Tester sur sa machine

```bash
npm test               # les tests (Node 22, aucune dépendance)
npm run verifier       # une vérification complète, résultat dans le terminal
npm start              # la page d'état sur http://127.0.0.1:8090
```
