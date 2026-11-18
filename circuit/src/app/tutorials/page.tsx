'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  Clock3,
  Globe2,
  ListVideo,
  Lock,
  MoveRight,
  PlayCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { useGetter } from '@cs/hooks/getter';
import { serverApiUrl } from '@cs/lib/server-api';

const MEDIA_ORIGIN = (process.env.NEXT_PUBLIC_MEDIA_ORIGIN || '').replace(/\/$/, '');

function resolveMediaUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${MEDIA_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function stripUnsafeHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '');
}

const AUTH_USER_KEY = 'circuit-studio-auth-user';

type StoredUser = {
  className?: string;
  classLevel?: string;
  studentProfile?: { grade?: string | number };
  roles?: Array<{ name?: string }>;
  permissions?: string[];
  isSubscribed?: boolean;
  hasActiveSubscription?: boolean;
};

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function userHasSubscription(user: StoredUser | null) {
  if (!user) return false;
  if (Array.isArray(user.roles) && user.roles.some((role) => String(role.name).toLowerCase() === 'subscriber')) return true;
  if (Array.isArray(user.permissions) && user.permissions.includes('premium_access')) return true;
  if (user.isSubscribed || user.hasActiveSubscription) return true;
  return true;
}

type TutorialContent = {
  title: string;
  description: string;
  chapters: Array<{ title?: string; timestamp?: string; [key: string]: unknown }>;
  videoUrl?: string | null;
  videoFileName?: string | null;
  thumbnailUrl?: string | null;
  thumbnailFileName?: string | null;
};

type Tutorial = {
  id: string;
  slug: string;
  classLevel: string;
  subjectId: string;
  subjectName: string;
  pricing: 'free' | 'premium' | string;
  order?: number;
  languages: string[];
  content: Record<string, TutorialContent>;
  createdAt: string;
  updatedAt: string;
};

type TutorialsResponse = {
  ok?: boolean;
  error?: string;
  tutorials?: Tutorial[];
  pagination?: { page: number; limit: number; total: number; pages: number };
};

const PAGE_SIZE = 8;
const PRICING_OPTIONS = ['All', 'free', 'premium'] as const;

function getContent(tutorial: Tutorial, language: string): TutorialContent {
  return tutorial.content[language] ?? tutorial.content[tutorial.languages[0]] ?? Object.values(tutorial.content)[0];
}

function getEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      let videoId = parsed.searchParams.get('v');
      if (!videoId && parsed.hostname.includes('youtu.be')) videoId = parsed.pathname.replace('/', '');
      return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : url;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video/${parsed.pathname.replace('/', '')}`;
    }
    return url;
  } catch {
    return url;
  }
}

function hasMediaValue(value?: string | null) {
  return Boolean(value && value.trim());
}

function hasTutorialVideo(content?: TutorialContent | null) {
  return hasMediaValue(content?.videoUrl);
}

function hasTutorialThumbnail(content?: TutorialContent | null) {
  return hasMediaValue(content?.thumbnailUrl);
}

const SUBJECT_COLORS = [
  { bg: '#e9f5fb', fg: '#006aa0' },
  { bg: '#f1f8f4', fg: '#1f7a37' },
  { bg: '#fffaf0', fg: '#b7791f' },
  { bg: '#f3faf8', fg: '#007a6a' },
  { bg: '#fdf2f8', fg: '#a23b72' },
  { bg: '#f5f3ff', fg: '#6d28d9' },
];

function subjectColor(subjectName: string) {
  let hash = 0;
  for (let i = 0; i < subjectName.length; i += 1) hash = (hash + subjectName.charCodeAt(i)) % SUBJECT_COLORS.length;
  return SUBJECT_COLORS[hash];
}

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

function tutorialPriority(tutorial: Tutorial) {
  const order = Number(tutorial.order);
  if (!Number.isFinite(order) || order <= 0) return Number.MAX_SAFE_INTEGER;
  return order;
}

function sortTutorialsByPriority(left: Tutorial, right: Tutorial) {
  const priorityDiff = tutorialPriority(left) - tutorialPriority(right);
  if (priorityDiff !== 0) return priorityDiff;
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const normalizedPages = Array.from(pages)
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .sort((left, right) => left - right);

  return normalizedPages.reduce<Array<number | 'ellipsis'>>((items, pageNumber, index) => {
    const previousPage = normalizedPages[index - 1];
    if (previousPage && pageNumber - previousPage > 1) {
      items.push('ellipsis');
    }
    items.push(pageNumber);
    return items;
  }, []);
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
      <div className="aspect-video w-full animate-pulse bg-[#dbe6ee]" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-20 animate-pulse rounded bg-[#dbe6ee]" />
        <div className="h-4 w-full animate-pulse rounded bg-[#dbe6ee]" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-[#dbe6ee]" />
      </div>
    </div>
  );
}

function DefaultTutorialThumbnail({
  title,
  subjectName,
  isTextOnlyReady,
}: {
  title: string;
  subjectName: string;
  isTextOnlyReady: boolean;
}) {
  const colors = subjectColor(subjectName);
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden px-5 py-4"
      style={{
        background:
          `linear-gradient(135deg, ${colors.bg} 0%, #ffffff 54%, #eef6fb 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(16,24,40,0.06) 1px, transparent 1px), linear-gradient(0deg, rgba(16,24,40,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm"
          style={{ color: colors.fg }}
        >
          <BookOpen size={23} />
        </span>
        <span
          className="rounded-full bg-white/95 px-3 py-1 text-[10px] font-black uppercase shadow-sm"
          style={{ color: colors.fg }}
        >
          {isTextOnlyReady ? 'Ready' : 'Lesson'}
        </span>
      </div>
      <div className="relative">
        
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#101828] px-3.5 py-2 text-xs font-black text-white shadow-sm transition group-hover:bg-[#006aa0]">
          Open and start reading
          <MoveRight size={14} />
        </div>
      </div>
    </div>
  );
}

function ThumbnailBox({ tutorial, className = '' }: { tutorial: Tutorial; className?: string }) {
  const content = getContent(tutorial, 'english');
  const colors = subjectColor(tutorial.subjectName);
  const thumbnail = resolveMediaUrl(content.thumbnailUrl);
  const isTextOnlyReady = !hasTutorialThumbnail(content) && !hasTutorialVideo(content);
  return (
    <div
      className={`relative aspect-video shrink-0 overflow-hidden rounded-md bg-cover bg-center ${className}`}
      style={{ backgroundColor: colors.bg, backgroundImage: thumbnail ? `url(${thumbnail})` : undefined }}
    >
      {!thumbnail ? (
        <DefaultTutorialThumbnail
          title={content.title}
          subjectName={tutorial.subjectName}
          isTextOnlyReady={isTextOnlyReady}
        />
      ) : null}
      <div className="absolute left-1.5 top-1.5">
        {tutorial.pricing === 'premium' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-black uppercase text-[#b7791f] shadow-sm">
            <Lock size={9} /> Premium
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-black uppercase text-[#1f7a37] shadow-sm">
            <BadgeCheck size={9} /> Free
          </span>
        )}
      </div>
    </div>
  );
}

export default function TutorialsPage() {
  const { callGetter } = useGetter();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEmptyNotice, setShowEmptyNotice] = useState(false);

  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [pricingFilter, setPricingFilter] = useState<'All' | 'free' | 'premium'>('All');
  const [page, setPage] = useState(1);

  const [activeTutorialId, setActiveTutorialId] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState('english');

  const loadTutorials = useCallback(async () => {
    setLoading(true);
    setError('');
    setShowEmptyNotice(false);
    setCurrentUser(getStoredUser());

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        status: 'published',
      });
      if (search.trim()) params.set('search', search.trim());
      if (subjectFilter !== 'All') params.set('subjectName', subjectFilter);
      if (pricingFilter !== 'All') params.set('pricing', pricingFilter);

      const data = await callGetter<TutorialsResponse>({
        url: serverApiUrl('/tutorial'),
        bodyData: Object.fromEntries(params.entries()),
      });

      if (!data || data.ok === false || !Array.isArray(data.tutorials)) {
        throw new Error(data && 'error' in data ? data.error ?? 'Could not load tutorials.' : 'Could not load tutorials.');
      }

      setTutorials(data.tutorials);
      setPagination(data.pagination ?? { page, limit: PAGE_SIZE, total: data.tutorials.length, pages: 1 });
      setShowEmptyNotice(data.tutorials.length === 0);
    } catch (loadError) {
      setTutorials([]);
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
      setShowEmptyNotice(true);
      setError(loadError instanceof Error ? loadError.message : 'Could not load tutorials.');
    } finally {
      setLoading(false);
    }
  }, [callGetter, page, pricingFilter, search, subjectFilter]);

  useEffect(() => {
    void loadTutorials();
  }, [loadTutorials]);

  const subjectOptions = useMemo(
    () => ['All', ...Array.from(new Set(tutorials.map((t) => t.subjectName)))],
    [tutorials],
  );
  const pagedTutorials = useMemo(() => [...tutorials].sort(sortTutorialsByPriority), [tutorials]);
  const totalPages = Math.max(1, pagination.pages);
  const paginationItems = useMemo(() => getPaginationItems(page, totalPages), [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search, subjectFilter, pricingFilter]);

  const activeTutorial = useMemo(
    () => tutorials.find((tutorial) => tutorial.id === activeTutorialId) ?? null,
    [tutorials, activeTutorialId],
  );
  const activeContent = useMemo(
    () => (activeTutorial ? getContent(activeTutorial, activeLanguage) : null),
    [activeTutorial, activeLanguage],
  );
  const activeEmbedUrl = useMemo(
    () => (activeContent?.videoUrl ? getEmbedUrl(resolveMediaUrl(activeContent.videoUrl)) : null),
    [activeContent?.videoUrl],
  );
  const activeSubjectColor = useMemo(
    () => (activeTutorial ? subjectColor(activeTutorial.subjectName) : null),
    [activeTutorial],
  );
  const isSubscribed = useMemo(() => userHasSubscription(currentUser), [currentUser]);
  const isActivePremiumLocked = Boolean(activeTutorial?.pricing === 'premium' && !isSubscribed);
  const activeHasVideo = hasTutorialVideo(activeContent);
  const activeHasThumbnail = hasTutorialThumbnail(activeContent);
  const activeIsTextOnlyReady = !activeHasThumbnail && !activeHasVideo;

  const upNextList = useMemo(() => {
    if (!activeTutorial) return [];
    const sameSubjectFirst = [...tutorials]
      .filter((t) => t.id !== activeTutorial.id)
      .sort((a, b) => {
        const aSame = a.subjectName === activeTutorial.subjectName ? 0 : 1;
        const bSame = b.subjectName === activeTutorial.subjectName ? 0 : 1;
        const subjectDiff = aSame - bSame;
        return subjectDiff || sortTutorialsByPriority(a, b);
      });
    return sameSubjectFirst;
  }, [tutorials, activeTutorial]);

  function openTutorial(tutorial: Tutorial) {
    setActiveTutorialId(tutorial.id);
    setActiveLanguage(tutorial.languages[0] ?? 'english');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToBrowse() {
    setActiveTutorialId(null);
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-[1280px] px-6 py-7">
        {!activeTutorial ? (
          <>
            {/* Hero + filters (browse mode) */}
            <section className="mb-6 overflow-hidden rounded-lg border border-[#d8e3ec] bg-gradient-to-br from-[#f8fbfd] to-white p-6 shadow-sm lg:p-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cfe0eb] bg-[#f3faf8] px-3 py-1 text-xs font-black uppercase text-[#007a6a]">
                <ListVideo size={15} />
                Video tutorials
              </div>
              <h1 className="text-[32px] font-black tracking-[0] text-[#101828]">Explore lessons & tutorials</h1>
              <p className="mt-2 max-w-[640px] text-sm font-semibold leading-6 text-[#526070]">
                Browse subject-wise video tutorials, filter by class, and start watching instantly.
              </p>

              {showEmptyNotice && !loading ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#f3dfa8] bg-[#fff8e8] px-3 py-1.5 text-xs font-bold text-[#8a6116]">
                  <Sparkles size={14} />
                  Tutorials will appear here once they are published for your class
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a97a3]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search lessons..."
                    className="h-11 w-full rounded-md border border-[#d8e3ec] bg-white pl-9 pr-3 text-sm font-semibold text-[#101828] outline-none focus:border-[#006aa0] focus:ring-2 focus:ring-[#d7ebf6]"
                  />
                </div>
                
                <select
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  className="h-11 rounded-md border border-[#d8e3ec] bg-white px-3 text-sm font-bold text-[#425466] outline-none focus:border-[#006aa0]"
                >
                  {subjectOptions.map((option) => (
                    <option key={option} value={option}>{option === 'All' ? 'All Topic' : option}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  {PRICING_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPricingFilter(option)}
                      className={`h-11 flex-1 rounded-md border text-sm font-black capitalize transition ${
                        pricingFilter === option
                          ? 'border-[#006aa0] bg-[#006aa0] text-white'
                          : 'border-[#d8e3ec] bg-white text-[#425466] hover:bg-[#f6fafc]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {error ? (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</div>
            ) : null}

            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={index} />)}
              </div>
            ) : pagedTutorials.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-[#d8e3ec] bg-white text-center shadow-sm">
                <div className="max-w-[400px] p-6">
                  <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-[#fff4de] text-[#b7791f]">
                    <BookOpen size={28} />
                  </span>
                  <h2 className="text-xl font-black text-[#101828]">No lessons found</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#667789]">Try changing your filters or search term.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {pagedTutorials.map((tutorial) => {
                  const content = getContent(tutorial, 'english');
                  const colors = subjectColor(tutorial.subjectName);
                  const hasVideo = hasTutorialVideo(content);
                  const isTextOnlyReady = !hasTutorialThumbnail(content) && !hasVideo;
                  return (
                    <button
                      key={tutorial.id}
                      type="button"
                      onClick={() => openTutorial(tutorial)}
                      className="group overflow-hidden rounded-lg border border-[#d8e3ec] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-[#b9d7e8] hover:shadow-md"
                    >
                      <div className="relative">
                        <ThumbnailBox tutorial={tutorial} className="w-full rounded-none" />
                        {hasVideo ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                            <PlayCircle size={44} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                          </div>
                        ) : null}
                      </div>
                      <div className="p-4">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          <span
                            className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase"
                            style={{ backgroundColor: colors.bg, color: colors.fg }}
                          >
                            {tutorial.subjectName}
                          </span>
                          
                          {isTextOnlyReady ? (
                            <span className="rounded-full bg-[#edf7ed] px-2.5 py-1 text-[10px] font-black uppercase text-[#1f7a37]">
                              Ready
                            </span>
                          ) : null}
                        </div>
                        <h3 className="line-clamp-2 text-sm font-black leading-5 text-[#101828]">{content.title}</h3>
                        {isTextOnlyReady ? (
                          <div
                            className="mt-2 line-clamp-3 text-xs font-semibold leading-5 text-[#667789]"
                            dangerouslySetInnerHTML={{ __html: stripUnsafeHtml(content.description ?? '') }}
                          />
                        ) : (
                          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#8a97a3]">
                            <Globe2 size={13} />
                            {tutorial.languages.join(', ')}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && totalPages > 1 ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-9 rounded-md border border-[#d8e3ec] bg-white px-4 text-sm font-black text-[#425466] transition hover:bg-[#f6fafc] disabled:opacity-40"
                >
                  Prev
                </button>
                {paginationItems.map((item, index) => (
                  item === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="flex h-9 min-w-9 items-center justify-center px-1 text-sm font-black text-[#8a97a3]"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item)}
                      aria-current={page === item ? 'page' : undefined}
                      className={`h-9 min-w-9 rounded-md border px-3 text-sm font-black transition ${
                        page === item
                          ? 'border-[#006aa0] bg-[#006aa0] text-white'
                          : 'border-[#d8e3ec] bg-white text-[#425466] hover:bg-[#f6fafc]'
                      }`}
                    >
                      {item}
                    </button>
                  )
                ))}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-9 rounded-md border border-[#d8e3ec] bg-white px-4 text-sm font-black text-[#425466] transition hover:bg-[#f6fafc] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {/* Watch mode (YouTube-style) */}
            <button
              type="button"
              onClick={backToBrowse}
              className="mb-4 flex items-center gap-2 text-sm font-black text-[#425466] transition hover:text-[#006aa0]"
            >
              <ArrowLeft size={16} />
              Back to all lessons
            </button>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              {/* Left: player + details */}
              <div>
                {activeHasVideo ? (
                  <div className="overflow-hidden rounded-lg bg-black shadow-sm">
                    <div className="aspect-video w-full">
                      {isActivePremiumLocked ? (
                          // Show poster preview with lock overlay so details below remain visible
                          <div className="relative h-full w-full bg-black">
                            {activeContent?.thumbnailUrl ? (
                              <img src={resolveMediaUrl(activeContent.thumbnailUrl)} alt="poster" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full bg-black" />
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 text-white">
                              <Lock size={48} />
                              <h3 className="text-lg font-black">Premium lesson</h3>
                              <p className="text-sm text-white/80">This lesson is reserved for subscribers. Subscribe to unlock playback.</p>
                              <div className="flex gap-2">
                                <a href="/profile" className="rounded-md bg-[#006aa0] px-4 py-2 text-sm font-black text-white">Manage subscription</a>
                                <a href="/login" className="rounded-md border border-white/25 px-4 py-2 text-sm font-black text-white/90">Login</a>
                              </div>
                            </div>
                          </div>
                        ) : activeEmbedUrl ? (
                          <iframe
                            key={activeTutorial.id}
                            src={activeEmbedUrl}
                            title={activeContent?.title}
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <video
                            key={activeTutorial.id}
                            controls
                            controlsList="nodownload noremoteplayback"
                            disablePictureInPicture
                            onContextMenu={(event) => event.preventDefault()}
                            autoPlay
                            poster={resolveMediaUrl(activeContent?.thumbnailUrl)}
                            className="h-full w-full bg-black"
                          >
                            <source src={resolveMediaUrl(activeContent?.videoUrl)} />
                            Your browser does not support the video tag.
                          </video>
                        )}
                    </div>
                  </div>
                ) : activeHasThumbnail ? (
                  <div className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
                    <div className="grid gap-0 sm:grid-cols-[300px_minmax(0,1fr)]">
                      <div className="aspect-video sm:aspect-[4/3]">
                      <img
                        src={resolveMediaUrl(activeContent?.thumbnailUrl)}
                        alt={activeContent?.title ?? 'Tutorial thumbnail'}
                        className="h-full w-full object-cover"
                      />
                      </div>
                      <div className="flex flex-col justify-center p-5">
                        <span className="mb-3 inline-flex w-fit rounded-full bg-[#edf7ed] px-3 py-1 text-xs font-black uppercase text-[#1f7a37]">
                          Reading lesson
                        </span>
                        <h2 className="text-xl font-black leading-7 text-[#101828]">
                          {activeContent?.title}
                        </h2>
                        <p className="mt-2 max-w-[460px] text-sm font-semibold leading-6 text-[#667789]">
                          Start with the notes below. Related lessons are available in the Up next list.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  {activeIsTextOnlyReady ? (
                    <div className="mb-3 inline-flex rounded-full bg-[#edf7ed] px-3 py-1 text-xs font-black uppercase text-[#1f7a37]">
                      Ready
                    </div>
                  ) : (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase"
                        style={{
                          backgroundColor: activeSubjectColor?.bg,
                          color: activeSubjectColor?.fg,
                        }}
                      >
                        {activeTutorial.subjectName}
                      </span>
                      
                    
                      {activeTutorial.pricing === 'premium' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4de] px-2.5 py-1 text-[10px] font-black uppercase text-[#b7791f]">
                          <Lock size={10} /> Premium
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ed] px-2.5 py-1 text-[10px] font-black uppercase text-[#1f7a37]">
                          <BadgeCheck size={10} /> Free
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[#8a97a3]">{timeAgo(activeTutorial.updatedAt)}</span>

                      {activeTutorial.languages.length > 1 ? (
                        <div className="ml-auto flex gap-1 rounded-md bg-[#f0f4f8] p-1">
                          {activeTutorial.languages.map((lang) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setActiveLanguage(lang)}
                              className={`rounded px-2.5 py-1 text-xs font-black capitalize transition ${
                                activeLanguage === lang ? 'bg-white text-[#006aa0] shadow-sm' : 'text-[#667789]'
                              }`}
                            >
                              {lang}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}

                  <h1 className="text-2xl font-black leading-8 text-[#101828]">{activeContent?.title}</h1>

                  <div className="mt-4 rounded-lg border border-[#e5edf3] bg-[#f8fbfd] p-4">
                    <div
                      className="tutorial-rich-content max-w-none text-sm font-semibold leading-6 text-[#526070]"
                      dangerouslySetInnerHTML={{ __html: stripUnsafeHtml(activeContent?.description ?? '') }}
                    />
                  </div>

                  {!activeIsTextOnlyReady && activeContent?.chapters && activeContent.chapters.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-[#e5edf3] bg-white p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-black text-[#101828]">
                        <Clock3 size={16} className="text-[#006aa0]" />
                        Chapters
                      </div>
                      <div className="space-y-1.5">
                        {activeContent.chapters.map((chapter, index) => (
                          <div key={index} className="rounded-md bg-[#f8fbfd] px-3 py-2 text-sm font-bold text-[#425466]">
                            {chapter.title ?? `Chapter ${index + 1}`}
                            {chapter.timestamp ? <span className="ml-2 text-xs font-semibold text-[#8a97a3]">{chapter.timestamp}</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Right: up next sidebar */}
              <aside>
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-[#101828]">
                  <ListVideo size={17} className="text-[#006aa0]" />
                  Up next
                </div>
                <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                  {upNextList.map((tutorial) => {
                    const content = getContent(tutorial, 'english');
                    return (
                      <button
                        key={tutorial.id}
                        type="button"
                        onClick={() => openTutorial(tutorial)}
                        className="flex w-full gap-3 rounded-md p-2 text-left transition hover:bg-[#f8fbfd]"
                      >
                        <ThumbnailBox tutorial={tutorial} className="w-[140px]" />
                        <div className="min-w-0 flex-1">
                          <h4 className="line-clamp-2 text-sm font-black leading-5 text-[#101828]">{content.title}</h4>
                          <p className="mt-1 truncate text-xs font-bold text-[#667789]">{tutorial.subjectName} </p>
                          <p className="mt-0.5 text-xs font-semibold text-[#8a97a3]">{timeAgo(tutorial.updatedAt)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
