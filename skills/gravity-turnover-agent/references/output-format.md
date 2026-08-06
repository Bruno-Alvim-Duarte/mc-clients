# Gravity Turnover Output Format

Write the final review in English.

## Format

When working in a local workspace, create or update a Markdown file for the turnover review by default. Prefer a workflow-specific folder name and a descriptive file name:

```text
<workflow-slug>/<workflow-slug>-turnover.md
```

If a clearer file name is warranted, use it, but keep the artifact local and easy to find. The chat response should summarize the file path and only the most important next step.

Use this structure:

```markdown
## Turnover Readiness

Status: Not ready / Mostly ready / Ready with minor confirmations

Summary:
One short paragraph explaining the integration and the main missing decisions.

## Confirmed Understanding

- Source system:
- Destination system:
- Source record:
- Destination record:
- Direction:
- Trigger/cadence:
- Incremental/backfill scope:

## Blocking Questions

### Topic

1. Question?
   Why it matters: ...
   Implementation impact: ...

## Follow-Up Questions

### Topic

1. Question?
   Why it matters: ...

## Suggested Assumptions To Confirm

- If we do not receive a different instruction, I would assume ...

## Build-Readiness Checklist

- [ ] Source filters confirmed
- [ ] Idempotency/matching key confirmed
- [ ] Field mapping approved
- [ ] Pagination/checkpoint strategy confirmed
- [ ] Backfill scope confirmed
- [ ] Error handling and notifications confirmed
```

## Style Rules

- Keep questions direct and client-ready.
- Explain why each blocking question matters.
- Do not invent facts. Label inferred items as assumptions.
- Do not over-ask when the task already answers a topic.
- Prefer "What should happen when..." questions for edge cases.
- Prefer "Which field/value should we use..." questions for matching, filters, and checkpoints.
