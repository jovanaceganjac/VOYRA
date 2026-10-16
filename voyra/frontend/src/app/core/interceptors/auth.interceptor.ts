import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

/**
 * Dodaje Bearer token samo na nase rute (/api i /v1).
 * Spoljni zahtevi ne smeju da nose korisnikov token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const nasaRuta = req.url.startsWith('/api') || req.url.startsWith('/v1');

  if (!nasaRuta) return next(req);

  const token = inject(AuthService).token;

  if (!token) return next(req);

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
  );
};
