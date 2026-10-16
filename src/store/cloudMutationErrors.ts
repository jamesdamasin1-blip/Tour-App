export const isAlreadyDeletedCloudError = (
    error: unknown,
    entity: 'activity' | 'expense'
): boolean => {
    const message = typeof (error as any)?.message === 'string'
        ? ((error as any).message as string).toLowerCase()
        : '';

    return message.includes(`${entity} not found`);
};
