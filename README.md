# Kanban Appels

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
3. **Persistance** — l'état complet est enregistré dans `localStorage` à chaque
   changement et rechargé au démarrage.
4. **Réinitialiser** vide le tableau (avec confirmation).

Un fichier `exemple-contacts.csv` est fourni pour tester.
