import { useState } from "react";

/**
 * רכיבי המענה שמוטבעים בתוך הבועה של טים.
 *
 * 🔴 **דרישת פולה (26.09): "לא פאנל צף נפרד".** הבחירה יושבת באותה
 * הודעה ששואלת, ולכן הרכיבים האלה מרונדרים בתוך הבועה ולא מתחת לצ'אט.
 *
 * ⚠️ **וכולם מייצרים טקסט.** מה שנשלח לטים הוא משפט עברי רגיל, בדיוק
 * כמו הקלדה — כדי שההיסטוריה תישאר שיחה אחת ולא תערובת של שיחה
 * וטופס. זה גם מה שמאפשר למשתמשת לענות בהקלדה במקום, אם היא מעדיפה.
 */

export interface UiHint {
  kind: "group" | "heights" | "choice" | "chips";
  options?: string[];
  count?: number;
}

interface Props {
  ui: UiHint;
  onAnswer: (text: string) => void;
  busy: boolean;
}

/** בורר מספר — פחות, ערך, יותר. */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      {/* ⚠️ הסדר כאן הוא הסדר החזותי אחרי היפוך RTL: הכפתורים
          משני צידי המספר, ולכן "−" ראשון ו"+" אחרון בקוד. */}
      <button
        type="button"
        aria-label={`פחות ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output className="stepper__value">{value}</output>
      <button
        type="button"
        aria-label={`עוד ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

export function AskWidget({ ui, onAnswer, busy }: Props) {
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  /**
   * ⚠️ **ריק הוא ערך, ולא אפס.** פולה: השדה חייב לקבל "לא יודע/ת".
   * וזה גם הכלל של הפרויקט — NULL אינו 0, ו-0 פירושו "נבדק ואין
   * מגבלה". שדה ריק נשלח כ"לא יודעת", ולעולם לא כמספר.
   */
  const [heights, setHeights] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");

  if (ui.kind === "group") {
    return (
      <div className="askw">
        <Stepper label="מבוגרים" value={adults} min={1} max={10} onChange={setAdults} />
        <Stepper label="ילדים" value={kids} min={0} max={10} onChange={setKids} />
        <button
          type="button"
          className="askw__send"
          disabled={busy}
          onClick={() =>
            onAnswer(
              kids === 0
                ? `${adults} מבוגרים, בלי ילדים`
                : `${adults} מבוגרים ו-${kids} ילדים`,
            )
          }
        >
          המשך
        </button>
      </div>
    );
  }

  if (ui.kind === "heights") {
    const n = ui.count ?? 1;
    const at = (i: number) => heights[i] ?? "";
    return (
      <div className="askw askw--col">
        {Array.from({ length: n }, (_, i) => (
          <label key={i} className="askw__field">
            <span>גובה ילד/ה {i + 1}</span>
            <input
              type="number"
              inputMode="numeric"
              min={40}
              max={200}
              placeholder="ס״מ"
              value={at(i)}
              onChange={(e) =>
                setHeights((h) => {
                  const next = [...h];
                  next[i] = e.target.value;
                  return next;
                })
              }
            />
          </label>
        ))}
        <p className="askw__hint">אפשר להשאיר ריק אם לא יודעים.</p>
        <button
          type="button"
          className="askw__send"
          disabled={busy}
          onClick={() => {
            const said = Array.from({ length: n }, (_, i) => {
              const v = at(i).trim();
              // 🔴 ריק נאמר במפורש. שתיקה עליו הייתה נקראת כאפס.
              return v === "" ? `ילד/ה ${i + 1}: לא יודעת` : `ילד/ה ${i + 1}: ${v} ס״מ`;
            });
            onAnswer(said.join(", "));
          }}
        >
          המשך
        </button>
      </div>
    );
  }

  if (ui.kind === "choice") {
    return (
      <div className="askw askw--wrap">
        {(ui.options ?? []).map((o) => (
          <button
            key={o}
            type="button"
            className="askw__opt"
            disabled={busy}
            onClick={() => onAnswer(o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }

  // chips — בחירה מרובה, ועוד "אחר" בטקסט חופשי (דרישת פולה).
  const toggle = (o: string) =>
    setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));

  return (
    <div className="askw askw--col">
      <div className="askw--wrap">
        {(ui.options ?? []).map((o) => (
          <button
            key={o}
            type="button"
            className={picked.includes(o) ? "askw__chip askw__chip--on" : "askw__chip"}
            aria-pressed={picked.includes(o)}
            onClick={() => toggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <input
        className="askw__other"
        placeholder="אחר — אפשר לכתוב"
        value={other}
        onChange={(e) => setOther(e.target.value)}
      />
      <button
        type="button"
        className="askw__send"
        disabled={busy}
        onClick={() => {
          const all = [...picked, ...(other.trim() ? [other.trim()] : [])];
          // ⚠️ "לא בחרתי כלום" אינו שתיקה — הוא תשובה, והיא נאמרת.
          onAnswer(all.length === 0 ? "אין לנו רגישויות מיוחדות" : all.join(", "));
        }}
      >
        המשך
      </button>
    </div>
  );
}
