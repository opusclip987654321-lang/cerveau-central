# Cerveau central

Surveille les projets de louis, le prévient sur Telegram quand quelque chose casse ou se répare, et affiche une page d'état.

C'est l'**étape 2** du cahier des charges : « Est-ce que tout tourne ? ». Le cerveau **ne corrige rien** : il observe et prévient.

## Ce qu'il vérifie, toutes les 3 heures

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

Chaque jour, l'onglet « Questions du jour » pose 2 questions par projet (les 7 projets) : une note sur 5 chaque jour, pour suivre la tendance, et une question qui change. Une question déjà posée revient au plus tôt 14 jours plus tard. On répond à ce qu'on veut, le reste peut rester vide.

Un rappel Telegram part le matin (9 h par défaut, `QUESTIONS_HEURE`) s'il reste des questions. Les réponses sont gardées dans `data/reponses.json` ; l'analyse quotidienne par l'IA (étape suivante) s'en servira pour repérer les axes de progrès de chaque projet.

Les questions se modifient dans [`config/questions.json`](config/questions.json) (types : `note`, `nombre`, `choix`, `texte`).

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

## Ouvrir la page d'état depuis ton ordinateur

La page n'est pas sur Internet : elle n'écoute que sur le serveur lui-même. On l'ouvre par un tunnel SSH :

```bash
ssh -L 8090:127.0.0.1:8090 utilisateur@ip-du-vps
```

Laisser cette fenêtre ouverte, puis ouvrir <http://localhost:8090> dans le navigateur.

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
