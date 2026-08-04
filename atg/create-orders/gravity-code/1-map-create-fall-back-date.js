const test = new Date();
const variables = input['workflowArguments']
const res = new Date(test);
res.setDate(res.getDate() - 7);

const configuredDate = "2026-07-22T23:59:59Z"; // or null/undefined if not configured

const fallBackDate = configuredDate || res.toISOString();

const fulfillmentType = variables.recordType === 'cashsale' ? "fulfillment_status:fulfilled" : "fulfillment_status:unfulfilled"


return [{fallBackDate , fulfillmentType}];