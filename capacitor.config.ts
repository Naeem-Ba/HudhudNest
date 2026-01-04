import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.realestate.app',
  appName: 'Real Estate World',
  webDir: 'dist/Wohnungsmieten/browser',
  server: {
    androidScheme: 'https', // أضف هذا السطر ضروري جداً
    cleartext: true,
    allowNavigation: ['realestateworld.world'],
  }
};

export default config;
