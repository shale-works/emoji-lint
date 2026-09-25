import { test } from "node:test";
import assert from "node:assert/strict";
import { lintLine, lintText } from "./linter.js";

test("lintLine", async (t) => {
  await t.test("clean text has no findings", () => {
    assert.deepEqual(lintLine("hello world", 1), []);
  });

  await t.test("findings from different rules are sorted by column", () => {
    // stray keycap at column 1, dangling joiner at column 3.
    const findings = lintLine("⃣a‍", 5);
    assert.deepEqual(
      findings.map((f) => f.rule),
      ["stray-keycap", "no-dangling-joiner"],
    );
    assert.deepEqual(
      findings.map((f) => f.column),
      [1, 3],
    );
  });

  await t.test("every finding carries the line number it was given", () => {
    const findings = lintLine("‍", 42);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 42);
  });
});

test("lintText", async (t) => {
  await t.test("clean multi-line text has no findings", () => {
    assert.deepEqual(lintText("hello\nworld"), []);
  });

  await t.test("line numbers are 1-based and match the source line", () => {
    const findings = lintText("ok\n‍\nok");
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
  });

  await t.test("CRLF and CR line endings split the same as LF", () => {
    const crlf = lintText("‍\r\nok");
    const cr = lintText("‍\rok");
    const lf = lintText("‍\nok");
    assert.equal(crlf.length, 1);
    assert.equal(cr.length, 1);
    assert.equal(lf.length, 1);
    assert.equal(crlf[0].line, 1);
  });

  await t.test("findings accumulate across multiple broken lines", () => {
    const findings = lintText("🇺\nok\n🏽");
    assert.equal(findings.length, 2);
    assert.deepEqual(
      findings.map((f) => f.line),
      [1, 3],
    );
  });
});
