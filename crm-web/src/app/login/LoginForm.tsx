"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/lib/actions/auth";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form
      action={action}
      className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
    >
      <label className={labelCls} htmlFor="username">
        Usuario
      </label>
      <input id="username" name="username" className={inputCls} autoComplete="username" />

      <label className={`${labelCls} mt-4`} htmlFor="password">
        Contraseña
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className={inputCls}
        autoComplete="current-password"
      />

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimary} mt-5 w-full`}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
