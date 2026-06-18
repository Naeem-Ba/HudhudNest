import {
  AppEnvironment,
  createAppEnvironment,
  readApiUrlFromProcessEnv,
  readBaseUrlFromProcessEnv,
  readSignalRUrlFromProcessEnv
} from './environment.model';

const apiBaseUrl = readApiUrlFromProcessEnv() || 'https://wohnungen-api.onrender.com/api';

export const environment: AppEnvironment = createAppEnvironment({
  production: true,
  environmentName: 'staging',
  apiBaseUrl,
  baseUrl: readBaseUrlFromProcessEnv(),
  signalRUrl: readSignalRUrlFromProcessEnv()
});
