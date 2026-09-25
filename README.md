# emoji-lint

Emoji you see as one glyph are usually several Unicode code points glued
together: a base character, a zero-width joiner, a skin tone modifier, a
variation selector, sometimes a whole run of "tag" characters spelling out a
flag. That structure is easy to break by accident — truncating a string at
the wrong byte offset, concatenating template fragments, hand-editing a
localization file — and the result is text that looks fine in one renderer
and falls apart in another (a lone joiner, half a flag, a skin tone modifier
sitting on nothing).

`emoji-lint` scans text for exactly that class of problem and reports each
one with a line and column number, the same way a code linter would.

## What it catches

- **Dangling joiners** — a `ZWJ` (U+200D) at the start/end of a line, or two
  in a row, with nothing left for it to join.
- **Unpaired regional indicators** — flag letters (U+1F1E6-U+1F1FF) have to
  come in pairs; an odd-length run means one letter has no partner.
- **Stray skin tone modifiers** — a modifier (U+1F3FB-U+1F3FF) with no base
  character in front of it to modify.
- **Stray keycaps** — the combining enclosing keycap mark (U+20E3) not
  preceded by a digit, `#`, or `*`.
- **Broken tag sequences** — the mechanism behind subdivision flags (England,
  Scotland, Wales): tag characters used without a leading black flag base
  (U+1F3F4) or without a closing cancel tag (U+E007F).

## Usage

```ts
import { lintText } from "emoji-lint";

const report = lintText(`hello ‍ world\nflag: 🇫`);

for (const finding of report) {
  console.log(`${finding.line}:${finding.column} ${finding.rule} - ${finding.message}`);
}
// 1:7 no-dangling-joiner - zero-width joiner is not joining two characters
// 2:7 unpaired-regional-indicator - regional indicator run has an odd length (1); flags need pairs
```

Every rule is a pure function: code points and a line number in, findings
out. `lintLine` and `lintText` are the same — no hidden state, no I/O — which
makes them straightforward to unit test against a table of known-good and
known-broken sequences.

There's also a small CLI once the project is built:

```sh
npm run build
node dist/cli.js path/to/file.txt
```

It prints one line per finding and exits non-zero if any finding is an
error.

## Testing

```sh
npm test
```

Runs every rule against a table of known-good and known-broken sequences
using node's built-in test runner, plus a handful of tests on `lintLine`
and `lintText` for line numbering and ordering.

## Status

Early skeleton. The rule set above covers the most common ways emoji
sequences break, but it isn't exhaustive — see the roadmap for what's next.

## License

MIT, see [LICENSE](LICENSE).
