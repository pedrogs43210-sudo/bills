import { personDisc, personInitial } from "../lib/personColor";
import type { Person } from "../types";

/**
 * Rule 4 — a person, a group and a verb look different, and all three are 44px.
 *
 * The discs are `aria-hidden`: they are a visual restatement of the name beside them, so a
 * screen reader announcing "A Ana" would be reading the same person twice.
 */

export function Disc({ person, small, inverted }: { person: Person; small?: boolean; inverted?: boolean }) {
  const fill = personDisc(person.color);
  return (
    <span
      aria-hidden="true"
      className={`disc${small ? " disc-sm" : ""}`}
      style={inverted ? { background: "#fff", color: fill } : { background: fill }}
    >
      {personInitial(person.name)}
    </span>
  );
}

/**
 * A person: fully round, their own colour. Selected fills the whole chip with the deeper disc
 * colour and turns the label white — a solid fill rather than the 3px outline this replaces,
 * which existed only because a fill could not be made legible across eight pastels. The disc
 * inverts so it stays visible against its own colour.
 */
export function PersonChip({
  person,
  selected,
  onClick,
}: {
  person: Person;
  selected: boolean;
  onClick: () => void;
}) {
  const fill = personDisc(person.color);
  return (
    <button
      type="button"
      className={`chip chip-person${selected ? " selected" : ""}`}
      aria-pressed={selected}
      style={
        selected
          ? { background: fill, borderColor: fill, color: "#fff" }
          : { background: person.color, borderColor: "transparent" }
      }
      onClick={onClick}
    >
      <Disc person={person} inverted={selected} />
      {person.name}
    </button>
  );
}

/** A group: squarer corners and a stack of member discs. A collective noun. */
export function GroupChip({
  label,
  members,
  selected,
  onClick,
}: {
  label: string;
  members: Person[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip chip-group${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="disc-stack">
        {members.slice(0, 4).map((p) => (
          <Disc key={p.id} person={p} small />
        ))}
      </span>
      {label}
    </button>
  );
}

/** An action: no fill, dashed edge, emoji up front. A verb. */
export function ActionChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="chip chip-action" onClick={onClick}>
      {children}
    </button>
  );
}
