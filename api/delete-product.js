// Delete product
export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'DELETE') {
        res.status(405).json({ success: false, error: 'Method not allowed' });
        return;
    }

    try {
        const { id } = req.query;

        if (!id) {
            res.status(400).json({ success: false, error: 'Product ID is required' });
            return;
        }

        console.log('Deleting product:', id);

        // Delete the record
        const deleteResponse = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/NRuw736MZMbayi/records/${id}`,
            {
                method: 'DELETE',
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('Delete failed:', errorText);
            throw new Error('Failed to delete product');
        }

        console.log('✅ Product deleted successfully');

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}
