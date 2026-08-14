import { redirect } from "next/navigation";

// The dashboard *is* the bulk order list, but claims live under
// /wholesale/orders/[id]/claim, so this path is reachable — from a link in a
// notification, or a buyer trimming the URL. Landing on a 404 there would be
// a dead end, so send them to the list they were looking for.
export default function WholesaleOrdersPage() {
  redirect("/wholesale/dashboard");
}
