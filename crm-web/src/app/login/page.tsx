import { AuthShell } from "@/components/AuthShell";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const brand = await getSetting("brand_name");
  const userCount = await prisma.user.count();
  const firstRun =
    userCount === 0 ||
    (await prisma.user.count({ where: { role: "ADMIN", mustChangePassword: true } })) > 0;

  return (
    <AuthShell brand={brand}>
      <LoginForm />
      {firstRun && (
        <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-slate-700">
          <b>Primer acceso</b> — usuario <code className="font-mono">admin</code>, contraseña{" "}
          <code className="font-mono">admin1234</code>. La aplicación te pedirá cambiarla al
          entrar.
        </div>
      )}
    </AuthShell>
  );
}
