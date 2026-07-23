---
name: gravity-knowledge
description: Gravity platform context for MindCloud integrations. Use when Codex needs to design, explain, review, or implement Gravity low-code integration workflows involving apps/connectors, app actions, native steps such as map/if/flow control/loop/set memory, trigger choices, pagination/checkpoint patterns, logging/email practices, or app-specific Gravity nuances for NetSuite, Shopify, Acumatica, and similar systems.
---

# Gravity Knowledge

## Overview

Use this skill to reason about Gravity, MindCloud's low-code integration platform for building workflows between systems such as NetSuite, Shopify, Acumatica, and other connected apps.

Treat Gravity workflows as step-based integrations: a trigger starts the workflow, app steps call connector actions, native steps control data handling and flow, and map steps usually hold the business logic in JavaScript.

## Core Model

- Define **apps** as Gravity connectors to external platforms, for example NetSuite or Shopify.
- Define **actions** as operations exposed by an app, for example creating a NetSuite contact or running a Shopify GraphQL query.
- Define **steps** as workflow nodes. A step can call an app action or use a native Gravity capability.
- Prefer workflows that are easy to observe: use logs for normal milestones and logs plus email for errors.

## Trigger Guidance

- Prefer a **schedule** trigger for most integrations, especially polling, batch processing, and checkpointed pagination.
- Use a **webhook** trigger when an external system must push events into Gravity.
- Treat **webhook** workflows as potentially concurrent. Two webhook runs can start at nearly the same time, so design create-or-update logic with race conditions in mind.
- Scheduled workflows have not shown the same race-condition risk in normal Gravity usage: even if the next schedule time passes, the next scheduled run waits for the current run to finish.
- Avoid **app event** triggers unless the workflow specifically requires one.

## Native Steps

### map

Use a `map` step as a JavaScript code block for data handling and business logic. Read prior step outputs from the injected `input` object. Expect many app action responses to be arrays, even when only one record is returned.

```javascript
const so = input.netsuiteGetQuerySearchZUF9[0];

return [{
  variables: {
    query: `name:#${so?.memo?.split("#")?.[1]}`,
  },
}];
```

### if

Use an `if` step to branch the workflow based on a variable or expression.

### flow control

Use `flow control` to decide how the workflow proceeds:

- End the workflow as success.
- End the workflow as failure.
- Continue without ending.
- Continue a loop and skip the current record.
- Emit an info, warning, or error log.
- Send an email with recipients, subject, and body.

Treat text fields in flow control as variable-aware fields; use interpolation where Gravity supports it.

### loop

Use a `loop` step to iterate over an array returned by a prior step.

### set memory

Use `set memory` to write a key-value checkpoint or state value. For detailed memory behavior, pair this skill with the future `using-memory-in-gravity` skill when it exists.

## Workflow Design Checks

### Record Lifecycle Scope

Before designing or developing a workflow that creates records in a target system, confirm whether the workflow is responsible only for creation or must also manage later updates to those same records.

Ask explicitly:

- Can the source record change after the target record is created?
- If it changes, is the workflow expected to pass those changes to the target record?
- What stable key links the source record to the created target record for future updates?

If updates are in scope, design create-or-update behavior, idempotency, duplicate prevention, checkpoint fields, and target record lookup/update paths from the start instead of treating creation as a one-time operation.

### Batch Workflow Pattern

For batch integrations, prefer checkpointed pagination:

1. Read a limited page of records from an app, commonly 50 records.
2. Process each record, often inside a loop.
3. Capture the last successfully processed timestamp, identifier, or ordering field.
4. Store that value in memory.
5. On the next scheduled run, read the next page after that stored value.

Keep business logic and data transformation in map steps. Keep connector/app steps focused on calling external systems.

## References

- Read [references/apps.md](references/apps.md) when working with app-specific Gravity patterns, especially NetSuite, Shopify, or Acumatica.
- Read [references/patterns.md](references/patterns.md) when designing a complete Gravity workflow, pagination/checkpointing behavior, or error handling.
- Read [references/logs-and-emails.md](references/logs-and-emails.md) when adding app-step logs, success logs, failure behavior, or failure email notifications.
