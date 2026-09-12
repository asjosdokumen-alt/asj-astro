# Bundled credentials

This directory holds credentials that are **deployed as files** rather than
injected as environment variables.

## Why files instead of env vars

AWS Lambda compatibility mode caps the total environment for a function at
**4 KB**. This project reached **4275 B** across 25 variables and the deploy
failed at function creation with:

```
Failed to create function: invalid parameter for function creation:
Your environment variables exceed the 4KB limit imposed by AWS Lambda.
```

A single value — the Firebase service account — was **~2.4 KB**, or 59 % of the
entire budget. Moving it to a bundled file removes it from the Lambda env
payload completely. Full analysis: `docs/HANDOFF_4KB_ENV_LIMIT.md`.

## Files

| File | Committed? | Purpose |
|---|---|---|
| `firebase-service-account.json` | **no** — gitignored | The live service account. Create it locally; never commit it. |
| `firebase-service-account.example.json` | yes | Shape only, values are placeholders. |
| `README.md` | yes | This file. |

## How to create `firebase-service-account.json`

Produce a **single-line, minified** JSON object with these keys. The value must
be valid JSON — a raw PEM with real newlines is fine *inside* the JSON string
once escaped as `\n`, and `_lib/fcm-server.ts` also repairs double-escaped
`\\n`:

```bash
node -e "
const fs=require('fs');
const sa=JSON.parse(fs.readFileSync('path/to/downloaded-key.json','utf8'));
fs.writeFileSync(
  'netlify/functions/secrets/firebase-service-account.json',
  JSON.stringify(sa)
);
console.log('written, bytes =', fs.statSync('netlify/functions/secrets/firebase-service-account.json').size);
"
```

## Verify it works (do not skip)

Reading the file is not proof it is *the right key*. The only test that proves
the key matches the certificate is exchanging a JWT for an access token:

```bash
node -e "
const fs=require('fs'),crypto=require('crypto');
const sa=JSON.parse(fs.readFileSync('netlify/functions/secrets/firebase-service-account.json','utf8'));
const pk=sa.private_key.includes('\\\\n')?sa.private_key.replace(/\\\\n/g,'\n'):sa.private_key;
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const iat=Math.floor(Date.now()/1000);
const input=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',exp:iat+3600,iat});
const sig=crypto.createSign('RSA-SHA256').update(input).sign(pk,'base64url');
fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+sig})})
 .then(r=>r.json()).then(d=>console.log(d.access_token?'OK — token issued':'FAILED:',JSON.stringify(d).slice(0,200)));
"
```

Expect `OK — token issued`. An invalid key returns an error here rather than
failing silently at push time.

## Precedence at runtime

`_lib/fcm-server.ts` resolves the account **file-first, env-second**:

1. `netlify/functions/secrets/firebase-service-account.json` (bundled)
2. `process.env.FIREBASE_SERVICE_ACCOUNT` (fallback, for transition and local `netlify dev`)

The env fallback exists so a deployment without the file keeps working during
migration. Once the file is in place everywhere, the env var can be deleted.
