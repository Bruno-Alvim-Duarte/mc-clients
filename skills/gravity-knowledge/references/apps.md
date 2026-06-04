# Gravity App Nuances

Use this reference when a Gravity workflow touches a specific external app or when choosing the best app action for a platform.

## NetSuite

Prefer **Execute Custom Code** for most non-trivial NetSuite work. Although NetSuite app actions such as `List Contacts` or `List Customers` exist, custom SuiteScript usually gives better control for searches, saved searches, record creation, duplicate checks, and custom business logic.

Gravity SuiteScript snippets can interpolate workflow input before execution. This example reads the current loop item from `input.iterateJVCA[0]` and searches for an existing Journal Entry by external ID:

```javascript
(function() {
  var payload = ${JSON.stringify(input?.iterateJVCA?.[0])};
  var externalId = payload.id;

  if (!externalId) {
    throw new Error('Missing externalId for Journal Entry duplicate search');
  }

  var results = [];

  var jeSearch = search.create({
    type: search.Type.TRANSACTION,
    filters: [
      ['type', 'anyof', 'Journal'],
      'AND',
      ['mainline', 'is', 'T'],
      'AND',
      ['externalidstring', 'is', externalId]
    ],
    columns: [
      search.createColumn({ name: 'internalid' }),
      search.createColumn({ name: 'externalid' }),
      search.createColumn({ name: 'trandate' }),
      search.createColumn({ name: 'memo' })
    ]
  });

  jeSearch.run().each(function(result) {
    results.push({
      internalId: result.getValue({ name: 'internalid' }),
      externalId: result.getValue({ name: 'externalid' }),
      tranDate: result.getValue({ name: 'trandate' }),
      memo: result.getValue({ name: 'memo' })
    });

    return results.length < 1;
  });

  return {
    found: results.length > 0,
    items: results,
    existingJournalEntry: results.length > 0 ? results[0] : null,
    payoutId: payload.payoutId || null,
    externalId: externalId
  };
}());
```

## Shopify

Prefer **GraphQL Beta** for most non-trivial Shopify work because it can run arbitrary GraphQL queries and mutations. Activate **App Developer Mode** before using this action.

Use basic list actions only when they are enough for the workflow and do not require custom filtering, joins, nested fields, or mutations.

## Acumatica

Use Acumatica's value wrapper shape when reading or writing record fields:

```javascript
{
  propertyName: {
    value: "actual_value"
  }
}
```

Set fields using `property: { value: actualValue }` and read fields through `property.value` unless a specific endpoint returns a different shape.
