# Workday AI Autofill

A Chrome extension that reads your resume and fills out Workday job applications for you.

---

## Submission Note

**Selected Workday form:** NVIDIA — Senior Software Architect (JR2016116)
**URL:** https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Senior-Software-Architect---Deep-Learning-and-HPC-Communications_JR2016116

All development and testing was done against this form.

---

## How It Works

1. You upload your resume (PDF or DOCX)
2. The backend extracts and structures your resume data using Gemini AI
3. The extension scans the Workday form to detect all visible fields
4. Gemini maps your resume data to the right fields with a confidence score
5. Fields with confidence >= 0.90 are filled automatically
6. You review, handle any fields the AI could not answer, and confirm before submitting

---

## Project Structure

```
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── background/service-worker.js
│   │   ├── content/
│   │   │   ├── domScanner.js       — detects Workday form fields
│   │   │   └── content.js          — fills fields, handles navigation
│   │   └── popup/
│   │       ├── popup.html
│   │       └── popup.js
│   └── vendor/
│       ├── pdf.min.mjs             — PDF parsing (client-side)
│       └── mammoth.browser.min.js  — DOCX parsing (client-side)
└── server/
    ├── server.js                   — Express + Gemini API
    └── .env.example
```

---

## Setup

### Backend

```bash
cd server
npm install
```

Create a `.env` file inside the `server/` folder:

```
GEMINI_API_KEY=your_key_here
```

Get a free key at https://aistudio.google.com

```bash
node server.js
```

Confirm it is running: http://localhost:3000/api/health

### Chrome Extension

1. Go to `chrome://extensions`
2. Turn on Developer mode (top right toggle)
3. Click Load unpacked
4. Select the `extension/` folder

---

## Using the Extension

1. Open the NVIDIA job application URL above
2. Click Apply Manually and log in or create a Workday account
3. Once you reach the My Information step, open the extension popup
4. Upload your resume and click **Parse Resume**
5. Click **Map Fields** (optional; required only the first time)
6. Click **Autofill** — the extension will automatically scan, map, fill, and advance through all remaining steps until the final submit page.
7. Review any fields the extension could not fill (see limitations below).
8. When you reach the final page, click **Submit Application** and confirm the dialog.

After reloading the extension, always refresh the Workday tab before using it.

---

## What Gets Filled Automatically

| Field Type                          | Status |
|-------------------------------------|--------|
| Text fields (name, email, phone...) | Yes    |
| Workday dropdowns and comboboxes    | Yes    |
| Radio buttons                       | Yes    |
| Checkboxes                          | Yes    |
| Date fields (exact dates only)      | Yes    |
| File upload                         | No     |

---

## Known Limitations

- Visa and work authorization questions cannot be inferred from a resume — filled manually
- "How Did You Hear About Us" has no resume signal — filled manually
- EEO and demographic questions are intentionally skipped — the AI never guesses on these
- Local script name fields are not standard in resumes
- Gemini free tier allows 20 requests per day — the server retries automatically on rate limit errors
- The backend server must be running on port 3000 while using the extension

---

## Tech Stack

- Extension: Vanilla JS, Manifest V3, pdfjs, mammoth.js
- Backend: Node.js, Express
- AI: Google Gemini (gemini-3.6-flash) via @google/genai

The assignment specifies OpenAI as an example provider. Gemini was used as an equivalent alternative and satisfies the same requirements — resume parsing, structured JSON output, and semantic field mapping.

---

## Security

- The API key lives on the backend only — never in the extension
- Passwords, consent checkboxes, and honeypot fields are always skipped
- The extension does not bypass Workday login
- Submission always requires explicit user confirmation