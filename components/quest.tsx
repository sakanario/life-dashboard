import { ArcChip, RO_TITLE } from "./ui";

export type QuestRow = {
  id: string;
  file: string;
  line: number;
  text: string;
  done: boolean;
  tags: string[];
  depth: number;
};

export function QuestItem({
  q,
  project,
}: {
  q: QuestRow;
  project?: { title: string; type: string | null; isArchived: boolean } | null;
}) {
  return (
    <li className={"task" + (q.done ? " done" : "")} style={q.depth ? { paddingLeft: q.depth * 18 } : undefined}>
      <button className="check" type="button" disabled title={RO_TITLE} aria-pressed={q.done} aria-label={"Tandai selesai: " + q.text} />
      <div>
        <div className="t-text">{q.text}</div>
        <div className="t-meta">
          {project ? (
            <>
              <span className={"chip " + (project.isArchived ? "" : project.type ?? "")}>{project.title}</span>
              <ArcChip show={project.isArchived} />
            </>
          ) : null}
          {q.tags.map((t) => (
            <span key={t} className="chip">
              @{t}
            </span>
          ))}
          <span className="src">
            {q.file}:{q.line}
          </span>
        </div>
      </div>
    </li>
  );
}
