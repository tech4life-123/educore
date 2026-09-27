"use client";

import { useFormStatus } from "react-dom";
import { useActionFormPending } from "./action-form";
import { Button } from "./button";
import type { ComponentProps } from "react";

/** Submit button that shows a pending state while its parent <form> action runs. */
export function SubmitButton(props: Omit<ComponentProps<typeof Button>, "type" | "loading">) {
  const { pending } = useFormStatus();
  const actionFormPending = useActionFormPending();
  return <Button type="submit" loading={pending || actionFormPending} {...props} />;
}
