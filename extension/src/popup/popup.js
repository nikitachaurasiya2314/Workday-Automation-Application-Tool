import * as pdfjsLib from "../../vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

const fileInput = document.getElementById("resumeFile");
const parseBtn = document.getElementById("parseBtn");
const status = document.getElementById("status");

const parsedSection = document.getElementById("parsedSection");
const parsedOutput = document.getElementById("parsedOutput");

const mappingSection = document.getElementById("mappingSection");
const scanMapBtn = document.getElementById("scanMapBtn");
const mappingOutput = document.getElementById("mappingOutput");

const autofillSection = document.getElementById("autofillSection");
const autofillBtn = document.getElementById("autofillBtn");
const autofillDetails = document.getElementById("autofillDetails");
const autofillOutput = document.getElementById("autofillOutput");

const navigationSection = document.getElementById("navigationSection");
const reviewBtn = document.getElementById("reviewBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");

const reviewPanel = document.getElementById("reviewPanel");
const filledCount = document.getElementById("filledCount");
const missingRequiredList = document.getElementById("missingRequiredList");
const submitWarning = document.getElementById("submitWarning");

const BACKEND_URL = "http://localhost:3000";

let parsedResumeData = null;

function setStatus(text, type = "") {
  status.textContent = text;
  status.className = type;
}

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_CURRENT_TAB" }, (response) => {
      resolve(response || {});
    });
  });
}

parseBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];

  if (!file) {
    setStatus("Please select a .pdf or .docx resume.", "status-error");
    return;
  }

  try {
    setStatus("Extracting resume text...", "status-warning");
    let resumeText = "";

    if (file.name.toLowerCase().endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        resumeText += content.items.map((item) => item.str).join(" ") + "\n";
      }
    } else if (file.name.toLowerCase().endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      resumeText = result.value;
    } else {
      setStatus("Unsupported file format.", "status-error");
      return;
    }

    setStatus("Analyzing resume with Gemini...", "status-warning");

    const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText, links: [], profiles: {} })
    });

    if (!response.ok) throw new Error("Backend error during parsing");

    const result = await response.json();
    parsedResumeData = result.resumeData;

    parsedOutput.textContent = JSON.stringify(parsedResumeData, null, 2);
    parsedSection.classList.remove("hidden");
    mappingSection.classList.remove("hidden");

    setStatus("Resume parsed successfully.", "status-success");
  } catch (error) {
    setStatus("Failed to parse resume: " + error.message, "status-error");
  }
});

scanMapBtn.addEventListener("click", async () => {
  if (!parsedResumeData) return;

  const tab = await getActiveTab();
  if (!tab.url || !tab.url.includes("myworkdayjobs.com")) {
    setStatus("Please navigate to a Workday job application.", "status-error");
    return;
  }

  setStatus("Scanning Workday fields...", "status-warning");

  try {
    const scanResult = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_SCAN_NOW" });
    if (!scanResult || !scanResult.success) throw new Error("Failed to scan fields.");
    
    const fields = scanResult.fields || [];
    await chrome.storage.local.set({ workdayFields: fields });

    if (!fields.length) {
      setStatus("No Workday fields detected.", "status-error");
      return;
    }

    setStatus("Mapping fields with Gemini...", "status-warning");

    const response = await fetch(`${BACKEND_URL}/api/map-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeData: parsedResumeData, fields })
    });

    if (!response.ok) throw new Error("Field mapping failed");

    const result = await response.json();
    await chrome.storage.local.set({ fieldMappings: result.mappings || [] });

    mappingOutput.textContent = JSON.stringify(result, null, 2);
    autofillSection.classList.remove("hidden");
    
    setStatus("Fields mapped successfully.", "status-success");
  } catch (error) {
    setStatus("Failed to map fields: " + error.message, "status-error");
  }
});

autofillBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab.url || !tab.url.includes("myworkdayjobs.com")) throw new Error("Not on Workday");

    let stepCount = 0;
    const MAX_STEPS = 10;

    while (stepCount < MAX_STEPS) {
      stepCount++;
      setStatus(`Step ${stepCount}: Scanning fields...`, "status-warning");

      const scanResult = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_SCAN_NOW" });
      if (!scanResult || !scanResult.success || !scanResult.fields.length) {
        setStatus(`Step ${stepCount}: No fields detected. Stopping.`, "status-error");
        break;
      }

      setStatus(`Step ${stepCount}: Mapping fields with Gemini...`, "status-warning");

      const mapResponse = await fetch(`${BACKEND_URL}/api/map-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeData: parsedResumeData, fields: scanResult.fields })
      });

      if (!mapResponse.ok) throw new Error("Field mapping failed on step " + stepCount);

      const mapResult = await mapResponse.json();
      const mappings = mapResult.mappings || [];

      await chrome.storage.local.set({ fieldMappings: mappings });
      mappingOutput.textContent = JSON.stringify(mapResult, null, 2);

      setStatus(`Step ${stepCount}: Autofilling...`, "status-warning");

      const fillResult = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_AUTOFILL", mappings });

      autofillOutput.textContent = JSON.stringify(fillResult, null, 2);
      autofillDetails.classList.remove("hidden");

      const review = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_REVIEW" });

      if (review.finalSubmissionDetected) {
        setStatus(`Step ${stepCount}: Final submit page reached. Review before submitting.`, "status-success");
        navigationSection.classList.remove("hidden");
        reviewPanel.classList.remove("hidden");
        filledCount.textContent = review.requiredCount || 0;
        missingRequiredList.innerHTML = "";
        (review.missingRequired || []).forEach(f => {
          const li = document.createElement("li");
          li.textContent = f.label || f.fieldId || "Unknown field";
          missingRequiredList.appendChild(li);
        });
        submitWarning.classList.remove("hidden");
        nextBtn.classList.add("hidden");
        submitBtn.classList.remove("hidden");
        submitBtn.disabled = (review.missingRequired || []).length > 0;
        break;
      }

      setStatus(`Step ${stepCount}: Advancing to next step...`, "status-warning");

      const nav = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_CONTINUE" });
      if (!nav.success) {
        setStatus(`Step ${stepCount}: Could not advance. ${nav.message || ""}`, "status-error");
        navigationSection.classList.remove("hidden");
        break;
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    if (stepCount >= MAX_STEPS) {
      setStatus("Reached maximum step limit. Please review manually.", "status-warning");
    }

    navigationSection.classList.remove("hidden");
  } catch (error) {
    setStatus("Autofill failed: " + error.message, "status-error");
  }
});

reviewBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab.url) throw new Error("No active tab");

    const result = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_REVIEW" });
    
    reviewPanel.classList.remove("hidden");
    filledCount.textContent = result.requiredCount || 0;
    
    missingRequiredList.innerHTML = "";
    (result.missingRequired || []).forEach(f => {
      const li = document.createElement("li");
      li.textContent = f.label || f.fieldId || "Unknown field";
      missingRequiredList.appendChild(li);
    });

    if (result.finalSubmissionDetected) {
      submitWarning.classList.remove("hidden");
      nextBtn.classList.add("hidden");
      submitBtn.classList.remove("hidden");
      
      if ((result.missingRequired || []).length === 0) {
        submitBtn.disabled = false;
      } else {
        submitBtn.disabled = true;
      }
    } else {
      submitWarning.classList.add("hidden");
      nextBtn.classList.remove("hidden");
      submitBtn.classList.add("hidden");
    }
  } catch (error) {
    setStatus("Review failed: " + error.message, "status-error");
  }
});

nextBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab.url) return;
    
    await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_CONTINUE" });
    setStatus("Continuing to next step. Please wait then click Map Fields again.", "status-success");
    reviewPanel.classList.add("hidden");
    navigationSection.classList.add("hidden");
  } catch (error) {
    setStatus("Failed to advance step: " + error.message, "status-error");
  }
});

submitBtn.addEventListener("click", async () => {
  const confirmed = confirm("Are you sure you want to submit this application? This cannot be undone.");
  if (!confirmed) return;
  
  try {
    const tab = await getActiveTab();
    if (!tab.url) return;
    
    const result = await chrome.tabs.sendMessage(tab.id, { type: "WORKDAY_CONFIRM_SUBMIT" });
    setStatus("Application Submitted successfully!", "status-success");
  } catch (error) {
    setStatus("Submit failed: " + error.message, "status-error");
  }
});