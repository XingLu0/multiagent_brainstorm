"use client";

import dynamic from "next/dynamic";

const MindmapView = dynamic(() => import("./mindmap-view"), {
  ssr: false,
  loading: () => (
    <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
  ),
});

interface MindmapViewLazyProps {
  projectId: string;
  minutesContent: string;
}

export function MindmapViewLazy(props: MindmapViewLazyProps) {
  return <MindmapView {...props} />;
}
