/* eslint-disable @next/next/no-img-element */

const accordionSections = [
{
title: 'What is a Potentiometer',
content:
'A potentiometer is a three-terminal variable resistor that allows users to manually adjust resistance. It is commonly used to control voltage, current, and signal levels in electronic circuits.',
},
{
title: 'Working Principle',
content:
'A potentiometer contains a resistive track and a movable wiper. As the shaft is rotated, the wiper moves along the resistive element, changing the resistance and output voltage.',
},
{
title: 'Terminals',
content:
'A potentiometer has three terminals. The two outer terminals are connected to the ends of the resistive track, while the center terminal is connected to the movable wiper.',
},
{
title: 'Resistance Range',
content:
'Potentiometers are available in different resistance values such as 1kΩ, 5kΩ, 10kΩ, 50kΩ, and 100kΩ. The selected value depends on the application requirements.',
},
{
title: 'Applications',
content:
'Potentiometers are used in volume controls, brightness adjustment circuits, motor speed controllers, sensor calibration, and voltage divider circuits.',
},
{
title: 'Arduino Usage',
content:
'In Arduino projects, potentiometers are commonly used as analog input devices. The Arduino reads varying voltage values through an analog pin and converts them into digital values using the ADC.',
},
{
title: 'Advantages',
content:
'Potentiometers are simple to use, inexpensive, provide smooth control, and allow real-time adjustment of circuit parameters without modifying the circuit design.',
},
{
title: 'Example Usage',
content:
'A common example is controlling the brightness of an LED using a potentiometer connected to an Arduino analog input and PWM output.',
},
];

export default function Potentiometer() {
return ( <div className="text-[#2f4054]"> <div className="card rounded-md border-0 bg-white p-3 text-center shadow-sm"> <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-md bg-[#f7f8fa] shadow-sm"> <img
         src="/parts/potentiometer.svg"
         alt="Potentiometer"
         className="h-20 w-20 object-contain"
         draggable={false}
       /> </div>


    <h2 className="mb-1 mt-3 text-xl font-semibold text-[#243b5a]">
      Potentiometer
    </h2>

    <p className="mb-0 text-sm leading-5 text-[#4b5f77]">
      A variable resistor used to adjust voltage, current, and signal levels
      in electronic circuits.
    </p>
  </div>

  <div className="mt-3 space-y-2">
    {accordionSections.map((section, index) => (
      <details
        key={section.title}
        className="card rounded-md border-0 bg-white shadow-sm"
        open={index === 0}
      >
        <summary className="cursor-pointer list-none px-3 py-2 text-base font-medium text-[#2f4054]">
          {section.title}
        </summary>

        <div className="border-top px-3 pb-3 text-sm leading-6 text-[#4b5f77]">
          {section.content}
        </div>
      </details>
    ))}
  </div>
</div>


);
}
