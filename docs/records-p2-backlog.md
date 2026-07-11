# Records P2 Backlog (Deferred)

## Goal
- Introduce a Firestore `stats/{scopeId}` materialized-view pipeline for records/standings, while keeping current API contracts stable.

## Target Architecture
- Scope key: `seasonId__division__recordMode`
- Scope metadata: `seasonId`, `seasonYear`, `division`, `seasonType`, `recordMode`, `updatedAt`, `matchCount`, `aggregationVersion`
- Subcollections:
  - `players`
  - `teams`
  - `standings`

## Aggregation Policy
- Player identity key: `teamId + normalizedName + backNumber`
- Exclude `recordMode=practice` from official aggregates.
- Rebuild should be idempotent on match correction/re-save.
- Tie-break policy for standings:
  - points
  - forfeit losses
  - draws
  - head-to-head points
  - run differential
  - runs for
  - team name

## Functions Scope
- Firestore triggers:
  - on completed match created
  - on completed match updated
- Admin-only rebuild endpoint:
  - rebuild all scopes
  - rebuild by `scopeId`
  - rebuild by `seasonId`

## Firestore/Security Scope
- Add `stats/{scopeId}` read rules for public read.
- Restrict `stats/**` writes to admin only.
- Preserve existing `matches/**` scorer/admin permissions.

## Dependencies
- Cloud Functions runtime and deployment pipeline ready for incremental triggers + callable/admin endpoints.
- Firestore composite indexes for `stats/{scopeId}` query patterns finalized before client switch-over.
- Existing match import pipeline remains source-of-truth until `stats` validation completes.

## Rollout Plan
1. Add functions + indexes/rules in staging.
2. Backfill with rebuild endpoint.
3. Verify sample seasons and playoff scopes.
4. Switch records view to consume `stats` source behind a feature flag.
5. Remove flag after stability window.

## Rollback Strategy
- Keep current records API path as default while `stats` pipeline is warming up.
- On anomaly, disable `stats` feature flag and fall back to existing aggregation path immediately.
- Retain rebuild endpoint so corrected matches can be reprocessed after rollback fixes.

## QA Checklist
- Functional:
  - Completed match creates/updates `stats/{scopeId}` and subcollections.
  - Records filters (league/playoff/eutteum/beogeum) match expected rows.
- Data integrity:
  - 10 random matches: manual calc equals aggregate output.
  - Name collision cases are separated by back number.
  - Re-save same match does not duplicate aggregates.
- Security:
  - Non-admin write to `stats/**` is denied.
  - Admin write to `stats/**` is allowed.

## DoD
- Triggers and rebuild endpoint deployed and monitored.
- Backfill completed for all active seasons.
- Record pages validated against current API output with no regression on key metrics.
