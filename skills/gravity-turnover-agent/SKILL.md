---
name: gravity-turnover-agent
description: Review a Linear task, project brief, or pasted integration requirements before a Gravity build and produce turnover questions that determine whether the project is ready for implementation. Use when Codex needs to assess requirements for MindCloud Gravity workflows, data syncs, record transfers, NetSuite/Shopify/Acumatica integrations, field mappings, pagination, idempotency, backfills, item matching, Journal Entries, logging, alerts, or similar pre-build discovery.
---

# Gravity Turnover Agent

## Overview

Use this skill to turn incomplete integration requirements into a concise turnover review for an integrator. The output must be in English and should focus on the questions that must be answered before safely building a Gravity workflow.

This skill is for requirements assessment and question generation, not for implementing the Gravity workflow.

## Operating Workflow

1. Read the source material:
   - If the user provides a Linear issue and Linear MCP/tools are available, retrieve the issue, comments, attachments, and linked context before assessing it.
   - If Linear access is unavailable, ask the user to paste the issue or project brief.
   - If the user provides requirements directly, use them as the source of truth.
2. Identify the integration shape:
   - source system, destination system, and any middle systems
   - exact record type on each side
   - direction of data movement
   - intended trigger or cadence
   - whether the workflow is incremental, backfill, or both
3. Pair this skill with `gravity-knowledge` when available. Use Gravity-specific assumptions such as scheduled polling, app steps, map steps, loop steps, memory checkpoints, app-action constraints, and app-step logging/email practices.
4. Compare the source material against the readiness criteria and question bank.
5. Produce only the most relevant questions. Avoid generic discovery questions that are already answered by the task.
6. If a field mapping or workflow behavior is partially implied, state the inference and ask the user to confirm it.
7. When working in a local workspace, write the turnover review to a Markdown file by default unless the user explicitly asks for chat-only output. Use a concise workflow folder name, such as `refunds-sync/`, and a descriptive file name, such as `refund-sync-turnover.md`. Keep the chat response brief and point to the file.

## Readiness Criteria

Treat a project as not build-ready until these decisions are clear enough to implement:

- source and destination systems
- exact source and destination record types
- source of truth per field
- create, update, skip, and delete behavior
- filters for reading source records
- idempotency and duplicate-prevention strategy
- cross-system matching key
- approved field mapping, including parsing or value translation
- pagination and checkpoint strategy
- backfill or historical processing scope
- expected daily and peak volume
- acceptable delay or schedule cadence
- nested records, child records, line items, or item matching behavior
- error handling, retry behavior, logs, and failure email recipients
- safe behavior when partial data is missing or cannot be matched

## Question Selection Rules

- Ask questions in business language first, then add technical context only when it clarifies the decision.
- Group questions by theme so the integrator can send them to the client or PM.
- Prefer specific questions tied to the systems and records in the task.
- Do not ask everything in the question bank; select the questions that close real gaps.
- Mark blocking questions separately from optional optimization questions.
- For Gravity implementation concerns, ask about the business decision, not low-level configuration unless the user is the builder.
- When the likely implementation is known, include a short "Implementation impact" note.

## Required References

Read [references/question-bank.md](references/question-bank.md) when generating turnover questions.

Read [references/output-format.md](references/output-format.md) before producing the final turnover review.

## Maintenance

Add recurring discovery lessons to `references/question-bank.md`. Keep each new prompt as a reusable question pattern with optional examples and the reason the question matters.
