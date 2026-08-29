/**
 * PROBE FILE. This is not application code and is never imported.
 *
 * Every line marked FAIL must produce exactly one lint error. Every line marked
 * OK must produce none. `node scripts/check-probes.mjs` asserts that and fails
 * if a rule stops firing or starts firing on something legitimate.
 *
 * WHY THIS FILE EXISTS. A lint selector that matches nothing looks identical to
 * a lint selector that finds no violations: green output either way. That is the
 * worst failure mode a check can have, because it reads as coverage. Two real
 * examples from the repos this playbook was drawn from:
 *
 *   - `Literal[value=/^[0-9]+$/]` on a numeric literal matched nothing at all,
 *     for weeks, because esquery regex tests do not apply to numeric attribute
 *     values. It had to match on `raw` instead.
 *   - A narrow `fontSize` selector caught `fontSize: 12` and sailed past
 *     `fontSize: compact ? 9 : 10`, which is the form that actually shows up.
 *
 * Neither was found by reading the config. Both were found by writing a
 * violation and checking the linter noticed.
 *
 * When you add a rule, add two lines here first, then make them behave.
 */

// @ts-nocheck
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */

// ---------------------------------------------------- RTL / correctness ----

const rtlFail1 = <div className="pl-4 flex" />                    // FAIL physical-padding
const rtlOk1 = <div className="ps-4 flex" />                      // OK
const rtlFail2 = <div className="mr-2" />                         // FAIL physical-margin
const rtlOk2 = <div className="me-2" />                           // OK
const rtlFail3 = <div className="absolute left-0" />              // FAIL physical-inset
const rtlOk3 = <div className="absolute start-0" />               // OK
const rtlFail4 = <p className="text-right text-sm" />             // FAIL physical-align
const rtlOk4 = <p className="text-end text-sm" />                 // OK
const rtlFail5 = <div className="border-l border-border" />       // FAIL physical-border
const rtlOk5 = <div className="border-s border-border" />         // OK

// These must NOT fire. `pl` appearing inside another word, and a utility that
// merely starts with the same letters, are the false positives that make people
// disable a rule.
const rtlOk6 = <div className="place-items-center" />             // OK
const rtlOk7 = <div className="grid-cols-2" />                    // OK
const rtlOk8 = <div className="right-align-demo" />               // OK  (not right-<number>)

// ------------------------------------------------------- tokens / taste ----

const tokFail1 = <div className="bg-[#ff0055]" />                 // FAIL arbitrary-hex
const tokOk1 = <div className="bg-primary" />                     // OK
const tokFail2 = { color: '#334155' }                             // FAIL hex-literal
const tokOk2 = { color: 'var(--color-foreground)' }               // OK
const tokFail3 = <span className="text-[13px]" />                 // FAIL arbitrary-size
const tokOk3 = <span className="text-sm" />                       // OK

// The wrapped form. This is the one a narrow selector misses.
const tokFail4 = { fontSize: 12 }                                 // FAIL raw-size
const tokFail5 = { fontSize: compact ? 9 : 11 }                   // FAIL raw-size-in-ternary
const tokOk4 = { fontSize: theme.type.sm }                        // OK

// Numeric spacing that has an exact token.
const tokFail6 = { padding: 16 }                                  // FAIL on-scale-spacing
const tokFail7 = { gap: 8 }                                       // FAIL on-scale-spacing
// Off-scale optical nudges have no token and are legitimate. Flagging these is
// how you train people to disable the rule.
const tokOk5 = { padding: 3 }                                     // OK
const tokOk6 = { marginTop: 5 }                                   // OK

// ---------------------------------------------------------------- copy ----

const copyFail1 = <input placeholder="Search invoices" />         // FAIL hardcoded-placeholder
const copyOk1 = <input placeholder={t('invoices.searchPlaceholder')} />   // OK
const copyFail2 = <button aria-label="Close dialog" />            // FAIL hardcoded-aria
const copyOk2 = <button aria-label={t('actions.close')} />        // OK
const copyFail3 = <img alt="Company logo" />                      // FAIL hardcoded-alt
const copyOk3 = <img alt={t('brand.logoAlt')} />                  // OK
const copyFail4 = <p>Saved successfully — you can close this.</p> // FAIL em-dash
const copyOk4 = <p>{t('save.done')}</p>                           // OK

// A single letter is an icon or an initial, not copy. Must not fire.
const copyOk5 = <button aria-label="x" />                         // OK
