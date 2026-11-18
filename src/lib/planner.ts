import type { TripInput } from '../types';
import { formatDate } from './format';

export const TRIP_CONFLICT = 'Рейс уже изменили или удалили. Откройте его снова, чтобы увидеть актуальные данные.';

export function driverMessage(trip: TripInput): string {
  const heading = [trip.title, trip.date ? formatDate(trip.date) : ''].filter(Boolean).join(' · ');
  const stops = trip.stops.map((stop, index) => [
    `${index + 1}. ${stop.place}`,
    stop.address,
    stop.details,
  ].filter(Boolean).join('\n'));
  return [heading, ...stops].join('\n\n');
}
