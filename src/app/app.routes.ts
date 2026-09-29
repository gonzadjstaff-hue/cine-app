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
        path: 'proximamente',
        title: 'Próximamente',
        loadComponent: () =>
            import('./features/movies/coming-soon/coming-soon').then((m) => m.ComingSoon)
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
        path: 'mis-peliculas',
        title: 'Mis películas',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./features/movies/my-movies/my-movies').then((m) => m.MyMovies)
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
        // Solo el empleado ve la pantalla; en la base el admin conserva el
        // permiso (es_staff) por si tiene que validar desde la API.
        canActivate: [rolGuard(['empleado'])],
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
    {
        path: 'admin/reportes',
        title: 'Reportes',
        canActivate: [rolGuard(['admin'])],
        loadComponent: () =>
            import('./features/admin/reports/reports').then((m) => m.Reports)
    },
    {
        path: 'admin/actividad',
        title: 'Log de actividad',
        canActivate: [rolGuard(['admin'])],
        loadComponent: () =>
            import('./features/admin/activity-log/activity-log').then(
                (m) => m.ActivityLog
            )
    },
    { path: '**', redirectTo: 'cartelera' }
];