# Focus — Pomodoro Timer

A modern, minimal Pomodoro timer for Chrome. Tracks focus sessions and
breaks, and plays an alarm sound whenever a focus session ends.

## Install (unpacked / developer mode)

1. Unzip this folder somewhere on your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped `pomodoro-extension` folder.
5. Click the extension icon in your toolbar to open the timer.

## Features

- Focus / Short break / Long break modes with a circular progress ring
- Runs in the background — keep timing even with the popup closed
- Alarm sound (3 styles, synthesized — no audio files needed) when a
  focus session ends, plus a system notification
- Adjustable durations and number of sessions before a long break
- Toolbar badge shows minutes remaining while running

## Notes

- The timer state lives in `chrome.storage.local` and is owned by the
  background service worker, so it keeps counting down accurately even
  if the popup is closed or Chrome is restarted mid-timer (the alarm
  still fires at the correct wall-clock time).
- Sounds are generated on the fly with the Web Audio API in a hidden
  offscreen document, so there are no bundled media files.
