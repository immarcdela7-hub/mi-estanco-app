"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/lib/actions/auth";
import { btnPrimary } from "./ui";

export function ActionForm({
  action,
  submitLabel,
  submitClassName,
  resetOnSuccess = false,
  compact = false,
  children,
  className = "",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  submitClassName?: string;
  resetOnSuccess?: boolean;
  /** Sin separación sobre el botón, para los que van sueltos dentro de una tabla. */
  compact?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${submitClassName ?? btnPrimary}${compact ? "" : " mt-4"}`}
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
