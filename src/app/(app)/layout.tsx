import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { BottomTabs, TopNav } from "@/components/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-crema/70 bg-foam/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-4 px-4 lg:px-6">
          <Link href="/log" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-xl font-semibold text-brew-dark">Taste Buds</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <Link href="/log/new" className="btn-primary hidden py-2 md:inline-flex">+ Log a root beer</Link>
            <Link href="/settings" className="rounded-full" aria-label="Settings">
              <Avatar name={user.name} color={user.color} />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 pb-28 pt-5 md:pb-12 lg:px-6">{children}</main>
      <BottomTabs />
    </div>
  );
}
