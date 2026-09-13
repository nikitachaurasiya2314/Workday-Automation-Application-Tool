/*
|--------------------------------------------------------------------------
| Workday AI Autofill - Content Script
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Utilities
|--------------------------------------------------------------------------
*/

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    element.getBoundingClientRect().width > 0 &&
    element.getBoundingClientRect().height > 0
  );
}

function cssEscape(value) {
  return CSS.escape(String(value));
}

/*
|--------------------------------------------------------------------------
| Element Lookup
|--------------------------------------------------------------------------
*/

function findElement(fieldId) {
  if (!fieldId) return null;

  const escaped = cssEscape(fieldId);

  return (
    document.querySelector(
      `[data-automation-id="${escaped}"]`
    ) ||
    document.getElementById(fieldId) ||
    document.querySelector(
      `[name="${escaped}"]`
    ) ||
    document.querySelector(
      `[data-wd-ai-field-id="${escaped}"]`
    )
  );
}

/*
|--------------------------------------------------------------------------
| Existing Value Detection
|--------------------------------------------------------------------------
*/

function hasExistingValue(element) {
  if (!element) return false;

  const type = (
    element.type || ""
  ).toLowerCase();

  if (
    type === "checkbox" ||
    type === "radio"
  ) {
    return element.checked;
  }

  if (element.tagName === "SELECT") {
    return Boolean(
      element.value &&
      element.value.trim()
    );
  }

  if (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA"
  ) {
    return Boolean(
      element.value &&
      element.value.trim()
    );
  }

  const ariaValue = element.getAttribute(
    "aria-valuetext"
  );

  if (ariaValue?.trim()) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Native Input Setter
|--------------------------------------------------------------------------
*/

function setInputValue(
  element,
  value
) {
  const stringValue = String(value);

  const prototype =
    Object.getPrototypeOf(element);

  const setter =
    Object.getOwnPropertyDescriptor(
      prototype,
      "value"
    )?.set;

  if (setter) {
    setter.call(
      element,
      stringValue
    );
  } else {
    element.value = stringValue;
  }

  element.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  element.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );

  element.dispatchEvent(
    new Event("blur", {
      bubbles: true
    })
  );
}

/*
|--------------------------------------------------------------------------
| Native Dropdown
|--------------------------------------------------------------------------
*/

function fillSelect(
  element,
  value
) {
  const target = normalize(value);

  const option = [
    ...element.options
  ].find((option) => {
    return (
      normalize(option.text) === target ||
      normalize(option.value) === target
    );
  });

  if (!option) {
    return false;
  }

  element.value =
    option.value;

  element.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );

  element.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );

  return (
    element.value ===
    option.value
  );
}

/*
|--------------------------------------------------------------------------
| Find Workday Dropdown Option
|--------------------------------------------------------------------------
*/

function findVisibleOption(value) {
  const target = normalize(value);
  const firstWord = target.split(' ')[0];

  const options = [
    ...document.querySelectorAll('[role="option"]')
  ].filter(isVisible);

  return (
    options.find(o => normalize(o.innerText) === target) ||
    options.find(o => normalize(o.getAttribute('aria-label')) === target) ||
    options.find(o => normalize(o.innerText).includes(target)) ||
    options.find(o => normalize(o.innerText).includes(firstWord)) ||
    options[0] || null
  );
}
/*
|--------------------------------------------------------------------------
| Workday Combobox
|--------------------------------------------------------------------------
*/

async function fillCombobox(
  element,
  value
) {
  if (hasExistingValue(element)) {
    return false;
  }

  /*
   * First open the Workday combobox.
   */

  element.click();

  await sleep(300);

  let option =
    findVisibleOption(value);

  if (option) {
    option.click();

    await sleep(150);

    return true;
  }

  /*
   * If the control is an actual input,
   * type the value and select the option.
   */

  if (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA"
  ) {
    setInputValue(element, value);
    await sleep(800);
    option = findVisibleOption(value);

    if (!option) {
      setInputValue(element, value.split(' ')[0]);
      await sleep(500);
      option = findVisibleOption(value);
    }

    if (option) {
      option.click();

      await sleep(150);

      return true;
    }

    /*
     * Keyboard fallback.
     */

    element.focus();

    element.dispatchEvent(
      new KeyboardEvent(
        "keydown",
        {
          key: "ArrowDown",
          bubbles: true
        }
      )
    );

    await sleep(100);

    element.dispatchEvent(
      new KeyboardEvent(
        "keydown",
        {
          key: "Enter",
          bubbles: true
        }
      )
    );

    await sleep(200);

    return (
      normalize(element.value) ===
      normalize(value)
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Date Handling
|--------------------------------------------------------------------------
*/

function formatDateForInput(
  value,
  element
) {
  const stringValue =
    String(value || "").trim();

  /*
   * Only safely automate exact dates.
   *
   * Supported:
   * YYYY-MM-DD
   * MM/DD/YYYY
   */

  let match =
    stringValue.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (match) {
    const [
      ,
      year,
      month,
      day
    ] = match;

    if (
      element.type === "date"
    ) {
      return `${year}-${month}-${day}`;
    }

    return `${month}/${day}/${year}`;
  }

  match =
    stringValue.match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

  if (match) {
    if (
      element.type === "date"
    ) {
      return `${match[3]}-${match[1]}-${match[2]}`;
    }

    return stringValue;
  }

  return null;
}

function fillDate(
  element,
  value
) {
  const formatted =
    formatDateForInput(
      value,
      element
    );

  if (!formatted) {
    return false;
  }

  setInputValue(
    element,
    formatted
  );

  return (
    normalize(element.value) ===
    normalize(formatted)
  );
}

/*
|--------------------------------------------------------------------------
| Radio Button
|--------------------------------------------------------------------------
*/

function getRadioLabel(
  radio
) {
  const id = radio.id;

  if (id) {
    const label =
      document.querySelector(
        `label[for="${cssEscape(id)}"]`
      );

    if (label) {
      return label.innerText.trim();
    }
  }

  const parent =
    radio.closest("label");

  if (parent) {
    return parent.innerText.trim();
  }

  return (
    radio.getAttribute(
      "aria-label"
    ) || ""
  );
}

async function fillRadio(element, value) {
  const target = normalize(value);

  // Strategy 1: native input[type="radio"] by name
  if (element.name) {
    const radios = [
      ...document.querySelectorAll(
        `input[type="radio"][name="${cssEscape(element.name)}"]`
      )
    ];
    const match = radios.find(r => {
      const label = document.querySelector(`label[for="${cssEscape(r.id)}"]`);
      const text = normalize(label?.innerText || r.value || "");
      return text === target || text.includes(target);
    });
    if (match) {
      match.click();
      await sleep(150);
      return true;
    }
  }

  // Strategy 2: Workday role="radiogroup" container
  const container =
    element.closest('[role="radiogroup"]') ||
    element.closest('fieldset') ||
    element.closest('[data-automation-id^="formField"]');

  if (container) {
    const options = [
      ...container.querySelectorAll('[role="radio"], input[type="radio"]')
    ].filter(isVisible);

    const match = options.find(opt => {
      const text = normalize(
        opt.innerText ||
        opt.getAttribute('aria-label') ||
        opt.value || ""
      );
      if (target === 'true' || target === 'yes')
        return text === 'yes' || text.includes('yes');
      if (target === 'false' || target === 'no')
        return text === 'no' || text.includes('no');
      return text === target || text.includes(target);
    });

    if (match) {
      match.click();
      await sleep(200);
      return true;
    }
  }

  // Strategy 3: scan all visible role="radio" on page
  const allRadios = [
    ...document.querySelectorAll('[role="radio"]')
  ].filter(isVisible);

  const match = allRadios.find(r => {
    const text = normalize(
      r.innerText || r.getAttribute('aria-label') || ""
    );
    if (target === 'true' || target === 'yes')
      return text === 'yes' || text.includes('yes');
    if (target === 'false' || target === 'no')
      return text === 'no' || text.includes('no');
    return text === target || text.includes(target);
  });

  if (match) {
    match.click();
    await sleep(200);
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Checkbox
|--------------------------------------------------------------------------
*/

function parseBoolean(
  value
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  const normalized =
    normalize(value);

  if (
    [
      "yes",
      "true",
      "1",
      "checked",
      "on"
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "no",
      "false",
      "0",
      "unchecked",
      "off"
    ].includes(normalized)
  ) {
    return false;
  }

  return null;
}

function fillCheckbox(
  element,
  value
) {
  const target =
    parseBoolean(value);

  if (target === null) {
    return false;
  }

  if (
    element.checked !== target
  ) {
    element.click();
  }

  return (
    element.checked === target
  );
}

/*
|--------------------------------------------------------------------------
| Sensitive / Unsafe Fields
|--------------------------------------------------------------------------
*/

function isSensitiveField(
  mapping,
  element
) {
  const label =
    normalize(
      mapping.label
    );

  const name =
    normalize(
      element.name
    );

  const type =
    normalize(
      element.type
    );

  /*
   * Never touch passwords.
   */

  if (
    type === "password" ||
    name.includes("password") ||
    label.includes("password")
  ) {
    return true;
  }

  /*
   * Workday honeypot.
   */

  if (
    name === "website" ||
    label.includes("robots only") ||
    label.includes("robot")
  ) {
    return true;
  }

  /*
   * Legal/consent fields require
   * explicit user action.
   */

  if (
    label.includes("privacy") ||
    label.includes("terms") ||
    label.includes("consent") ||
    label.includes("agree to")
  ) {
    return true;
  }

  /*
   * AI can mark a mapping as requiring
   * confirmation.
   */

  if (
    mapping.requiresConfirmation === true
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Autofill One Mapping
|--------------------------------------------------------------------------
*/

async function fillMapping(
  mapping
) {
  const result = {
    fieldId:
      mapping.fieldId,
    label:
      mapping.label || "",
    status: "",
    reason: ""
  };

  /*
   * Low-confidence mappings become
   * suggestions instead of autofill.
   */

  if (
    Number(mapping.confidence || 0) <
    0.90
  ) {
    result.status = "suggested";
    result.reason =
      "Confidence below 0.90";

    return result;
  }

  if (
    mapping.value === null ||
    mapping.value === undefined ||
    String(mapping.value).trim() === ""
  ) {
    result.status = "skipped";
    result.reason =
      "No confident value available";

    return result;
  }

  const element =
    findElement(
      mapping.fieldId
    );

  if (!element) {
    result.status = "failed";
    result.reason =
      "Element not found";

    return result;
  }

  if (
    element.disabled ||
    element.readOnly
  ) {
    result.status = "skipped";
    result.reason =
      "Field is disabled or readonly";

    return result;
  }

  /*
   * Never overwrite valid data.
   */

  if (
    mapping.controlType !==
    "checkbox" &&
    mapping.controlType !==
    "radio" &&
    hasExistingValue(element)
  ) {
    result.status = "skipped";
    result.reason =
      "Existing value preserved";

    return result;
  }

  /*
   * Sensitive fields.
   */

  if (
    isSensitiveField(
      mapping,
      element
    )
  ) {
    result.status = "skipped";
    result.reason =
      "Requires explicit user action";

    return result;
  }

  try {
    const controlType =
      mapping.controlType ||
      "text";

    /*
     * Text / textarea
     */

    if (
      controlType === "text" ||
      controlType === "textarea"
    ) {
      setInputValue(
        element,
        String(mapping.value)
      );

      if (
        normalize(
          element.value
        ) ===
        normalize(
          mapping.value
        )
      ) {
        result.status = "filled";
        return result;
      }

      result.status = "failed";
      result.reason =
        "Value verification failed";

      return result;
    }

    /*
     * Native dropdown
     */

    if (
      element.tagName ===
      "SELECT"
    ) {
      const success =
        fillSelect(
          element,
          mapping.value
        );

      result.status =
        success
          ? "filled"
          : "failed";

      result.reason =
        success
          ? ""
          : "Matching option not found";

      return result;
    }

    /*
     * Combobox
     */

    if (
      controlType ===
      "dropdown" ||
      controlType ===
      "combobox" ||
      element.getAttribute(
        "role"
      ) === "combobox" ||
      element.getAttribute(
        "aria-haspopup"
      ) === "listbox"
    ) {
      const success =
        await fillCombobox(
          element,
          mapping.value
        );

      result.status =
        success
          ? "filled"
          : "failed";

      result.reason =
        success
          ? ""
          : "Combobox option not found";

      return result;
    }

    /*
     * Date
     */

    if (
      controlType === "date"
    ) {
      const success =
        fillDate(
          element,
          mapping.value
        );

      result.status =
        success
          ? "filled"
          : "suggested";

      result.reason =
        success
          ? ""
          : "Exact date not supported";

      return result;
    }

    /*
     * Radio
     */

    if (
      controlType === "radio" ||
      element.type === "radio"
    ) {
      const success =
        await fillRadio(
          element,
          mapping.value
        );

      result.status =
        success
          ? "filled"
          : "failed";

      result.reason =
        success
          ? ""
          : "Matching radio option not found";

      return result;
    }

    /*
     * Checkbox
     */

    if (
      controlType ===
      "checkbox"
    ) {
      const success =
        fillCheckbox(
          element,
          mapping.value
        );

      result.status =
        success
          ? "filled"
          : "failed";

      result.reason =
        success
          ? ""
          : "Invalid checkbox value";

      return result;
    }

    result.status = "suggested";
    result.reason =
      "Unsupported control type";

    return result;

  } catch (error) {
    result.status = "failed";
    result.reason =
      error.message;

    return result;
  }
}

/*
|--------------------------------------------------------------------------
| Autofill All Mappings
|--------------------------------------------------------------------------
*/

async function autofillMappings(
  mappings
) {
  const result = {
    filled: [],
    suggested: [],
    skipped: [],
    failed: []
  };

  for (
    const mapping of mappings
  ) {
    const item =
      await fillMapping(
        mapping
      );

    if (
      item.status ===
      "filled"
    ) {
      result.filled.push(item);
    } else if (
      item.status ===
      "suggested"
    ) {
      result.suggested.push(item);
    } else if (
      item.status ===
      "skipped"
    ) {
      result.skipped.push(item);
    } else {
      result.failed.push(item);
    }
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| Required Field Review
|--------------------------------------------------------------------------
*/

function getCurrentFieldValue(
  field
) {
  const element =
    findElement(
      field.fieldId
    );

  if (!element) {
    return "";
  }

  const type =
    normalize(
      element.type
    );

  if (
    type === "checkbox" ||
    type === "radio"
  ) {
    return element.checked
      ? "checked"
      : "";
  }

  return (
    element.value ||
    element.getAttribute(
      "aria-valuetext"
    ) ||
    ""
  );
}

function reviewCurrentPage() {
  const fields =
    scanFields();

  const requiredFields =
    fields.filter(
      (field) =>
        field.required
    );

  const missingRequired =
    requiredFields.filter(
      (field) =>
        !getCurrentFieldValue(
          field
        )
    );

  const questionFields =
    fields.filter(
      (field) => {
        const label =
          normalize(
            field.label
          );

        return (
          field.controlType ===
          "radio" ||
          field.controlType ===
          "checkbox" ||
          label.includes("?")
        );
      }
    );

  const submitButtons =
    findButtons(
      /submit|apply|finish/i
    );

  return {
    requiredCount:
      requiredFields.length,

    missingRequired:
      missingRequired.map(
        (field) => ({
          fieldId:
            field.fieldId,
          label:
            field.label
        })
      ),

    questionCount:
      questionFields.length,

    finalSubmissionDetected:
      submitButtons.length >
      0,

    message:
      submitButtons.length
        ? "Final submission detected. Explicit confirmation required."
        : missingRequired.length
          ? "Some required fields are still missing."
          : "Current step looks ready."
  };
}

/*
|--------------------------------------------------------------------------
| Navigation
|--------------------------------------------------------------------------
*/

function getButtonText(
  button
) {
  return normalize(
    button.innerText ||
    button.getAttribute(
      "aria-label"
    ) ||
    button.value ||
    ""
  );
}

function findButtons(
  pattern
) {
  return [
    ...document.querySelectorAll(
      "button, input[type='button'], input[type='submit']"
    )
  ].filter(
    (button) =>
      isVisible(button) &&
      !button.disabled &&
      pattern.test(
        getButtonText(button)
      )
  );
}

function continueToNextStep() {
  /*
   * Never automatically click final submission.
   */

  const finalButtons =
    findButtons(
      /submit|apply|finish/i
    );

  if (finalButtons.length) {
    return {
      success: false,
      confirmationRequired: true,
      message:
        "Final submission detected. Use explicit Submit confirmation."
    };
  }

  const nextButtons =
    findButtons(
      /^(next|continue|save and continue|save & continue|review)$/
    );

  if (!nextButtons.length) {
    return {
      success: false,
      message:
        "Next/Continue button not found."
    };
  }

  const button =
    nextButtons[0];

  button.click();

  return {
    success: true,
    clicked:
      getButtonText(button)
  };
}

/*
|--------------------------------------------------------------------------
| Explicit Final Submission
|--------------------------------------------------------------------------
*/

function confirmAndSubmit() {
  const buttons =
    findButtons(
      /submit|apply|finish/i
    );

  if (!buttons.length) {
    return {
      success: false,
      message:
        "Submit button not found."
    };
  }

  /*
   * This function is called only after
   * the user explicitly clicks the
   * Submit button in the extension.
   */

  buttons[0].click();

  return {
    success: true,
    message:
      "Submission button clicked after explicit user confirmation."
  };
}

/*
|--------------------------------------------------------------------------
| Message Handling
|--------------------------------------------------------------------------
*/

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (
      message.type ===
      "WORKDAY_SCAN_NOW"
    ) {
      try {
        const fields =
          scanFields();

        sendResponse({
          success: true,
          fields
        });
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error.message
        });
      }

      return true;
    }

    if (
      message.type ===
      "WORKDAY_AUTOFILL"
    ) {
      (async () => {
        try {
          const result =
            await autofillMappings(
              message.mappings || []
            );

          sendResponse({
            success: true,
            ...result
          });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error.message
          });
        }
      })();

      return true;
    }

    if (
      message.type ===
      "WORKDAY_REVIEW"
    ) {
      try {
        sendResponse({
          success: true,
          ...reviewCurrentPage()
        });
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error.message
        });
      }

      return true;
    }

    if (
      message.type ===
      "WORKDAY_CONTINUE"
    ) {
      try {
        sendResponse(
          continueToNextStep()
        );
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error.message
        });
      }

      return true;
    }

    if (
      message.type ===
      "WORKDAY_CONFIRM_SUBMIT"
    ) {
      try {
        sendResponse(
          confirmAndSubmit()
        );
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error.message
        });
      }

      return true;
    }
  }
);

/*
|--------------------------------------------------------------------------
| Initial Scanner
|--------------------------------------------------------------------------
*/

function sendScanResult() {
  try {
    const fields =
      scanFields();

    chrome.runtime.sendMessage({
      type:
        "WORKDAY_FIELDS_SCANNED",
      fields
    });

    console.log(
      "Workday fields:",
      fields
    );

  } catch (error) {
    console.log(
      "Extension context invalidated. Reload the Workday page."
    );

    if (observer) {
      observer.disconnect();
    }
  }
}

/*
|--------------------------------------------------------------------------
| MutationObserver
|--------------------------------------------------------------------------
*/

let scanTimer = null;

const observer =
  new MutationObserver(() => {
    clearTimeout(scanTimer);

    scanTimer = setTimeout(
      sendScanResult,
      300
    );
  });

if (document.body) {
  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
}

sendScanResult();