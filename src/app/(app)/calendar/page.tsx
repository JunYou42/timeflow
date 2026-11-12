"use client";

import dynamic from "next/dynamic";

import { LoadingState } from "@/components/layout/states";

// FullCalendar touches `window` at module scope, so it is loaded client-side only.
const CalendarView = dynamic(
  () => import("@/components/calendar/calendar-view").then((mod) => mod.CalendarView),
  { ssr: false, loading: () => <LoadingState label="Loading calendar…" /> }
);

export default function CalendarPage() {
  return <CalendarView />;
}
