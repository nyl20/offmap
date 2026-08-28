import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';

const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? '';
const supabaseAnonKey: string = Constants.expoConfig?.extra?.supabaseAnonKey ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// export const supabase = isSupabaseConfigured
//   ? createClient(supabaseUrl, supabaseAnonKey)
//   : null;
