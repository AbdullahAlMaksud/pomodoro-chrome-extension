// offscreen.js — synthesizes an alarm tone with the Web Audio API so the
// extension doesn't need to ship a bundled audio file.

let ctx;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(startTime, duration, freq, type, peakGain) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function playClassicBell() {
  const ac = getCtx();
  const now = ac.currentTime;
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    const t = now + i * 0.55;
    tone(t, 0.45, 880, "sine", 0.22);
    tone(t, 0.45, 1320, "sine", 0.09);
  }
  return rings * 0.55 + 0.5;
}

function playDigitalPulse() {
  const ac = getCtx();
  const now = ac.currentTime;
  const pulses = 8;
  for (let i = 0; i < pulses; i++) {
    const t = now + i * 0.28;
    tone(t, 0.14, i % 2 === 0 ? 1046 : 784, "square", 0.12);
  }
  return pulses * 0.28 + 0.4;
}

function playSoftChime() {
  const ac = getCtx();
  const now = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    tone(now + i * 0.22, 0.9, freq, "sine", 0.16);
  });
  return notes.length * 0.22 + 1.0;
}

function play(sound) {
  let totalSeconds = 2;
  if (sound === "digital") totalSeconds = playDigitalPulse();
  else if (sound === "chime") totalSeconds = playSoftChime();
  else totalSeconds = playClassicBell();

  // Give it a moment to finish, then let the background worker close this
  // offscreen document so it doesn't linger.
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "CLOSE_OFFSCREEN" });
  }, totalSeconds * 1000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PLAY_ALARM") {
    play(msg.sound);
  }
});
