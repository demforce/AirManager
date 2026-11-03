/**
 * `.avatar` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/primitives.jsx#Avatar`, typed.
 */
export type AvatarColor = '' | 'amber' | 'green' | 'red' | 'violet';

export type AvatarProps = {
  init: string;
  color?: AvatarColor;
  /**
   * Story 15.5: the person rows of the phone registries are ONE `<button>`
   * (R-15.2-b), whose content model is phrasing content — a `<div>` inside it
   * is invalid markup. The tag is therefore a prop with the original default,
   * not a second `.avatar` implementation copied into those rows. `.avatar` is
   * `display: grid`, so the computed box is identical either way.
   */
  as?: 'div' | 'span';
};

export function Avatar({ init, color = '', as: Tag = 'div' }: AvatarProps) {
  return <Tag className={`avatar ${color}`}>{init}</Tag>;
}
