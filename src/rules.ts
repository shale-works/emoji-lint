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

// Code points with Emoji_Presentation=Yes in emoji-data.txt (Unicode 15.1):
// they already render as emoji without a variation selector. Stored as
// inclusive [start, end] pairs, sorted, so lookup can binary search.
const EMOJI_PRESENTATION_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f1e6, 0x1f1ff],
  [0x1f201, 0x1f201],
  [0x1f21a, 0x1f21a],
  [0x1f22f, 0x1f22f],
  [0x1f232, 0x1f236],
  [0x1f238, 0x1f23a],
  [0x1f250, 0x1f251],
  [0x1f300, 0x1f320],
  [0x1f32d, 0x1f335],
  [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393],
  [0x1f3a0, 0x1f3ca],
  [0x1f3cf, 0x1f3d3],
  [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4],
  [0x1f3f8, 0x1f43e],
  [0x1f440, 0x1f440],
  [0x1f442, 0x1f4fc],
  [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e],
  [0x1f550, 0x1f567],
  [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596],
  [0x1f5a4, 0x1f5a4],
  [0x1f5fb, 0x1f64f],
  [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc],
  [0x1f6d0, 0x1f6d2],
  [0x1f6d5, 0x1f6d7],
  [0x1f6dc, 0x1f6df],
  [0x1f6eb, 0x1f6ec],
  [0x1f6f4, 0x1f6fc],
  [0x1f7e0, 0x1f7eb],
  [0x1f7f0, 0x1f7f0],
  [0x1f90c, 0x1f93a],
  [0x1f93c, 0x1f945],
  [0x1f947, 0x1f9ff],
  [0x1fa70, 0x1fa7c],
  [0x1fa80, 0x1fa89],
  [0x1fa8f, 0x1fac6],
  [0x1face, 0x1fadc],
  [0x1fadf, 0x1fae9],
  [0x1faf0, 0x1faf8],
];

function hasEmojiPresentation(codePoint: number): boolean {
  let low = 0;
  let high = EMOJI_PRESENTATION_RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = EMOJI_PRESENTATION_RANGES[mid];
    if (codePoint < start) {
      high = mid - 1;
    } else if (codePoint > end) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}

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

// VS16 asks for emoji presentation. On a character that already defaults to
// emoji it changes nothing, and it usually means text was pasted through a
// tool that adds the selector everywhere. Harmless to render, so a warning.
export function findRedundantVariationSelectors(
  codePoints: number[],
  line: number,
): Finding[] {
  const findings: Finding[] = [];
  for (let i = 1; i < codePoints.length; i++) {
    if (codePoints[i] !== VARIATION_SELECTOR_16) continue;
    if (!hasEmojiPresentation(codePoints[i - 1])) continue;
    findings.push({
      line,
      column: i + 1,
      rule: "redundant-variation-selector",
      severity: "warning",
      message: `variation selector 16 follows U+${codePoints[i - 1]
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}, which already has emoji presentation`,
      sequence: sequenceOf(codePoints, i - 1, i + 1),
    });
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
