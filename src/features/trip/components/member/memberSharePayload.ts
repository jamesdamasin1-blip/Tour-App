import { base64Encode } from '@/src/utils/base64';

export function buildTripShareCode(trip: any, activities: any[]) {
    if (!trip) return '';

    const tripActivities = activities.filter(activity => activity.tripId === trip.id);
    return base64Encode(JSON.stringify({
        ...trip,
        role: 'admin',
        activities: tripActivities,
        sharedAt: Date.now(),
        source: 'OrbitalGalileo',
        isCloudSynced: true,
    }));
}

export function buildTripShareQrPayload(trip: any) {
    if (!trip) return '';

    const slimWallets = (trip.wallets || []).map((wallet: any) => ({
        id: wallet.id,
        tripId: wallet.tripId,
        currency: wallet.currency,
        totalBudget: wallet.totalBudget,
        spentAmount: wallet.spentAmount || 0,
        defaultRate: wallet.defaultRate,
        baselineExchangeRate: wallet.baselineExchangeRate,
        createdAt: wallet.createdAt,
        version: wallet.version || 1,
    }));

    return base64Encode(JSON.stringify({
        id: trip.id,
        title: trip.title,
        homeCurrency: trip.homeCurrency,
        countries: trip.countries,
        startDate: trip.startDate,
        endDate: trip.endDate,
        totalBudget: trip.totalBudget,
        totalBudgetHomeCached: trip.totalBudgetHomeCached,
        lastModified: trip.lastModified || Date.now(),
        members: (trip.members || []).map((member: any) => ({
            id: member.id,
            name: member.name,
            color: member.color,
            isCreator: member.isCreator,
            role: member.role,
            userId: member.userId,
        })),
        wallets: slimWallets,
        role: 'admin',
        source: 'OrbitalGalileo',
        isCloudSynced: true,
        sharedAt: Date.now(),
    }));
}
