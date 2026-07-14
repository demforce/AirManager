/**
 * `.avatar` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/primitives.jsx#Avatar`, typed.
 */
export type AvatarColor = '' | 'amber' | 'green' | 'red' | 'violet';

export type AvatarProps = {
  init: string;
  color?: AvatarColor;
};

export function Avatar({ init, color = '' }: AvatarProps) {
  return <div className={`avatar ${color}`}>{init}</div>;
}
