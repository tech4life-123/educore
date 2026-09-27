"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.formError ? (
        <Alert tone="danger" title="Couldn’t sign you in">
          {state.formError}
        </Alert>
      ) : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <TextField
        id="email"
        name="email"
        type="text"
        label="Email or username"
        hint="Students and parents without email: use your username with your school code, e.g. stu0042@PILOT-01."
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <SubmitButton className="w-full" size="lg" loadingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
