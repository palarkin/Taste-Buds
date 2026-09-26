"use client";

import { useActionState } from "react";
import { createMemberAndSignIn, enterClubCode } from "@/actions/auth";

export function FirstMemberForm() {
  const [state, action, pending] = useActionState(createMemberAndSignIn, null);
  return (
    <form action={action} className="mt-4 space-y-3">
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" placeholder="Pete" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="email">Email <span className="font-normal text-stone-400">(optional, used for sign-in later)</span></label>
        <input id="email" name="email" type="email" className="input" />
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Setting up…" : "Start tasting"}</button>
    </form>
  );
}

export function ClubCodeForm() {
  const [state, action, pending] = useActionState(enterClubCode, null);
  return (
    <form action={action} className="mt-4 space-y-3">
      <input name="code" className="input" placeholder="Club code" autoComplete="off" autoCapitalize="none" required autoFocus aria-label="Club code" />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}
