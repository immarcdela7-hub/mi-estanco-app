import { AuthShell } from "@/components/AuthShell";
import { getSetting } from "@/lib/settings";
import { ForcedPasswordForm } from "./ForcedPasswordForm";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const brand = await getSetting("brand_name");
  return (
    <AuthShell brand={brand}>
      <ForcedPasswordForm />
    </AuthShell>
  );
}
