/**
 * Shared singleton AudioContext provider with user-gesture unlock support.
 */

let sharedAudioContext: AudioContext | null = null;

/**
 * Returns the singleton AudioContext instance.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioContext = new AudioContextClass();
    }
  }
  return sharedAudioContext;
}

/**
 * Unlocks / resumes the AudioContext synchronously within a user gesture (e.g. Start Simulation click).
 */
export function unlockAudioContext(): AudioContext | null {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}
