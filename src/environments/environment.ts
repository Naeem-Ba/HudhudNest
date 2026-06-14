import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  environmentName: 'local',

  // Backend local HTTPS profile from PropertyApi/Properties/launchSettings.json
  baseUrl: 'https://localhost:7136',

  // REST API base URL
  apiUrl: 'https://localhost:7136/api',

  // SignalR hub URL
  signalRUrl: 'https://localhost:7136/notificationHub'
};
