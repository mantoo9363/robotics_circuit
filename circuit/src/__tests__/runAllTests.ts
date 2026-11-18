import { runBoardAdapterRegressionTests } from './boardAdapter.test';
import { run11StepLcdRegressionTests } from './pico11StepLcdRegression.test';
import { runMultiLcdRegressionTests } from './picoMultiLcdRegression.test';
import { runPirSensorTests } from './picoPirSensor.test';
import { runArduinoPirDivergenceTests } from './arduinoPirDivergence.test';
import { runPicoTrafficLightTests } from './picoTrafficLight.test';
import { runMultimeterTests } from './multimeter.test';
import { testUnrolledForLoop } from './picoForLoopSleep.test';
import { runPotentiometerTests } from './arduinoPotentiometer.test';
import { runSoilMoistureLedTests } from './soilMoistureLed.test';
import { runForceSensorTests } from './forceSensor.test';
import { runSevenSegmentTests } from './sevenSegment.test';
import { runFlexSensorTests } from './arduinoFlexSensor.test';
import { runDpdtRelayIntegrationTests } from './dpdtRelayIntegration.test';
import { runL293DTests } from './l293d.test';
import { runCircuitPresetL293DTests } from './circuitPresetsL293d.test';
import { runL293DCommonGndValidationTests } from './l293dCommonGndValidation.test';
import { runKeypadActiveLowPullUpTests } from './keypadActiveLowPullUp.test';
import { runKeypadRealClickFlowTests } from './keypadRealClickFlow.test';
import { runSessionTimestampRaceResetTests } from './sessionTimestampRaceReset.test';
import { runPythonStringListRepetitionTests } from './pythonStringListRepetition.test';
import { runEsp32ServoBidirectionalWiringTests } from './esp32ServoBidirectionalWiring.test';
import { runEsp32ServoKeypadPipelineTests } from './esp32ServoKeypadPipeline.test';
import { runArduinoServoPwmAngleNotClobberedTests } from './arduinoServoPwmAngleNotClobbered.test';
import { runArduinoServoPwmStoreRestoreTests } from './arduinoServoPwmStoreRestore.test';
import { runPicoKeypadDebounceHelperTests } from './picoKeypadDebounceHelper.test';
import { runEsp32CppUltrasonicTests } from './esp32CppUltrasonic.test';
import { runEsp32CppNeopixelTests } from './esp32CppNeopixel.test';
import { runEsp32CppIrReceiverTests } from './esp32CppIrReceiver.test';
import { runEsp32CppBluetoothSerialTests } from './esp32CppBluetoothSerial.test';

function runAll() {
  console.log("=================== RUNNING ALL SIMULATION REGRESSION TESTS ===================");
  let allPassed = true;

  const runTest = (name: string, fn: () => any) => {
    try {
      const res = fn();
      if (res === false) {
        console.error(`❌ Test [${name}] FAILED.`);
        allPassed = false;
      } else {
        console.log(`✅ Test [${name}] PASSED.`);
      }
    } catch (err) {
      console.error(`💥 Test [${name}] THREW AN EXCEPTION:`, err);
      allPassed = false;
    }
  };

  runTest('boardAdapter', runBoardAdapterRegressionTests);
  runTest('pico11StepLcdRegression', run11StepLcdRegressionTests);
  runTest('picoMultiLcdRegression', runMultiLcdRegressionTests);
  runTest('picoPirSensor', runPirSensorTests);
  runTest('arduinoPirDivergence', runArduinoPirDivergenceTests);
  runTest('picoTrafficLight', runPicoTrafficLightTests);
  runTest('multimeter', runMultimeterTests);
  runTest('picoForLoopSleep', () => { testUnrolledForLoop(); return true; });
  runTest('arduinoPotentiometer', runPotentiometerTests);
  runTest('soilMoistureLed', runSoilMoistureLedTests);
  runTest('forceSensor', runForceSensorTests);
  runTest('sevenSegment', runSevenSegmentTests);
  runTest('arduinoFlexSensor', runFlexSensorTests);
  runTest('dpdtRelayIntegration', runDpdtRelayIntegrationTests);
  runTest('l293d', runL293DTests);
  runTest('circuitPresetsL293d', runCircuitPresetL293DTests);
  runTest('l293dCommonGndValidation', runL293DCommonGndValidationTests);
  runTest('keypadActiveLowPullUp', runKeypadActiveLowPullUpTests);
  runTest('keypadRealClickFlow', runKeypadRealClickFlowTests);
  runTest('sessionTimestampRaceReset', runSessionTimestampRaceResetTests);
  runTest('pythonStringListRepetition', runPythonStringListRepetitionTests);
  runTest('esp32ServoBidirectionalWiring', runEsp32ServoBidirectionalWiringTests);
  runTest('esp32ServoKeypadPipeline', runEsp32ServoKeypadPipelineTests);
  runTest('arduinoServoPwmAngleNotClobbered', runArduinoServoPwmAngleNotClobberedTests);
  runTest('arduinoServoPwmStoreRestore', runArduinoServoPwmStoreRestoreTests);
  runTest('picoKeypadDebounceHelper', runPicoKeypadDebounceHelperTests);
  runTest('esp32CppUltrasonic', runEsp32CppUltrasonicTests);
  runTest('esp32CppNeopixel', runEsp32CppNeopixelTests);
  runTest('esp32CppIrReceiver', runEsp32CppIrReceiverTests);
  runTest('esp32CppBluetoothSerial', runEsp32CppBluetoothSerialTests);

  console.log("\n==============================================================================");
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("⛔ SOME TESTS FAILED.");
    process.exit(1);
  }
}

runAll();
