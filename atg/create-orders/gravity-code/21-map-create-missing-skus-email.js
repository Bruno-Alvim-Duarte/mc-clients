const missingSKUs = input['netsuiteExecuteCustomCode9Q9L'][0].missingSkus;


const email = `
Hello,

During the Shopify → NetSuite synchronization, some SKUs from Shopify could not be found in NetSuite.

Please review the following missing SKUs:

${missingSKUs.map(sku => `- ${sku}`).join("\n")}

These items has blocked the Workflow because no matching SKU exists in NetSuite.

Please verify that the SKUs exist in NetSuite and match the corresponding Shopify SKUs before running the synchronization again.

Best regards,
MindCloud Team
`;

return [{email}];