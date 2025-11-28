// Get orders by customer name - FINAL FIXED VERSION
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

        // Get table schema
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

        // Filter to customer's orders
        const customerNameFieldId = mapping['Customer Name'];
        const customerOrders = records
            .filter(record => record.fields[customerNameFieldId] === customerName)
            .map(record => {
                const order = { id: record.id };
                
                // Map all fields with correct frontend names
                Object.entries(mapping).forEach(([name, id]) => {
                    const value = record.fields[id];
                    
                    if (value !== undefined) {
                        // Map database field names to frontend expected names
                        switch(name) {
                            case 'Order ID':
                                order['Order Number'] = value;
                                break;
                            case 'Status':
                                // Extract label from Status object
                                order['Order Status'] = (value && typeof value === 'object' && value.label) ? value.label : 'Pending';
                                break;
                            case 'Total Value':
                                order['Total Cost'] = value;
                                break;
                            case 'Carriage':
                                order['Carriage Cost'] = value;
                                break;
                            case 'Ship Address':
                                order['Delivery Address'] = value;
                                break;
                            case 'Order Date':
                            case 'Customer Message':
                            case 'Customer Name':
                                // Keep these as-is
                                order[name] = value;
                                break;
                            default:
                                // Keep all other fields
                                order[name] = value;
                                break;
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
