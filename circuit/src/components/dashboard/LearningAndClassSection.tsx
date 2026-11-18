"use client";

import { GraduationCap } from "lucide-react";

export function LearningAndClassSection() {
  return (
    <section className="mt-8 grid grid-cols-2 gap-6">
      <div className="rounded-lg border border-[#d9e3ec] bg-white p-6 shadow-sm">
        <h2 className="text-[26px] font-bold tracking-[0] text-black">
          Current Learning Path
        </h2>
        {[
          ["3D Circuits Mastery", 60],
          ["Block Coding Intro", 92],
        ].map(([label, value]) => (
          <div key={label} className="mt-7">
            <div className="mb-2 flex justify-between text-sm font-semibold">
              <span>{label}</span>
              <span className="text-[#005a95]">{value}%</span>
            </div>
            <div className="h-3 rounded-full bg-[#d9d9d9]">
              <div
                className="h-3 rounded-full bg-[#006aa0]"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-[260px] items-center justify-center rounded-lg border-2 border-dashed border-[#bdcadd] bg-white">
        <div className="p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#006aa6] shadow">
            <GraduationCap size={30} />
          </div>
          <h2 className="mt-3 text-[26px] font-bold tracking-[0] text-black">
            Join a Class
          </h2>
          <div className="mt-7 flex items-center justify-between gap-2">
            <input
              type="text"
              placeholder="Enter class code"
              className="h-10 flex-grow rounded-full border-2 border-[#006aa0] px-4 text-sm font-bold text-[#111827]"
            />
            <button className="h-10 rounded-full border-2 border-[#006aa0] px-7 text-sm font-bold text-[#006aa0]">
              Enter Code
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
