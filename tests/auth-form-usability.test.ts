/**
 * F3.7  — network failures during auth were completely silent.
 * F3.8  — no `<form>`, so Enter didn't submit and passwords weren't offered
 *         for saving.
 * F3.9  — the form had no programmatic error wiring.
 * F3.12 — switching between Sign in and Create account left stale errors.
 * F3.13 — the page had no `<h1>` stating its own task.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(process.cwd(), 'src', 'app', 'auth', 'signin', 'page.tsx'),
  'utf8',
);

/** Code with comments stripped — the comments quote the patterns they replaced. */
const code = src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('F3.7 — a failed request says so', () => {
  it('both email handlers catch, not just the Google one', () => {
    // There was no catch on sign-in or sign-up: a dropped connection threw out
    // of `authClient`, `finally` cleared the spinner, and the user was left
    // looking at an unchanged form — indistinguishable from "nothing happened".
    const catches = code.match(/\} catch \{[\s\S]*?We couldn't reach Lumina/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(3);
  });

  it('the message names the cause and the next action', () => {
    expect(code).toContain("Check your connection and try again.");
  });
});

describe('F3.8 — it is a real form', () => {
  it('wraps the fields in a form with a submit handler', () => {
    // Password managers look for a form submission before offering to SAVE a
    // credential, so without one a user could never get autofill on the next
    // visit — which is the same outcome F3.5's `data-lpignore` was reverted for.
    expect(code).toContain('<form onSubmit={handleSubmit} noValidate>');
  });

  it('the primary button submits it', () => {
    expect(code).toContain('type="submit"');
    // The ad-hoc handler that used to do this by hand is gone.
    expect(code).not.toContain('onKeyDown');
  });

  it('preventDefault is called, so the page does not navigate', () => {
    expect(code).toContain('e?.preventDefault();');
  });
});

describe('F3.9 — errors are reachable by assistive tech', () => {
  it('each input points at its own error text', () => {
    expect(code).toContain("'aria-describedby': fieldErrors[field] ? `${id}-error` : undefined");
    expect(code).toContain("'aria-invalid': fieldErrors[field]");
  });

  it('the error element carries the id that describedby resolves to', () => {
    expect(code).toContain('id={htmlFor ? `${htmlFor}-error` : undefined}');
  });

  it('errors announce themselves', () => {
    // Both the field errors and the page-level message.
    expect(code.match(/role="alert"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('all three fields are marked required', () => {
    expect(code).toContain('required: true');
  });

  it('a failed submit moves focus to the first bad field', () => {
    // Focus used to stay on the button, so a keyboard or screen reader user had
    // to hunt for what was wrong.
    expect(code).toContain("const first = ['name', 'email', 'password'].find");
    expect(code).toContain('document.getElementById(`auth-${first}`)?.focus()');
  });

  it('reads validation results from a ref, not from async state', () => {
    // `setFieldErrors` does not settle before `handleSubmit` continues.
    expect(code).toContain('fieldErrorsRef');
  });
});

describe('F3.9 — the error node actually unmounts', () => {
  it('renders conditionally rather than through AnimatePresence', () => {
    // Verified in a browser: as an `AnimatePresence` + `motion.p` the exit
    // phase never finalised, so a cleared error sat in the DOM at
    // `opacity: 0; height: 0` forever. Invisible — but with `role="alert"` on
    // it, stale error text would stay in the accessibility tree after the user
    // had already fixed the field. `AppShell` documents the same React 19 +
    // Framer Motion failure for its hydration overlay.
    // Sliced to the next top-level declaration, not to a banner comment — the
    // comments are stripped above, so a comment marker would not be found and
    // the slice would silently run to end-of-file.
    const field = code.slice(
      code.indexOf('const AuthField'),
      code.indexOf('function SignInPageInner'),
    );
    expect(field).not.toContain('AnimatePresence');
    expect(field).not.toContain('motion.p');
    expect(field).toContain('{error && (');
  });
});

describe('F3.12 — switching mode clears what no longer applies', () => {
  it('both toggles go through one handler that resets everything', () => {
    // They used to clear only the page-level message, so failing sign-in
    // validation and switching to "Create account" showed errors about rules
    // that no longer applied.
    expect(code).toContain("onClick={() => switchMode('signin')}");
    expect(code).toContain("onClick={() => switchMode('signup')}");
  });

  it('the handler clears field errors and the message', () => {
    const fn = code.slice(code.indexOf('const switchMode'), code.indexOf('const a11yProps'));
    expect(fn).toContain('setMessage(null)');
    expect(fn).toContain('setFieldErrors({})');
    expect(fn).toContain('fieldErrorsRef.current = {}');
  });
});

describe('F3.13 — the page states its own task', () => {
  it('has an h1', () => {
    // The largest text was a `<span>` wordmark, so a screen reader's heading
    // list was empty.
    expect(code).toContain('<h1');
  });

  it('names the task rather than just the product', () => {
    expect(code).toContain('Sign in to Lumina');
    expect(code).toContain('Create your Lumina account');
  });

  it('keeps the wordmark visual without reading it twice', () => {
    expect(code).toContain('<span aria-hidden="true">Lumina</span>');
  });
});
