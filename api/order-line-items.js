// Get line items for a specific order - FINAL FIXED VERSION
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

        // Get line items table schema
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!schemaResponse.ok) {
            throw new Error('Failed to fetch line items schema');
        }

        const schemaData = await schemaResponse.json();
        const fields = schemaData.data.fields || [];
        
        const mapping = {};
        fields.forEach(field => {
            mapping[field.name] = field.id;
        });

        // Fetch all line items
        const lineItemsResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP/records?limit=3000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!lineItemsResponse.ok) {
            throw new Error('Failed to fetch line items');
        }

        const lineItemsData = await lineItemsResponse.json();
        const records = lineItemsData.data || [];

        // Filter to this order's line items using the "Order ID" linked field
        const orderIdFieldId = mapping['Order ID'];
        
        const orderLineItems = records.filter(record => {
            const orderIdValue = record.fields[orderIdFieldId];
            
            // Handle linked field (array of IDs)
            if (Array.isArray(orderIdValue)) {
                return orderIdValue.includes(orderId);
            }
            // Handle string ID
            return orderIdValue === orderId;
        });

        console.log(`✅ Found ${orderLineItems.length} line items for order ${orderId}`);

        // Flatten the records with correct field mappings
        const flattenedItems = orderLineItems.map(record => {
            const lineItem = { id: record.id };
            
            // Map each field
            Object.entries(mapping).forEach(([name, id]) => {
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
            
            // Map "Backing" to "Backing" (in case of typo in column name)
            if (record.fields[mapping['Backng']]) {
                lineItem['Backing'] = record.fields[mapping['Backng']];
            }
            
            // Map to frontend expected names
            if (lineItem['Product Code']) {
                lineItem['Design'] = lineItem['Design'] || lineItem['Product Code'];
            }
            
            return lineItem;
        });

        res.status(200).json({
            success: true,
            data: flattenedItems,
            count: flattenedItems.length
        });

    } catch (error) {
        console.error('Error fetching line items:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
