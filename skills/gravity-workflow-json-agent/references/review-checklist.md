# Gravity Workflow JSON Review Checklist

Review the JSON before finalizing.

## Requirements Coverage

- Source system, destination system, record types, direction, and trigger are represented.
- Each stated business rule appears in a map, condition, app step, or flow-control path.
- Each inferred business rule is listed in `assumptions`.
- Each blocking missing value is listed in `openQuestions` or represented by a `{{CONFIRM_*}}` token.

## Step Quality

- Steps have clear, specific names.
- Each step has one main responsibility.
- Non-trivial NetSuite logic uses SuiteScript.
- Non-trivial Shopify logic uses GraphQL Beta.
- Existing app actions are used only for simple reads/writes.
- Loops target the step that returns the array.
- Conditionals use concrete Gravity conditions and have understandable true/false path steps.
- Map steps return the shape that downstream steps reference.

## Safety

- Duplicate prevention happens before creates.
- Matching keys are stable and explicit.
- Missing required data is handled before external mutation.
- Partial line-item matching behavior is explicit.
- Create/update/skip behavior is explicit for existing destination records.
- Pagination/checkpoint behavior is explicit for recurring batch workflows.

## Observability

- Important app mutations have success logs or implementation notes for success logging.
- Record-level failures inside loops continue or skip only when safe.
- Systemic failures stop the workflow.
- Human-actionable failures include email recipient placeholders or confirmed recipients.
- Log messages start with the app name in brackets when app-specific.

## JSON Integrity

- The output is valid JSON.
- `stepNumber` values are unique and ordered.
- `Step N` references point to existing steps.
- Referenced fields are produced by earlier steps.
- No vague TODO comments remain inside executable code.
- Placeholder tokens are obvious and listed in `openQuestions`.
