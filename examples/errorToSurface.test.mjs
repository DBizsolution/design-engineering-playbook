/**
 * Tests for the surface classifier.
 *
 * These are not really unit tests of a function. They are the tie-breakers from
 * chapter 5 written down as assertions, which is what stops the rules eroding
 * one pull request at a time. When someone argues that a particular offline
 * message "should just be a toast", the argument is with a failing test rather
 * than with a person.
 *
 * Run:  node --experimental-strip-types --test examples/errorToSurface.test.mjs
 *
 * Node 22+ strips the types and runs the .ts directly, so there is no build
 * step. In your own project, import from wherever the classifier lives and run
 * it with whatever test runner you already have. The assertions are the point,
 * not the plumbing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorToSurface, actionFor } from './errorToSurface.ts'

// ---------------------------------------------------- the four questions ----

test('a page that could not load its subject gets the full-page surface', () => {
  const d = errorToSurface({ kind: 'load_failed', entity: 'invoice' })
  assert.equal(d.surface, 'page')
  assert.equal(d.action?.kind, 'retry')
})

test('a failed refresh with content already on screen is a banner, not a page', () => {
  const d = errorToSurface({ kind: 'load_failed', entity: 'invoice' }, { pageIsEmpty: false })
  assert.equal(d.surface, 'banner')
})

test('a bad field value goes inline, at that field', () => {
  const d = errorToSurface({ kind: 'validation', field: 'email', code: 'invalidFormat' })
  assert.equal(d.surface, 'inline')
  assert.equal(d.field, 'email')
})

test('a completed write is a toast', () => {
  assert.equal(errorToSurface({ kind: 'saved' }).surface, 'toast')
})

// ------------------------------------------------------- the tie-breakers ----

test('TIE-BREAKER: a condition that outlives four seconds is never a toast', () => {
  // This is the one that breaks most often, and always in the same shape:
  // "you are offline, showing saved data" is a condition, not an event.
  const longLived = ['offline', 'stale', 'read_only', 'write_queued']
  for (const kind of longLived) {
    const d = errorToSurface(
      kind === 'stale'
        ? { kind: 'stale', since: '2026-01-01' }
        : kind === 'read_only'
          ? { kind: 'read_only', reason: 'plan' }
          : { kind }
    )
    assert.notEqual(d.surface, 'toast', `${kind} must not be a toast: it is still true while the user looks at it`)
  }
})

test('TIE-BREAKER: a toast carries no recovery action, except undo', () => {
  const toasts = [
    errorToSurface({ kind: 'saved' }),
    errorToSurface({ kind: 'deleted', undoable: false }),
    errorToSurface({ kind: 'deleted', undoable: true }),
  ]
  for (const d of toasts) {
    if (!d.action) continue
    assert.equal(d.action.kind, 'undo', 'the only action a toast may carry is undo')
  }
})

test('TIE-BREAKER: no second action when the page already has the control', () => {
  const d = errorToSurface({ kind: 'unknown' })
  assert.ok(d.action, 'without a page control, the banner offers retry')
  assert.equal(actionFor(d, { pageHasRetryControl: true }), undefined, 'with a Save button on the page, the banner states the reason and offers nothing')
})

test('TIE-BREAKER: offline and stale do not share a message key', () => {
  // Offline is a fact about the device and is known for certain. Stale is a
  // fact about the data and can be true at full signal. Telling a user with
  // four bars that they are offline is how you teach them to ignore banners.
  const offline = errorToSurface({ kind: 'offline' })
  const stale = errorToSurface({ kind: 'stale', since: '2026-01-01' })
  assert.notEqual(offline.key, stale.key)
  assert.ok(!stale.key.startsWith('offline.'), 'a stale banner must not use offline copy')
})

// ------------------------------------------------------------ consistency ----

test('the classifier never returns a resolved string', () => {
  // Every decision must be a key. A resolved string here would put English in
  // the classifier, defeat the copy gate, and make this file need i18n to run.
  const samples = [
    { kind: 'offline' },
    { kind: 'saved' },
    { kind: 'validation', field: 'x', code: 'required' },
    { kind: 'forbidden', entity: 'invoice' },
    { kind: 'unknown' },
  ]
  for (const e of samples) {
    const d = errorToSurface(e)
    assert.match(d.key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/, `${d.key} should be a dotted locale key`)
    assert.ok(!d.key.includes(' '), 'a key with a space in it is a sentence')
  }
})

test('every error kind produces a decision', () => {
  // A closed union plus this test means adding a kind without deciding its
  // surface fails here rather than falling through to the default in production.
  const kinds = [
    { kind: 'load_failed', entity: 'a' },
    { kind: 'not_found', entity: 'a' },
    { kind: 'forbidden', entity: 'a' },
    { kind: 'validation', field: 'a', code: 'b' },
    { kind: 'conflict' },
    { kind: 'conflict', field: 'a' },
    { kind: 'offline' },
    { kind: 'stale', since: 'x' },
    { kind: 'read_only', reason: 'plan' },
    { kind: 'write_queued' },
    { kind: 'quota_exceeded', limit: 'seats' },
    { kind: 'saved' },
    { kind: 'deleted', undoable: true },
    { kind: 'unknown' },
  ]
  for (const e of kinds) {
    const d = errorToSurface(e)
    assert.ok(['page', 'inline', 'banner', 'toast'].includes(d.surface), `${e.kind} produced no valid surface`)
  }
})
