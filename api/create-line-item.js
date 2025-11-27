// Create order line items
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const lineItemData = req.body;

        // Get table schema
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

        // Map friendly field names to field IDs
        const mappedData = {};
        Object.entries(lineItemData).forEach(([key, value]) => {
            if (mapping[key]) {
                // Special handling for Order ID (linked field)
                if (key === 'Order ID' && typeof value === 'string') {
                    mappedData[mapping[key]] = [{ id: value, label: value }];
                } else {
                    mappedData[mapping[key]] = value;
                }
            }
        });

        // Create line item
        const createResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/VaO5LhcCxcRAkP/records`,
            {
                method: 'POST',
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields: mappedData })
            }
        );

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error('Failed to create line item: ' + errorText);
        }

        const result = await createResponse.json();

        res.status(201).json({
            success: true,
            lineItemId: result.data.id
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
