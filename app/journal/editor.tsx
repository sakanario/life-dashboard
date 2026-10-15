"use client";

import { useState } from "react";
import { HabitRow, useHabitSetter, type HabitState } from "@/components/habits";
import { JournalForm } from "@/components/journal-form";
import { BULAN_PANJANG, HARI, fromIso, isIsoDate } from "@/lib/vault/dates";
import { journalPath } from "@/lib/vault/journal-format";
import type { getJournalPage } from "@/lib/vault/views";
import { Timeline, type TimelineRow } from "./timeline";

type Data = Awaited<ReturnType<typeof getJournalPage>>;
type Entry = Data["entries"][string];

const longDay = (s: string) => {
  const d = fromIso(s);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
};

/** Editor jurnal tanggal mana pun + timeline (tombol "Edit" di timeline ganti tanggal editor). */
export function JournalDays({
  rows,
  tags,
  today,
  entries,
  habitDefs,
}: {
  rows: TimelineRow[];
  tags: string[];
  today: string;
  entries: Data["entries"];
  habitDefs: Data["habitDefs"];
}) {
  const [date, setDate] = useState(today);

  const edit = (d: string) => {
    setDate(d);
    const el = document.getElementById("jedit");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => document.getElementById("je-hl")?.focus({ preventScroll: true }), 0);
  };

  return (
    <>
      <section className="panel" id="jedit" aria-labelledby="jedit-h">
        <div className="panel-h" style={{ flexWrap: "wrap" }}>
          <h2 id="jedit-h">Tulis jurnal</h2>
          <input
            type="date"
            className="date-in"
            aria-label="Tanggal jurnal"
            value={date}
            max={today}
            onChange={(e) => isIsoDate(e.target.value) && e.target.value <= today && setDate(e.target.value)}
          />
          {date !== today ? (
            <button className="btn sm" type="button" onClick={() => setDate(today)}>
              Hari ini
            </button>
          ) : null}
          <span className="src">{journalPath(date)}</span>
        </div>
        <DayEditor key={date} date={date} today={today} entry={entries[date] ?? null} habitDefs={habitDefs} />
      </section>

      <Timeline rows={rows} tags={tags} today={today} onEdit={edit} />
    </>
  );
}

/** Di-key per tanggal: ganti tanggal = draft & status optimistis mulai dari nol. */
function DayEditor({ date, today, entry, habitDefs }: { date: string; today: string; entry: Entry | null; habitDefs: Data["habitDefs"] }) {
  const habit = useHabitSetter(date);
  return (
    <>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: ".86rem" }}>
        {longDay(date)}
        {date === today ? " · hari ini" : ""}
        {entry ? "" : " · belum ada file, dibuat waktu disimpan"}
      </p>
      <JournalForm
        date={date}
        highlight={entry?.highlight ?? ""}
        summary={entry?.summary ?? ""}
        savedAt={entry?.savedAt ?? null}
        questsDone={entry?.questsDone ?? []}
        idPrefix="je"
      />
      {habitDefs.length ? (
        <div className="jfield" style={{ marginTop: 12 }}>
          <label>Habit</label>
          <div className="habits">
            {habitDefs.map((h) => {
              const server = (entry?.habits[h.id] ?? null) as HabitState;
              return (
                <HabitRow
                  key={h.id}
                  id={h.id}
                  label={h.label}
                  state={habit.stateOf(h.id, server)}
                  streak={null}
                  idPrefix="jh-"
                  onSet={(want) => habit.set(h.id, h.label, server, want)}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
