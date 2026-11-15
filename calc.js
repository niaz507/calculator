/* Calculator engine. No DOM. Used by the page and by node tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SYM = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  var MAX_DIGITS = 12;
  var TAPE_LIMIT = 50;

  function tidy(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return n;
    var p = Number(n.toPrecision(12));
    return Object.is(p, -0) ? 0 : p;
  }

  function evalBinary(op, a, b) {
    if (op === "/" && b === 0) return { ok: false, error: "divide-by-zero" };
    var v;
    if (op === "+") v = a + b;
    else if (op === "-") v = a - b;
    else if (op === "*") v = a * b;
    else if (op === "/") v = a / b;
    else return { ok: false, error: "invalid" };
    if (!Number.isFinite(v)) return { ok: false, error: "overflow" };
    return { ok: true, value: v };
  }

/* complete() keeps full precision for the next operation.
   finish() rounds for a standalone answer. */
function complete(result) {
  if (!result || !result.ok) return result;
  if (!Number.isFinite(result.value) || Math.abs(result.value) > 1e15) {
    return { ok: false, error: "overflow" };
  }
  return { ok: true, value: result.value };
}

function finish(result) {
  var done = complete(result);
  if (!done || !done.ok) return done;
  return { ok: true, value: tidy(done.value) };
}

  /* Precedence: * and / bind tighter than + and -. Left associative. */
  function evaluateTokens(tokens) {
    var i = 0;
    function peek() { return tokens[i]; }
    function parseExpr() {
      var left = parseTerm();
      if (!left.ok) return left;
      while (peek() && peek().type === "op" && (peek().op === "+" || peek().op === "-")) {
        var op = tokens[i++].op;
        var right = parseTerm();
        if (!right.ok) return right;
        left = evalBinary(op, left.value, right.value);
        if (!left.ok) return left;
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      if (!left.ok) return left;
      while (peek() && peek().type === "op" && (peek().op === "*" || peek().op === "/")) {
        var op = tokens[i++].op;
        var right = parseUnary();
        if (!right.ok) return right;
        left = evalBinary(op, left.value, right.value);
        if (!left.ok) return left;
      }
      return left;
    }
    function parseUnary() {
      if (peek() && peek().type === "unary") {
        i++;
        var inner = parseUnary();
        if (!inner.ok) return inner;
        return { ok: true, value: -inner.value };
      }
      if (!peek() || peek().type !== "num") return { ok: false, error: "invalid" };
      return { ok: true, value: tokens[i++].value };
    }
    if (!tokens || !tokens.length) return { ok: true, value: 0 };
    var result = parseExpr();
    if (!result.ok) return result;
    if (i !== tokens.length) return { ok: false, error: "invalid" };
    return result;
  }

  function evalLeftToRight(tokens) {
    if (!tokens.length || tokens[0].type !== "num") return { ok: false, error: "invalid" };
    var acc = tokens[0].value;
    for (var i = 1; i < tokens.length; i += 2) {
      var op = tokens[i];
      var rhs = tokens[i + 1];
      if (!op || op.type !== "op" || !rhs || rhs.type !== "num") {
        return { ok: false, error: "invalid" };
      }
      var step = evalBinary(op.op, acc, rhs.value);
      if (!step.ok) return step;
      acc = step.value;
    }
    return { ok: true, value: acc };
  }

  function formatExponential(v) {
    var s = v.toExponential(4);
    s = s.replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/, "e").replace("e+", "e");
    return s;
  }

  function formatNumber(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "Error";
    var v = tidy(n);
    if (Object.is(v, -0) || v === 0) return "0";
    var abs = Math.abs(v);
    if (abs >= 1e12 || abs < 1e-6) return formatExponential(v);
    var neg = v < 0;
    var s = abs.toString();
    if (s.indexOf("e") !== -1) {
      s = abs.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
    }
    var bits = s.split(".");
    var grouped = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var body = bits.length > 1 ? grouped + "." + bits[1] : grouped;
    return (neg ? "−" : "") + body;
  }

function formatEntry(s) {
  if (s == null || s === "") return "0";
  if (String(s).indexOf("e") !== -1 || String(s).indexOf("E") !== -1) {
    var exp = Number(s);
    return Number.isFinite(exp) ? formatNumber(exp) : "0";
  }
  var neg = false;
    var x = String(s);
    if (x.charAt(0) === "-") {
      neg = true;
      x = x.slice(1);
    }
    if (x === "") x = "0";
    var trailingDot = x.charAt(x.length - 1) === "." && x.indexOf(".") === x.length - 1;
    var parts = x.split(".");
    var intPart = parts[0] || "0";
    var frac = parts.length > 1 ? parts[1] : null;
    intPart = intPart.replace(/^0+(?=\d)/, "");
    if (intPart === "") intPart = "0";
    var grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var body = grouped;
    if (frac !== null) body += "." + frac;
    else if (trailingDot) body += ".";
    return (neg ? "−" : "") + body;
  }

  function errorMessage(code) {
    if (code === "divide-by-zero") return "Can't divide by zero";
    if (code === "overflow") return "Too long to show";
    return "Can't do that";
  }

  function renderItems(tokens) {
    var out = "";
    tokens.forEach(function (t, index) {
      if (t.type === "op") {
        out += " " + SYM[t.op] + " ";
        return;
      }
      var label = t.label || formatNumber(t.value);
      var prev = tokens[index - 1];
      if (prev && prev.type === "op" && label.charAt(0) === "−") label = "(" + label + ")";
      out += label;
    });
    return out.trim();
  }

  function grouped(tokens) {
    var terms = [];
    var cur = [];
    var ops = [];
    tokens.forEach(function (t) {
      if (t.type === "op" && (t.op === "+" || t.op === "-") && cur.length) {
        terms.push(cur);
        ops.push(t.op);
        cur = [];
      } else {
        cur.push(t);
      }
    });
    if (cur.length) terms.push(cur);
    var rendered = terms.map(function (term) {
      var s = "";
      var afterOp = false;
      term.forEach(function (t) {
        if (t.type === "op") {
          s += " " + SYM[t.op] + " ";
          afterOp = true;
        } else {
          var n = formatNumber(t.value);
          s += afterOp && n.charAt(0) === "−" ? "(" + n + ")" : n;
          afterOp = false;
        }
      });
      s = s.trim();
      if (terms.length > 1 && term.length > 1) return "(" + s + ")";
      return s;
    });
    var text = rendered[0] || "";
    for (var i = 0; i < ops.length; i++) {
      text += " " + SYM[ops[i]] + " " + rendered[i + 1];
    }
    return text;
  }

  function percentNote(tokens) {
    var notes = [];
    tokens.forEach(function (t) {
      if (t.type === "num" && t.percentOf != null && t.percentText) {
        notes.push(t.percentText + " of " + formatNumber(t.percentOf));
      }
    });
    return notes.join(" · ");
  }

  function readingFor(tokens) {
    if (!tokens || tokens.length < 2) return percentNote(tokens || []);
    var prec = finish(evaluateTokens(tokens));
    var ltr = finish(evalLeftToRight(tokens));
    var note = percentNote(tokens);
    var read = "";
    if (prec.ok && ltr.ok && prec.value !== ltr.value) read = "Read as " + grouped(tokens);
    if (read && note) return read + " · " + note;
    return read || note;
  }

  function normalizeInput(input) {
    return String(input)
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/\s+/g, "");
  }

  function tokenize(input) {
    var s = normalizeInput(input);
    var tokens = [];
    var i = 0;
    function prev() { return tokens.length ? tokens[tokens.length - 1] : null; }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === "(") { tokens.push({ type: "lp" }); i++; continue; }
      if (c === ")") { tokens.push({ type: "rp" }); i++; continue; }
      if (c === "+" || c === "*" || c === "/") {
        tokens.push({ type: "op", op: c });
        i++;
        continue;
      }
      if (c === "-") {
        var p = prev();
        var unary = !p || p.type === "op" || p.type === "unary" || p.type === "lp";
        if (!unary) { tokens.push({ type: "op", op: "-" }); i++; continue; }
        if (s.charAt(i + 1) === "(") { tokens.push({ type: "unary" }); i++; continue; }
      }
      var j = i;
      if (s.charAt(j) === "-") j++;
      var startDigits = j;
      var dot = false;
      var digit = false;
      while (j < s.length && /[0-9.]/.test(s.charAt(j))) {
        if (s.charAt(j) === ".") {
          if (dot) return null;
          dot = true;
        } else digit = true;
        j++;
      }
      if (!digit || startDigits === j) return null;
      var percent = false;
      if (s.charAt(j) === "%") { percent = true; j++; }
      var raw = s.slice(i, percent ? j - 1 : j);
      var value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({
        type: "num",
        value: value,
        percent: percent,
        label: percent ? formatEntry(raw) + "%" : formatEntry(raw)
      });
      i = j;
    }
    return tokens;
  }

  function resolveFlatPercents(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.type === "num" && t.percent) {
        var prev = out.length ? out[out.length - 1] : null;
        var op = prev && prev.type === "op" ? prev.op : null;
        var value;
        var percentOf = null;
if (op === "+" || op === "-") {
        var lhs = complete(evaluateTokens(out.slice(0, -1)));
        if (!lhs.ok) return lhs;
        value = lhs.value * (t.value / 100);
        percentOf = lhs.value;
        } else {
          value = t.value / 100;
        }
        var text = (t.label && t.label.charAt(t.label.length - 1) === "%")
          ? t.label
          : formatEntry(String(t.value)) + "%";
        out.push({
          type: "num",
          value: value,
          label: text,
          percentOf: percentOf,
          percentText: text
        });
      } else if (t.type === "lp" || t.type === "rp" || t.type === "unary") {
        return { ok: false, error: "invalid" };
      } else {
        out.push(t);
      }
    }
    return { ok: true, tokens: out };
  }

  function hasParens(tokens) {
    return tokens.some(function (t) { return t.type === "lp" || t.type === "rp" || t.type === "unary"; });
  }

  function evaluateParen(tokens) {
    var i = 0;
    function peek() { return tokens[i]; }
    function parseExpr() {
      var left = parseTerm();
      if (!left.ok) return left;
      while (peek() && peek().type === "op" && (peek().op === "+" || peek().op === "-")) {
        var op = tokens[i++].op;
        var right = parseTerm();
        if (!right.ok) return right;
        left = evalBinary(op, left.value, right.value);
        if (!left.ok) return left;
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      if (!left.ok) return left;
      while (peek() && peek().type === "op" && (peek().op === "*" || peek().op === "/")) {
        var op = tokens[i++].op;
        var right = parseUnary();
        if (!right.ok) return right;
        left = evalBinary(op, left.value, right.value);
        if (!left.ok) return left;
      }
      return left;
    }
    function parseUnary() {
      if (peek() && peek().type === "unary") {
        i++;
        var inner = parseUnary();
        if (!inner.ok) return inner;
        return { ok: true, value: -inner.value };
      }
      return parsePrimary();
    }
    function parsePrimary() {
      var t = peek();
      if (!t) return { ok: false, error: "invalid" };
      if (t.type === "lp") {
        i++;
        var inner = parseExpr();
        if (!inner.ok) return inner;
        if (!peek() || peek().type !== "rp") return { ok: false, error: "invalid" };
        i++;
        if (peek() && peek().type === "num" && peek().percent && String(peek().label).charAt(0) === "%") {
          /* bare % token not used */
        }
        return maybePercent(inner.value, false);
      }
      if (t.type === "num") {
        i++;
        var value = t.percent ? t.value / 100 : t.value;
        return { ok: true, value: value };
      }
      return { ok: false, error: "invalid" };
    }
    function maybePercent(value) { return { ok: true, value: value }; }
    var result = parseExpr();
    if (!result.ok) return result;
    if (i !== tokens.length) return { ok: false, error: "invalid" };
    return result;
  }

  function evaluate(input) {
    if (Array.isArray(input)) return finish(evaluateTokens(input));
    if (input == null || String(input).trim() === "") return { ok: true, value: 0 };
    var tokens = tokenize(input);
    if (!tokens) return { ok: false, error: "invalid" };
    if (!tokens.length) return { ok: true, value: 0 };
    if (hasParens(tokens)) return finish(evaluateParen(tokens));
    var resolved = resolveFlatPercents(tokens);
    if (!resolved.ok) return resolved;
    return finish(evaluateTokens(resolved.tokens));
  }

  function digitCount(s) {
    var m = String(s).match(/\d/g);
    return m ? m.length : 0;
  }

  function toEntryString(n) {
    var v = tidy(n);
    if (!Number.isFinite(v) || Object.is(v, -0) || v === 0) return "0";
    var s = String(v);
    if (s.indexOf("e") === -1) return s;
    var abs = Math.abs(v);
    if (abs >= 1e12 || abs < 1e-6) return s;
    return abs.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  }

  function parseEntry(s) {
    if (s == null) return null;
    if (!/[0-9]/.test(s)) return null;
    var n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function toggleSignString(s) {
    if (s.charAt(0) === "-") {
      var rest = s.slice(1);
      return rest === "" ? "0" : rest;
    }
    return "-" + s;
  }

  function createCalculator() {
    var tokens = [];
    var entry = null;
    var entryMeta = null;
    var entryClosed = false;
    var error = null;
    var justEvaluated = false;
    var heldExpression = "";
    var heldReading = "";
    var lastRepeat = null;
    var tape = [];

    function resetWork() {
      tokens = [];
      entry = null;
      entryMeta = null;
      entryClosed = false;
      error = null;
      justEvaluated = false;
      heldExpression = "";
      heldReading = "";
      lastRepeat = null;
    }

    function liveTokens() {
      var list = tokens.slice();
      if (entry != null && parseEntry(entry) != null && !String(entry).endsWith(".")) {
        var node = {
          type: "num",
          value: parseEntry(entry),
          label: entryMeta ? entryMeta.label : formatEntry(entry)
        };
        if (entryMeta && entryMeta.percentOf != null) {
          node.percentOf = entryMeta.percentOf;
          node.percentText = entryMeta.percentText;
        }
        list.push(node);
      }
      return list;
    }

    function expressionNow() {
      var list = tokens.slice();
      if (entry != null) {
        list.push({
          type: "num",
          value: parseEntry(entry) == null ? 0 : parseEntry(entry),
          label: entryMeta ? entryMeta.label : formatEntry(entry)
        });
      }
      return renderItems(list);
    }

    function commitEntry() {
      var n = parseEntry(entry);
      if (n == null) return false;
      var node = {
        type: "num",
        value: n,
        label: entryMeta ? entryMeta.label : formatEntry(entry)
      };
      if (entryMeta && entryMeta.percentOf != null) {
        node.percentOf = entryMeta.percentOf;
        node.percentText = entryMeta.percentText;
      }
      tokens.push(node);
      entry = null;
      entryMeta = null;
      entryClosed = false;
      return true;
    }

    function pushTape(expression, reading, value) {
      tape.push({
        expression: expression,
        reading: reading,
        result: formatNumber(value),
        value: value
      });
      if (tape.length > TAPE_LIMIT) tape.shift();
    }

    function finishEquals(exprTokens) {
      var result = complete(evaluateTokens(exprTokens));
      var expression = renderItems(exprTokens);
      var reading = result.ok ? readingFor(exprTokens) : "";
      if (!result.ok) {
        error = result.error;
        heldExpression = expression;
        heldReading = "";
        return;
      }
      var hasOp = exprTokens.some(function (t) { return t.type === "op"; });
      var hasPct = exprTokens.some(function (t) { return t.percentText; });
      if ((hasOp || hasPct) && exprTokens.length > 1) pushTape(expression, reading, result.value);
      else if (hasPct) pushTape(expression, reading, result.value);
      var rep = null;
      for (var i = exprTokens.length - 1; i >= 0; i--) {
        if (exprTokens[i].type === "op" && exprTokens[i + 1] && exprTokens[i + 1].type === "num") {
          rep = { op: exprTokens[i].op, value: exprTokens[i + 1].value };
          break;
        }
      }
      lastRepeat = hasOp ? rep : null;
      tokens = [{ type: "num", value: result.value, label: formatNumber(result.value) }];
      entry = null;
      entryMeta = null;
      entryClosed = false;
      justEvaluated = true;
      heldExpression = (hasOp || hasPct) ? expression : "";
      heldReading = (hasOp || hasPct) ? reading : "";
      error = null;
    }

    function draftTokens() {
      var list = tokens.slice();
      if (entry != null) {
        if (String(entry).endsWith(".") || parseEntry(entry) == null) return null;
        var node = {
          type: "num",
          value: parseEntry(entry),
          label: entryMeta ? entryMeta.label : formatEntry(entry)
        };
        if (entryMeta && entryMeta.percentOf != null) {
          node.percentOf = entryMeta.percentOf;
          node.percentText = entryMeta.percentText;
        }
        list.push(node);
      } else if (list.length && list[list.length - 1].type === "op") {
        var lastNum = null;
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i].type === "num") { lastNum = list[i]; break; }
        }
        if (!lastNum) return null;
        list.push({ type: "num", value: lastNum.value, label: formatNumber(lastNum.value) });
      }
      return list;
    }

    function beginFreshIfNeeded(kind) {
      if (!error && !justEvaluated && !entryClosed) return;
      if (error || justEvaluated) {
        if (kind === "digit" || kind === "dot") {
          tokens = [];
          entry = null;
          entryMeta = null;
          entryClosed = false;
          error = null;
          justEvaluated = false;
          heldExpression = "";
          heldReading = "";
          lastRepeat = null;
        }
      }
      if (entryClosed && (kind === "digit" || kind === "dot")) {
        entry = null;
        entryMeta = null;
        entryClosed = false;
      }
    }

    function pressDigit(d) {
      beginFreshIfNeeded("digit");
      if (error) return;
      if (entry == null) {
        entry = d;
        entryMeta = null;
        return;
      }
      if ((entry === "0" || entry === "-0") && d === "0") return;
      if (entry === "0") { entry = d; return; }
      if (entry === "-0") { entry = "-" + d; return; }
      if (digitCount(entry) >= MAX_DIGITS) return;
      entry += d;
    }

    function pressDot() {
      beginFreshIfNeeded("dot");
      if (error) return;
      if (entry == null) { entry = "0."; return; }
      if (entry.indexOf(".") !== -1) return;
      if (digitCount(entry) >= MAX_DIGITS) return;
      entry += ".";
    }

    function pressOperator(op) {
      if (error) {
        resetWork();
        tokens = [{ type: "num", value: 0, label: "0" }, { type: "op", op: op }];
        return;
      }
      if (justEvaluated) {
        justEvaluated = false;
        heldExpression = "";
        heldReading = "";
        entry = null;
        entryMeta = null;
        entryClosed = false;
      }
      if (entry != null) {
        if (parseEntry(entry) == null || entry === "-" || entry === "." || entry === "-.") return;
        commitEntry();
      }
      if (!tokens.length) tokens.push({ type: "num", value: 0, label: "0" });
      if (tokens[tokens.length - 1].type === "op") tokens[tokens.length - 1] = { type: "op", op: op };
      else tokens.push({ type: "op", op: op });
      lastRepeat = null;
    }

    function pressPercent() {
      if (error) return;
      var n;
      var typed;
      if (justEvaluated && entry == null && tokens.length === 1 && tokens[0].type === "num") {
        n = tokens[0].value;
        typed = formatNumber(n);
        tokens = [];
        justEvaluated = false;
        heldExpression = "";
        heldReading = "";
      } else if (entry != null && parseEntry(entry) != null && !String(entry).endsWith(".")) {
        n = parseEntry(entry);
        typed = entryMeta ? entryMeta.label : formatEntry(entry);
      } else if (entry == null && tokens.length && tokens[tokens.length - 1].type === "op") {
        var lhsOnly = complete(evaluateTokens(tokens.slice(0, -1)));
        if (!lhsOnly.ok) { error = lhsOnly.error; return; }
        n = lhsOnly.value;
        typed = formatNumber(n);
      } else if (entry == null && tokens.length && tokens[tokens.length - 1].type === "num") {
        n = tokens[tokens.length - 1].value;
        typed = tokens[tokens.length - 1].label || formatNumber(n);
        tokens.pop();
      } else {
        return;
      }
      var prev = tokens.length ? tokens[tokens.length - 1] : null;
      var op = prev && prev.type === "op" ? prev.op : null;
      var value;
      var percentOf = null;
      if (op === "+" || op === "-") {
        var lhs = complete(evaluateTokens(tokens.slice(0, -1)));
        if (!lhs.ok) { error = lhs.error; heldExpression = expressionNow(); return; }
        value = lhs.value * (n / 100);
        percentOf = lhs.value;
      } else {
        value = n / 100;
      }
      if (!Number.isFinite(value) || Math.abs(value) > 1e15) {
        error = "overflow";
        heldExpression = expressionNow();
        return;
      }
      var text = /%$/.test(typed) ? typed : typed + "%";
      entry = toEntryString(value);
      entryMeta = { label: text, percentText: text, percentOf: percentOf };
      entryClosed = true;
      justEvaluated = false;
    }

    function pressSign() {
      if (error) return;
      if (justEvaluated && tokens.length === 1 && tokens[0].type === "num") {
        entry = toggleSignString(toEntryString(tokens[0].value));
        tokens = [];
        justEvaluated = false;
        heldExpression = "";
        heldReading = "";
        lastRepeat = null;
        entryMeta = null;
        entryClosed = false;
        return;
      }
      if (entry != null) {
        entry = toggleSignString(entry);
        entryMeta = null;
        return;
      }
      entry = "-0";
      entryMeta = null;
    }

    function pressBack() {
      if (error) {
        error = null;
        heldExpression = "";
        heldReading = "";
      }
      if (justEvaluated) {
        entry = toEntryString(tokens[0] ? tokens[0].value : 0);
        entry = entry.slice(0, -1);
        if (entry === "" || entry === "-") entry = null;
        tokens = [];
        justEvaluated = false;
        heldExpression = "";
        heldReading = "";
        lastRepeat = null;
        entryMeta = null;
        entryClosed = false;
        return;
      }
      if (entry != null) {
        entryMeta = null;
        entryClosed = false;
        entry = entry.slice(0, -1);
        if (entry === "" || entry === "-") entry = null;
        return;
      }
      if (tokens.length && tokens[tokens.length - 1].type === "op") {
        tokens.pop();
        var num = tokens.pop();
        entry = num ? toEntryString(num.value) : null;
        entryMeta = null;
        entryClosed = false;
      }
    }

    function pressEquals() {
      if (error) return;
      if (justEvaluated && lastRepeat && entry == null && tokens.length === 1) {
        var left = tokens[0];
        finishEquals([
          { type: "num", value: left.value, label: formatNumber(left.value) },
          { type: "op", op: lastRepeat.op },
          { type: "num", value: lastRepeat.value, label: formatNumber(lastRepeat.value) }
        ]);
        return;
      }
      var draft = draftTokens();
      if (!draft || !draft.length) return;
      if (draft.length === 1 && !draft[0].percentText) {
        tokens = [{ type: "num", value: tidy(draft[0].value), label: formatNumber(tidy(draft[0].value)) }];
        entry = null;
        entryMeta = null;
        entryClosed = false;
        justEvaluated = true;
        heldExpression = "";
        heldReading = "";
        lastRepeat = null;
        error = null;
        return;
      }
      finishEquals(draft);
    }

    function view() {
      var expression = "";
      var reading = "";
      var value = "0";
      var shownError = error;

      if (error) {
        expression = heldExpression || expressionNow();
        value = errorMessage(error);
      } else if (justEvaluated) {
        expression = heldExpression;
        reading = heldReading;
        value = formatNumber(tokens[0] ? tokens[0].value : 0);
      } else if (entry != null && (String(entry).endsWith(".") || parseEntry(entry) == null)) {
        value = formatEntry(entry);
        expression = tokens.length ? expressionNow() : "";
      } else {
        var list = liveTokens();
        expression = expressionNow();
        var hasOp = list.some(function (t) { return t.type === "op"; });
        if (hasOp && entry != null) {
          var preview = finish(evaluateTokens(list));
          if (!preview.ok) {
            shownError = preview.error;
            value = errorMessage(preview.error);
          } else {
            value = formatNumber(preview.value);
            reading = readingFor(list);
          }
        } else if (entry != null) {
          value = formatEntry(entry);
          if (entryMeta && entryMeta.label) {
            expression = entryMeta.label;
            if (entryMeta.percentOf != null) {
              reading = entryMeta.percentText + " of " + formatNumber(entryMeta.percentOf);
            }
          } else {
            expression = "";
          }
        } else if (tokens.length) {
          var lastNum = null;
          for (var i = tokens.length - 1; i >= 0; i--) {
            if (tokens[i].type === "num") { lastNum = tokens[i]; break; }
          }
          value = lastNum ? formatNumber(lastNum.value) : "0";
          expression = renderItems(tokens);
        }
      }

      var activeOp = null;
      if (!error && !justEvaluated && entry == null && tokens.length && tokens[tokens.length - 1].type === "op") {
        activeOp = tokens[tokens.length - 1].op;
      }

      return {
        expression: expression,
        value: value,
        reading: reading,
        error: shownError,
        activeOp: activeOp,
        tape: tape.map(function (row) {
          return {
            expression: row.expression,
            reading: row.reading,
            result: row.result,
            value: row.value
          };
        })
      };
    }

    function press(key) {
      if (key >= "0" && key <= "9") pressDigit(key);
      else if (key === ".") pressDot();
      else if (key === "+" || key === "-" || key === "*" || key === "/") pressOperator(key);
      else if (key === "%") pressPercent();
      else if (key === "sign") pressSign();
      else if (key === "back") pressBack();
      else if (key === "clear") resetWork();
      else if (key === "eq") pressEquals();
    }

    function use(value) {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      tokens = [{ type: "num", value: value, label: formatNumber(value) }];
      entry = null;
      entryMeta = null;
      entryClosed = false;
      error = null;
      justEvaluated = true;
      heldExpression = "";
      heldReading = "";
      lastRepeat = null;
    }

    function clearTape() { tape = []; }

    return { press: press, view: view, use: use, clearTape: clearTape };
  }

  return {
    createCalculator: createCalculator,
    evaluate: evaluate,
    formatNumber: formatNumber,
    tidy: tidy
  };
});
