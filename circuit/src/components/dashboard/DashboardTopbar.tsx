'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LayoutDashboard, LogIn, LogOut, Search, User } from 'lucide-react';

const AUTH_TOKEN_KEY = 'circuit-studio-auth-token';
const AUTH_USER_KEY = 'circuit-studio-auth-user';

type StoredUser = {
  name?: string;
  email?: string;
  profileImage?: string;
  role?: string;
  roles?: Array<{ name: string }>;
};

export function DashboardTopbar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function loadUser() {
      const rawUser = window.localStorage.getItem(AUTH_USER_KEY);
      if (!rawUser) {
        setUser(null);
        return;
      }

      try {
        setUser(JSON.parse(rawUser) as StoredUser);
      } catch {
        window.localStorage.removeItem(AUTH_USER_KEY);
        setUser(null);
      }
    }

    loadUser();
    window.addEventListener('circuit-studio-auth-user-updated', loadUser);
    return () => window.removeEventListener('circuit-studio-auth-user-updated', loadUser);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user?.name || user?.email || 'Guest';
  const displayEmail = user?.email || 'Not logged in';
  const profileImage = user?.profileImage || '';
  const roleLabel = user?.roles?.[0]?.name || user?.role || 'User';
  const initials = displayName
    .split(/\s|@cs/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  function handleLogout() {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
    setDropdownOpen(false);
    window.location.href = '/curcuit';
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-[150] flex h-[62px] items-center bg-[#006aa0] px-12 text-white shadow-md">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/16">
          <LayoutDashboard size={20} />
        </span>
        <span className="text-2xl font-bold">Studio</span>
      </Link>

      <div className="mx-auto flex h-8 w-[250px] items-center rounded-full bg-white/16 px-4 text-[#cbe7f8]">
        <Search size={18} />
        <input
          className="ml-2 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-[#cbe7f8]"
          placeholder="Search projects..."
        />
      </div>

      <a
        href="/curcuit"
        className="mr-7 flex h-8 min-w-[92px] items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-[#005a95] shadow-sm"
      >
        Create
      </a>
      <Bell size={20} className="mr-7" />
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen((open) => !open)}
          className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1 pl-1 pr-2 transition hover:bg-white/20"
          title="User profile"
        >
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-[linear-gradient(135deg,#e2f2ff,#124766)] text-xs font-black shadow-inner">
            {profileImage ? <img src={profileImage} alt={displayName} className="h-full w-full object-cover" /> : initials}
          </span>
          <ChevronDown size={16} className={dropdownOpen ? 'rotate-180 transition' : 'transition'} />
        </button>

        {dropdownOpen ? (
          <div className="absolute right-0 top-12 w-72 overflow-hidden rounded-2xl border border-[#d8e5ed] bg-white text-[#0f172a] shadow-2xl shadow-black/20">
            <div className="border-b border-[#e2e8f0] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#005a95] text-sm font-black text-white">
                  {profileImage ? <img src={profileImage} alt={displayName} className="h-full w-full object-cover" /> : initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{displayName}</div>
                  <div className="truncate text-xs font-semibold text-[#64748b]">{displayEmail}</div>
                </div>
              </div>
              <div className="mt-3 inline-flex rounded-full bg-[#eaf5fb] px-3 py-1 text-xs font-bold text-[#005a95]">
                {roleLabel}
              </div>
            </div>

            <Link
              href="/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold transition hover:bg-[#f1f5f9]"
            >
              <User size={18} className="text-[#005a95]" />
              My Profile
            </Link>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-red-600 transition hover:bg-red-50"
              >
                <LogOut size={18} />
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-[#005a95] transition hover:bg-[#f1f5f9]"
              >
                <LogIn size={18} />
                Login
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
