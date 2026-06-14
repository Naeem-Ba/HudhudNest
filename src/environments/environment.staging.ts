import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  environmentName: 'staging',

  // TODO: replace with the real Staging API origin before deploying Staging.
  baseUrl: 'https://staging-api.example.com',

  // TODO: replace with the real Staging REST API URL.
  apiUrl: 'https://staging-api.example.com/api',

  // TODO: replace with the real Staging SignalR hub URL.
  signalRUrl: 'https://staging-api.example.com/notificationHub'
};
