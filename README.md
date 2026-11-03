# QCM Restructuring – site d'entraînement

Site 100 % statique (HTML + CSS + JS, aucune base de données). Les questions sont dans `data/moduleN.json`.

## Ajouter / corriger une question
1. Ouvre `data/moduleN.json` et copie une question existante. Format :
   ```json
   {"id":"m1-081","module":1,"type":"single","question":"…","choices":["A","B","C","D"],
    "answer":[2],"explanation":"…","reference":"Module 1 – slide 15","difficulty":2}
   ```
   - `answer` = positions (à partir de 0) des bonnes propositions, dans l'ordre croissant.
   - `type` = `"single"` (1 bonne réponse) ou `"multiple"` (2 à 4 bonnes réponses).
2. Lance `python validate.py` : il détecte les erreurs (doublons, indices faux…).
3. Mets en ligne : `git add -A && git commit -m "questions" && git push`.

## Ajouter le module 5 (ou un autre)
Crée `data/module5.json`, puis dans `js/app.js` décommente la ligne `{ n: 5, … }` de `MODULES` (et donne-lui son titre).

## Tester en local
`python -m http.server 8765` puis ouvre http://127.0.0.1:8765
