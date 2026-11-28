import { Spark } from 'airops';

// Tiny inline trend line; color follows the trend token (KPI uses the same mapping).
export const Trends = () => (
  <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
    <span style={{ color: 'var(--ok)' }}><Spark data={[18, 22, 19, 25, 24, 28, 31, 30, 34, 37]} color="var(--ok)" /></span>
    <span><Spark data={[12, 11, 13, 10, 9, 10, 8, 9, 7, 8]} color="var(--bad)" /></span>
    <span><Spark data={[24, 26, 25, 27, 25, 26, 24, 26, 25, 26]} color="var(--ink-4)" /></span>
  </div>
);

// Larger box via w/h (defaults 64x20).
export const Sized = () => (
  <Spark data={[3, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12, 15]} w={220} h={48} color="var(--accent)" />
);
