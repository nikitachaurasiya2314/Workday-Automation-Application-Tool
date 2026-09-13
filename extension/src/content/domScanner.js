function scanFields() {
  const fields = [];
  const processedFieldIds = new Set();

  // Workday custom elements
  const candidates = document.querySelectorAll(
    'input, textarea, select, ' +
    '[role="combobox"], [role="radio"], [role="checkbox"], ' +
    '[aria-haspopup="listbox"]'
  );

  candidates.forEach(element => {
    const fieldId = element.getAttribute('data-automation-id');

    // Primary strategy: query elements by [data-automation-id]
    // If element doesn't have it, try finding it on a parent wrapper
    let actualFieldId = fieldId;
    if (!actualFieldId) {
      const parentWithId = element.closest('[data-automation-id]');
      if (parentWithId && (
        parentWithId.tagName === 'DIV' ||
        parentWithId.tagName === 'FIELDSET'
      )) {
        actualFieldId = parentWithId.getAttribute('data-automation-id');
      }
    }

    if (!actualFieldId || processedFieldIds.has(actualFieldId)) return;

    const SKIP_FIELD_IDS = ['multiselectInputContainer', 'searchBox'];
    if (SKIP_FIELD_IDS.includes(actualFieldId)) return;

    const tempLabel = extractLabelScanner(element, actualFieldId);
    if (tempLabel.toLowerCase() === 'search') return;

    // Skip hidden elements (display:none, visibility:hidden, zero dimensions)
    if (!isVisibleScanner(element)) return;

    // Skip fields inside [data-automation-id="wd-popup"] (Workday modal overlays)
    if (element.closest('[data-automation-id="wd-popup"]')) return;

    processedFieldIds.add(actualFieldId);

    const label = extractLabelScanner(element, actualFieldId);
    const controlType = determineControlTypeScanner(element, actualFieldId);
    const value = extractValueScanner(element);
    const required = element.required || element.getAttribute('aria-required') === 'true';
    const section = extractSectionScanner(element);

    fields.push({
      fieldId: actualFieldId,
      label,
      controlType,
      value,
      required,
      section
    });
  });

  return fields;
}

function isVisibleScanner(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    element.getBoundingClientRect().width > 0 &&
    element.getBoundingClientRect().height > 0
  );
}

function extractLabelScanner(element, fieldId) {
  // 1. Adjacent element with data-automation-id="label"
  const wrapper = element.closest('[data-automation-id^="formField"]')
    || element.closest('div[class*="field"]')
    || element.parentElement?.parentElement;
  if (wrapper) {
    const labelEl = wrapper.querySelector('[data-automation-id="label"]');
    if (labelEl) return labelEl.innerText.trim();
  }

  // 2. Sibling/parent div containing label text
  const previousSibling = element.previousElementSibling;
  if (previousSibling && previousSibling.tagName !== 'INPUT' && previousSibling.innerText) {
    return previousSibling.innerText.trim();
  }

  const parentLabel = element.closest('label');
  if (parentLabel && parentLabel.innerText) return parentLabel.innerText.trim();

  // 3. aria-label attribute
  if (element.getAttribute('aria-label')) {
    return element.getAttribute('aria-label').trim();
  }

  // 4. aria-labelledby reference
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.innerText.trim();
  }

  // 5. placeholder attribute as last fallback
  if (element.placeholder) {
    return element.placeholder.trim();
  }

  // Fallback: look for label based on fieldId parts if it's a date
  if (fieldId.includes('date') || fieldId.includes('Month') || fieldId.includes('Year')) {
    const fieldset = element.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) return legend.innerText.trim();
    }
  }

  return "";
}

function determineControlTypeScanner(element, fieldId) {
  // 1. role attribute
  const role = element.getAttribute('role');
  if (role) {
    if (role === 'combobox') return 'combobox';
    if (role === 'radio') return 'radio';
    if (role === 'checkbox') return 'checkbox';
  }

  // 2. input type attribute
  const type = (element.getAttribute('type') || '').toLowerCase();
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date') return 'date';

  // Handle Workday date fields which use three separate inputs grouped under one automation-id
  if (fieldId.toLowerCase().includes('date') && (fieldId.includes('Month') || fieldId.includes('Day') || fieldId.includes('Year'))) {
    return 'date';
  }

  // 3. tagName
  const tagName = element.tagName.toUpperCase();
  if (tagName === 'SELECT') return 'dropdown';
  if (tagName === 'TEXTAREA') return 'textarea';

  // 4. aria-haspopup="listbox" for Workday dropdowns
  if (element.getAttribute('aria-haspopup') === 'listbox') return 'dropdown';

  return 'text';
}

function extractValueScanner(element) {
  if (element.type === 'checkbox' || element.type === 'radio') {
    return element.checked ? "true" : "false";
  }
  return element.value || element.getAttribute('aria-valuetext') || "";
}

function extractSectionScanner(element) {
  let parent = element.parentElement;
  while (parent) {
    const heading = parent.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    if (heading && heading.innerText) {
      return heading.innerText.trim();
    }
    parent = parent.parentElement;
  }
  return "";
}

// Export scanFields() as a global function since content.js calls it directly
window.scanFields = scanFields;