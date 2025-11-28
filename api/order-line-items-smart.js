// Get line items for a specific order - SMART VERSION
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { orderId, orderNumber } = req.query;

        if (!orderId && !orderNumber) {
            res.status(400).json({ 
                success: false, 
                error: 'Order ID or Order Number is required' 
            });
            return;
        }

        console.log('Fetching line items for:', { orderId, orderNumber });

        // Get table schema first
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!schemaResponse.ok) {
            throw new Error('Failed to fetch table schema');
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

        // Try to match by Order ID first, then Order Number
        const orderIdFieldId = mapping['Order ID'];
        const orderNumberFieldId = mapping['Order Number'];

        const orderLineItems = records.filter(record => {
            // Try Order ID field (linked field - could be array or string)
            if (orderId && orderIdFieldId) {
                const orderIdValue = record.fields[orderIdFieldId];
                if (Array.isArray(orderIdValue)) {
                    if (orderIdValue.includes(orderId)) return true;
                } else if (orderIdValue === orderId) {
                    return true;
                }
            }
            
            // Try Order Number field (text field)
            if (orderNumber && orderNumberFieldId) {
                const orderNumValue = record.fields[orderNumberFieldId];
                if (Array.isArray(orderNumValue)) {
                    if (orderNumValue.includes(orderNumber)) return true;
                } else if (orderNumValue === orderNumber) {
                    return true;
                }
            }
            
            return false;
        });

        console.log(`✅ Found ${orderLineItems.length} line items`);

        // Flatten the records
        const flattenedItems = orderLineItems.map(record => {
            const lineItem = { id: record.id };
            Object.entries(mapping).forEach(([name, id]) => {
                if (record.fields[id] !== undefined) {
                    // Handle linked fields (arrays)
                    const value = record.fields[id];
                    if (Array.isArray(value) && value.length > 0) {
                        lineItem[name] = value[0]; // Take first value for linked fields
                    } else {
                        lineItem[name] = value;
                    }
                }
            });
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
