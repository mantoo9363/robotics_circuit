'use client';

import { CircuitBoard } from 'lucide-react';

export function HeroContestCard() {
  return (
    <section className="grid overflow-hidden rounded-lg border border-[#d9e3ec] bg-white shadow-sm md:grid-cols-[47%_53%]">
      <div className="relative min-h-[340px] bg-[#d3af73]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_58%,rgba(255,214,119,0.8)_0_34%,rgba(64,34,16,0.66)_35%_100%)]" />
        <div className="absolute inset-0 flex items-end justify-center">
          <div className="mb-0 h-[320px] w-[300px] bg-[linear-gradient(180deg,#d7eef1_0_8%,#07838a_8%_48%,#0d6974_48%_72%,#152d36_72%_100%)] opacity-95 [clip-path:polygon(36%_0,65%_0,77%_22%,78%_100%,21%_100%,23%_22%)]" />
        </div>
        <div className="absolute left-[46%] top-5 h-20 w-32 rounded-[40%] bg-[linear-gradient(135deg,#214760,#5e879b)] shadow-xl" />
        <div className="absolute bottom-12 left-[57%] h-20 w-20 rounded-full border-[12px] border-[#142c38]" />
      </div>

      <div className="flex min-h-[340px] flex-col justify-center px-12">
        <div className="mb-5 flex items-center gap-2 text-sm font-bold text-[#005a95]">
          <CircuitBoard size={15} />
          <span>Deadline 6/1</span>
        </div>
        <h1 className=" text-[32px] font-bold leading-tight tracking-[0] text-black">
          Make It Heal Student Contest
        </h1>
        <p className="mt-4 text-[17px] leading-7 text-[#1f2937]">
          There&apos;s still time for your students to enter Make It Heal for a chance to win scholarship
          prizes and showcase designs that solve real-world medical challenges.
        </p>
        <button className="mt-9 h-10 w-40 rounded-full bg-[#006aa0] text-sm font-bold text-white shadow-md hover:bg-[#005a8a]">
          Share with students
        </button>
      </div>
    </section>
  );
}
