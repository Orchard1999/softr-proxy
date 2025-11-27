// Get lookup data (MOQ, Order Multiple, etc.)
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
        const lookupRecords = lookupData.data || [];

        // Transform to friendly format
        const lookupMap = {};
        lookupRecords.forEach(record => {
            const code = record.fields[mapping['Product Code']];
            if (code) {
                lookupMap[code.trim()] = {
                    MOQ: record.fields[mapping['Minimum Order Quantity']] || 0,
                    OrderMultiple: record.fields[mapping['Order Multiple']] || 1,
                    PiecesPerBox: record.fields[mapping['Pieces Per Box']] || 0
                };
            }
        });

        res.status(200).json({
            success: true,
            data: lookupMap,
            count: Object.keys(lookupMap).length
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
