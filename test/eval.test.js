/* Evaluation tests. Run with: node test/eval.test.js */
var assert = require("assert");
var calc = require("../calc.js");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error("FAIL  " + name);
    console.error("      " + (err && err.stack ? err.stack : err));
  }
}

function run(keys) {
  var c = calc.createCalculator();
  keys.forEach(function (k) { c.press(k); });
  return c;
}

function valueOf(expression) {
  var result = calc.evaluate(expression);
  assert.strictEqual(result.ok, true, expression + " → " + JSON.stringify(result));
  return result.value;
}

test("multiplication before addition", function () {
  assert.strictEqual(valueOf("2 + 3 * 4"), 14);
  assert.strictEqual(valueOf("2+3×4"), 14);
  var c = run(["2", "+", "3", "*", "4"]);
  var view = c.view();
  assert.strictEqual(view.value, "14");
  assert.strictEqual(view.expression, "2 + 3 × 4");
  assert.strictEqual(view.reading, "Read as 2 + (3 × 4)");
  c.press("eq");
  view = c.view();
  assert.strictEqual(view.value, "14");
  assert.strictEqual(view.tape.length, 1);
  assert.strictEqual(view.tape[0].result, "14");
  assert.strictEqual(view.tape[0].reading, "Read as 2 + (3 × 4)");
});

test("addition before a later product still waits", function () {
  assert.strictEqual(valueOf("2 * 3 + 4 * 5"), 26);
  var c = run(["2", "*", "3", "+", "4", "*", "5", "eq"]);
  assert.strictEqual(c.view().value, "26");
  assert.strictEqual(c.view().reading, "Read as (2 × 3) + (4 × 5)");
});

test("left associativity for subtraction and division", function () {
  assert.strictEqual(valueOf("8 - 3 - 2"), 3);
  assert.strictEqual(valueOf("20 / 4 / 5"), 1);
  assert.strictEqual(valueOf("20 ÷ 4 ÷ 5"), 1);
  var c = run(["8", "-", "3", "-", "2", "eq"]);
  assert.strictEqual(c.view().value, "3");
  assert.strictEqual(c.view().reading, "");
});

test("parentheses override precedence", function () {
  assert.strictEqual(valueOf("(2 + 3) * 4"), 20);
  assert.strictEqual(valueOf("2 * (3 + 4)"), 14);
  assert.strictEqual(valueOf("-(2 + 3)"), -5);
  assert.strictEqual(valueOf("-5 + 2"), -3);
});

test("decimals do not keep binary dust", function () {
  assert.strictEqual(valueOf("0.1 + 0.2"), 0.3);
  assert.strictEqual(valueOf("1 / 3 * 3"), 1);
  var c = run(["0", ".", "1", "+", "0", ".", "2", "eq"]);
  assert.strictEqual(c.view().value, "0.3");
  assert.strictEqual(valueOf("7 / 2"), 3.5);
  var typed = run(["1", ".", "5", "0"]);
  assert.strictEqual(typed.view().value, "1.50");
  assert.strictEqual(typed.view().expression, "");
  var third = run(["1", "/", "3", "eq"]);
  assert.strictEqual(third.view().value, "0.333333333333");
  third.press("*");
  third.press("3");
  third.press("eq");
  assert.strictEqual(third.view().value, "1");
});

test("a second decimal point is ignored", function () {
  var c = run(["1", ".", "2", ".", "3"]);
  assert.strictEqual(c.view().value, "1.23");
  assert.strictEqual(c.view().expression, "");
});

test("percent follows calculator convention", function () {
  var add = run(["2", "0", "0", "+", "1", "0", "%"]);
  assert.strictEqual(add.view().value, "220");
  assert.strictEqual(add.view().expression, "200 + 10%");
  assert.strictEqual(add.view().reading, "10% of 200");
  add.press("eq");
  assert.strictEqual(add.view().tape[0].result, "220");

  assert.strictEqual(run(["8", "0", "-", "2", "5", "%", "eq"]).view().value, "60");
  assert.strictEqual(run(["5", "0", "*", "2", "0", "%", "eq"]).view().value, "10");
  assert.strictEqual(run(["5", "0", "/", "2", "0", "%", "eq"]).view().value, "250");
  assert.strictEqual(run(["5", "0", "%"]).view().value, "0.5");
  assert.strictEqual(run(["5", "0", "%"]).view().expression, "50%");
  assert.strictEqual(valueOf("200 + 10%"), 220);
  assert.strictEqual(valueOf("50 * 20%"), 10);
  assert.strictEqual(valueOf("80 - 25%"), 60);
  assert.strictEqual(valueOf("50 / 20%"), 250);
  assert.strictEqual(valueOf("50%"), 0.5);
});

test("percent of a sum uses the value to its left", function () {
  var c = run(["1", "0", "0", "+", "5", "0", "+", "1", "0", "%", "eq"]);
  assert.strictEqual(c.view().value, "165");
  assert.strictEqual(c.view().reading, "10% of 150");
});

test("sign toggle flips the current entry", function () {
  var zero = run(["sign"]);
  assert.strictEqual(zero.view().value, "−0");
  assert.strictEqual(zero.view().expression, "");
  zero.press("5");
  assert.strictEqual(zero.view().value, "−5");
  var c = run(["1", "2", "sign"]);
  assert.strictEqual(c.view().value, "−12");
  c.press("sign");
  assert.strictEqual(c.view().value, "12");
  var mixed = run(["5", "+", "sign", "3", "eq"]);
  assert.strictEqual(mixed.view().value, "2");
  assert.strictEqual(mixed.view().expression, "5 + (−3)");
});

test("negative number keeps precedence visible", function () {
  var c = run(["2", "+", "3", "sign", "*", "4"]);
  assert.strictEqual(c.view().value, "−10");
  assert.strictEqual(c.view().expression, "2 + (−3) × 4");
  assert.strictEqual(c.view().reading, "Read as 2 + (−3 × 4)");
});

test("divide by zero is reported and can be edited", function () {
  assert.deepStrictEqual(calc.evaluate("5 / 0"), { ok: false, error: "divide-by-zero" });
  assert.deepStrictEqual(calc.evaluate("0 / 0"), { ok: false, error: "divide-by-zero" });
  var c = run(["5", "/", "0"]);
  assert.strictEqual(c.view().error, "divide-by-zero");
  assert.strictEqual(c.view().value, "Can't divide by zero");
  c.press("eq");
  assert.strictEqual(c.view().tape.length, 0);
  c.press("back");
  assert.strictEqual(c.view().error, null);
  assert.strictEqual(c.view().expression, "5 ÷");
  c.press("2");
  c.press("eq");
  assert.strictEqual(c.view().value, "2.5");
});

test("a digit after an error starts a new line", function () {
  var c = run(["5", "/", "0", "eq", "1"]);
  assert.strictEqual(c.view().value, "1");
  assert.strictEqual(c.view().error, null);
  assert.strictEqual(c.view().expression, "");
});

test("backspace removes digits and then the operator", function () {
  var c = run(["1", "2", "3", "back"]);
  assert.strictEqual(c.view().value, "12");
  c.press("+");
  c.press("back");
  assert.strictEqual(c.view().value, "12");
  assert.strictEqual(c.view().expression, "");
  assert.strictEqual(c.view().activeOp, null);
  c.press("+");
  c.press("3");
  c.press("4");
  c.press("back");
  assert.strictEqual(c.view().expression, "12 + 3");
});

test("all clear resets the line and keeps the sheet", function () {
  var c = run(["2", "+", "3", "*", "4", "eq"]);
  assert.strictEqual(c.view().tape.length, 1);
  c.press("1");
  c.press("clear");
  var view = c.view();
  assert.strictEqual(view.value, "0");
  assert.strictEqual(view.expression, "");
  assert.strictEqual(view.tape.length, 1);
  c.clearTape();
  assert.strictEqual(c.view().tape.length, 0);
});

test("equals repeats the last operation", function () {
  var c = run(["2", "+", "3", "eq", "eq", "eq"]);
  assert.strictEqual(c.view().value, "11");
  assert.strictEqual(c.view().tape.length, 3);
  assert.strictEqual(c.view().tape[2].expression, "8 + 3");
});

test("an operator after equals continues from the result", function () {
  var c = run(["2", "+", "3", "eq", "*", "4", "eq"]);
  assert.strictEqual(c.view().value, "20");
  assert.strictEqual(c.view().expression, "5 × 4");
});

test("a trailing operator is replaced and completed", function () {
  var replaced = run(["2", "+", "-", "3", "eq"]);
  assert.strictEqual(replaced.view().value, "−1");
  var doubled = run(["5", "+", "eq"]);
  assert.strictEqual(doubled.view().value, "10");
});

test("long numbers group, then switch to exponential", function () {
  assert.strictEqual(calc.formatNumber(1234567.89), "1,234,567.89");
  assert.strictEqual(calc.formatNumber(-1234.5), "−1,234.5");
  assert.strictEqual(calc.formatNumber(1000000), "1,000,000");
  assert.strictEqual(calc.formatNumber(1e12), "1e12");
  assert.strictEqual(calc.formatNumber(1e-7), "1e-7");
  assert.strictEqual(calc.formatNumber(0), "0");
  var c = run(["1", "2", "3", "4", "5", "6", "7"]);
  assert.strictEqual(c.view().value, "1,234,567");
  var huge = run([
    "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9",
    "*",
    "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9",
    "eq"
  ]);
  assert.strictEqual(huge.view().error, "overflow");
  assert.strictEqual(huge.view().value, "Too long to show");
});

test("entry longer than 12 digits is refused", function () {
  var c = run(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "1", "2", "3"]);
  assert.strictEqual(c.view().value, "123,456,789,012");
  assert.strictEqual(c.view().expression, "");
});

test("a proof-sheet result can start the next line", function () {
  var c = run(["6", "*", "7", "eq"]);
  c.use(c.view().tape[0].value);
  c.press("+");
  c.press("1");
  c.press("eq");
  assert.strictEqual(c.view().value, "43");
});

test("invalid expressions fail cleanly", function () {
  assert.strictEqual(calc.evaluate("2 + + 3").ok, false);
  assert.strictEqual(calc.evaluate("2 +").ok, false);
  assert.deepStrictEqual(calc.evaluate(""), { ok: true, value: 0 });
});

test("active operator is reported while it is pending", function () {
  var c = run(["9", "*"]);
  assert.strictEqual(c.view().activeOp, "*");
  assert.strictEqual(c.view().value, "9");
  c.press("2");
  assert.strictEqual(c.view().activeOp, null);
  assert.strictEqual(c.view().value, "18");
});

if (failed) {
  console.error(failed + " failed, " + passed + " passed");
  process.exit(1);
}
console.log(passed + " tests passed");
