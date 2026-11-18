'use client';

import React, { useEffect, useState } from 'react';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { useGetter } from '@cs/hooks/getter';

// Define the precise type matching your incoming JSON data
type CurriculumModule = {
  id: string;
  week: number;
  class: string;
  description: string;
  theoryTopics: string[];
  practicalActivities: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  courseId: string | null;
};

interface SyllabusRowsProps {
  theoryTopics: string[];
  practicalActivities: string[];
}

function SyllabusRows({ theoryTopics, practicalActivities }: SyllabusRowsProps) {
  // Determine the longest array so we render all available items side-by-side
  const maxRows = Math.max(theoryTopics.length, practicalActivities.length);
  const rows = Array.from({ length: maxRows });

  return (
    <>
      {rows.map((_, index) => (
        <tr key={index}>
          <td className="w-1/2 border border-[#c9c9c9] bg-[#f6f2f8] px-3 py-2 align-top text-[13px] leading-[1.18] text-black">
            {theoryTopics[index] ? (
              <>
                <span className="mr-1">•</span>
                {theoryTopics[index]}
              </>
            ) : null}
          </td>
          <td className="w-1/2 border border-[#c9c9c9] bg-[#f7f7f7] px-3 py-2 align-top text-[13px] leading-[1.18] text-black">
            {practicalActivities[index] ? (
              <>
                <span className="mr-1">▶</span>
                {practicalActivities[index]}
              </>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

function WeekTable({ week }: { week: CurriculumModule }) {
  return (
    <section className="mb-11 overflow-hidden border border-[#c9c9c9] bg-white">
      <div className="bg-[#7e3d9a] px-3 py-2 text-[18px] font-black leading-tight text-white">
        Week {week.week}: {week.description}
      </div>
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr>
            <th className="w-1/2 border border-[#c9c9c9] bg-[#5b2a70] px-2 py-1.5 text-center text-[14px] font-black text-white">
              Theory Topics
            </th>
            <th className="w-1/2 border border-[#c9c9c9] bg-[#5b2a70] px-2 py-1.5 text-center text-[14px] font-black text-white">
              Practical Activity
            </th>
          </tr>
        </thead>
        <tbody>
          <SyllabusRows 
            theoryTopics={week.theoryTopics} 
            practicalActivities={week.practicalActivities} 
          />
        </tbody>
      </table>
    </section>
  );
}

export default function ClassSyllabusPage() {
  const { callGetter } = useGetter();
  const [data, setData] = useState<CurriculumModule[]>([]);

  useEffect(() => {
    const fetchSyllabus = async () => {
      const response = await callGetter({
        url: `${process.env.NEXT_PUBLIC_API_BASE_URL}/curriculum-modules`,
        bodyData: { classLabel: 'Cl. 3' }
      });

      if (response) {
        console.log("Fetched syllabus data:", response);
        
        // Adapt depending on whether your API returns raw array or an enveloped object
        const actualArray = Array.isArray(response) ? response : response.data;
        
        if (Array.isArray(actualArray)) {
          setData(actualArray);
        } else {
          console.error("API did not return an array!", response);
        }
      }
    };

    fetchSyllabus();
  }, []);

  return (
    <DashboardShell>
      <div className="min-h-screen bg-white px-0 py-0">
        <div className="w-full overflow-x-auto">
          <div className="row g-0 animate-fadeIn">
            {Array.isArray(data) && data.map((week) => (
              <div key={week.id} className="col-sm-6 px-1">
                <WeekTable week={week} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}