'use client';

/* eslint-disable @next/next/no-img-element */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, ChevronDown, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei';
import { serverApiUrl, serverAssetUrl } from '@cs/lib/server-api';
import { GlobalSkeleton } from '@cs/components/ui/GlobalSkeleton';

type GuideLink = { label: string; url: string };
type GuideSection = {
  id: string;
  title: string;
  content: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'MODEL_3D' | null;
  mediaUrl: string;
  links: GuideLink[];
};
type ComponentGuide = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
  sections: GuideSection[];
};

type ComponentGuideListResponse = ComponentGuide[] | {
  ok?: boolean;
  guides?: ComponentGuide[];
  data?: ComponentGuide[];
};
type MediaKind = 'IMAGE' | 'VIDEO' | 'MODEL_3D';
type SelectedMedia = { kind: MediaKind; url: string; title: string };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getMediaKind(mediaUrl: string | undefined, mediaType: GuideSection['mediaType']) {
  const cleanUrl = String(mediaUrl ?? '').split('?')[0].split('#')[0].toLowerCase();
  if (/\.(glb|gltf|jlb)$/i.test(cleanUrl)) return 'MODEL_3D';
  if (/\.(mp4|webm|mov|m4v|ogg)$/i.test(cleanUrl)) return 'VIDEO';
  if (/\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(cleanUrl)) return 'IMAGE';
  if (mediaType === 'MODEL_3D') return 'MODEL_3D';
  if (mediaType === 'VIDEO') return 'VIDEO';
  if (mediaType === 'IMAGE') return 'IMAGE';
  return null;
}

function LargeMediaViewer({
  media,
  onClose,
}: {
  media: SelectedMedia;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4">
      <button
        type="button"
        aria-label="Close media viewer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[88vh] w-[min(1100px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="truncate pr-3 text-base font-semibold text-[#27415f]">{media.title}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-100"
            aria-label="Close media viewer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-[#f5f7f9] p-4">
          {media.kind === 'IMAGE' && (
            <img src={media.url} alt={media.title} className="h-full w-full object-contain" />
          )}
          {media.kind === 'VIDEO' && (
            <video src={media.url} controls autoPlay preload="metadata" className="h-full w-full rounded bg-black object-contain" />
          )}
          {media.kind === 'MODEL_3D' && (
            <Canvas camera={{ position: [3, 2.5, 4], fov: 45 }}>
              <color attach="background" args={['#f5f7f9']} />
              <ambientLight intensity={1.8} />
              <directionalLight position={[3, 5, 6]} intensity={2.2} />
              <Suspense fallback={null}>
                <GuideModel url={media.url} />
              </Suspense>
              <OrbitControls makeDefault />
            </Canvas>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function GuideModel({ url }: { url: string }) {
  const model = useGLTF(url);
  return (
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <primitive object={model.scene} />
      </Center>
    </Bounds>
  );
}

async function fetchGuide(candidates: string[], signal: AbortSignal) {
  for (const candidate of candidates) {
    const response = await fetch(serverApiUrl(`/component-guides/${encodeURIComponent(candidate)}`), {
      cache: 'no-store',
      signal,
    });
    if (response.status === 404) continue;
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Unable to load component information.');
    return result?.guide as ComponentGuide;
  }

  const response = await fetch(serverApiUrl('/component-guides'), {
    cache: 'no-store',
    signal,
  });
  const result = (await response.json().catch(() => null)) as ComponentGuideListResponse | null;
  if (!response.ok) throw new Error('Unable to load component information.');

  const guides = Array.isArray(result) ? result : result?.guides ?? result?.data ?? [];
  return guides.find((guide) => {
    const guideCandidates = [guide.slug, guide.name].map(slugify);
    return candidates.some((candidate) => guideCandidates.includes(candidate));
  }) ?? null;
}

export function ComponentGuidePanel({
  componentType,
  componentLabel,
  fallbackThumbnail,
  onClose,
}: {
  componentType: string;
  componentLabel: string;
  fallbackThumbnail?: string;
  onClose: () => void;
}) {
  const [guide, setGuide] = useState<ComponentGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [iconFailed, setIconFailed] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const candidates = useMemo(
    () => Array.from(new Set([slugify(componentLabel), slugify(componentType)].filter(Boolean))),
    [componentLabel, componentType]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setGuide(null);
    void fetchGuide(candidates, controller.signal)
      .then((value) => {
        setGuide(value);
        if (value?.sections[0]) setOpenSections(new Set([value.sections[0].id]));
      })
      .catch((reason) => {
        if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [candidates]);

  const iconUrl = fallbackThumbnail;

  return (
    <>
    <div className="fixed bottom-0 right-0 top-[112px] z-[250] flex w-[332px] flex-col border-l border-[#d5dbe2] bg-[#f1f2f4] text-[#344b65] shadow-[-8px_0_24px_rgba(31,45,61,0.16)]">
      <div className="sticky top-0 z-10 flex justify-between bg-[#f1f2f4] px-3 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#d6dce3] text-[#c4cbd3] hover:bg-white hover:text-[#607085]"
          aria-label="Close component information"
        >
          <X size={17} strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8">
        <div className="flex flex-col items-center pb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-md bg-white p-2 shadow-md">
            {iconUrl && !iconFailed ? (
              <img
                src={iconUrl}
                alt={componentLabel}
                className="h-full w-full object-contain"
                onError={() => setIconFailed(true)}
              />
            ) : (
              <Box size={38} />
            )}
          </div>
          <h2 className="mt-3 text-xl font-normal text-[#27415f]">{guide?.name || componentLabel}</h2>
        </div>

        {loading && <GlobalSkeleton variant="panel" rows={4} />}
        {!loading && !guide && (
          <div className="rounded-md bg-white p-4 text-center text-sm text-[#607085]">
            {error || `No information guide found for ${componentLabel}.`}
          </div>
        )}

        <div className="space-y-2">
          {guide?.sections.map((section) => {
            const isOpen = openSections.has(section.id);
            const mediaUrl = serverAssetUrl(section.mediaUrl);
            const mediaKind = getMediaKind(section.mediaUrl, section.mediaType);
            return (
              <section key={section.id}>
                <button
                  type="button"
                  onClick={() => setOpenSections((current) => {
                    const next = new Set(current);
                    if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                    return next;
                  })}
                  className="flex w-full items-center gap-2 rounded-md bg-white px-4 py-3 text-left text-lg shadow-sm hover:bg-[#fafbfc]"
                >
                  {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  <span>{section.title}</span>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 pt-3 text-[17px] leading-6">
                    {section.content && <p className="whitespace-pre-wrap">{section.content}</p>}
                    {mediaKind === 'IMAGE' && mediaUrl && (
                      <button
                        type="button"
                        onClick={() => setSelectedMedia({ kind: mediaKind, url: mediaUrl, title: section.title })}
                        className="mx-auto mt-4 block w-full rounded-md bg-white p-2 shadow-sm transition hover:ring-2 hover:ring-[#8ab7e8]"
                        title="Open image large"
                      >
                        <img src={mediaUrl} alt={section.title} className="max-h-30 w-full object-contain" />
                      </button>
                    )}
                    {mediaKind === 'VIDEO' && mediaUrl && (
                      <div className="mx-auto mt-4 overflow-hidden rounded-md bg-white shadow-sm">
                        <video
                          src={mediaUrl}
                          controls
                          preload="metadata"
                          onClick={() => setSelectedMedia({ kind: mediaKind, url: mediaUrl, title: section.title })}
                          className="max-h-72 w-full bg-black object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedMedia({ kind: mediaKind, url: mediaUrl, title: section.title })}
                          className="w-full border-t border-slate-100 px-4 py-2 text-sm text-[#3478e5] hover:bg-slate-50"
                        >
                          Open video large
                        </button>
                      </div>
                    )}
                    {mediaKind === 'MODEL_3D' && mediaUrl && (
                      <div className="mt-4 overflow-hidden rounded-md bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() => setSelectedMedia({ kind: mediaKind, url: mediaUrl, title: section.title })}
                          className="block h-56 w-full cursor-zoom-in"
                          title="Open 3D model large"
                        >
                          <Canvas camera={{ position: [2.5, 2, 3], fov: 45 }}>
                            <ambientLight intensity={1.6} />
                            <directionalLight position={[3, 4, 5]} intensity={2} />
                            <Suspense fallback={null}>
                              <GuideModel url={mediaUrl} />
                            </Suspense>
                            <OrbitControls enablePan={false} makeDefault />
                          </Canvas>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedMedia({ kind: mediaKind, url: mediaUrl, title: section.title })}
                          className="flex w-full items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm text-[#3478e5] hover:bg-slate-50"
                        >
                          <Box size={18} /> Open 3D model large <ExternalLink size={14} />
                        </button>
                      </div>
                    )}
                    {section.links.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {section.links.map((link) => (
                          <a key={`${section.id}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-[#3478e5] hover:underline">
                            <span>{link.label}</span><ExternalLink size={14} className="mt-1 shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
    {selectedMedia && <LargeMediaViewer media={selectedMedia} onClose={() => setSelectedMedia(null)} />}
    </>
  );
}
