# Awaiting approval — and it has no number

Everything sitting here **has not been approved yet**, and therefore **must not be run**.

## The rule

> A file awaiting approval does not get a migration number.
> **The number is given at the moment of approval, and it is the mark of approval.**

Proposed by Kody, approved by Guy, 08.09.

## Why this is stronger than an orderly batch

Guy's original proposal was that what awaits approval would not go into the same batch as
what is approved. That is correct — **but it is a promise by whoever assembles the batch.** It
relies on my not having made a mistake.

**A number is a fact Neta sees.** A file without a number says "not for running" without her
having to remember anything, and without her having to trust me.

🔴 **And that is exactly what would have prevented what happened with 036:** she ran it before
Guy's final approval **because it looked ready — it had a number.**

## Why a folder and not a suffix

`_pending` in the file name leaves it in the same folder, sorted among the numbered
files. It looks like one of them, and a suffix is exactly the kind of detail that disappears
in a copy, in a rename, or at a quick glance over a long list.

**A separate folder takes the file out of the list.** You cannot miss it by accident.

## The move

On approval: `git mv` to the `db/migrations/` folder **with a number**, in the same commit
that refers to the approval itself. That way the moment of approval and the moment the number is given are the same moment in history.

## Enforced by a test, not by memory

`apps/web/src/lib/__tests__/migration-numbering.test.ts` fails the build on:

- a `.sql` file in `db/migrations/` without a number at its start
- a file in `pending/` **with** a number — that is, one that already received the mark of approval
  and stayed here

⚠️ A rule enforced only in a comment is a rule that depends on the memory of whoever writes, and that is exactly
the weakness this proposal is meant to remove.
