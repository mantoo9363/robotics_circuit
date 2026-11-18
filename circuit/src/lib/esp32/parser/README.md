# ESP32 Parser Subsystem

## Overview
This directory contains code parsing engines and pattern matchers for ESP32 MicroPython and C++ (Arduino flavor) code execution in the simulation engine.

## MicroPython AST Engine Sharing
- `conditionalLogic.ts` imports board-agnostic `MicroPythonTokenizer`, `MicroPythonParser`, and `MicroPythonInterpreter` classes exported from `src/lib/codeParsing/picoParser.ts`.

> **TODO / ARCHITECTURAL CLEANUP MARKER**:
> The `MicroPythonTokenizer`, `MicroPythonParser`, and `MicroPythonInterpreter` classes currently reside in `src/lib/codeParsing/picoParser.ts`.
> In a future refactoring slice, these shared tools should be extracted into a neutral, board-agnostic module (e.g. `src/lib/codeParsing/microPythonCore.ts`) that both `picoParser.ts` and `conditionalLogic.ts` import from.

## Circular Dependency Guarantee
- `picoParser.ts` has ZERO imports from `src/lib/esp32/*` (directly or transitively).
- Dependency flow is strictly uni-directional: `esp32/*` -> `codeParsing/picoParser.ts`.

## PWM Feature Scope Notes
- **LED / Generic Voltage**: Handled via `dutyPercent` (0-100%) deriving effective average pin voltage (0-3.3V).
- **Servo Motor (PWM)**: Deferred to Slice 2.1 (requires extending `servo.ts` frame transformer).
- **Piezo Buzzer (PWM Tone)**: `freqHz` is captured in pin telemetry. Audio tone pitch generation from PWM frequency is a pre-existing platform-wide gap (not implemented for Pico/Arduino either) and is out of scope for ESP32 Phase 2.

