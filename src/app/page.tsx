import { redirect } from "next/navigation";

export default function Home() {
  redirect("/app/setup");
  return null;
}
