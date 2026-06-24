import { redirect } from "next/navigation";

// Bare root → marketing homepage. (Was "/pontosys", a route deleted in ce29952,
// which left this redirect pointing at a non-existent page.)
export default function Home() {
  redirect("/home");
}
