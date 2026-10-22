// background.js — service worker
// Owns the authoritative timer state so it survives the popup closing.

const ALARM_NAME = "focus-timer-complete";

const DEFAULT_STATE = {
  mode: "focus", // 'focus' | 'short' | 'long'
  isRunning: false,
  endTime: null, // ms epoch, set while running
  remaining: 25 * 60, // seconds left, authoritative while paused
  durations: { focus: 25, short: 5, long: 15 },
  cycles: 4,
  sessionCount: 1, // which focus session we're on (1-indexed)
  soundChoice: "classic",
};

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return state ? { ...DEFAULT_STATE, ...state } : { ...DEFAULT_STATE };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

function durationFor(state, mode) {
  return state.durations[mode] * 60;
}

async function updateBadge(state) {
  if (!state.isRunning) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  const mins = Math.ceil(remaining / 60);
  chrome.action.setBadgeText({ text: String(mins) });
  const color = state.mode === "focus" ? "#E8734A" : state.mode === "short" ? "#6FA8A0" : "#8C8FD8";
  chrome.action.setBadgeBackgroundColor({ color });
}

async function startTimer() {
  const state = await getState();
  const seconds = state.remaining > 0 ? state.remaining : durationFor(state, state.mode);
  const endTime = Date.now() + seconds * 1000;
  const next = await setState({ isRunning: true, endTime });
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: seconds / 60 });
  updateBadge(next);
}

async function pauseTimer() {
  const state = await getState();
  if (!state.isRunning) return;
  const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  chrome.alarms.clear(ALARM_NAME);
  const next = await setState({ isRunning: false, endTime: null, remaining });
  updateBadge(next);
}

async function resetTimer() {
  const state = await getState();
  chrome.alarms.clear(ALARM_NAME);
  const next = await setState({
    isRunning: false,
    endTime: null,
    remaining: durationFor(state, state.mode),
  });
  updateBadge(next);
}

async function setMode(mode) {
  chrome.alarms.clear(ALARM_NAME);
  const state = await getState();
  const next = await setState({
    mode,
    isRunning: false,
    endTime: null,
    remaining: durationFor(state, mode),
  });
  updateBadge(next);
}

async function skipTimer() {
  await advanceSession(false);
}

async function updateSettings({ durations, cycles, soundChoice }) {
  const state = await getState();
  const patch = {};
  if (durations) patch.durations = durations;
  if (cycles) patch.cycles = cycles;
  if (soundChoice) patch.soundChoice = soundChoice;
  const next = await setState(patch);
  // If currently paused (not running), refresh the displayed remaining time
  // to match a possibly-edited duration for the active mode.
  if (!next.isRunning) {
    await setState({ remaining: durationFor(next, next.mode) });
  }
}

// Called when a session finishes, either naturally (alarm fired) or via Skip.
async function advanceSession(playSound) {
  chrome.alarms.clear(ALARM_NAME);
  const state = await getState();

  let nextMode = "focus";
  let nextSessionCount = state.sessionCount;

  if (state.mode === "focus") {
    if (state.sessionCount >= state.cycles) {
      nextMode = "long";
      nextSessionCount = 1;
    } else {
      nextMode = "short";
      nextSessionCount = state.sessionCount + 1;
    }
  } else {
    nextMode = "focus";
    nextSessionCount = state.sessionCount;
  }

  const next = await setState({
    mode: nextMode,
    isRunning: false,
    endTime: null,
    remaining: durationFor(state, nextMode),
    sessionCount: nextSessionCount,
  });
  updateBadge(next);

  if (playSound) {
    // The alarm sound is reserved for the end of a focus session, as
    // requested — breaks just get a quiet system notification.
    if (state.mode === "focus") {
      playAlarm(state.soundChoice);
    }
    notify(state.mode);
  }
}

function notify(finishedMode) {
  const titles = {
    focus: "Focus session complete",
    short: "Break's over",
    long: "Long break's over",
  };
  const messages = {
    focus: "Nice work. Time for a break.",
    short: "Ready to get back to it?",
    long: "Ready to start the next round?",
  };
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: titles[finishedMode] || "Time's up",
    message: messages[finishedMode] || "",
    priority: 2,
  });
}

// ---------- Offscreen audio ----------

let creatingOffscreen = null;

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play an alarm tone when a Pomodoro session ends.",
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

async function playAlarm(soundChoice) {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: "PLAY_ALARM", sound: soundChoice || "classic" });
  } catch (e) {
    // ignore — offscreen playback is best-effort
  }
}

// ---------- Event wiring ----------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    advanceSession(true);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "START":
        await startTimer();
        break;
      case "PAUSE":
        await pauseTimer();
        break;
      case "RESET":
        await resetTimer();
        break;
      case "SKIP":
        await skipTimer();
        break;
      case "SET_MODE":
        await setMode(msg.mode);
        break;
      case "UPDATE_SETTINGS":
        await updateSettings(msg.payload);
        break;
      case "GET_STATE": {
        const state = await getState();
        sendResponse({ state });
        return;
      }
      case "CLOSE_OFFSCREEN":
        try {
          await chrome.offscreen.closeDocument();
        } catch (e) {}
        break;
    }
    sendResponse({ ok: true });
  })();
  return true; // keep the message channel open for the async response
});

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await setState(state);
});
