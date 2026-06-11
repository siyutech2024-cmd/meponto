import { redirect } from "next/navigation";

/** Legacy demo page — real report upload lives on /performance. */
export default function LegacyRedirect() {
  redirect("/performance");
}
