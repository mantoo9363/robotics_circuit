/* eslint-disable @next/next/no-img-element */

const accordionSections = [
{
title: 'What is a Capacitor',
content:
'A capacitor is a passive electronic component that stores electrical energy in an electric field. It consists of two conductive plates separated by an insulating material called a dielectric.',
},
{
title: 'Working Principle',
content:
'When voltage is applied across a capacitor, electric charge accumulates on its plates. One plate stores positive charge while the other stores negative charge, creating an electric field that stores energy.',
},
{
title: 'Capacitance and Unit',
content:
'The ability of a capacitor to store charge is called capacitance. It is measured in Farads (F). Common values are microfarads (µF), nanofarads (nF), and picofarads (pF).',
},
{
title: 'Applications',
content:
'Capacitors are used in power supplies, filters, timing circuits, signal coupling, noise reduction, energy storage, and electronic communication systems.',
},
{
title: 'Arduino Usage',
content:
'In Arduino projects, capacitors help stabilize voltage, reduce electrical noise, smooth sensor readings, and improve overall circuit reliability.',
},
{
title: 'Types of Capacitors',
content:
'Common capacitor types include Ceramic Capacitors, Electrolytic Capacitors, Film Capacitors, Tantalum Capacitors, Supercapacitors, and Variable Capacitors.',
},
{
title: 'Advantages',
content:
'Capacitors can store and release energy quickly, improve circuit stability, filter unwanted signals, and require very little maintenance.',
},
{
title: 'Example Usage',
content:
'A capacitor is commonly connected across the power supply lines of a circuit to smooth voltage fluctuations and reduce electrical noise.',
},
];

export default function Capacitor() {
return ( <div className="text-[#2f4054]"> <div className="card rounded-md border-0 bg-white p-3 text-center shadow-sm"> <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-md bg-[#f7f8fa] shadow-sm"> <img
         src="/parts/capacitor.svg"
         alt="Capacitor"
         className="h-20 w-20 object-contain"
         draggable={false}
       /> </div>


    <h2 className="mb-1 mt-3 text-xl font-semibold text-[#243b5a]">
      Capacitor
    </h2>

    <p className="mb-0 text-sm leading-5 text-[#4b5f77]">
      A passive electronic component that stores and releases electrical
      energy in an electric field.
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
