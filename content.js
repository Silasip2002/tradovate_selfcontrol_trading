console.log("Tradovate Daily Trade Limiter: Content script loaded (v1.4 - Auto-close Feature).");

// --- Configuration Keys ---
const STORAGE_KEY_COUNT = 'tradovateClickCount';
const STORAGE_KEY_DATE = 'tradovateClickDate';
const STORAGE_KEY_MAX_CLICKS = 'tradovateMaxClicksConfig';
// Time Restriction Keys
const STORAGE_KEY_TIME_ENABLED = 'tradovateTimeEnabled';
const STORAGE_KEY_START_TIME = 'tradovateStartTime';
const STORAGE_KEY_END_TIME = 'tradovateEndTime';
const STORAGE_KEY_ALLOWED_DAYS = 'tradovateAllowedDays';
// Auto-close Feature Key
const STORAGE_KEY_AUTO_CLOSE_ENABLED = 'tradovateAutoCloseEnabled';

// --- Defaults (used if storage is empty) ---
const DEFAULT_MAX_CLICKS = 2;
const DEFAULT_TIME_ENABLED = false;
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '16:00';
const DEFAULT_ALLOWED_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri
const DEFAULT_AUTO_CLOSE_ENABLED = false;

// Buttons identified by structure/text
const BUTTON_SELECTORS = [
    '.info-column[style*="width: auto"] .btn', // Original Buy/Sell Mkt/Bid/Ask
    '.btn-group.btn-group-vertical > .btn'     // Vertical Buy/Sell Stop/Limit
];

// --- Helper Functions ---

function getTodayDateString() { /* ... (no changes needed) ... */
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Converts HH:MM time string to minutes since midnight
function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
}

// Checks if the current time is within the allowed trading window
function isWithinTradingHours(settings) {
    const timeEnabled = settings[STORAGE_KEY_TIME_ENABLED] ?? DEFAULT_TIME_ENABLED;

    // If feature is disabled, always allow
    if (!timeEnabled) {
        return true;
    }

    const startTimeStr = settings[STORAGE_KEY_START_TIME] ?? DEFAULT_START_TIME;
    const endTimeStr = settings[STORAGE_KEY_END_TIME] ?? DEFAULT_END_TIME;
    const allowedDays = settings[STORAGE_KEY_ALLOWED_DAYS] ?? DEFAULT_ALLOWED_DAYS;

    const startTimeMinutes = timeToMinutes(startTimeStr);
    const endTimeMinutes = timeToMinutes(endTimeStr);

    // Check if times are valid
    if (startTimeMinutes === null || endTimeMinutes === null || allowedDays.length === 0) {
        console.warn("Tradovate Limiter: Invalid time settings detected. Allowing trades.");
        return true; // Fail safe: allow trading if settings are broken
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Check if today is an allowed day
    if (!allowedDays.includes(currentDay)) {
        // console.log(`Outside allowed days. Today: ${currentDay}, Allowed: ${allowedDays}`);
        return false;
    }

    // 2. Check if current time is within the range
    // Handle overnight range (e.g., 22:00 - 06:00)
    if (endTimeMinutes < startTimeMinutes) {
        // Allow if current time is >= start OR < end
        if (currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes) {
            // console.log(`Within overnight range: ${startTimeStr}-${endTimeStr}`);
            return true;
        }
    } else {
        // Normal same-day range (e.g., 09:00 - 16:30)
        if (currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes) {
             // console.log(`Within same-day range: ${startTimeStr}-${endTimeStr}`);
            return true;
        }
    }

    // console.log(`Outside allowed time range: ${startTimeStr}-${endTimeStr}. Current: ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`);
    return false; // Outside allowed time
}


// Function to close the tab if auto-close is enabled
async function closeTabIfEnabled(reason) {
    try {
        const data = await chrome.storage.local.get([STORAGE_KEY_AUTO_CLOSE_ENABLED]);
        const autoCloseEnabled = data[STORAGE_KEY_AUTO_CLOSE_ENABLED] ?? DEFAULT_AUTO_CLOSE_ENABLED;

        if (autoCloseEnabled) {
            console.log(`Auto-close enabled. Closing tab due to ${reason}.`);
            // Show a brief notification before closing
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.top = '50%';
            notification.style.left = '50%';
            notification.style.transform = 'translate(-50%, -50%)';
            notification.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
            notification.style.color = 'white';
            notification.style.padding = '20px';
            notification.style.borderRadius = '5px';
            notification.style.zIndex = '9999';
            notification.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
            notification.style.fontSize = '16px';
            notification.style.fontWeight = 'bold';
            notification.style.textAlign = 'center';

            const reasonText = reason === 'time' ?
                'Outside allowed trading hours' :
                'Daily trading limit reached';

            notification.textContent = `${reasonText}. Closing tab in 3 seconds...`;
            document.body.appendChild(notification);

            // Wait 3 seconds before closing
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'closeTab' });
            }, 3000);
        }
    } catch (error) {
        console.error('Error in closeTabIfEnabled:', error);
    }
}

function disableButton(button, reason = "limit") { // Add reason parameter
    if (!button || button.hasAttribute('data-limit-reached')) return;
    // Distinguish reason for logging, could potentially style differently
    const reasonMsg = reason === "time" ? "(Time Restriction)" : "(Click Limit)";
    console.log(`Disabling button ${reasonMsg}: ${button.textContent.trim().replace(/\s+/g, ' ')}`);
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    button.style.pointerEvents = 'none';
    button.setAttribute('data-limit-reached', 'true'); // Keep using same attribute for simplicity
    button.setAttribute('data-disable-reason', reason); // Store specific reason
}

function enableButton(button) {
    if (!button || !button.hasAttribute('data-limit-reached')) return;
    console.log(`Enabling button: ${button.textContent.trim().replace(/\s+/g, ' ')}`);
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';
    button.removeAttribute('data-limit-reached');
    button.removeAttribute('data-disable-reason');
}

function findTradingButtons() { /* ... (no changes needed) ... */
    let tradingButtons = [];
    BUTTON_SELECTORS.forEach(selector => {
        const foundButtons = document.querySelectorAll(selector);
        foundButtons.forEach(button => {
            const text = button.textContent.toUpperCase();
            if (text.includes('BUY') || text.includes('SELL')) {
                 if (!tradingButtons.includes(button)) {
                    tradingButtons.push(button);
                 }
            }
        });
    });
    return tradingButtons;
}

async function updateButtonStates(buttons) {
    if (!buttons || buttons.length === 0) return;

    try {
        // Fetch all relevant settings at once
        const data = await chrome.storage.local.get([
            STORAGE_KEY_COUNT, STORAGE_KEY_DATE, STORAGE_KEY_MAX_CLICKS,
            STORAGE_KEY_TIME_ENABLED, STORAGE_KEY_START_TIME, STORAGE_KEY_END_TIME, STORAGE_KEY_ALLOWED_DAYS,
            STORAGE_KEY_AUTO_CLOSE_ENABLED
        ]);

        let count = data[STORAGE_KEY_COUNT] || 0;
        const lastClickDate = data[STORAGE_KEY_DATE];
        const today = getTodayDateString();
        const maxClicks = data[STORAGE_KEY_MAX_CLICKS] ?? DEFAULT_MAX_CLICKS;

        // --- Daily Reset Logic ---
        if (lastClickDate !== today) {
            console.log(`New day detected (${today}). Resetting click count.`);
            count = 0;
            // Only reset count and date, not config settings
            await chrome.storage.local.set({ [STORAGE_KEY_COUNT]: 0, [STORAGE_KEY_DATE]: today });
        }

        // --- Time Check ---
        const isTimeAllowed = isWithinTradingHours(data); // Pass the whole data object
        let disableReason = "";

        // --- Determine final state ---
        let shouldBeDisabled = false;
        if (!isTimeAllowed) {
            shouldBeDisabled = true;
            disableReason = "time";
            console.log("Time restriction active: Outside allowed trading hours.");
        } else if (count >= maxClicks) {
            shouldBeDisabled = true;
            disableReason = "limit";
             console.log(`Click limit reached (${count}/${maxClicks}).`);
        } else {
             console.log(`Checks passed: Within time and limit (${count}/${maxClicks}).`);
        }

        // --- Apply state to buttons ---
        if (shouldBeDisabled) {
            buttons.forEach(btn => disableButton(btn, disableReason));

            // Check if we should close the tab
            closeTabIfEnabled(disableReason);
        } else {
            buttons.forEach(enableButton);
        }

    } catch (error) {
        console.error("Tradovate Limiter: Error updating button states:", error);
    }
}

async function handleButtonClick(event) { // Removed unused 'allFoundButtons' param
    const clickedButton = event.currentTarget;

    // Prevent triggering if already disabled
    if (clickedButton.style.pointerEvents === 'none') {
        console.log("Click ignored on disabled button.");
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    try {
        const data = await chrome.storage.local.get([
            STORAGE_KEY_COUNT, STORAGE_KEY_DATE, STORAGE_KEY_MAX_CLICKS,
            STORAGE_KEY_TIME_ENABLED, STORAGE_KEY_START_TIME, STORAGE_KEY_END_TIME, STORAGE_KEY_ALLOWED_DAYS,
            STORAGE_KEY_AUTO_CLOSE_ENABLED
        ]);

        // --- Perform Checks Again Before Incrementing ---
        // 1. Time Check
        const isTimeAllowed = isWithinTradingHours(data);
        if (!isTimeAllowed) {
             console.warn("Attempted click outside allowed trading hours. Preventing action.");
             event.preventDefault();
             event.stopPropagation();
             // Ensure buttons are visually disabled (redundant safeguard)
             const currentButtons = findTradingButtons();
             currentButtons.forEach(btn => disableButton(btn, "time"));

             // Check if we should close the tab
             closeTabIfEnabled("time");
             return; // Stop processing click
        }

        // 2. Count Check
        let count = data[STORAGE_KEY_COUNT] || 0;
        const lastClickDate = data[STORAGE_KEY_DATE];
        const today = getTodayDateString();
        const maxClicks = data[STORAGE_KEY_MAX_CLICKS] ?? DEFAULT_MAX_CLICKS;

        // Reset check again
        if (lastClickDate !== today) {
            console.log("New day detected during click. Resetting count before incrementing.");
            count = 0;
        }

        if (count < maxClicks) {
            count++;
            console.log(`Button clicked: ${clickedButton.textContent.trim().replace(/\s+/g, ' ')}. New count: ${count}`);
            await chrome.storage.local.set({ [STORAGE_KEY_COUNT]: count, [STORAGE_KEY_DATE]: today });

            // If limit is now reached, disable buttons
            if (count >= maxClicks) {
                console.log("Click limit reached after this click. Disabling buttons.");
                const currentButtons = findTradingButtons();
                currentButtons.forEach(btn => disableButton(btn, "limit"));

                // Check if we should close the tab
                closeTabIfEnabled("limit");
            }
        } else {
            // This case should ideally be caught earlier, but acts as a final safety net
            console.warn(`Attempted click when limit (${maxClicks}) already reached. Preventing action.`);
            event.preventDefault();
            event.stopPropagation();
            const currentButtons = findTradingButtons();
            currentButtons.forEach(btn => disableButton(btn, "limit"));

            // Check if we should close the tab
            closeTabIfEnabled("limit");
        }
    } catch (error) {
        console.error("Tradovate Limiter: Error handling button click:", error);
    }
}

// --- Main Execution & Dynamic Loading ---

const attachedListeners = new WeakSet();

function initialize() {
    // console.log("Tradovate Limiter: Initializing..."); // Make less verbose maybe
    const tradingButtons = findTradingButtons();

    if (tradingButtons.length === 0) {
        return false;
    }

    // console.log(`Tradovate Limiter: Found ${tradingButtons.length} buttons. Setting state/listeners.`);
    updateButtonStates(tradingButtons); // This now checks both count and time

    tradingButtons.forEach(button => {
        if (!attachedListeners.has(button)) {
            button.addEventListener('click', handleButtonClick); // Pass function directly
            attachedListeners.add(button);
        }
    });
    return true;
}

const observer = new MutationObserver((mutationsList, observer) => {
    // ... (Observer logic to detect potential new buttons - NO CHANGE NEEDED HERE) ...
    let potentiallyNewButtonsFound = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
             mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                     BUTTON_SELECTORS.forEach(selector => {
                         if (node.matches && node.matches(selector) || node.querySelector(selector)) {
                            potentiallyNewButtonsFound = true; return;
                         }
                     });
                }
                if (potentiallyNewButtonsFound) return;
            });
        }
         if (potentiallyNewButtonsFound) break;
    }

    if (potentiallyNewButtonsFound) {
        // console.log("Tradovate Limiter: Detected DOM changes, re-initializing...");
        setTimeout(initialize, 250); // Slightly increased delay maybe
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial runs
setTimeout(initialize, 500); // Delay initial check slightly more
setTimeout(initialize, 2000); // And another check later