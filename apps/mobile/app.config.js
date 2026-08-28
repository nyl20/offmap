export default {
  expo: {
    name: 'OFFMAP',
    slug: 'OFFMAP',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'offmap',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: 'com.nyl20.OFFMAP',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      ['@rnmapbox/maps', { RNMapboxMapsVersion: '11.20.1' }],
      [
        'expo-location',
        { locationWhenInUsePermission: 'OFFMAP uses your location to show nearby events on the map.' },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      mapboxToken: process.env.MAPBOX_TOKEN,
    },
  },
};
