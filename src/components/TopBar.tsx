import React from 'react';
import { OFFICIAL_LOGO_PATH } from '../data/cinemaCatalog';

interface TopBarProps {
  onNavigateSection: (sectionId: string) => void;
  onOpenLookup: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onNavigateSection,
  onOpenLookup,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0B1120]/95 backdrop-blur-md border-b border-white/10 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6 sm:gap-8">
        {/* Zone 1: Official Logo + Single-line Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onNavigateSection('top');
          }}
          className="flex items-center gap-3 whitespace-nowrap shrink-0"
        >
          <img
            src={OFFICIAL_LOGO_PATH}
            alt="Event Cinema Gole Complex Logo"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full bg-white p-0.5 object-contain shrink-0"
          />
          <span className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
            Event Cinema (Gole Complex)
          </span>
        </a>

        {/* Zone 2: 4 concise single-line customer nav links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => onNavigateSection('now-showing')}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Now Showing
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('seat-booking')}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Seat Map
          </button>
          <button
            type="button"
            onClick={onOpenLookup}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Find Ticket
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('venue-info')}
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Venue Info
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('seat-booking')}
            className="px-4 py-2 text-sm font-semibold text-[#070B14] bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
          >
            Book Tickets
          </button>
        </div>
      </div>
    </header>
  );
};
