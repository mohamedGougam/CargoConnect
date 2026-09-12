# Disaster recovery

Operational defaults pending a formal retention/legal policy. This is **not** a guarantee of RPO/RTO.

## Assumptions

- Production Postgres is backed up by the cloud provider (Render/Neon/RDS/etc.).
- Object storage (R2/S3) has versioning or separate backup if required by policy.
- Application is stateless aside from DB + object storage.

**Do not claim backups are configured unless the operator has enabled them in the provider console.**

## Recommended backup posture

- Automated **daily** Postgres backups
- Retention ≥ 7–30 days (business-dependent)
- Point-in-time recovery if the provider supports it
- Quarterly restore test to a staging database

## Scenario: production DB unavailable / corrupted

1. **Stop writes** if possible (maintenance mode / scale-to-zero web) to avoid split-brain.
2. Identify latest good backup / PITR timestamp.
3. Restore into a **new** database instance (do not overwrite blindly).
4. Point a staging app (or temporary service) at the restored DB.
5. Run `npm run db:status` then `npm run db:migrate` if needed.
6. Hit `/api/health/ready`.
7. Verify samples: user login, one booking, one document metadata row, one shipment execution, one claim preparation.
8. Only after verification, switch production `DATABASE_URL` to the restored instance.
9. Rotate credentials if compromise was involved.

## Scenario: object storage loss

1. Confirm bucket region/credentials.
2. Restore from storage versioning / backup if enabled.
3. DB still references `storageKey` — missing objects show as download 404; re-upload may be required.
4. Run orphan cleanup dry-run only after recovery (`npm run storage:orphan-cleanup`).

## Scenario: AUTH_SECRET leaked

1. Rotate `AUTH_SECRET` immediately.
2. All sessions invalidate — communicate re-login.
3. Review access logs for abuse.

## What NOT to do

- Do not restore a backup over production without a verified staging cutover.
- Do not disable malware scanning to “unblock” readiness after a restore.
- Do not re-send all historical commercial emails as a recovery step.

## Related

- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)
- [RUNBOOK.md](./RUNBOOK.md)
- [DATABASE.md](./DATABASE.md)
