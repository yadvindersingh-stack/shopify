import { DateTime } from "luxon";

export function toStoreTime(iso: string, tz: string): DateTime {
  // Shopify returns ISO timestamps with timezone info; Luxon handles it.
  return DateTime.fromISO(iso, { setZone: true }).setZone(tz);
}

export function nowInStoreTz(now: Date, tz: string): DateTime {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz);
}
