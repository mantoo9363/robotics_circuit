# AGENT.md — Rules for circuit-simulation-studio

## Golden rule
Never assume, always prove. Every claim needs a diff/test-output shown, not a summary.

## Process (in order)
1. Research → report root cause with evidence. No code yet.
2. If touching a shared file (simulation-state.ts, stateMaps.ts, simulation-session.ts, connectivity.ts, boardAdapter.ts, picoParser.ts shared helpers, frameTransformers/*): show old vs new code + list all other callers + confirm unaffected. Wait for approval before implementing.
3. Implement only after approval.
4. Show `git status -s` + `git diff` for every file the action log touched — no omissions.
5. Run full regression suite (below), every time.
6. For UI/timing/rendering-visible fixes: ask user to verify in real Studio UI — your own unit tests aren't proof enough (has failed before).
7. One bug/component per task.

## Scope discipline
- Prefer additive (new file/function) over editing working logic.
- Never bundle an unrelated "improvement" into a fix — flag it separately.
- No unrelated refactor/rename while fixing something else.
- Editing a shared utility (findPinId, PIN_ALIASES, etc.) used by many callers → prefer a scoped/narrow fix (new alias list, new param) over changing global behavior. Show risk comparison, default to narrow.

## Regression suite — run ALL, every change
`tsc --noEmit`, `boardAdapter.test.ts`, `pico11StepLcdRegression.test.ts`, `picoMultiLcdRegression.test.ts`, `picoPirSensor.test.ts`, `arduinoPirDivergence.test.ts`, `picoTrafficLight.test.ts`, `multimeter.test.ts`, `picoForLoopSleep.test.ts` (if present), `arduinoPotentiometer.test.ts` (if present), `soilMoistureLed.test.ts` (if present), `tiltSensor.test.ts` (if present), `esp32ServoKeypadPipeline.test.ts`, `arduinoServoPwmAngleNotClobbered.test.ts`, `arduinoServoPwmStoreRestore.test.ts`,  `picoKeypadDebounceHelper.test.ts`, `server/simulation/__tests__/keypadAvrPinResolution.test.ts` and `server/simulation/__tests__/servoPwmRotation.test.ts` (server; run with `npx tsx`). `server/simulation/__tests__/keypadAvrScanPolarity.test.ts` (server; run with `npx tsx`), `server/simulation/__tests__/servoPwmRotation.test.ts` (server; run with `npx tsx`).
New fix → add a new permanent test to this list, don't delete it after.

## Code style
- One-line doc comment above every new exported function.
- New distinct logic → own file/folder, don't grow existing giant files.
- Prefer typed interfaces over `any` for cross-file data shapes.

## Report format
Short, evidence-first: (1) what was broken, (2) root cause + file:line, (3) actual diff, (4) actual test output, (5) "safe to commit: yes/no". No padded/marketing-style writeups.

## Git
Commit after a verified-stable milestone (tests pass + user did real-UI check) so `git diff HEAD` stays small going forward. Always show diff before committing.

## Honesty
- Say explicitly if "verification" was your own test code, not a human clicking the real UI.
- Unsure why something works → say so, don't dress up a guess as a finding. No "if X or if Y" speculation in a final report — trace to a definitive answer or say unresolved.

## When stuck
- Diff looks broken/truncated → show live file content (view), not another diff.
- Same bug "fixed" twice, still fails in real UI → suspect either a second root cause, or a stale/corrupted saved circuit (rebuild circuit from scratch to check).