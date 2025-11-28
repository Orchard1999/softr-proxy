// Update product design name
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'PUT') {
        res.status(405).json({ success: false, error: 'Method not allowed' });
        return;
    }

    try {
        const { id } = req.query;
        const { Design } = req.body;

        if (!id) {
            res.status(400).json({ success: false, error: 'Product ID is required' });
            return;
        }

        if (!Design || Design.trim() === '') {
            res.status(400).json({ success: false, error: 'Design name is required' });
            return;
        }

        console.log('Updating product:', id, 'New design:', Design);

        // Get table schema to find Design field ID
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

        const designFieldId = mapping['Design'];
        if (!designFieldId) {
            throw new Error('Design field not found in table');
        }

        // Update the record
        const updateData = {
            fields: {
                [designFieldId]: Design.trim()
            }
        };

        const updateResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/NRuw736MZMbayi/records/${id}`,
            {
                method: 'PUT',
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            }
        );

        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('Update failed:', errorText);
            throw new Error('Failed to update product');
        }

        const result = await updateResponse.json();

        console.log('✅ Product updated successfully');

        res.status(200).json({
            success: true,
            data: result.data
        });

    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
