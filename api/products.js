export default async function handler(req, res) {
    // Handle CORS OPTIONS preflight
    if (req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }

    const TABLE_ID = "NRuw736MZMbayi"; // All Customer Products

    try {
        // -----------------------------------------
        // Fetch schema (for field ID mapping)
        // -----------------------------------------
        const schemaResp = await fetch(
            `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}`,
            { headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY } }
        );

        const schemaJson = await schemaResp.json();
        const fields = schemaJson.data.fields || [];

        const mapping = {};
        fields.forEach(f => (mapping[f.name] = f.id));

        // -----------------------------------------
        // 1️⃣ GET — list products for a customer
        // -----------------------------------------
        if (req.method === "GET") {
            const { customerName } = req.query;

            if (!customerName) {
                return res.status(400).json({ error: "customerName is required" });
            }

            // Fetch all products
            const productsResp = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}/records?limit=3000`,
                { headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY } }
            );

            const productsJson = await productsResp.json();
            const raw = productsJson.data || [];

            const customerField = mapping["Customer Name"];

            // Filter and flatten
            const filtered = raw
                .filter(r => r.fields[customerField] === customerName)
                .map(record => {
                    const out = { id: record.id };
                    Object.entries(mapping).forEach(([name, id]) => {
                        if (record.fields[id] !== undefined) {
                            out[name] = record.fields[id];
                        }
                    });
                    return out;
                });

            return res.status(200).json({
                success: true,
                data: filtered,
                count: filtered.length
            });
        }

        // -----------------------------------------
        // 2️⃣ POST — add a product
        // -----------------------------------------
        if (req.method === "POST") {
            const incoming = req.body;

            const payload = {};
            Object.entries(incoming).forEach(([name, value]) => {
                const id = mapping[name];
                if (id) payload[id] = value;
            });

            const createResp = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}/records`,
                {
                    method: "POST",
                    headers: {
                        "Softr-Api-Key": process.env.SOFTR_API_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ fields: payload })
                }
            );

            const createJson = await createResp.json();

            if (!createResp.ok) {
                return res.status(500).json({ success: false, error: createJson });
            }

            return res.status(200).json({
                success: true,
                createdId: createJson.data.id
            });
        }

        // -----------------------------------------
        // 3️⃣ PUT — edit product (Design only)
        // -----------------------------------------
        if (req.method === "PUT") {
            const { id } = req.query;
            const incoming = req.body;

            if (!id) return res.status(400).json({ error: "Missing id" });

            const payload = {};
            Object.entries(incoming).forEach(([name, value]) => {
                const fid = mapping[name];
                if (fid) payload[fid] = value;
            });

            const updateResp = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}/records/${id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Softr-Api-Key": process.env.SOFTR_API_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ fields: payload })
                }
            );

            const updateJson = await updateResp.json();

            if (!updateResp.ok) {
                return res.status(500).json({ success: false, error: updateJson });
            }

            return res.status(200).json({
                success: true,
                updatedId: id
            });
        }

        // -----------------------------------------
        // 4️⃣ DELETE — remove product
        // -----------------------------------------
        if (req.method === "DELETE") {
            const { id } = req.query;

            if (!id) return res.status(400).json({ error: "Missing id" });

            const delResp = await fetch(
                `https://tables-api.softr.io/api/v1/databases/${process.env.SOFTR_DATABASE_ID}/tables/${TABLE_ID}/records/${id}`,
                {
                    method: "DELETE",
                    headers: { "Softr-Api-Key": process.env.SOFTR_API_KEY }
                }
            );

            if (!delResp.ok) {
                const text = await delResp.text();
                return res.status(500).json({ success: false, error: text });
            }

            return res.status(200).json({
                success: true,
                deletedId: id
            });
        }

        return res.status(405).json({ error: "Method not allowed" });

    } catch (err) {
        console.error("❌ Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
