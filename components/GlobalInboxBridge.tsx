import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuth } from '@/src/hooks/useAuth';
import { inviteService } from '@/src/services/inviteService';
import { useStore } from '@/src/store/useStore';
import { syncTrace } from '@/src/sync/debug';
import { buildInboxItems, type InboxItem } from '@/src/features/inbox/inboxItems';

export const GlobalInboxBridge = () => {
    const router = useRouter();
    const pathname = usePathname();
    const { email, isAuthenticated } = useAuth();
    const invites = useStore(state => state.invites);
    const deletionRequests = useStore(state => state.deletionRequests);
    const loadReceivedInvites = useStore(state => state.loadReceivedInvites);
    const addRealtimeInvite = useStore(state => state.addRealtimeInvite);
    const setTripsSidebarOpen = useStore(state => state.setTripsSidebarOpen);

    const [activePrompt, setActivePrompt] = useState<InboxItem | null>(null);
    const seenKeysRef = useRef<Set<string>>(new Set());
    const primedRef = useRef(false);

    const inboxItems = useMemo(
        () => buildInboxItems(invites, deletionRequests),
        [deletionRequests, invites]
    );

    useEffect(() => {
        if (!isAuthenticated || !email) {
            primedRef.current = false;
            seenKeysRef.current = new Set();
            setActivePrompt(null);
            return;
        }

        let mounted = true;

        const primeInvites = async () => {
            await loadReceivedInvites(email);
            if (!mounted || primedRef.current) return;

            const items = buildInboxItems(
                useStore.getState().invites,
                useStore.getState().deletionRequests
            );
            seenKeysRef.current = new Set(items.map(item => item.key));
            primedRef.current = true;
            syncTrace('Inbox', 'primed', { count: items.length, pathname });
        };

        void primeInvites();

        const unsubscribe = inviteService.subscribeToInvites(email, invite => {
            addRealtimeInvite(invite);
        });

        const appStateSub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                void loadReceivedInvites(email);
            }
        });

        return () => {
            mounted = false;
            unsubscribe();
            appStateSub.remove();
        };
    }, [addRealtimeInvite, email, isAuthenticated, loadReceivedInvites, pathname]);

    useEffect(() => {
        if (!isAuthenticated || !primedRef.current || activePrompt) return;

        const unseen = inboxItems.find(item => !seenKeysRef.current.has(item.key));
        if (!unseen) return;

        seenKeysRef.current.add(unseen.key);
        setActivePrompt(unseen);
        syncTrace('Inbox', 'prompt_new_item', {
            kind: unseen.kind,
            tripId: unseen.tripId,
            pathname,
        });
    }, [activePrompt, inboxItems, isAuthenticated, pathname]);

    const handleCheckNow = () => {
        syncTrace('Inbox', 'prompt_check_now', {
            kind: activePrompt?.kind,
            tripId: activePrompt?.tripId,
            pathname,
        });
        setActivePrompt(null);
        setTripsSidebarOpen(true);
        if (pathname !== '/') {
            router.replace('/(tabs)' as any);
        }
    };

    return (
        <ConfirmationModal
            visible={!!activePrompt}
            onClose={() => {
                syncTrace('Inbox', 'prompt_later', {
                    kind: activePrompt?.kind,
                    tripId: activePrompt?.tripId,
                    pathname,
                });
                setActivePrompt(null);
            }}
            onConfirm={handleCheckNow}
            title={activePrompt?.kind === 'delete_request' ? 'New Delete Request' : 'New Inbox Message'}
            description={
                activePrompt?.kind === 'delete_request'
                    ? `${activePrompt.request.requestedByName} wants to delete "${activePrompt.request.activityTitle}".`
                    : activePrompt?.kind === 'invite'
                        ? `You received an invite to join "${activePrompt.invite.tripTitle}".`
                        : ''
            }
            confirmLabel="CHECK NOW"
            cancelLabel="LATER"
            type="default"
        />
    );
};
