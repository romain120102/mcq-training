/* =====================================================================
   QCM Restructuring – entraînement
   Site 100 % statique : aucune base de données, tout est dans le navigateur.
   Pour AJOUTER UN MODULE : créer data/moduleN.json puis l'ajouter à MODULES ci-dessous.
   ===================================================================== */
"use strict";

const MODULES = [
  { n: 1, title: "Introduction to Restructuring & Turnaround" },
  { n: 2, title: "Operational Turnaround" },
  { n: 3, title: "Operational Turnaround – Dairy Princess" },
  { n: 4, title: "Financial Restructuring" },
  // { n: 5, title: "…" },   <- à décommenter quand data/module5.json existe
];
const MIN_Q = 20;           // minimum de questions par session (sauf si la banque est plus petite)
const DEFAULT_Q = 60;
const K = { settings: "mcq.settings", session: "mcq.session", history: "mcq.history", stats: "mcq.stats" };

/* ---------- Petits utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein/privé : on ignore */ } };
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const letter = (i) => String.fromCharCode(65 + i);
const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(r).padStart(2, "0"); };
const num = (x) => (Math.round(x * 100) / 100).toString().replace(".", ",");

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
function ask(msg, okLabel = "OK") {
  return new Promise((res) => {
    const d = $("#dlg"); $("#dlg-msg").textContent = msg; $("#dlg-yes").textContent = okLabel;
    d.onclose = () => res(d.returnValue === "ok"); d.showModal();
  });
}

/* ---------- Banque de questions ---------- */
let BANK = new Map();          // id -> question
let BY_MOD = {};               // n -> [questions]
let LOAD_ERRORS = [];

async function loadBank() {
  await Promise.all(MODULES.map(async (m) => {
    BY_MOD[m.n] = [];
    try {
      const r = await fetch(`data/module${m.n}.json`, { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      const arr = await r.json();
      for (const q of arr) { BANK.set(q.id, q); BY_MOD[m.n].push(q); }
    } catch (e) { LOAD_ERRORS.push(m.n); }
  }));
}

/* ---------- Réglages & état ---------- */
const defaults = { mods: MODULES.map((m) => m.n), n: DEFAULT_Q, type: "mixed", mode: "train", scoring: "strict", timed: true, perQ: 1 };
let settings = Object.assign({}, defaults, load(K.settings, {}));
let S = null;                  // session en cours
let view = "home";
let tick = null;

/* ---------- Notation ---------- */
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
/** Points (0..1) d'une question. strict = tout ou rien ; partial = (bonnes cochées − mauvaises cochées)/nb bonnes, plancher à 0. */
function points(q, sel, scoring) {
  sel = sel || [];
  if (!sel.length) return 0;
  if (sameSet(sel, q.answer)) return 1;
  if (scoring !== "partial" || q.type === "single") return 0;
  const good = sel.filter((i) => q.answer.includes(i)).length, bad = sel.length - good;
  return Math.max(0, (good - bad) / q.answer.length);
}

/* ---------- Session ---------- */
function persist() { if (S) save(K.session, S); }

function startSession(ids, opts) {
  const items = ids.map((id) => ({ id, order: shuffle(BANK.get(id).choices.map((_, i) => i)) }));
  S = {
    mode: opts.mode, scoring: opts.scoring, items, answers: {}, flags: {}, checked: {}, cur: 0,
    timed: opts.mode === "exam" && opts.timed, total: Math.round(items.length * opts.perQ * 60), remaining: Math.round(items.length * opts.perQ * 60),
    startedAt: Date.now(), finished: false, redo: !!opts.redo,
  };
  persist(); go("quiz");
}

function buildFromSettings() {
  const pool = poolFor(settings.mods, settings.type);
  const n = Math.min(Math.max(settings.n, Math.min(MIN_Q, pool.length)), pool.length);
  return shuffle(pool).slice(0, n).map((q) => q.id);
}
function poolFor(mods, type) {
  return mods.flatMap((m) => BY_MOD[m] || []).filter((q) => type === "mixed" || q.type === type);
}

function go(v) { view = v; clearInterval(tick); render(); window.scrollTo(0, 0); }

/* =====================================================================
   RENDU
   ===================================================================== */
function render() {
  const info = $("#topinfo"); info.innerHTML = "";
  if (view === "home") renderHome();
  else if (view === "quiz") renderQuiz();
  else if (view === "results") renderResults();
}

/* ---------- Accueil ---------- */
function renderHome() {
  const app = $("#app");
  const stats = load(K.stats, {}), hist = load(K.history, []);
  const resume = load(K.session, null);
  const valid = resume && !resume.finished && resume.items && resume.items.length;
  app.innerHTML = `
    <div class="hero"><h1>Entraînement QCM</h1><p>Choisis tes modules, le nombre de questions et le mode. Les questions viennent uniquement de tes cours.</p></div>
    ${LOAD_ERRORS.length ? `<div class="card" style="border-color:var(--ko)"><b>Module(s) introuvable(s) : ${LOAD_ERRORS.join(", ")}.</b> Vérifie les fichiers data/moduleN.json.</div>` : ""}
    ${valid ? `<div class="card resume"><h2>Session en cours</h2>
      <p class="small">${resume.mode === "exam" ? "Examen blanc" : "Entraînement"} – question ${resume.cur + 1}/${resume.items.length}, ${Object.keys(resume.answers).length} réponse(s) donnée(s).</p>
      <div class="row"><button class="btn primary" id="resume">Reprendre</button><button class="btn ghost danger" id="abandon">Abandonner</button></div></div>` : ""}

    <section class="card"><h2><span class="step">1</span> Modules</h2>
      <div class="row" style="margin-bottom:.7rem"><button class="btn small" id="allm">Tous les modules</button><button class="btn small" id="nonem">Aucun</button></div>
      <div id="modlist">${MODULES.map((m) => `<label class="opt"><input type="checkbox" name="mod" value="${m.n}" ${settings.mods.includes(m.n) ? "checked" : ""}>
        <span class="t"><b>Module ${m.n}</b>${esc(m.title)}</span><span class="n">${(BY_MOD[m.n] || []).length} q.</span></label>`).join("")}</div>
    </section>

    <section class="card"><h2><span class="step">2</span> Questions</h2>
      <div class="seg" id="typeseg">
        ${[["mixed", "Mixte"], ["single", "Choix unique"], ["multiple", "Choix multiples"]].map(([v, l]) => `<label><input type="radio" name="type" value="${v}" ${settings.type === v ? "checked" : ""}>${l}</label>`).join("")}
      </div>
      <div class="row" style="margin-top:.9rem"><label for="nq"><b>Nombre de questions</b></label><input type="number" id="nq" inputmode="numeric"><span class="muted small" id="avail"></span></div>
      <input type="range" id="nqr" aria-label="Nombre de questions">
    </section>

    <section class="card"><h2><span class="step">3</span> Mode</h2>
      <div class="seg" id="modeseg">
        ${[["train", "Entraînement"], ["exam", "Examen blanc"]].map(([v, l]) => `<label><input type="radio" name="mode" value="${v}" ${settings.mode === v ? "checked" : ""}>${l}</label>`).join("")}
      </div>
      <p class="hint" id="modehint"></p>
      <div id="examopts" style="margin-top:.8rem">
        <label class="opt"><input type="checkbox" id="timed" ${settings.timed ? "checked" : ""}><span class="t"><b>Chronomètre</b>Temps total = nombre de questions × durée par question</span></label>
        <div class="row" id="perqrow"><label for="perq">Minutes par question</label><input type="number" id="perq" min="0.25" max="10" step="0.25" value="${settings.perQ}"><span class="muted small" id="tottime"></span></div>
      </div>
    </section>

    <section class="card"><h2><span class="step">4</span> Notation des choix multiples</h2>
      <div class="seg" id="scoreseg">
        ${[["strict", "Tout ou rien"], ["partial", "Partielle"]].map(([v, l]) => `<label><input type="radio" name="scoring" value="${v}" ${settings.scoring === v ? "checked" : ""}>${l}</label>`).join("")}
      </div>
      <p class="hint" id="scorehint"></p>
    </section>

    <section class="card"><h2>Mes stats</h2>
      ${MODULES.map((m) => { const s = stats[m.n] || { ok: 0, total: 0 }; const p = s.total ? Math.round(100 * s.ok / s.total) : 0;
        return `<div class="stat"><div class="row between small"><span>Module ${m.n}</span><span class="muted">${s.total ? `${p} % · ${num(s.ok)}/${s.total}` : "pas encore de données"}</span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }).join("")}
      ${hist.length ? `<h3 style="margin-top:1rem">Historique</h3><table class="hist"><tr><th>Date</th><th>Mode</th><th>Questions</th><th>Note</th></tr>
        ${hist.slice(0, 15).map((h) => `<tr><td>${new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${new Date(h.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td><td>${h.mode === "exam" ? "Examen" : "Entraîn."}${h.redo ? " (erreurs)" : ""}</td><td>${h.n}</td><td><b>${num(h.note)}/20</b> · ${Math.round(h.pct)} %</td></tr>`).join("")}</table>` : `<p class="muted small">Ton historique apparaîtra ici.</p>`}
      <div style="margin-top:1rem"><button class="btn small danger" id="reset">Tout réinitialiser</button></div>
    </section>

    <div class="startbar"><div class="inner"><button class="btn primary" id="start">Commencer</button></div></div>`;

  /* --- interactions de l'accueil --- */
  const save_ = () => save(K.settings, settings);
  const syncCount = () => {
    const pool = poolFor(settings.mods, settings.type), max = pool.length, min = Math.min(MIN_Q, max);
    settings.n = Math.min(Math.max(settings.n || DEFAULT_Q, min), max) || 0;
    const nq = $("#nq"), r = $("#nqr");
    nq.min = r.min = min; nq.max = r.max = max; nq.value = r.value = settings.n; nq.disabled = r.disabled = max === 0;
    $("#avail").textContent = `/ ${max} disponibles` + (max && max < MIN_Q ? " (moins de 20 : tout est pris)" : "");
    $("#start").disabled = max === 0;
    $("#tottime").textContent = `→ ${fmtTime(settings.n * settings.perQ * 60)} au total`;
    save_();
  };
  const syncHints = () => {
    $("#examopts").hidden = settings.mode !== "exam";
    $("#perqrow").hidden = !settings.timed;
    $("#modehint").textContent = settings.mode === "train" ? "Tu valides chaque question et vois tout de suite la correction avec l'explication." : "Aucune correction pendant le test. Navigation libre, marque « à revoir », correction détaillée à la fin.";
    $("#scorehint").textContent = settings.scoring === "strict" ? "Une question à choix multiples est juste uniquement si tu coches exactement toutes les bonnes réponses et aucune mauvaise."
      : "Points = (bonnes cochées − mauvaises cochées) ÷ nombre de bonnes réponses, jamais en dessous de 0. Les questions à choix unique restent tout ou rien.";
  };
  $("#allm").onclick = () => { settings.mods = MODULES.map((m) => m.n); document.querySelectorAll("[name=mod]").forEach((c) => (c.checked = true)); syncCount(); };
  $("#nonem").onclick = () => { settings.mods = []; document.querySelectorAll("[name=mod]").forEach((c) => (c.checked = false)); syncCount(); };
  document.querySelectorAll("[name=mod]").forEach((c) => (c.onchange = () => { settings.mods = [...document.querySelectorAll("[name=mod]:checked")].map((x) => +x.value); syncCount(); }));
  document.querySelectorAll("[name=type]").forEach((c) => (c.onchange = () => { settings.type = c.value; syncCount(); }));
  document.querySelectorAll("[name=mode]").forEach((c) => (c.onchange = () => { settings.mode = c.value; syncHints(); save_(); }));
  document.querySelectorAll("[name=scoring]").forEach((c) => (c.onchange = () => { settings.scoring = c.value; syncHints(); save_(); }));
  $("#nq").oninput = (e) => { settings.n = +e.target.value || 0; $("#nqr").value = settings.n; $("#tottime").textContent = `→ ${fmtTime(settings.n * settings.perQ * 60)} au total`; save_(); };
  $("#nq").onchange = syncCount;
  $("#nqr").oninput = (e) => { settings.n = +e.target.value; $("#nq").value = settings.n; $("#tottime").textContent = `→ ${fmtTime(settings.n * settings.perQ * 60)} au total`; save_(); };
  $("#timed").onchange = (e) => { settings.timed = e.target.checked; syncHints(); save_(); };
  $("#perq").onchange = (e) => { settings.perQ = Math.min(10, Math.max(0.25, +e.target.value || 1)); e.target.value = settings.perQ; syncCount(); };
  $("#start").onclick = () => { syncCount(); const ids = buildFromSettings(); if (!ids.length) return toast("Choisis au moins un module."); startSession(ids, settings); };
  $("#reset").onclick = async () => { if (await ask("Effacer tout l'historique, les stats et la session en cours ?", "Tout effacer")) { [K.history, K.stats, K.session].forEach((k) => localStorage.removeItem(k)); toast("Tout a été réinitialisé."); renderHome(); } };
  if (valid) {
    $("#resume").onclick = () => { S = resume; // on retire les questions qui n'existent plus dans la banque
      S.items = S.items.filter((it) => BANK.has(it.id)); if (!S.items.length) { localStorage.removeItem(K.session); return renderHome(); } S.cur = Math.min(S.cur, S.items.length - 1); go("quiz"); };
    $("#abandon").onclick = async () => { if (await ask("Abandonner la session en cours ?", "Abandonner")) { localStorage.removeItem(K.session); renderHome(); } };
  }
  syncCount(); syncHints();
}

/* ---------- Quiz (entraînement + examen) ---------- */
function curItem() { return S.items[S.cur]; }
function selOf(id) { return S.answers[id] || []; }

function renderQuiz() {
  if (!S) return go("home");
  const it = curItem(), q = BANK.get(it.id), sel = selOf(it.id), exam = S.mode === "exam", checked = !!S.checked[it.id];
  const nTot = S.items.length, answered = S.items.filter((x) => selOf(x.id).length).length;
  const done = Object.keys(S.checked).length;
  const run = exam ? "" : (() => { let p = 0; for (const x of S.items) if (S.checked[x.id]) p += points(BANK.get(x.id), selOf(x.id), S.scoring); return p; })();

  $("#topinfo").innerHTML = (S.timed ? `<span class="timer" id="timer">${fmtTime(S.remaining)}</span>` : "");
  const multi = q.type === "multiple";
  $("#app").innerHTML = `
    <div class="qhead"><div><b>Question ${S.cur + 1}</b> / ${nTot}</div>
      <div class="small muted">${exam ? `${answered} répondue(s)` : `Score : <b>${num(run)}</b> / ${done}`}</div></div>
    <div class="progress"><i style="width:${(S.cur + (checked ? 1 : 0)) / nTot * 100}%"></i></div>
    <div class="card">
      <div class="row" style="margin-bottom:.4rem"><span class="tag ${multi ? "multi" : ""}">${multi ? "Plusieurs réponses possibles" : "Une seule réponse"}</span><span class="tag mod">Module ${q.module}</span></div>
      <p class="qtext">${esc(q.question)}</p>
      <div class="choices ${checked ? "locked" : ""}" id="choices" role="${multi ? "group" : "radiogroup"}">
        ${it.order.map((oi, pos) => {
          const isSel = sel.includes(oi), isAns = q.answer.includes(oi);
          let cls = "", badge = "";
          if (checked) { if (isSel && isAns) { cls = "ok"; badge = "✓ Juste"; } else if (isSel) { cls = "ko"; badge = "✗ Faux"; } else if (isAns) { cls = "missed"; badge = "✓ À cocher"; } }
          return `<label class="choice ${cls}"><input type="${multi ? "checkbox" : "radio"}" name="c" value="${oi}" ${isSel ? "checked" : ""} ${checked ? "disabled" : ""}>
            <span class="letter">${letter(pos)}</span><span class="txt">${esc(q.choices[oi])}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</label>`;
        }).join("")}
      </div>
      ${checked ? explainHtml(q, sel) : ""}
    </div>
    ${exam ? examFooter(nTot) : trainFooter(checked, sel, nTot)}`;

  /* choix de réponse */
  document.querySelectorAll("#choices input").forEach((inp) => (inp.onchange = () => {
    const v = +inp.value; let cur = selOf(it.id).slice();
    if (!multi) cur = [v]; else cur = inp.checked ? [...cur, v] : cur.filter((x) => x !== v);
    S.answers[it.id] = cur.sort((a, b) => a - b); if (!cur.length) delete S.answers[it.id];
    persist();
    if (!exam) { const b = $("#validate"); if (b) b.disabled = !cur.length; } else refreshGrid();
  }));

  if (exam) wireExam(nTot); else wireTrain(it, nTot);
  if (S.timed) startTimer();
}

function explainHtml(q, sel) {
  const ok = sameSet(sel, q.answer);
  return `<div class="explain ${ok ? "ok" : "ko"}"><div class="verdict">${ok ? "✓ Bonne réponse !" : "✗ Réponse incorrecte"}</div>
    <div>${esc(q.explanation)}</div><div class="ref">📖 ${esc(q.reference)}</div></div>`;
}

/* --- entraînement --- */
function trainFooter(checked, sel, nTot) {
  const last = S.cur === nTot - 1;
  return `<div class="nav">${checked
    ? `<button class="btn primary" id="next">${last ? "Voir les résultats" : "Question suivante →"}</button>`
    : `<button class="btn primary" id="validate" ${sel.length ? "" : "disabled"}>Valider</button>`}</div>
    <div class="row" style="margin-top:.8rem"><button class="btn ghost small" id="pause">⏸ Pause (reprendre plus tard)</button></div>`;
}
function wireTrain(it, nTot) {
  const v = $("#validate"); if (v) v.onclick = () => { if (!selOf(it.id).length) return; S.checked[it.id] = true; persist(); renderQuiz(); $("#choices").scrollIntoView({ block: "start", behavior: "smooth" }); };
  const n = $("#next"); if (n) n.onclick = () => { if (S.cur === nTot - 1) finish(); else { S.cur++; persist(); renderQuiz(); window.scrollTo(0, 0); } };
  $("#pause").onclick = () => { persist(); go("home"); };
}

/* --- examen blanc --- */
function examFooter(nTot) {
  const it = curItem(), flagged = !!S.flags[it.id];
  return `<div class="nav"><button class="btn" id="prev" ${S.cur === 0 ? "disabled" : ""}>← Précédente</button>
      <button class="btn flagbtn ${flagged ? "on" : ""}" id="flag">⚑ ${flagged ? "À revoir ✓" : "À revoir"}</button>
      <button class="btn primary" id="nextq" ${S.cur === nTot - 1 ? "disabled" : ""}>Suivante →</button></div>
    <div class="card" style="margin-top:1rem"><h3>Navigation</h3><div class="grid" id="grid"></div>
      <div class="legend"><span>▢ non répondue</span><span style="color:var(--accent)">■ répondue</span><span style="color:var(--warn)">⚑ à revoir</span></div></div>
    <div class="row" style="margin-top:.5rem"><button class="btn primary grow" id="finish">Terminer l'examen</button><button class="btn ghost small" id="pause">⏸ Pause</button></div>`;
}
function refreshGrid() {
  const g = $("#grid"); if (!g) return;
  g.innerHTML = S.items.map((x, i) => `<button class="gbtn ${selOf(x.id).length ? "done" : ""} ${S.flags[x.id] ? "flag" : ""} ${i === S.cur ? "cur" : ""}" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`).join("");
  g.querySelectorAll("button").forEach((b) => (b.onclick = () => { S.cur = +b.dataset.i; persist(); renderQuiz(); window.scrollTo(0, 0); }));
}
function wireExam(nTot) {
  refreshGrid();
  $("#prev").onclick = () => { if (S.cur > 0) { S.cur--; persist(); renderQuiz(); window.scrollTo(0, 0); } };
  $("#nextq").onclick = () => { if (S.cur < nTot - 1) { S.cur++; persist(); renderQuiz(); window.scrollTo(0, 0); } };
  $("#flag").onclick = () => { const id = curItem().id; if (S.flags[id]) delete S.flags[id]; else S.flags[id] = true; persist(); renderQuiz(); };
  $("#pause").onclick = () => { persist(); go("home"); };
  $("#finish").onclick = async () => {
    const un = S.items.filter((x) => !selOf(x.id).length).length, fl = Object.keys(S.flags).length;
    const msg = `Terminer l'examen ?` + (un ? `\n${un} question(s) sans réponse.` : "") + (fl ? `\n${fl} question(s) marquée(s) « à revoir ».` : "");
    if (await ask(msg, "Terminer")) finish();
  };
}

/* --- chronomètre (mode examen) : se met en pause quand on quitte la page --- */
function startTimer() {
  clearInterval(tick); let n = 0;
  tick = setInterval(() => {
    S.remaining -= 1; n++;
    const t = $("#timer"); if (t) { t.textContent = fmtTime(S.remaining); t.classList.toggle("low", S.remaining <= 60); }
    if (n % 5 === 0) persist();
    if (S.remaining <= 0) { clearInterval(tick); toast("⏰ Temps écoulé : l'examen est terminé."); finish(); }
  }, 1000);
}
window.addEventListener("beforeunload", persist);
document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });

/* ---------- Fin de session ---------- */
let RESULT = null;
function finish() {
  clearInterval(tick);
  const perMod = {}; let total = 0; const detail = [];
  for (const it of S.items) {
    const q = BANK.get(it.id), sel = selOf(it.id), p = points(q, sel, S.scoring);
    total += p; (perMod[q.module] ||= { ok: 0, total: 0 }); perMod[q.module].ok += p; perMod[q.module].total += 1;
    detail.push({ it, q, sel, p });
  }
  const n = S.items.length;
  RESULT = { mode: S.mode, scoring: S.scoring, n, total, note: total / n * 20, pct: total / n * 100, perMod, detail, redo: S.redo, used: S.total - S.remaining, timed: S.timed, filter: false };
  // historique + stats (enregistrés une seule fois ici)
  const hist = load(K.history, []); hist.unshift({ date: Date.now(), mode: S.mode, scoring: S.scoring, n, note: RESULT.note, pct: RESULT.pct, redo: S.redo }); save(K.history, hist.slice(0, 100));
  const st = load(K.stats, {}); for (const m in perMod) { st[m] ||= { ok: 0, total: 0 }; st[m].ok += perMod[m].ok; st[m].total += perMod[m].total; } save(K.stats, st);
  localStorage.removeItem(K.session); S = null;
  go("results");
}

/* ---------- Résultats ---------- */
function reviewCard(d, i) {
  const { it, q, sel, p } = d, ok = p === 1, na = !sel.length, multi = q.type === "multiple";
  const verdict = na ? `<span class="v-na">– Non répondue</span>` : ok ? `<span class="v-ok">✓ Juste</span>` : p > 0 ? `<span class="v-na">◐ Partielle (${num(p)} pt)</span>` : `<span class="v-ko">✗ Faux</span>`;
  return `<div class="card ${na ? "is-na" : ok ? "is-ok" : "is-ko"}"><div class="rhead"><b>Q${i + 1}</b> ${verdict}<span class="tag mod">Module ${q.module}</span><span class="tag ${multi ? "multi" : ""}">${multi ? "Plusieurs réponses" : "Une réponse"}</span></div>
    <p class="qtext">${esc(q.question)}</p><div class="choices">${it.order.map((oi, pos) => {
      const s = sel.includes(oi), a = q.answer.includes(oi); let cls = "", b = "";
      if (s && a) { cls = "ok"; b = "✓ Ta réponse (juste)"; } else if (s) { cls = "ko"; b = "✗ Ta réponse (fausse)"; } else if (a) { cls = "missed"; b = "✓ Bonne réponse"; }
      return `<div class="choice ${cls}"><span class="letter">${letter(pos)}</span><span class="txt">${esc(q.choices[oi])}</span>${b ? `<span class="badge">${b}</span>` : ""}</div>`; }).join("")}</div>
    <div class="explain ${ok ? "ok" : "ko"}"><div>${esc(q.explanation)}</div><div class="ref">📖 ${esc(q.reference)}</div></div></div>`;
}
function renderResults() {
  const R = RESULT; if (!R) return go("home");
  const errors = R.detail.filter((d) => d.p < 1);
  const shown = R.filter ? errors : R.detail;
  $("#app").innerHTML = `
    <div class="card score"><div class="muted small">${R.mode === "exam" ? "Examen blanc" : "Entraînement"}${R.redo ? " – mes erreurs" : ""}</div>
      <div class="big">${num(R.note)}<small> / 20</small></div><div class="pct">${num(R.pct)} % · ${num(R.total)} / ${R.n} points</div>
      <span class="pill">Notation : ${R.scoring === "strict" ? "tout ou rien (choix multiples)" : "partielle (choix multiples)"}</span>
      ${R.timed ? `<div class="muted small" style="margin-top:.5rem">Temps utilisé : ${fmtTime(R.used)}</div>` : ""}</div>
    <div class="card"><h2>Score par module</h2>${Object.keys(R.perMod).sort().map((m) => { const s = R.perMod[m], p = Math.round(100 * s.ok / s.total);
      return `<div class="stat"><div class="row between small"><span>Module ${m}</span><span class="muted">${num(s.ok)}/${s.total} · <b>${p} %</b></span></div><div class="bar"><i style="width:${p}%"></i></div></div>`; }).join("")}</div>
    <div class="row" style="margin-bottom:1rem">
      ${errors.length ? `<button class="btn primary grow" id="redo">Refaire mes erreurs (${errors.length})</button>` : `<span class="grow v-ok">🎉 Aucune erreur !</span>`}
      <button class="btn grow" id="again">Nouvelle session</button></div>
    <div class="row between" style="margin-bottom:.8rem"><h2 style="margin:0">Correction détaillée</h2>
      <div class="seg" style="min-width:210px"><label><input type="radio" name="flt" value="all" ${R.filter ? "" : "checked"}>Tout</label><label><input type="radio" name="flt" value="err" ${R.filter ? "checked" : ""}>Mes erreurs</label></div></div>
    <div class="review">${shown.length ? shown.map((d) => reviewCard(d, R.detail.indexOf(d))).join("") : `<p class="muted">Rien à afficher.</p>`}</div>`;
  document.querySelectorAll("[name=flt]").forEach((r) => (r.onchange = () => { R.filter = r.value === "err"; renderResults(); }));
  const redo = $("#redo");
  if (redo) redo.onclick = () => startSession(errors.map((d) => d.q.id), { mode: R.mode, scoring: R.scoring, timed: R.timed, perQ: settings.perQ, redo: true });
  $("#again").onclick = () => go("home");
}

/* ---------- Démarrage ---------- */
$("#brand").onclick = () => { if (view === "quiz") persist(); go("home"); };
(async function init() {
  await loadBank();
  const sv = load(K.session, null);
  if (sv && sv.finished) localStorage.removeItem(K.session);
  render();
})();
