// pages/api/product-options.js
export default async function handler(req, res) {
    // CORS preflight
    if (req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }

    try {
        const TABLE_ID = "3nHzao5WHtnaay";

        // 1) Fetch schema
        const schemaResp = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}`,
            {
                headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY }
            }
        );

        if (!schemaResp.ok) {
            throw new Error("Failed to fetch schema");
        }

        const schemaJson = await schemaResp.json();
        const fields = schemaJson.data.fields || [];

        // Map field names → field IDs
        const mapping = {};
        fields.forEach(f => {
            mapping[f.name] = f.id;
        });

        // 2) Fetch records
        const recResp = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}/records?limit=3000`,
            {
                headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY }
            }
        );

        if (!recResp.ok) {
            throw new Error("Failed to fetch lookup records");
        }

        const recJson = await recResp.json();
        const records = recJson.data || [];

        // 3) Transform to frontend-friendly objects
        const out = records.map(record => {
            const flat = { id: record.id };

            [
                "Product Range",
                "Size",
                "Thickness",
                "Finish",
                "Backing",
                "Packaging Requirement 1",
                "Packaging Requirement 2",
                "Packaging Requirement 3",
                "Product Code"
            ].forEach(name => {
                flat[name] = record.fields[mapping[name]] || null;
            });

            return flat;
        });

        return res.status(200).json({
            success: true,
            data: out,
            count: out.length
        });

    } catch (err) {
        console.error("Error:", err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
}
