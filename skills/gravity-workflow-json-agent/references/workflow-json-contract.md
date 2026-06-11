# Gravity Workflow JSON Contract

Use this contract when producing a technical Gravity workflow JSON.

## Top-Level Shape

```json
{
  "workflow": {
    "name": "Source to Destination - Business Process",
    "version": "0.1.0",
    "isActive": false,
    "description": "What the workflow does, how it avoids duplicates, and who/what it notifies."
  },
  "triggers": [],
  "steps": []
}
```

Optional top-level arrays:

- `assumptions`: assumptions made because requirements were incomplete.
- `openQuestions`: blocking or near-blocking questions that affect implementation.
- `implementationNotes`: short notes for the Gravity builder.

## Trigger Shape

Prefer schedule triggers for polling and batch workflows.

```json
{
  "name": "Schedule - Run every 15 minutes, daily",
  "type": "schedule",
  "message": "Run every 15 minutes, daily",
  "schedule": {
    "days": [0, 1, 2, 3, 4, 5, 6],
    "mode": "interval",
    "dayNames": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    "intervalMs": 900000
  }
}
```

Use webhook triggers when the source system pushes events to Gravity. Avoid app event triggers unless explicitly required.

## Step Fields

Common fields:

- `stepNumber`: sequential integer.
- `name`: clear human-readable name.
- `type`: `action`, `map`, `loop`, or `conditional`.
- `results`: `1` for one expected result, `"many"` for arrays.
- `args`: app/action inputs as `{ "label": "...", "value": "..." }`.
- `code`: JavaScript or SuiteScript code for code-capable steps.
- `input`: source steps for map steps, for example `"Step 2, Step 5"`.
- `pagination`: page settings when reading many records.
- `children`: nested steps inside a loop or another grouped/paginated step.

## App Action Step

Use for connector operations and code-capable app calls.

```json
{
  "stepNumber": 4,
  "name": "NetSuite - Find Matching Sales Order",
  "type": "action",
  "results": 1,
  "args": [
    { "label": "Record Type", "value": "salesorder" },
    { "label": "External Id", "value": "[Step 3: input[0].externalId]" }
  ],
  "code": "..."
}
```

For NetSuite non-trivial actions, include SuiteScript in `code`. For Shopify non-trivial actions, include GraphQL query/mutation payloads in `code` or `args` according to the action.

## Map Step

Use maps to transform, validate, build payloads, and prepare branch flags.

```json
{
  "stepNumber": 3,
  "name": "Map - Build Customer Payload",
  "type": "map",
  "input": "Step 2",
  "results": 1,
  "code": "const customer = input['iterateCustomers'][0];\nreturn { externalId: String(customer.id), email: customer.email || null };"
}
```

Return an object for `results: 1`. Return an array for `results: "many"`.

## Loop Step

Loop over arrays from prior steps.

```json
{
  "stepNumber": 2,
  "name": "Iterate - Loop through Source Records",
  "type": "loop",
  "loopTarget": {
    "name": "Source - Get Records",
    "stepNumber": 1
  },
  "children": []
}
```

Inside loop children, read the current item from the generated loop step key when known. If the exact Gravity key is unknown, use a readable key based on the step name and keep it consistent inside the JSON.

## Conditional Step

Use the Gravity condition syntax shown in existing exports:

```json
{
  "stepNumber": 5,
  "name": "If/Else - Customer Found",
  "type": "conditional",
  "results": 1,
  "condition": "[Step 4: input[0].id] nempty null"
}
```

Common operators:

- `nempty null`
- `empty null`
- `eq true`
- `ne VALUE`
- `= VALUE`
- `<`, `>`, `<=`, `>=`
- `OR` between expressions when needed

When explicit branch representation is needed, add:

```json
"branches": {
  "if": [],
  "else": []
}
```

## Pagination And Checkpoints

For simple "read all" app actions:

```json
"pagination": { "type": "all", "pageSize": 250 }
```

For checkpointed batch reads, include memory/checkpoint steps or implementation notes showing:

- checkpoint key
- checkpoint field
- page size
- when checkpoint updates
- tie-breaker if timestamps can collide

Prefer checkpointed pagination for recurring polling workflows when volume can exceed one page.
