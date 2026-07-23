const args = ${JSON.stringify(input['mapPOD2'][0])};
const wfArguments = ${JSON.stringify(input['workflowArguments'])}

try {
    const customerRec = record.create({
        type: 'customer',
        isDynamic: true
    });

    // -----------------------------
    // Helpers
    // -----------------------------
    function getShopifyNumericId(gid) {
        if (!gid) return null;
        return String(gid).split('/').pop();
    }

    const NETSUITE_PERSON_NAME_MAX_LENGTH = 32;

    function truncatePersonName(value) {
        if (!value) return '';
        return String(value).slice(0, NETSUITE_PERSON_NAME_MAX_LENGTH);
    }

    function buildName(firstName, lastName, fallback) {
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        return fullName || fallback || 'Shopify Customer';
    }

    function getSourceText(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim().toLowerCase();
    }

    function getOrderSourceName(order) {
        return getSourceText(order?.sourceName);
    }

    function getCustomAttributesText(order) {
        if (!Array.isArray(order?.customAttributes)) {
            return '';
        }

        return order.customAttributes
            .map(function (attribute) {
                return [
                    getSourceText(attribute?.key),
                    getSourceText(attribute?.value)
                ].filter(Boolean).join(' ');
            })
            .filter(Boolean)
            .join(' ');
    }

    function getShopifyCustomerClass(order) {
        const sourceName = getOrderSourceName(order);

        if (sourceName === '71323942913') return '3';
        if (sourceName === 'amazon') return '1';
        if (sourceName === 'ebay') return '2';

        const customAttributesText = getCustomAttributesText(order);

        if (customAttributesText.indexOf('walmart') !== -1) return '3';
        if (customAttributesText.indexOf('amazon') !== -1) return '1';
        if (customAttributesText.indexOf('ebay') !== -1) return '2';

        return '4';
    }

    function mapCountry(countryCode) {
        // Shopify usually returns countryCodeV2 like "US", "CA", "BR"
        // NetSuite normally accepts the 2-letter country code in SuiteScript.
        return countryCode || null;
    }

    function addAddressLine({
        addressData,
        defaultBilling,
        defaultShipping,
        label
    }) {
        if (!addressData) return;

        customerRec.selectNewLine({ sublistId: 'addressbook' });

        customerRec.setCurrentSublistValue({
            sublistId: 'addressbook',
            fieldId: 'defaultbilling',
            value: !!defaultBilling
        });

        customerRec.setCurrentSublistValue({
            sublistId: 'addressbook',
            fieldId: 'defaultshipping',
            value: !!defaultShipping
        });

        customerRec.setCurrentSublistValue({
            sublistId: 'addressbook',
            fieldId: 'isresidential',
            value: true
        });

        if (label) {
            customerRec.setCurrentSublistValue({
                sublistId: 'addressbook',
                fieldId: 'label',
                value: label
            });
        }

        const addrSubrecord = customerRec.getCurrentSublistSubrecord({
            sublistId: 'addressbook',
            fieldId: 'addressbookaddress'
        });

        const addressee =
            addressData.name ||
            [addressData.firstName, addressData.lastName].filter(Boolean).join(' ').trim() ||
            customerName;

        const country =
            mapCountry(addressData.countryCodeV2 || addressData.countryCode || addressData.country);

        if (country) {
            addrSubrecord.setValue({
                fieldId: 'country',
                value: country
            });
        }

        if (addressee) {
            addrSubrecord.setValue({
                fieldId: 'addressee',
                value: addressee
            });
        }

        if (addressData.company) {
            addrSubrecord.setValue({
                fieldId: 'attention',
                value: addressData.company
            });
        }

        if (addressData.address1) {
            addrSubrecord.setValue({
                fieldId: 'addr1',
                value: addressData.address1
            });
        }

        if (addressData.address2) {
            addrSubrecord.setValue({
                fieldId: 'addr2',
                value: addressData.address2
            });
        }

        if (addressData.city) {
            addrSubrecord.setValue({
                fieldId: 'city',
                value: addressData.city
            });
        }

        if (addressData.provinceCode || addressData.province) {
            addrSubrecord.setValue({
                fieldId: 'state',
                value: addressData.provinceCode || addressData.province
            });
        }

        if (addressData.zip) {
            addrSubrecord.setValue({
                fieldId: 'zip',
                value: addressData.zip
            });
        }

        if (addressData.phone) {
            addrSubrecord.setValue({
                fieldId: 'addrphone',
                value: addressData.phone
            });
        }

        customerRec.commitLine({ sublistId: 'addressbook' });
    }

    // -----------------------------
    // Shopify source data
    // -----------------------------
    const billingAddress = args.billingAddress || null;
    const shippingAddress = args.shippingAddress || null;
    const shopifyCustomerClass = getShopifyCustomerClass(args);

    const shopifyCustomerId = getShopifyNumericId(args.customerId || args.customer?.id);
    const shopifyOrderId = getShopifyNumericId(args.orderId || args.id);

    const customerFirstName = truncatePersonName(
        args.customerFirstName ||
        args.customer?.firstName ||
        billingAddress?.firstName ||
        shippingAddress?.firstName ||
        ''
    );

    const customerLastName = truncatePersonName(
        args.customerLastName ||
        args.customer?.lastName ||
        billingAddress?.lastName ||
        shippingAddress?.lastName ||
        ''
    );

    const customerEmail =
        args.customerEmail ||
        args.customer?.email ||
        args.email ||
        '';

    const customerPhone =
        args.customerPhone ||
        args.customer?.phone ||
        billingAddress?.phone ||
        shippingAddress?.phone ||
        '';

    const customerName = buildName(
        customerFirstName,
        customerLastName,
        billingAddress?.name || shippingAddress?.name || customerEmail
    );

    // -----------------------------
    // Main Body Fields
    // -----------------------------

    customerRec.setValue({
        fieldId: 'customform',
        value: 63
    });

    customerRec.setValue({
        fieldId: 'isperson',
        value: 'T'
    });

    if (customerFirstName) {
        customerRec.setValue({
            fieldId: 'firstname',
            value: customerFirstName
        });
    }

    if (customerLastName) {
        customerRec.setValue({
            fieldId: 'lastname',
            value: customerLastName
        });
    }

    if (customerEmail) {
        customerRec.setValue({
            fieldId: 'email',
            value: customerEmail
        });
    }

    if (customerPhone) {
        customerRec.setValue({
            fieldId: 'phone',
            value: customerPhone
        });
    }

    customerRec.setValue({
        fieldId: 'subsidiary',
        value: 3
    });

    customerRec.setValue({
        fieldId: 'entitystatus',
        value: wfArguments.statusID
    });

    customerRec.setValue({
        fieldId: 'csegdivision',
        value: wfArguments.divisionID
    });

    customerRec.setValue({
        fieldId: 'custentity_customer_class',
        value: wfArguments.customerClassID
    });

    customerRec.setValue({
        fieldId: 'custentity_shopify_cust_class',
        value: shopifyCustomerClass
    });

    customerRec.setValue({
        fieldId: 'custentity_shopify_email',
        value: customerEmail
    });

    // -----------------------------
    // Address Book
    // -----------------------------

    if (billingAddress) {
        addAddressLine({
            addressData: billingAddress,
            defaultBilling: true,
            defaultShipping: !shippingAddress,
            label: 'Shopify Billing Address'
        });
    }

    if (shippingAddress) {
        addAddressLine({
            addressData: shippingAddress,
            defaultBilling: !billingAddress,
            defaultShipping: true,
            label: 'Shopify Shipping Address'
        });
    }

    // -----------------------------
    // Save
    // -----------------------------
    const newRecordId = customerRec.save({
        enableSourcing: true,
        ignoreMandatoryFields: false
    });

    var result = {
        success: true,
        recordId: newRecordId,
        message: 'Customer created successfully',
        dataAdded: {
            firstName: customerFirstName,
            lastName: customerLastName,
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            billingAddressAdded: !!billingAddress,
            shippingAddressAdded: !!shippingAddress
        }
    };

    result;

} catch (e) {
    var errorResult = {
        success: false,
        message: e.message,
        stack: e.stack
    };

    errorResult;
}
