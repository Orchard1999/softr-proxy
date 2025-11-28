// Get line items for a specific order - DEBUG VERSION
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { orderId } = req.query;

        if (!orderId) {
            res.status(400).json({ 
                success: false, 
                error: 'Order ID is required' 
            });
            return;
        }

        console.log('🔍 DEBUG: Fetching line items for order:', orderId);

        // STEP 1: Get the order first to find its line item IDs
        console.log('🔍 Step 1: Fetching order schema...');
        const orderSchemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/67HNjrAhYDgbOD`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!orderSchemaResponse.ok) {
            throw new Error('Failed to fetch order schema');
        }

        const orderSchemaData = await orderSchemaResponse.json();
        const orderFields = orderSchemaData.data.fields || [];
        
        const orderMapping = {};
        orderFields.forEach(field => {
            orderMapping[field.name] = field.id;
        });

        console.log('📋 Order field mapping:', orderMapping);

        // Get the specific order
        console.log('🔍 Step 2: Fetching order record...');
        const orderResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/67HNjrAhYDgbOD/records/${orderId}`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!orderResponse.ok) {
            throw new Error('Failed to fetch order: ' + orderResponse.status);
        }

        const orderData = await orderResponse.json();
        const order = orderData.data;

        console.log('📦 Order data:', JSON.stringify(order, null, 2));

        // Get the line item IDs from the order
        const lineItemFieldId = orderMapping['Order Line Items'];
        console.log('🔑 Line Item field ID:', lineItemFieldId);
        
        const rawLineItems = order.fields[lineItemFieldId];
        console.log('📋 Raw line items value:', rawLineItems);

        // Extract IDs from line items (could be array of objects or array of strings)
        let lineItemIds = [];
        if (Array.isArray(rawLineItems)) {
            lineItemIds = rawLineItems.map(item => {
                if (typeof item === 'string') {
                    return item;
                } else if (item && item.id) {
                    return item.id;
                }
                return null;
            }).filter(Boolean);
        }

        console.log('🎯 Extracted line item IDs:', lineItemIds);

        if (lineItemIds.length === 0) {
            console.log('⚠️ No line item IDs found!');
            return res.status(200).json({
                success: true,
                data: [],
                count: 0,
                debug: {
                    orderId: orderId,
                    lineItemFieldId: lineItemFieldId,
                    rawLineItems: rawLineItems,
                    extractedIds: lineItemIds
                }
            });
        }

        // STEP 2: Get line items table schema
        console.log('🔍 Step 3: Fetching line items schema...');
        const lineItemSchemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!lineItemSchemaResponse.ok) {
            throw new Error('Failed to fetch line items schema');
        }

        const lineItemSchemaData = await lineItemSchemaResponse.json();
        const lineItemFields = lineItemSchemaData.data.fields || [];
        
        const lineItemMapping = {};
        lineItemFields.forEach(field => {
            lineItemMapping[field.name] = field.id;
        });

        console.log('📋 Line item field mapping:', lineItemMapping);

        // STEP 3: Fetch each line item by ID
        console.log('🔍 Step 4: Fetching individual line items...');
        const lineItems = [];
        
        for (const lineItemId of lineItemIds) {
            console.log(`  → Fetching line item: ${lineItemId}`);
            try {
                const lineItemResponse = await fetch(
                    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP/records/${lineItemId}`,
                    {
                        headers: {
                            'Softr-Api-Key': process.env.SOFTR_API_KEY
                        }
                    }
                );

                console.log(`  → Response status: ${lineItemResponse.status}`);

                if (lineItemResponse.ok) {
                    const lineItemData = await lineItemResponse.json();
                    const record = lineItemData.data;
                    
                    console.log(`  → Line item data:`, JSON.stringify(record, null, 2));
                    
                    // Flatten the record
                    const lineItem = { id: record.id };
                    Object.entries(lineItemMapping).forEach(([name, id]) => {
                        if (record.fields[id] !== undefined) {
                            const value = record.fields[id];
                            // Handle linked fields (arrays)
                            if (Array.isArray(value) && value.length > 0) {
                                lineItem[name] = value[0];
                            } else {
                                lineItem[name] = value;
                            }
                        }
                    });
                    
                    console.log(`  ✅ Flattened line item:`, lineItem);
                    lineItems.push(lineItem);
                } else {
                    console.warn(`  ⚠️ Failed to fetch line item ${lineItemId}: ${lineItemResponse.status}`);
                }
            } catch (err) {
                console.error(`  ❌ Error fetching line item ${lineItemId}:`, err);
            }
        }

        console.log(`✅ Final result: ${lineItems.length} line items`);

        res.status(200).json({
            success: true,
            data: lineItems,
            count: lineItems.length,
            debug: {
                orderId: orderId,
                lineItemFieldId: lineItemFieldId,
                rawLineItems: rawLineItems,
                extractedIds: lineItemIds,
                fetchedCount: lineItems.length
            }
        });

    } catch (error) {
        console.error('❌ Error fetching line items:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}
