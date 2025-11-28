// Get orders by customer name
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { customerName } = req.query;

        if (!customerName) {
            res.status(400).json({ 
                success: false, 
                error: 'Customer name is required' 
            });
            return;
        }

        console.log('Fetching orders for customer:', customerName);

        // Get table schema first
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/67HNjrAhYDgbOD`,
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

        // Fetch all orders
        const ordersResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/67HNjrAhYDgbOD/records?limit=3000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!ordersResponse.ok) {
            throw new Error('Failed to fetch orders');
        }

        const ordersData = await ordersResponse.json();
        const records = ordersData.data || [];

        // Filter to customer's orders and flatten
        const customerNameFieldId = mapping['Customer Name'];
        const customerOrders = records
            .filter(record => record.fields[customerNameFieldId] === customerName)
            .map(record => {
                const order = { id: record.id };
                Object.entries(mapping).forEach(([name, id]) => {
                    if (record.fields[id] !== undefined) {
                        order[name] = record.fields[id];
                    }
                });
                return order;
            });

        console.log(`✅ Found ${customerOrders.length} orders for ${customerName}`);

        res.status(200).json({
            success: true,
            data: customerOrders,
            count: customerOrders.length
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
