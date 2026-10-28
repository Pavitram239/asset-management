# Account mail and delivery worker

Local implementation, updated 20 October 2026. B02/B03 add durable delivery/verified identity and B04 adds [workspace/invitation onboarding](WORKSPACE-ONBOARDING-VERIFICATION.md). [Identity verification](IDENTITY-DELIVERY-VERIFICATION.md) separates actual evidence from live-provider work. Current API: [openapi.json](openapi.json). Business notifications remain planned.

## Configure local development

Use PostgreSQL migrations through 007 with the matching API/worker revision. Set these names in server/.env (values belong outside Git):

| Setting | Required value / behavior |
| --- | --- |
| NODE_ENV | development for local use; test for isolated test workflows |
| MAIL_ADAPTER | capture; no network mail provider is installed |
| OUTBOX_ENCRYPTION_KEY | Separately generated random 32-byte key encoded as canonical base64; never reuse JWT_SECRET |
| APP_PUBLIC_URL | Application origin, for example http://localhost:5173; no credentials/path/query/fragment; HTTPS required except loopback HTTP |

Registration creates an unverified account and verification job atomically. Without working mail configuration, it returns 503 and creates neither. Profile email changes also roll back if their new verification job cannot be queued. Password login and existing organization access remain available to existing unverified accounts. No existing user is automatically verified.

Capture is explicitly refused in production. A live provider adapter, credentials, delivery monitoring and configured-provider failure evidence are still required before hosted verification/recovery can work. This is an implementation dependency, not a chosen provider or completed deployment. The existing Docker production configuration does not gain functioning account mail merely by adding the sample capture settings.

## Run the worker separately

From the repository root, after migrations and configuration:

```powershell
npm run worker --workspace=server -- run
```

For a bounded operator batch that handles up to 100 housekeeping rows and at most one send attempt:

```powershell
npm run worker --workspace=server -- once
```

Worker startup verifies migration checksums using read-only queries. It never runs migrations. Multiple workers may run: a database row lock and unique lease identify one active attempt. The defaults are a 60-second lease, 20-second operation timeout, five attempts (event maximum 1–10), exponential retry with jitter, and one-second idle polling. Expired leases can be reclaimed. A stale worker cannot acknowledge a later lease. Stop signals abort the current send and end the loop; a hard crash is recovered after lease expiry.

Rendering belongs to an explicit module registry. Account renderers recheck active user, current email, exact token/event linkage, purpose, expiry and revocation. Invitation rendering also rechecks current inviter/delegation permissions and pending token/event linkage. Unsupported topics or unauthentic ciphertext fail closed. Business renderers ship with owning workflows; no business notification/reminder scheduler is claimed yet.

## Inspect without exposing content

The operator can inspect delivery status with database access; there is no public mail inbox or job-management API:

```sql
SELECT status, count(*), min(created_at) AS oldest
FROM outbox_events GROUP BY status ORDER BY status;

SELECT id, topic, status, attempts, max_attempts, next_attempt_at,
       expires_at, last_error_code, finished_at
FROM outbox_events WHERE status='failed' ORDER BY created_at;

SELECT event_id, attempt_number, status, error_code, started_at, finished_at
FROM delivery_attempts ORDER BY started_at DESC LIMIT 100;
```

Failures store allowlisted codes, never provider messages. A terminal failed job remains visible but has no automatic/operator resend endpoint. For account mail, the person requests a fresh link after fixing the underlying configuration. Mail acceptance is separate from business completion. A lost provider acknowledgement can cause duplicate mail; it must never replay the action that originally queued it. Logical event-key deduplication does not promise exactly-once network delivery.

All outbox content is AES-256-GCM encrypted with event/topic binding; the deduplication hash is keyed. Token tables contain only token hashes. Terminal outbox transitions erase ciphertext. Local captured_mail rows intentionally retain encrypted messages until the original event expiry so isolated tests can inspect them; the worker deletes expired captures in batches. Local capture is not proof of mailbox delivery. Never expose captures through application routes or print tokens, decrypted bodies, cookies or encryption keys into logs.

Keep the same encryption key available to API and worker and back it up securely with the database recovery procedure. Key rotation/re-encryption and a dedicated restricted worker database identity remain deployment work. A different valid key cannot decrypt queued messages; unsupported ciphertext becomes a terminal failure. Stop delivery before changing keys and reconcile pending jobs deliberately. Do not run this local capture implementation as a production mail service.

## Identity rules and limits

- Verification links last 24 hours; recovery links last 30 minutes. Tokens are random 32-byte values, bound to account/email/purpose, and consume once under a user lock. Resending supersedes earlier tokens.
- Signup grants no session, company, membership or permissions. Verification and recovery also grant none. Recovery never marks an email verified.
- All account-link operations share 20 attempts per IP per 15 minutes. Resend adds three requests per account; recovery adds three per normalized email, including nonexistent addresses. 429 returns Retry-After. Registration/login retain their existing shared authentication limit. Mail requests are not unlimited even when a client repeats an idempotency key.
- Signed-in verification requests require a stable Idempotency-Key. Successful repeats do not issue another token; account-context command lookup recovers the committed reference even after cached response removal. The browser preserves an uncertain resend intent in sessionStorage across reloads in that tab.
- Recovery returns the same accepted JSON for eligible, unknown, disabled and demo accounts. This is not a constant-time promise. Malformed inputs, rate limits and global mail configuration errors still have their documented errors.
- Reset passwords require 12–72 characters and at most 72 UTF-8 bytes. Existing signup retains its 8-character minimum. The API rejects oversized UTF-8 passwords rather than silently truncating bcrypt input.
- Password reset increments the current session version; subsequent authentication rejects all older cookies. Legacy cookies without a version mean zero. Existing users start at zero without gaining email verification. A successful reset clears the current browser cookie and requires sign-in.
- Email changes clear verification and revoke old-address account tokens in a database trigger. The profile route queues the new verification job in the same transaction. Operator SQL changes revoke links but do not issue a replacement automatically.
- Links put the token in the browser URL fragment; the page clears it from the address bar and POSTs it in JSON only after an explicit button action. Email scanners loading a page do not consume a token. Reloading after fragment removal requires reopening the email link. Access logs omit URL queries and never log request bodies.

## Files and remaining work

Private Firebase downloads, upload validation, staging cleanup intents and the existing storage-cleanup command are reused; see [RBAC operations](RBAC-OPERATIONS.md). B02 adds no competing attachment store or public cloud links. Typed file links and module-specific staging/finalization will ship with those modules. Existing local tests cover denied/invalid uploads and missing storage configuration. Live Firebase/Cloudinary success, timeout and provider-error recovery remain unverified.
