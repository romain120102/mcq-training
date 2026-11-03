"""Validation de la banque de questions : python validate.py
Vérifie le schéma, les doublons, la validité des bonnes réponses, etc. Sort avec un code 1 s'il y a des erreurs."""
import sys; sys.stdout.reconfigure(encoding="utf-8")
import json, glob, re, sys, os, collections

os.chdir(os.path.dirname(os.path.abspath(__file__)))
errors, warnings, ids, texts = [], [], set(), {}
stats = collections.OrderedDict()

def norm(s): return re.sub(r"\W+", " ", s.lower()).strip()

for path in sorted(glob.glob("data/module*.json")):
    m = int(re.search(r"module(\d+)", path).group(1))
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        errors.append(f"{path}: JSON invalide ({e})"); continue
    if not isinstance(data, list): errors.append(f"{path}: doit être un tableau"); continue
    st = stats[m] = {"single": 0, "multiple": 0, "pos": collections.Counter()}
    for i, q in enumerate(data):
        w = f"{path}[{i}] {q.get('id', '?')}"
        for k in ("id", "module", "type", "question", "choices", "answer", "explanation", "reference", "difficulty"):
            if k not in q: errors.append(f"{w}: champ manquant '{k}'")
        if any(k not in q for k in ("id", "module", "type", "question", "choices", "answer")): continue
        if q["id"] in ids: errors.append(f"{w}: id en double")
        ids.add(q["id"])
        if not re.fullmatch(rf"m{m}-\d{{3}}", q["id"]): warnings.append(f"{w}: id inhabituel (attendu m{m}-NNN)")
        if q["module"] != m: errors.append(f"{w}: module={q['module']} mais fichier module{m}")
        if q["type"] not in ("single", "multiple"): errors.append(f"{w}: type invalide"); continue
        ch, an = q["choices"], q["answer"]
        if not isinstance(ch, list) or not 4 <= len(ch) <= 6: errors.append(f"{w}: il faut 4 à 6 propositions ({len(ch) if isinstance(ch, list) else '?'})")
        if len(set(map(norm, ch))) != len(ch): errors.append(f"{w}: propositions en double")
        if not all(isinstance(c, str) and c.strip() for c in ch): errors.append(f"{w}: proposition vide")
        if not isinstance(an, list) or not an: errors.append(f"{w}: aucune bonne réponse"); continue
        if any((not isinstance(a, int)) or a < 0 or a >= len(ch) for a in an): errors.append(f"{w}: indice de réponse hors limites"); continue
        if len(set(an)) != len(an) or an != sorted(an): errors.append(f"{w}: answer doit être trié et sans doublon")
        if q["type"] == "single" and len(an) != 1: errors.append(f"{w}: single => exactement 1 bonne réponse")
        if q["type"] == "multiple" and not 2 <= len(an) <= 4: errors.append(f"{w}: multiple => 2 à 4 bonnes réponses ({len(an)})")
        if q["type"] == "multiple" and len(an) == len(ch): errors.append(f"{w}: toutes les propositions sont bonnes")
        if q["difficulty"] not in (1, 2, 3): errors.append(f"{w}: difficulty doit valoir 1, 2 ou 3")
        if not str(q.get("explanation", "")).strip(): errors.append(f"{w}: explication vide")
        if not str(q.get("reference", "")).strip(): errors.append(f"{w}: référence vide")
        if re.search(r"all of the above|none of the above", " ".join(ch), re.I): warnings.append(f"{w}: 'all/none of the above'")
        n = norm(q["question"])
        if n in texts: errors.append(f"{w}: énoncé identique à {texts[n]}")
        texts[n] = q["id"]
        st[q["type"]] += 1
        if q["type"] == "single": st["pos"][an[0]] += 1

print("=== Résumé ===")
tot = 0
for m, s in stats.items():
    t = s["single"] + s["multiple"]; tot += t
    print(f"Module {m}: {t} questions ({s['single']} single / {s['multiple']} multiple) – position de la bonne réponse (single): {dict(sorted(s['pos'].items()))}")
print(f"TOTAL: {tot}")
for w in warnings: print("AVERTISSEMENT:", w)
for e in errors: print("ERREUR:", e)
print("OK ✔ aucune erreur" if not errors else f"{len(errors)} erreur(s)")
sys.exit(1 if errors else 0)
