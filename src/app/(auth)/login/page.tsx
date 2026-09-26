import { redirect } from "next/navigation";
import { listMembers } from "@/lib/queries";
import { getCurrentUser, hasClubAccess } from "@/lib/session";
import { signInAs } from "@/actions/auth";
import { Avatar } from "@/components/avatar";
import { ClubCodeForm, FirstMemberForm } from "./first-member-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/log");
  if (!(await hasClubAccess())) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="font-display text-4xl font-semibold text-brew-dark">Taste Buds</h1>
          <p className="mt-2 text-stone-600">A private root beer club.</p>
        </div>
        <div className="card p-5">
          <h2 className="font-display text-xl font-semibold text-brew-dark">Enter the club code</h2>
          <p className="mt-1 text-sm text-stone-500">Ask a club member for the code.</p>
          <ClubCodeForm />
        </div>
      </main>
    );
  }
  const members = await listMembers();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
        <h1 className="font-display text-4xl font-semibold text-brew-dark">Taste Buds</h1>
        <p className="mt-2 text-stone-600">Track what you&apos;ve tried. Find what you haven&apos;t.</p>
      </div>

      {members.length === 0 ? (
        <div className="card p-5">
          <h2 className="font-display text-xl font-semibold text-brew-dark">Welcome! Who&apos;s first?</h2>
          <p className="mt-1 text-sm text-stone-600">Create your member profile. You can add the rest of the club afterwards.</p>
          <FirstMemberForm />
        </div>
      ) : (
        <div className="card p-5">
          <h2 className="font-display text-xl font-semibold text-brew-dark">Who&apos;s tasting?</h2>
          <p className="mt-1 text-xs text-stone-500">Tap your name to sign in.</p>
          <ul className="mt-4 space-y-2">
            {members.map((m) => (
              <li key={m.id}>
                <form action={signInAs.bind(null, m.id)}>
                  <button className="flex w-full items-center gap-3 rounded-xl border border-crema bg-foam px-3 py-3 text-left font-medium text-ink transition hover:border-sassafras hover:bg-cream">
                    <Avatar name={m.name} color={m.color} />
                    {m.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
