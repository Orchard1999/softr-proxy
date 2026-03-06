export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const response = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/3nHzao5WHtnaay/records?limit=100`,
            {
                headers: {
                    'Softr-Api-Key': process.env.SOFTR_API_KEY
                }
            }
        );

        const raw = await response.json();

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.status(200).json({
            top_level_keys: Object.keys(raw),
            records_returned: Array.isArray(raw.data) ? raw.data.length : 'not array',
            raw_without_data: Object.fromEntries(
                Object.entries(raw).filter(([key]) => key !== 'data')
            )
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
