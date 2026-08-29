# The rules no check can enforce

Every check in chapter 4 is about what a *value* may be. That means code can use
only design tokens, only translation keys, only logical spacing, and still be
put together wrong. Every piece of a bad assembly is legal on its own.

This is the gap where a team ends up individually compliant and collectively
inconsistent, and it is worth naming out loud in the constitution:

> No check catches this section. Every rule above is about what a value may be,
> so a page can pass every gate and still be assembled unlike every other page.
> This section is enforced by review, which is why it is written down.

That paragraph does more work than any rule under it. It tells a reviewer where
to spend attention, and it tells an assistant that this section is not decorative.

## The cheapest rule in the playbook

> Before writing a new page, open the nearest existing one that does the same
> kind of thing, and copy its structure.

A settings page copies a settings page. A list page copies a list page. A form
copies a form.

This costs nothing, works identically for people and assistants, and prevents the
specific failure of a batch of files built in one sitting that are perfectly
consistent with each other and inconsistent with everything that came before. It
happens because the person building them never opened a sibling, and no check
will ever object.

Put it in the constitution verbatim. Extend it: "before adding a route handler,
open the nearest sibling route", "before adding a background job, open the
nearest sibling job".

## Where a message goes

The clearest example of a rule that needs writing down, and the one a ticket will
decide for you if you let it.

A ticket's error-handling table says *what* to say. It has no authority over
*where* it goes, and whoever wrote it was describing one screen, not designing a
system. Decide it per ticket and you get two languages for the same sentence in
one product.

**Four surfaces. Ask in order. Stop at the first yes.**

1. **Nothing to show?** The page could not load its subject at all, so there is
   no content for a message to sit beside. Full-page empty state with one retry.

2. **One specific value wrong, missing or refused?** Inline, at that value. Only
   the field knows where the user has to go. A page-level banner saying "the form
   has errors" makes them hunt for which part.

3. **Still true while they are looking at it?** A standing condition of the page:
   showing cached data, a write that has not landed, read-only mode, a degraded
   integration. A persistent banner. It persists because the condition does.

4. **Is it over?** Nothing to decide, nothing still broken, the result already
   visible behind it. A toast. It leaves because the thing it reports has already
   finished.

**Four tie-breakers, each of which exists because it was got wrong once.**

**A condition that outlives four seconds cannot be a toast.** A message you
dismiss by waiting must never be the only record of something still wrong. This
is the one that breaks most often and always in the same shape: "You are offline,
showing saved data" is a condition, not an event.

**A toast carries no recovery action.** An action on a timer is a race, and a
user who loses it has lost the only route out. Undo is the exception and the only
one: it reverses something that completed, so letting the timer expire is itself
a valid answer.

**An action goes where there is one to offer, and exactly once.** If the page
already has the control that would retry, a Save button or a Sync now, the banner
states the reason and offers nothing. Two controls for one action read as two
different actions.

**The same claim takes the same surface everywhere.** Whatever surface a class of
message gets, it keeps product-wide. A stale-data caveat is a banner on the
invoice page and a banner on the settings page. A completed save is a toast in
both. Deciding it per feature is how one product ends up with two conventions.

### Make it code

`examples/errorToSurface.ts`, with tests in `errorToSurface.test.mjs`. Both work.

```ts
export function errorToSurface(error: AppError, ctx: SurfaceContext = {}): SurfaceDecision
```

**It returns a surface and a message key, never a resolved string.** Three
consequences, and all three are why it is worth building:

- it is testable with no i18n loaded;
- translation stays in exactly one place;
- a caller cannot sneak a hardcoded English sentence past the copy check.

**The error kind is a closed union.** An open `string` means the switch can
silently fall through to the default for a case nobody considered, which is how a
validation error ends up as a toast. With a closed union plus the "every kind
produces a decision" test, adding a kind without deciding its surface fails in
CI rather than in production.

**The tie-breakers are tests.** This is the part that keeps the rules from
eroding one pull request at a time:

```js
test('TIE-BREAKER: a condition that outlives four seconds is never a toast', () => {
  for (const kind of ['offline', 'stale', 'read_only', 'write_queued']) {
    assert.notEqual(errorToSurface(...).surface, 'toast')
  }
})

test('TIE-BREAKER: a toast carries no recovery action, except undo', () => { ... })
test('TIE-BREAKER: no second action when the page already has the control', () => { ... })
test('TIE-BREAKER: offline and stale do not share a message key', () => { ... })
```

When somebody argues that a particular offline message "should just be a toast",
the argument is with a failing test rather than with a person, and the test
comment explains why.

**Install at Tier 2.** It is about ninety lines and it settles a category of
inconsistency permanently.

## Offline and stale are different conditions

A specific case worth its own rule, because it looks like one thing and is two.

**Offline** is a fact about the device. It is identical on every screen and known
for certain.

**Stale** is a fact about the data. It can be true at full signal, because a
refresh failed or someone else wrote the record five minutes ago.

Put "You are offline" on a stale banner and the first user who sees it with four
bars stops reading banners. In the classifier they are separate kinds with
separate key families, and there is a test asserting the keys differ.

## One sentence, two halves

When the same fact appears on many screens, the shared half belongs to the
component and the screen supplies only its own half.

In one project, before this was made structural, being offline arrived four
different ways across nine screens: "You're offline.", "You are offline.",
"Offline.", and on one screen no mention of being offline at all. As long as the
component took the whole sentence, every screen wrote its own.

```tsx
// The component owns the opener. The screen passes only its own detail.
<OfflineBanner detailKey="invoices.showingSaved" />
// renders: "You are offline. Showing saved invoices."
```

Three rules for the half a screen writes:

**Pick one word for the shared concept and use it everywhere.** In that project
the same data had been called saved, synced, cached, on-device, and "what is on
this device" across nine screens. Pick one, write it in the constitution.

**Say what they have, not what they are missing.** "Showing saved invoices", not
"Cannot reach the server". The banner explains why the page looks the way it
does, and the page is showing something.

**Give it a character budget, with the reason.** "Under about 40 characters,
because the banner renders on one line and the opener plus the detail has about
54 before it truncates." Two strings were over that and were being cut off.

## Writing your own

The section grows as you find things. Each entry needs three parts:

**The rule**, in one or two sentences.

**The reason**, which is usually the incident. "The sync screens were built in
one sitting without opening a sibling and invented their own layout" is worth
more than "be consistent", because it tells the next person when the rule applies
and when it does not.

**How to tell**, if it is not obvious. The four-surface list is a decision
procedure with a stopping rule, not a set of principles, which is what makes it
usable at 5pm.

Record exceptions as exceptions, with the boundary. A real example:

> The tag editor puts its commit button in the header corner even though every
> other sheet puts a commit button at the foot. It stays an exception rather than
> a new rule because the save-search sheet keeps its foot button: its body can
> run several lines, so the commit lands after content the eye must travel
> anyway, while the tag editor is a short fixed form with nothing between the
> last field and the foot. **Length of the body is what decides it.**

That entry gives the exception a boundary. Without the last sentence it is
precedent for anything.
