export default function Loading() {
  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="mb-3 h-4 w-20 animate-pulse rounded bg-gray-200" />
          <div className="flex items-start justify-between">
            <div>
              <div className="h-7 w-64 animate-pulse rounded bg-gray-200" />
              <div className="mt-1 h-4 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>

        {/* Two-column grid skeleton */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left column - minutes */}
          <div className="space-y-3">
            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-white" />
            <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-24 animate-pulse rounded-lg border border-gray-200 bg-white" />
          </div>
          {/* Right column - doc generator */}
          <div className="space-y-3">
            <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-48 animate-pulse rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>

        {/* Mindmap area skeleton */}
        <div className="mt-6 space-y-3">
          <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-96 animate-pulse rounded-lg border border-gray-200 bg-white" />
        </div>
      </div>
    </main>
  );
}
