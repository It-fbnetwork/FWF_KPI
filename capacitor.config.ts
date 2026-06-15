import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.facewashfox.kpi',
  appName: 'FWF KPI',
  webDir: 'capacitor-www',
  backgroundColor: '#020617',
  zoomEnabled: false,
  ios: {
    contentInset: 'never',
    backgroundColor: '#020617',
    zoomEnabled: false,
  },
  android: {
    backgroundColor: '#020617',
    zoomEnabled: false,
  },
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
