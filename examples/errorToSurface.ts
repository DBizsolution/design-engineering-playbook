/**
 * Where does a message go?
 *
 * No linter can catch this one, and it is the decision a ticket will make for
 * you if you let it. A ticket's error-handling table says WHAT to say. It has
 * no authority over WHERE it goes, and the person who wrote it was describing
 * one screen, not designing a system. Decide it per ticket and you end up with
 * two languages for the same sentence in one product.
 *
 * FOUR SURFACES. Ask in order, stop at the first yes.
 *
 *   1. Nothing to show?          The page could not load its subject at all, so
 *                                there is no content for a message to sit beside.
 *                                Full-page empty state with one retry.
 *
 *   2. One specific value wrong? Inline, at that value. Only the field knows
 *                                where the user has to go. A page-level banner
 *                                saying "the form has errors" makes them hunt.
 *
 *   3. Still true while they     A standing condition of the page: showing
 *      are looking at it?        cached data, a write that has not landed,
 *                                read-only mode, a degraded integration. A
 *                                persistent banner. It persists because the
 *                                condition does.
 *
 *   4. Is it over?               Nothing to decide, nothing still broken, and
 *                                the result is already visible behind it.
 *                                A toast. It leaves because the thing it
 *                                reports has already finished.
 *
 * FOUR TIE-BREAKERS, each of which exists because it was got wrong once.
 *
 *   - If the condition outlives four seconds, it cannot be a toast. A message
 *     you dismiss by waiting must never be the only record of something still
 *     wrong. This is the one that breaks most often, and always in the same
 *     shape: "You are offline, showing saved data" is a condition, not an event.
 *
 *   - A toast carries no recovery action. An action on a timer is a race, and a
 *     user who loses it has lost the only route out. Undo is the exception and
 *     the only one: it reverses something that completed, so letting the timer
 *     run out is itself a valid answer.
 *
 *   - An action goes where there is one to offer, and exactly once. If the page
 *     already carries the control that would retry (a Save button, a Sync now),
 *     the banner states the reason and offers nothing. Two controls for one
 *     action read as two different actions.
 *
 *   - The same claim takes the same surface everywhere. Whatever surface a class
 *     of message gets, it keeps product-wide.
 *
 * THE RETURN TYPE IS THE POINT. This returns a surface and a message KEY, never
 * a resolved string. Three consequences:
 *   - it is testable without i18n loaded;
 *   - translation stays in exactly one place;
 *   - a caller cannot sneak a hardcoded English sentence past the copy gate.
 */

export type Surface = 'page' | 'inline' | 'banner' | 'toast'

export type SurfaceDecision = {
  surface: Surface
  /** Locale key. Never a resolved string. */
  key: string
  /** For 'inline': which field the message belongs to. */
  field?: string
  /** For 'banner': how loud. 'notice' qualifies what is on screen; 'warning' is a standing problem. */
  tone?: 'notice' | 'warning'
  /**
   * An action the surface may offer. Absent means the surface offers none,
   * which is correct whenever the page already carries the control.
   */
  action?: { key: string; kind: 'retry' | 'undo' | 'navigate' }
}

/**
 * The application's error vocabulary. Keep this a closed union: an open
 * `string` kind means the switch below can silently fall through to the default
 * for a case nobody considered, which is how a validation error ends up as a
 * toast.
 */
export type AppError =
  | { kind: 'load_failed'; entity: string }
  | { kind: 'not_found'; entity: string }
  | { kind: 'forbidden'; entity: string }
  | { kind: 'validation'; field: string; code: string }
  | { kind: 'conflict'; field?: string }
  | { kind: 'offline' }
  | { kind: 'stale'; since: string }
  | { kind: 'read_only'; reason: 'plan' | 'permission' | 'maintenance' }
  | { kind: 'write_queued' }
  | { kind: 'quota_exceeded'; limit: string }
  | { kind: 'saved' }
  | { kind: 'deleted'; undoable: boolean }
  | { kind: 'unknown' }

/**
 * Context the page can pass in, so the classifier can apply the tie-breakers
 * rather than leaving them to each caller.
 */
export type SurfaceContext = {
  /**
   * True when the page already renders the control that would retry: a Save
   * button, a Sync now, a form submit. The banner then states the reason and
   * offers no action of its own.
   */
  pageHasRetryControl?: boolean
  /** True when the page has no content to show behind a message. */
  pageIsEmpty?: boolean
}

export function errorToSurface(error: AppError, ctx: SurfaceContext = {}): SurfaceDecision {
  switch (error.kind) {
    // ---- 1. Nothing to show ------------------------------------------------
    case 'load_failed':
      return ctx.pageIsEmpty !== false
        ? { surface: 'page', key: `errors.loadFailed.${error.entity}`, action: { key: 'actions.retry', kind: 'retry' } }
        : // Content is already on screen, so the failure is a caveat about it,
          // not a replacement for it.
          { surface: 'banner', tone: 'warning', key: 'errors.refreshFailed' }

    case 'not_found':
      return { surface: 'page', key: `errors.notFound.${error.entity}`, action: { key: 'actions.back', kind: 'navigate' } }

    // ---- 2. One specific value ---------------------------------------------
    case 'validation':
      return { surface: 'inline', key: `errors.validation.${error.code}`, field: error.field }

    case 'conflict':
      // A conflict on a known field belongs at that field. Without one, it is a
      // standing condition of the whole record.
      return error.field
        ? { surface: 'inline', key: 'errors.conflict.field', field: error.field }
        : { surface: 'banner', tone: 'warning', key: 'errors.conflict.record', action: { key: 'actions.reload', kind: 'retry' } }

    case 'quota_exceeded':
      return { surface: 'inline', key: 'errors.quota', field: error.limit }

    // ---- 3. Still true while they look at it -------------------------------
    // Every one of these outlives four seconds, so none of them can be a toast.
    case 'offline':
      return { surface: 'banner', tone: 'warning', key: 'offline.banner' }

    case 'stale':
      // Deliberately a different key family from offline. Offline is a fact
      // about the device, identical everywhere and known for certain. Stale is a
      // fact about the data and can be true at full signal, because a refresh
      // failed or someone else wrote the record. Show "You are offline" to a
      // user with four bars and they stop reading banners.
      return { surface: 'banner', tone: 'notice', key: 'stale.banner' }

    case 'read_only':
      return { surface: 'banner', tone: 'notice', key: `readOnly.${error.reason}` }

    case 'write_queued':
      return { surface: 'banner', tone: 'notice', key: 'sync.queued' }

    case 'forbidden':
      return { surface: 'banner', tone: 'warning', key: `errors.forbidden.${error.entity}` }

    // ---- 4. It is over -----------------------------------------------------
    case 'saved':
      return { surface: 'toast', key: 'save.done' }

    case 'deleted':
      // Undo is the one action a toast may carry: it reverses something that
      // completed, so letting the timer expire is itself a valid answer.
      return error.undoable
        ? { surface: 'toast', key: 'delete.done', action: { key: 'actions.undo', kind: 'undo' } }
        : { surface: 'toast', key: 'delete.done' }

    // ---- Default -----------------------------------------------------------
    case 'unknown':
    default:
      return { surface: 'banner', tone: 'warning', key: 'errors.unknown', action: { key: 'actions.retry', kind: 'retry' } }
  }
}

/**
 * Applies the "exactly once" tie-breaker. Call this rather than reading
 * `decision.action` directly: if the page already carries the control that
 * would retry, the banner must state the reason and offer nothing.
 */
export function actionFor(decision: SurfaceDecision, ctx: SurfaceContext): SurfaceDecision['action'] {
  if (!decision.action) return undefined
  if (decision.action.kind === 'undo') return decision.action
  if (ctx.pageHasRetryControl && decision.surface === 'banner') return undefined
  return decision.action
}
