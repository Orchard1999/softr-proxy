// Get carriage pricing data
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Get table schema
        const schemaResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/tPYKXya9AFkEp8`,
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

        // Get all carriage records
        const carriageResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/tPYKXya9AFkEp8/records?limit=1000`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!carriageResponse.ok) {
            throw new Error('Failed to fetch carriage data');
        }

        const carriageData = await carriageResponse.json();
        const carriageRecords = carriageData.data || [];

        // Transform to friendly format indexed by box count
        const carriageMap = {};
        carriageRecords.forEach(record => {
            const boxes = record.fields[mapping['No of Boxes']];
            if (boxes !== null && boxes !== undefined) {
                carriageMap[boxes] = {
                    cost: record.fields[mapping['Cost']] || 0,
                    vat: record.fields[mapping['VAT']] || 0,
                    total: record.fields[mapping['Total Price']] || 0
                };
            }
        });

        res.status(200).json({
            success: true,
            data: carriageMap,
            count: Object.keys(carriageMap).length
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
