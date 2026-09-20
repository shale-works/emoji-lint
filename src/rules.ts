// Classification helpers and individual lint rules for emoji sequences.
// Every function here is pure: it takes code points in, and returns findings
// out, with no I/O and no shared state. That's what makes them easy to test
// against a table of known-good and known-broken sequences.

export type Severity = "error" | "warning";

export interface Finding {
  line: number;
  column: number;
  rule: string;
  severity: Severity;
  message: string;
  sequence: string;
}

const ZERO_WIDTH_JOINER = 0x200d;
const VARIATION_SELECTOR_16 = 0xfe0f;
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;
const CANCEL_TAG = 0xe007f;
const BLACK_FLAG = 0x1f3f4;

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function isSkinToneModifier(codePoint: number): boolean {
  return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

// Tag characters mirror ASCII 0x20-0x7A, shifted into the supplementary
// plane at 0xE0000. The cancel tag (0xE007F) sits just past this range.
function isTagChar(codePoint: number): boolean {
  return codePoint >= 0xe0020 && codePoint <= 0xe007a;
}

function isKeycapBase(codePoint: number): boolean {
  const isDigit = codePoint >= 0x30 && codePoint <= 0x39;
  const isHash = codePoint === 0x23;
  const isAsterisk = codePoint === 0x2a;
  return isDigit || isHash || isAsterisk;
}

export function toCodePoints(text: string): number[] {
  return Array.from(text, (char) => char.codePointAt(0) as number);
}

function sequenceOf(codePoints: number[], start: number, end: number): string {
  return String.fromCodePoint(...codePoints.slice(start, end));
}

// A ZWJ only makes sense sitting between two other characters. One at the
// start or end of a line, or two in a row, has nothing left to join.
export function findDanglingJoiners(codePoints: number[], line: number): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < codePoints.length; i++) {
    if (codePoints[i] !== ZERO_WIDTH_JOINER) continue;
    const hasNeighborBefore = i > 0 && codePoints[i - 1] !== ZERO_WIDTH_JOINER;
    const hasNeighborAfter =
      i < codePoints.length - 1 && codePoints[i + 1] !== ZERO_WIDTH_JOINER;
    if (!hasNeighborBefore || !hasNeighborAfter) {
      findings.push({
        line,
        column: i + 1,
        rule: "no-dangling-joiner",
        severity: "error",
        message: "zero-width joiner is not joining two characters",
        sequence: sequenceOf(codePoints, i, i + 1),
      });
    }
  }
  return findings;
}

// Flags are built from exactly two regional indicator letters. A run of an
// odd length means one letter is left without a partner.
export function findUnpairedRegionalIndicators(
  codePoints: number[],
  line: number,
): Finding[] {
  const findings: Finding[] = [];
  let runStart = -1;
  for (let i = 0; i <= codePoints.length; i++) {
    const isRegional = i < codePoints.length && isRegionalIndicator(codePoints[i]);
    if (isRegional && runStart === -1) {
      runStart = i;
      continue;
    }
    if (!isRegional && runStart !== -1) {
      const runLength = i - runStart;
      if (runLength % 2 !== 0) {
        findings.push({
          line,
          column: runStart + 1,
          rule: "unpaired-regional-indicator",
          severity: "error",
          message: `regional indicator run has an odd length (${runLength}); flags need pairs`,
          sequence: sequenceOf(codePoints, runStart, i),
        });
      }
      runStart = -1;
    }
  }
  return findings;
}

// A skin tone modifier changes the character right before it. If there's no
// character there, or that character can't take a skin tone, it's stray.
export function findStrayModifiers(codePoints: number[], line: number): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < codePoints.length; i++) {
    if (!isSkinToneModifier(codePoints[i])) continue;
    const previous = i > 0 ? codePoints[i - 1] : undefined;
    const hasNoValidBase =
      previous === undefined ||
      previous === ZERO_WIDTH_JOINER ||
      isSkinToneModifier(previous) ||
      isRegionalIndicator(previous);
    if (hasNoValidBase) {
      findings.push({
        line,
        column: i + 1,
        rule: "stray-skin-tone-modifier",
        severity: "error",
        message: "skin tone modifier has no emoji base to attach to",
        sequence: sequenceOf(codePoints, i, i + 1),
      });
    }
  }
  return findings;
}

// A keycap (1️⃣, #️⃣, ...) needs a digit, '#', or '*'
// right before the combining enclosing keycap mark, with an optional
// variation selector in between.
export function findStrayKeycaps(codePoints: number[], line: number): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < codePoints.length; i++) {
    if (codePoints[i] !== COMBINING_ENCLOSING_KEYCAP) continue;
    let baseIndex = i - 1;
    if (baseIndex >= 0 && codePoints[baseIndex] === VARIATION_SELECTOR_16) {
      baseIndex -= 1;
    }
    const base = baseIndex >= 0 ? codePoints[baseIndex] : undefined;
    if (base === undefined || !isKeycapBase(base)) {
      findings.push({
        line,
        column: i + 1,
        rule: "stray-keycap",
        severity: "error",
        message: "keycap combining mark is not attached to a digit, '#', or '*'",
        sequence: sequenceOf(codePoints, i, i + 1),
      });
    }
  }
  return findings;
}

// Tag sequences spell out a subdivision flag (England, Scotland, Wales) as
// a black flag base, ASCII-in-disguise tag characters, then a cancel tag.
// Either end missing means the sequence won't render as intended.
export function findBrokenTagSequences(codePoints: number[], line: number): Finding[] {
  const findings: Finding[] = [];
  let i = 0;
  while (i < codePoints.length) {
    if (!isTagChar(codePoints[i])) {
      i += 1;
      continue;
    }
    const start = i;
    const precededByBlackFlag = start > 0 && codePoints[start - 1] === BLACK_FLAG;
    let end = start;
    while (end < codePoints.length && isTagChar(codePoints[end])) {
      end += 1;
    }
    const isTerminated = end < codePoints.length && codePoints[end] === CANCEL_TAG;
    if (!precededByBlackFlag || !isTerminated) {
      findings.push({
        line,
        column: start + 1,
        rule: "broken-tag-sequence",
        severity: "error",
        message: !precededByBlackFlag
          ? "tag characters must follow a black flag base (U+1F3F4)"
          : "tag sequence is missing its cancel tag (U+E007F)",
        sequence: sequenceOf(codePoints, start, isTerminated ? end + 1 : end),
      });
    }
    i = isTerminated ? end + 1 : end;
  }
  return findings;
}
