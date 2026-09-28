# Changelog

All notable changes to this project are documented here.

## [Unreleased] — 2026-09-26

The plugin is back in this repository. Its content — which had continued to be
developed in the shared `commandcode-usage` repository after the move — is merged
back here, at the repository root, and this repository is the standalone source
again. `package.json` still says `0.1.0`: that number is the npm package identity
and the cordis loader id, not a document version, so it does not move.

### Fixed

- **The desktop app could never show the card, and said nothing about it.** The
  provider route was discovered by reading `$DSH_HOME/settings.yaml` only, but the
  Electron app migrates that file to `settings.yaml.imported` on first launch and
  writes user settings into the patch layers from then on
  (`$DSH_HOME/cordis.patch.yml`, `$DSH_HOME/profiles/<name>/cordis.patch.yml`). On
  every desktop install the host therefore answered `configured: false` — by design
  a card that renders nothing and reports no error, which is why "installed but
  invisible" had nothing to diagnose. Route discovery now scans both patch layers
  too; the indent scan already handled the shape, so only the candidate list grew.
- **A host without Command Code was asked exactly once, ever.** After
  `configured: false` the card went invisible and never polled again, so a provider
  added *after* the card mounted — the desktop migration above, a settings edit, a
  profile switch — stayed invisible for the rest of the session. It now re-checks
  every 5 minutes while absent (`ABSENT_MS`): still renders nothing, but a host that
  genuinely does not use Command Code pays one local round trip per 5 minutes.

### Added

- **A three-platform CI workflow**, `.github/workflows/check.yml`: Ubuntu, Windows
  and macOS × Node 18 and 22, `fail-fast: false`. It installs React 18 into
  `.devdeps/` (the component test and the preview page need it), runs
  `node scripts/check.mjs`, then smoke-tests the CLI's `--help` and the offline
  command paths.
- **`scripts/check.mjs`** — the release check this repository never had: every JSON
  file parses, every `.js`/`.mjs` passes `node --check`, no credential or
  machine-specific path is committed, the package identity is consistent across
  `package.json`, `package-lock.json`, `cordis.patch.yml` and `screenshots.json`,
  and then the 156 offline checks in `scripts/verify.mjs`.
- **`SECURITY.md`** — supported versions, private reporting, the exact list of what
  the plugin reads, writes and sends, and the credential-resolution order.
- **`package-lock.json`** — the React dependency tree, so CI installs what the
  manifest says.

### Changed

- **Three states became two.** The card used to open in two steps — the rolling
  windows first, the money and totals second — which left a middle state that
  answered no question the resting line or the full card did not. One click now
  unfolds everything in the shape the card was designed around: a header with the
  brand mark, the plan and the billing link; the three windows as a fixed grid of
  label, meter, percentage and countdown; the monthly allowance as one money line
  (`$61.80 / $70.22 used`, `$8.42 left`); and the request and token totals as a
  caption. The grid's percentage and countdown columns size to their widest cell,
  so `5%` and `100%` stay right-aligned against each other without a fixed width
  that would clip a longer value. `preview/build.mjs` now clicks once, since a
  second click folds the card straight back.
- **The resting card is one line.** It used to keep the boxed header and one
  window row; it is now a strip — brand mark, plan, meter, percentage, reset
  countdown (`↻ 3d20h`) — the height of a single line, which is all the sidebar
  seat can afford when the transcript above it wants the room. The strip prints no
  window label (the meter's tooltip names the window and the exact percentage),
  and the meter is the only part that gives way when the sidebar is narrow: a
  fixed minimum there is what pushed the countdown past the card's own padding at
  200 px. The boxed header now appears only once something is unfolded under it.
  `preview/build.mjs` leaves its dark column at rest, so the README image shows
  the strip next to the rail badge and the fully unfolded card, and
  `assets/screenshot.png` was regenerated from it.
- **The repository describes this fork, not upstream.** Every install command,
  CI badge, clone URL, security-reporting link, `homepage`/`repository` field and
  the bundle patch's comment point at
  `https://github.com/winniesi/dsh-commandcode-quota`, and the CLI sample in both
  READMEs no longer prints upstream's account name. The package name is unchanged
  — `dsh-commandcode-quota` is both the install spec and the cordis loader id —
  so this installs *as* the plugin rather than beside it. `LICENSE` keeps
  upstream's copyright line and adds one for this fork's changes; the historical
  CHANGELOG entries and `.sync-source.json` still name the upstream repositories,
  because that is what they are records of.
- **The install section covers the desktop app and the update story.** The CLI
  refuses `--profile desktop` (`managed exclusively by the Electron
  application`), so the plugin manager is the way in there — and its dialog also
  accepts a local absolute path, which beats a GitHub install while the plugin is
  being worked on. A GitHub install is pinned to the commit that was `main` at
  install time, and nothing polls upstream: moving it takes
  `dsh plugin --profile web update dsh-commandcode-quota`, or a remove-and-re-add
  in the desktop app.
- **Every surface the plugin prints is English.** Three surfaces used to run on
  two rules: the card followed the interface language, the `ccq` CLI printed
  Chinese, and `/quota` printed English — so the same account read differently
  depending on where you looked. All three are English now, whatever `dsh` is set
  to. The card renders from its `en` table instead of binding to the locale (both
  dictionaries still register: the Chinese table is what keeps this fork diffable
  against upstream), and the CLI's usage text, window lines, countdowns, reset
  phrasing, credential source and error messages were translated with it. The
  host's `QuotaError` messages — they surface on the card's tooltip and on the
  CLI's stderr — are English too. Two small side effects: the CLI's `updated`
  stamp is a fixed `today HH:mm` / `MM-DD HH:mm` rather than `toLocaleString`, so
  the README samples stay byte-stable, and both READMEs' sample blocks are now
  generated from real CLI output. Code comments are untouched (still the mix of
  English and Chinese they were).
- **A small type scale instead of one size.** The first pass set every line at
  13 px. The two-state card that followed needs four, because at the sidebar's
  196 px of content the brand mark, the plan badge and "View plans and credits"
  only share a line with the link at 11 px. The scale is 16 / 13 / 12 / 11 — the
  mark, the percentage the resting line leads with, the limit rows and the money,
  then captions — and the client suite pins the set.
- **A stale reading no longer prints its age underneath.** The card still dims
  when the host answers with its last snapshot or a refresh fails, and the age
  moved to the card's tooltip, where it costs no height: the sidebar has no room
  to say "not live" twice.
- **The card unfolds in three steps instead of two.** It used to render all three
  credit windows the moment it appeared, with the money and totals one click
  behind them. It now rests on a single row — the monthly allowance, the figure a
  budget holder actually checks — and the first click adds the 5-hour and weekly
  windows, the second the money-and-totals panel, the third folding it back. The
  sidebar seat is permanent and shared with Settings, so the resting card answers
  one question instead of three; nothing became unreachable, because the card's
  own tooltip still names every window with its percentage and remaining credit
  while folded, and account-level warnings (a canceled subscription, a
  below-threshold balance) stay on screen at every stage. A plan that reports no
  monthly window — or whose monthly percentage the host withheld because the read
  straddled a billing boundary — rests on the tightest trustworthy row instead of
  a bare dash, matching what the collapsed rail badge already does. The behavior is covered by ten new checks in the
  client suite, which now drives the card through stages 0, 1 and 2.
- **Merged everything the shared repository changed after the move.** The data
  layer grew 706 → 711 lines, the dynamic and client suites were extended, both
  READMEs were rewritten and expanded, and `package.json` gained `homepage`,
  `repository` and its `react`/`react-dom` dependencies.
- **The Pro plan's nominal allowance is `$80`, not `$30`.** The table in
  `quota.mjs` had it wrong, and the figure is not cosmetic: it feeds the
  sanity check that compares a freshly-read cap against the plan's nominal
  allowance. At `$30` a genuine `$80` cap sat 2.67× outside the ±25 % tolerance,
  and a Pro account lost its monthly percentage entirely. The Provider plan lost
  its `monthlyCredits` for the same class of reason — it is metered, `$15` is its
  price, not an allowance. The `dynamic` suite now tests the mixed-period refusal
  against a plan whose bands are far enough apart to be detectable.
- **`homepage` and `repository` point at this repository again** —
  `https://github.com/Jovan1666/dsh-commandcode-quota` — in `package.json`, the
  READMEs and the bundle patch's comment. The package name and the loader id are
  untouched.
- **The READMEs install from this repository.** The one-line install is
  `dsh plugin --profile web add github:Jovan1666/dsh-commandcode-quota`; the
  clone-based and the fully manual installs stay in the collapsed section.

### Fixed

- **Three documentation defects that came in with the merge.**
  The install block repeated the collapsed "From a local clone" section verbatim,
  so the one-line `github:` install is the primary again. The English README
  carried a whole Chinese section (`## 先确认 dsh 版本`) plus Chinese window labels
  in its table, while the Chinese README had that section missing entirely — it is
  now present in both languages. And the Chinese README listed the `$1` **Go** tier
  as supported, contradicting both the English text and the rest of the Chinese
  file, which say it has no API access.

### Kept

- **`screenshots.json`** (the storefront screenshot declaration) and
  **`.gitignore`** survived only here — the shared repository had neither — and
  both are back at the repository root, with the ignore rules written root-relative.

## [0.1.0] — 2026-09-19

Last published from this repository; tagged
[`v0.1.0-final`](https://github.com/Jovan1666/dsh-commandcode-quota/releases/tag/v0.1.0-final).
The work below ran 2026-09-17 → 2026-09-19.

### Added

- **The sidebar card.** 5-hour, weekly and monthly credit windows read live from
  Command Code's four read-only `/alpha` endpoints, rendered above the sidebar's
  Settings seat, with a percentage, a meter and a reset countdown per row.
- **The `/quota` command and the bilingual card.** The card follows the DSH
  interface language; a machine with no Command Code provider configured shows no
  card at all; `/quota` prints the same report as chat text, English, and never
  answers from a stale snapshot.
- **The storefront screenshot declaration** (`screenshots.json`), naming the image
  a marketplace should show.
- **Tests that assert the numbers stay right while they move** — a sampler that
  reads a real account repeatedly and checks the identity `used + remaining = cap`
  each time — and an assertion that the loader row keeps the package name.

### Changed

- **The cordis plugin name now matches the package name.** The loader row is
  `id: commandcode-quota`, `name: "dsh-commandcode-quota"`, so the troubleshooting
  URL `/plugins/<id>/client.js` and the install command point at the same string.
- **The card was cut back to what a user can act on.** Money is shown for the
  monthly allowance only; no pace verdict and no burn-rate forecast on the card
  (the host still exposes `projection` in its JSON for scripts).

### Performance

- **The card is on screen about 2 ms after a restart instead of about 1.4 s.** All
  four endpoints are now requested at once instead of awaiting `whoami` first, and
  the last good report is kept on disk so a cold start answers immediately —
  dimmed, labelled with its age — while a live read runs behind it.

### Fixed

- **The documented install path made dsh refuse to start.** The package declares a
  bundle patch, so `dsh plugin add` already registers the loader row; the README
  also told users to append that row to their profile, and two layers inserting one
  id fail at boot with `duplicate loader entry id`. The row now belongs to the
  manual install only, the `[]`-terminated profile file is described correctly, the
  uninstall steps actually remove the bundle, and `cli/` and `LICENSE` are in
  `files` so the documented CLI is installed.
- **The monthly figure no longer mixes two billing periods.** The cap is the sum of
  two figures from two endpoints; across a rollover they can describe different
  periods. The plan's nominal allowance is the sanity check, and when a read fails
  it the host reports no percentage at all and says why.
- **The data layer no longer states numbers the vendor never reported.** Window
  count, caps and percentages come from the API; a plan that reports no rolling
  windows renders no rows instead of plausible-looking zeros.
- **The plugin owns its route, and its snapshot belongs to one account.** The host
  half registers `cc-quota/report` on the shared `/api` transport itself instead of
  relying on host config, and the disk snapshot carries a short fingerprint of the
  credential so a snapshot from another account is not shown.
- **The card is readable at a glance, and honest about what it cannot say.** A row
  that disappears because its endpoint failed says so, and a total failure prints
  one readable line with the full diagnostic text on hover.
- **The READMEs' CLI sample no longer merges its bars into the line above** — the
  sample is shown with `--ascii`, whose glyphs do not depend on the font's block
  rendering.
- **The things a user would hit, found by walking through their day**: the
  troubleshooting table, the install/removal steps, the empty-panel state after a
  provider is removed, and the client-bundle 404 diagnosis.

### Docs and chores

- **The READMEs say which Command Code plan to buy and how to subscribe**, with
  the GOAT allowance, the peak-hour pricing caveat and the request-count estimate.
- **`.submission/` is ignored** — marketplace submission notes are working notes,
  not part of the plugin.
