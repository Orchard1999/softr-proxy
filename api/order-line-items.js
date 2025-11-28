// Get line items for a specific order
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

        // Filter to this order's line items and flatten
        const orderIdFieldId = mapping['Order ID'];
        const orderLineItems = records
            .filter(record => {
                const orderIdValue = record.fields[orderIdFieldId];
                // Handle both string and array formats
                if (Array.isArray(orderIdValue)) {
                    return orderIdValue.includes(orderId);
                }
                return orderIdValue === orderId;
            })
            .map(record => {
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

        console.log(`✅ Found ${orderLineItems.length} line items for order ${orderId}`);

        res.status(200).json({
            success: true,
            data: orderLineItems,
            count: orderLineItems.length
        });

    } catch (error) {
        console.error('Error fetching line items:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
