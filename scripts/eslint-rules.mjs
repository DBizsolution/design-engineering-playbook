/**
 * Design-system and copy guardrails as ESLint errors.
 *
 * These are the rules from the constitution that a machine can check. Import
 * this from your eslint.config.mjs:
 *
 *   import { designRules, copyRules, boundaryRules } from './scripts/eslint-rules.mjs'
 *
 *   export default [
 *     ...tseslint.configs.recommended,
 *     { files: ['**\/*.{ts,tsx}'],
 *       rules: { 'no-restricted-syntax': ['error', ...designRules, ...copyRules],
 *                ...boundaryRules } },
 *     { files: ['**\/*.stories.tsx', '**\/kitchen-sink/**'],
 *       rules: { 'no-restricted-syntax': ['error', ...designRules] } },   // see below
 *   ]
 *
 * THE STRUCTURE MATTERS MORE THAN THE RULES.
 *
 * The rules are split into named groups rather than one flat list, because
 * exemptions differ. A component catalogue legitimately hardcodes specimen
 * strings ("you@company.com") while still being held to every token rule. The
 * second config block above re-declares no-restricted-syntax WITHOUT the copy
 * half, rather than switching the rule off. A hex in the catalogue still fails.
 *
 * The general move: when a rule is right in general and wrong in one place,
 * narrow it by re-declaring a subset. Never disable it wholesale, and never
 * reach for an inline eslint-disable, which is invisible three weeks later.
 *
 * SEPARATE CORRECTNESS FROM TASTE. rtlRules below are correctness: a component
 * using pl-4 has not told you whether it works in Arabic. designRules are taste:
 * a hardcoded hex is ugly and unmaintainable but it renders. A sandbox or an
 * experiment may relax taste. Nothing relaxes correctness.
 *
 * EVERY RULE HERE HAS A PROBE. See scripts/probes/. If you add a rule, add a
 * probe line that must fail and one that must pass, then run the probe. A
 * selector that silently matches nothing reads exactly like a passing rule.
 */

// ------------------------------------------------------- CORRECTNESS -------
// These never relax, in any override, anywhere.

export const rtlRules = [
  {
    // Physical direction does not mirror in a right-to-left language. Using the
    // logical property costs nothing today and is the entire difference between
    // "we support Arabic" being a week and being a quarter.
    selector: "Literal[value=/(?:^|\\s)-?(?:p|m)(?:l|r)-/]",
    message:
      'No physical directional spacing. Use ps-/pe-/ms-/me- so the layout mirrors in RTL. ' +
      'This is a correctness rule, not a style preference: pl-4 is wrong in Arabic.',
  },
  {
    selector: "Literal[value=/(?:^|\\s)(?:left|right)-[0-9]/]",
    message: 'No physical left-/right- insets. Use start-/end-.',
  },
  {
    selector: "Literal[value=/(?:^|\\s)text-(?:left|right)(?:\\s|$)/]",
    message: "No physical text alignment. Use text-start / text-end.",
  },
  {
    selector: "Literal[value=/(?:^|\\s)(?:border-l|border-r)(?:-|\\s|$)/]",
    message: 'No physical border sides. Use border-s / border-e.',
  },
]

// ------------------------------------------------------------- TASTE -------
// A hardcoded value that a token already names.

export const tokenRules = [
  {
    // Arbitrary hex inside a Tailwind class. Colour is authored in one place,
    // your globals.css token block, and nowhere else.
    selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
    message:
      'No arbitrary hex colour. Use a semantic token (bg-card, text-muted-foreground). ' +
      'If the colour you need does not exist, add a token to globals.css rather than a one-off.',
  },
  {
    // The same thing in a style object or a CSS-in-JS value.
    selector: "Property[key.name=/^(color|background|backgroundColor|borderColor|fill|stroke)$/] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: 'No hex colour literal. Use a token from the theme.',
  },
  {
    // Arbitrary type sizes bypass the type scale, which is what keeps the
    // hierarchy legible and what dynamic-type accessibility settings scale.
    selector: "Literal[value=/(?:^|\\s)text-\\[[0-9.]+(?:px|rem|em)\\]/]",
    message: 'No arbitrary font size. Use the type scale (text-sm, text-base, text-lg).',
  },
  {
    // The descendant form, not [value.type='Literal'], on purpose. The narrow
    // version catches fontSize: 12 and sails straight past
    // fontSize: isCompact ? 11 : 13, which is exactly how a raw size survives an
    // audit. Any numeric literal anywhere inside the value is a raw size,
    // however it is wrapped. theme.type.sm reads as a MemberExpression and passes.
    selector: "Property[key.name=/^(fontSize|lineHeight)$/] Literal[raw=/^[0-9.]+$/]",
    message:
      'No raw fontSize or lineHeight, including inside a ternary. ' +
      'Use the type scale. Chrome that must NOT scale with dynamic type gets its own named token.',
  },
  {
    // raw, not value. esquery regex tests do not apply to NUMERIC attribute
    // values, so [value=/^[0-9]+$/] silently matches nothing on a number and
    // reads as a working rule. This one cost the Synacor repo a real audit.
    selector:
      "Property[key.name=/^(padding|paddingTop|paddingBottom|margin|marginTop|marginBottom|gap|rowGap|columnGap)$/] > Literal[raw=/^(4|8|12|16|20|24|32|40)$/]",
    message:
      'This spacing value has an exact token. Use it. ' +
      'Off-scale optical nudges (1, 2, 3, 5, 6) are legitimate and are deliberately not flagged, ' +
      'so the rule stays worth obeying.',
  },
]

export const designRules = [...tokenRules, ...rtlRules]

// -------------------------------------------------------------- COPY -------
// Split out because the component catalogue is exempt from these and from
// nothing else.

export const copyRules = [
  {
    // Accessibility text is user-visible text. It is the half everyone forgets,
    // because it never appears in a screenshot review: a hardcoded aria-label
    // sails past design review, past QA, and reaches a screen reader user in
    // English on an Arabic build.
    //
    // Scoped to the four unambiguous props. title and label are too overloaded
    // (chart configs, demo specs, option objects) to error on.
    selector:
      "JSXAttribute[name.name=/^(aria-label|aria-description|placeholder|alt)$/] > Literal[value=/[A-Za-z]{2}/]",
    message:
      'User-visible strings go through t(), and accessibility labels are user-visible: ' +
      'a screen reader reads them aloud. Add the key to every locale file.',
  },
  {
    // Em dashes read as machine-written and do not localise cleanly. Rephrase:
    // two sentences, or a comma, colon or parentheses.
    selector: "JSXText[value=/\\u2014/]",
    message: 'No em dash in user-facing copy. Use a period, comma, colon, or parentheses.',
  },
]

// ---------------------------------------------------------- BOUNDARIES -----

/**
 * One-way import boundaries. Spread these into a config block's `rules`.
 *
 * The pattern match here is the readable half: it catches the shapes people
 * actually write and misses ones they could contrive. For a boundary that
 * really matters, pair it with a script in pre-commit that resolves paths
 * properly. Two layers on purpose: the lint rule for fast feedback in the
 * editor, the script for the gate you actually trust.
 */
export const boundaryRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['**/lib/server/*', '**/lib/server/**'],
          message:
            'Server-only code must not be imported from a client component. ' +
            'It will be bundled and shipped to the browser, secrets included. ' +
            'Move the call behind a server action or a route handler.',
        },
        {
          group: ['**/experiments/*/*', '**/experiments/*/**'],
          message:
            'Nothing outside experiments/ may import from inside it. ' +
            'An experiment is allowed to break the design system precisely because none of it ' +
            'can leak. Promote what is approved into src/components, rewritten to obey the rules.',
        },
      ],
    },
  ],
}
