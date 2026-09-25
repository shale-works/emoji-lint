import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findBrokenTagSequences,
  findDanglingJoiners,
  findStrayKeycaps,
  findStrayModifiers,
  findUnpairedRegionalIndicators,
  toCodePoints,
} from "./rules.js";

// England subdivision flag, built the same way emoji-zwj-sequences.txt
// specifies it: black flag, tag letters spelling "gbeng", cancel tag.
const ENGLAND_FLAG = String.fromCodePoint(
  0x1f3f4,
  0xe0067,
  0xe0062,
  0xe0065,
  0xe006e,
  0xe0067,
  0xe007f,
);

test("findDanglingJoiners", async (t) => {
  await t.test("ZWJ joining two characters is not flagged", () => {
    const findings = findDanglingJoiners(toCodePoints("👨‍👩‍👧"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("ZWJ at the start of the line is flagged", () => {
    const findings = findDanglingJoiners(toCodePoints("‍abc"), 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "no-dangling-joiner");
    assert.equal(findings[0].column, 1);
  });

  await t.test("ZWJ at the end of the line is flagged", () => {
    const findings = findDanglingJoiners(toCodePoints("abc‍"), 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].column, 4);
  });

  await t.test("two ZWJ in a row each have no neighbor to join", () => {
    const findings = findDanglingJoiners(toCodePoints("a‍‍b"), 1);
    assert.equal(findings.length, 2);
    assert.deepEqual(
      findings.map((f) => f.column),
      [2, 3],
    );
  });

  await t.test("empty line has no findings", () => {
    assert.deepEqual(findDanglingJoiners(toCodePoints(""), 1), []);
  });
});

test("findUnpairedRegionalIndicators", async (t) => {
  await t.test("a full flag pair is not flagged", () => {
    const findings = findUnpairedRegionalIndicators(toCodePoints("🇺🇸"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("a lone regional indicator is flagged", () => {
    const findings = findUnpairedRegionalIndicators(toCodePoints("🇺"), 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "unpaired-regional-indicator");
    assert.match(findings[0].message, /odd length \(1\)/);
  });

  await t.test("a run of three is flagged as odd", () => {
    const findings = findUnpairedRegionalIndicators(toCodePoints("🇺🇸🇫"), 1);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /odd length \(3\)/);
  });

  await t.test("two adjacent flags are both even and not flagged", () => {
    const findings = findUnpairedRegionalIndicators(toCodePoints("🇺🇸🇫🇷"), 1);
    assert.deepEqual(findings, []);
  });
});

test("findStrayModifiers", async (t) => {
  await t.test("a skin tone modifier on an emoji base is not flagged", () => {
    const findings = findStrayModifiers(toCodePoints("👍🏽"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("a modifier with nothing before it is flagged", () => {
    const findings = findStrayModifiers(toCodePoints("🏽"), 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "stray-skin-tone-modifier");
  });

  await t.test("a modifier following a regional indicator is flagged", () => {
    const findings = findStrayModifiers(toCodePoints("🇺🏽"), 1);
    assert.equal(findings.length, 1);
  });

  await t.test("a modifier following another modifier is flagged", () => {
    const findings = findStrayModifiers(toCodePoints("👍🏽🏽"), 1);
    assert.equal(findings.length, 1);
  });
});

test("findStrayKeycaps", async (t) => {
  await t.test("a digit keycap is not flagged", () => {
    const findings = findStrayKeycaps(toCodePoints("3⃣"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("a hash keycap with a variation selector is not flagged", () => {
    const findings = findStrayKeycaps(toCodePoints("#️⃣"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("an asterisk keycap is not flagged", () => {
    const findings = findStrayKeycaps(toCodePoints("*⃣"), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("a keycap mark with nothing before it is flagged", () => {
    const findings = findStrayKeycaps(toCodePoints("⃣"), 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "stray-keycap");
  });

  await t.test("a keycap mark on a letter is flagged", () => {
    const findings = findStrayKeycaps(toCodePoints("a⃣"), 1);
    assert.equal(findings.length, 1);
  });
});

test("findBrokenTagSequences", async (t) => {
  await t.test("a complete England flag is not flagged", () => {
    const findings = findBrokenTagSequences(toCodePoints(ENGLAND_FLAG), 1);
    assert.deepEqual(findings, []);
  });

  await t.test("tag characters without a black flag base are flagged", () => {
    const withoutBase = ENGLAND_FLAG.slice(1);
    const findings = findBrokenTagSequences(toCodePoints(withoutBase), 1);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /black flag base/);
  });

  await t.test("tag characters without a cancel tag are flagged", () => {
    const withoutCancel = ENGLAND_FLAG.slice(0, -1);
    const findings = findBrokenTagSequences(toCodePoints(withoutCancel), 1);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /cancel tag/);
  });

  await t.test("plain text with no tag characters is not flagged", () => {
    const findings = findBrokenTagSequences(toCodePoints("hello world"), 1);
    assert.deepEqual(findings, []);
  });
});
