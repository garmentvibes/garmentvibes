import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-8 w-32" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="hidden md:block">
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:col-span-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[3/4] w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-1 h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
