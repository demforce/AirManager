import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatDateTime, formatTimeOfDay } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import {
  getOwnInstructorProfileId,
  listActiveInstructors,
  listBookableAircraft,
  listBookableStudents,
  listBookings,
} from '@/server/services/bookings.service';
import { listPeople } from '@/server/services/people.service';
import { NewBookingForm, type AircraftOption, type InstructorOption, type NewBookingFormMode, type PersonOption } from './new-booking-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** Staff/instructor picker candidate cap — same "small admin-managed list" convention as `flights/page.tsx`'s `OPTIONS_PAGE_SIZE`. */
const OPTIONS_PAGE_SIZE = 100;

/** "Prossime prenotazioni" page size. */
const BOOKINGS_PAGE_SIZE = 20;

/**
 * Aircraft bookings (epic 7, story 7.1; FR-18) — Task 5. Gate:
 * `bookings.manage.own` OR `bookings.manage.any` OR `self.read` (in practice
 * every authenticated actor, Contesto: "la pagina serve anche la lista",
 * FR-19 anticipated to its minimum). `canCreate` (either `bookings.manage.*`
 * permission) decides whether the "Nuova prenotazione" form renders at all;
 * within that, `formMode` picks the SHAPE of the form (AD-5: only what to
 * RENDER — `bookings.service.ts#createBooking` is the real guardian
 * regardless of what this page decides to show):
 *
 * - `staff` (`bookings.manage.any`): free person + optional instructor picker.
 * - `instructor` (`bookings.manage.own` AND an active own `InstructorProfile`,
 *   `getOwnInstructorProfileId`): "per me" / "per un allievo" toggle.
 * - `pilot` (`bookings.manage.own`, no active own instructor profile): books
 *   for self only, no picker at all.
 *
 * The "Prossime prenotazioni" table (`listBookings({ from: now })`) stays a
 * PLAIN server read (AD-1, pattern `expiries/page.tsx`'s dashboard table) —
 * the form is the only client-interactive piece, and its `router.refresh()`
 * on success is what makes a freshly created booking show up here.
 */
export default async function BookingsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const canManageAny = hasPermission(actor, 'bookings.manage.any');
  const canManageOwn = hasPermission(actor, 'bookings.manage.own');
  if (!canManageAny && !canManageOwn && !hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const canCreate = canManageAny || canManageOwn;

  let formMode: NewBookingFormMode = 'pilot';
  let aircraftOptions: AircraftOption[] = [];
  let personOptions: PersonOption[] = [];
  let instructorOptions: InstructorOption[] = [];
  let studentOptions: PersonOption[] = [];
  let ownInstructorProfileId: string | null = null;

  if (canCreate) {
    aircraftOptions = await listBookableAircraft(actor);

    if (canManageAny) {
      formMode = 'staff';
      const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
      personOptions = peopleResult.items
        .filter((person) => person.archivedAt === null && (person.profiles.pilot || person.profiles.student || person.profiles.instructor))
        .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
      instructorOptions = await listActiveInstructors(actor);
    } else {
      ownInstructorProfileId = await getOwnInstructorProfileId(actor);
      if (ownInstructorProfileId) {
        formMode = 'instructor';
        studentOptions = await listBookableStudents(actor);
      } else {
        formMode = 'pilot';
      }
    }
  }

  const nowIso = new Date().toISOString();
  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  let bookingsResult = await listBookings(actor, { from: nowIso, pageSize: BOOKINGS_PAGE_SIZE, page });
  // Clamp an out-of-range ?page to the last real page (same pattern as `FlightsPage`).
  const lastPage = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    bookingsResult = await listBookings(actor, { from: nowIso, pageSize: BOOKINGS_PAGE_SIZE, page });
  }
  const totalPages = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/bookings', query: { page: targetPage } };
  }

  const t = await getTranslations('BookingsPage');
  const dateLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">{t('title')}</h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{t('description')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        {canCreate ? (
          <div className="mt-10">
            <NewBookingForm
              mode={formMode}
              aircraftOptions={aircraftOptions}
              personOptions={personOptions}
              instructorOptions={instructorOptions}
              studentOptions={studentOptions}
              ownPersonId={actor.personId}
              ownInstructorProfileId={ownInstructorProfileId}
              labels={{
                title: t('form.title'),
                selectPlaceholder: t('form.selectPlaceholder'),
                aircraft: t('form.aircraft'),
                outOfServiceSuffix: t.raw('form.outOfServiceSuffix') as string,
                person: t('form.person'),
                noPersonAvailable: t('form.noPersonAvailable'),
                instructorOptional: t('form.instructorOptional'),
                noInstructor: t('form.noInstructor'),
                bookingTarget: t('form.bookingTarget'),
                bookForMe: t('form.bookForMe'),
                bookForStudent: t('form.bookForStudent'),
                student: t('form.student'),
                noStudentAvailable: t('form.noStudentAvailable'),
                startsAt: t('form.startsAt'),
                endsAt: t('form.endsAt'),
                notes: t('form.notes'),
                submit: t('form.submit'),
                requiredField: t('form.requiredField'),
                invalidRange: t('form.invalidRange'),
                errors: {
                  AIRCRAFT_OUT_OF_SERVICE: t.raw('form.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
                  BOOKING_IN_PAST: t('form.errors.BOOKING_IN_PAST'),
                  PERSON_NOT_BOOKABLE: t('form.errors.PERSON_NOT_BOOKABLE'),
                  overlap: t('form.errors.overlap'),
                  generic: t('form.errors.generic'),
                },
                success: t('form.success'),
              }}
            />
          </div>
        ) : null}

        <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="bookings-list-section">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{t('list.heading')}</h2>
          <p className="mt-1 text-sm text-[#787774]">{t('list.description')}</p>

          <div className="mt-6 overflow-x-auto rounded-[12px] border border-[#EAEAEA]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
                  <th className="px-5 py-3">{t('list.table.aircraft')}</th>
                  <th className="px-5 py-3">{t('list.table.date')}</th>
                  <th className="px-5 py-3">{t('list.table.time')}</th>
                  <th className="px-5 py-3">{t('list.table.person')}</th>
                  <th className="px-5 py-3">{t('list.table.instructor')}</th>
                </tr>
              </thead>
              <tbody>
                {bookingsResult.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[#787774]">
                      {t('list.empty')}
                    </td>
                  </tr>
                ) : (
                  bookingsResult.items.map((booking) => {
                    const startsAt = new Date(booking.startsAt);
                    const endsAt = new Date(booking.endsAt);
                    return (
                      <tr key={booking.id} className="border-b border-[#EAEAEA] last:border-b-0" data-testid="booking-row">
                        <td className="px-5 py-3 align-middle font-medium text-[#111111]">{booking.aircraftRegistration}</td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-[#2F3437]">
                          {/* `formatDateTime` is "DD/MM/YYYY, HH:MM" (Intl's it-IT/en-IE locale separator) — split on the comma, not a bare space. */}
                          {formatDateTime(startsAt, dateLocale).split(',')[0]}
                        </td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-[#2F3437]">
                          {formatTimeOfDay(startsAt, dateLocale)}–{formatTimeOfDay(endsAt, dateLocale)}
                        </td>
                        <td className="px-5 py-3 align-middle text-[#2F3437]">{booking.personName}</td>
                        <td className="px-5 py-3 align-middle text-[#787774]">{booking.instructorName ?? t('list.table.noInstructor')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]">
              <Link
                href={pageHref(page - 1)}
                locale={locale as AppLocale}
                aria-disabled={page <= 1}
                className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                  page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                }`}
              >
                &larr;
              </Link>
              <span data-testid="booking-pagination-status">
                {page} / {totalPages}
              </span>
              <Link
                href={pageHref(page + 1)}
                locale={locale as AppLocale}
                aria-disabled={page >= totalPages}
                className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                  page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                }`}
              >
                &rarr;
              </Link>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
