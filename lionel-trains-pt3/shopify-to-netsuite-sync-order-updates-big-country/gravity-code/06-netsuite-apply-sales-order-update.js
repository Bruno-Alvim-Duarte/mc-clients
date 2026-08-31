const plan = ${JSON.stringify(input['mapAX8Y']?.[0] || {})};

function execute() {
  try {
    if (!plan.canApply) {
      return {
        success: true,
        skipped: true,
        action: plan.action,
        reason: plan.reason,
        message: plan.detail || 'Plan is not applyable.',
      };
    }

    const salesOrderId = plan.netsuite && plan.netsuite.salesOrder && plan.netsuite.salesOrder.internalId;
    if (!salesOrderId) {
      throw new Error('Missing NetSuite Sales Order internal ID in update plan.');
    }

    const salesOrder = record.load({
      type: 'salesorder',
      id: salesOrderId,
      isDynamic: true,
    });

    const statusRef = salesOrder.getValue({ fieldId: 'orderstatus' });
    if (statusRef !== 'A' && statusRef !== 'B') {
      return {
        success: false,
        skipped: true,
        action: plan.action,
        message: 'Sales Order became ineligible before update. Current status: ' + statusRef,
        salesOrderId: String(salesOrderId),
        statusRef,
      };
    }

    function toNumber(value, fallback) {
      const num = Number(value);
      return isNaN(num) ? fallback : num;
    }

    function roundMoney(value) {
      return Math.round((Number(value) || 0) * 100) / 100;
    }

    function uniqueList(values) {
      const seen = {};
      const result = [];
      (values || []).forEach(function(value) {
        const text = String(value || '').trim();
        if (!text || seen[text]) return;
        seen[text] = true;
        result.push(text);
      });
      return result;
    }

    function buildLineDescription(target, existingDescription) {
      const existing = String(existingDescription || '').trim();
      const base = existing || String(target.title || target.sku || '').trim();
      const notes = uniqueList(target.descriptionNotes || []);
      if (!notes.length) return base;

      const existingParts = {};
      base.split(' - ').forEach(function(part) {
        const text = String(part || '').trim();
        if (text) existingParts[text] = true;
      });

      const notesToAppend = notes.filter(function(note) {
        return !existingParts[note];
      });

      return [base].concat(notesToAppend).filter(Boolean).join(' - ');
    }

    function appendMemo(note) {
      if (!note) return;
      const existingMemo = salesOrder.getValue({ fieldId: 'memo' }) || '';
      const nextMemo = existingMemo.indexOf(note) === -1
        ? [existingMemo, note].filter(Boolean).join(' | ')
        : existingMemo;
      salesOrder.setValue({ fieldId: 'memo', value: nextMemo });
    }

    function setSubrecordAddress(fieldId, addressData) {
      if (!addressData) return false;

      const subrecord = salesOrder.getSubrecord({ fieldId });
      const addressee = addressData.name || [addressData.firstName, addressData.lastName].filter(Boolean).join(' ').trim();

      const fields = {
        country: addressData.countryCodeV2 || addressData.countryCode || addressData.country,
        addressee,
        attention: addressData.company,
        addr1: addressData.address1,
        addr2: addressData.address2,
        city: addressData.city,
        state: addressData.provinceCode || addressData.province,
        zip: addressData.zip,
        addrphone: addressData.phone,
      };

      Object.keys(fields).forEach(function(fieldIdToSet) {
        const value = fields[fieldIdToSet];
        if (value !== null && value !== undefined && value !== '') {
          subrecord.setValue({ fieldId: fieldIdToSet, value });
        }
      });

      return true;
    }

    function cancelSalesOrder() {
      const previousStatus = salesOrder.getValue({ fieldId: 'orderstatus' });
      const lineCount = salesOrder.getLineCount({ sublistId: 'item' });
      let closedLineCount = 0;
      let alreadyClosedLineCount = 0;

      for (let i = 0; i < lineCount; i++) {
        const isClosed = salesOrder.getSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          line: i,
        }) === true;

        if (isClosed) {
          alreadyClosedLineCount++;
          continue;
        }

        salesOrder.selectLine({ sublistId: 'item', line: i });
        salesOrder.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          value: true,
          forceSyncSourcing: true,
        });
        salesOrder.commitLine({ sublistId: 'item' });
        closedLineCount++;
      }

      return {
        previousStatus,
        targetStatus: 'H',
        targetStatusText: 'Closed',
        method: 'close_item_lines',
        lineCount,
        closedLineCount,
        alreadyClosedLineCount,
      };
    }

    function getProductSubtotal(discountItemId) {
      const lineCount = salesOrder.getLineCount({ sublistId: 'item' });
      let subtotal = 0;

      for (let i = 0; i < lineCount; i++) {
        const item = String(salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }) || '');
        const isClosed = salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'isclosed', line: i }) === true;
        if (isClosed || (discountItemId && item === String(discountItemId))) continue;
        const amount = Number(salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i }) || 0);
        if (amount > 0) subtotal += amount;
      }

      return roundMoney(subtotal);
    }

    function setDiscount(discountAmount, discountItemId, defaultLocationId, percentFieldId) {
      if (percentFieldId) {
        const subtotal = getProductSubtotal(discountItemId);
        const percent = subtotal > 0 && discountAmount > 0
          ? Math.round((Math.abs(discountAmount) / subtotal) * 10000) / 100
          : 0;
        salesOrder.setValue({ fieldId: percentFieldId, value: percent });
      }

      if (!discountItemId) return { changed: false, reason: 'missing_discount_item' };

      const lineCount = salesOrder.getLineCount({ sublistId: 'item' });
      let discountLine = -1;

      for (let i = 0; i < lineCount; i++) {
        const item = String(salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }) || '');
        if (item === String(discountItemId)) {
          discountLine = i;
          break;
        }
      }

      if (!discountAmount || discountAmount <= 0) {
        if (discountLine >= 0) {
          salesOrder.selectLine({ sublistId: 'item', line: discountLine });
          salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'isclosed', value: true, forceSyncSourcing: true });
          salesOrder.commitLine({ sublistId: 'item' });
          return { changed: true, closed: true };
        }
        return { changed: false };
      }

      if (discountLine >= 0) {
        salesOrder.selectLine({ sublistId: 'item', line: discountLine });
      } else {
        salesOrder.selectNewLine({ sublistId: 'item' });
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(discountItemId), forceSyncSourcing: true });
      }

      if (defaultLocationId) {
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: Number(defaultLocationId), forceSyncSourcing: true });
      }

      salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
      salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'price', value: -1, forceSyncSourcing: true });
      salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: -Math.abs(discountAmount), forceSyncSourcing: true });
      salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'isclosed', value: false, forceSyncSourcing: true });
      salesOrder.commitLine({ sublistId: 'item' });

      return { changed: true, closed: false };
    }

    function applyEdit() {
      const edit = plan.edit || {};
      const targetLines = edit.targetLines || [];
      const notesToCarry = Array.isArray(edit.notesToCarry) ? edit.notesToCarry : [];
      const discountItemId = edit.discountItemId ? String(edit.discountItemId) : '';
      const usedExistingLines = {};
      const keptLineIndexes = {};
      let updatedLineCount = 0;
      let addedLineCount = 0;
      let removedLineCount = 0;

      if (edit.shippingAddress) {
        setSubrecordAddress('shippingaddress', edit.shippingAddress);
      }

      targetLines.forEach(function(target) {
        const targetItemId = String(target.netsuiteItemId || '');
        if (!targetItemId) {
          throw new Error('Missing NetSuite item ID for Shopify SKU ' + target.sku);
        }

        let existingLine = -1;
        const lineCount = salesOrder.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
          if (usedExistingLines[i]) continue;
          const item = String(salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }) || '');
          const isClosed = salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'isclosed', line: i }) === true;
          if (!isClosed && item === targetItemId) {
            existingLine = i;
            break;
          }
        }

        if (existingLine >= 0) {
          salesOrder.selectLine({ sublistId: 'item', line: existingLine });
          usedExistingLines[existingLine] = true;
          keptLineIndexes[existingLine] = true;
          updatedLineCount++;
        } else {
          keptLineIndexes[lineCount] = true;
          salesOrder.selectNewLine({ sublistId: 'item' });
          salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: Number(targetItemId), forceSyncSourcing: true });
          addedLineCount++;
        }

        if (target.netsuiteLocationId) {
          salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: Number(target.netsuiteLocationId), forceSyncSourcing: true });
        }

        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: toNumber(target.quantity, 0), forceSyncSourcing: true });
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'price', value: -1, forceSyncSourcing: true });
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: toNumber(target.rate, 0), forceSyncSourcing: true });
        const existingDescription = salesOrder.getCurrentSublistValue({ sublistId: 'item', fieldId: 'description' });
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: buildLineDescription(target, existingDescription) });
        salesOrder.setCurrentSublistValue({ sublistId: 'item', fieldId: 'isclosed', value: false, forceSyncSourcing: true });
        salesOrder.commitLine({ sublistId: 'item' });
      });

      const finalLineCount = salesOrder.getLineCount({ sublistId: 'item' });
      for (let i = finalLineCount - 1; i >= 0; i--) {
        const item = String(salesOrder.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }) || '');
        if ((discountItemId && item === discountItemId) || keptLineIndexes[i]) continue;

        salesOrder.removeLine({
          sublistId: 'item',
          line: i,
          ignoreRecalc: false,
        });
        removedLineCount++;
      }

      const discountResult = setDiscount(
        Number(edit.discountAmount || 0),
        edit.discountItemId,
        edit.defaultLocationId,
        edit.discountPercentFieldId
      );

      appendMemo(edit.memoNote);

      return {
        updatedLineCount,
        addedLineCount,
        removedLineCount,
        notesToCarry,
        notesDestinationStatus: notesToCarry.length ? 'line_description_applied' : 'no_notes',
        discountResult,
      };
    }

    let mutationResult = {};

    if (plan.action === 'apply_cancellation') {
      mutationResult = cancelSalesOrder();
      appendMemo(plan.cancellation && plan.cancellation.memoNote);
    } else if (plan.action === 'apply_edit') {
      mutationResult = applyEdit();
    } else {
      return {
        success: true,
        skipped: true,
        action: plan.action,
        message: 'No NetSuite mutation required for action ' + plan.action,
      };
    }

    const savedId = salesOrder.save({
      enableSourcing: true,
      ignoreMandatoryFields: false,
    });

    return {
      success: true,
      skipped: false,
      action: plan.action,
      salesOrderId: String(savedId),
      shopifyOrderName: plan.shopifyOrder && plan.shopifyOrder.name,
      mutationResult,
    };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      action: plan.action,
      message: error.message,
      stack: error.stack,
      error,
      salesOrderId: plan.netsuite && plan.netsuite.salesOrder && plan.netsuite.salesOrder.internalId,
      shopifyOrderName: plan.shopifyOrder && plan.shopifyOrder.name,
    };
  }
}

execute();
