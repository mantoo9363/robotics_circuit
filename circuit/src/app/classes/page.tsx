'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Plus,
  Video,
  Image as ImageIcon,
  Users,
  PlayCircle,
  Clock,
  FileText,
  X,
} from 'lucide-react';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { useGetter } from '@cs/hooks/getter';
import { serverApiUrl, serverAssetUrl } from '@cs/lib/server-api';

const AUTH_USER_KEY = 'circuit-studio-auth-user';

type StoredUser = {
  className?: string;
  classLevel?: string;
  studentProfile?: { grade?: string | number };
};

type ApiCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  icon: string | null;
  coverColor: string | null;
  instructorName: string | null;
  moduleCount: number;
  studentCount: number;
  progress: number;
  status: string;
  subjectName?: string | null;
  classLevel?: string | null;
  ageRange?: string | null;
  videoCount?: number | null;
  schedule?: string | null;
  readyFormat?: string[] | null;
  projects?: ApiProject[] | null;
  createdAt: string;
  updatedAt: string;
};

type ApiProject = {
  id?: string;
  title: string;
  summaries: string[];
  videoUrl?: string | null;
  videoFileName?: string | null;
  order?: number;
};

type ParsedCourseDetails = {
  adminCourseContent?: boolean;
  classLevel?: string;
  ageRange?: string;
  studentCount?: number;
  videoCount?: number;
  schedule?: string;
  projects?: ApiProject[];
  readyFormat?: string[];
};

function normalizeClassLevel(value: string | undefined): string {
  if (!value) return '';
  const cleaned = value.trim().toLowerCase();
  if (/^\d{1,2}$/.test(cleaned)) {
    return `class ${cleaned}`;
  }
  if (cleaned.startsWith('cl.')) {
    return `class ${cleaned.replace('cl.', '').trim()}`;
  }
  const classMatch = cleaned.match(/(?:class\s*)?(\d{1,2})/i);
  if (classMatch) {
    return `class ${classMatch[1]}`;
  }
  return cleaned;
}

function inferClassLevel(course: ApiCourse, parsedDetails: ParsedCourseDetails) {
  return course.classLevel || parsedDetails.classLevel || (/^class\s+\d+/i.test(course.title) ? course.title : '');
}

function safeParseCourseDetails(course: ApiCourse): ParsedCourseDetails {
  if (!course.description?.trim().startsWith('{')) return {};
  try {
    return JSON.parse(course.description) as ParsedCourseDetails;
  } catch {
    console.warn('Could not parse description configuration JSON string for ID:', course.id);
    return {};
  }
}

function getStoredStudentClass(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as StoredUser;
    const level = parsed.classLevel || parsed.className || parsed.studentProfile?.grade;
    return normalizeClassLevel(level === undefined ? undefined : String(level));
  } catch (error) {
    console.error('Error reading student class:', error);
    return '';
  }
}

function getEmbedUrl(url: string): string | null {
  try {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const id = url.includes('youtu.be')
        ? url.split('youtu.be/')[1]?.split(/[?&]/)[0]
        : url.split('v=')[1]?.split('&')[0];
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    }
    if (url.includes('vimeo.com')) {
      const id = url.split('vimeo.com/')[1]?.split(/[?&]/)[0];
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }
    return null; // not a known embed host — treat as direct video file
  } catch {
    return null;
  }
}

function isImageMedia(url: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)(?:\?.*)?$/i.test(url);
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'in review': 'bg-blue-50 text-blue-600',
    published: 'bg-emerald-50 text-emerald-600',
    draft: 'bg-gray-100 text-gray-500',
  };
  const cls = map[status?.toLowerCase()] || 'bg-amber-50 text-amber-700';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${cls}`}>
      {status || 'Draft'}
    </span>
  );
}

export default function ClassSyllabusPage() {
  const { callGetter } = useGetter();
  const [data, setData] = useState<ApiCourse[]>([]);
  const [loading, setLoading] = useState(true);
  // tracks which project rows are expanded, keyed as `${courseId}-${projectIdx}`
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [activeMedia, setActiveMedia] = useState<{ url: string; title: string; type: 'image' | 'video' } | null>(null);

  const studentClass = useMemo(() => getStoredStudentClass(), []);

  useEffect(() => {
    const fetchSyllabus = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (studentClass) params.set('classLevel', studentClass);

        const response = await callGetter<{ courses?: ApiCourse[] }>({
          url: serverApiUrl(params.toString() ? `/courses` : '/courses'),
        });

        if (response) {
          const actualArray = Array.isArray(response) ? response : response.courses;
          if (Array.isArray(actualArray)) {
            setData(actualArray);
          }
        }
      } catch (err) {
        console.error('Failed fetching modules:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSyllabus();
  }, []);

  const visibleClassPlans = useMemo(() => {
    if (!studentClass || !Array.isArray(data)) return [];

    return data
      .map((course) => {
        const parsedDetails = safeParseCourseDetails(course);
        const projects = course.projects || parsedDetails.projects || [];

        return {
          id: course.id,
          title: course.title,
          status: course.status,
          progress: course.progress,
          instructorName: course.instructorName || 'Teacher',
          coverColor: course.coverColor || '#7e3d9a',
          classLevel: inferClassLevel(course, parsedDetails) || 'Unassigned',
          ageRange: course.ageRange || parsedDetails.ageRange || 'N/A',
          videoCount: course.videoCount ?? parsedDetails.videoCount ?? 0,
          studentCount: course.studentCount ?? parsedDetails.studentCount ?? 0,
          schedule: course.schedule || parsedDetails.schedule || 'Weekly',
          projects: [...projects].sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
          readyFormat: course.readyFormat || parsedDetails.readyFormat || [],
        };
      })
      .filter((plan) => normalizeClassLevel(plan.classLevel) === studentClass);
  }, [data, studentClass]);

  const classTaskLabel = studentClass ? studentClass.toUpperCase() : 'N/A';

  const toggleRow = (key: string) => {
    setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center bg-white">
          <p className="text-sm font-semibold text-gray-500 animate-pulse">Loading class syllabus profiles...</p>
        </div>
      </DashboardShell>
    );
  }

  if (visibleClassPlans.length === 0) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center bg-white px-4 py-12 text-center">
          <div className="max-w-md space-y-3">
            <h2 className="text-xl font-bold text-gray-900">Class not assigned</h2>
            <p className="text-sm text-gray-500">
              No profile dashboard tracking is configured for {classTaskLabel || 'your account'}, or the design data for this class tier is currently unsubmitted.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="min-h-screen bg-[#f8fafc] p-4 lg:p-8">
        <div className="space-y-10">
          {visibleClassPlans.map((coursePlan, courseIndex) => (
            <div key={coursePlan.id} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* LEFT: main syllabus card */}
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                      {classTaskLabel} | {coursePlan.ageRange} | {coursePlan.projects.length} PROJECTS
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-gray-900">{coursePlan.title}</h2>
                  </div>
                  <StatusPill status={coursePlan.status} />
                </div>

                <div className="mb-5 flex flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                    <Users size={13} /> {coursePlan.studentCount} students
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                    <PlayCircle size={13} /> {coursePlan.videoCount} videos
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                    <Clock size={13} /> {coursePlan.schedule}
                  </span>
                </div>

                {coursePlan.projects.length === 0 ? (
                  <p className="rounded-lg bg-gray-50 p-4 text-xs italic text-gray-400">
                    No project details available for this course module tier.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {coursePlan.projects.map((project, idx) => {
                      const key = `${coursePlan.id}-${idx}`;
                      const isOpen = !!openRows[key];
                      return (
                        <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/60">
                          <button
                            type="button"
                            onClick={() => toggleRow(key)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-[#e51b72] shadow-sm">
                                <FileText size={16} />
                              </span>
                              <div>
                                <p className="text-sm font-bold text-gray-900">
                                  Project {idx + 1}: {project.title}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {isOpen ? 'Click to collapse project details' : 'Click to expand project details'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <ChevronDown
                                size={18}
                                className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                              {project.videoUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const mediaType = isImageMedia(project.videoUrl!) ? 'image' : 'video';
                                    setActiveMedia({ url: project.videoUrl!, title: project.title, type: mediaType });
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-emerald-600 hover:bg-emerald-50"
                                >
                                  {isImageMedia(project.videoUrl) ? <ImageIcon size={14} /> : <Video size={14} />}
                                </button>
                              )}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                              <div>
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                  Build Summaries
                                </h4>
                                <div
                                  className="mt-1 space-y-1 text-xs leading-relaxed text-gray-700 sm:text-sm"
                                  dangerouslySetInnerHTML={{ __html: project.summaries?.join('') || '' }}
                                />
                              </div>
                              {project.videoFileName && (
                                <div >
                                  
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT: sidebar */}
              <div className="space-y-6">
                {courseIndex === 0 ? (
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                      Ready Format
                    </h3>
                    <p className="mb-3 text-[11px] text-gray-400">For every project</p>
                    <div className="space-y-2">
                      {(coursePlan.readyFormat.length > 0
                        ? coursePlan.readyFormat.slice(0, 1)
                        : ['What They Build']
                      ).map((item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-[#425466]">{item}</span>
                          <CheckCircle2 size={14} className="text-[#1f7a37]" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button className="hidden w-full items-center justify-center gap-2 rounded-xl bg-[#e51b72] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#bd145c]">
                  <Plus size={16} /> Add Module
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActiveMedia(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#111827] px-4 py-3">
              <p className="truncate text-sm font-bold text-white">{activeMedia.title}</p>
              <button
                type="button"
                onClick={() => setActiveMedia(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className={activeMedia.type === 'image' ? 'max-h-[78vh] w-full bg-black' : 'aspect-video w-full bg-black'}>
              {activeMedia.type === 'image' ? (
                <img
                  src={serverAssetUrl(activeMedia.url)}
                  alt={activeMedia.title}
                  className="max-h-[78vh] w-full object-contain"
                />
              ) : getEmbedUrl(activeMedia.url) ? (
                <iframe
                  src={getEmbedUrl(activeMedia.url)!}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={serverAssetUrl(activeMedia.url)} controls autoPlay className="h-full w-full">
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
