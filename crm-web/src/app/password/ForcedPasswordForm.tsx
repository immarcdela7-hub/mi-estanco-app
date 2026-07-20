"use client";

import { useActionState } from "react";
import { forcedPasswordChangeAction, type FormState } from "@/lib/actions/auth";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

export function ForcedPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    forcedPasswordChangeAction,
    {}
  );

  return (
    <form
      action={action}
      className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
    >
      <h2 className="text-lg font-extrabold text-ink">Crea tu contraseña</h2>
      <p className="mb-4 mt-1 text-sm text-muted">
        Estás usando la contraseña por defecto. Elige una nueva para proteger el CRM.
      </p>

      <label className={labelCls} htmlFor="new1">
        Nueva contraseña
      </label>
      <input id="new1" name="new1" type="password" className={inputCls} autoComplete="new-password" />

      <label className={`${labelCls} mt-4`} htmlFor="new2">
        Repite la nueva contraseña
      </label>
      <input id="new2" name="new2" type="password" className={inputCls} autoComplete="new-password" />

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimary} mt-5 w-full`}>
        {pending ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
