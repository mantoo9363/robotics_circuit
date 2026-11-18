/* eslint-disable @next/next/no-img-element */

const accordionSections = [
  {
    title: 'What is LED',
    content:
      'An LED, or Light Emitting Diode, is a semiconductor component that produces light when current flows through it in the correct direction.',
  },
  {
    title: 'Working Principle',
    content:
      'When forward biased, electrons and holes recombine inside the LED material and release energy as visible light.',
  },
  {
    title: 'Polarity',
    content:
      'LEDs have polarity. The anode connects to the positive side and the cathode connects to the negative side. Reversing polarity usually prevents the LED from lighting.',
  },
  {
    title: 'Applications',
    content:
      'LEDs are used for indicators, displays, lighting, signals, status panels, and visual feedback in electronic projects.',
  },
  {
    title: 'Example Usage',
    content:
      'A typical LED circuit connects the LED in series with a resistor so current stays within a safe range.',
  },
];

export default function Led() {
  return (
    <div className="text-[#2f4054]">
      <div className="card rounded-md border-0 bg-white p-3 text-center shadow-sm">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-md bg-[#f7f8fa] shadow-sm">
          <img
            src="/parts/led.svg"
            alt="LED"
            className="h-20 w-20 object-contain"
            draggable={false}
          />
        </div>
        <h2 className="mb-1 mt-3 text-xl font-semibold text-[#243b5a]">
          LED
        </h2>
        <p className="mb-0 text-sm leading-5 text-[#4b5f77]">
          A Light Emitting Diode used for visual indication in circuits.
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
