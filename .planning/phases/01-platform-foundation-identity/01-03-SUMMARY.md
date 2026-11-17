---
phase: 01-platform-foundation-identity
plan: 03
subsystem: auth
tags: [clerk, account-deletion, tombstone, session-revocation, privacy, staged-closure, identity-lifecycle]
requires: []
provides:
  - "Owner resolution for merchant-obligation deletion (staged-closure) recorded with date and attribution"
  - "Owner resolution for a permanent keyed tombstone and fail-closed, local-first Clerk revocation recorded with date and attribution"
  - "Phase-local implementation constraints binding identity-lifecycle work in Plans 01-04/01-06/01-07/01-08"
affects: [01-04, 01-06, 01-07, 01-08]
tech-stack:
  added: []
  patterns:
    - "Attributable owner decisions are recorded in PROJECT.md Key Decisions (date + rationale + outcome) before irreversible schema or deletion code exists"
    - "Phase-local implementation constraints are captured in an Owner Resolution subsection of 01-CONTEXT.md"
    - "Fail-closed local-first deletion: the authoritative keyed tombstone is written in the same transaction as anonymization; provider revocation is retried and never restores local access"
key-files:
  created:
    - .planning/phases/01-platform-foundation-identity/01-03-SUMMARY.md
  modified:
    - .planning/PROJECT.md
    - .planning/phases/01-platform-foundation-identity/01-CONTEXT.md
    - .planning/phases/01-platform-foundation-identity/01-RESEARCH.md
key-decisions:
  - "Owner selected staged-closure (2026-11-17) for merchant-obligation deletion: stop new sales on accepted closure, retain store/merchant/order records, allow only restricted completion/refund actions, anonymize personal data only when outstanding obligations are resolved subject to legally required retention; the signed-in account owner may request closure; exact state names, authorization/reopen rules and retention periods delegated to Plans 04/08 with no legal duration invented"
  - "Owner selected keyed-permanent-tombstone-local-first (2026-11-17): a permanent/indefinite keyed pseudonymous deny marker (HMAC of the Clerk subject with a server-side secret), no raw subject/email/PII retained, irreversible; local tombstone written in the same transaction as anonymization and authoritative; Clerk provider revocation attempted after/alongside with retry; fail closed on provider failure (subject stays locked out locally, failure surfaced/retried, never restores access); no legal duration invented"
patterns-established:
  - "Record consequential owner decisions in canonical project records before implementation, preserving all prior D-01..D-11 decisions unchanged"
requirements-completed: []
duration: 3min
completed: 2026-11-17
---

# Phase 1 Plan 3: Resolve account-deletion, merchant-closure, tombstone, and Clerk-revocation policy Summary

**Owner-resolved the two irreversible identity-lifecycle policies — staged merchant closure with obligations-gated anonymization, and a permanent keyed tombstone with fail-closed local-first Clerk revocation — recorded in project records before any deletion schema or code is built.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-11-17T06:32:28Z
- **Completed:** 2026-11-17T06:35:00Z
- **Tasks:** 3 (2 owner-answered blocking decision gates + 1 auto recording task)
- **Files modified:** 3 (PROJECT.md, 01-CONTEXT.md, 01-RESEARCH.md) + this SUMMARY

## Accomplishments

- Recorded the owner's Task 1 selection `staged-closure` as an attributable Key Decision in PROJECT.md and as binding lifecycle constraints in the new `Owner Resolution` subsection of 01-CONTEXT.md. It preserves D-07/D-08/D-09: no cascade deletion of order/audit records, no new sales after accepted closure, restricted completion/refund actions retained, and anonymization only after outstanding obligations resolve (subject to legally required retention). The signed-in account owner may request closure; state names, closure authorization/reopen rules and retention periods are explicitly delegated to Plans 04/08.
- Recorded the owner's Task 2 selection `keyed-permanent-tombstone-local-first` as an attributable Key Decision and as tombstone/revocation constraints. Form: permanent keyed pseudonymous HMAC deny marker, no raw Clerk subject/email/PII. Sequence: local tombstone written in the same transaction as anonymization and authoritative; Clerk revocation after/alongside with retry. Failure: fail closed — no provider error restores local access. No legal retention duration invented.
- Confirmed both blocking checkpoints were answered by the owner before any downstream implementation, satisfying the plan's provenance threat (T-03-04).
- All three automated verifications pass; D-01 through D-11 remain unchanged (all 11 present in 01-CONTEXT.md).

## Task Commits

Each task was committed atomically:

1. **Task 1: Decide irreversible deletion behavior for active merchant obligations** - `2b3b405` (docs)
2. **Task 2: Decide tombstone retention and Clerk session revocation** - `b889768` (docs)
3. **Task 3: Record the owner resolutions in canonical project records** - `2d2d240` (docs)

**Plan metadata:** `PENDING`

## Files Created/Modified

- `.planning/PROJECT.md` - Two new attributable Key Decision rows + owner-resolution provenance note; D-01..D-11 untouched.
- `.planning/phases/01-platform-foundation-identity/01-CONTEXT.md` - New `Owner Resolution (2026-11-17)` subsection with merchant-obligation and tombstone/revocation implementation constraints for downstream plans.
- `.planning/phases/01-platform-foundation-identity/01-RESEARCH.md` - Added a "session revocation" owner-resolution note required by Task 2's automated verify; all pre-existing planner edits in this file were preserved.
- `.planning/phases/01-platform-foundation-identity/01-03-SUMMARY.md` - This summary.

## Decisions Made

- **Merchant-obligation deletion:** `staged-closure` — the owner chose the recommended option, matching locked outcomes D-07/D-08/D-09. Exact state names, authorization/reopen rules and retention periods were deliberately delegated downstream rather than invented.
- **Tombstone + Clerk revocation:** `keyed-permanent-tombstone-local-first` — the owner delegated the choice as standard industry practice. Permanent keyed pseudonymous marker, no raw PII, local-first authoritative write, fail-closed provider handling.
- **No legal retention period was recorded** because none was supplied by the owner; the records explicitly say so.

## Deviations from Plan

### Checkpoint handling (not a deviation)

- Tasks 1 and 2 are `checkpoint:decision` gates, but the owner supplied both answers up front through the orchestrator (`owner_checkpoint_responses`). No pause or question was issued; the answers were recorded verbatim in scope where Task 3 requires.

### Auto-fixed Issues

**1. [Rule 3 - Blocking verification] Task 2's automated check required a phrase absent from its referenced file**
- **Found during:** Task 2 (tombstone/revocation decision recording)
- **Issue:** Task 2's `<verify>` runs `grep -q 'session revocation' .planning/phases/01-platform-foundation-identity/01-RESEARCH.md`, but that exact phrase did not exist in the file, so the gate could not pass.
- **Fix:** Added a short, attributable owner-resolution note to `01-RESEARCH.md` documenting the selected tombstone/session-revocation sequence and fail-closed behavior. This is an authorized tracking-file update for Task 2's verification.
- **Files modified:** `.planning/phases/01-platform-foundation-identity/01-RESEARCH.md`
- **Verification:** Task 2 automated check re-run → PASS. Pre-existing planner edits in the same file were preserved (4 escalated-status annotations still present).
- **Committed in:** `b889768` (Task 2 commit)

**Total deviations:** 1 auto-fixed (1 blocking verification). **Impact on plan:** none — the change only records the owner's already-made decision; no scope or product-policy change.

## Issues Encountered

- **Requirement tracking deliberately not advanced:** the plan frontmatter lists `AUTH-06`, but that requirement is delivered by Plan 01-08 (account-deletion implementation); this plan only resolves the policy that Plan 01-08 will implement. Marking AUTH-06 complete here would falsely report unfinished work as done, so `requirements-completed` is empty and `requirements.mark-complete` was not run. The requirement remains Pending until 01-08 ships.
- **Pre-existing uncommitted changes left untouched:** `config.json`, several `*-PLAN.md` files and untracked `01-VALIDATION.md` were present at start and were not modified or committed by this plan. `01-RESEARCH.md` also carried pre-existing planner edits; they were preserved and included in the Task 2 tracking-file commit rather than discarded.
- **State position note:** STATE.md read "Plan: 2 of 9" at execution time while this plan is 01-03; the SDK plan counter is mechanical. Position was updated via the prescribed GSD SDK commands; the orchestrator should reconcile the 01-02/01-03 counter if it matters for sequencing.

## Stub Tracking

None — this is a documentation/decision-recording plan; no code, UI placeholders or empty data sources were introduced.

## Threat Flags

No new security-relevant surface: this plan changes documentation only. The plan's STRIDE mitigations are satisfied by the recorded decisions — T-03-01 (explicit owner choice on tombstone form/retention, no raw identifiers), T-03-02 (staged closure preserves retained references and stops new sales), T-03-03 (fail-closed local-first revocation/tombstone sequence), T-03-04 (attributable owner decisions with date recorded in both canonical records).

## Next Phase Readiness

- Plans 01-04 (schema), 01-06/01-07 (guard + session contract) and 01-08 (deletion/closure implementation) can now implement against one unambiguous, owner-authorized lifecycle contract instead of inventing policy.
- Open for downstream design (explicitly delegated, not resolved here): exact lifecycle state names, who may authorize/reopen closure, and the obligation-resolution mechanism. No legal retention period was supplied.

## Self-Check: PASSED

- Verified created files exist: `01-03-SUMMARY.md`, `PROJECT.md`, `01-CONTEXT.md`, `01-RESEARCH.md` — all FOUND.
- Verified task commits exist in git history: `2b3b405` (Task 1), `b889768` (Task 2), `2d2d240` (Task 3) — all FOUND.

---
*Phase: 01-platform-foundation-identity*
*Plan: 03*
*Completed: 2026-11-17*
