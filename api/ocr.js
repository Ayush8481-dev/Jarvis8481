export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { base64Image, language } = req.body;

        // 1. Gather all keys defined as KEY1, KEY2, ... KEY20 from Vercel Environment Variables
        const availableKeys =[];
        for (let i = 1; i <= 20; i++) {
            if (process.env[`KEY${i}`]) {
                availableKeys.push(process.env[`KEY${i}`].trim());
            }
        }

        // Fallback for initial testing if Vercel env isn't set up yet
        if (availableKeys.length === 0) {
            availableKeys.push("K85335223188957", "K84219163188957", "K85465312588957", "K82466637388957");
        }

        // 2. Shuffle keys to balance the load evenly across all parallel document pages
        const shuffledKeys = availableKeys.sort(() => 0.5 - Math.random());
        let lastError = "No keys available";

        // 3. INTELLIGENT SERVER-SIDE FAILOVER
        // It will try a key. If it hits a quota limit, it instantly moves to the next key.
        for (const apiKey of shuffledKeys) {
            try {
                const formData = new FormData();
                formData.append('base64Image', base64Image);
                formData.append('apikey', apiKey);
                formData.append('language', language);
                formData.append('isOverlayRequired', 'true');
                formData.append('OCREngine', '2');

                const response = await fetch('https://api.ocr.space/parse/image', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                // Check for OCR.space Rate Limit / Quota errors
                if (data.IsErroredOnProcessing && data.ErrorMessage) {
                    const errMsg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ').toLowerCase() : data.ErrorMessage.toLowerCase();
                    
                    // If the specific API key is exhausted or rate limited:
                    if (errMsg.includes("limit") || errMsg.includes("quota") || errMsg.includes("maximum")) {
                        console.warn(`Key exhausted. Seamlessly switching to next key...`);
                        lastError = data.ErrorMessage;
                        continue; // Skip returning and instantly loop to the NEXT key
                    }
                    
                    // If it's a real error (like a corrupted image), send it back
                    return res.status(400).json(data);
                }

                // SUCCESS! Return immediately to the frontend
                return res.status(200).json(data);

            } catch (fetchErr) {
                console.error("Network error connecting to OCR space. Trying next key...", fetchErr);
                lastError = "Network connection failed on OCR side.";
                continue; // Server-to-server connection dropped, try the next key
            }
        }

        // 4. If the loop finishes, it means ALL 20 keys are exhausted
        return res.status(429).json({ error: "ALL_KEYS_EXHAUSTED", details: lastError });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
