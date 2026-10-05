import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TicketsService } from '../../../core/services/tickets';
import { ReviewsService } from '../../../core/services/reviews';
import { AuthService } from '../../../core/services/auth';
import { PosterRespaldo } from '../../../shared/directives/poster-respaldo';

interface PeliculaVista {
    movieId: string;
    titulo: string;
    poster: string | null;
    fecha: string;
    funciones: number;
    miPuntaje: number | null;
}

@Component({
    selector: 'app-my-movies',
    imports: [RouterLink, PosterRespaldo],
    templateUrl: './my-movies.html',
    styleUrl: './my-movies.scss'
})
export class MyMovies implements OnInit {
    private readonly ticketsService = inject(TicketsService);
    private readonly reviewsService = inject(ReviewsService);
    private readonly auth = inject(AuthService);

    protected readonly vistas = signal<PeliculaVista[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);
    protected readonly estrellas = [1, 2, 3, 4, 5];

    async ngOnInit(): Promise<void> {
        try {
            await this.auth.listo();
            const userId = this.auth.perfil()?.id;

            if (!userId) {
                return;
            }

            const compras = await this.ticketsService.misCompras(userId);
            const ahora = Date.now();

            const porPelicula = new Map<string, PeliculaVista>();

            for (const compra of compras) {
                if (compra.estado !== 'pagada' || !compra.movieId) {
                    continue;
                }

                if (new Date(compra.inicio).getTime() > ahora) {
                    continue;
                }

                const actual = porPelicula.get(compra.movieId);

                if (actual) {
                    actual.funciones++;

                    if (new Date(compra.inicio) > new Date(actual.fecha)) {
                        actual.fecha = compra.inicio;
                    }
                } else {
                    porPelicula.set(compra.movieId, {
                        movieId: compra.movieId,
                        titulo: compra.pelicula,
                        poster: compra.poster,
                        fecha: compra.inicio,
                        funciones: 1,
                        miPuntaje: null
                    });
                }
            }

            const lista = [...porPelicula.values()].sort(
                (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
            );

            await Promise.all(
                lista.map(async (item) => {
                    const resenas = await this.reviewsService.listar(item.movieId);
                    item.miPuntaje =
                        resenas.find((r) => r.userId === userId)?.estrellas ?? null;
                })
            );

            this.vistas.set(lista);
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    protected fecha(iso: string): string {
        return new Date(iso).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}
