/* eslint-disable @next/next/no-img-element */

const accordionSections = [
  {
    title: 'What is a resistor',
    content:
      'A resistor is a passive electronic component that limits current and creates controlled voltage drops in a circuit.',
  },
  {
    title: 'How it works',
    content:
      'Inside a resistor, conductive material opposes the movement of electrons. That opposition converts some electrical energy into heat and reduces current flow.',
  },
  {
    title: "Ohm's Law",
    content:
      'Ohm\'s Law connects voltage, current, and resistance: V = I x R. If resistance increases and voltage stays the same, current decreases.',
  },
  {
    title: 'Color Code',
    content:
      'Most through-hole resistors use colored bands to show resistance value and tolerance. The first bands are digits, the next band is the multiplier, and the last band usually shows tolerance.',
  },
  {
    
    title: 'Applications',
    content:
      'Resistors are used for current limiting, voltage dividers, pull-up and pull-down signals, sensor circuits, timing circuits, and LED protection.',
  },
  {
    title: 'Advantages',
    content:
      'They are inexpensive, reliable, easy to use, available in many values, and essential for protecting sensitive components.',
  },
  {
    title: 'Example circuits',
    content:
      'A common example is an LED connected in series with a resistor. The resistor limits current so the LED does not burn out.',
  },
];

export default function Resistor() {
  return (
    <div className="text-[#2f4054]">
      <div className="card rounded-md border-0 bg-white p-3 text-center shadow-sm">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-md bg-[#f7f8fa] shadow-sm">
          <img
            src="/parts/resistor.svg"
            alt="Resistor"
            className="h-20 w-20 object-contain"
            draggable={false}
          />
        </div>
        <h2 className="mb-1 mt-3 text-xl font-semibold text-[#243b5a]">
          Resistor
        </h2>
        <p className="mb-0 text-sm leading-5 text-[#4b5f77]">
          A resistor limits the flow of electrical current through a circuit.
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
