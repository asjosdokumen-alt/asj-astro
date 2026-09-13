# Phase C — sink setup (METRICS_SINK_URL · Grafana Cloud OTLP)

How to give the metrics sink a destination, from zero to a working gate.
Written for `docs/PHASE_C_OBSERVABILITY.md` §4.3 + §6.

**Two destinations, both optional, independent of each other:**

| Variable | Speaks | Use |
|---|---|---|
| `METRICS_SINK_URL` (+`_TOKEN`) | this repo's own payload shape | your own receiver, or a Discord webhook to satisfy the gate today |
| `GRAFANA_CLOUD_OTLP_ENDPOINT` + `GRAFANA_CLOUD_BASIC_AUTH_HEADER` | OTLP | Grafana Cloud — the only hosted backend with a purpose-built exporter (§2b) |

---

## 1. What the sink actually sends

You are choosing a URL that will receive a `POST` like this, roughly once per
function invocation:

```json
{
  "counters": {
    "handler.invoke.action=getAppData": 3,
    "dependency.call.dep=postgrest.outcome=success": 7,
    "dependency.call.dep=postgrest.outcome=error": 1,
    "handler.error.action=getAppData.code=PG_TIMEOUT": 1
  },
  "histograms": {
    "handler.latency.action=getAppData": { "count": 3, "avg": 120, "p50": 110, "p95": 240, "max": 260 },
    "dependency.call.latency.dep=postgrest": { "count": 8, "avg": 41, "p50": 38, "p95": 90, "max": 95 }
  },
  "gauges": { "sweep.duration_ms": 812 }
}
```

Three properties matter for choosing a receiver:

| Property | Value | Consequence |
|---|---|---|
| Method | `POST` only | The receiver must accept POST. |
| Timeout | **2 s** (`SINK_TIMEOUT_MS`) | A slow receiver is silently dropped. Fine for webhooks; fatal for a cold serverless endpoint. |
| Retry | **none, by design** | Losing a sample is acceptable. Do not build a receiver that assumes every sample arrives. |
| Auth | `Authorization: Bearer <METRICS_SINK_TOKEN>` — omitted entirely when no token is set | A receiver needing no auth is fine. |

**Key format:** labels are appended by the kernel as `.key=value`
(`kernel/metrics.ts` `increment()`), so `increment('dependency.call', {dep, outcome})`
becomes the counter key `dependency.call.dep=postgrest.outcome=error`. Parse on the
first `.segment=value` boundary.

**Not in the payload:** breaker state. It lives only in `kernel/resilience.ts`
(`snapshot()`, `openCount()`) and is read by `_lib/health.ts`. So alert **A5**
("breaker open > 2 min") is evaluated from `/.netlify/functions/health`, not from a counter.

---

## 2. Which receiver to pick

### Option A — Discord webhook  ⭐ recommended to satisfy the gate today

**Effort: ~2 minutes. No third-party account, no code.**

1. Open Discord → your server → **Server Settings → Integrations → Webhooks**
2. **New Webhook** → pick a channel (create `#asj-alerts` if you want it clean)
3. **Copy Webhook URL** — it looks like
   `https://discord.com/api/webhooks/123456789/AbCdEf...`
4. Paste it as `METRICS_SINK_URL` (see §3)

Then Discord will show raw payloads in the channel. Enough to prove the pipeline
works and complete the §6 gate.

**Limitation, stated honestly:** Discord cannot evaluate alert rules. A5 wants
"breaker open **> 2 min**" — that is a condition over a window, and a raw webhook
has no memory. You will see the raw counters and have to judge them yourself.

### Option B — the included receiver  ⭐ for alerts that actually fire

**Effort: ~5 minutes. No third-party account.**

`netlify/functions/metrics-receiver.ts` in this repo is a working receiver that
evaluates the saturation-side rules (§4.1 A3, A6, and upstream failure bursts)
and notifies on **transitions**, not on every sample:

```bash
# 1. A secret so the endpoint is not world-writable (fail-closed, like /.netlify/functions/health)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Point the sink at your own site's receiver
netlify env:set METRICS_SINK_URL "https://<your-site>/.netlify/functions/metrics-receiver" --context production
netlify env:set METRICS_SINK_TOKEN "<the secret from step 1>" --secret --context production

# 3. Give the receiver the same secret, plus somewhere to shout
netlify env:set METRICS_RECEIVER_TOKEN "<the same secret>" --secret --context production
netlify env:set METRICS_NOTIFY_URL "https://discord.com/api/webhooks/..." --context production
```

Keep it a **separate function from `health.js`** (§4.3) so a broken receiver
cannot take down the probe that diagnoses the incident.

> **Measured status, 2026-09-13 — Option B is deployed but NOT wired.**
> The function ships in production (a `POST` to
> `/.netlify/functions/metrics-receiver` answers **503**, not 404 — so it exists
> and is failing closed), but **all three of its variables are absent** from the
> site's 24 env vars: `METRICS_SINK_URL`, `METRICS_RECEIVER_TOKEN`,
> `METRICS_NOTIFY_URL`. The exact body returned today is
> `{"ok":false,"error":"METRICS_RECEIVER_TOKEN not configured"}`.
> So the receiver is **dead code in production** until those are set, and this
> option is one `env:set` command away rather than "not built yet" — which is
> what `BACKEND_TODO.md` #7 used to imply.
>
> Also note what it can and cannot cover: breaker state, queue depth, and
> dead-letter counts are **not in the metrics payload** (`metrics-receiver.ts`
> documents this at its header). A4/A5/A7 need `/health` or a direct DB query;
> only A6 and the error-burst approximation are evaluable from counters alone.

**Its state is in-memory and lossy across cold starts.** That is the honest
limitation §4.3 flags. It is correct for a warm instance and good enough to
catch a sustained incident; swap `AlertStore` for a Postgres-backed store when
you need durable windows.

### Option C — hosted APM (Datadog, Better Stack, Grafana Cloud)

**Grafana Cloud is now first-class — see §2b below.** It is the one hosted
backend this repo speaks to directly, because the owner supplied credentials on
2026-09-13 and an OTLP exporter was added for it.

Datadog and Better Stack still work only *behind* a receiver (Option B): point
`METRICS_SINK_URL` at your own endpoint and have that endpoint forward. The
reason §2 of the Phase C doc rejected a direct APM SDK still applies to them —
*"another account, another secret, another vendor in the critical path, and
another quota to exhaust"* — and it is worth noting the Grafana path does NOT
escape that criticism: it accepts it deliberately, because A1–A7 cannot fire at
all without a backend that remembers a window. That is the failure the cost
prevents.

### Option D — leave it unset

**This is a valid choice.** `_lib/metrics-sink.ts` rule 1 is *absent ⇒ no-op*,
and it logs `metrics.sink.disabled` exactly once. `/.netlify/functions/health` keeps working fully.
You lose fleet-wide visibility, which §3.3 notes is the one thing `/.netlify/functions/health`
cannot give you (it answers from a single instance).

**This is the state of the production site as of 2026-09-13** — neither
`METRICS_SINK_URL` nor the Grafana pair is present among the 22 site env vars.
Consequence: the §6 gate's step 2 ("watch the sink") cannot pass, and no alert
can ever fire. Steps 1, 3 and 4 are unaffected.

---

## 2b. Grafana Cloud over OTLP — a second, independent destination

Added 2026-09-13. This is **not** an alternative value for `METRICS_SINK_URL`:
Grafana Cloud speaks OTLP and nothing else, so it gets its own exporter
(`netlify/functions/_lib/otlp.ts`) and its own two variables. Either destination
may be set alone, both together, or neither.

### Why metrics and not logs

The payload can be sent as OTLP logs (one record per flush) or OTLP metrics.
It is sent as **metrics**, because §6 requires "an injected PostgREST failure
produces an alert within 2 minutes" and A1–A7 are threshold rules over windows.
A metrics backend evaluates those natively. Volume also favours it: one data
point per flush aggregates server-side, where one log line per flush is retained
as-is.

### What the translation does

**Every data point is a gauge.** That is not the obvious design, and it is worth
reading why before changing it — the first version of this exporter was wrong and
would have shipped dead.

| Payload | OTLP | Why |
|---|---|---|
| `counters` | `gauge` | The kernel clears its maps on every flush, so the honest value is "N events in this invocation". A delta `sum` is the textbook shape for that — and the gateway **rejects it with HTTP 400** (see below). A cumulative `sum` is accepted but under-counts. A gauge is exact under `sum_over_time()`. |
| `gauges` | `gauge` | Point-in-time values. Unchanged. |
| `histograms[*].count` | `gauge` | Observations in this invocation — same reasoning as `counters`. |
| `histograms[*].avg/p50/p95/max` | `gauge`, name suffixed `_avg`/`_p50`/`_p95`/`_max` | The payload carries pre-computed percentiles, not bucket counts, so an OTLP `histogram` (which needs `bucketCounts` + `explicitBounds`) cannot represent it without inventing a distribution. The suffixed gauge matches what a Grafana user already expects: `handler_latency_p95 > 500`. |

Names are sanitised here (dots → underscores), so `handler.latency` becomes the
series `handler_latency_p95` — predictable from the repo, not dependent on the
receiver's sanitiser.

#### Measured 2026-09-13: the gateway rejects DELTA

Probed against the live gateway with all four temporality × monotonicity
combinations:

```
sum, delta,      monotonic=true   -> HTTP 400  "invalid temporality and type combination"
sum, delta,      monotonic=false  -> HTTP 400
sum, cumulative, monotonic=true   -> HTTP 200
sum, cumulative, monotonic=false  -> HTTP 200
gauge                             -> HTTP 200
```

Two things made this easy to miss, and both are worth remembering:

- A **gauge-only** smoke test passes, so an early hand-written probe said "the
  credential works" while the real payload was being rejected. Test the ACTUAL
  generated body, not a convenient one.
- The exporter is fire-and-forget, so the failure is a `metrics.otlp.rejected`
  log line with `status: 400` — visible, but only if you look.

#### Cumulative is accepted, and still the wrong choice

Cumulative is tempting because the gateway takes it. But our counters cannot be
made cumulative — the producer is an ephemeral function instance with no memory
between invocations. Sending per-invocation values as a cumulative sum makes the
backend see a counter that resets on every sample, and a reset contributes only
the NEW value, so interleaved instances under-count. Five consecutive samples
`3, 1, 5, 2, 4` from one series:

```
observed increase = 3→1(reset,+1) +1→5(+4) +5→2(reset,+2) +2→4(+2) = 9
actual events                                                      = 15
```

A gauge gives the exact answer, because summing sample values over a window is
the total for that window.

#### So query counts with `sum_over_time`, not `rate`

```promql
# errors in the last 5 minutes  — correct
sum(sum_over_time(handler_error[5m]))

# WRONG: a gauge is not a counter; rate() over one is meaningless
rate(handler_error[5m])
```

Latency percentiles are ordinary gauges and read normally
(`handler_latency_p95 > 500`).

### The cardinality guard — read before adding a label

The kernel appends labels into the metric KEY as `.key=value`. Shipping every one
as a Prometheus label is how a metrics bill explodes, and one of them is
unbounded by construction:

```
recordRateLimit(action, key)  →  rate_limit.hit.action=…​.key=<client id>
```

`key` is caller-supplied. As a label it is one time series per caller, forever.
So `SHIPPED_LABELS` in `_lib/otlp.ts` is an **allow-list** (`action`, `dep`,
`outcome`, `code`) — anything else is dropped, and the drop is reported once via
`metrics.otlp.labels_dropped` so it cannot be silent. The metric itself is kept:
"we are being rate limited, per action" is still the alertable fact.

A deny-list was rejected on purpose. Its failure mode is that someone forgets to
update it, and the cost of forgetting is silent and recurring.

### Setting it up

1. **Build the header.** Grafana Cloud gives an instance ID and an API key:

   ```bash
   printf '%s' '1828153:<grafana.com API key>' | base64
   ```

   The variable's value is the **whole header**, including the scheme:

   ```
   GRAFANA_CLOUD_BASIC_AUTH_HEADER=Basic MTgyODE1MzphYmNkZWY=
   ```

   Do **not** paste the documentation placeholder verbatim
   (`Basic base64(1828153:<grafana.com API Key>)`). The exporter detects that
   string and refuses to send, logging `metrics.otlp.misconfigured` — a literal
   placeholder would otherwise produce a 401 indistinguishable from a revoked
   key.

2. **Set the endpoint** to the gateway base, without the signal path (the
   exporter appends `/v1/metrics`):

   ```
   GRAFANA_CLOUD_OTLP_ENDPOINT=https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp
   ```

3. **Set both in the Netlify UI**, scoped to the environments that should ship
   metrics. Neither is required — a missing one is a no-op, never an error — so
   neither can fail a deploy.

4. **Redeploy.** Netlify does not retroactively apply env changes to a running
   deploy (same as §4).

### Verifying it

You cannot verify this from CI — it needs the real credential. Check the function
logs for one of:

| Log event | Meaning |
|---|---|
| `metrics.otlp.sent` (debug) | Accepted by the gateway. |
| `metrics.otlp.rejected` with `status: 401` | The credential is wrong, or the placeholder guard would have caught a malformed header first. |
| `metrics.otlp.rejected` with `status: 400` | The body was refused. Historically this meant a delta `sum` — the one shape this gateway rejects. See §2b. |
| `metrics.otlp.misconfigured` | The header is empty, lacks `Basic `, or is still the placeholder. Nothing was sent. |
| `metrics.otlp.failed` with `reason: timeout` | The gateway did not answer inside 2 s. Samples are dropped, not retried — by design. |
| `metrics.otlp.labels_dropped` | A label outside the allow-list appeared. The metric still shipped. |

Then confirm the series exist in Grafana (**Explore** → the Prometheus/Mimir
datasource → query `handler_latency_p95` or `sweep_processed`).

**If nothing arrives:** check the log event first — `sent` means the gateway
accepted it and the problem is downstream (datasource, time range, or a query
that expects a counter). `rejected` with **400** means the body was refused; the
one shape known to be refused is a delta `sum`, and the structural test in
`_lib/kernel/otlp.test.ts` exists so it cannot come back unnoticed. Do not
"fix" a 400 by switching to a cumulative sum: it is accepted, but it
under-counts (see the worked example above).

Before trusting a green log line, note that the pre-flight that caught the
original bug was simply **posting the real generated body** to the gateway and
reading the status. That takes seconds and spends no build minutes:

```bash
npx esbuild netlify/functions/_lib/otlp.ts --bundle --format=cjs --platform=node \
  --outfile=/tmp/otlp-bundle.cjs     # then POST toOtlpMetrics(...) output
```

---

## 3. Setting the variables

```bash
cd F:/astro

# Discriminate the receiver URL (Option A or B)
netlify env:set METRICS_SINK_URL "https://discord.com/api/webhooks/..." \
  --context production

# Only if your receiver needs auth (Option B does)
netlify env:set METRICS_SINK_TOKEN "<secret>" --secret --context production

# Grafana Cloud (Option C / §2b) — a SECOND, independent destination.
# The endpoint is not a secret; the header is. --secret on the credential only.
netlify env:set GRAFANA_CLOUD_OTLP_ENDPOINT \
  "https://otlp-gateway-prod-ap-southeast-2.grafana.net/otlp" \
  --context production

# Build the value first — see §2b step 1:
#   printf '%s' '1828153:<api key>' | base64
netlify env:set GRAFANA_CLOUD_BASIC_AUTH_HEADER "Basic <base64>" \
  --secret --context production
```

`--secret` makes the value **write-only** — it cannot be read back, not even by
the CLI or the dashboard. That is what you want for a credential.

⚠️ **Never use `netlify env:import --replace-existing`** for this. Per this
project's own history, that flag replaces the **entire** variable set, not just
the keys in the file — it once dropped the site from 23 vars to 4. Use
`env:set` per key.

---

## 4. Redeploy, because env changes are not retroactive

Functions read `process.env` at **invocation** time, but a deploy that has
already been built keeps its bundled environment. Trigger a new deploy:

```bash
netlify deploy --build --prod
```

Verify the sink is live:

```bash
# Should print metrics.sink.disabled ONCE if unset, or metrics.sink.sent on success
netlify logs:function metrics-receiver --live
```

If you pointed at Discord (Option A), you should see a message appear in the
channel within ~2 minutes (`sweep-queue` runs on that schedule).

---

## 5. Then the §6 gate

```bash
export HEALTH_TOKEN="<the token you set>"
export SITE="https://<your-site>"

# a. liveness, no auth — must be 200 and nothing else
curl -s "$SITE/.netlify/functions/health" | jq

# b. detail, no auth — must be 401
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/.netlify/functions/health?detail=1"

# c. detail, wrong token — must be 401
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer wrong" "$SITE/.netlify/functions/health?detail=1"

# d. detail, correct token — must be 200 with the full report
curl -s -H "Authorization: Bearer $HEALTH_TOKEN" \
  "$SITE/.netlify/functions/health?detail=1" | jq '{status, reasons, pg: .shared.postgrest}'
```

Then follow §6 steps 1–4: **inject a failure** (point the DB at an unreachable
host, or block egress to `<project>.supabase.co`), watch the sink fire within
2 minutes, and ask `/.netlify/functions/health` why. Expect `status: "down"`, a `reasons` entry
naming PostgREST, and HTTP **503**.

Step 3 of that procedure is the whole point of Phase C.
