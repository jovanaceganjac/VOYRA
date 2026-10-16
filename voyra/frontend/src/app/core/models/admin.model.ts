import { StatusNaloga, Telefon, Uloga } from './user.model';

/** GET /api/admin/users -> data[] */
export interface AdminKorisnik {
  _id: string;
  ime: string;
  prezime: string;
  email: string;
  korisnickoIme: string;
  uloga: Uloga;
  status: StatusNaloga;
  phone?: Telefon | null;
  createdAt: string;
  updatedAt: string;
}

export interface ZdravljeServisa {
  status: 'UP' | 'DOWN';
  lastCheck: string;
  responseTime: number;
}

/** GET /api/admin/stats -> data */
export interface StatistikaSistema {
  totalUsers: number;
  activeUsers: number;
  usersByStatus: Record<string, number>;
  usersByRole: Record<string, number>;
  totalTrips: number;
  tripsByStatus: Record<string, number>;
  totalBookings: number;
  apiHealth: Record<string, ZdravljeServisa>;
  responseTime: number;
  timestamp: string;
}
