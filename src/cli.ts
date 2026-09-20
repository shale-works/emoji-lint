#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lintText } from "./linter.js";

function main(argv: string[]): number {
  const path = argv[2];
  if (!path) {
    console.error("usage: emoji-lint <file>");
    return 2;
  }

  const text = readFileSync(path, "utf8");
  const findings = lintText(text);

  for (const finding of findings) {
    console.log(
      `${path}:${finding.line}:${finding.column} ${finding.severity} ${finding.rule} ` +
        `${finding.message} (${JSON.stringify(finding.sequence)})`,
    );
  }

  return findings.some((finding) => finding.severity === "error") ? 1 : 0;
}

process.exitCode = main(process.argv);
