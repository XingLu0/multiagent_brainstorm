export default function Loading() {
  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200" />
        </div>

        {/* Project cards skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
                  <div className="mt-2 flex gap-2">
                    <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
                  </div>
                  <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-gray-200" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
