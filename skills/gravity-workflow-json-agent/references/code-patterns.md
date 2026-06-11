# Gravity Code Patterns

Use this reference when writing technical code inside Gravity workflow JSON.

## Map JavaScript

Read previous step output from `input`. Many app responses are arrays, even for one logical record.

```javascript
const source = input['sourceStepKey']?.[0] || {};

return {
  externalId: String(source.id || '').trim(),
  hasEmail: Boolean(source.email),
  email: source.email || null
};
```

Use maps to build stable flags for condition steps:

```javascript
return {
  shouldCreate: !existing?.id && payload.isValid,
  skipReason: payload.isValid ? null : 'Missing required email'
};
```

Avoid depending on vague generated keys if a Step reference can be used in `args`. When code must use `input.<stepKey>`, choose a readable key based on the step name and use it consistently.

## Gravity Argument References

Use Gravity Step references in `args` and conditions:

```json
{ "label": "Order Id", "value": "[Step 3: input[0].shopifyOrderId]" }
```

```json
"condition": "[Step 9: input[0].id] empty null"
```

Do not leave placeholders such as `{record id}` in final fields. Use visible `{{CONFIRM_*}}` tokens only when the source material lacks a required value.

## NetSuite SuiteScript

Prefer SuiteScript for non-trivial NetSuite searches, saved-search-like filters, transforms, duplicate checks, custom fields, and transaction creation.

Pattern:

```javascript
const payload = ${JSON.stringify(input?.mapBuildPayload?.[0])};

function execute() {
  try {
    if (!payload?.externalId) {
      return [];
    }

    const results = [];
    const recordSearch = search.create({
      type: search.Type.CUSTOMER,
      filters: [
        ['externalidstring', 'is', String(payload.externalId)]
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'entityid' })
      ]
    });

    recordSearch.run().each(function(result) {
      results.push({
        id: String(result.getValue({ name: 'internalid' })),
        fields: {
          entityid: result.getValue({ name: 'entityid' })
        }
      });
      return false;
    });

    return results;
  } catch (error) {
    return {
      success: false,
      message: error.message,
      stack: error.stack,
      error: error
    };
  }
}

execute();
```

SuiteScript rules:

- Interpolate workflow data with `${JSON.stringify(input?.stepKey?.[0])}` before execution.
- Return arrays for searches, even when only one match is expected.
- Return structured objects for creates/updates with IDs and key fields.
- Guard required values before calling NetSuite.
- Use `externalidstring` or approved custom fields for idempotency.
- For transaction transforms, validate line matches before saving.

## Shopify GraphQL

Prefer GraphQL Beta for nested reads, custom filters, and mutations.

Query payload pattern:

```javascript
const since = input.system?.oneHourAgo;

return {
  query: `
    query GetOrders($query: String!, $first: Int!) {
      orders(first: $first, query: $query) {
        edges {
          cursor
          node {
            id
            name
            updatedAt
            displayFinancialStatus
            lineItems(first: 100) {
              edges {
                node { id sku quantity name }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  variables: {
    first: 100,
    query: `updated_at:>=${since}`
  }
};
```

GraphQL rules:

- Include only fields needed by downstream steps.
- Normalize `edges[].node` into plain arrays in a following map step.
- Preserve Shopify global IDs when they are needed for mutations.
- Use app list actions only when filters and nested data are simple.

## Logs And Flow Control

Use flow-control action steps for skip/stop/log/email behavior when representing explicit operational paths.

Failure/skip step shape:

```json
{
  "stepNumber": 12,
  "name": "Flow Control - Skip: Missing Customer Email",
  "type": "action",
  "args": [
    { "label": "Action", "value": "continueLoop" },
    { "label": "Emit Log", "value": "true" },
    { "label": "Log Type", "value": "warning" },
    { "label": "Log Message", "value": "[HubSpot] Skipped customer [Step 3: input[0].externalId] because email is missing." }
  ]
}
```

Use error emails for human-actionable failures. Include real workflow name text in email subjects.
