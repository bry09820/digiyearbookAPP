/**
 * Dynamic Expo config for EAS / local builds.
 * Prefer EXPO_PUBLIC_API_URL (HTTPS in production). Cleartext HTTP is only
 * enabled when the configured API URL is explicitly http:// (local/dev).
 */
const appJson = require('./app.json');

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const needsCleartext = !apiUrl || apiUrl.startsWith('http://');

module.exports = {
  expo: {
    ...appJson.expo,
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: appJson.expo.ios?.bundleIdentifier || 'edu.nulipa.yearbook',
    },
    android: {
      ...appJson.expo.android,
      package: appJson.expo.android?.package || 'edu.nulipa.yearbook',
      usesCleartextTraffic: needsCleartext,
    },
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        ...(appJson.expo.extra?.eas || {}),
        // Set via `eas init` / EAS dashboard if missing.
        projectId: process.env.EAS_PROJECT_ID || appJson.expo.extra?.eas?.projectId,
      },
    },
  },
};
