/**
 * dsh-commandcode-quota browser half.
 *
 * Registers one card into the sidebar-owned `sidebar.footer.action` list slot,
 * which the sidebar shell renders directly above the Settings seat in both
 * sidebar widths. The card asks the host for a quota report over the exact Fetch
 * route this plugin's host half registers on the shared `/api` transport, and
 * renders every credit window the account reports.
 *
 * Presentation rules:
 *
 * - The card has two states, because the seat it holds is shared with Settings
 *   and is on screen on every page. Resting, it answers the one question a budget
 *   holder asks — how much of the monthly allowance is left — on a single line:
 *   mark, plan, meter, percentage, countdown. One click unfolds every window with
 *   its meter and countdown, the monthly allowance in money, and the period
 *   totals; the next click folds it back. Nothing is hidden while folded: the
 *   card's own tooltip still names every window.
 * - Windows run shortest first (5 hours, weekly, monthly), so the tightest
 *   constraint sits where your eye lands first.
 * - The used *percentage* is the row's value and the bar repeats it graphically,
 *   because that is the whole question this card answers: how deep into the
 *   window am I? The headline rounds to a whole percent — the same rounding the
 *   official dashboard uses — so the card and the website can be compared
 *   without a mental conversion; the exact one-decimal value and the dollar
 *   amounts stay one hover away.
 * - Space is deliberately scarce: the sidebar is narrow and laptop screens make
 *   small type smaller still. One type size covers the whole card — title,
 *   labels, percentage and notes — because a second, smaller size made one small
 *   card read as two stacked documents. Only the monthly allowance is shown in
 *   money — it is the one total a user actually budgets against — while the
 *   rolling windows stay percentage-only, because the API reports them as
 *   pass/fail limits rather than as something to track in dollars. The age of a
 *   stale reading is not a line either: a dimmed card already says "not live",
 *   and the exact age stays on the tooltip.
 * - The card is English-only in this fork, whatever language `dsh` runs in. Both
 *   dictionaries still register — the Chinese table is what keeps this fork
 *   diffable against upstream — but nothing binds to the interface language.
 * - Nothing is deduced about *pace*. How fast a user burns credit is their
 *   business; a card that editorialises about "over pace" tells someone who
 *   simply has work to do something they cannot act on.
 * - The card renders nothing at all when this host has no Command Code provider,
 *   so installing the plugin cannot park an error box in the sidebar of somebody
 *   who does not use the service.
 *
 * Written as a hand-authored bundle: no build step, so the component uses
 * `React.createElement` rather than JSX, and styling is one injected stylesheet
 * keyed on the `.ccq-` prefix using the harness's own design tokens.
 */

window.__ModuleLoader__.load({
  id: 'dsh-commandcode-quota',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const module = { exports: {} }
    const exports = module.exports

    /** Channel and endpoint the host half registers. */
    const CHANNEL = '/api'
    const ENDPOINT = 'cc-quota/report'
    const STYLE_ID = 'dsh-commandcode-quota-style'
    /** Locale namespace this plugin owns. */
    const NS = 'cc-quota'
    /** Poll cadence: relaxed normally, tight once any window is near its cap. */
    const SLOW_MS = 60_000
    const FAST_MS = 15_000
    /**
     * Cadence after the host answers with a snapshot instead of a live read.
     *
     * The host serves its last good report immediately on a cold start so the
     * card can paint at once; a refresh is already running behind that answer.
     * Waiting the usual minute for it would waste the one moment the user is
     * actually looking at the card.
     */
    const REVALIDATE_MS = 3_000
    /**
     * Cadence while the host answers `configured: false` — it has no Command Code
     * provider, so the card stays invisible but still looks again, slowly.
     *
     * The alternative (never asking again) turns a fixable configuration gap into
     * a permanent one: a provider added after this component mounted — the
     * desktop app's first-run migration of `settings.yaml`, a settings edit, a
     * profile switch — would leave the card hidden for the rest of the session,
     * with nothing in the UI to explain why, since an absent card renders no
     * error either. Five minutes costs one local IPC round trip when the host
     * really does not use Command Code.
     */
    const ABSENT_MS = 5 * 60_000
    /** Used percentage at which a window counts as "hot" for polling purposes. */
    const HOT_PERCENT = 85
    /**
     * Above this, a window is spent rather than approaching.
     *
     * Polling faster cannot change what the card would say: an exhausted
     * allowance only moves when someone consumes credit, and the remaining
     * movement is the reset, which the countdown already covers. Without this
     * ceiling an account sitting at 99.8 % — a state that lasts for days near the
     * end of a period — would poll every 15 seconds indefinitely.
     */
    const SPENT_PERCENT = 99.5
    /** Where to send someone who needs more credit. */
    const BILLING_URL = 'https://commandcode.ai/pricing'

    /**
     * The card's two states, in click order: the resting line, then everything.
     *
     * Two, not three: the middle step this plugin used to have — the three
     * windows without the money — left the card in a state that answered no
     * question the other two did not, and every extra state is another shape to
     * keep readable in a 200px column.
     */
    const STAGE_SUMMARY = 0
    const STAGE_DETAIL = 1
    /** One more than the last stage: the toggle cycles through every step. */
    const STAGE_COUNT = STAGE_DETAIL + 1

    const LEVELS = [
      { below: 60, color: 'var(--dsw-alias-state-success-primary)' },
      { below: 85, color: 'var(--dsw-alias-state-warn-primary)' },
      { below: Number.POSITIVE_INFINITY, color: 'var(--dsw-alias-state-error-primary)' },
    ]

    /** Display order: the shortest window first, the monthly budget last. */
    const WINDOWS = [
      { key: 'fiveHour', label: 'fiveHour' },
      { key: 'weekly', label: 'weekly' },
      { key: 'monthly', label: 'monthly' },
    ]

    /** Every string this plugin renders, in both shipped UI languages. */
    const DICT = {
      zh: {
        fiveHour: '5 小时',
        weekly: '每周',
        monthly: '月度',
        left: '剩',
        straddle: '本次读数跨了计费周期，下次刷新会校正',
        reset: '{time} 后重置',
        overLimit: '已超限',
        usedOf: '{label}已用',
        usedSuffix: '已用',
        requests: '{count} 请求 · {rate}%',
        tokens: '输入 {in} / 输出 {out}',
        balance: '额外额度',
        belowThreshold: '额度已低于阈值',
        subCanceled: '订阅已取消，{date} 到期',
        subStatus: '订阅状态：{status}',
        billing: '查看套餐与额度',
        none: '该套餐未上报额度窗口',
        degraded: '{count} 项数据这次没取到，稍后自动重试',
        retry: '点击重试',
        stale: '上次成功：{age}前',
        errNetwork: '连不上 Command Code',
        errAuth: 'API key 被拒绝了',
        errRate: '请求太频繁，稍后自动重试',
        errNotFound: '当前套餐不含 API 权限',
        errGeneric: '读取失败',
      },
      en: {
        fiveHour: '5-hour',
        weekly: 'Weekly',
        monthly: 'Monthly',
        left: 'left',
        straddle: 'this reading straddles a billing boundary; the next refresh corrects it',
        reset: 'resets in {time}',
        overLimit: 'over limit',
        usedOf: '{label} used',
        usedSuffix: 'used',
        requests: '{count} requests · {rate}%',
        tokens: 'in {in} / out {out}',
        balance: 'Extra credit',
        belowThreshold: 'credit is below the configured threshold',
        subCanceled: 'Subscription canceled, ends {date}',
        subStatus: 'Subscription: {status}',
        billing: 'View plans and credits',
        none: 'this plan reports no credit windows',
        degraded: '{count} reading(s) unavailable this time; retrying shortly',
        retry: 'click to retry',
        stale: 'last success {age} ago',
        errNetwork: 'cannot reach Command Code',
        errAuth: 'the API key was rejected',
        errRate: 'too many requests; retrying shortly',
        errNotFound: 'this plan has no API access',
        errGeneric: 'could not read the account',
      },
    }

    /*
     * A small type scale, not one size: 16px for the brand mark, 13px for the
     * percentage the resting strip leads with, 12px for the limit rows and the
     * money line, 11px for everything that is a caption — plan badge, reset
     * countdown, billing link, totals. The scale is load-bearing rather than
     * decorative: at the sidebar's 196px of content width the bracket of
     * "Command Code" mark + plan badge + "View plans and credits" only fits
     * because the link is set at 11px. Weight marks the numbers.
     */
    const CSS = `
.ccq-card{box-sizing:border-box;width:100%;margin:0 0 6px;padding:10px 14px;border-radius:10px;
  border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);
  color:var(--dsw-alias-label-primary);font-family:inherit;text-align:left;
  font-size:12px;line-height:16px;cursor:pointer}
.ccq-card:hover{background:var(--dsw-alias-button-floating-hover)}
.ccq-card.ccq-stale{opacity:.62}
/* Resting: one line, and the padding comes in with it. */
.ccq-card.ccq-mini{padding:8px 14px}
.ccq-strip{display:flex;align-items:center;gap:8px;line-height:1.2}
.ccq-mark{flex:none;font-size:16px;line-height:1;font-weight:500;color:var(--dsw-alias-label-primary)}
.ccq-plan{flex:none;max-width:104px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  padding:1px 6px;border-radius:6px;font-size:11px;line-height:16px;
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
/* One meter, two parents: the strip's flex line, and a limit row's grid cell. */
.ccq-bar{min-width:0;height:4px;border-radius:2px;overflow:hidden;
  background:var(--dsw-alias-interactive-bg-hover)}
.ccq-bar-fill{display:block;height:100%;border-radius:2px;
  transition:width 240ms ease,background 240ms ease}
.ccq-strip .ccq-bar{flex:1 1 0}
/* The meter is the only part of the strip that gives: it repeats a number that is
   printed beside it, so at 200px it shrinks before the countdown or the plan
   badge lose a character. A fixed minimum here pushed the countdown past the
   card's own padding. */
.ccq-strip .ccq-pct{margin-left:auto;font-size:13px;font-weight:500;
  font-variant-numeric:tabular-nums}
.ccq-reset{flex:none;font-size:11px;color:var(--dsw-alias-label-caption);
  font-variant-numeric:tabular-nums;white-space:nowrap}
/* Unfolded: header, the three limit rows, the money line, then the totals. */
.ccq-head{display:flex;align-items:center;justify-content:space-between;gap:4px 8px;
  flex-wrap:wrap;padding-bottom:8px;-webkit-user-select:none;user-select:none;
  border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ccq-head-left{display:flex;align-items:center;gap:8px;min-width:0}
.ccq-link{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-link);
  text-decoration:none}
.ccq-link:hover{text-decoration:underline}
.ccq-limits{display:grid;gap:6px;padding:8px 0 6px}
.ccq-row{display:grid;grid-template-columns:54px minmax(16px,1fr) auto auto;
  align-items:center;column-gap:8px}
.ccq-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.ccq-row .ccq-pct{font-size:12px;font-weight:500;text-align:right;
  font-variant-numeric:tabular-nums}
.ccq-cost{display:flex;align-items:baseline;justify-content:space-between;gap:2px 8px;
  flex-wrap:wrap;padding-top:8px;border-top:.5px solid var(--dsw-alias-border-l1);
  font-size:12px}
.ccq-cost-used{font-weight:500;color:var(--dsw-alias-label-primary);
  font-variant-numeric:tabular-nums}
.ccq-cost-used span{margin-left:4px;font-weight:400;color:var(--dsw-alias-label-caption)}
.ccq-cost-left{font-weight:500;font-variant-numeric:tabular-nums}
.ccq-stats{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-caption);
  font-variant-numeric:tabular-nums}
.ccq-warn{display:flex;align-items:center;gap:6px;margin-top:10px;padding:6px 8px;border-radius:7px;
  font-size:11px;line-height:15px;background:var(--dsw-alias-interactive-bg-hover-danger);
  color:var(--dsw-alias-state-error-primary)}
.ccq-note{margin-top:6px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-caption);
  font-variant-numeric:tabular-nums}
.ccq-note+.ccq-note{margin-top:1px}
.ccq-error{font-size:12px;line-height:17px;color:var(--dsw-alias-state-error-primary)}
.ccq-rail{box-sizing:border-box;width:36px;height:36px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums;border:none;background:transparent}
`

    /** Inject the panel stylesheet once per document. */
    function ensureStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** Substitute `{name}` placeholders; the locale service owns the wording only. */
    function format(template, params) {
      return Object.entries(params ?? {})
        .reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), String(template))
    }

    /** Native colour token for a used percentage; unknown reads as neutral. */
    function levelToken(percent) {
      if (percent === undefined) return 'var(--dsw-alias-label-caption)'
      const level = LEVELS.find((entry) => percent < entry.below)
      return level === undefined ? LEVELS[LEVELS.length - 1].color : level.color
    }

    function money(value) {
      return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '—'
    }

    /**
     * A percentage straight from the report, clamped into range.
     *
     * The host clamps too, but the card does not assume it: an over-drawn
     * window must never render as "107%", and a nonsensical negative must never
     * render as "-3%". The "over limit" chip carries that fact instead.
     */
    function percentOf(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      return Math.max(0, Math.min(100, value))
    }

    function percentText(value) {
      const clamped = percentOf(value)
      return clamped === undefined ? '—' : `${clamped.toFixed(1)}%`
    }

    /**
     * Glance value for the row headline: a whole percent, rounded the way the
     * official dashboard rounds. The underlying report keeps full precision, so
     * a card showing "100%" and a tooltip showing "99.8%" are the same truth at
     * two roundings — and the card never disagrees with the website's number.
     */
    function headlinePercent(value) {
      const clamped = percentOf(value)
      return clamped === undefined ? '—' : `${Math.round(clamped)}%`
    }

    function tokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
      return String(value)
    }

    /** Local wall clock for one epoch-millisecond instant. */
    function when(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return undefined
      const target = new Date(timestamp)
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(target.getMonth() + 1)}-${pad(target.getDate())} ${pad(target.getHours())}:${pad(target.getMinutes())}`
    }

    /** Terse countdown for the row chip: `59m`, `3h25m`, `6d9h`. */
    function shortCountdown(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return undefined
      // A reset instant that has already passed leaves nothing to count down to.
      // `0m 后重置` beside unmoving numbers reads as a frozen card, so the chip
      // goes away; the tooltip still carries the absolute instant.
      const minutes = Math.floor((timestamp - Date.now()) / 60_000)
      if (minutes <= 0) return undefined
      if (minutes < 60) return `${minutes}m`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours}h${minutes % 60}m`
      return `${Math.floor(hours / 24)}d${hours % 24}h`
    }

    /** Coarse age of a timestamp, for the stale marker. */
    function ageOf(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return undefined
      const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
      if (minutes < 1) return '<1m'
      if (minutes < 60) return `${minutes}m`
      const hours = Math.floor(minutes / 60)
      return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
    }

    /**
     * Normalize the report's windows into one render shape.
     *
     * The host derives caps and percentages from the account's own plan, so a
     * plan that reports no window (pay-as-you-go Provider, say) yields no row.
     *
     * @param report - the host's normalized quota report.
     * @returns one row per window the account actually reports.
     */
    function windowsOf(report) {
      const periodEnd = report?.plan?.currentPeriodEnd === undefined
        ? undefined
        : Date.parse(report.plan.currentPeriodEnd)
      const rows = []
      for (const { key, label } of WINDOWS) {
        const source = key === 'monthly' ? report?.monthly : report?.[key]
        if (source === undefined || source === null) continue
        const percent = typeof source.percent === 'number' ? source.percent : undefined
        const used = typeof source.used === 'number' ? source.used : undefined
        const cap = typeof source.cap === 'number' && source.cap > 0 ? source.cap : undefined
        if (percent === undefined && cap === undefined) continue
        rows.push({
          key,
          label,
          percent,
          used,
          cap,
          // Clamped at zero: the report keeps the vendor's raw figure, but a
          // negative "remaining" reads as a rendering bug on a plan card. An
          // overdrawn allowance is already saying "nothing left" through the
          // red bar and the 100% headline.
          remaining: used !== undefined && cap !== undefined ? Math.max(0, cap - used) : undefined,
          resetAt: key === 'monthly' ? periodEnd : source.resetAt,
          exceeded: source.exceeded === true,
          // Set by the host when the two endpoints behind the monthly figures
          // cannot both describe the same instant. The figures are forwarded
          // as-is, but nothing built from them may be presented as fact.
          capSuspect: key === 'monthly' && source.capSuspect === true,
        })
      }
      return rows
    }

    /**
     * The one window the resting card shows.
     *
     * The monthly allowance is what a user budgets against, so it is the row the
     * card spends its default space on — but only while its percentage is real.
     * A plan that reports no monthly window (a pay-as-you-go Provider, say), or
     * one whose monthly read straddled a billing boundary and was withheld,
     * falls back to the tightest trustworthy row rather than resting on a bare
     * dash. That is the rule the collapsed rail badge already applies, so the one
     * number on screen means the same thing in both sidebar widths. Rounded
     * before comparing, so two rows that both read `60%` cannot make the choice
     * flip between refreshes.
     */
    function headlineRow(rows) {
      const monthly = rows.find(
        (row) => row.key === 'monthly' && row.percent !== undefined && row.capSuspect !== true,
      )
      if (monthly !== undefined) return monthly
      return rows.reduce(
        (worst, row) => (worst === undefined || Math.round(row.percent ?? 0) > Math.round(worst.percent ?? 0) ? row : worst),
        undefined,
      )
    }

    /**
     * True when some window is close enough to its cap to poll faster.
     *
     * "Close to" excludes "past": see {@link SPENT_PERCENT}.
     */
    function anyHot(report) {
      return windowsOf(report).some((row) => {
        const percent = percentOf(row.percent)
        return percent !== undefined && percent >= HOT_PERCENT && percent < SPENT_PERCENT
      })
    }

    /** On-demand balance, for accounts that buy credit instead of holding an allowance. */
    function balanceOf(report) {
      const free = report?.monthly?.freeCredits
      const purchased = report?.monthly?.purchasedCredits
      if ((free ?? 0) === 0 && (purchased ?? 0) === 0) return undefined
      return { free: free ?? 0, purchased: purchased ?? 0 }
    }

    /** Everything worth warning about, in priority order. */
    function warningsOf(report, t) {
      const warnings = []
      if (report?.monthly?.belowThreshold === true) warnings.push(t('belowThreshold'))
      const plan = report?.plan
      if (plan?.cancelAtPeriodEnd === true) {
        warnings.push(format(t('subCanceled'), { date: when(Date.parse(plan.currentPeriodEnd)) ?? '—' }))
      } else if (plan?.status !== undefined && plan.status !== 'active') {
        warnings.push(format(t('subStatus'), { status: plan.status }))
      }
      return warnings
    }

    function describeError(result) {
      if (result !== null && typeof result === 'object' && typeof result.error?.message === 'string') {
        return result.error.message
      }
      return 'unrecognized response'
    }

    /**
     * Turn a host error message into something readable in a 200 px sidebar.
     *
     * The host's message is diagnostic — it names endpoints and status codes —
     * which is right for a log and wrong for a card: a wall of stacked lines in a
     * narrow column reads as a rendering bug. Known codes become one short line,
     * the full text stays one hover away, and an unknown code falls back to the
     * message itself, because a card that says nothing is worse than one that says
     * something clumsy.
     */
    function errorText(message, t) {
      const code = /^\[([A-Z_]+)\]/.exec(String(message ?? ''))?.[1]
      const keys = {
        NETWORK: 'errNetwork',
        SERVICE: 'errNetwork',
        AUTH: 'errAuth',
        RATE_LIMIT: 'errRate',
        NOT_FOUND: 'errNotFound',
        BAD_RESPONSE: 'errGeneric',
        MISSING_CREDENTIAL: 'errGeneric',
      }
      const key = keys[code]
      return key === undefined ? String(message ?? '') : t(key)
    }

    /**
     * Fetch the report, then keep fetching on a cadence that tightens while any
     * window is close to its cap. The last good report survives failures, so a
     * transient error dims the numbers instead of blanking the card.
     *
     * @param fetchQuota - transport callback injected by this plugin's apply.
     * @returns the current state plus a manual refresh.
     */
    function useQuota(fetchQuota) {
      const [state, setState] = React.useState({ phase: 'idle' })
      const [nonce, setNonce] = React.useState(0)

      React.useEffect(() => {
        const controller = new AbortController()
        let timer
        // How many answers in a row have been snapshots. The first one earns a
        // quick re-read — a live report is already on its way, and this is the
        // moment the user is actually looking at the card. If they keep coming,
        // the host is having trouble upstream and hammering it every few seconds
        // would help nobody.
        let staleStreak = 0
        const load = () => {
          const fail = (message) => {
            setState((previous) => ({ phase: 'error', message, report: previous.report, at: previous.at }))
            timer = window.setTimeout(load, SLOW_MS)
          }
          // Promise.resolve() turns a synchronous throw from the transport into
          // a rejection, so the card reports it instead of unmounting.
          Promise.resolve()
            .then(() => fetchQuota(controller.signal))
            .then(
              (result) => {
                if (controller.signal.aborted) return
                if (result === null || typeof result !== 'object' || result.ok !== true) {
                  fail(describeError(result))
                  return
                }
                const value = result.value
                if (value !== null && typeof value === 'object' && value.configured === false) {
                  // This host does not use Command Code: stay invisible, but ask
                  // again on a slow cadence rather than never — see ABSENT_MS.
                  setState({ phase: 'absent' })
                  timer = window.setTimeout(load, ABSENT_MS)
                  return
                }
                setState({ phase: 'ready', report: value, at: Date.now() })
                const isSnapshot = value.stale === true
                staleStreak = isSnapshot ? staleStreak + 1 : 0
                timer = window.setTimeout(
                  load,
                  isSnapshot
                    ? (staleStreak === 1 ? REVALIDATE_MS : SLOW_MS)
                    : (anyHot(value) ? FAST_MS : SLOW_MS),
                )
              },
              (error) => {
                if (controller.signal.aborted) return
                fail(String(error?.message ?? error))
              },
            )
        }
        load()
        return () => {
          window.clearTimeout(timer)
          controller.abort()
        }
      }, [fetchQuota, nonce])

      const refresh = React.useCallback(() => { setNonce((value) => value + 1) }, [])
      return { state, refresh }
    }

    /** The brand mark: the plugin's own face on both states of the card. */
    function Mark() {
      return h('span', { className: 'ccq-mark', title: 'Command Code', 'aria-label': 'Command Code' }, '⌘')
    }

    /**
     * The resting card: one horizontal line, no header and no window label.
     *
     * Reading order is left to right — brand mark, plan, meter, used percentage,
     * reset countdown — so the whole answer fits in the height of a line and the
     * sidebar keeps its room for the transcript above it. The window the strip
     * speaks for is not printed: the meter and the countdown carry it on their
     * tooltips, which is the same bargain the rest of the card makes.
     *
     * @param props.row - the window `headlineRow` picked.
     * @param props.planName - the account's plan, straight from the report.
     */
    function SummaryStrip({ row, planName, t }) {
      const percent = percentOf(row.percent)
      const countdown = shortCountdown(row.resetAt)
      const reset = row.exceeded
        ? t('overLimit')
        : countdown === undefined ? undefined : `↻ ${countdown}`
      return h('div', { className: 'ccq-strip' },
        h(Mark),
        h('span', { className: 'ccq-plan', title: planName }, planName),
        // No percentage means no fill — a zero-width bar reads as "0% used" — and
        // the auto margin on the percentage still holds the numbers right.
        percent === undefined ? h('span', { className: 'ccq-bar' }) : h('span', {
          className: 'ccq-bar',
          title: `${format(t('usedOf'), { label: t(row.label) })} ${percentText(percent)}`,
        },
          h('span', {
            className: 'ccq-bar-fill',
            style: { width: `${Math.max(0, Math.min(100, percent))}%`, background: levelToken(percent) },
          }),
        ),
        h('span', { className: 'ccq-pct' }, headlinePercent(percent)),
        reset === undefined ? null : h('span', {
          className: 'ccq-reset',
          title: `${t(row.label)} · ${format(t('reset'), { time: countdown ?? '—' })}`,
        }, reset),
      )
    }

    /**
     * One credit window, as a line of a fixed grid: label, meter, percentage,
     * countdown. The grid is what lines the three rows up — the label column is
     * fixed so the meters share one left edge, and the percentage and countdown
     * columns size to their widest cell, which keeps `5%` and `100%` right-aligned
     * against each other without a fixed width that would clip a longer value.
     */
    function LimitRow({ row, t }) {
      const percent = percentOf(row.percent)
      const countdown = shortCountdown(row.resetAt)
      const tips = [
        row.capSuspect ? t('straddle') : undefined,
        !row.capSuspect && row.used !== undefined && row.cap !== undefined
          ? `${format(t('usedOf'), { label: t(row.label) })} ${money(row.used)} / ${money(row.cap)}`
          : undefined,
        !row.capSuspect && row.remaining !== undefined ? `${t('left')} ${money(row.remaining)}` : undefined,
        // The exact reset instant stays one hover away even though the row only
        // carries the countdown.
        row.resetAt === undefined ? undefined : when(row.resetAt),
      ].filter((part) => part !== undefined)
      const reset = row.exceeded
        ? t('overLimit')
        : countdown === undefined ? undefined : `↻ ${countdown}`
      // Each row carries its own tooltip: exact amounts, remaining credit, and
      // the absolute reset instant, none of which cost a line in the sidebar.
      return h('div', { className: 'ccq-row', title: tips.join(' · ') },
        h('span', { className: 'ccq-label' }, t(row.label)),
        // One row with no reported percentage still holds the column open with an
        // empty meter, so the three rows keep their shared grid.
        percent === undefined ? h('span', { className: 'ccq-bar' }) : h('span', { className: 'ccq-bar' },
          h('span', {
            className: 'ccq-bar-fill',
            style: { width: `${Math.max(0, Math.min(100, percent))}%`, background: levelToken(percent) },
          }),
        ),
        // The number keeps the card's text colour. The state greens and ambers
        // are fill colours — on a white card the green lands near 2.3:1 — and the
        // meter beside it shows the level.
        h('span', { className: 'ccq-pct' }, headlinePercent(percent)),
        h('span', { className: 'ccq-reset' }, reset ?? ''),
      )
    }

    /**
     * The unfolded card's money line and totals.
     *
     * Only the monthly window gets money. The rolling windows are pass/fail
     * limits, not budgets — their dollar figures tell a user nothing they can act
     * on, and the sidebar has no space to spend on decoration. Used and left sit
     * on one line, the way the eye reads a balance: what went out on the left,
     * what is still there on the right, both exact.
     */
    function detailRows(report, rows, t) {
      const body = []
      const monthly = rows.find((row) => row.key === 'monthly')
      const trustMonthly = monthly !== undefined && monthly.capSuspect !== true
      if (trustMonthly && monthly.used !== undefined && monthly.cap !== undefined) {
        body.push(h('div', { key: 'cost', className: 'ccq-cost' },
          h('span', { className: 'ccq-cost-used' },
            `${money(monthly.used)} / ${money(monthly.cap)}`,
            h('span', null, t('usedSuffix')),
          ),
          monthly.remaining === undefined ? null : h('span', {
            className: 'ccq-cost-left',
            // The number that decides whether the month still works carries the
            // same colour as the monthly bar.
            style: { color: levelToken(percentOf(monthly.percent)) },
          }, `${money(monthly.remaining)} ${t('left')}`),
        ))
      }
      if (monthly !== undefined && monthly.capSuspect === true) {
        // Say why the numbers went away instead of leaving a bare dash: the read
        // straddled a period boundary, and the next poll will fix it.
        body.push(h('div', { key: 'straddle', className: 'ccq-note' }, t('straddle')))
      }

      const balance = balanceOf(report)
      if (balance !== undefined) {
        body.push(h('div', { key: 'balance', className: 'ccq-stats' },
          `${t('balance')} ${money(balance.free)} · ${money(balance.purchased)}`))
      }

      const totals = report?.totals
      if (totals?.requests !== undefined) {
        body.push(h('div', { key: 'totals', className: 'ccq-stats' },
          `${format(t('requests'), {
            count: totals.requests.toLocaleString('en-US'),
            rate: totals.successRate ?? '—',
          })} · ${format(t('tokens'), { in: tokens(totals.tokensIn), out: tokens(totals.tokensOut) })}`))
      }
      return body
    }

    /** Tooltip / rail summary: the percentages, which are the card's own headline. */
    function summaryTitle(rows, t) {
      return rows
        .map((row) => (row.capSuspect
          ? `${t(row.label)} ${t('straddle')}`
          : `${t(row.label)} ${percentText(row.percent)}${row.remaining === undefined ? '' : ` (${t('left')} ${money(row.remaining)})`}`))
        .join(' · ')
    }

    /** The 36px rail badge shown while the sidebar is collapsed. */
    function RailBadge({ state, t }) {
      if (state.report === undefined) return null
      const rows = windowsOf(state.report)
      // The most constrained window, not the shortest one: a collapsed rail has
      // room for a single number and the alarming one is the useful one. Rounded
      // before comparing, so two rows that both read `60%` cannot make the badge
      // flip colour between refreshes.
      const headline = rows.reduce(
        (worst, row) => (worst === undefined || Math.round(row.percent ?? 0) > Math.round(worst.percent ?? 0) ? row : worst),
        undefined,
      )
      if (headline === undefined) return null
      return h('div', {
        className: 'ccq-rail',
        title: summaryTitle(rows, t),
        style: { color: levelToken(headline.percent) },
      }, headlinePercent(headline.percent))
    }

    /** The sidebar-foot card. */
    function QuotaCard(props) {
      // How much of the card is unfolded — see STAGE_SUMMARY and friends.
      const [stage, setStage] = React.useState(STAGE_SUMMARY)
      const { state, refresh } = useQuota(props.fetchQuota)
      const t = props.t

      // Nothing to say: this host does not use Command Code, or the first answer
      // has not arrived. Rendering nothing avoids an error box for non-users and
      // a flash of skeleton for everyone else.
      if (state.phase === 'absent' || state.phase === 'idle') return null
      if (props.wide === false) return h(RailBadge, { state, t })

      const report = state.report
      const rows = report === undefined ? [] : windowsOf(report)
      // Two ways to be showing something other than a live reading: an answer
      // the host marked as its last snapshot, and a failed refresh after a good
      // one. Both dim the numbers. The age of the reading does not get a line of
      // its own any more — see the card tooltip below — because a dimmed card
      // already says "not live", and the sidebar has no height to spare for
      // saying it twice.
      const stale = state.phase === 'error' ? report !== undefined : report?.stale === true
      const staleAt = report?.stale === true && typeof report.staleAgeMs === 'number'
        ? Date.now() - report.staleAgeMs
        : state.at
      const planName = report?.plan?.name ?? 'Command Code'
      // The one-line card is a different shape, not a smaller one: no header, no
      // window label, its own padding. Everything below it — alerts, the retry
      // hint, the "no windows" note — keeps the boxed padding.
      const mini = stage === STAGE_SUMMARY && report !== undefined && rows.length > 0
      const degraded = report === undefined || !Array.isArray(report.failures) ? 0 : report.failures.length
      // Account-level warnings stay on screen at every stage: hiding "subscription
      // canceled" behind a click would be a disservice, and a healthy account has
      // none to show. Same for a window that vanished because its endpoint failed.
      const alerts = report === undefined ? [] : [
        ...warningsOf(report, t).map((warning, index) => h('div', {
          key: `warn-${String(index)}`,
          className: 'ccq-warn',
        }, warning)),
        degraded === 0 ? null : h('div', { key: 'degraded', className: 'ccq-note' }, format(t('degraded'), { count: degraded })),
      ].filter((part) => part !== null)

      let body
      if (report === undefined) {
        // The short line is what a user can act on; the host's own diagnostic
        // message stays on the tooltip for whoever is debugging.
        body = [
          h('div', { key: 'error', className: 'ccq-error', title: state.message }, errorText(state.message, t)),
          h('div', { key: 'hint', className: 'ccq-error' }, t('retry')),
        ]
      } else if (rows.length === 0) {
        body = [h('div', { key: 'none', className: 'ccq-note' }, t('none'))]
      } else if (mini) {
        body = [h(SummaryStrip, { key: 'strip', row: headlineRow(rows), planName, t }), ...alerts]
      } else {
        body = [
          h('div', { key: 'limits', className: 'ccq-limits' },
            ...rows.map((row) => h(LimitRow, { key: row.key, row, t })),
          ),
          ...detailRows(report, rows, t),
          ...alerts,
        ]
      }

      // A failed read keeps the old retry behaviour: the click that would unfold
      // the card re-asks instead, which is the only thing it can usefully do.
      const toggle = () => {
        if (report === undefined) { refresh(); return }
        setStage((value) => (value + 1) % STAGE_COUNT)
      }
      const unfolded = stage > STAGE_SUMMARY

      return h('div', {
        className: `ccq-card${mini ? ' ccq-mini' : ''}${stale ? ' ccq-stale' : ''}`,
        // Everything the folded card does not have room to say lives here: each
        // window's exact figures, why a window is missing, and — when the card is
        // dimmed — how old the reading is. The strip's own parts carry the window
        // they speak for, since the strip itself prints no label.
        title: [
          rows.length === 0 ? undefined : summaryTitle(rows, t),
          stale ? format(t('stale'), { age: ageOf(staleAt) ?? '—' }) : undefined,
          report?.failures?.length > 0 ? `⚠ ${report.failures.join(' · ')}` : undefined,
        ].filter((part) => part !== undefined).join('\n'),
        role: 'button',
        tabIndex: 0,
        'aria-expanded': report !== undefined && unfolded,
        onClick: toggle,
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          toggle()
        },
      },
        // The strip is header and body at once, so the boxed header — mark,
        // plan, and the way out to the billing page — only appears once there is
        // something unfolded under it. The link is the header's own: it is the
        // one thing on the card that leaves, and it must not read as a toggle.
        mini ? null : h('div', { className: 'ccq-head' },
          h('div', { className: 'ccq-head-left' }, h(Mark), h('span', { className: 'ccq-plan', title: planName }, planName)),
          h('a', {
            className: 'ccq-link',
            href: BILLING_URL,
            target: '_blank',
            rel: 'noreferrer',
            onClick: (event) => { event.stopPropagation() },
          }, t('billing')),
        ),
        ...body,
      )
    }

    /**
     * Register this plugin's UI dictionaries and the card itself, the latter once
     * the sidebar declares the footer-action hole.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      ensureStyles()
      // The dictionaries still register — they are this plugin's public copy, and
      // the Chinese table is what keeps this fork diffable against upstream — but
      // the card itself no longer binds to the interface language: in this fork
      // every surface the card draws is English, whatever `dsh` is set to.
      ctx.effect(() => ctx.locale.register(NS, DICT), 'cc-quota: dictionaries')
      const t = (key) => DICT.en[key] ?? key
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'cc-quota',
        order: 0,
        inject: () => ({
          fetchQuota: (signal) => ctx.connection.rpc.call(CHANNEL, ENDPOINT, {}, signal),
          t,
        }),
      }, QuotaCard))
    }

    exports.apply = apply
    exports.inject = ['slots', 'connection', 'locale']
    return module.exports
  },
})
