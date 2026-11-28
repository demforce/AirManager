/** An installation without an operational-mail setting keeps its existing deliveries. */
export const DEFAULT_NOTIFICATIONS = {
  negativeBalance: true,
  bookingDenied: true,
  aircraftGrounded: true,
  aircraftArchived: true,
  expiryHolder: true,
  expiryDigest: true,
};
export type NotificationKey = keyof typeof DEFAULT_NOTIFICATIONS;
export type NotificationSettings = Record<NotificationKey, boolean>;
export const NOTIFICATION_KEYS = Object.keys(DEFAULT_NOTIFICATIONS) as NotificationKey[];
