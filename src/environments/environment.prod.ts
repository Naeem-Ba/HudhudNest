import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  environmentName: 'production',

  // TODO: replace with the real Production API origin before production release.
  baseUrl: 'https://api.example.com',

  // TODO: replace with the real Production REST API URL.
  apiUrl: 'https://api.example.com/api',

  // TODO: replace with the real Production SignalR hub URL.
  signalRUrl: 'https://api.example.com/notificationHub'
};
