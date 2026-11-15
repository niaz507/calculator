(function () {
  "use strict";

  var calc = Calc.createCalculator();
  var expressionEl = document.getElementById("expression");
  var readingEl = document.getElementById("reading");
  var valueEl = document.getElementById("value");
  var liveEl = document.getElementById("live");
  var keysEl = document.querySelector(".keys");
  var tapeEl = document.getElementById("tape");
  var emptyEl = document.getElementById("sheetEmpty");
  var countEl = document.getElementById("sheetCount");
  var clearTapeEl = document.getElementById("clearTape");
  var themeBtn = document.getElementById("themeToggle");
  var themeMeta = document.getElementById("themeColor");

  var tapeCount = 0;
  var lastSpoken = "0";
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buttonFor(key) {
    var buttons = keysEl.querySelectorAll(".key");
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute("data-k") === key) return buttons[i];
    }
    return null;
  }

  function syncThemeButton() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.textContent = dark ? "Light" : "Dark";
    themeBtn.setAttribute("aria-pressed", dark ? "true" : "false");
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    if (themeMeta) themeMeta.setAttribute("content", dark ? "#12140E" : "#FAFAF7");
  }

  function renderTape(rows, grew) {
    tapeEl.replaceChildren();
    countEl.textContent = String(rows.length).padStart(2, "0");
    emptyEl.hidden = rows.length > 0;
    clearTapeEl.hidden = rows.length === 0;
    rows.forEach(function (row, index) {
      var li = document.createElement("li");
      if (grew && !reduceMotion && index === rows.length - 1) li.className = "is-new";

      var idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = String(index + 1).padStart(2, "0");

      var body = document.createElement("div");
      var expr = document.createElement("p");
      expr.className = "tape-expr";
      expr.textContent = row.expression;
      body.appendChild(expr);
      if (row.reading) {
        var note = document.createElement("p");
        note.className = "tape-read";
        note.textContent = row.reading;
        body.appendChild(note);
      }

      var use = document.createElement("button");
      use.type = "button";
      use.className = "use";
      use.setAttribute("data-index", String(index));
      use.textContent = row.result;
      use.setAttribute("aria-label", "Use " + row.result + " in a new calculation");

      li.appendChild(idx);
      li.appendChild(body);
      li.appendChild(use);
      tapeEl.appendChild(li);
    });
    if (grew) tapeEl.scrollTop = tapeEl.scrollHeight;
  }

  function render() {
    var state = calc.view();
    expressionEl.textContent = state.expression;
    readingEl.textContent = state.reading;
    readingEl.hidden = !state.reading;
    valueEl.textContent = state.value;
    valueEl.classList.toggle("is-message", !!state.error);
    var len = state.value.length;
    valueEl.setAttribute("data-len", len > 16 ? "l" : len > 10 ? "m" : "s");

    var buttons = keysEl.querySelectorAll(".key");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("is-on", buttons[i].getAttribute("data-k") === state.activeOp);
    }

    var grew = state.tape.length > tapeCount;
    if (grew && !reduceMotion) {
      valueEl.classList.remove("is-result");
      void valueEl.offsetWidth;
      valueEl.classList.add("is-result");
    }
    tapeCount = state.tape.length;
    renderTape(state.tape, grew);

    var spoken = state.value;
    if (state.expression && state.expression !== state.value) {
      spoken = state.expression + ", " + state.value;
    }
    if (state.reading) spoken += ". " + state.reading;
    if (spoken !== lastSpoken) {
      liveEl.textContent = spoken;
      lastSpoken = spoken;
    }
  }

  function press(key) {
    calc.press(key);
    render();
  }

  keysEl.addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn || !keysEl.contains(btn)) return;
    var key = btn.getAttribute("data-k");
    if (key) press(key);
  });

  tapeEl.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-index]");
    if (!btn || !tapeEl.contains(btn)) return;
    var row = calc.view().tape[Number(btn.getAttribute("data-index"))];
    if (!row) return;
    calc.use(row.value);
    render();
  });

  clearTapeEl.addEventListener("click", function () {
    calc.clearTape();
    render();
  });

  themeBtn.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("niaz-calc-theme", next); } catch (e) {}
    syncThemeButton();
  });

  document.addEventListener("keydown", function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if ((event.key === "Enter" || event.key === " ") && target && target.tagName === "BUTTON") return;

    var key = event.key;
    var action = null;
    if (key >= "0" && key <= "9") action = key;
    else if (key === "." || key === ",") action = ".";
    else if (key === "+" || key === "-" || key === "*" || key === "/") action = key;
    else if (key === "x" || key === "X") action = "*";
    else if (key === "%") action = "%";
    else if (key === "Enter" || key === "=") action = "eq";
    else if (key === "Escape" || key === "Delete") action = "clear";
    else if (key === "Backspace") action = "back";
    else if (key === "F9" || key === "_") action = "sign";
    if (!action) return;

    event.preventDefault();
    var btn = buttonFor(action);
    if (btn) {
      btn.classList.add("is-down");
      window.setTimeout(function () { btn.classList.remove("is-down"); }, 110);
    }
    press(action);
  });

  syncThemeButton();
  render();
})();
