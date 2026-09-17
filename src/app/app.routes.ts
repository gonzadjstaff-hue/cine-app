import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'cartelera' },
    {
        path: 'cartelera',
        title: 'Cartelera',
        loadComponent: () =>
            import('./features/movies/movie-list/movie-list').then((m) => m.MovieList)
    },
    { path: '**', redirectTo: 'cartelera' }
];