const appEl = document.querySelector(".app");
const timerView = document.getElementById("timerView");
const settingsView = document.getElementById("settingsView");
const settingsToggle = document.getElementById("settingsToggle");
const modesNav = document.getElementById("modes");

const ringProgress = document.getElementById("ringProgress");
const timeDisplay = document.getElementById("timeDisplay");
const sessionLabel = document.getElementById("sessionLabel");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const skipBtn = document.getElementById("skipBtn");

const focusInput = document.getElementById("focusInput");
const shortInput = document.getElementById("shortInput");
const longInput = document.getElementById("longInput");
const cyclesInput = document.getElementById("cyclesInput");
const soundSelect = document.getElementById("soundSelect");
const doneBtn = document.getElementById("doneBtn");

const RING_CIRCUMFERENCE = 2 * Math.PI * 108;
ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

let localState = null;
let tickHandle = null;

function send(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function durationSecondsFor(state, mode) {
  return state.durations[mode] * 60;
}

function render(state) {
  localState = state;

  appEl.dataset.mode = state.mode;

  // mode tabs
  [...modesNav.querySelectorAll(".mode-btn")].forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === state.mode);
  });

  const total = durationSecondsFor(state, state.mode);
  const remaining = state.isRunning
    ? Math.max(0, Math.round((state.endTime - Date.now()) / 1000))
    : state.remaining;

  timeDisplay.textContent = fmt(remaining);

  const progress = total > 0 ? 1 - remaining / total : 0;
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));

  const labels = { focus: "Focus", short: "Short break", long: "Long break" };
  if (state.mode === "focus") {
    sessionLabel.textContent = `Session ${state.sessionCount} of ${state.cycles}`;
  } else {
    sessionLabel.textContent = labels[state.mode];
  }

  startBtn.textContent = state.isRunning ? "Pause" : remaining < total ? "Resume" : "Start";

  // settings fields
  focusInput.value = state.durations.focus;
  shortInput.value = state.durations.short;
  longInput.value = state.durations.long;
  cyclesInput.value = state.cycles;
  soundSelect.value = state.soundChoice;

  if (state.isRunning && remaining <= 0) {
    // Safety net in case the alarm hasn't landed yet in storage.
    refreshFromBackground();
  }
}

function startTicking() {
  stopTicking();
  tickHandle = setInterval(() => {
    if (localState && localState.isRunning) render(localState);
  }, 1000);
}

function stopTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

async function refreshFromBackground() {
  const res = await send("GET_STATE");
  if (res && res.state) render(res.state);
}

// ---------- Controls ----------

startBtn.addEventListener("click", async () => {
  if (localState.isRunning) {
    await send("PAUSE");
  } else {
    await send("START");
  }
  refreshFromBackground();
});

resetBtn.addEventListener("click", async () => {
  await send("RESET");
  refreshFromBackground();
});

skipBtn.addEventListener("click", async () => {
  await send("SKIP");
  refreshFromBackground();
});

modesNav.addEventListener("click", async (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  await send("SET_MODE", { mode: btn.dataset.mode });
  refreshFromBackground();
});

// ---------- Settings ----------

settingsToggle.addEventListener("click", () => {
  const showingSettings = !settingsView.hidden;
  settingsView.hidden = showingSettings;
  timerView.hidden = !showingSettings;
});

doneBtn.addEventListener("click", async () => {
  await pushSettings();
  settingsView.hidden = true;
  timerView.hidden = false;
});

document.querySelectorAll(".step-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    const dir = Number(btn.dataset.dir);
    const inputMap = { focus: focusInput, short: shortInput, long: longInput, cycles: cyclesInput };
    const input = inputMap[target];
    const min = Number(input.min);
    const max = Number(input.max);
    const val = Math.min(max, Math.max(min, Number(input.value) + dir));
    input.value = val;
  });
});

async function pushSettings() {
  const durations = {
    focus: Number(focusInput.value) || 25,
    short: Number(shortInput.value) || 5,
    long: Number(longInput.value) || 15,
  };
  const cycles = Number(cyclesInput.value) || 4;
  const soundChoice = soundSelect.value;
  await send("UPDATE_SETTINGS", { durations, cycles, soundChoice });
  refreshFromBackground();
}

[focusInput, shortInput, longInput, cyclesInput].forEach((input) => {
  input.addEventListener("change", pushSettings);
});
soundSelect.addEventListener("change", pushSettings);

// ---------- Live updates while popup is open ----------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.state) {
    render(changes.state.newValue);
  }
});

// ---------- Init ----------

(async function init() {
  await refreshFromBackground();
  startTicking();
})();
