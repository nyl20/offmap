import { Link, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.backgroundElement,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Featured',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              tintColor={color}
              name={{ ios: 'sparkles', android: 'star', web: 'star' }}
              size={size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              tintColor={color}
              name={{ ios: 'map', android: 'map', web: 'map' }}
              size={size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          headerShown: true,
          headerTitle: '',
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerRight: () => (
            <Link href="/profile" asChild>
              <Pressable style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <SymbolView
                  tintColor={colors.text}
                  name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
                  size={26}
                />
              </Pressable>
            </Link>
          ),
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              tintColor={color}
              name={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
