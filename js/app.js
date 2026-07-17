"use strict";

var diffPrecision = "smart", layoutMode = window.innerWidth <= 760 ? "unified" : "split", hideWhitespace = false, ignoreCase = false, hideUnchanged = false, wrapLines = false;
var changeIndex = -1, changeRows = [];

// Оптимизация: один regex вместо двух replace
function splitLines(t) { if (t === "") return [""]; return t.replace(/\r\n|\r/g, "\n").split("\n") }
function normalizeWhitespace(s) { return s.replace(/\s+/g, " ").trim() }
// Оптимизация: один проход по строке вместо трёх
function escapeHtml(s) { return s.replace(/[&<>]/g, function(c) { return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;" }) }
function tokenizeWords(s) { return s.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}\s]+|\s+/gu) || [] }

function myersDiff(A, B, eq) {
  var n = A.length, m = B.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) { var r = []; for (var i = 0; i < m; i++) r.push({ type: 'added', right: B[i] }); return r; }
  if (m === 0) { var r = []; for (var i = 0; i < n; i++) r.push({ type: 'removed', left: A[i] }); return r; }
  eq = eq || function(a, b) { return a === b; };
  var max = n + m, mid = max, V = new Int32Array(2 * max + 1);
  V[1 + mid] = 0;
  var trace = [];
  for (var d = 0; d <= max; d++) {
    for (var k = -d; k <= d; k += 2) {
      var idx = k + mid;
      var x = (k === -d || (k !== d && V[idx - 1] < V[idx + 1])) ? V[idx + 1] : V[idx - 1] + 1;
      var y = x - k;
      while (x < n && y < m && eq(A[x], B[y])) { x++; y++; }
      V[idx] = x;
      if (x >= n && y >= m) {
        var ops = [];
        for (var dd = d; dd > 0; dd--) {
          var Vp = trace[dd - 1], kk = x - y;
          var pkk = (kk === -dd || (kk !== dd && Vp[kk - 1 + mid] < Vp[kk + 1 + mid])) ? kk + 1 : kk - 1;
          var px = Vp[pkk + mid], py = px - pkk;
          while (x > px && y > py) { ops.push({ type: 'equal', left: A[x - 1], right: B[y - 1] }); x--; y--; }
          if (pkk < kk) { x--; ops.push({ type: 'removed', left: A[x] }); } else { y--; ops.push({ type: 'added', right: B[y] }); }
        }
        while (x > 0 && y > 0) { ops.push({ type: 'equal', left: A[x - 1], right: B[y - 1] }); x--; y--; }
        return ops.reverse();
      }
    }
    trace.push(new Int32Array(V));
  }
  return [];
}

function smoothDiff(tokens, type) {
  if (tokens.length < 3) return tokens;
  var res = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.type === "equal" && res.length > 0 && i + 1 < tokens.length) {
      var prev = res[res.length - 1];
      var next = tokens[i + 1];
      if (prev.type !== "equal" && next.type !== "equal" && t.value.length <= 2) {
        prev.value += t.value;
        continue;
      }
    }
    res.push(t);
  }
  return res;
}

function computeTokenDiff(A, B) {
  var ops = myersDiff(A, B);
  var left = [], right = [];
  function push(a, t, v) { var l = a[a.length - 1]; if (l && l.type === t) l.value += v; else a.push({ type: t, value: v }) }
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    if (o.type === "equal") { push(left, "equal", o.left); push(right, "equal", o.right); }
    else if (o.type === "removed") push(left, "removed", o.left);
    else push(right, "added", o.right);
  }
  return { left: smoothDiff(left), right: smoothDiff(right) }
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
  if (mx > 0 && (rl + al) / mx > 0.8) return computeTokenDiff(Array.from(a), Array.from(b));
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
  function gv(l) { var v = l; if (ignoreCase) v = v.toLowerCase(); if (hideWhitespace) v = normalizeWhitespace(v); return v }
  var ops = myersDiff(a, b, function(x, y) { return gv(x) === gv(y); });
  var merged = [], k = 0;
  while (k < ops.length) {
    if (ops[k].type === "removed") {
      var rr = [];
      while (k < ops.length && ops[k].type === "removed") { rr.push(ops[k].left); k++ }
      if (k < ops.length && ops[k].type === "added") {
        var ar = [];
        while (k < ops.length && ops[k].type === "added") { ar.push(ops[k].right); k++ }
        var p = Math.min(rr.length, ar.length);
        for (var q = 0; q < p; q++) merged.push({ type: "modified", left: rr[q], right: ar[q] });
        for (var q = p; q < rr.length; q++) merged.push({ type: "removed", left: rr[q] });
        for (var q = p; q < ar.length; q++) merged.push({ type: "added", right: ar[q] });
      } else {
        for (var q = 0; q < rr.length; q++) merged.push({ type: "removed", left: rr[q] });
      }
    } else if (ops[k].type === "added") {
      var ar = [];
      while (k < ops.length && ops[k].type === "added") { ar.push(ops[k].right); k++ }
      if (k < ops.length && ops[k].type === "removed") {
        var rr = [];
        while (k < ops.length && ops[k].type === "removed") { rr.push(ops[k].left); k++ }
        var p = Math.min(rr.length, ar.length);
        for (var q = 0; q < p; q++) merged.push({ type: "modified", left: rr[q], right: ar[q] });
        for (var q = p; q < rr.length; q++) merged.push({ type: "removed", left: rr[q] });
        for (var q = p; q < ar.length; q++) merged.push({ type: "added", right: ar[q] });
      } else {
        for (var q = 0; q < ar.length; q++) merged.push({ type: "added", right: ar[q] });
      }
    } else {
      merged.push(ops[k]); k++
    }
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
  return '<div class="diff-line' + (wrapLines ? " wrap" : "") + ' ' + rc + '" data-left-no="' + (entry.leftNo || "") + '" data-right-no="' + (entry.rightNo || "") + '"><span class="line-no">' + ln + '</span><span class="line-content">' + (ch || "\u00a0") + '</span></div>'
}

function collapseUnchanged(diff) {
  if (!hideUnchanged) return diff;
  var r = [], eq = 0, eqb = [];
  for (var i = 0; i < diff.length; i++) { if (diff[i].type === "equal") { eq++; eqb.push(diff[i]) } else {    if (eq > 1) r.push({ type: "collapsed", count: eq, entries: eqb.slice() }); else if (eq > 0) r.push.apply(r, eqb); eq = 0; eqb = []; r.push(diff[i]) } }
  if (eq > 1) r.push({ type: "collapsed", count: eq, entries: eqb.slice() }); else if (eq > 0) r.push.apply(r, eqb);
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
  var totalLeft = 0, totalRight = 0;
  for (var i = 0; i < dd.length; i++) { if (dd[i].type !== "collapsed" && dd[i].type !== "added") totalLeft++; if (dd[i].type !== "collapsed" && dd[i].type !== "removed") totalRight++ }
  var sd = document.createElement("div"); sd.className = "split";
  var pL = document.createElement("div"); pL.className = "panel result-panel"; pL.style.height = "auto";
  var hL = document.createElement("div"); hL.className = "panel-header";
  var lL = document.createElement("span"); lL.innerHTML = '<span class="count-removed">' + rm + ' removal' + (rm === 1 ? "" : "s") + '</span> &middot; ' + totalLeft + ' lines'; hL.appendChild(lL);
  hL.appendChild(makeCopyBtn(rl)); pL.appendChild(hL);
  var pR = document.createElement("div"); pR.className = "panel result-panel"; pR.style.height = "auto";
  var hR = document.createElement("div"); hR.className = "panel-header";
  var lR = document.createElement("span"); lR.innerHTML = '<span class="count-added">' + ad + ' addition' + (ad === 1 ? "" : "s") + '</span> &middot; ' + totalRight + ' lines'; hR.appendChild(lR);
  hR.appendChild(makeCopyBtn(rr)); pR.appendChild(hR);
  var bL = document.createElement("div"); bL.className = "diff-body";
  var bR = document.createElement("div"); bR.className = "diff-body";
  var htmlL = "", htmlR = "";
  var EMPTY_ROW = '<div class="diff-line row-empty"><span class="line-no"></span><span class="line-content"></span></div>';
  for (var i = 0; i < dd.length; i++) {
    var entry = dd[i];
    if (entry.type === "collapsed") {
      var ed = encodeURIComponent(JSON.stringify(entry.entries));
      var col = '<div class="diff-line row-collapsed" data-entries="' + ed + '"><span class="line-no"></span><span class="line-content">\u2026 ' + entry.count + ' unchanged \u2026</span></div>';
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
  sd.appendChild(pL); sd.appendChild(pR);
  
  c.appendChild(sd);
}

function renderUnified(c, dd, rm, ad, rl, rr) {
  var totalLines = 0;
  for (var i = 0; i < dd.length; i++) if (dd[i].type !== "collapsed") totalLines++;
  var p = document.createElement("div"); p.className = "panel result-panel"; p.style.height = "auto"; p.style.flex = "1";
  var h = document.createElement("div"); h.className = "panel-header";
  var l = document.createElement("span"); l.innerHTML = '<span class="count-removed">' + rm + ' removal' + (rm === 1 ? "" : "s") + '</span> &middot; <span class="count-added">' + ad + ' addition' + (ad === 1 ? "" : "s") + '</span> &middot; ' + totalLines + ' lines';
  h.appendChild(l); h.appendChild(makeCopyBtn(rl + "\n---\n" + rr)); p.appendChild(h);
  var b = document.createElement("div"); b.className = "diff-body";
  for (var i = 0; i < dd.length; i++) {
    var e = dd[i];
    if (e.type === "collapsed") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-collapsed" data-entries="' + encodeURIComponent(JSON.stringify(e.entries)) + '"><span class="line-no"></span><span class="line-no-right"></span><span class="line-content">\u2026 ' + e.count + ' unchanged \u2026</span></div>');
    else if (e.type === "equal") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-equal"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + escapeHtml(e.left || "") + '</span></div>');
    else if (e.type === "removed") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-removed"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right"></span><span class="line-content">' + escapeHtml(e.left || "") + '</span></div>');
    else if (e.type === "added") b.insertAdjacentHTML("beforeend", '<div class="diff-line row-added"><span class="line-no"></span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + escapeHtml(e.right || "") + '</span></div>');
    else if (e.type === "modified") { var inner = computeInnerDiff(e.left, e.right); b.insertAdjacentHTML("beforeend", '<div class="diff-line row-modified row-modified-left"><span class="line-no">' + e.leftNo + '</span><span class="line-no-right"></span><span class="line-content">' + renderInnerHtml(inner.left, "left") + '</span></div><div class="diff-line row-modified row-modified-right"><span class="line-no"></span><span class="line-no-right">' + e.rightNo + '</span><span class="line-content">' + renderInnerHtml(inner.right, "right") + '</span></div>') }
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
  var r1 = ta1.value;
  var r2 = ta2.value;
  var l1 = splitLines(r1), l2 = splitLines(r2);
  var diff = computeLineDiff(l1, l2);
  renderResult(diff, r1, r2); updateCounts();
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

ta1.addEventListener("input", function () { 
  updateG1(); 
  if (au.checked) triggerDiff() 
});
ta2.addEventListener("input", function () { 
  updateG2(); 
  if (au.checked) triggerDiff() 
});
ta1.addEventListener("scroll", function () { 
  g1.scrollTop = ta1.scrollTop;
  if (g1.scrollLeft !== undefined) g1.scrollLeft = ta1.scrollLeft;
});
ta2.addEventListener("scroll", function () { 
  g2.scrollTop = ta2.scrollTop;
  if (g2.scrollLeft !== undefined) g2.scrollLeft = ta2.scrollLeft;
});

(function () {
  var master = null;
  ta1.addEventListener("mouseenter", function () { master = ta1 }); 
  ta1.addEventListener("touchstart", function () { master = ta1 });
  ta2.addEventListener("mouseenter", function () { master = ta2 }); 
  ta2.addEventListener("touchstart", function () { master = ta2 });
  
  ta1.addEventListener("scroll", function () { 
    if (master === ta1) { 
      ta2.scrollTop = ta1.scrollTop; 
      ta2.scrollLeft = ta1.scrollLeft; 
    } 
  });
  ta2.addEventListener("scroll", function () { 
    if (master === ta2) { 
      ta1.scrollTop = ta2.scrollTop; 
      ta1.scrollLeft = ta2.scrollLeft; 
    } 
  });
})();

updateG1(); updateG2(); updateCounts();

function setupFileUpload(iid, textAreaId, gutterId) {
  document.getElementById(iid).addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const textArea = document.getElementById(textAreaId);
    const dropMessage = textArea.parentElement.querySelector('.drop-message');
    handleFile(file, textArea, gutterId, dropMessage);
    e.target.value = "";
  });
}
setupFileUpload("file1", "text1", "gutter1");
setupFileUpload("file2", "text2", "gutter2");

var pb = document.querySelectorAll("#precisionControl .segment-btn");
pb.forEach(function (b) { b.addEventListener("click", function () { pb.forEach(function (x) { x.classList.remove("active") }); b.classList.add("active"); diffPrecision = b.getAttribute("data-val"); if (resultEl.innerHTML !== "" || au.checked) triggerDiff() }) });
(function() {
  var layoutBtns = document.querySelectorAll("#layoutSelector .theme-btn");
  var layoutIndicator = document.getElementById("layoutIndicator");

  function setLayout(val) {
    layoutMode = val;
    layoutIndicator.className = "theme-indicator" + (val === "unified" ? " dark" : " light");
    layoutBtns.forEach(function(b) {
      b.classList.toggle("active", b.getAttribute("data-val") === val);
    });
    if (resultEl.innerHTML !== "" || au.checked) triggerDiff();
  }

  layoutBtns.forEach(function(b) {
    b.addEventListener("click", function() {
      setLayout(b.getAttribute("data-val"));
    });
  });

  layoutIndicator.className = "theme-indicator" + (layoutMode === "unified" ? " dark" : " light");
  layoutBtns.forEach(function(b) {
    b.classList.toggle("active", b.getAttribute("data-val") === layoutMode);
  });
})();

document.getElementById("hideWhitespace").addEventListener("change", function (e) { hideWhitespace = e.target.checked; if (au.checked) triggerDiff() });
document.getElementById("ignoreCase").addEventListener("change", function (e) { ignoreCase = e.target.checked; if (au.checked) triggerDiff() });
document.getElementById("hideUnchanged").addEventListener("change", function (e) { hideUnchanged = e.target.checked; if (resultEl.innerHTML !== "") triggerDiff() });
document.getElementById("disableWrap").addEventListener("change", function (e) { wrapLines = !e.target.checked; document.querySelectorAll("textarea.input").forEach(function (t) { if (wrapLines) t.classList.add("wrap"); else t.classList.remove("wrap") }); if (resultEl.innerHTML !== "") triggerDiff() });

document.querySelectorAll(".transform-wrap .transform-btn").forEach(function (btn) {
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    var menu = this.parentElement.querySelector(".transform-menu");
    menu.classList.toggle("open");
  });
});

document.querySelectorAll(".transform-menu button").forEach(function (b) {
  b.addEventListener("click", function () {
    var menu = b.closest(".transform-menu");
    var wrap = menu.closest(".transform-wrap");
    var target = wrap.querySelector(".transform-btn").getAttribute("data-target");
    var action = b.getAttribute("data-action");
    applyTransform(target, action);
    menu.classList.remove("open");
  });
});

document.addEventListener("click", function (e) {
  document.querySelectorAll(".transform-menu.open").forEach(function (menu) {
    if (!menu.closest(".transform-wrap").contains(e.target)) {
      menu.classList.remove("open");
    }
  });
});

document.getElementById("swapBtn").addEventListener("click", function () { var v1 = ta1.value, v2 = ta2.value; ta1.value = v2; ta2.value = v1; updateG1(); updateG2(); updateCounts(); if (au.checked) triggerDiff() });
window.addEventListener("scroll", function () {
  var topBtns = document.querySelectorAll(".scroll-btn");
  if (window.scrollY > 200) {
    topBtns.forEach(function (b) { b.classList.add("visible") });
  } else {
    topBtns.forEach(function (b) { b.classList.remove("visible") });
  }
});
document.getElementById("clearBtn").addEventListener("click", function () { ta1.value = ""; ta2.value = ""; resultEl.innerHTML = ""; updateG1(); updateG2(); updateCounts(); navBar.style.display = "none"; exitMergeMode() });
document.getElementById("findBtn").addEventListener("click", function() {
  var modal = document.getElementById('donateModal');
  if (modal && !window.hasShownDonate) {
    modal.style.display = 'block';
    window.hasShownDonate = true;
  }
  triggerDiff();
});

(function() {
  var savedTheme = localStorage.getItem("diffscan-theme") || "light";
  var indicator = document.getElementById("themeIndicator");
  var btns = document.querySelectorAll("#themeSelector .theme-btn");
  if (!indicator || !btns.length) return;

  function applyTheme(theme) {
    var isDark = theme === "dark";
    document.body.classList.toggle("dark", isDark);
    localStorage.setItem("diffscan-theme", theme);
    indicator.className = "theme-indicator" + (isDark ? " dark" : " light");
    btns.forEach(function(b) {
      b.classList.toggle("active", b.getAttribute("data-theme") === theme);
    });
  }

  applyTheme(savedTheme);

  btns.forEach(function(b) {
    b.addEventListener("click", function() {
      applyTheme(b.getAttribute("data-theme"));
    });
  });
})();

document.addEventListener("click", function (e) { if (e.target.id === "navFirst") goFirst(); if (e.target.id === "navPrev") goPrev(); if (e.target.id === "navNext") goNext(); if (e.target.id === "navLast") goLast() });

var mergeMode = false;
var activeMergeLine = null;
var workingText1 = "";
var workingText2 = "";

function syncMergeUI(isOn) {
  var indicator = document.getElementById("mergeIndicator");
  var btns = document.querySelectorAll("#mergeSelector .theme-btn");
  if (!indicator) return;
  indicator.className = "theme-indicator" + (isOn ? " dark" : " light");
  btns.forEach(function(b) {
    b.classList.toggle("active", (b.getAttribute("data-val") === "on") === isOn);
  });
}

(function() {
  var mergeBtns = document.querySelectorAll("#mergeSelector .theme-btn");
  mergeBtns.forEach(function(b) {
    b.addEventListener("click", function() {
      var val = b.getAttribute("data-val");
      if (val === "on" && !mergeMode) enterMergeMode();
      else if (val === "off" && mergeMode) exitMergeMode();
    });
  });
  syncMergeUI(mergeMode);
})();

// Оптимизация: убраны inline-стили, состояние active управляется CSS-классом
function enterMergeMode() {
  mergeMode = true;
  syncMergeUI(true);
  resultEl.classList.add("merge-mode");
  activeMergeLine = null;
  triggerDiff();
}

function exitMergeMode() {
  mergeMode = false;
  syncMergeUI(false);
  resultEl.classList.remove("merge-mode");
  activeMergeLine = null;
  clearMergeButtons();
  triggerDiff();
}

// Оптимизация: один вызов classList.remove с несколькими аргументами вместо трёх
function clearMergeButtons() {
  document.querySelectorAll(".merge-toolbar-floating").forEach(function (t) { t.remove() });
  document.querySelectorAll(".merge-selected").forEach(function (r) {
    r.classList.remove("merge-selected", "merge-block-top", "merge-block-bottom");
  });
}

function getPanelSide(line) {
  if (layoutMode === "unified") {
    if (line.classList.contains("row-removed") || line.classList.contains("row-modified-left")) return "left";
    if (line.classList.contains("row-added") || line.classList.contains("row-modified-right")) return "right";
  }
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
  else if (isModified) {
    if (layoutMode === "unified") {
      var sideCls = isLeft ? "row-modified-left" : "row-modified-right";
      block = getBlock(sideCls);
    } else {
      block = getBlock("row-modified");
    }
  }
  else return;

  block[0].classList.add("merge-block-top");
  block[block.length - 1].classList.add("merge-block-bottom");
  block.forEach(function (l) { l.classList.add("merge-selected"); });

  // Функция для получения номера строки из элемента
  function getLineNo(el, side) {
    if (!el) return null;
    var val = (side === "left") ? el.dataset.leftNo : el.dataset.rightNo;
    var num = parseInt(val, 10);
    return isNaN(num) || num === 0 ? null : num;
  }

  var firstLn = getLineNo(block[0], isLeft ? "left" : "right");
  var lastLn = getLineNo(block[block.length-1], isLeft ? "left" : "right");
  
  // Если не нашли прямым способом, попробуем взять хотя бы что-то из DOM
  if (!firstLn) firstLn = parseInt(block[0].dataset.leftNo || block[0].dataset.rightNo, 10);
  if (!lastLn) lastLn = parseInt(block[block.length-1].dataset.leftNo || block[block.length-1].dataset.rightNo, 10);

  var label;
  if (!firstLn && !lastLn) {
    label = "Selected lines";
  } else if (!lastLn || firstLn === lastLn) {
    label = "Line " + (firstLn || lastLn) + " selected";
  } else {
    label = "Lines " + firstLn + "-" + lastLn + " selected";
  }
  var targetSide = isLeft ? "right" : "left";

  var toolbar = document.createElement("div");
  toolbar.className = "merge-toolbar-floating";

  var labelSpan = document.createElement("span");
  labelSpan.className = "toolbar-label";
  labelSpan.textContent = label;
  var btn = document.createElement("button");
  btn.className = "merge-btn " + (targetSide === "left" ? "to-left" : "to-right");
  
  var targetName = (targetSide === "left") ? "Original" : "Changed";
  btn.textContent = "Merge → " + targetName;
  
  btn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    doMergeBlock(block, targetSide, isModified);
  });

  var closeBtn = document.createElement("button");
  closeBtn.className = "merge-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Cancel";
  closeBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    clearMergeButtons();
    activeMergeLine = null;
  });

  toolbar.appendChild(labelSpan);
  toolbar.appendChild(btn);
  toolbar.appendChild(closeBtn);

  resultEl.style.position = "relative";
  resultEl.appendChild(toolbar);

  var firstRect = block[0].getBoundingClientRect();
  var resRect = resultEl.getBoundingClientRect();
  
  // Рассчитываем координаты относительно контейнера resultEl
  var blockTop = firstRect.top - resRect.top + resultEl.scrollTop;
  var toolbarLeft;
  
  if (layoutMode !== "unified") {
    var split = block[0].closest(".split");
    if (split) {
      var splitRect = split.getBoundingClientRect();
      var splitCenter = splitRect.left + splitRect.width / 2;
      toolbarLeft = splitCenter - resRect.left;
    } else {
      toolbarLeft = (firstRect.left - resRect.left) + firstRect.width / 2;
    }
  } else {
    toolbarLeft = (firstRect.left - resRect.left) + firstRect.width / 2;
  }

  toolbar.style.top = (blockTop - 40) + "px";
  toolbar.style.left = toolbarLeft + "px";
  toolbar.style.transform = "translateX(-50%)";
}

// Оптимизация: используем кэшированный resultEl
resultEl.addEventListener("click", function (e) {
  if (!mergeMode) return;
  if (e.target.classList && (e.target.classList.contains("merge-btn") || e.target.classList.contains("merge-close-btn"))) return;
  var line = e.target.closest(".diff-line");
  if (!line) return;
  var cls = line.className;
  if (cls.indexOf("row-equal") !== -1 || cls.indexOf("row-empty") !== -1 || cls.indexOf("row-collapsed") !== -1) return;
  if (activeMergeLine === line) { clearMergeButtons(); activeMergeLine = null; return }
  showMergeButtons(line)
});

resultEl.addEventListener("click", function (e) {
  var row = e.target.closest(".row-collapsed");
  if (!row) return;
  var ed = row.getAttribute("data-entries");
  if (!ed) return;
  var entries = JSON.parse(decodeURIComponent(ed));
  var isUnified = layoutMode === "unified";
  var side = "left";
  if (!isUnified) {
    var split = row.closest(".split");
    if (split) {
      var panels = split.querySelectorAll(".result-panel");
      if (panels.length >= 2 && row.closest(".result-panel") === panels[1]) side = "right";
    }
  }
  var html = "";
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (isUnified) {
      html += '<div class="diff-line row-equal"><span class="line-no">' + entry.leftNo + '</span><span class="line-no-right">' + entry.rightNo + '</span><span class="line-content">' + escapeHtml(entry.left || "") + '</span></div>';
    } else {
      var ln = side === "left" ? entry.leftNo : entry.rightNo;
      var text = side === "left" ? entry.left : entry.right;
      html += '<div class="diff-line row-equal" data-left-no="' + entry.leftNo + '" data-right-no="' + entry.rightNo + '"><span class="line-no">' + ln + '</span><span class="line-content">' + escapeHtml(text || "") + '</span></div>';
    }
  }
  row.outerHTML = html;
});

function doMergeBlock(block, targetSide, isModified) {
  var targetTa, targetGutterId, targetId;
  if (targetSide === "right") {
    targetTa = ta2; targetGutterId = "gutter2"; targetId = "text2";
  } else {
    targetTa = ta1; targetGutterId = "gutter1"; targetId = "text1";
  }

  var blockText = block.map(function (l) {
    var contentEl = l.querySelector(".line-content");
    if (!contentEl) return "";
    var clone = contentEl.cloneNode(true);
    var btn = clone.querySelector(".merge-btn");
    if (btn) btn.remove();
    var t = clone.textContent;
    return t === "\u00a0" ? "" : t;
  }).join("\n");

  var firstLine = block[0];
  var lineNo = parseInt(firstLine.dataset.leftNo, 10) || 0;
  var lineNoRight = parseInt(firstLine.dataset.rightNo, 10) || 0;

  var dstLines = splitLines(targetTa.value);
  var insertIndex = 0;

  if (isModified) {
    // For modified lines, we replace the exact line
    var targetLineNo = (targetSide === "right") ? lineNoRight : lineNo;
    insertIndex = targetLineNo > 0 ? targetLineNo - 1 : 0;
  } else {
    // For added/removed lines, find the last valid line number of the target side before this block
    var search = firstLine.previousElementSibling;
    var lastValidNo = 0;
    while (search) {
      var val = (targetSide === "right") ? search.dataset.rightNo : search.dataset.leftNo;
      if (val && parseInt(val, 10) > 0) {
        lastValidNo = parseInt(val, 10);
        break;
      }
      search = search.previousElementSibling;
    }
    insertIndex = lastValidNo;
  }

  if (insertIndex > dstLines.length) insertIndex = dstLines.length;

  if (insertIndex === 0 && !isModified && block[0].classList.contains("row-added") && targetSide === "left") {
    insertIndex = dstLines.length;
  }

  if (insertIndex > dstLines.length) insertIndex = dstLines.length;

  var deleteCount = 0;
  if (isModified) {
    if (layoutMode === "unified") {
      // In unified mode, we need to count lines of the TARGET side in the same modification chunk
      var targetCls = (targetSide === "left") ? "row-modified-left" : "row-modified-right";
      var count = 0;
      var curr = block[0];
      // Look back and forward for all lines in the same modification chunk
      // First, find the start of the modification block
      while (curr && curr.classList.contains("row-modified")) {
        if (curr.classList.contains(targetCls)) count++;
        curr = curr.previousElementSibling;
      }
      // We went too far, but we need to check the others. 
      // Actually, simpler: search from the first line of the block onwards 
      // and backwards until we hit a non-row-modified line.
      var totalTargetLines = 0;
      var search = block[0];
      // Search backwards
      while (search && search.classList.contains("row-modified")) {
        if (search.classList.contains(targetCls)) totalTargetLines++;
        search = search.previousElementSibling;
      }
      // Search forwards
      search = block[block.length - 1].nextElementSibling;
      while (search && search.classList.contains("row-modified")) {
        if (search.classList.contains(targetCls)) totalTargetLines++;
        search = search.nextElementSibling;
      }
      deleteCount = totalTargetLines;
    } else {
      deleteCount = block.length;
    }
  }

  var args = [insertIndex, deleteCount].concat(blockText.split("\n"));
  Array.prototype.splice.apply(dstLines, args);

  targetTa.value = dstLines.join("\n");
  updateInputGutter(targetId, targetGutterId);
  updateCounts();
  triggerDiff();
  clearMergeButtons();
  activeMergeLine = null
}

async function handleFile(file, textArea, gutterId, dropMessage) {
  if (file.size > 104857600) { alert("File is too large."); return; }
  
  if (file.name.toLowerCase().endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    mammoth.extractRawText({arrayBuffer: arrayBuffer})
      .then(function(result) {
        textArea.value = result.value;
        updateInputGutter(textArea.id, gutterId);
        updateCounts();
        if (au.checked) triggerDiff();
        if (dropMessage) dropMessage.classList.add('hidden');
      })
      .catch(function(err) { alert("Error reading docx: " + err.message); });
  } else {
    const r = new FileReader();
    r.onload = (ev) => {
      textArea.value = ev.target.result;
      updateInputGutter(textArea.id, gutterId);
      updateCounts();
      if (au.checked) triggerDiff();
      if (dropMessage) dropMessage.classList.add('hidden');
    };
    r.readAsText(file);
  }
}

function setupDropZone(dropZoneId, textAreaId, gutterId) {
  const dropZone = document.getElementById(dropZoneId);
  const textArea = document.getElementById(textAreaId);
  const dropMessage = dropZone.querySelector('.drop-message');
  const panel = dropZone.closest('.panel');
  const fileInput = panel.querySelector('input[type="file"]');

  dropMessage.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0], textArea, gutterId, dropMessage);
    }
  });

  textArea.addEventListener('input', () => {
    if (textArea.value.trim() !== "") dropMessage.classList.add('hidden');
    else dropMessage.classList.remove('hidden');
  });
}

setupDropZone("dropZone1", "text1", "gutter1");
setupDropZone("dropZone2", "text2", "gutter2");

document.getElementById("toggleSettings").addEventListener("click", function () {
  var bar = document.getElementById("settingsBar");
  bar.classList.toggle("collapsed");
});

document.getElementById("settingsOverlay").addEventListener("click", function () {
  var bar = document.getElementById("settingsBar");
  bar.classList.add("collapsed");
});

document.getElementById("pinSettings").addEventListener("click", function () {
  this.classList.toggle("pinned");
  document.getElementById("settingsBar").classList.toggle("pinned");
});

document.getElementById("closeSettings").addEventListener("click", function () {
  document.getElementById("settingsBar").classList.add("collapsed");
});

document.addEventListener("click", function (e) {
  var bar = document.getElementById("settingsBar");
  if (bar.classList.contains("collapsed")) return;
  if (bar.classList.contains("pinned")) return;
  if (bar.contains(e.target)) return;
  bar.classList.add("collapsed");
});

(function() {
  var bar = document.getElementById("settingsBar");
  var pinBtn = document.getElementById("pinSettings");
  if (window.innerWidth <= 760) {
    bar.classList.add("collapsed");
  } else {
    bar.classList.add("pinned");
    if (pinBtn) pinBtn.classList.add("pinned");
  }
})();
