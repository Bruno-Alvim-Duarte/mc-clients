const config = input['map9QOY']?.[0] || {};
  const currentOrders = input['amazonSellerListOrdersKFHW'] || [];
  const memoryState = input['map3HMU']?.[0] || {};
  const cachedRetryOrders = Array.isArray(memoryState.retryFetchedOrders)
    ? memoryState.retryFetchedOrders
    : [];

  const retryIds = new Set(config.retryOrderIds || []);

  const retrySources = cachedRetryOrders.filter(order =>
    retryIds.has(
      String(order.AmazonOrderId || order.amazonOrderId || order.id || '').trim()
    )
  );

  const byId = new Map();

  for (const sourceOrder of [...currentOrders, ...retrySources]) {
    const id = String(
      sourceOrder.AmazonOrderId ||
      sourceOrder.amazonOrderId ||
      sourceOrder.id ||
      ''
    ).trim();

    if (!id) continue;

    const status = String(
      sourceOrder.OrderStatus ||
      sourceOrder.orderStatus ||
      ''
    ).toLowerCase();

    const channel = String(
      sourceOrder.FulfillmentChannel ||
      sourceOrder.fulfillmentChannel ||
      ''
    ).toUpperCase();

    if (status && status !== 'shipped') continue;
    if (channel && channel !== 'AFN') continue;

    const isRetry = retryIds.has(id) || Boolean(sourceOrder.isRetry);

    byId.set(id, {
      ...sourceOrder,
      AmazonOrderId: id,
      isRetry,
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    String(a.LastUpdateDate || a.lastUpdateDate || '').localeCompare(
      String(b.LastUpdateDate || b.lastUpdateDate || '')
    ) ||
    String(a.AmazonOrderId).localeCompare(String(b.AmazonOrderId))
  );