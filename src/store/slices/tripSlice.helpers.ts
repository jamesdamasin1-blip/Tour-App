import type { TripMember, TripPlan, Wallet } from '../../types/models';
import { BUDDY_COLORS } from '../../types/models';
import { generateId } from '../../utils/mathUtils';
import { ensureDistinctMemberColors } from '../../utils/memberAttribution';
import { buildTripDisplayFields } from '../../utils/tripDisplayFields';
import { stampFieldUpdates, supabase } from '../storeHelpers';

export const normalizeTripWallet = (
    tripId: string,
    wallet: Omit<Wallet, 'id' | 'tripId' | 'spentAmount'> & { id?: string },
    existingWallet?: Wallet
): Wallet => {
    const now = Date.now();
    const normalized: Wallet = {
        ...(existingWallet || ({} as Wallet)),
        ...wallet,
        id: wallet.id || existingWallet?.id || generateId(),
        tripId,
        spentAmount: existingWallet?.spentAmount || 0,
        version: existingWallet?.version || 1,
        createdAt: existingWallet?.createdAt || wallet.createdAt || now,
        deletedAt: null,
    };
    normalized.fieldUpdates = stampFieldUpdates(existingWallet?.fieldUpdates, normalized, now);
    return normalized;
};

export const resolveCurrentAuthUserId = async (
    fallbackUserId: string | null | undefined
): Promise<string | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.error('[Trip] Failed to resolve auth user:', error);
    }
    return data.user?.id || fallbackUserId || null;
};

export const applyTripWalletDerivedFields = (trip: TripPlan, wallets: Wallet[]): TripPlan => {
    return {
        ...trip,
        wallets,
        ...buildTripDisplayFields(wallets, trip.homeCurrency),
    };
};

export const normalizeImportedTripMembers = (
    members?: TripMember[] | null
): TripMember[] => ensureDistinctMemberColors(members);

export const buildNewTripPlan = (
    tripData: Omit<TripPlan, 'id' | 'isCompleted' | 'lastModified' | 'wallets'> & {
        id?: string;
        wallets: (Omit<Wallet, 'id' | 'tripId' | 'spentAmount'> & { id?: string })[];
    },
    id: string,
    wallets: Wallet[],
    lastModified: number,
    authUserId: string,
    creatorProfile?: {
        displayName?: string | null;
        email?: string | null;
    }
): TripPlan => {
    const existingMembers = normalizeImportedTripMembers(tripData.members);
    const hasCreatorMember = existingMembers.some(member =>
        member?.isCreator === true || member?.userId === authUserId
    );
    const creatorColor = BUDDY_COLORS.find(color => !existingMembers.some(member => member.color === color))
        || BUDDY_COLORS[0];
    const creatorName = creatorProfile?.displayName?.trim()
        || creatorProfile?.email?.split('@')[0]
        || 'Me';
    const members: TripMember[] = hasCreatorMember
        ? existingMembers
        : [
            {
                id: generateId(),
                name: creatorName,
                color: creatorColor,
                isCreator: true,
                role: 'editor',
                userId: authUserId,
                email: creatorProfile?.email || undefined,
                addedAt: lastModified,
            },
            ...existingMembers,
        ];

    const draft = {
        ...tripData,
        id,
        wallets,
        members,
        isCompleted: false,
        lastModified,
        version: 1,
        deletedAt: null,
        isCloudSynced: true,
        userId: authUserId,
    } as TripPlan;

    const nextTrip = applyTripWalletDerivedFields(draft, wallets);
    nextTrip.fieldUpdates = stampFieldUpdates({}, nextTrip, lastModified);
    return nextTrip;
};
