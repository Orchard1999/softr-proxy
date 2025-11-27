// Get or create customer defaults
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

        // Get table schema
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/sjx7T4MUIQ3MHV`,
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

        // Get all customers
        const customersResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/sjx7T4MUIQ3MHV/records?limit=1000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!customersResponse.ok) {
            throw new Error('Failed to fetch customers');
        }

        const customersData = await customersResponse.json();
        const allCustomers = customersData.data || [];

        // Find customer record
        const customerNameFieldId = mapping['Customer Name'];
        const customerRecord = allCustomers.find(record => 
            record.fields[customerNameFieldId] === customerName
        );

        if (customerRecord) {
            // Return existing customer
            const customer = { id: customerRecord.id };
            Object.entries(mapping).forEach(([name, id]) => {
                if (customerRecord.fields[id] !== undefined) {
                    customer[name] = customerRecord.fields[id];
                }
            });

            res.status(200).json({
                success: true,
                data: customer,
                exists: true
            });
        } else {
            // Create new customer record
            const newCustomerData = {
                [customerNameFieldId]: customerName
            };

            const createResponse = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/sjx7T4MUIQ3MHV/records`,
                {
                    method: 'POST',
                    headers: {
                        'Softr-Api-Key': process.env.SOFTR_API_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ fields: newCustomerData })
                }
            );

            if (!createResponse.ok) {
                throw new Error('Failed to create customer record');
            }

            const newRecord = await createResponse.json();
            
            res.status(201).json({
                success: true,
                data: {
                    id: newRecord.data.id,
                    'Customer Name': customerName
                },
                exists: false,
                created: true
            });
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
