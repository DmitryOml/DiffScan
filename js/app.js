"use strict";

var diffPrecision = "smart", layoutMode = "split", hideWhitespace = false, ignoreCase = false, hideUnchanged = false, wrapLines = false;
var changeIndex = -1, changeRows = [];

// Оптимизация: один regex вместо двух replace
function splitLines(t) { if (t === "") return [""]; return t.replace(/\r\n|\r/g, "\n").split("\n") }
function normalizeWhitespace(s) { return s.replace(/\s+/g, " ").trim() }
// Оптимизация: один проход по строке вместо трёх
function escapeHtml(s) { return s.replace(/[&<>]/g, function(c) { return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;" }) }
function tokenizeWords(s) { return s.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}\s]+|\s+/gu) || [] }

function computeTokenDiff(A, B) {
  var n = A.length, m = B.length, dp = [];
  // Оптимизация: Int32Array быстрее аллоцируется и требует меньше памяти чем Array.fill(0)
  for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (var i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  var left = [], right = [], ii = 0, jj = 0;
  function push(a, t, v) { var l = a[a.length - 1]; if (l && l.type === t) l.value += v; else a.push({ type: t, value: v }) }
  while (ii < n && jj < m) { if (A[ii] === B[jj]) { push(left, "equal", A[ii]); push(right, "equal", B[jj]); ii++; jj++ } else if (dp[ii + 1][jj] > dp[ii][jj + 1]) { push(left, "removed", A[ii]); ii++ } else { push(right, "added", B[jj]); jj++ } }
  while (ii < n) { push(left, "removed", A[ii]); ii++ }
  while (jj < m) { push(right, "added", B[jj]); jj++ }
  return { left: left, right: right }
}

function computeInnerDiff(a, b) {
  if (!a && !b) return { left: [], right: [] };
  if (diffPrecision === "line") return { left: [{ type: "equal", value: a }], right: [{ type: "equal", value: b }] };
  if (diffPrecision === "char") return computeTokenDiff(Array.from(a), Array.from(b));
  if (diffPrecision === "word") return computeTokenDiff(tokenizeWords(a), tokenizeWords(b));
  if (a.length <= 8 || b.length <= 8) return computeTokenDiff(Array.from(a), Array.from(b));
  var w = computeTokenDiff(tokenizeWords(a), tokenizeWords(b));
  var rl = 0, al = 0;
  for (var t = 0; t < w.left.length; t++) if (w.left[t].type === "removed") rl += w.left[t].value.length;
  for (var t = 0; t < w.right.length; t++) if (w.right[t].type === "added") al += w.right[t].value.length;
  var mx = Math.max(a.length, b.length);
  if (mx > 0 && (rl + al) / mx > 0.6) return computeTokenDiff(Array.from(a), Array.from(b));
  var rl2 = [], rr2 = [];
  var li = 0, ri = 0;
  while (li < w.left.length && ri < w.right.length) {
    if (w.left[li].type === "equal") { rl2.push(w.left[li]); rr2.push(w.right[ri]); li++; ri++ }
    else if (w.left[li].type === "removed" && w.right[ri].type === "added") {
      var ch = computeTokenDiff(Array.from(w.left[li].value), Array.from(w.right[ri].value));
      rl2.push(ch.left); rr2.push(ch.right); li++; ri++
    }
    else if (w.left[li].type === "removed") { rl2.push(w.left[li]); li++ }
    else { rr2.push(w.right[ri]); ri++ }
  }
  while (li < w.left.length) { rl2.push(w.left[li]); li++ }
  while (ri < w.right.length) { rr2.push(w.right[ri]); ri++ }
  function flat(a) { var r = []; for (var i = 0; i < a.length; i++) { var x = a[i]; if (Array.isArray(x)) for (var j = 0; j < x.length; j++) r.push(x[j]); else r.push(x) } return r }
  return { left: flat(rl2), right: flat(rr2) }
}

function computeLineDiff(a, b) {
  var n = a.length, m = b.length;
  function gv(l) { var v = l; if (ignoreCase) v = v.toLowerCase(); if (hideWhitespace) v = normalizeWhitespace(v); return v }
  var dp = [];
  // Оптимизация: Int32Array вместо Array.fill(0)
  for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
  for (var i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = gv(a[i]) === gv(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  var ops = [], ii = 0, jj = 0;
  while (ii < n && jj < m) { if (gv(a[ii]) === gv(b[jj])) { ops.push({ type: "equal", left: a[ii], right: b[jj] }); ii++; jj++ } else if (dp[ii + 1][jj] > dp[ii][jj + 1]) { ops.push({ type: "removed", left: a[ii] }); ii++ } else { ops.push({ type: "added", right: b[jj] }); jj++ } }
  while (ii < n) { ops.push({ type: "removed", left: a[ii] }); ii++ }
  while (jj < m) { ops.push({ type: "added", right: b[jj] }); jj++ }
  var merged = [], k = 0;
  while (k < ops.length) {
    if (ops[k].type === "removed" && k + 1 < ops.length && ops[k + 1].type === "added") {
      var rr = [], ar = [];
      while (k < ops.length && ops[k].type === "removed") { rr.push(ops[k].left); k++ }
      while (k < ops.length && ops[k].type === "added") { ar.push(ops[k].right); k++ }
      var p = Math.min(rr.length, ar.length);
      for (var q = 0; q < p; q++) merged.push({ type: "modified", left: rr[q], right: ar[q] });
      for (var q = p; q < rr.length; q++) merged.push({ type: "removed", left: rr[q] });
      for (var q = p; q < ar.length; q++) merged.push({ type: "added", right: ar[q] });
    } else if (ops[k].type === "added" && k + 1 < ops.length && ops[k + 1].type === "removed") {
      var rr2 = [], ar2 = [];
      while (k < ops.length && ops[k].type === "added") { ar2.push(ops[k].right); k++ }
      while (k < ops.length && ops[k].type === "removed") { rr2.push(ops[k].left); k++ }
      var p2 = Math.min(rr2.length, ar2.length);
      for (var q = 0; q < p2; q++) merged.push({ type: "modified", left: rr2[q], right: ar2[q] });
      for (var q = p2; q < rr2.length; q++) merged.push({ type: "removed", left: rr2[q] });
      for (var q = p2; q < ar2.length; q++) merged.push({ type: "added", right: ar2[q] });
    } else { merged.push(ops[k]); k++ }
  }
  var ln = 1, rn = 1, result = [];
  for (var u = 0; u < merged.length; u++) {
    var o = merged[u];
    if (o.type === "equal") result.push({ type: "equal", left: o.left, right: o.right, leftNo: ln++, rightNo: rn++ });
    else if (o.type === "modified") result.push({ type: "modified", left: o.left, right: o.right, leftNo: ln++, rightNo: rn++ });
    else if (o.type === "removed") result.push({ type: "removed", left: o.left, leftNo: ln++ });
    else result.push({ type: "added", right: o.right, rightNo: rn++ });
  }
  return result
}

function renderInnerHtml(tokens, side) {
  var h = "";
  for (var i = 0; i < tokens.length; i++) { var s = escapeHtml(tokens[i].value); if (tokens[i].type === "equal") h += s; else h += '<span class="' + (side === "left" ? "mark-removed" : "mark-added") + '">' + s + '</span>' }
  return h
}

function buildLineHtml(entry, side) {
  var ln = "", ch = "", rc = "row-";
  if (entry.type === "equal") { ln = side === "left" ? entry.leftNo : entry.rightNo; var t = side === "left" ? entry.left : entry.right; ch = t === "" ? "\u00a0" : escapeHtml(t); rc += "equal" }
  else if (entry.type === "modified") { ln = side === "left" ? entry.leftNo : entry.rightNo; var inner = computeInnerDiff(entry.left, entry.right); ch = renderInnerHtml(side === "left" ? inner.left : inner.right, side); rc += "modified" }
  else if (entry.type === "removed") { if (side === "left") { ln = entry.leftNo; ch = entry.left === "" ? "\u00a0" : escapeHtml(entry.left); rc += "removed" } else { rc += "empty" } }
  else if (entry.type === "added") { if (side === "right") { ln = entry.rightNo; ch = entry.right === "" ? "\u00a0" : escapeHtml(entry.right); rc += "added" } else { rc += "empty" } }
  return '<div class="diff-line' + (wrapLines ? " wrap" : "") + ' ' + rc + '"><span class="line-no">' + ln + '</span><span class="line-content">' + (ch || "\u00a0") + '</span></div>'
}

function collapseUnchanged(diff) {
  if (!hideUnchanged) return diff;
  var r = [], eq = 0, eqb = [];
  for (var i = 0; i < diff.length; i++) { if (diff[i].type === "equal") { eq++; eqb.push(diff[i]) } else { if (eq > 2) r.push({ type: "collapsed", count: eq }); else if (eq > 0) r.push.apply(r, eqb); eq = 0; eqb = []; r.push(diff[i]) } }
  if (eq > 2) r.push({ type: "collapsed", count: eq }); else if (eq > 0) r.push.apply(r, eqb);
  return r
}

function renderResult(diff, rawLeft, rawRight) {
  // Оптимизация: используем кэшированный resultEl
  resultEl.innerHTML = "";
  var rm = 0, ad = 0;
  for (var i = 0; i < diff.length; i++) { if (diff[i].type === "removed") rm++; else if (diff[i].type === "added") ad++; else if (diff[i].type === "modified") { rm++; ad++ } }
  var dd = collapseUnchanged(diff);
  if (layoutMode === "unified") renderUnified(resultEl, dd, rm, ad, rawLeft, rawRight);
  else renderSplit(resultEl, dd, rm, ad, rawLeft, rawRight);
  var rb = resultEl.querySelector(".diff-body"); if (rb) { markChanges(rb); showNavBar() }
}

// Оптимизация: один проход по dd для обеих панелей + innerHTML= вместо insertAdjacentHTML в цикле
function renderSplit(c, dd, rm, ad, rl, rr) {
  var sd = document.createElement("div"); sd.className = "split";
  var pL = document.createElement("div"); pL.className = "panel result-panel"; pL.style.height = "auto";
  var hL = document.createElement("div"); hL.className = "panel-header";
  var lL = document.createElement("span"); lL.className = "count-removed"; lL.textContent = rm + " removal" + (rm === 1 ? "" : "s"); hL.appendChild(lL);
  hL.appendChild(makeCopyBtn(rl)); pL.appendChild(hL);
  var pR = document.createElement("div"); pR.className = "panel result-panel"; pR.style.height = "auto";
  var hR = document.createElement("div"); hR.className = "panel-header";
  var lR = document.createElement("span"); lR.className = "count-added"; lR.textContent = ad + " addition" + (ad === 1 ? "" : "s"); hR.appendChild(lR);
  hR.appendChild(makeCopyBtn(rr)); pR.appendChild(hR);
  var bL = document.createElement("div"); bL.className = "diff-body";
  var bR = document.createElement("div"); bR.className = "diff-body";
  var htmlL = "", htmlR = "";
  var EMPTY_ROW = '<div class="diff-line row-empty"><span class="line-no"></span><span class="line-content"></span></div>';
  for (var i = 0; i < dd.length; i++) {
    var entry = dd[i];
    if (entry.type === "collapsed") {
      var col = '<div class="diff-line row-collapsed"><span class="line-no"></span><span class="line-content">\u2026 ' + entry.count + ' unchanged \u2026</span></div>';
      htmlL += col; htmlR += col;
    } else if (entry.type === "added") {
      htmlL += EMPTY_ROW; htmlR += buildLineHtml(entry, "right");
    } else if (entry.type === "removed") {
      htmlL += buildLineHtml(entry, "left"); htmlR += EMPTY_ROW;
    } else {
      htmlL += buildLineHtml(entry, "left"); htmlR += buildLineHtml(entry, "right");
    }
  }
  bL.innerHTML = htmlL; bR.innerHTML = htmlR;
  pL.appendChild(bL); pR.appendChild(bR);
  sd.appendChild(pL); sd.appendChild(pR); c.appendChild(sd);
}

function renderUnified(c, dd, rm, ad, rl, rr) {
  var p = document.createElement("div"); p.className = "panel result-panel"; p.style.height = "auto"; p.style.flex = "1";
  var h = document.createElement("div"); h.className = "panel-header";
  var l = document.createElement("span"); l.innerHTML = '<span class="count-removed">' + rm + ' removal' + (rm === 1 ? "" : "s") + '</span> &middot; <span class="count-added">' + ad + ' addition' + (ad === 1 ? "" : "s") + '</span>';
  h.appendChild(l); h.appendChild(makeCopyBtn(rl + "\n---\n" + rr)); p.appendChild(h);
  var b = document.createElement("div"); b.className = "diff-body";
  for (var i = 0; i < dd.length; i++) {
    var e = dd[i];
    if (e.type === "collapsed") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-collapsed"><span class="line-no"></span><span class="line-no-right"></span><span class="line-content">\u2026 ' + e.count + ' unchanged \u2026</span></div>');
    else if (e.type === "equal") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-equal"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + escapeHtml(e.left || "") + '</span></div>');
    else if (e.type === "removed") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-removed"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right"></span><span class="line-content">' + escapeHtml(e.left || "") + '</span></div>');
    else if (e.type === "added") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-added"><span class="line-no"></span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + escapeHtml(e.right || "") + '</span></div>');
    else if (e.type === "modified") { var inner = computeInnerDiff(e.left, e.right); b.insertAdjacentHTML("beforeend", '<div class="diff-line row-modified"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + renderInnerHtml(inner.left, "left") + '</span></div><div class="diff-line row-modified"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + renderInnerHtml(inner.right, "right") + '</span></div>') }
  }
  p.appendChild(b); c.appendChild(p)
}

function makeCopyBtn(t) { var b = document.createElement("button"); b.className = "copy-btn"; b.textContent = "Copy"; b.addEventListener("click", function () { copyToClipboard(t); b.textContent = "Copied!"; setTimeout(function () { b.textContent = "Copy" }, 1200) }); return b }

// Оптимизация: Array.from вместо ручного фильтра (row-empty/row-collapsed взаимоисключают row-removed/added/modified)
function markChanges(body) {
  changeRows = Array.from(body.querySelectorAll(".row-removed,.row-added,.row-modified"));
  changeIndex = changeRows.length > 0 ? 0 : -1; updateNavHighlight(); updateNavLabel()
}
function updateNavHighlight() { for (var i = 0; i < changeRows.length; i++) changeRows[i].classList.remove("highlight-change"); if (changeIndex >= 0 && changeIndex < changeRows.length) { changeRows[changeIndex].classList.add("highlight-change"); changeRows[changeIndex].scrollIntoView({ behavior: "smooth", block: "center" }) } }
function goFirst() { changeIndex = changeRows.length > 0 ? 0 : -1; updateNavHighlight(); updateNavLabel() }
function goPrev() { if (changeIndex > 0) { changeIndex--; updateNavHighlight(); updateNavLabel() } }
function goNext() { if (changeIndex < changeRows.length - 1) { changeIndex++; updateNavHighlight(); updateNavLabel() } }
function goLast() { changeIndex = changeRows.length - 1; updateNavHighlight(); updateNavLabel() }
// Оптимизация: используем кэшированный navBar
function showNavBar() { navBar.style.display = "flex"; updateNavLabel() }
// Оптимизация: используем кэшированные nav-элементы вместо getElementById при каждом вызове
function updateNavLabel() {
  var t = changeRows.length, c = changeIndex >= 0 ? changeIndex + 1 : 0;
  navCount.textContent = c + "/" + t;
  navFirst.disabled = t === 0 || changeIndex <= 0;
  navPrev.disabled = t === 0 || changeIndex <= 0;
  navNext.disabled = t === 0 || changeIndex >= t - 1;
  navLast.disabled = t === 0 || changeIndex >= t - 1;
}

function copyToClipboard(t) { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(function () { legacyCopy(t) }); else legacyCopy(t) }
function legacyCopy(t) { var a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); try { document.execCommand("copy") } catch (e) { } document.body.removeChild(a) }

// Оптимизация: Array.from убран, используется прямой проход; cache val
function updateInputGutter(tid, gid) {
  var ta = document.getElementById(tid), g = document.getElementById(gid);
  g.textContent = Array.from({ length: ta.value.split("\n").length }, function(_, i) { return i + 1 }).join("\n");
}
function updateCounts() {
  for (var i = 1; i <= 2; i++) {
    var ta = document.getElementById("text" + i), val = ta.value, l = val === "" ? 1 : val.split("\n").length;
    document.getElementById("count" + i).textContent = "Lines: " + l + " \u00b7 Chars: " + val.length;
  }
}

function applyTransform(tid, action) {
  var ta = document.getElementById(tid), lines = ta.value.split("\n");
  switch (action) {
    case "trim": lines = lines.map(function (l) { return l.trimEnd() }); break;
    case "upper": lines = lines.map(function (l) { return l.toUpperCase() }); break;
    case "lower": lines = lines.map(function (l) { return l.toLowerCase() }); break;
    case "sort": lines.sort(); break;
    // Исправление бага: объект {} ломался на строках "", "0", "false" — Set корректен
    case "unique": var seen = new Set(); lines = lines.filter(function (l) { if (seen.has(l)) return false; seen.add(l); return true }); break;
    case "removeEmpty": lines = lines.filter(function (l) { return l.trim() !== "" }); break;
  }
  ta.value = lines.join("\n"); updateInputGutter(tid, "gutter" + tid.slice(-1)); updateCounts(); triggerDiff()
}

function triggerDiff() {
  var scrollY = window.scrollY;
  var focusEl = document.activeElement;
  document.documentElement.style.overflow = "hidden";
  var r1 = document.getElementById("text1").value, r2 = document.getElementById("text2").value;
  var l1 = splitLines(r1), l2 = splitLines(r2);
  var diff = computeLineDiff(l1, l2);
  renderResult(diff, r1, r2); updateCounts();
  document.documentElement.style.overflow = "";
  window.scrollTo(0, scrollY);
  if (focusEl) focusEl.focus();
}

// Оптимизация: кэшируем часто используемые DOM-элементы один раз
var ta1 = document.getElementById("text1"), ta2 = document.getElementById("text2"), g1 = document.getElementById("gutter1"), g2 = document.getElementById("gutter2"), au = document.getElementById("autoUpdate");
var resultEl = document.getElementById("result");
var navBar = document.getElementById("navBar");
var navCount = document.getElementById("navCount");
var navFirst = document.getElementById("navFirst");
var navPrev = document.getElementById("navPrev");
var navNext = document.getElementById("navNext");
var navLast = document.getElementById("navLast");

function updateG1() { updateInputGutter("text1", "gutter1"); updateCounts() }
function updateG2() { updateInputGutter("text2", "gutter2"); updateCounts() }

ta1.addEventListener("input", function () { updateG1(); if (au.checked) triggerDiff() });
ta2.addEventListener("input", function () { updateG2(); if (au.checked) triggerDiff() });
ta1.addEventListener("scroll", function () { g1.scrollTop = ta1.scrollTop });
ta2.addEventListener("scroll", function () { g2.scrollTop = ta2.scrollTop });

(function () {
  var a = null;
  ta1.addEventListener("mouseenter", function () { a = ta1 }); ta2.addEventListener("mouseenter", function () { a = ta2 });
  ta1.addEventListener("scroll", function () { if (a === ta1) { ta2.scrollTop = ta1.scrollTop; ta2.scrollLeft = ta1.scrollLeft } });
  ta2.addEventListener("scroll", function () { if (a === ta2) { ta1.scrollTop = ta2.scrollTop; ta1.scrollLeft = ta2.scrollLeft } })
})();

updateG1(); updateG2(); updateCounts();

function setupFileUpload(iid, tid, fn) { document.getElementById(iid).addEventListener("change", function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function (ev) { document.getElementById(tid).value = ev.target.result; fn(); if (au.checked) triggerDiff() }; r.readAsText(f); e.target.value = "" }) }
setupFileUpload("file1", "text1", updateG1); setupFileUpload("file2", "text2", updateG2);

var pb = document.querySelectorAll("#precisionControl .segment-btn");
pb.forEach(function (b) { b.addEventListener("click", function () { pb.forEach(function (x) { x.classList.remove("active") }); b.classList.add("active"); diffPrecision = b.getAttribute("data-val"); if (resultEl.innerHTML !== "" || au.checked) triggerDiff() }) });
var lb = document.querySelectorAll("#layoutControl .segment-btn");
lb.forEach(function (b) { b.addEventListener("click", function () { lb.forEach(function (x) { x.classList.remove("active") }); b.classList.add("active"); layoutMode = b.getAttribute("data-val"); if (resultEl.innerHTML !== "" || au.checked) triggerDiff() }) });

document.getElementById("hideWhitespace").addEventListener("change", function (e) { hideWhitespace = e.target.checked; if (au.checked) triggerDiff() });
document.getElementById("ignoreCase").addEventListener("change", function (e) { ignoreCase = e.target.checked; if (au.checked) triggerDiff() });
document.getElementById("hideUnchanged").addEventListener("change", function (e) { hideUnchanged = e.target.checked; if (resultEl.innerHTML !== "") triggerDiff() });
document.getElementById("disableWrap").addEventListener("change", function (e) { wrapLines = !e.target.checked; document.querySelectorAll("textarea.input").forEach(function (t) { if (wrapLines) t.classList.add("wrap"); else t.classList.remove("wrap") }); if (resultEl.innerHTML !== "") triggerDiff() });

document.querySelectorAll(".transform-btn").forEach(function (b) { b.addEventListener("click", function () { applyTransform(b.getAttribute("data-target"), b.getAttribute("data-action")) }) });

document.getElementById("swapBtn").addEventListener("click", function () { var v1 = ta1.value, v2 = ta2.value; ta1.value = v2; ta2.value = v1; updateG1(); updateG2(); updateCounts(); if (au.checked) triggerDiff() });
// Оптимизация: используем кэшированные resultEl и navBar
document.getElementById("clearBtn").addEventListener("click", function () { ta1.value = ""; ta2.value = ""; resultEl.innerHTML = ""; updateG1(); updateG2(); updateCounts(); navBar.style.display = "none"; exitMergeMode() });
document.getElementById("findBtn").addEventListener("click", triggerDiff);

document.addEventListener("click", function (e) { if (e.target.id === "navFirst") goFirst(); if (e.target.id === "navPrev") goPrev(); if (e.target.id === "navNext") goNext(); if (e.target.id === "navLast") goLast() });

var mergeMode = false;
var activeMergeLine = null;

document.getElementById("mergeBtn").addEventListener("click", function () {
  if (mergeMode) { exitMergeMode() } else { enterMergeMode() }
});

// Оптимизация: убраны inline-стили, состояние active управляется CSS-классом
function enterMergeMode() {
  mergeMode = true;
  document.getElementById("mergeBtn").classList.add("active");
  resultEl.classList.add("merge-mode");
  activeMergeLine = null
}

function exitMergeMode() {
  mergeMode = false;
  document.getElementById("mergeBtn").classList.remove("active");
  resultEl.classList.remove("merge-mode");
  activeMergeLine = null;
  clearMergeButtons()
}

// Оптимизация: один вызов classList.remove с несколькими аргументами вместо трёх
function clearMergeButtons() {
  document.querySelectorAll(".merge-btn").forEach(function (b) { b.remove() });
  document.querySelectorAll(".merge-selected").forEach(function (r) {
    r.classList.remove("merge-selected", "merge-block-top", "merge-block-bottom");
  });
}

function getPanelSide(line) {
  var split = line.closest(".split");
  if (!split) return "left";
  var panels = split.querySelectorAll(".result-panel");
  if (panels.length >= 2 && line.closest(".result-panel") === panels[1]) return "right";
  return "left"
}

function showMergeButtons(line) {
  clearMergeButtons();
  activeMergeLine = line;

  var block = [];
  var isRemoved = line.classList.contains("row-removed");
  var isAdded = line.classList.contains("row-added");
  var isModified = line.classList.contains("row-modified");
  var isLeft = getPanelSide(line) === "left";
  function getBlock(cls) {
    var b = [];
    var c = line;
    while (c && c.classList.contains(cls)) { b.push(c); c = c.previousElementSibling; }
    b.reverse();
    c = line.nextElementSibling;
    while (c && c.classList.contains(cls)) { b.push(c); c = c.nextElementSibling; }
    return b;
  }

  if (isRemoved) block = getBlock("row-removed");
  else if (isAdded) block = getBlock("row-added");
  else if (isModified) block = getBlock("row-modified");
  else return;

  // Add wrapper class to the first and last elements for block outline
  block[0].classList.add("merge-block-top");
  block[block.length - 1].classList.add("merge-block-bottom");
  block.forEach(function (l) { l.classList.add("merge-selected"); });

  var content = line.querySelector(".line-content");
  if (!content) return;
  var btn = document.createElement("button");
  btn.className = "merge-btn";

  // Dynamic color based on block type
  if (isAdded) btn.style.backgroundColor = "#1a7f37";
  else if (isRemoved) btn.style.backgroundColor = "#cf222e";
  else btn.style.backgroundColor = "#d4a717";

  if (isLeft) {
    btn.classList.add("merge-btn-right");
    btn.innerHTML = "Merge &rarr;";
    btn.title = "Copy block to right"
  } else {
    btn.classList.add("merge-btn-left");
    btn.innerHTML = "&larr; Merge";
    btn.title = "Copy block to left"
  }
  btn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    doMergeBlock(block, isLeft ? "right" : "left", isModified)
  });

  // Position it in the gutter/center area
  content.style.position = "relative";
  content.appendChild(btn)
}

// Оптимизация: используем кэшированный resultEl
resultEl.addEventListener("click", function (e) {
  if (!mergeMode) return;
  if (layoutMode !== "split") return;
  if (e.target.classList && e.target.classList.contains("merge-btn")) return;
  var line = e.target.closest(".diff-line");
  if (!line) return;
  var cls = line.className;
  if (cls.indexOf("row-equal") !== -1 || cls.indexOf("row-empty") !== -1 || cls.indexOf("row-collapsed") !== -1) return;
  if (activeMergeLine === line) { clearMergeButtons(); activeMergeLine = null; return }
  showMergeButtons(line)
});

function doMergeBlock(block, targetSide, isModified) {
  var dstTa, dstGutterId, dstId;
  if (targetSide === "right") {
    dstTa = ta2; dstGutterId = "gutter2"; dstId = "text2"
  } else {
    dstTa = ta1; dstGutterId = "gutter1"; dstId = "text1"
  }

  var blockText = block.map(function (l) {
    var clone = l.querySelector(".line-content").cloneNode(true);
    var btn = clone.querySelector(".merge-btn");
    if (btn) btn.remove();
    var t = clone.textContent;
    return t === "\u00a0" ? "" : t;
  }).join("\n");

  var firstLine = block[0];
  // Оптимизация: Array.prototype.indexOf.call вместо Array.from().indexOf (без аллокации массива)
  var domIndex = Array.prototype.indexOf.call(firstLine.parentNode.children, firstLine);

  var srcPanel = firstLine.closest(".result-panel");
  var split = firstLine.closest(".split");
  var panels = Array.from(split.querySelectorAll(".result-panel"));
  var targetPanel = panels[0] === srcPanel ? panels[1] : panels[0];
  var targetBody = targetPanel.querySelector(".diff-body");

  var dstLines = splitLines(dstTa.value);

  if (firstLine.classList.contains("row-modified")) {
    var targetFirstChild = targetBody.children[domIndex];
    var targetStartLineNo = 0;
    if (targetFirstChild) {
      var noEl = targetFirstChild.querySelector(".line-no");
      if (noEl) {
        var num = parseInt(noEl.textContent, 10);
        if (!isNaN(num)) targetStartLineNo = num;
      }
    }

    var insertIndex = targetStartLineNo > 0 ? targetStartLineNo - 1 : 0;

    while (dstLines.length < insertIndex) {
      dstLines.push("");
    }

    var args = [insertIndex, block.length].concat(blockText.split("\n"));
    Array.prototype.splice.apply(dstLines, args);
  } else {
    var targetChildren = targetBody.children;
    var insertLineNo = 0;
    for (var j = domIndex - 1; j >= 0; j--) {
      var child = targetChildren[j];
      var noEl = child.querySelector(".line-no");
      if (noEl && noEl.textContent.trim() !== "") {
        var num = parseInt(noEl.textContent, 10);
        if (!isNaN(num)) {
          insertLineNo = num;
          break;
        }
      }
    }

    while (dstLines.length < insertLineNo) {
      dstLines.push("");
    }

    var args = [insertLineNo, 0].concat(blockText.split("\n"));
    Array.prototype.splice.apply(dstLines, args);
  }

  dstTa.value = dstLines.join("\n");
  updateInputGutter(dstId, dstGutterId);
  updateCounts();
  if (au.checked) triggerDiff();
  clearMergeButtons();
  activeMergeLine = null
}
