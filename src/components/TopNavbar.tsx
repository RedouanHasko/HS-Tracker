import React, { useState } from 'react';
import {
  Search,
  Bell,
  Globe,
  Sun,
  Moon,
  Plus,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  Settings,
  History,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { User } from 'firebase/auth';
import { HSLogo } from './HSLogo';
import { Language, Project } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMotionConfig } from '../utils/motionPresets';

export interface TopNavbarProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  user: User | null;
  /** Opens the sidebar drawer on mobile / when collapsed */
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  sidebarToggleLabel?: string;
  showSidebarToggle?: boolean;

  mode?: 'dashboard' | 'project';

  // Dashboard
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  createLabel?: string;
  onCreateProject?: () => void;
  unreadCount?: number;
  onToggleNotifications?: () => void;
  onToggleMobileMenu?: () => void;
  mobileMenuOpen?: boolean;
  langLabel?: string;

  // Project detail
  onBack?: () => void;
  backLabel?: string;
  projectTitle?: string;
  projectStatus?: Project['status'];
  statusLabel?: string;
  onOpenSettings?: () => void;
  settingsLabel?: string;
  onOpenActivityHistory?: () => void;
  activityHistoryLabel?: string;
}

/** Shared icon-button style for navbar actions */
function NavIconButton({
  onClick,
  title,
  children,
  className = '',
  active = false,
  'aria-expanded': ariaExpanded,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  'aria-expanded'?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-expanded={ariaExpanded}
      aria-label={title}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-all hover:border-slate-200 hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 ${
        active ? 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Sticky top navigation bar — full-width, glass effect, responsive.
 * Used on dashboard and project views for a consistent professional layout.
 */
export function TopNavbar({
  language,
  onLanguageChange,
  theme,
  onThemeToggle,
  user,
  onToggleSidebar,
  sidebarOpen = true,
  sidebarToggleLabel = 'Toggle sidebar',
  showSidebarToggle = true,
  mode = 'dashboard',
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  createLabel = 'New project',
  onCreateProject,
  unreadCount = 0,
  onToggleNotifications,
  onToggleMobileMenu,
  mobileMenuOpen = false,
  langLabel = 'Language',
  onBack,
  backLabel = 'Back',
  projectTitle,
  projectStatus,
  statusLabel,
  onOpenSettings,
  settingsLabel = 'Settings',
  onOpenActivityHistory,
  activityHistoryLabel = 'History',
}: TopNavbarProps) {
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const { dropdown, dropdownVariants, overlay, overlayVariants } = useMotionConfig();

  useEscapeToClose(showLanguageDropdown, () => setShowLanguageDropdown(false));

  const userInitial = user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U';

  const statusColors: Record<NonNullable<Project['status']>, string> = {
    planning: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
    on_hold: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-400',
  };

  return (
    <header className="navbar-sticky sticky top-0 z-50 w-full shrink-0 border-b border-slate-200/70 bg-white/90 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.06] dark:bg-slate-950/90 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        {/* Left: sidebar toggle + brand / back + title */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {showSidebarToggle && onToggleSidebar && (
            <NavIconButton
              onClick={onToggleSidebar}
              title={sidebarToggleLabel}
              active={sidebarOpen}
              className="shrink-0"
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </NavIconButton>
          )}

          {mode === 'project' && onBack ? (
            <>
              <button
                type="button"
                onClick={onBack}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{backLabel}</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex sm:hidden items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                title={backLabel}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {projectTitle && (
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{projectTitle}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2">
              <HSLogo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" compact />
              <span className="truncate font-display text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-lg">
                HS Tracker
              </span>
            </div>
          )}

          {mode === 'project' && projectStatus && statusLabel && (
            <span
              className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-flex ${statusColors[projectStatus]}`}
            >
              {statusLabel}
            </span>
          )}
        </div>

        {/* Center: search (dashboard, desktop) */}
        {mode === 'dashboard' && onSearchChange && (
          <div className="hidden max-w-md flex-1 lg:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-slate-200/80 bg-slate-50/80 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-sky-500/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:focus:bg-slate-900"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Mobile: notification bell (dashboard only — project mode has its own mobile toolbar) */}
          {mode === 'dashboard' && onToggleNotifications && (
            <NavIconButton
              onClick={onToggleNotifications}
              title="Notifications"
              className="lg:hidden"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
              )}
            </NavIconButton>
          )}

          {/* Mobile menu toggle */}
          {mode === 'dashboard' && onToggleMobileMenu && (
            <NavIconButton
              onClick={onToggleMobileMenu}
              title="Menu"
              active={mobileMenuOpen}
              className="lg:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </NavIconButton>
          )}

          {/* Desktop actions */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {mode === 'dashboard' && onSearchChange && null}

            {/* Language */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                title={langLabel}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                {language.toUpperCase()}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              <AnimatePresence>
                {showLanguageDropdown && (
                  <>
                    <motion.button
                      type="button"
                      variants={overlayVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={overlay}
                      className="fixed inset-0 z-40 bg-transparent transform-gpu"
                      onClick={() => setShowLanguageDropdown(false)}
                      aria-label="Close"
                      tabIndex={-1}
                    />
                    <motion.div
                      key="lang-menu"
                      variants={dropdownVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={dropdown}
                      className="panel-motion-gpu absolute right-0 z-50 mt-1.5 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                    >
                      {(['en', 'fr', 'ar'] as const).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            onLanguageChange(lang);
                            setShowLanguageDropdown(false);
                          }}
                          className={`block w-full px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                            language === lang
                              ? 'font-bold text-sky-600 dark:text-sky-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <NavIconButton onClick={onThemeToggle} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
              {theme === 'light' ? (
                <Moon className="h-[18px] w-[18px] text-slate-500" />
              ) : (
                <Sun className="h-[18px] w-[18px] text-amber-400" />
              )}
            </NavIconButton>

            {onToggleNotifications && (
              <NavIconButton onClick={onToggleNotifications} title="Notifications">
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </NavIconButton>
            )}

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
              title="Profile"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold uppercase text-white shadow-sm transition-all hover:bg-sky-500 active:scale-95"
            >
              {userInitial}
            </button>

            {mode === 'dashboard' && onCreateProject && (
              <button
                type="button"
                onClick={onCreateProject}
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                <span>{createLabel}</span>
              </button>
            )}

            {mode === 'project' && onOpenActivityHistory && (
              <button
                type="button"
                onClick={onOpenActivityHistory}
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition-all hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-950/60"
              >
                <History className="h-3.5 w-3.5" />
                <span>{activityHistoryLabel}</span>
              </button>
            )}

            {mode === 'project' && onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>{settingsLabel}</span>
              </button>
            )}
          </div>

          {/* Project mode: mobile profile + settings */}
          {mode === 'project' && (
            <div className="flex items-center gap-1 lg:hidden">
              {onToggleNotifications && (
                <NavIconButton onClick={onToggleNotifications} title="Notifications">
                  <Bell className="h-[18px] w-[18px]" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
                  )}
                </NavIconButton>
              )}
              <NavIconButton onClick={onThemeToggle} title="Theme">
                {theme === 'light' ? (
                  <Moon className="h-[18px] w-[18px]" />
                ) : (
                  <Sun className="h-[18px] w-[18px] text-amber-400" />
                )}
              </NavIconButton>
              {onOpenActivityHistory && (
                <NavIconButton onClick={onOpenActivityHistory} title={activityHistoryLabel}>
                  <History className="h-[18px] w-[18px] text-cyan-600 dark:text-cyan-400" />
                </NavIconButton>
              )}
              {onOpenSettings && (
                <NavIconButton onClick={onOpenSettings} title={settingsLabel}>
                  <Settings className="h-[18px] w-[18px]" />
                </NavIconButton>
              )}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open_profile_settings'))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold uppercase text-white"
              >
                {userInitial}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopNavbar;
