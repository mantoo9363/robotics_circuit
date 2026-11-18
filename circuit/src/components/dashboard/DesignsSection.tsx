"use client";

import { Box, Plus } from "lucide-react";
import {
  CreateCard,
  ProjectCard,
  SectionHeader,
  ViewAllCard,
} from "./DashboardCards";

const INITIAL_DESIGNS = [
  {
    href: "/cad",
    image: "/parts/hobby-gearmotor.svg",
    title: "Copy of Robotic Arm",
    subtitle: "8 days ago",
    badge: "Private",
  },
  {
    href: "/cad",
    image: "/parts/hobby-gearmotor.svg",
    title: "Copy of Robotic Arm",
    subtitle: "8 days ago",
    badge: "Private",
  },
  {
    href: "/cad",
    image: "/parts/hobby-gearmotor.svg",
    title: "Copy of Robotic Arm",
    subtitle: "8 days ago",
    badge: "Private",
  },
  {
    href: "/cad",
    image: "/parts/hobby-gearmotor.svg",
    title: "Copy of Robotic Arm",
    subtitle: "8 days ago",
    badge: "Private",
  },
];

export function DesignsSection() {
  const maxVisible = 4;
  const showViewAll = INITIAL_DESIGNS.length > maxVisible;
  const visibleDesigns = showViewAll
    ? INITIAL_DESIGNS.slice(0, maxVisible)
    : INITIAL_DESIGNS;

  return (
    <section className="mt-4">
      <SectionHeader icon={Box} title="3D Designs" viewAllHref="/cad" />
      <div className="grid grid-flow-col auto-cols-[220px] overflow-x-auto gap-4 pb-4 lg:grid-flow-row lg:grid-cols-5 lg:overflow-x-visible lg:pb-0">
        {visibleDesigns.map((design, index) => (
          <ProjectCard
            key={index}
            href={design.href}
            image={design.image}
            title={design.title}
            subtitle={design.subtitle}
            badge={design.badge}
          />
        ))}

        {showViewAll ? (
          <ViewAllCard
            href="/projects"
            title="View All"
            subtitle={`Browse all ${INITIAL_DESIGNS.length} designs`}
          />
        ) : null}
      </div>
    </section>
  );
}
