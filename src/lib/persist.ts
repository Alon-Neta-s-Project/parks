import { emptyProfile, type Profile } from "./profile";

const KEY = "pdc.session.v1";

export interface Saved {
  profile: Profile;
  step: number;
  started: boolean;
}

/**
 * A refresh mid-conversation should not cost the answers already given.
 *
 * Storage can throw outright (private windows, blocked site data), so every read
 * and write is guarded and a failure simply means starting fresh — never a
 * broken screen.
 */
export function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (!parsed.profile || typeof parsed.step !== "number") return null;
    // Merge onto the current shape so an older saved session cannot arrive
    // missing a field the app now reads.
    return {
      profile: { ...emptyProfile, ...parsed.profile },
      step: parsed.step,
      started: Boolean(parsed.started),
    };
  } catch {
    return null;
  }
}

export function save(state: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Nothing to do — the conversation still works, it just will not survive a refresh.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
