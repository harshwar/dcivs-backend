const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Helper to convert multer file to Gemini format
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

async function analyzeCertificate(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No certificate image provided.' });
        }

        // Extremely specific prompt for strict JSON output
        const prompt = "Analyze this educational certificate. Return a pure JSON object (without any markdown formatting like ```json) containing exactly these three string fields: 'title' (the name of the degree or achievement), 'department' (the faculty, school, or department), and 'description' (a short, one-sentence summary of the achievement). If a field cannot be determined, use an empty string.";

        const imagePart = fileToGenerativePart(req.file.path, req.file.mimetype);

        // Call Gemini
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        let text = response.text();
        
        // Cleanup response in case Gemini includes markdown blocks despite instructions
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        const jsonResponse = JSON.parse(text);

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.json(jsonResponse);

    } catch (error) {
        console.error("AI Analysis Error:", error);
        
        // Cleanup temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ error: "Failed to analyze certificate with AI" });
    }
}

/**
 * Mathematically scrubs sensitive PII from OCR text before it is sent to any external AI.
 */
function redactPII(text, studentName, studentRoll) {
    if (!text) return '';
    let redactedText = text;

    // 1. Scrub Name
    if (studentName) {
        // Scrub exact full name matches
        const nameRegex = new RegExp(studentName, 'gi');
        redactedText = redactedText.replace(nameRegex, '[REDACTED_NAME]');
        
        // Scrub distinct parts of the name (e.g., first, middle, last)
        const parts = studentName.split(' ').filter(p => p.length > 2);
        for (const part of parts) {
            const partRegex = new RegExp(`\\b${part}\\b`, 'gi');
            redactedText = redactedText.replace(partRegex, '[REDACTED_NAME]');
        }
    }

    // 2. Scrub Roll Number
    if (studentRoll) {
        const rollRegex = new RegExp(studentRoll, 'gi');
        redactedText = redactedText.replace(rollRegex, '[REDACTED_ROLL]');
    }

    // 3. Scrub PRN / ABC Numbers (Any contiguous numbers 10 digits or longer)
    const longNumRegex = /\b\d{10,}\b/g;
    redactedText = redactedText.replace(longNumRegex, '[REDACTED_ID]');

    return redactedText;
}

async function verifyDocument(req, res) {
    try {
        console.log(`[OCR Verification] Started verification request for student: ${req.body.studentName || 'Not Provided'}`);
        if (!req.file) {
            console.warn('[OCR Verification] No document image provided.');
            return res.status(400).json({ error: 'No document image provided.' });
        }

        const studentName = (req.body.studentName || '').toLowerCase();
        const studentRoll = (req.body.studentRoll || '').toLowerCase();

        if (!studentName && !studentRoll) {
             console.warn('[OCR Verification] Missing student name/roll number.');
             return res.status(400).json({ error: 'Student name or roll number is required for verification.' });
        }

        // 1. Preprocess the image with OpenCV to REMOVE TABLE LINES
        console.log(`[OCR Verification] 1/3: Preprocessing image (${req.file.originalname}) with OpenCV...`);
        
        // OpenCV WebAssembly takes time to initialize in Node.js
        const cv = require('@techstark/opencv-js');
        await new Promise(resolve => {
             if (cv.getBuildInformation) resolve();
             else cv.onRuntimeInitialized = resolve;
        });
        
        // We use canvas to load the image buffer for OpenCV.js
        const { createCanvas, loadImage } = require('canvas');
        const img = await loadImage(req.file.path);
        
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // Load into OpenCV Mat from ImageData (Node.js compatible)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let src = cv.matFromImageData(imgData);
        
        // Convert to grayscale
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        const thresh = new cv.Mat();
        // Adaptive mean thresholding on inverted grayscale to make lines white, background black
        cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, -2);
        
        // Define kernels for morphological operations to find horizontal and vertical lines
        const horizontalSize = Math.max(10, Math.floor(src.cols / 30));
        const verticalSize = Math.max(10, Math.floor(src.rows / 30));

        const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(horizontalSize, 1));
        const verticalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, verticalSize));

        // Finding horizontal lines
        const horizontalMask = new cv.Mat();
        cv.morphologyEx(thresh, horizontalMask, cv.MORPH_OPEN, horizontalKernel);
        
        // Finding vertical lines
        const verticalMask = new cv.Mat();
        cv.morphologyEx(thresh, verticalMask, cv.MORPH_OPEN, verticalKernel);

        // Combine lines into one mask
        const linesMask = new cv.Mat();
        cv.add(horizontalMask, verticalMask, linesMask);

        // Optional: dilate the lines mask slightly so we cover all edge pixels of the thick lines
        const dilateKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        const dilatedLinesMask = new cv.Mat();
        cv.dilate(linesMask, dilatedLinesMask, dilateKernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

        // Result will be based on the original grayscale image
        const result = gray.clone();

        // Now, we iterate and wherever dilatedLinesMask is white (255), we paint result white (255)
        // This essentially erases the lines from the grayscale image (replacing them with white background)
        for (let i = 0; i < result.rows; i++) {
            for (let j = 0; j < result.cols; j++) {
                if (dilatedLinesMask.ucharPtr(i, j)[0] > 128) {
                    // Set the pixel to white (in grayscale, 255 is white)
                    result.ucharPtr(i, j)[0] = 255;
                }
            }
        }

        // Save the intermediate image using canvas
        const rgbaResult = new cv.Mat();
        cv.cvtColor(result, rgbaResult, cv.COLOR_GRAY2RGBA, 0);

        const outCanvas = createCanvas(result.cols, result.rows);
        const outCtx = outCanvas.getContext('2d');
        const outImgData = outCtx.createImageData(result.cols, result.rows);
        
        // Copy the pixel array directly
        outImgData.data.set(rgbaResult.data);
        outCtx.putImageData(outImgData, 0, 0);

        const processedImagePath = req.file.path + '-processed.png';
        const buffer = outCanvas.toBuffer('image/png');
        const fs = require('fs');
        fs.writeFileSync(processedImagePath, buffer);

        // Clean up all cv.Mats
        src.delete();
        gray.delete();
        thresh.delete();
        horizontalKernel.delete();
        verticalKernel.delete();
        horizontalMask.delete();
        verticalMask.delete();
        linesMask.delete();
        dilateKernel.delete();
        dilatedLinesMask.delete();
        result.delete();
        rgbaResult.delete();
        
        console.log(`[OCR Verification] 1/3: OpenCV gridline removal complete => saved to temporary buffer.`);

        // 2. Run Local OCR with Tesseract
        console.log(`[OCR Verification] 2/3: Initializing Tesseract Local Engine...`);
        const Tesseract = require('tesseract.js');
        
        const worker = await Tesseract.createWorker('eng', 1);
        
        await worker.setParameters({
            tessedit_pageseg_mode: '11', // Sparse text. Find as much text as possible in no particular order.
        });
        
        const { data: { text } } = await worker.recognize(processedImagePath);
        await worker.terminate();
        
        console.log(`[OCR Verification] 2/3: Tesseract engine finished extracting text.`);

        const normalizedText = text.toLowerCase();
        
        // 3. Fuzzy Matching Logic
        console.log(`[OCR Verification] 3/3: Running string-similarity fuzzy matching algorithm...`);
        const stringSimilarity = require('string-similarity');
        
        let isMatch = false;
        let matchedName = '';
        
        // Check exact roll number if provided
        if (studentRoll && normalizedText.includes(studentRoll)) {
            isMatch = true;
            matchedName = studentRoll;
            console.log(`[OCR Verification] -> Match Found! Exact roll number '${studentRoll}' detected.`);
        } 
        
        // Check Name with split and fuzzy
        if (!isMatch && studentName) {
            // Split name into distinct words (e.g. "Harshwardhan", "Mukesh", "Chauhan")
            const originalParts = studentName.split(' ').filter(p => p.length > 2);
            
            // Extract all alphabetical words from the OCR text
            const ocrWords = normalizedText.replace(/[^a-z]+/g, ' ').split(' ').filter(w => w.length > 2);
            
            if (ocrWords.length > 0) {
                // Check if any major part of the name is found in the OCR words using fuzzy matching
                for (const part of originalParts) {
                    const matches = stringSimilarity.findBestMatch(part, ocrWords);
                    
                    // If a word in the OCR text has a high similarity score (>= 0.8) to a part of the student's name
                    if (matches.bestMatch.rating >= 0.8) {
                        isMatch = true;
                        matchedName = studentName;
                        console.log(`[OCR Verification] -> Match Found! Fuzzy match for name part '${part}' detected (Confidence score: ${(matches.bestMatch.rating * 100).toFixed(1)}%).`);
                        break;
                    }
                }
            }
        }
        
        if (!isMatch) {
            console.log(`[OCR Verification] -> No match found. The string similarity was too low or the name wasn't present.`);
        }

        // Cleanup temp files
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (fs.existsSync(processedImagePath)) fs.unlinkSync(processedImagePath);
        console.log(`[OCR Verification] Request completed successfully.`);

        // --- PII REDACTION PROTOYPE ---
        const redactedText = redactPII(text, studentName, studentRoll);

        // --- GEMINI SUMMARIZATION (100% PRIVATE) ---
        console.log(`[OCR Verification] Generating certificate metadata...`);
        const prompt = `Analyze this anonymized OCR text of a certificate or marksheet. Return a pure JSON object (without any markdown formatting like \`\`\`json) containing exactly these three string fields: 'title' (the name of the degree or achievement, e.g., 'B.Sc. Information Technology'), 'department' (the faculty, school, or department. If not explicitly stated, infer it from the programme name, e.g., 'Information Technology' for 'B.SC. (INFORMATION TECHNOLOGY)'), and 'description' (a short, one-sentence summary of the achievement, including CGPA or grades if present, following this strict grammar format: 'The student successfully completed [Title] achieving a SGPA/CGPA of [Grade]'.). IMPORTANT: ensure the title and department are properly Title Cased (e.g., 'Information Technology', not 'INFORMATION TECHNOLOGY'). If a field cannot be determined, use an empty string.\n\nText:\n${redactedText}`;
        
        const aiResult = await model.generateContent(prompt);
        const response = await aiResult.response;
        let aiText = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        let jsonResponse = { title: '', department: '', description: '' };
        try {
            jsonResponse = JSON.parse(aiText);
        } catch (e) {
            console.warn("[OCR Verification] Failed to parse Gemini JSON:", aiText);
        }

        // Return result
        res.json({
            match: isMatch,
            extracted_text: `Anonymized OCR Text (Ready for Gemini):\n\n${redactedText}`,
            title: jsonResponse.title,
            department: jsonResponse.department,
            description: jsonResponse.description
        });

    } catch (error) {
        console.error("[OCR Verification] CRITICAL ERROR during processing:", error);
        
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const processedImagePath = req.file?.path + '-processed.png';
        if (fs.existsSync(processedImagePath)) fs.unlinkSync(processedImagePath);

        res.status(500).json({ error: "Failed to verify document locally" });
    }
}

module.exports = { analyzeCertificate, verifyDocument };
