import dayjs, { type Dayjs } from 'dayjs';
import { COUNTRY_TIMEZONE_MAPPING, DEFAULT_TRIP_TIMEZONE } from '../data/countryTimezones';

const TRIP_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TRIP_DATE_KEY_FORMAT = 'YYYY-MM-DD';

type TripDateInput = Dayjs | Date | string | number | null | undefined;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (
    locale: string,
    timeZone: string,
    options: Intl.DateTimeFormatOptions
) => {
    const cacheKey = JSON.stringify([locale, timeZone, options]);
    const cached = formatterCache.get(cacheKey);
    if (cached) return cached;

    const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formatterCache.set(cacheKey, formatter);
    return formatter;
};

const formatPartsToKey = (parts: Intl.DateTimeFormatPart[]) => {
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;

    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
};

export const getTripTimeZone = (homeCountry?: string | null) =>
    COUNTRY_TIMEZONE_MAPPING[homeCountry || ''] || DEFAULT_TRIP_TIMEZONE;

export const isTripDateKey = (value: unknown): value is string =>
    typeof value === 'string' && TRIP_DATE_KEY_PATTERN.test(value);

export const getTripDateKeyFromTimestamp = (
    timestamp: number | null | undefined,
    homeCountry?: string | null
) => {
    if (!Number.isFinite(timestamp)) return null;

    const formatter = getFormatter('en-CA', getTripTimeZone(homeCountry), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    return formatPartsToKey(formatter.formatToParts(new Date(Number(timestamp))));
};

export const resolveTripDateKey = (
    dateKey?: string | null,
    timestamp?: number | null,
    homeCountry?: string | null
) => {
    if (isTripDateKey(dateKey)) return dateKey;
    return getTripDateKeyFromTimestamp(timestamp, homeCountry);
};

export const toTripDateKey = (value: TripDateInput) => {
    if (!value) return null;
    if (isTripDateKey(value)) return value;

    const parsed = dayjs(value);
    if (!parsed.isValid()) return null;
    return parsed.format(TRIP_DATE_KEY_FORMAT);
};

export const toTripDateTimestamp = (value: TripDateInput) => {
    const parsed = dayjs(value);
    if (!parsed.isValid()) return null;

    return parsed
        .hour(12)
        .minute(0)
        .second(0)
        .millisecond(0)
        .valueOf();
};

export const buildTripDateFields = (startDate: TripDateInput, endDate: TripDateInput) => ({
    startDate: toTripDateTimestamp(startDate),
    endDate: toTripDateTimestamp(endDate),
    startDateKey: toTripDateKey(startDate),
    endDateKey: toTripDateKey(endDate),
});

const getUtcAnchorDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);

export const formatTripDate = ({
    dateKey,
    timestamp,
    homeCountry,
    locale = 'en-US',
    options,
}: {
    dateKey?: string | null;
    timestamp?: number | null;
    homeCountry?: string | null;
    locale?: string;
    options: Intl.DateTimeFormatOptions;
}) => {
    const resolvedKey = resolveTripDateKey(dateKey, timestamp, homeCountry);
    if (resolvedKey) {
        return getFormatter(locale, 'UTC', options).format(getUtcAnchorDate(resolvedKey));
    }

    if (!Number.isFinite(timestamp)) return '';
    return getFormatter(locale, getTripTimeZone(homeCountry), options).format(new Date(Number(timestamp)));
};

export const formatTripDateRange = ({
    startDateKey,
    startDate,
    endDateKey,
    endDate,
    homeCountry,
    locale = 'en-US',
}: {
    startDateKey?: string | null;
    startDate?: number | null;
    endDateKey?: string | null;
    endDate?: number | null;
    homeCountry?: string | null;
    locale?: string;
}) => {
    const start = formatTripDate({
        dateKey: startDateKey,
        timestamp: startDate,
        homeCountry,
        locale,
        options: { month: 'short', day: 'numeric' },
    });
    const end = formatTripDate({
        dateKey: endDateKey,
        timestamp: endDate,
        homeCountry,
        locale,
        options: { month: 'short', day: 'numeric', year: 'numeric' },
    });

    if (!start && !end) return '';
    if (!start) return end;
    if (!end) return start;
    return `${start} - ${end}`;
};

export const getTripDurationDays = (
    startDateKey?: string | null,
    endDateKey?: string | null,
    startDate?: number | null,
    endDate?: number | null,
    homeCountry?: string | null
) => {
    const resolvedStart = resolveTripDateKey(startDateKey, startDate, homeCountry);
    const resolvedEnd = resolveTripDateKey(endDateKey, endDate, homeCountry);

    if (resolvedStart && resolvedEnd) {
        const start = dayjs(resolvedStart, TRIP_DATE_KEY_FORMAT, true);
        const end = dayjs(resolvedEnd, TRIP_DATE_KEY_FORMAT, true);
        if (start.isValid() && end.isValid()) {
            return Math.max(end.diff(start, 'day') + 1, 1);
        }
    }

    if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return 0;
    return Math.max(Math.ceil((Number(endDate) - Number(startDate)) / (1000 * 60 * 60 * 24)) + 1, 1);
};

export const getTripDatePickerDate = (
    dateKey?: string | null,
    timestamp?: number | null,
    homeCountry?: string | null
) => {
    const resolvedKey = resolveTripDateKey(dateKey, timestamp, homeCountry);
    if (resolvedKey) {
        const [year, month, day] = resolvedKey.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0, 0);
    }

    if (!Number.isFinite(timestamp)) return null;
    return new Date(Number(timestamp));
};
