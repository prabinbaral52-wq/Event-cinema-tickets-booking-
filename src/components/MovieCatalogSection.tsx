import React, { useEffect, useState } from 'react';
import { Film, ArrowRight } from 'lucide-react';
import { OFFICIAL_LOGO_PATH, VENUE_INFO } from '../data/cinemaCatalog';
import { HERO_HALL_IMAGE, MOVIE_POSTERS } from '../data/posterAssets';
import type { Movie, PortalStatus, ShowSummary } from '../types/cinema';

interface MovieCatalogSectionProps {
  movies: Movie[];
  shows: ShowSummary[];
  selectedShowId: string;
  portalStatus: PortalStatus;
  onSelectShow: (showId: string) => void;
  onScrollToSeats: () => void;
}

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export const MovieCatalogSection: React.FC<MovieCatalogSectionProps> = ({
  movies,
  shows,
  selectedShowId,
  portalStatus,
  onSelectShow,
  onScrollToSeats,
}) => {
  const [countdownMs, setCountdownMs] = useState(portalStatus.msUntilNextChange);
  const [languageFilter, setLanguageFilter] = useState<string>('all');

  useEffect(() => {
    setCountdownMs(portalStatus.msUntilNextChange);
    const timer = window.setInterval(() => {
      setCountdownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [portalStatus.msUntilNextChange]);

  const totalAvailableToday = shows.reduce((sum, s) => sum + s.availableCount, 0);
  const uniqueLanguages = Array.from(new Set(movies.map((m) => m.language)));

  const filteredMovies = movies.filter((m) => {
    if (languageFilter === 'all') return true;
    return m.language.toLowerCase().includes(languageFilter.toLowerCase());
  });

  return (
    <div id="top">
      {/* Dark-Mode Storefront Split Hero */}
      <section className="bg-[#0B1120] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            {/* Left Copy Column */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full border border-white/20 bg-white p-1 shrink-0 shadow-lg">
                  <img
                    src={OFFICIAL_LOGO_PATH}
                    alt="Event Cinema Gole Complex Seal"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
                <div className="text-sm text-slate-300">
                  <div className="font-semibold text-amber-400">
                    {VENUE_INFO.name} · {VENUE_INFO.complex}
                  </div>
                  <div className="text-slate-400">{VENUE_INFO.address}</div>
                </div>
              </div>

              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.1rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Real-Time Theater Seat Booking
              </h1>

              <p className="mt-4 text-base text-slate-300 leading-relaxed max-w-xl">
                Check available movies and reserve your exact seats at Event Cinema (Gole Complex) with live auditorium availability and instant digital e-tickets. No login required.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onScrollToSeats}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-400 text-[#070B14] text-sm font-semibold hover:bg-amber-300 transition-colors cursor-pointer min-h-[46px]"
                >
                  Open Seat Map
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#now-showing"
                  className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-amber-400 underline underline-offset-4 transition-colors min-h-[46px] inline-flex items-center"
                >
                  View Available Movies
                </a>
              </div>
            </div>

            {/* Right Auditorium Visual Column */}
            <div className="lg:col-span-6 relative rounded-2xl overflow-hidden bg-[#070B14] border border-white/10 min-h-[260px] lg:min-h-[380px]">
              <img
                src={HERO_HALL_IMAGE}
                alt="Event Cinema Gole Complex Auditorium Seating"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover lg:h-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#070B14]/25 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <div className="text-xs font-medium text-amber-400">
                  {VENUE_INFO.name} · {VENUE_INFO.complex}
                </div>
                <div className="font-display text-lg font-semibold mt-1">
                  96 Tiered Seats Per Screen · Live Availability
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Operational Strip Below Hero Split */}
          <div className="mt-10 pt-8 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs font-medium text-slate-400">Booking Hours</div>
              <div className="font-display text-lg font-semibold text-white mt-1">
                12:00 PM – 3:00 PM NST
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-400">
                {portalStatus.withinOperatingHours ? 'Closes In' : 'Opens In'}
              </div>
              <div className="font-mono text-lg font-semibold text-amber-400 tabular-nums mt-1">
                {formatDurationMs(countdownMs)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-400">Available Seats Today</div>
              <div className="font-mono text-lg font-semibold text-white tabular-nums mt-1">
                {shows.length > 0 ? `${totalAvailableToday} open` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-400">Checkout</div>
              <div className="font-display text-lg font-semibold text-emerald-400 mt-1">
                Guest · No Login
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Now Showing Movie Grid (Customer Read-Only View) */}
      <section id="now-showing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Now Showing · {portalStatus.nstDateFormatted}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {movies.length > 0
                ? 'Select a movie showtime below to view live seat availability and book tickets.'
                : 'No movies or showtimes are currently posted.'}
            </p>
          </div>

          {uniqueLanguages.length > 1 && (
            <div className="inline-flex items-center gap-1 p-1 bg-[#11192C] border border-white/10 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setLanguageFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                  languageFilter === 'all'
                    ? 'bg-amber-400 text-[#070B14] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                All
              </button>
              {uniqueLanguages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                    languageFilter === lang
                      ? 'bg-amber-400 text-[#070B14] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>

        {movies.length === 0 ? (
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-10 text-center">
            <Film className="w-9 h-9 text-slate-500 mx-auto mb-3" />
            <h3 className="font-display text-lg font-semibold text-white">
              No Movies Currently Scheduled
            </h3>
            <p className="text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
              Available movies and showtimes posted by Event Cinema (Gole Complex) will appear here automatically. Box Office: {VENUE_INFO.supportPhone}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredMovies.map((movie) => {
              const movieShows = shows
                .filter((s) => s.movieId === movie.id)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              const posterSrc = MOVIE_POSTERS[movie.id];
              const hours = Math.floor(movie.durationMinutes / 60);
              const mins = movie.durationMinutes % 60;

              return (
                <article
                  key={movie.id}
                  className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div>
                    <div className="aspect-[3/4] w-full bg-[#070B14] relative overflow-hidden">
                      {posterSrc ? (
                        <img
                          src={posterSrc}
                          alt={`${movie.title} poster`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/80 p-6 text-center bg-gradient-to-b from-[#0F172A] to-[#070B14]">
                          <Film className="w-10 h-10 mb-3 text-amber-400/70" />
                          <span className="font-display font-semibold text-base text-white">
                            {movie.title}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                        <span>{movie.language}</span>
                        <span aria-hidden="true">·</span>
                        <span>{hours}h {mins}m</span>
                        <span aria-hidden="true">·</span>
                        <span>{movie.rating}</span>
                      </div>

                      <h3 className="font-display text-lg font-bold text-white mt-1.5">
                        {movie.title}
                      </h3>

                      <div className="text-xs text-amber-400/90 mt-0.5">
                        {movie.genre} · {movie.format}
                      </div>

                      {movie.synopsis && (
                        <p className="text-sm text-slate-300 mt-3 line-clamp-3 leading-relaxed">
                          {movie.synopsis}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-3 border-t border-white/10">
                    <div className="text-xs font-medium text-slate-400 mb-2.5">
                      Available Showtimes
                    </div>
                    {movieShows.length === 0 ? (
                      <div className="text-xs text-slate-500 py-2">
                        No showtimes posted
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {movieShows.map((show) => {
                          const isSelected = show.id === selectedShowId;
                          const soldOut = show.availableCount === 0;
                          return (
                            <button
                              key={show.id}
                              type="button"
                              disabled={soldOut}
                              onClick={() => {
                                onSelectShow(show.id);
                                onScrollToSeats();
                              }}
                              className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer min-h-[44px] ${
                                isSelected
                                  ? 'bg-amber-400 border-amber-300 text-[#070B14]'
                                  : soldOut
                                  ? 'bg-white/5 border-white/5 text-slate-500 cursor-not-allowed'
                                  : 'bg-[#162038] border-white/10 text-white hover:border-amber-400/70'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-mono text-sm font-semibold tabular-nums">
                                  {show.timeLabel}
                                </div>
                                <div
                                  className={`text-[11px] truncate ${
                                    isSelected ? 'text-[#070B14]/80 font-medium' : 'text-slate-400'
                                  }`}
                                >
                                  {show.screenName}
                                </div>
                              </div>
                              <span
                                className={`font-mono text-xs tabular-nums whitespace-nowrap shrink-0 font-semibold ${
                                  isSelected
                                    ? 'text-[#070B14]'
                                    : soldOut
                                    ? 'text-slate-500'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {soldOut ? 'Full' : `${show.availableCount} open`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
