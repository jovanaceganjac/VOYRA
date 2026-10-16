import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { NaslovStrategija } from './core/i18n/naslov.strategy';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Projekat koristi zone.js polyfill (angular.json), pa ide zone-based
    // detekcija promena; eventCoalescing smanjuje broj provera.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // Naslovi stranica se prevode na aktivni jezik
    { provide: TitleStrategy, useClass: NaslovStrategija },
    // Redosled je bitan: auth dodaje token, error hvata odgovor
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))
  ]
};
