# Warn Once Memory Step Code

Memory key used by all snippets:

```text
processedWarningRecords
```

Memory record shape:

```json
{
  "recordType": "refund",
  "recordId": "1234567890",
  "expirationDate": "2026-07-10T12:00:00.000Z"
}
```

Use `recordType: "order"` when the workflow must suppress the whole Shopify order before refund IDs are available.

## Set Memory Configuration

For every Set Memory step in this design:

- Key: `processedWarningRecords`
- Value: `[Previous Step: input[0].processedWarningRecords]`
- Save on: `success` is fine for normal branches. Use `always` only if the branch must persist memory even after a non-critical downstream issue.

If the Gravity memory step does not expose a separate Value field and only asks for the key, make sure the preceding map returns a top-level property named exactly `processedWarningRecords`.

## Step 3 - Map - Clean Expired Warning Memory Before Orders

Replace the current Step 3 code with this:

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cleanExpired(records) {
  const now = Date.now();

  return records.filter(record => {
    if (!record || !record.recordType || !record.recordId || !record.expirationDate) {
      return false;
    }

    const expiresAt = new Date(record.expirationDate).getTime();

    return !Number.isNaN(expiresAt) && expiresAt > now;
  });
}

const processedWarningRecords = cleanExpired(
  readMemoryArray(input?.memory?.[MEMORY_KEY])
);

return [{
  processedWarningRecords,
  cleanedCount: processedWarningRecords.length
}];
```

## Step 4 - Memory - Set Cleaned Warning Records Before Orders

Set:

```text
processedWarningRecords = [Step 3: input[0].processedWarningRecords]
```

## Step 5 - Map - Map Shopify GraphQL Orders to REST Order Shape

Replace the current Step 5 code with this:

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getShopifyNumericId(adminGraphqlApiId) {
  const raw = String(adminGraphqlApiId || '');
  return raw ? raw.split('/').pop() : '';
}

const processedWarningRecords = readMemoryArray(input?.memory?.[MEMORY_KEY]);

const processedOrderIds = new Set(
  processedWarningRecords
    .filter(record => record && record.recordType === 'order')
    .map(record => String(record.recordId || ''))
    .filter(Boolean)
);

const res = input.shopifyGraphqlBetaZSZ7?.[0];
const edges = res?.data?.orders?.edges ?? [];

return edges
  .map(edge => {
    const node = edge?.node ?? {};

    const adminGraphqlApiId = node.id ?? null;
    const id = adminGraphqlApiId
      ? Number(getShopifyNumericId(adminGraphqlApiId))
      : null;

    return {
      id,
      adminGraphqlApiId,
      name: node.name ?? null,
      number: node.number ?? null,
      orderNumber: node.number ?? null,
      cursor: edge?.cursor ?? null,
      __meta: {
        presentation: {
          type: 'card',
          fields: {},
          entityUrl: ''
        }
      }
    };
  })
  .filter(order => {
    const numericId = String(order.id || '');
    const gid = String(order.adminGraphqlApiId || '');

    return !processedOrderIds.has(numericId) && !processedOrderIds.has(gid);
  });
```

## Step 12 - Map - Clean Expired Warning Memory Before Refunds

Replace the current Step 12 code with this:

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cleanExpired(records) {
  const now = Date.now();

  return records.filter(record => {
    if (!record || !record.recordType || !record.recordId || !record.expirationDate) {
      return false;
    }

    const expiresAt = new Date(record.expirationDate).getTime();

    return !Number.isNaN(expiresAt) && expiresAt > now;
  });
}

const processedWarningRecords = cleanExpired(
  readMemoryArray(input?.memory?.[MEMORY_KEY])
);

return [{
  processedWarningRecords,
  cleanedCount: processedWarningRecords.length
}];
```

## Step 13 - Memory - Set Cleaned Warning Records Before Refunds

Set:

```text
processedWarningRecords = [Step 12: input[0].processedWarningRecords]
```

## Step 14 - Map - Refund Requests

Replace the current Step 14 code with this:

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const orderInfo = input['mapBPU2'][0];
const refunds = input['shopifyListOrderRefundsXVJ2'] || [];

const processedWarningRecords = readMemoryArray(input?.memory?.[MEMORY_KEY]);

const processedRefundIds = new Set(
  processedWarningRecords
    .filter(record => record && record.recordType === 'refund')
    .map(record => String(record.recordId || ''))
    .filter(Boolean)
);

const processedOrderIds = new Set(
  processedWarningRecords
    .filter(record => record && record.recordType === 'order')
    .map(record => String(record.recordId || ''))
    .filter(Boolean)
);

const orderId = String(orderInfo?.shopifyOrderId || '');

if (orderId && processedOrderIds.has(orderId)) {
  return [];
}

return refunds
  .map(refund => {
    const refundId = String(refund.id || '');

    const items = (refund.refundLineItems || [])
      .filter(line => Number(line.quantity || 0) > 0)
      .map(line => ({
        refundLineItemId: String(line.id || ''),
        lineItemId: String(line.lineItemId || line.lineItem?.id || ''),
        variantId: String(line.lineItem?.variantId || line.lineItem?.variant?.id || ''),
        sku: String(line.lineItem?.sku || '').trim().toUpperCase(),
        name: line.lineItem?.name || '',
        quantity: Number(line.quantity || 0),
        subtotal: Number(line.subtotal || 0),
        totalTax: Number(line.totalTax || 0)
      }))
      .filter(line => line.lineItemId && line.sku && line.quantity > 0);

    return {
      refundId,
      shopifyOrderId: orderInfo.shopifyOrderId,
      shopifyOrderName: orderInfo.shopifyOrderName,
      externalId: `lionel-shopify-rma-${orderInfo.shopifyOrderId}-${refundId}`,
      items
    };
  })
  .filter(refund =>
    refund.refundId &&
    refund.items.length > 0 &&
    !processedRefundIds.has(String(refund.refundId))
  );
```

## Step 25 - Map - Add Refund Warning Record To Memory (RMA Failed)

Use this for Step 25:

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cleanExpired(records) {
  const now = Date.now();

  return records.filter(record => {
    if (!record || !record.recordType || !record.recordId || !record.expirationDate) {
      return false;
    }

    const expiresAt = new Date(record.expirationDate).getTime();

    return !Number.isNaN(expiresAt) && expiresAt > now;
  });
}

function appendOrRefreshRecord(records, recordType, recordId) {
  const cleaned = cleanExpired(records);
  const id = String(recordId || '');

  if (!id) {
    return cleaned;
  }

  const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const withoutExisting = cleaned.filter(record =>
    !(record.recordType === recordType && String(record.recordId) === id)
  );

  return withoutExisting.concat([{
    recordType,
    recordId: id,
    expirationDate
  }]);
}

const rmaData =
  input['map4QBZ']?.[0] ||
  input['iterate0UAR']?.[0] ||
  {};

const refundId = String(rmaData.refundId || '');
const previous = readMemoryArray(input?.memory?.[MEMORY_KEY]);
const processedWarningRecords = appendOrRefreshRecord(previous, 'refund', refundId);

return [{
  processedWarningRecords,
  addedWarningRecord: refundId ? {
    recordType: 'refund',
    recordId: refundId
  } : null
}];
```

## Step 26 - Memory - Set Warning Records After RMA Failed

Set:

```text
processedWarningRecords = [Step 25: input[0].processedWarningRecords]
```

## Step 29 - Map - Add Refund Warning Record To Memory

Use the same code as Step 25.

This is intentional. Any warning branch that already has the refund context should append/refresh the current refund ID in the same way.

## Step 30 - Memory - Set Warning Records After Step 29

Set:

```text
processedWarningRecords = [Step 29: input[0].processedWarningRecords]
```

## New Step After Step 27 - Map - Add Refund Warning Record To Memory (Existing RMA Found)

Add this map immediately after the Step 27 existing-RMA log, then add a Set Memory step after it.

Use the same code as Step 25.

Recommended names:

```text
Map - Add Refund Warning Record To Memory (Existing RMA Found)
Memory - Set Warning Records After Existing RMA Found
```

The memory step should set:

```text
processedWarningRecords = [New Map Step: input[0].processedWarningRecords]
```

## Optional Branch Without Refund IDs - Map - Add Order Warning Record To Memory

Use this only on the branch where the workflow warns before refunds are available. This branch should suppress the full Shopify order for 24 hours.

```javascript
const MEMORY_KEY = 'processedWarningRecords';

function readMemoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cleanExpired(records) {
  const now = Date.now();

  return records.filter(record => {
    if (!record || !record.recordType || !record.recordId || !record.expirationDate) {
      return false;
    }

    const expiresAt = new Date(record.expirationDate).getTime();

    return !Number.isNaN(expiresAt) && expiresAt > now;
  });
}

function appendOrRefreshRecord(records, recordType, recordId) {
  const cleaned = cleanExpired(records);
  const id = String(recordId || '');

  if (!id) {
    return cleaned;
  }

  const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const withoutExisting = cleaned.filter(record =>
    !(record.recordType === recordType && String(record.recordId) === id)
  );

  return withoutExisting.concat([{
    recordType,
    recordId: id,
    expirationDate
  }]);
}

const orderInfo =
  input['mapBPU2']?.[0] ||
  input['iterateHLTD']?.[0] ||
  {};

const orderId = String(
  orderInfo.shopifyOrderId ||
  orderInfo.id ||
  ''
);

const previous = readMemoryArray(input?.memory?.[MEMORY_KEY]);
const processedWarningRecords = appendOrRefreshRecord(previous, 'order', orderId);

return [{
  processedWarningRecords,
  addedWarningRecord: orderId ? {
    recordType: 'order',
    recordId: orderId
  } : null
}];
```

Then add a Set Memory step:

```text
processedWarningRecords = [Order Warning Map Step: input[0].processedWarningRecords]
```

## Important Wiring Check

These snippets assume the current workflow keys visible in the exported workflow:

- `shopifyGraphqlBetaZSZ7` for Shopify orders.
- `mapBPU2` for Shopify order identifiers.
- `shopifyListOrderRefundsXVJ2` for Shopify refunds.
- `iterate0UAR` for the current refund loop item.
- `map4QBZ` for matched RMA/refund data.

If Gravity generated different keys in the live workflow, replace only those `input['...']` names. Do not change the memory key.
