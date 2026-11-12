import { Suspense } from "react";
import type { Metadata } from "next";

import { LoadingState } from "@/components/layout/states";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TasksWorkspace />
    </Suspense>
  );
}
