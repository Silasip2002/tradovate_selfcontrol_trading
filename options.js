// --- DOM Elements ---
const maxClicksInput = document.getElementById('maxClicks');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');
const currentStatusDiv = document.getElementById('currentStatus');
const optionsStatusDiv = document.getElementById('optionsStatus');
const enableAutoCloseCheckbox = document.getElementById('enableAutoClose');
// Time Restriction Elements
const enableTimeCheckbox = document.getElementById('enableTimeRestriction');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const dayCheckboxes = { // Map day value to checkbox element
    0: document.getElementById('daySun'),
    1: document.getElementById('dayMon'),
    2: document.getElementById('dayTue'),
    3: document.getElementById('dayWed'),
    4: document.getElementById('dayThu'),
    5: document.getElementById('dayFri'),
    6: document.getElementById('daySat'),
};

// --- Storage Keys & Defaults ---
const STORAGE_KEY_MAX_CLICKS = 'tradovateMaxClicksConfig';
const STORAGE_KEY_COUNT = 'tradovateClickCount';
const STORAGE_KEY_DATE = 'tradovateClickDate';
// Time Restriction Keys
const STORAGE_KEY_TIME_ENABLED = 'tradovateTimeEnabled';
const STORAGE_KEY_START_TIME = 'tradovateStartTime';
const STORAGE_KEY_END_TIME = 'tradovateEndTime';
const STORAGE_KEY_ALLOWED_DAYS = 'tradovateAllowedDays';
// Options Change Restriction Keys
const STORAGE_KEY_OPTIONS_LAST_CHANGED = 'tradovateOptionsLastChanged';
const STORAGE_KEY_OPTIONS_CHANGED_TODAY = 'tradovateOptionsChangedToday';
// Auto-close Feature Key
const STORAGE_KEY_AUTO_CLOSE_ENABLED = 'tradovateAutoCloseEnabled';
// Defaults
const DEFAULT_MAX_CLICKS = 2;
const DEFAULT_TIME_ENABLED = false;
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '16:30';
const DEFAULT_ALLOWED_DAYS = [1, 2, 3, 4, 5]; // Default Mon-Fri
const DEFAULT_AUTO_CLOSE_ENABLED = false;

// --- Helper Functions ---
function getTodayDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function displayStatusMessage(message, isError = false, duration = 3000) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : 'green';
    setTimeout(() => {
        if (statusDiv.textContent === message) {
            statusDiv.textContent = '';
        }
    }, duration);
}

// Get time until midnight in milliseconds
function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
}

// Format time remaining until options can be changed again
function formatTimeRemaining(milliseconds) {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

// Check if options have been changed today and update UI accordingly
function checkOptionsChangeStatus() {
    chrome.storage.local.get([STORAGE_KEY_OPTIONS_CHANGED_TODAY, STORAGE_KEY_OPTIONS_LAST_CHANGED], (result) => {
        const changedToday = result[STORAGE_KEY_OPTIONS_CHANGED_TODAY] || false;
        const lastChanged = result[STORAGE_KEY_OPTIONS_LAST_CHANGED] || null;

        if (changedToday) {
            // Options have been changed today, disable save button
            saveButton.disabled = true;
            saveButton.style.opacity = '0.5';
            saveButton.style.cursor = 'not-allowed';

            // Show message about when options can be changed again
            const timeUntilMidnight = getTimeUntilMidnight();
            optionsStatusDiv.textContent = `Options can only be changed once per day. You can change options again in ${formatTimeRemaining(timeUntilMidnight)}.`;
            optionsStatusDiv.style.color = '#d9534f'; // Bootstrap danger red

            // Schedule an update of the time remaining
            setTimeout(checkOptionsChangeStatus, 60000); // Update every minute

            // Schedule reset at midnight
            setTimeout(() => {
                chrome.storage.local.set({ [STORAGE_KEY_OPTIONS_CHANGED_TODAY]: false }, () => {
                    console.log('Options change restriction reset at midnight');
                    checkOptionsChangeStatus(); // Update UI
                });
            }, timeUntilMidnight);
        } else {
            // Options can be changed today
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
            saveButton.style.cursor = 'pointer';

            if (lastChanged) {
                const lastChangedDate = new Date(lastChanged);
                optionsStatusDiv.textContent = `Last changed: ${lastChangedDate.toLocaleDateString()} at ${lastChangedDate.toLocaleTimeString()}`;
                optionsStatusDiv.style.color = '#666';
            } else {
                optionsStatusDiv.textContent = '';
            }
        }
    });
}

// --- Core Functions ---

function updateCurrentStatusDisplay(currentCount, currentMaxLimit) {
     currentStatusDiv.textContent = `Today's usage: ${currentCount} / ${currentMaxLimit} trades`;
}

// Load saved settings and current status
function restoreOptionsAndStatus() {
    chrome.storage.local.get(
        [
            // Click Limit
            STORAGE_KEY_MAX_CLICKS, STORAGE_KEY_COUNT, STORAGE_KEY_DATE,
            // Time Limit
            STORAGE_KEY_TIME_ENABLED, STORAGE_KEY_START_TIME, STORAGE_KEY_END_TIME, STORAGE_KEY_ALLOWED_DAYS,
            // Options Change Restriction
            STORAGE_KEY_OPTIONS_CHANGED_TODAY, STORAGE_KEY_OPTIONS_LAST_CHANGED,
            // Auto-close Feature
            STORAGE_KEY_AUTO_CLOSE_ENABLED
        ],
        (result) => {
            // --- Max Clicks & Status ---
            const savedMaxClicks = result[STORAGE_KEY_MAX_CLICKS] ?? DEFAULT_MAX_CLICKS;
            const savedCount = result[STORAGE_KEY_COUNT] || 0;
            const lastSaveDate = result[STORAGE_KEY_DATE];
            const today = getTodayDateString();
            let countForToday = (lastSaveDate === today) ? savedCount : 0;

            maxClicksInput.value = savedMaxClicks;
            updateCurrentStatusDisplay(countForToday, savedMaxClicks);
            console.log('Options loaded: Max clicks setting =', savedMaxClicks, `Status: ${countForToday}/${savedMaxClicks}`);

            // --- Time Restriction Settings ---
            const timeEnabled = result[STORAGE_KEY_TIME_ENABLED] ?? DEFAULT_TIME_ENABLED;
            const startTime = result[STORAGE_KEY_START_TIME] ?? DEFAULT_START_TIME;
            const endTime = result[STORAGE_KEY_END_TIME] ?? DEFAULT_END_TIME;
            const allowedDays = result[STORAGE_KEY_ALLOWED_DAYS] ?? DEFAULT_ALLOWED_DAYS;

            enableTimeCheckbox.checked = timeEnabled;
            startTimeInput.value = startTime;
            endTimeInput.value = endTime;

            // Set day checkboxes based on stored array
            Object.values(dayCheckboxes).forEach(box => box.checked = false); // Uncheck all first
            allowedDays.forEach(dayNum => {
                if (dayCheckboxes[dayNum]) {
                    dayCheckboxes[dayNum].checked = true;
                }
            });
            console.log('Time settings loaded:', { timeEnabled, startTime, endTime, allowedDays });

            // Auto-close setting
            const autoCloseEnabled = result[STORAGE_KEY_AUTO_CLOSE_ENABLED] ?? DEFAULT_AUTO_CLOSE_ENABLED;
            enableAutoCloseCheckbox.checked = autoCloseEnabled;
            console.log('Auto-close setting loaded:', autoCloseEnabled);

            // Check options change status and update UI
            checkOptionsChangeStatus();
        }
    );
}

// Save all settings
function saveOptions() {
    // --- Max Clicks ---
    const maxClicksValue = parseInt(maxClicksInput.value, 10);
    if (isNaN(maxClicksValue) || maxClicksValue < 0) {
        displayStatusMessage('Error: Please enter a valid number for Max Trades.', true);
        return;
    }

    // --- Time Restrictions ---
    const timeEnabledValue = enableTimeCheckbox.checked;
    const startTimeValue = startTimeInput.value;
    const endTimeValue = endTimeInput.value;
    const allowedDaysValue = Object.entries(dayCheckboxes)
        .filter(([_, box]) => box.checked)
        .map(([dayNum, _]) => parseInt(dayNum, 10)); // Get array of checked day numbers

    // Basic time validation (optional but good)
    if (timeEnabledValue && (!startTimeValue || !endTimeValue)) {
         displayStatusMessage('Error: Please select valid start and end times when time restriction is enabled.', true);
         return;
    }
    if (timeEnabledValue && allowedDaysValue.length === 0) {
         displayStatusMessage('Error: Please select at least one allowed day when time restriction is enabled.', true);
         return;
    }


    // --- Prepare data for storage ---
    const autoCloseEnabledValue = enableAutoCloseCheckbox.checked;

    const settingsToSave = {
        [STORAGE_KEY_MAX_CLICKS]: maxClicksValue,
        [STORAGE_KEY_TIME_ENABLED]: timeEnabledValue,
        [STORAGE_KEY_START_TIME]: startTimeValue,
        [STORAGE_KEY_END_TIME]: endTimeValue,
        [STORAGE_KEY_ALLOWED_DAYS]: allowedDaysValue,
        [STORAGE_KEY_AUTO_CLOSE_ENABLED]: autoCloseEnabledValue,
    };

    // --- Save to storage ---
    // Add options change tracking
    const now = new Date().toISOString();
    settingsToSave[STORAGE_KEY_OPTIONS_LAST_CHANGED] = now;
    settingsToSave[STORAGE_KEY_OPTIONS_CHANGED_TODAY] = true;

    chrome.storage.local.set(settingsToSave, () => {
        console.log('Options saved:', settingsToSave);
        displayStatusMessage('Settings saved successfully!', false);

        // Immediately update the status display part that depends on maxClicks
        chrome.storage.local.get([STORAGE_KEY_COUNT, STORAGE_KEY_DATE], (result) => {
             const savedCount = result[STORAGE_KEY_COUNT] || 0;
             const lastSaveDate = result[STORAGE_KEY_DATE];
             const today = getTodayDateString();
             let countForToday = (lastSaveDate === today) ? savedCount : 0;
             updateCurrentStatusDisplay(countForToday, maxClicksValue); // Use the NEW maxClicksValue
        });

        // Update options change status display
        checkOptionsChangeStatus();
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', restoreOptionsAndStatus);
saveButton.addEventListener('click', saveOptions);

// Listen for storage changes to update display if modified elsewhere
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (
        changes[STORAGE_KEY_COUNT] ||
        changes[STORAGE_KEY_DATE] ||
        changes[STORAGE_KEY_MAX_CLICKS] ||
        changes[STORAGE_KEY_TIME_ENABLED] ||
        changes[STORAGE_KEY_START_TIME] ||
        changes[STORAGE_KEY_END_TIME] ||
        changes[STORAGE_KEY_ALLOWED_DAYS]
        )) {
        console.log('Storage changed, refreshing options display...');
        restoreOptionsAndStatus(); // Re-fetch everything
    }
});