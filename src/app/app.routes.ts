import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { rolGuard } from './core/guards/rol-guard';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'cartelera' },
    {
        path: 'cartelera',
        title: 'Cartelera',
        loadComponent: () =>
            import('./features/movies/movie-list/movie-list').then((m) => m.MovieList)
    },
    {
        path: 'pelicula/:id',
        title: 'Película',
        loadComponent: () =>
            import('./features/movies/movie-detail/movie-detail').then(
                (m) => m.MovieDetail
            )
    },
    {
        path: 'funcion/:id',
        title: 'Elegir butacas',
        loadComponent: () =>
            import('./features/booking/seat-selection/seat-selection').then(
                (m) => m.SeatSelection
            )
    },
    {
        path: 'ingresar',
        title: 'Ingresar',
        loadComponent: () => import('./features/auth/login/login').then((m) => m.Login)
    },
    {
        path: 'registro',
        title: 'Crear cuenta',
        loadComponent: () =>
            import('./features/auth/register/register').then((m) => m.Register)
    },
    {
        path: 'mis-compras',
        title: 'Mis compras',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./features/orders/my-orders/my-orders').then((m) => m.MyOrders)
    },
    {
        path: 'validar',
        title: 'Validar entrada',
        canActivate: [rolGuard(['empleado', 'admin'])],
        loadComponent: () =>
            import('./features/staff/validate/validate').then((m) => m.Validate)
    },
    {
        path: 'admin/peliculas',
        title: 'Administrar películas',
        canActivate: [rolGuard(['admin'])],
        loadComponent: () =>
            import('./features/admin/movie-admin/movie-admin').then((m) => m.MovieAdmin)
    },
    {
        path: 'admin/funciones',
        title: 'Programar funciones',
        canActivate: [rolGuard(['admin'])],
        loadComponent: () =>
            import('./features/admin/showtime-admin/showtime-admin').then(
                (m) => m.ShowtimeAdmin
            )
    },
    { path: '**', redirectTo: 'cartelera' }
];