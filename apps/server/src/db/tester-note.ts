import type { NoteStore } from "../note";
import { connect } from "./client";

/**
 * Saving a tester's note — what `save_tester_note` did in the database, now from the server
 * (O13: "save_tester_note through the server"), without its key check (Alon, 01.10).
 *
 * ⚠️ The same cap: the 500 newest notes are kept. A page stuck in a loop must not fill the database.
 */
export function noteStore(url: string | undefined): NoteStore | undefined {
  if (!url?.trim()) return undefined;
  const sql = connect(url);
  return {
    async save(n) {
      await sql.begin(async (tx) => {
        await tx`insert into tester_note (turn_ref, session_ref, note, question, answer)
                 values (${n.turnRef}, ${n.sessionRef}, ${n.note}, ${n.question}, ${n.answer})`;
        await tx`delete from tester_note
                  where id in (select id from tester_note order by created_at desc offset 500)`;
      });
    },
  };
}
