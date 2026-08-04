const customerCreationError = input['netsuiteExecuteCustomCode7JLT'][0].error;
const loopIteration = input['iterateELDR'][0];


const orderNumber = loopIteration.number
const customer = loopIteration.customer

const email = `
There was an issue while trying to create the customer of the order #${orderNumber}

reason: ${customerCreationError}
Customer Details:
shopify ID: ${customer.legacyResourceId},
email: ${customer.email}
display name: ${customer.displayName}
has Default address: ${!!customer.defaultAddress}

sent by:
MindCloud
`

return [{email}]