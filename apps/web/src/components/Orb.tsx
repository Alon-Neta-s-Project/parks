/** Tim's whole visual signature. No face, no mascot — a presence. */
export function Orb({ large = false }: { large?: boolean }) {
  return <span className={large ? "orb orb--lg" : "orb"} aria-hidden="true" />;
}
