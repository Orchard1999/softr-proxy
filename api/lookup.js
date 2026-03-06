// Get lookup data (MOQ, Order Multiple, etc.)
// Add ?full=true to get all fields (for product selector)
export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    const { full } = req.query;
    const returnFullData = full === 'true';
    
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
        
        // Fetch ALL records with pagination using metadata.offset
        let allRecords = [];
        let offset = 0;
        let total = Infinity;
        let pageCount = 0;

        while (offset < total) {
            const response = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/3nHzao5WHtnaay/records?limit=100&offset=${offset}`,
                {
                    headers: {
                        'Softr-Api-Key': process.env.SOFTR_API_KEY
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch page ${pageCount + 1}`);
            }

            const data = await response.json();
            const records = data.data || [];
            allRecords = allRecords.concat(records);
            
            total = data.metadata?.total || records.length;
            offset += 100;
            pageCount++;

            if (pageCount > 20) break;
        }
        
        // Return full records if requested (for product selector)
        if (returnFullData) {
            const processedRecords = allRecords.map(record => {
                const flat = { id: record.id };
                Object.entries(mapping).forEach(([name, id]) => {
                    if (record.fields[id] !== undefined) {
                        flat[name] = record.fields[id];
                    }
                });
                return flat;
            });
            
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.status(200).json({
                success: true,
                data: processedRecords,
                count: processedRecords.length,
                pages: pageCount
            });
            return;
        }
        
        // Default: Return lookup map keyed by Product Code (for order form)
        const lookupMap = {};
        allRecords.forEach(record => {
            const code = record.fields[mapping['Product Code']];
            if (code) {
                lookupMap[code.trim()] = {
                    MOQ: record.fields[mapping['Minimum Order Quantity']] || 0,
                    OrderMultiple: record.fields[mapping['Order Multiple']] || 1,
                    PiecesPerBox: record.fields[mapping['Pieces Per Box']] || 0,
                    'Sales Code': record.fields[mapping['Sales Code']] || '',
                    JigID: record.fields[mapping['JigID']] || '',
                    BackJigID: record.fields[mapping['BackJigID']] || '',
                    PdfSectionStyle: record.fields[mapping['PdfSectionStyle']] || 'Products'
                };
            }
        });
        
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.status(200).json({
            success: true,
            data: lookupMap,
            count: Object.keys(lookupMap).length,
            totalRecords: allRecords.length,
            pages: pageCount
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
