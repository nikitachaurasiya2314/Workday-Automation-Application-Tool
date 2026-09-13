const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const MODEL = "gemini-3.6-flash";

async function generateJSON(prompt, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      return JSON.parse(response.text);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      console.warn(`Gemini API error (attempt ${attempt}/${maxRetries}):`, error.message);
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}

app.post("/api/parse-resume", async (req, res) => {
  try {
    const { resumeText, links = [], profiles = {} } = req.body;
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ success: false, error: "Resume text is required" });
    }
    const prompt = `
You are an expert resume parser.

Extract structured information from the resume.

IMPORTANT RULES:
- Use ONLY information present in the resume.
- Never invent missing information.
- Normalize obvious variations.
- If information is missing, use "" or [].
- Separate full name into first_name and last_name when possible.
- Keep dates exactly as supported by the resume.
- Do not create fake dates.
- Extract skills into categories.
- Extract work experience and internships separately.
- Extract education.
- Extract certifications.
- Extract professional links.
- Return ONLY valid JSON.

Expected JSON structure:

{
  "personal_information": {
    "name": "",
    "first_name": "",
    "last_name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "leetcode": "",
    "geeksforgeeks": ""
  },

  "education": [
    {
      "institution": "",
      "location": "",
      "degree": "",
      "field_of_study": "",
      "cgpa": "",
      "start_date": "",
      "end_date": ""
    }
  ],

  "experience": [
    {
      "company": "",
      "location": "",
      "position": "",
      "employment_type": "",
      "start_date": "",
      "end_date": "",
      "highlights": []
    }
  ],

  "internships": [
    {
      "company": "",
      "location": "",
      "position": "",
      "employment_type": "",
      "start_date": "",
      "end_date": "",
      "highlights": []
    }
  ],

  "skills": {
    "languages": [],
    "frontend": [],
    "backend": [],
    "databases_and_cloud": [],
    "tools_and_ai": []
  },

  "certifications": [],

  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": []
    }
  ]
}

Resume:
${resumeText}

Detected profile links:
${JSON.stringify(profiles, null, 2)}

All detected links:
${JSON.stringify(links, null, 2)}
`;
    const resumeData = await generateJSON(prompt);
    res.json({ success: true, resumeData });
  } catch (error) {
    console.error("Gemini parsing error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to parse resume" });
  }
});

app.post("/api/map-fields", async (req, res) => {
  try {
    const { resumeData, fields } = req.body;
    if (!resumeData || !fields) {
      return res.status(400).json({ success: false, error: "resumeData and fields are required" });
    }
    const prompt = `
You are an expert Workday application automation engine.

Your job is to map Workday form fields to information from the resume.

IMPORTANT RULES:

1. Match fields SEMANTICALLY using:
   - label
   - aria-label
   - placeholder
   - role
   - section
   - controlType
   - field metadata

2. NEVER use HTML IDs as semantic meaning.
   fieldId is ONLY used to identify the DOM element.

3. NEVER invent information.

4. If the resume does not support an answer, return:
   "value": null

5. Do not overwrite fields that already contain valid values.

6. Password fields:
   - value must be null
   - requiresConfirmation must be true

7. Honeypot / robot fields:
   - value must be null

8. Privacy, terms and consent checkboxes:
   - value must be null
   - requiresConfirmation must be true

9. Voluntary EEO/demographic questions:
   - Do not infer race, ethnicity, gender, disability, veteran status,
     sexual orientation or similar information.
   - value must be null unless explicitly present and user-confirmed.

10. Work authorization, sponsorship, citizenship and legal questions:
   - Do not guess.
   - value should be null unless explicitly supported.
   - requiresConfirmation should be true.

11. Yes/No questions:
   - Only answer when the resume clearly supports the answer.
   - Example:
     "Do you have experience with JavaScript?"
     can be true if JavaScript exists in the resume skills.
   - "Are you authorized to work in the US?"
     cannot be inferred from location.

12. Confidence:
   - 0.95-1.00 = extremely confident
   - 0.90-0.94 = confident
   - 0.70-0.89 = possible match, suggestion only
   - below 0.70 = do not autofill

13. Dates:
   - Only return exact dates supported by the resume.
   - Prefer YYYY-MM-DD when the exact date exists.
   - Do NOT invent a day when only month/year is available.

14. Dropdown values:
   - Return the option text/value that should be selected.

15. Radio buttons:
   - Return the expected visible option such as Yes/No.

16. Checkbox:
   - Return boolean true/false only when confidently supported and safe.

17. controlType must be one of:
   - text
   - textarea
   - dropdown
   - combobox
   - date
   - radio
   - checkbox
   - unknown

18. Return one mapping per Workday field.

19. Return ONLY valid JSON.

Resume:
${JSON.stringify(resumeData, null, 2)}

Workday fields:
${JSON.stringify(fields, null, 2)}

Return exactly:

{
  "mappings": [
    {
      "fieldId": "actual-field-id",
      "label": "actual field label",
      "value": "mapped value or null",
      "controlType": "text",
      "confidence": 0.99,
      "source": "resume",
      "requiresConfirmation": false
    }
  ]
}
`;
    const mappings = await generateJSON(prompt);

    if (Array.isArray(mappings.mappings)) {
      mappings.mappings = mappings.mappings.map((mapping) => {
        const label = String(mapping.label || "").toLowerCase();
        const fieldId = String(mapping.fieldId || "").toLowerCase();
        const sensitive =
          label.includes("password") ||
          label.includes("verify password") ||
          fieldId.includes("password") ||
          fieldId === "website" ||
          label.includes("privacy") ||
          label.includes("terms and conditions") ||
          label.includes("consent");

        if (sensitive) {
          return {
            ...mapping,
            value: null,
            requiresConfirmation: true
          };
        }
        return mapping;
      });
    }

    res.json(mappings);
  } catch (error) {
    console.error("Field mapping error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to map Workday fields" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Workday AI backend is running" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});