const data = input?.shopifyGraphqlBetaWTVO?.[0]?.data;

// const data = input.shopifyGraphqlBetaIADH[0].data

const edges = data?.orders?.edges ?? [];

const result = edges.map(edge => {

    if (!edge.node.legacyResourceId) {
        return {
            ...edge.node,
            legacyResourceId: edge.node.id.split('/').pop(),
        }
    } else {
        return {
            ...edge.node
        }
    }

});

return [{ result }];
