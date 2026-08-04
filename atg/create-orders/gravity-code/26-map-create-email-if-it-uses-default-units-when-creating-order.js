const result = input['netsuiteExecuteCustomCodeVV1H'][0];
const loopIteration = input['iterateELDR'][0]

const skusMessage = result?.defaultUnitSkus?.join(', ')||''

const email = `
The order # ${loopIteration.number} had to use the default unit of the items:
- SKUs: ${skusMessage}

These SKUs needs to be cheked whether they are using the correct Default Value for Units.


Sent By:
MindCloud
`


return [{email}]