// Get full lookup records for product selector
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Get table schema
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/3nHzao5WHtnaay`,
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

        // Get all lookup records
        const lookupResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/3nHzao5WHtnaay/records?limit=3000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!lookupResponse.ok) {
            throw new Error('Failed to fetch lookup data');
        }

        const lookupData = await lookupResponse.json();
        const records = lookupData.data || [];

        // Transform to friendly format with all fields
        const processedRecords = records.map(record => {
            const flat = { id: record.id };
            Object.entries(mapping).forEach(([name, id]) => {
                if (record.fields[id] !== undefined) {
                    flat[name] = record.fields[id];
                }
            });
            return flat;
        });

        res.status(200).json({
            success: true,
            data: processedRecords,
            count: processedRecords.length
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
