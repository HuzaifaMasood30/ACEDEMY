'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Input, Label } from '@/components/ui/primitives';
import { authErrorMessage } from '@/lib/auth-errors';

export function LoginForm({
  safeNext,
  initialError,
}: {
  safeNext: string;
  initialError?: string;
}) {
  const router = useRouter();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    initialError ? authErrorMessage(initialError) : null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextFieldErrors.email = 'Enter your email address.';
    if (!password) nextFieldErrors.password = 'Enter your password.';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(authErrorMessage(result.code ?? result.error));
        setSubmitting(false);
        return;
      }

      // A full navigation guarantees the new session cookie is sent with the
      // request that renders the destination portal.
      router.replace(safeNext || '/');
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="card space-y-4 p-6 shadow-[var(--shadow-md)]"
    >
      {error && (
        <Alert tone="danger" icon={<AlertCircle className="size-4" />}>
          {error}
        </Alert>
      )}

      <Field
        label="Email address"
        htmlFor="email"
        required
        error={fieldErrors.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoFocus
          placeholder="you@wisdom-academy.example"
          aria-invalid={Boolean(fieldErrors.email)}
          disabled={submitting}
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={Boolean(fieldErrors.password)}
            disabled={submitting}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink)]"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={submitting}
          />
          <Label htmlFor="remember" className="text-xs font-normal text-[var(--ink-muted)]">
            Keep me signed in
          </Label>
        </div>
      </div>

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        {!submitting && <LogIn />}
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-xs text-[var(--ink-subtle)]">
        Forgot your password? Ask the academy office to issue a reset link.
      </p>
    </form>
  );
}
