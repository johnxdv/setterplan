# Espace de grind de Victor

Tableau kanban de prospection téléphonique : import CSV, 4 colonnes, glisser-déposer, sauvegarde locale.

## Démarrer

```
npm install
npm run dev
```

## Utilisation

1. **Importer un CSV** — chaque ligne devient une carte dans « À appeler ».
   Les colonnes sont libres : le nom, le téléphone, l'entreprise et l'email sont
   détectés automatiquement (`Nom`/`Contact`, `Téléphone`/`Mobile`/`Tel`,
   `Entreprise`/`Société`, `Email`…). Toute autre colonne est affichée sur la carte
   sous forme `Libellé : valeur`. Séparateur `,` `;` ou tabulation détecté automatiquement.
2. **Déplacer une carte** par glisser-déposer (drag & drop HTML5 natif) vers
   « Rendez-vous booké » (vert), « À relancer » (jaune) ou « Mort » (rouge).
   Les petites pastilles sous chaque carte font la même chose en un clic.
3. **Synchronisation** — l'état complet du tableau est enregistré dans Firestore
   (projet `setterplan`, document `board/current`) à chaque import et à chaque
   déplacement de carte, et lu en temps réel via `onSnapshot` : un changement fait
   sur un appareil apparaît sur les autres sans rechargement. Une pastille en haut
   à droite indique l'état de la connexion (« En ligne », « Hors ligne », « Accès
   refusé »). Hors ligne, le cache persistant du SDK garde le tableau consultable
   et rejoue les écritures au retour du réseau.
4. **Réinitialiser** vide le tableau (avec confirmation).

Un fichier `exemple-contacts.csv` est fourni pour tester.

## Règles Firestore

La synchronisation exige que le document `board/current` soit accessible. Les
règles nécessaires sont dans `firestore.rules` ; tant qu'elles ne sont pas
déployées, l'application affiche « Accès refusé » et les modifications restent
locales à l'onglet.
