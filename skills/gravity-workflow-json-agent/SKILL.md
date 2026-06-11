---
name: gravity-workflow-json-agent
description: Generate technical Gravity workflow JSON and Gravity AI implementation prompts from requirements, Linear issues, pasted project briefs, implementation notes, pre-development Q&A, or an existing workflow.json. Use when Codex needs to design a MindCloud Gravity workflow with triggers, app/action steps, map JavaScript, NetSuite SuiteScript, Shopify GraphQL, loops, conditionals, pagination, checkpointing, idempotency, logging, failure paths, and then produce a self-contained prompt for Gravity AI/Cloudy to implement that workflow.
---

# Gravity Workflow JSON Agent

## Overview

Use this skill to convert integration requirements into an implementation-ready Gravity workflow JSON. The output should define the workflow structure, step responsibilities, technical code, branch behavior, and app/action choices clearly enough for a Gravity builder or Gravity AI/Cloudy to implement with minimal redesign.

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
7. When the user asks for Gravity AI implementation help, or when it is useful after producing the JSON, generate a self-contained Gravity AI prompt using the final workflow JSON as the main parameter.

## Required References

Read [references/workflow-json-contract.md](references/workflow-json-contract.md) before writing the JSON structure.

Read [references/code-patterns.md](references/code-patterns.md) before writing map code, SuiteScript, Shopify GraphQL, or condition expressions.

Read [references/review-checklist.md](references/review-checklist.md) before finalizing.

Read [references/gravity-ai-prompt.md](references/gravity-ai-prompt.md) before generating a prompt for Gravity AI/Cloudy.

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
- If also producing a Gravity AI prompt, output it after the JSON in a separate fenced `text` block titled `Gravity AI Prompt`.

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

## Gravity AI Prompt Generation

Generate a Gravity AI prompt when:

- The user explicitly asks for a prompt for Gravity AI, Cloudy, or Gravity implementation.
- The user asks for an implementation handoff after the JSON is created.
- The workflow JSON is being used as an input artifact for another builder or automation step.

The Gravity AI prompt must be self-contained. Do not tell Gravity AI to read local files, skills, references, or repository paths. Include the final workflow JSON directly in the prompt, plus implementation rules, safety requirements, logging rules, and validation instructions.

The prompt should tell Gravity AI to:

- Create or update the workflow to match the supplied JSON.
- Preserve step numbers, names, trigger configuration, loops, conditionals, args, pagination, and code blocks unless a Gravity UI constraint requires a small adaptation.
- Prefer SuiteScript for non-trivial NetSuite steps and Shopify GraphQL Beta for non-trivial Shopify steps.
- Configure app-step failure behavior, logs, and success logs where specified.
- Verify every Gravity variable reference and fix invalid references before finishing.
- Report any values that cannot be implemented because credentials, connector actions, field IDs, internal IDs, or recipients are missing.

Use the template in `references/gravity-ai-prompt.md`.
