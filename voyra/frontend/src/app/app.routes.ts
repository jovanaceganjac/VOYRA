import { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { korakGuard } from './core/guards/korak.guard';
import { nesacuvanoGuard } from './core/guards/nesacuvano.guard';

/** Sve stranice se ucitavaju lenjo (loadComponent). */
export const routes: Routes = [
  {
    path: '',
    title: 'naslovi.pocetna',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomeComponent)
  },
  {
    path: 'prijava',
    title: 'naslovi.prijava',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login').then((m) => m.LoginComponent)
  },
  {
    path: 'registracija',
    title: 'naslovi.registracija',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register/register').then((m) => m.RegisterComponent)
  },
  {
    path: 'profil',
    title: 'naslovi.profil',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfileComponent)
  },

  /**
   * Čarobnjak za kreiranje putovanja (spec §4.2).
   * Korak je u URL-u, pa „Nazad" u pregledaču radi prirodno, a guard
   * sprečava preskakanje koraka.
   */
  {
    path: 'planiranje',
    loadComponent: () => import('./pages/wizard/wizard').then((m) => m.WizardComponent),
    children: [
      { path: '', redirectTo: '1', pathMatch: 'full' },
      {
        path: '1',
        title: 'naslovi.korak1',
        data: { korak: 1 },
        loadComponent: () =>
          import('./pages/wizard/korak1-parametri').then((m) => m.Korak1Component)
      },
      {
        path: '2',
        title: 'naslovi.korak2',
        data: { korak: 2 },
        canActivate: [korakGuard],
        loadComponent: () => import('./pages/wizard/korak2-let').then((m) => m.Korak2Component)
      },
      {
        path: '3',
        title: 'naslovi.korak3',
        data: { korak: 3 },
        canActivate: [korakGuard],
        loadComponent: () => import('./pages/wizard/korak3-smestaj').then((m) => m.Korak3Component)
      },
      {
        path: '4',
        title: 'naslovi.korak4',
        data: { korak: 4 },
        canActivate: [korakGuard],
        loadComponent: () => import('./pages/wizard/korak4-plan').then((m) => m.Korak4Component)
      }
    ]
  },

  {
    // Rezervacija leta u test rezimu (spec §4.8)
    path: 'moja-putovanja/:id/rezervacija',
    title: 'naslovi.rezervacija',
    canActivate: [authGuard],
    canDeactivate: [nesacuvanoGuard],
    loadComponent: () =>
      import('./pages/rezervacija/rezervacija').then((m) => m.RezervacijaComponent)
  },
  {
    path: 'atrakcije',
    title: 'naslovi.atrakcije',
    loadComponent: () => import('./pages/atrakcije/atrakcije').then((m) => m.AtrakcijeComponent)
  },
  {
    path: 'moja-putovanja',
    title: 'naslovi.mojaPutovanja',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/my-trips/my-trips').then((m) => m.MyTripsComponent)
  },
  {
    // Stranica jednog putovanja: prikaz i izmena plana (spec §4.6)
    path: 'moja-putovanja/:id',
    title: 'naslovi.putovanje',
    canActivate: [authGuard],
    canDeactivate: [nesacuvanoGuard],
    loadComponent: () => import('./pages/trip/trip').then((m) => m.TripComponent)
  },
  /*
   * Admin panel po odeljcima (spec §10). Guard stoji i na roditelju i
   * na svakom detetu: direktan ulazak u `/admin/korisnici` ne sme da
   * zaobidje proveru zato sto roditelj nije prosao kroz navigaciju.
   */
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin-panel').then((m) => m.AdminPanelComponent),
    children: [
      {
        path: '',
        title: 'naslovi.admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/pregled').then((m) => m.AdminPregledComponent)
      },
      {
        path: 'zahtevi',
        title: 'naslovi.adminZahtevi',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/zahtevi').then((m) => m.AdminZahteviComponent)
      },
      {
        path: 'korisnici',
        title: 'naslovi.adminKorisnici',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/korisnici').then((m) => m.AdminKorisniciComponent)
      },
      {
        path: 'destinacije',
        title: 'naslovi.adminDestinacije',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/destinacije').then((m) => m.AdminDestinacijeComponent)
      },
      {
        path: 'atrakcije',
        title: 'naslovi.atrakcije',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/atrakcije').then((m) => m.AdminAtrakcijeComponent)
      },
      {
        path: 'kategorije',
        title: 'naslovi.adminKategorije',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/kategorije').then((m) => m.AdminKategorijeComponent)
      },
      {
        path: 'statistika',
        title: 'naslovi.adminStatistika',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/admin/odeljci/statistika').then((m) => m.AdminStatistikaComponent)
      }
    ]
  },
  {
    path: '**',
    title: 'naslovi.nijePronadjena',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundComponent)
  }
];
