import { BUDDY_COLORS, type TripMember } from '../types/models';

type TripLike = {
    members?: TripMember[];
    userId?: string;
};

export const getTripMembers = (trip?: TripLike | null): TripMember[] => {
    if (!Array.isArray(trip?.members)) return [];
    return trip.members.filter(Boolean);
};

const normalizeEmail = (value?: string | null): string | null => {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
};

export const ensureDistinctMemberColors = (members?: TripMember[] | null): TripMember[] => {
    if (!Array.isArray(members)) return [];

    const usedColors = new Set<string>();

    return members.filter(Boolean).map((member, index) => {
        const preferredColor = typeof member.color === 'string' && member.color.trim()
            ? member.color
            : null;
        const fallbackColor = BUDDY_COLORS[index % BUDDY_COLORS.length];
        const nextColor = preferredColor && !usedColors.has(preferredColor)
            ? preferredColor
            : BUDDY_COLORS.find(color => !usedColors.has(color)) || preferredColor || fallbackColor;

        usedColors.add(nextColor);

        if (member.color === nextColor) return member;
        return { ...member, color: nextColor };
    });
};

export const getDisplayTripMembers = (trip?: TripLike | null): TripMember[] => {
    return ensureDistinctMemberColors(getTripMembers(trip));
};

export const isCollaborativeTrip = (trip?: TripLike | null): boolean => {
    const members = getDisplayTripMembers(trip);
    if (members.length <= 1) return false;
    return members.some(member => !member.isCreator) || members.length > 1;
};

export const findCurrentTripMember = (
    trip: TripLike | null | undefined,
    identity?: {
        userId?: string | null;
        email?: string | null;
    }
): TripMember | null => {
    const members = getDisplayTripMembers(trip);
    if (members.length === 0) return null;

    const normalizedUserEmail = normalizeEmail(identity?.email);

    if (identity?.userId) {
        const byUserId = members.find(member => member.userId === identity.userId);
        if (byUserId) return byUserId;
    }

    if (normalizedUserEmail) {
        const byEmail = members.find(member => normalizeEmail(member.email) === normalizedUserEmail);
        if (byEmail) return byEmail;
    }

    if (identity?.userId && trip?.userId === identity.userId) {
        return members.find(member => member.isCreator) || null;
    }

    return null;
};

export const findAttributedMember = (
    trip: TripLike | null | undefined,
    authorId?: string | null
): TripMember | null => {
    const members = getDisplayTripMembers(trip);
    if (!authorId || members.length === 0) return null;

    const byMemberId = members.find(member => member.id === authorId);
    if (byMemberId) return byMemberId;

    const byUserId = members.find(member => member.userId === authorId);
    if (byUserId) return byUserId;

    const normalizedAuthorEmail = normalizeEmail(authorId);
    if (normalizedAuthorEmail) {
        const byEmail = members.find(member => normalizeEmail(member.email) === normalizedAuthorEmail);
        if (byEmail) return byEmail;
    }

    if (trip?.userId && trip.userId === authorId) {
        return members.find(member => member.isCreator) || null;
    }

    return null;
};
