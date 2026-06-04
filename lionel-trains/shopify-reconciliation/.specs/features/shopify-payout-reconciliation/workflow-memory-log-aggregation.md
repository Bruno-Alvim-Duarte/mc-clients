# Workflow Memory Log Aggregation

## Problem

Step 15 runs inside the payout loop and creates one log record per payout. Step 16 runs after the loop and builds the batch summary.

Because Step 16 is outside the loop, it only receives the last loop iteration's Step 15 output. That means the batch summary can undercount created, skipped, and failed payouts.

## Desired Pattern

Use Gravity workflow memory as a run-level accumulator:

1. Reset a memory key before the loop starts.
2. In each loop iteration, Step 15 reads the current memory value, appends the current payout log, and outputs the updated array.
3. Immediately after Step 15, a `Set Memory` step writes that updated array back to the same memory key.
4. Step 16 reads the memory key after the loop and builds the batch summary from the full accumulated array.

## Memory Key

Use one stable key:

```text
shopifyPayoutReconciliationLogs
```

This key should be reset at the beginning of every workflow run so logs from a previous run do not leak into the next run.

## Important Syntax

Set Memory stores values as strings automatically. Do not call `JSON.stringify` when setting memory.

Map steps can read memory using:

```javascript
input.memory?.shopifyPayoutReconciliationLogs
```

When reading memory in a map step, parse it:

```javascript
const rawLogs = input.memory?.shopifyPayoutReconciliationLogs;
const existingLogs = rawLogs ? JSON.parse(rawLogs) : [];
```

If the memory value is missing or invalid, use an empty array and continue.

## Step Placement

Add one memory reset before the loop:

```text
Step 3A: Set Memory - Reset Payout Logs
Key: shopifyPayoutReconciliationLogs
Value: []
```

Add one memory update inside the loop, immediately after Step 15:

```text
Step 15A: Set Memory - Append Payout Log
Key: shopifyPayoutReconciliationLogs
Value: Step 15 accumulatedLogs
```

Then update Step 16 to read:

```javascript
const rawLogs = input.memory?.shopifyPayoutReconciliationLogs;
const logResults = rawLogs ? JSON.parse(rawLogs) : [];
```

## Step 15 Output Shape

Step 15 should still return the current payout log, but it also needs to return the updated accumulated array for the Set Memory step:

```javascript
return [{
  ...logEntry,
  accumulatedLogs
}];
```

The Set Memory step should store only `accumulatedLogs`, not the whole Step 15 object.

## Result

Step 16 will summarize all payout log records from the current workflow run, not only the final loop iteration.

