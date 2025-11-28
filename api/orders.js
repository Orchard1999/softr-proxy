// Get orders by customer name - FIXED VERSION with correct field mappings
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

        // Filter to customer's orders and flatten with correct field names
        const customerNameFieldId = mapping['Customer Name'];
        const customerOrders = records
            .filter(record => record.fields[customerNameFieldId] === customerName)
            .map(record => {
                const order = { id: record.id };
                
                // Map fields with correct names for frontend
                Object.entries(mapping).forEach(([name, id]) => {
                    const value = record.fields[id];
                    
                    if (value !== undefined) {
                        // Handle Status field (extract label)
                        if (name === 'Status' && value && typeof value === 'object' && value.label) {
                            order['Order Status'] = value.label;
                        }
                        // Map Order ID to Order Number
                        else if (name === 'Order ID') {
                            order['Order Number'] = value;
                        }
                        // Map Ship Address to Delivery Address
                        else if (name === 'Ship Address') {
                            order['Delivery Address'] = value;
                        }
                        // Map Total Value to Total Cost
                        else if (name === 'Total Value') {
                            order['Total Cost'] = value;
                        }
                        // Map Carriage to Carriage Cost
                        else if (name === 'Carriage') {
                            order['Carriage Cost'] = value;
                        }
                        // Map Required Delivery Date to Order Date (or keep both)
                        else if (name === 'Order Date') {
                            order['Order Date'] = value;
                        }
                        // Keep Customer Message as is
                        else if (name === 'Customer Message') {
                            order['Customer Message'] = value;
                        }
                        // Keep other fields with original names
                        else {
                            order[name] = value;
                        }
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
