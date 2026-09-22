# M6 release checklist

Status: this document records the release gate. It is not evidence that a staging or production release has happened.

## Automated local gate

Run these commands against the commit selected for release:

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
Set-Location api
npm test
npm run typecheck
npm run build
```

The GitHub Actions workflow repeats the frontend browser suite and creates a disposable PostgreSQL 17 service for backend integration tests. A green local result is not a completed GitHub Actions run.

## Runtime probes and logs

| Purpose | Endpoint or event | Expected result |
| --- | --- | --- |
| API liveness | `GET /api/v1/healthz` | HTTP 200 with `status: ok`; it does not require PostgreSQL |
| API readiness | `GET /api/v1/readyz` | HTTP 200 with `status: ready`; HTTP 503 when PostgreSQL cannot be queried |
| HTTP telemetry | `http_request` | JSON log with request ID, method, status, and duration in milliseconds |
| Worker liveness | `worker_heartbeat` | JSON event at least once per minute |
| Worker failures | `email_delivery_failed`, `email_batch_failed`, `pomodoro_reconciliation_failed`, `recurrence_processing_failed`, `security_data_cleanup_failed` | JSON error event without request bodies, credentials, notes, or transaction contents |

Configure the deployment monitor to alert when the readiness probe is non-200, a worker heartbeat has not arrived for two minutes, or the error events above occur. Also configure the domain thresholds from [PLAN.md](../PLAN.md): Pomodoro past due by more than 10 seconds, recurrence backlog above 10 minutes without a known domain block, failed outbox delivery, and server 5xx errors.

## Staging gate

The release operator must provide the deployment vendor, staging domain, secret store, Google OAuth test client, SMTP test mailbox, and authorization to run real external actions. Once available:

1. Deploy the SPA, API, and worker from the same immutable commit.
2. Run migrations once through the release job, never in every API replica.
3. Verify HTTPS, `healthz`, and `readyz`.
4. Run account, task, Pomodoro, transfer, report, and CSV smoke tests. Run real Google OAuth and SMTP with the approved staging account.
5. Save the commit, environment, command output, probe result, and screenshots for 360, 768, and 1440 px.

## Backup and restore gate

Before a production release, enable a daily Supabase backup with at least seven days of retention. Restore the selected backup into an isolated staging database, point a disposable staging API at it, and prove `readyz` plus the staging smoke tests. Record the backup timestamp, restore target, result, and operator. Never restore over production as a test.

## Release decision

Do not mark M6 complete until every item in [TEST-PLAN.md](../TEST-PLAN.md), the staging gate, the backup/restore gate, and the monitoring configuration has recorded evidence. Missing evidence is a blocked release, not a passing assumption.
