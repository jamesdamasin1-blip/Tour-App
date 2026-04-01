type StoreUpdater<TState> =
    | Partial<TState>
    | ((state: TState) => Partial<TState>);

type StoreBridge<TState> = {
    getState: () => TState;
    setState: (updater: StoreUpdater<TState>) => void;
};

let storeBridge: StoreBridge<any> | null = null;

export const registerStoreBridge = <TState>(bridge: StoreBridge<TState>): void => {
    storeBridge = bridge as StoreBridge<any>;
};

export const getStoreState = <TState>(): TState => {
    if (!storeBridge) {
        throw new Error('[storeBridge] Store bridge not registered');
    }

    return storeBridge.getState() as TState;
};

export const setStoreState = <TState>(updater: StoreUpdater<TState>): void => {
    if (!storeBridge) {
        throw new Error('[storeBridge] Store bridge not registered');
    }

    storeBridge.setState(updater as StoreUpdater<any>);
};
