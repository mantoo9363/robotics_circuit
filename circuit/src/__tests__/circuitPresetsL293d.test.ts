/**
 * Regression Test Suite: Verification of Arduino + L293D Presets (1 Motor, 2 Motors, 4 Motors).
 */

import { CIRCUIT_PRESETS } from "../lib/circuit-presets";
import { useCircuitStore } from "../lib/store";
import { applyL293DFrameTransformer } from "../lib/simulation/frameTransformers/l293d";
import { buildSimulationFrame, type SimulationBoardPinState } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";

function createArduinoBoardPins(pinStateMap: Record<string, number>): SimulationBoardPinState[] {
  const pinNumbers: Record<string, number> = {
    d3: 3, d4: 4, d5: 5, d7: 7, d8: 8, d9: 9, "5v": 100,
  };

  return Object.entries(pinStateMap).map(([handleId, voltage]) => ({
    pin: pinNumbers[handleId] ?? 0,
    handleId,
    mode: "OUTPUT",
    value: voltage > 0 ? 255 : 0,
    normalizedValue: voltage > 0 ? 1.0 : 0,
    voltage,
    active: voltage > 0,
  }));
}

export function runCircuitPresetL293DTests(): boolean {
  console.log("=================== RUNNING CIRCUIT PRESETS L293D TESTS ===================\n");
  let passed = true;

  // 1. Test Preset: Arduino + L293D (1 Motor)
  const preset1 = CIRCUIT_PRESETS.find((p) => p.id === "arduino-l293d-1motor");
  if (!preset1) {
    console.error("❌ Preset 'arduino-l293d-1motor' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: preset1.nodes,
      edges: preset1.edges,
      arduinoCode: preset1.arduinoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: preset1.nodes,
      edges: preset1.edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameForward = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({ "5v": 5.0, d9: 5.0, d8: 5.0, d7: 0.0 }),
    };

    const res = applyL293DFrameTransformer(frameForward);
    const pins = res.components["a-l293d"]?.pins;

    if (pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0) {
      console.log("✓ Preset 'arduino-l293d-1motor' PASSED (1 Motor Output 1 = 5V, Output 2 = 0V)");
    } else {
      console.error("❌ Preset 'arduino-l293d-1motor' FAILED:", pins);
      passed = false;
    }
  }

  // 2. Test Preset: Arduino + L293D (2 Motors)
  const preset2 = CIRCUIT_PRESETS.find((p) => p.id === "arduino-l293d-2motors");
  if (!preset2) {
    console.error("❌ Preset 'arduino-l293d-2motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: preset2.nodes,
      edges: preset2.edges,
      arduinoCode: preset2.arduinoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: preset2.nodes,
      edges: preset2.edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameTurnLeft = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 0.0, d5: 5.0,
      }),
    };

    const res = applyL293DFrameTransformer(frameTurnLeft);
    const pins = res.components["a-l293d"]?.pins;

    const leftOk = pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0;
    const rightOk = pins?.output3?.voltage === 0.0 && pins?.output4?.voltage === 5.0;

    if (leftOk && rightOk) {
      console.log("✓ Preset 'arduino-l293d-2motors' PASSED (2 Motors Differential Drive: Left 5V/0V, Right 0V/5V)");
    } else {
      console.error("❌ Preset 'arduino-l293d-2motors' FAILED:", pins);
      passed = false;
    }
  }

  // 3. Test Preset: Arduino + L293D (4 Motors)
  const preset4 = CIRCUIT_PRESETS.find((p) => p.id === "arduino-l293d-4motors");
  if (!preset4) {
    console.error("❌ Preset 'arduino-l293d-4motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: preset4.nodes,
      edges: preset4.edges,
      arduinoCode: preset4.arduinoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: preset4.nodes,
      edges: preset4.edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frame4WD = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 5.0, d5: 0.0,
      }),
    };

    const res = applyL293DFrameTransformer(frame4WD);
    const pins = res.components["a-l293d"]?.pins;

    const left4WDOk = pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0;
    const right4WDOk = pins?.output3?.voltage === 5.0 && pins?.output4?.voltage === 0.0;

    if (left4WDOk && right4WDOk) {
      console.log("✓ Preset 'arduino-l293d-4motors' PASSED (4WD 4 Motors Powered Across 4 Channels)");
    } else {
      console.error("❌ Preset 'arduino-l293d-4motors' FAILED:", pins);
      passed = false;
    }
  }

  // 4. Test Preset: Raspberry Pi Pico + L293D (1 Motor)
  const presetPico1 = CIRCUIT_PRESETS.find((p) => p.id === "pico-l293d-1motor");
  if (!presetPico1) {
    console.error("❌ Preset 'pico-l293d-1motor' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetPico1.nodes,
      edges: presetPico1.edges,
      picoCode: presetPico1.picoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetPico1.nodes,
      edges: presetPico1.edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const picoBoardPins1: SimulationBoardPinState[] = [
      { pin: 15, handleId: "p-pico:gp15", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 14, handleId: "p-pico:gp14", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 13, handleId: "p-pico:gp13", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
    ];

    const framePico1 = { ...baseFrame, boardPins: picoBoardPins1 };
    const res = applyL293DFrameTransformer(framePico1);
    const pins = res.components["p-l293d"]?.pins;

    if (pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0) {
      console.log("✓ Preset 'pico-l293d-1motor' PASSED (Pico Output 1 = 5V, Output 2 = 0V)");
    } else {
      console.error("❌ Preset 'pico-l293d-1motor' FAILED:", pins);
      passed = false;
    }
  }

  // 5. Test Preset: Raspberry Pi Pico + L293D (2 Motors)
  const presetPico2 = CIRCUIT_PRESETS.find((p) => p.id === "pico-l293d-2motors");
  if (!presetPico2) {
    console.error("❌ Preset 'pico-l293d-2motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetPico2.nodes,
      edges: presetPico2.edges,
      picoCode: presetPico2.picoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetPico2.nodes,
      edges: presetPico2.edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const picoBoardPins2: SimulationBoardPinState[] = [
      { pin: 15, handleId: "p-pico:gp15", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 14, handleId: "p-pico:gp14", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 13, handleId: "p-pico:gp13", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 12, handleId: "p-pico:gp12", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 11, handleId: "p-pico:gp11", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 10, handleId: "p-pico:gp10", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
    ];

    const framePico2 = { ...baseFrame, boardPins: picoBoardPins2 };
    const res = applyL293DFrameTransformer(framePico2);
    const pins = res.components["p-l293d"]?.pins;

    const leftOk = pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0;
    const rightOk = pins?.output3?.voltage === 0.0 && pins?.output4?.voltage === 5.0;

    if (leftOk && rightOk) {
      console.log("✓ Preset 'pico-l293d-2motors' PASSED (Pico Dual Motor Differential Drive)");
    } else {
      console.error("❌ Preset 'pico-l293d-2motors' FAILED:", pins);
      passed = false;
    }
  }

  // 6. Test Preset: Arduino + L293D (2 Hobby Gearmotors)
  const presetArduinoHobby = CIRCUIT_PRESETS.find((p) => p.id === "arduino-l293d-hobbygearmotor");
  if (!presetArduinoHobby) {
    console.error("❌ Preset 'arduino-l293d-hobbygearmotor' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetArduinoHobby.nodes,
      edges: presetArduinoHobby.edges,
      arduinoCode: presetArduinoHobby.arduinoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetArduinoHobby.nodes,
      edges: presetArduinoHobby.edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameHobby = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 5.0, d5: 0.0,
      }),
    };

    const res = applyL293DFrameTransformer(frameHobby);
    const pins = res.components["a-l293d"]?.pins;

    if (pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0 && pins?.output3?.voltage === 5.0) {
      console.log("✓ Preset 'arduino-l293d-hobbygearmotor' PASSED (Arduino + L293D + 2 Hobby TT Motors)");
    } else {
      console.error("❌ Preset 'arduino-l293d-hobbygearmotor' FAILED:", pins);
      passed = false;
    }
  }

  // 7. Test Preset: Raspberry Pi Pico + L293D (2 Hobby Gearmotors)
  const presetPicoHobby = CIRCUIT_PRESETS.find((p) => p.id === "pico-l293d-hobbygearmotor");
  if (!presetPicoHobby) {
    console.error("❌ Preset 'pico-l293d-hobbygearmotor' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetPicoHobby.nodes,
      edges: presetPicoHobby.edges,
      picoCode: presetPicoHobby.picoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetPicoHobby.nodes,
      edges: presetPicoHobby.edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const picoBoardPins: SimulationBoardPinState[] = [
      { pin: 15, handleId: "p-pico:gp15", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 14, handleId: "p-pico:gp14", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 13, handleId: "p-pico:gp13", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 12, handleId: "p-pico:gp12", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 11, handleId: "p-pico:gp11", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 10, handleId: "p-pico:gp10", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
    ];

    const framePicoHobby = { ...baseFrame, boardPins: picoBoardPins };
    const res = applyL293DFrameTransformer(framePicoHobby);
    const pins = res.components["p-l293d"]?.pins;

    if (pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0 && pins?.output3?.voltage === 5.0) {
      console.log("✓ Preset 'pico-l293d-hobbygearmotor' PASSED (Pico + L293D + 2 Hobby TT Motors)");
    } else {
      console.error("❌ Preset 'pico-l293dHobby' FAILED:", pins);
      passed = false;
    }
  }

  // 8. Test Preset: Pico + L293D (4WD / 4 Motors Parallel)
  const presetPico4WD = CIRCUIT_PRESETS.find((p) => p.id === "pico-l293d-4motors");
  if (!presetPico4WD) {
    console.error("❌ Preset 'pico-l293d-4motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetPico4WD.nodes,
      edges: presetPico4WD.edges,
      picoCode: presetPico4WD.picoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetPico4WD.nodes,
      edges: presetPico4WD.edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const picoBoardPins: SimulationBoardPinState[] = [
      { pin: 15, handleId: "p-pico:gp15", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 14, handleId: "p-pico:gp14", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 13, handleId: "p-pico:gp13", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 12, handleId: "p-pico:gp12", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 11, handleId: "p-pico:gp11", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 10, handleId: "p-pico:gp10", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
    ];

    const framePico4WD = { ...baseFrame, boardPins: picoBoardPins };
    const res = applyL293DFrameTransformer(framePico4WD);
    const pins = res.components["p-l293d"]?.pins;

    if (pins?.output1?.voltage === 5.0 && pins?.output3?.voltage === 5.0) {
      console.log("✓ Preset 'pico-l293d-4motors' PASSED (Pico 4WD Parallel 4 Motors Powered)");
    } else {
      console.error("❌ Preset 'pico-l293d-4motors' FAILED:", pins);
      passed = false;
    }
  }

  // 9. Test Preset: Arduino + Dual L293D (4 Independent Motors)
  const presetArduinoDual4 = CIRCUIT_PRESETS.find((p) => p.id === "arduino-l293d-2x-4motors");
  if (!presetArduinoDual4) {
    console.error("❌ Preset 'arduino-l293d-2x-4motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetArduinoDual4.nodes,
      edges: presetArduinoDual4.edges,
      arduinoCode: presetArduinoDual4.arduinoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetArduinoDual4.nodes,
      edges: presetArduinoDual4.edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameDual4 = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 5.0, d5: 0.0,
        d10: 5.0, d11: 5.0, d12: 0.0,
        d6: 5.0, a0: 5.0, a1: 0.0,
      }),
    };

    const res = applyL293DFrameTransformer(frameDual4);
    const pins1 = res.components["l293d_1"]?.pins;
    const pins2 = res.components["l293d_2"]?.pins;
    const m1 = res.components["m1"]?.telemetry;
    const m2 = res.components["m2"]?.telemetry;
    const m3 = res.components["m3"]?.telemetry;
    const m4 = res.components["m4"]?.telemetry;

    if (
      pins1?.output1?.voltage === 5.0 && pins1?.output3?.voltage === 5.0 &&
      pins2?.output1?.voltage === 5.0 && pins2?.output3?.voltage === 5.0 &&
      m1?.rpm === 2400 && m2?.rpm === 2400 && m3?.rpm === 2400 && m4?.rpm === 2400
    ) {
      console.log("✓ Preset 'arduino-l293d-2x-4motors' PASSED (Arduino Dual L293D 4 Independent Motors - All 4 Motors 2400 RPM)");
    } else {
      console.error("❌ Preset 'arduino-l293d-2x-4motors' FAILED:", pins1, pins2, { m1, m2, m3, m4 });
      passed = false;
    }
  }

  // 10. Test Preset: Pico + Dual L293D (4 Independent Motors)
  const presetPicoDual4 = CIRCUIT_PRESETS.find((p) => p.id === "pico-l293d-2x-4motors");
  if (!presetPicoDual4) {
    console.error("❌ Preset 'pico-l293d-2x-4motors' not found in CIRCUIT_PRESETS.");
    return false;
  }
  {
    useCircuitStore.setState({
      nodes: presetPicoDual4.nodes,
      edges: presetPicoDual4.edges,
      picoCode: presetPicoDual4.picoCode,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: presetPicoDual4.nodes,
      edges: presetPicoDual4.edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const picoBoardPins: SimulationBoardPinState[] = [
      { pin: 15, handleId: "p-pico:gp15", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 14, handleId: "p-pico:gp14", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 13, handleId: "p-pico:gp13", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 12, handleId: "p-pico:gp12", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 11, handleId: "p-pico:gp11", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 10, handleId: "p-pico:gp10", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 9, handleId: "p-pico:gp9", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 8, handleId: "p-pico:gp8", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 7, handleId: "p-pico:gp7", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 6, handleId: "p-pico:gp6", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 5, handleId: "p-pico:gp5", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
      { pin: 4, handleId: "p-pico:gp4", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
    ];

    const framePicoDual4 = { ...baseFrame, boardPins: picoBoardPins };
    const res = applyL293DFrameTransformer(framePicoDual4);
    const pins1 = res.components["l293d_1"]?.pins;
    const pins2 = res.components["l293d_2"]?.pins;
    const m1 = res.components["m1"]?.telemetry;
    const m2 = res.components["m2"]?.telemetry;
    const m3 = res.components["m3"]?.telemetry;
    const m4 = res.components["m4"]?.telemetry;

    if (
      pins1?.output1?.voltage === 5.0 && pins1?.output3?.voltage === 5.0 &&
      pins2?.output1?.voltage === 5.0 && pins2?.output3?.voltage === 5.0 &&
      m1?.rpm === 2400 && m2?.rpm === 2400 && m3?.rpm === 2400 && m4?.rpm === 2400
    ) {
      console.log("✓ Preset 'pico-l293d-2x-4motors' PASSED (Pico Dual L293D 4 Independent Motors - All 4 Motors 2400 RPM)");
    } else {
      console.error("❌ Preset 'pico-l293d-2x-4motors' FAILED:", pins1, pins2, { m1, m2, m3, m4 });
      passed = false;
    }
  }

  console.log("\n=================== PRESETS TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runCircuitPresetL293DTests();
  if (success) {
    console.log("✅ All Circuit Presets L293D tests passed successfully.");
  } else {
    console.error("❌ Some preset tests failed.");
    process.exit(1);
  }
}
