export default ({ config }) => {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
    console.warn('⚠ EXPO_PUBLIC_SUPABASE_URL is not set — check your .env file');
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('⚠ EXPO_PUBLIC_SUPABASE_ANON_KEY is not set — check your .env file');
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      eas: config.extra?.eas,
      router: config.extra?.router,
    },
  };
};
