import {
  Finding,
  findBrokenTagSequences,
  findDanglingJoiners,
  findStrayKeycaps,
  findStrayModifiers,
  findUnpairedRegionalIndicators,
  toCodePoints,
} from "./rules.js";

export type { Finding, Severity } from "./rules.js";

// Runs every rule against a single line and returns findings ordered by
// where they occur in that line. Exposed on its own so tests and editor
// integrations can lint one line without paying for a full split.
export function lintLine(line: string, lineNumber: number): Finding[] {
  const codePoints = toCodePoints(line);
  const findings = [
    ...findDanglingJoiners(codePoints, lineNumber),
    ...findUnpairedRegionalIndicators(codePoints, lineNumber),
    ...findStrayModifiers(codePoints, lineNumber),
    ...findStrayKeycaps(codePoints, lineNumber),
    ...findBrokenTagSequences(codePoints, lineNumber),
  ];
  return findings.sort((a, b) => a.column - b.column);
}

// Splits text into lines and lints each one. Line numbers are 1-based, to
// match the convention editors and terminals already use.
export function lintText(text: string): Finding[] {
  const lines = text.split(/\r\n|\r|\n/);
  return lines.flatMap((line, index) => lintLine(line, index + 1));
}
