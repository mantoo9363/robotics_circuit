'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, UserRound } from 'lucide-react';
import type { IconComponent } from './types';

export function ProjectCard({
  href,
  image,
  preview,
  title,
  subtitle,
  badge,
  creatorName,
  footerAction,
  imageClass,
  imageMode = 'contain',
}: {
  href: string;
  image?: string;
  preview?: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  creatorName?: string;
  footerAction?: ReactNode;
  imageClass?: string;
  imageMode?: 'contain' | 'cover';
}) {
  return (
    <div className="group overflow-hidden rounded-lg border border-[#d9e3ec] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={href} className="block">
        <div className={`flex h-[190px] items-center justify-center bg-[#f4f8fb] ${imageClass ?? ''}`}>
          {preview ?? (image ? (
            <img
              src={image}
              alt=""
              className={
                imageMode === 'cover'
                  ? 'h-full w-full object-cover transition group-hover:scale-105'
                  : 'max-h-[170px] max-w-[220px] object-contain transition group-hover:scale-105'
              }
            />
          ) : null)}
        </div>
        <div className="border-t border-[#eef2f5] px-4 pt-3">
          <div className="truncate text-sm font-bold text-[#111827]">{title}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#111827]">
            <span className="truncate">{subtitle}</span>
            {badge ? (
              <span className="rounded bg-[#e8e8e8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#586170]">
                {badge}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="flex min-h-[42px] items-center justify-between gap-2 px-4 pb-3 pt-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#586170]">
          <UserRound size={14} className="shrink-0 text-[#006aa6]" />
          <span className="truncate">{creatorName || 'Unknown Student'}</span>
        </div>
        {footerAction}
      </div>
    </div>
  );
}

export function CreateCard({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: IconComponent;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[255px] items-center justify-center rounded-lg border-2 border-dashed border-[#bdcadd] bg-white transition hover:border-[#006aa6] hover:bg-[#f7fbff]"
    >
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f3f5f7] text-[#006aa6]">
          <Icon size={30} />
        </div>
        <div className="mt-4 text-sm font-bold text-[#111827]">{title}</div>
        <div className="text-xs text-[#111827]">{subtitle}</div>
      </div>
    </Link>
  );
}

export function ViewAllCard({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[255px] items-center justify-center rounded-lg border-2 border-[#bdcadd] bg-[#f7fbff] transition hover:border-[#006aa6] hover:bg-[#eef5fc]"
    >
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#006aa6] shadow-sm border border-[#d9e3ec]">
          <ArrowRight size={30} />
        </div>
        <div className="mt-4 text-sm font-bold text-[#111827]">{title}</div>
        <div className="text-xs text-[#586170]">{subtitle}</div>
      </div>
    </Link>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  viewAllHref,
}: {
  icon: IconComponent;
  title: string;
  viewAllHref?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon size={24} className="text-[#006aa6]" />
        <h2 className="text-[26px] font-bold tracking-normal text-black">{title}</h2>
      </div>
      {viewAllHref ? (
        <a href={viewAllHref} className="text-sm font-bold text-[#005a95] hover:underline">
          Create New +
        </a>
      ) : null}
    </div>
  );
}
