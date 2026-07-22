import { AuthShell } from "@/components/AuthShell";
import { getSetting } from "@/lib/settings";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const brand = await getSetting("brand_name");
  return (
    <AuthShell brand={brand}>
      <LoginForm />
    </AuthShell>
  );
}
