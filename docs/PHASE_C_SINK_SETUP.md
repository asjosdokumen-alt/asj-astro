# Phase C — sink setup (METRICS_SINK_URL)

How to give the metrics sink a destination, from zero to a working gate.
Written for `docs/PHASE_C_OBSERVABILITY.md` §4.3 + §6.

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
("breaker open > 2 min") is evaluated from `/health`, not from a counter.

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
# 1. A secret so the endpoint is not world-writable (fail-closed, like /health)
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

**Its state is in-memory and lossy across cold starts.** That is the honest
limitation §4.3 flags. It is correct for a warm instance and good enough to
catch a sustained incident; swap `AlertStore` for a Postgres-backed store when
you need durable windows.

### Option C — hosted APM (Datadog, Better Stack, Grafana Cloud)

Works, but §2 of the Phase C doc explicitly rejected this class of option:
*"another account, another secret, another vendor in the critical path, and
another quota to exhaust."* Choose it only if you already pay for one.

### Option D — leave it unset

**This is a valid choice.** `_lib/metrics-sink.ts` rule 1 is *absent ⇒ no-op*,
and it logs `metrics.sink.disabled` exactly once. `/health` keeps working fully.
You lose fleet-wide visibility, which §3.3 notes is the one thing `/health`
cannot give you (it answers from a single instance).

---

## 3. Setting the variables

```bash
cd F:/astro

# Discriminate the receiver URL (Option A or B)
netlify env:set METRICS_SINK_URL "https://discord.com/api/webhooks/..." \
  --context production

# Only if your receiver needs auth (Option B does)
netlify env:set METRICS_SINK_TOKEN "<secret>" --secret --context production
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
2 minutes, and ask `/health` why. Expect `status: "down"`, a `reasons` entry
naming PostgREST, and HTTP **503**.

Step 3 of that procedure is the whole point of Phase C.
