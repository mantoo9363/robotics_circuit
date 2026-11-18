'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  CheckCircle2,
  Code2,
  Cpu,
  Gauge,
  GraduationCap,
  Lightbulb,
  Pencil,
  Rocket,
  Save,
  Target,
  User,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { AUTH_TOKEN_KEY, getApiErrorMessage } from '@cs/lib/auth-client';
import { serverApiUrl } from '@cs/lib/server-api';

const AUTH_USER_KEY = 'circuit-studio-auth-user';

type StoredUser = {
  name?: string;
  email?: string;
  className?: string;
  classLevel?: string;
  profileImage?: string;
  role?: string;
  roles?: Array<{ name: string }>;
};

type ProfileForm = {
  name: string;
  email: string;
  className: string;
  profileImage: string;
};

type ProfileUpdateResponse = {
  ok?: boolean;
  error?: string;
  user?: StoredUser;
};

const cognitiveSkills = [
  { label: 'Recall & Recognize', score: 85, color: '#ef4444' },
  { label: 'Interpret & Explain', score: 80, color: '#10a9a5' },
  { label: 'Apply & Solve', score: 74, color: '#2563eb' },
  { label: 'Dissect & Examine', score: 71, color: '#54a24b' },
  { label: 'Judge & Justify', score: 62, color: '#f59e0b' },
  { label: 'Innovate', score: 68, color: '#6d3de8' },
];

const learningStyles = [
  { label: 'Visual Learner', score: 45, color: '#6d3de8' },
  { label: 'Kinesthetic Learner', score: 30, color: '#20a6b0' },
  { label: 'Auditory Learner', score: 15, color: '#f59e0b' },
  { label: 'Reading / Writing Learner', score: 10, color: '#4377d8' },
];

const interests = [
  { label: 'Robotics', score: 90, icon: Cpu, color: '#10a9a5' },
  { label: 'Coding', score: 85, icon: Code2, color: '#4aa85b' },
  { label: 'Design & 3D', score: 75, icon: BoxIcon, color: '#20a6b0' },
  { label: 'AI & ML', score: 60, icon: Brain, color: '#f59e0b' },
  { label: 'Electronics', score: 55, icon: Zap, color: '#eab308' },
];

const glanceItems: Array<{ label: string; value: string; icon: LucideIcon }> = [
  { label: 'Active Since', value: 'Jan 2024', icon: CalendarDays },
  { label: 'Total Activities', value: '126', icon: BookOpen },
  { label: 'Avg. Accuracy', value: '78%', icon: Target },
  { label: 'Time Spent Learning', value: '64 hrs', icon: Activity },
  { label: 'Last Active', value: 'Today', icon: CheckCircle2 },
];

const topicSpeeds = [
  { label: 'Robotics', value: 92, speed: 'Fast' },
  { label: 'Coding', value: 88, speed: 'Fast' },
  { label: 'Electronics', value: 62, speed: 'Moderate' },
  { label: 'Math', value: 60, speed: 'Moderate' },
  { label: 'Design', value: 85, speed: 'Fast' },
];

const mistakePatterns = [
  { label: 'Conceptual Understanding', value: 35, color: '#ef4444' },
  { label: 'Careless Errors', value: 25, color: '#f97316' },
  { label: 'Step Skipping', value: 20, color: '#eab308' },
  { label: 'Time Management', value: 10, color: '#22c55e' },
  { label: 'Overcomplicating Solutions', value: 10, color: '#3b82f6' },
];

const recommendations: Array<{ title: string; text: string; icon: LucideIcon; color: string }> = [
  {
    title: 'Strengthen Evaluation Skills',
    text: 'Try activities that compare options and justify solutions.',
    icon: GraduationCap,
    color: '#6d3de8',
  },
  {
    title: 'Improve Conceptual Clarity',
    text: 'Use mind maps and teach-back methods for each topic.',
    icon: BarChart3,
    color: '#4377d8',
  },
  {
    title: 'Recommended Path',
    text: 'Robotics Engineer / Product Designer / AI Developer.',
    icon: Rocket,
    color: '#10a9a5',
  },
];

function BoxIcon({ size = 22, className = '' }: { size?: number; className?: string }) {
  return <Cpu size={size} className={className} />;
}

function ScoreRing({ score, size = 152 }: { score: number; size?: number }) {
  const stroke = Math.max(11, Math.round(size * 0.085));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e9f4" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6d3de8"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-black leading-none text-[#6d3de8]" style={{ fontSize: Math.round(size * 0.24) }}>{score}%</div>
        <div className="mt-1 text-xs font-black text-[#526070]">Strong Learner</div>
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <span className="text-sm font-black text-black">{index}.</span>
      <h2 className="text-base font-black text-black">{title}</h2>
    </div>
  );
}

function ProgressBar({ value, color = '#006aa0' }: { value: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-[#e5e9f0]">
      <div className="h-2 rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: '',
    email: '',
    className: '',
    profileImage: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const rawUser = window.localStorage.getItem(AUTH_USER_KEY);
    let storedUser: StoredUser | null = null;
    try {
      storedUser = rawUser ? JSON.parse(rawUser) as StoredUser : null;
      if (storedUser) setUser(storedUser);
    } catch {
      window.localStorage.removeItem(AUTH_USER_KEY);
    }

    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    void fetch(serverApiUrl('/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as ProfileUpdateResponse | null;
        if (!response.ok || !data?.user) return;

        const freshUser: StoredUser = {
          ...data.user,
          profileImage: storedUser?.profileImage,
        };
        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(freshUser));
        window.dispatchEvent(new Event('circuit-studio-auth-user-updated'));
        setUser(freshUser);
      })
      .catch(() => undefined);
  }, []);

  const displayName = user?.name || user?.email?.split('@')[0] || 'Learner';
  const displayEmail = user?.email || 'learner@studio';
  const roleLabel = user?.roles?.[0]?.name || user?.role || 'Student';
  const classLabel = user?.className || user?.classLevel || 'Class 6';
  const profileImage = user?.profileImage || '';
  const initials = useMemo(
    () =>
      displayName
        .split(/\s|@cs/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'L',
    [displayName],
  );

  useEffect(() => {
    setProfileForm({
      name: displayName,
      email: user?.email || '',
      className: classLabel,
      profileImage,
    });
  }, [classLabel, displayName, profileImage, user?.email]);

  function updateProfileField(field: keyof ProfileForm, value: string) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function handleProfileImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateProfileField('profileImage', reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileError('');

    try {
      const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
      const response = await fetch(serverApiUrl('/auth/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: profileForm.name.trim() || displayName,
          email: profileForm.email.trim() || user?.email,
          classLevel: profileForm.className.trim() || classLabel,
        }),
      });
      const data = (await response.json().catch(() => null)) as ProfileUpdateResponse | null;

      if (!response.ok || !data?.user) {
        throw new Error(getApiErrorMessage(data, 'Failed to update profile.'));
      }

      const updatedUser: StoredUser = {
        ...data.user,
        className: data.user.classLevel || profileForm.className.trim() || classLabel,
        profileImage: profileForm.profileImage,
      };

      window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('circuit-studio-auth-user-updated'));
      setUser(updatedUser);
      setEditing(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <DashboardShell>
      <div className="w-full px-5 py-6 lg:px-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-black tracking-[0] text-[#101828]">
              Learner Profile Dashboard
            </h1>
            <p className="mt-1 text-sm font-semibold text-[#526070]">A 360 degree view of your learning DNA</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              className="flex h-11 items-center gap-2 rounded-lg bg-[#006aa0] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#005a8a]"
            >
              {editing ? <X size={18} /> : <Pencil size={18} />}
              {editing ? 'Close Update' : 'Update Profile'}
            </button>
            <div className="flex items-center gap-3 rounded-lg border border-[#d8e3ec] bg-white px-4 py-3 shadow-sm">
              <CalendarDays size={22} className="text-[#006aa0]" />
              <div>
                <div className="text-xs font-bold text-[#667789]">Profile Generated On</div>
                <div className="text-sm font-black text-[#101828]">23 Jun 2026</div>
              </div>
            </div>
          </div>
        </div>

        {editing ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0f172a]/55 px-4 py-6">
            <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d8e3ec] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#e5edf3] px-5 py-4">
                <div className="flex items-center gap-2">
                  <User size={20} className="text-[#006aa0]" />
                  <h2 className="text-base font-black text-[#101828]">Update Profile</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#526070] transition hover:bg-[#eef5fa] hover:text-[#006aa0]"
                  title="Close"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="p-5">
                <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg bg-[#f8fbfd] p-4">
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e9f5fb] text-3xl font-black text-[#006aa0] shadow-sm">
                    {profileForm.profileImage ? (
                      <img src={profileForm.profileImage} alt="Profile preview" className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#006aa0] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#005a8a]">
                      <Camera size={18} />
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageChange}
                        className="sr-only"
                      />
                    </label>
                    
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-bold text-[#34495e]">
                    Name
                    <input
                      value={profileForm.name}
                      onChange={(event) => updateProfileField('name', event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-[#cfdbe5] px-3 text-sm font-semibold outline-none transition focus:border-[#006aa0] focus:ring-2 focus:ring-[#006aa0]/15"
                      placeholder="Your name"
                    />
                  </label>
                  <label className="text-sm font-bold text-[#34495e]">
                    Email
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => updateProfileField('email', event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-[#cfdbe5] px-3 text-sm font-semibold outline-none transition focus:border-[#006aa0] focus:ring-2 focus:ring-[#006aa0]/15"
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="text-sm font-bold text-[#34495e]">
                    Class
                    <input
                      value={profileForm.className}
                      onChange={(event) => updateProfileField('className', event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-[#cfdbe5] px-3 text-sm font-semibold outline-none transition focus:border-[#006aa0] focus:ring-2 focus:ring-[#006aa0]/15"
                      placeholder="Class 6"
                    />
                  </label>
                </div>

                {profileError ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {profileError}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex h-11 items-center gap-2 rounded-lg border border-[#cfdbe5] bg-white px-4 text-sm font-black text-[#34495e] transition hover:bg-[#f8fbfd]"
                  >
                    <X size={18} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="flex h-11 items-center gap-2 rounded-lg bg-[#101828] px-4 text-sm font-black text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={18} />
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_245px]">
          <aside className="space-y-5">
            <div className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
              <div className="bg-[linear-gradient(135deg,#27218d,#7b3df2)] p-5 text-white">
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white/80 bg-[#e9f5fb] text-3xl font-black text-[#006aa0]">
                    {profileImage ? (
                      <img src={profileImage} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-black">{displayName}</h2>
                    <p className="mt-1 text-sm font-bold text-white/85">{roleLabel}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-white/75">{displayEmail}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-white/75">{classLabel}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 text-center">
                <div className="mb-3 text-sm font-black text-black">Overall Learner Score</div>
                <ScoreRing score={72} size={150} />
                <div className="mt-5 grid grid-cols-6 items-end gap-2 border-t border-[#eef2f5] pt-5">
                  {[28, 42, 54, 68, 74, 84].map((value, index) => (
                    <div key={index} className="flex flex-col items-center gap-2">
                      <div className="flex w-full items-end rounded-full bg-[#ece8ff]" style={{ height: 54 }}>
                        <div className="w-full rounded-full bg-[#6d3de8]" style={{ height: `${value}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-[#667789]">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][index]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Card>
              <h2 className="mb-4 text-base font-black text-black">At a Glance</h2>
              {glanceItems.map(({ label, value, icon: Icon }) => (
                <div key={label} className="mb-4 flex items-center justify-between gap-3 last:mb-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#e9f5fb] text-[#006aa0]">
                      <Icon size={17} />
                    </span>
                    <span className="text-sm font-semibold text-[#526070]">{label}</span>
                  </div>
                  <span className="text-sm font-black text-black">{value}</span>
                </div>
              ))}
            </Card>
          </aside>

          <main className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionTitle index="1" title="Cognitive Profile" />
              <div className="grid gap-4 sm:grid-cols-2">
                {cognitiveSkills.map((skill) => (
                  <div key={skill.label} className="rounded-lg bg-[#f8fbfd] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-black">{skill.label}</span>
                      <span className="text-sm font-black" style={{ color: skill.color }}>{skill.score}%</span>
                    </div>
                    <ProgressBar value={skill.score} color={skill.color} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3 rounded-lg bg-[#f3efff] p-4">
                <Brain size={24} className="shrink-0 text-[#6d3de8]" />
                <p className="text-sm font-semibold leading-6 text-[#34495e]">
                  Strong in understanding and applying concepts. Keep building skills in evaluation and innovation.
                </p>
              </div>
            </Card>

            <Card>
              <SectionTitle index="2" title="Learning Style" />
              <div className="grid gap-5 md:grid-cols-[145px_1fr] md:items-center">
                <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[22px] border-[#6d3de8] bg-white text-[#6d3de8] shadow-inner">
                  <Brain size={38} />
                </div>
                <div className="space-y-4">
                  {learningStyles.map((style) => (
                    <div key={style.label}>
                      <div className="mb-1 flex justify-between gap-2 text-xs font-black text-[#526070]">
                        <span>{style.label}</span>
                        <span>{style.score}%</span>
                      </div>
                      <ProgressBar value={style.score} color={style.color} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex gap-3 rounded-lg bg-[#f3efff] p-4">
                <Lightbulb size={24} className="shrink-0 text-[#6d3de8]" />
                <p className="text-sm font-semibold leading-6 text-[#34495e]">
                  You learn best through visual materials and hands-on activities. Use diagrams, videos, and examples.
                </p>
              </div>
            </Card>

            <Card>
              <SectionTitle index="3" title="Speed of Learning" />
              <div className="grid gap-5 xl:grid-cols-[145px_minmax(0,1fr)]">
                <div className="flex flex-col items-center justify-center rounded-lg bg-[#f8fbfd] p-4">
                  <Gauge size={56} className="text-[#006aa0]" />
                  <div className="mt-3 text-base font-black text-black">Fast Learner</div>
                  <p className="mt-1 text-center text-xs font-semibold text-[#667789]">Faster than 72% of learners</p>
                </div>
                <div className="space-y-3">
                  {topicSpeeds.map(({ label, value, speed }) => (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate font-black text-[#526070]">{label}</span>
                        <span className="shrink-0 font-bold text-[#667789]">{speed}</span>
                      </div>
                      <ProgressBar value={value} color={value > 80 ? '#4aa85b' : '#f59e0b'} />
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle index="4" title="Mistake Patterns" />
              <div className="space-y-3">
                {mistakePatterns.map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between gap-2 text-xs font-black text-[#526070]">
                      <span>{label}</span>
                      <span>{value}%</span>
                    </div>
                    <ProgressBar value={value} color={color} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3 rounded-lg bg-red-50 p-4">
                <Target size={24} className="shrink-0 text-red-500" />
                <p className="text-sm font-semibold leading-6 text-[#34495e]">
                  Focus on deep understanding and reviewing steps carefully. Practice structured problem-solving.
                </p>
              </div>
            </Card>

          </main>

          <aside className="space-y-5">
            <Card className="text-center">
              <h2 className="mb-4 text-left text-base font-black text-black">Overall Summary</h2>
              <ScoreRing score={72} size={132} />
              <div className="mt-3 text-lg font-black text-black">Strong Learner</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#667789]">
                You are a curious learner with strong problem-solving abilities and a creative mindset.
              </p>
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-black text-black">Next Steps</h2>
              {[
                'Take up advanced projects in robotics and coding',
                'Practice real-world problem statements',
                'Work on evaluation and decision-making activities',
                'Collaborate in team projects to enhance learning',
              ].map((step) => (
                <div key={step} className="mb-4 flex gap-3 last:mb-0">
                  <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#1f7a37]" />
                  <p className="text-sm font-semibold leading-5 text-[#526070]">{step}</p>
                </div>
              ))}
            </Card>
          </aside>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Card>
            <SectionTitle index="5" title="Interest Areas" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {interests.map(({ label, score, icon: Icon, color }) => (
                <div key={label} className="rounded-lg bg-[#f8fbfd] p-4 text-center">
                  <Icon size={34} className="mx-auto text-[#006aa0]" />
                  <div className="mt-2 text-sm font-black text-black">{label}</div>
                  <div className="mt-1 text-lg font-black" style={{ color }}>{score}%</div>
                  <ProgressBar value={score} color={color} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle index="6" title="Personalized Recommendations" />
            <div className="grid gap-3 md:grid-cols-3">
              {recommendations.map(({ title, text, icon: Icon, color }) => (
                <div key={title} className="rounded-lg border border-[#e5edf3] bg-[#f8fbfd] p-4">
                  <Icon size={28} style={{ color }} />
                  <div className="mt-3 text-sm font-black text-black">{title}</div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#667789]">{text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
