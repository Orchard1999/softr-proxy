// Get line items for a specific order - DIRECT FETCH VERSION
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

        console.log('Fetching line items for order:', orderId);

        // STEP 1: Get the order to find its line item IDs
        const orderResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/67HNjrAhYDgbOD/records/${orderId}`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!orderResponse.ok) {
            throw new Error('Failed to fetch order');
        }

        const orderData = await orderResponse.json();
        
        // Get order schema to find Order Line Items field
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

        // Get the line item IDs from the order
        const lineItemsFieldId = orderMapping['Order Line Items'];
        const lineItemIds = orderData.data.fields[lineItemsFieldId] || [];
        
        console.log('Line item IDs from order:', lineItemIds);

        if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                count: 0
            });
        }

        // Extract just the IDs (they come as objects with id and label)
        const ids = lineItemIds.map(item => {
            if (typeof item === 'string') return item;
            if (item && item.id) return item.id;
            return null;
        }).filter(Boolean);

        console.log('Extracted IDs:', ids);

        // STEP 2: Get line items table schema
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

        // STEP 3: Fetch each line item directly by ID
        const lineItems = [];
        
        for (const lineItemId of ids) {
            try {
                const lineItemResponse = await fetch(
                    `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP/records/${lineItemId}`,
                    {
                        headers: {
                            'Softr-Api-Key': process.env.SOFTR_API_KEY
                        }
                    }
                );

                if (lineItemResponse.ok) {
                    const lineItemData = await lineItemResponse.json();
                    const record = lineItemData.data;
                    
                    // Flatten the record
                    const lineItem = { id: record.id };
                    
                    Object.entries(lineItemMapping).forEach(([name, id]) => {
                        if (record.fields[id] !== undefined) {
                            const value = record.fields[id];
                            
                            // Handle linked fields (arrays) - extract first value
                            if (Array.isArray(value) && value.length > 0) {
                                lineItem[name] = value[0];
                            } else {
                                lineItem[name] = value;
                            }
                        }
                    });
                    
                    // Handle potential typo in Backing field name
                    if (!lineItem['Backing'] && record.fields[lineItemMapping['Backng']]) {
                        lineItem['Backing'] = record.fields[lineItemMapping['Backng']];
                    }
                    
                    lineItems.push(lineItem);
                    console.log('✅ Fetched line item:', lineItemId);
                } else {
                    console.warn('⚠️ Failed to fetch line item:', lineItemId, lineItemResponse.status);
                }
            } catch (err) {
                console.error('❌ Error fetching line item:', lineItemId, err);
            }
        }

        console.log(`✅ Found ${lineItems.length} line items`);

        res.status(200).json({
            success: true,
            data: lineItems,
            count: lineItems.length
        });

    } catch (error) {
        console.error('Error fetching line items:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
