const config = input['map9QOY']?.[0] || {};
const seen = new Set();
return (config.retryOrders || []).filter(record => {
  const id = String(record.amazonOrderId || '').trim();
  if (!id || seen.has(id)) return false;
  seen.add(id);
  return true;
});