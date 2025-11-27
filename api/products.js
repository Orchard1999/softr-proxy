// Get customer products
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { customerName } = req.query;
        
        if (!customerName) {
            return res.status(400).json({ error: 'customerName is required' });
        }

        // Get table schema first
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/NRuw736MZMbayi`,
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

        // Get all products
        const productsResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/NRuw736MZMbayi/records?limit=3000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!productsResponse.ok) {
            throw new Error('Failed to fetch products');
        }

        const productsData = await productsResponse.json();
        const allProducts = productsData.data || [];

        // Filter by customer name
        const customerNameFieldId = mapping['Customer Name'];
        const customerProducts = allProducts
            .filter(record => record.fields[customerNameFieldId] === customerName)
            .map(record => {
                const product = { id: record.id };
                Object.entries(mapping).forEach(([name, id]) => {
                    if (record.fields[id] !== undefined) {
                        product[name] = record.fields[id];
                    }
                });
                return product;
            });

        res.status(200).json({
            success: true,
            data: customerProducts,
            count: customerProducts.length
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
