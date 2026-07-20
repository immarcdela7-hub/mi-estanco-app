import { redirect } from "next/navigation";

export default function Home() {
  // El proxy redirige según la sesión; esto solo cubre el caso sin cookie.
  redirect("/login");
}
