---
name: gravity-workflow-json-agent
description: Generate technical Gravity workflow JSON from requirements, Linear issues, pasted project briefs, implementation notes, or pre-development Q&A. Use when Codex needs to design a MindCloud Gravity workflow with triggers, app/action steps, map JavaScript, NetSuite SuiteScript, Shopify GraphQL, loops, conditionals, pagination, checkpointing, idempotency, logging, and failure paths.
---

# Gravity Workflow JSON Agent

## Overview

Use this skill to convert integration requirements into an implementation-ready Gravity workflow JSON. The output should define the workflow structure, step responsibilities, technical code, branch behavior, and app/action choices clearly enough for a Gravity builder to implement or import with minimal redesign.

This skill builds the workflow. For pre-build question generation only, use `gravity-turnover-agent`.

## Operating Workflow

1. Gather source material:
   - If the user provides a Linear issue and Linear MCP/tools are available, read the issue, comments, attachments, linked docs, and relevant task history.
   - If the user provides pasted requirements, Q&A, or implementation notes, treat them as source of truth.
   - If key implementation facts are missing, either make a clearly labeled conservative assumption or ask only the blocking question needed to prevent an unsafe design.
2. Pair this skill with `gravity-knowledge` whenever available. Read its app nuances, workflow patterns, and logs/email guidance before producing Gravity-specific output.
3. Identify the integration shape:
   - source and destination apps
   - source and destination record types
   - trigger/cadence
   - create/update/skip/delete behavior
   - matching key and idempotency strategy
   - pagination/checkpoint strategy
   - expected branches, loops, and failure handling
4. Decompose the workflow into narrowly scoped steps. When the requirements describe only the business process, define each step's responsibility yourself.
5. Prefer code-capable app actions for non-trivial logic:
   - NetSuite: prefer Execute Custom Code / SuiteScript for searches, saved-search-like logic, duplicate checks, transforms, record creation, and complex field handling.
   - Shopify: prefer GraphQL Beta for nested reads, custom filtering, mutations, and non-trivial query shapes.
   - Use existing Gravity app actions only for simple operations with straightforward arguments.
6. Produce the final JSON only after reviewing it against `references/review-checklist.md`.

## Required References

Read [references/workflow-json-contract.md](references/workflow-json-contract.md) before writing the JSON structure.

Read [references/code-patterns.md](references/code-patterns.md) before writing map code, SuiteScript, Shopify GraphQL, or condition expressions.

Read [references/review-checklist.md](references/review-checklist.md) before finalizing.

## Output Rules

- Output valid JSON in a fenced `json` block unless the user asks for a file edit.
- Include `workflow`, `triggers`, and `steps`.
- Use English workflow and step names by default, matching existing Gravity examples.
- Include `description` on `workflow` with the business goal and safety behavior.
- Use `isActive: false` for new draft workflows unless the user explicitly asks otherwise.
- Include `version: "0.1.0"` for new draft workflows unless the user provides a version.
- Include concrete code for map/code steps when logic is inferable. Do not leave vague comments such as "add mapping here".
- If a value is unknown but required, use a visible placeholder token such as `{{CONFIRM_EMAIL_RECIPIENTS}}` and add an `assumptions` or `openQuestions` top-level array after `steps`.
- Do not invent credentials, internal IDs, email recipients, subsidiaries, accounts, locations, or custom field IDs unless they are provided or strongly implied by source material.
- Keep app steps observable. Add failure/success behavior in args or notes where the Gravity export shape supports it.

## Step Design Rules

- Use `map` steps for normalization, validation, payload building, matching decisions, and derived variables.
- Use app `action` steps for external system calls.
- Use `loop` steps for arrays returned by source/list/map steps.
- Use `conditional` steps for If/Else decisions, duplicate prevention, missing-data handling, and safe skip/create/update paths.
- Use flow-control `action` steps for logs, skip/current-loop behavior, stop workflow, and emails.
- Keep each step name specific: `Map - Build Shopify Refund Requests`, `NetSuite - Find Existing RMA`, `If/Else - No Existing RMA`.
- Avoid using one large code step for the entire workflow. Split responsibility so logs, branches, and retries remain understandable.

## Branching Rules

Represent branches in the same style as existing Gravity JSON exports:

- Add a `conditional` step with a concrete `condition`.
- Put branch steps after the conditional in the appropriate sequence or inside the current loop's `children`.
- Name branch steps clearly enough to show the path: `Flow Control - Skip: Existing Customer Found`, `NetSuite - Create Customer`, `HubSpot - Update Existing Deal`.

When the user specifically asks for explicit branch paths, include a `branches` object on the conditional step:

```json
"branches": {
  "if": [{ "stepNumber": 6, "name": "..." }],
  "else": [{ "stepNumber": 9, "name": "..." }]
}
```

Only use explicit `branches` when it improves clarity for a planning JSON or the user requests path-level representation.
