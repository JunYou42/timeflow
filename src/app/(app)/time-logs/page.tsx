import type { Metadata } from "next";

import { TimeLogsWorkspace } from "@/components/time-entries/time-logs-workspace";

export const metadata: Metadata = { title: "Time Logs" };

export default function TimeLogsPage() {
  return <TimeLogsWorkspace />;
}
