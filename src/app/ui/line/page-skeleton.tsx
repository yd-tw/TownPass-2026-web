export type SkeletonPage = "chat" | "forum" | "new" | "room";

function Block({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block bg-tp-gray-200 animate-pulse motion-reduce:animate-none ${className}`} />;
}

function SearchSkeleton() {
  return <div className="px-4 pt-4 pb-3">
    <Block className="h-11 w-full rounded-xl" />
  </div>;
}

export function ChatRowsSkeleton() {
  return <>
    {Array.from({ length: 5 }, (_, index) => (
      <li key={index} aria-hidden="true" className="flex min-w-0 gap-3 px-4 py-3">
        <Block className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex h-[22px] items-center"><Block className="h-3.5 w-2/5 rounded-md" /></div>
          <div className="mt-0.5 flex h-[22px] items-center"><Block className="h-3.5 w-3/5 rounded-md" /></div>
        </div>
        <Block className="mt-0.5 h-4 w-10 shrink-0 rounded-md max-[300px]:hidden" />
      </li>
    ))}
  </>;
}

export function ForumRowsSkeleton() {
  return <>
    {Array.from({ length: 4 }, (_, index) => (
      <article key={index} aria-hidden="true" className="flex min-w-0 gap-2.5 px-4 py-3">
        <Block className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Block className="mb-1 h-5 w-1/3 rounded-md" />
          <div className="flex h-6 items-center"><Block className="h-3.5 w-4/5 rounded-md" /></div>
          <div className="flex h-6 items-center"><Block className="h-3.5 w-3/5 rounded-md" /></div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <Block className="h-4 w-8 rounded-md" />
            <Block className="h-4 w-16 rounded-md" />
            <Block className="h-4 w-14 rounded-md" />
          </div>
        </div>
      </article>
    ))}
  </>;
}

function ComposerSkeleton({ kind }: { kind: "new" | "room" }) {
  return <div className="relative shrink-0 border-t border-tp-gray-100 bg-tp-gray-50 px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
    {kind === "new" && <div className="flex max-h-28 gap-2 overflow-hidden px-2 pb-2">
      <Block className="h-12 w-32 shrink-0 rounded-xl" />
    </div>}
    <div className="flex min-w-0 items-end gap-0.5">
      {kind === "room" && <Block className="size-11 shrink-0 rounded-full max-[300px]:size-10" />}
      <Block className="size-11 shrink-0 rounded-full max-[300px]:size-10" />
      <Block className="mx-1 h-11 min-w-0 flex-1 rounded-[22px]" />
      <Block className="size-11 shrink-0 rounded-full max-[300px]:size-10" />
    </div>
  </div>;
}

function NewRoomContentSkeleton() {
  return <div className="min-h-0 flex-1 overflow-hidden px-3 pt-1 pb-3">
    <div className="my-3 flex justify-center px-4">
      <Block className="h-[70px] w-72 max-w-full rounded-2xl" />
    </div>
  </div>;
}

function RoomContentSkeleton() {
  return <div className="min-h-0 flex-1 overflow-hidden px-3 pt-1 pb-3">
    <div className="my-3 flex justify-center"><Block className="h-6 w-20 rounded-full" /></div>
    <div className="my-3 flex justify-center px-4"><Block className="h-10 w-48 max-w-full rounded-2xl" /></div>
    <div className="mt-3 flex items-start gap-2 pr-8 max-[300px]:gap-1 max-[300px]:pr-2">
      <Block className="size-10 shrink-0 rounded-full max-[300px]:hidden" />
      <div className="min-w-0 flex-1">
        <Block className="mb-1 h-5 w-20 rounded-md" />
        <div className="flex items-end gap-1.5">
          <Block className="h-[42px] w-3/4 max-w-full rounded-[18px]" />
          <Block className="mb-0.5 h-4 w-9 shrink-0 rounded-md" />
        </div>
      </div>
    </div>
    <div className="mt-3 flex justify-end pl-12 max-[300px]:pl-1">
      <div className="flex items-end gap-1.5">
        <Block className="mb-0.5 h-4 w-9 shrink-0 rounded-md" />
        <Block className="h-[42px] w-40 max-w-full rounded-[18px]" />
      </div>
    </div>
  </div>;
}

export function PageSkeleton({ kind }: { kind: SkeletonPage }) {
  const list = kind === "chat" || kind === "forum";
  return <div role="status" className={`flex min-h-0 flex-1 flex-col overflow-hidden ${list ? "bg-tp-gray-50" : "bg-tp-gray-100"}`}>
    <span className="sr-only">載入中…</span>
    {list ? (
      <div className="min-h-0 flex-1 overflow-hidden">
        <SearchSkeleton />
        {kind === "forum" ? <>
          <div className="flex items-center gap-2.5 border-b border-tp-gray-100 px-4 py-3">
            <Block className="size-10 shrink-0 rounded-full" /><Block className="h-[22px] w-2/5 rounded-md" />
          </div>
          <div className="divide-y divide-tp-gray-100"><ForumRowsSkeleton /></div>
        </> : <ul className="divide-y divide-tp-gray-100"><ChatRowsSkeleton /></ul>}
      </div>
    ) : <>
      {kind === "new" ? <NewRoomContentSkeleton /> : <RoomContentSkeleton />}
      <ComposerSkeleton kind={kind} />
    </>}
  </div>;
}
