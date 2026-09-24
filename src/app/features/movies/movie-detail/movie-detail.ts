import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MoviesService } from '../../../core/services/movies';
import { BookingService } from '../../../core/services/booking';
import { ReviewsService } from '../../../core/services/reviews';
import { AuthService } from '../../../core/services/auth';
import { AgeRating, Movie } from '../../../core/models/movie';
import { FuncionDeCartelera } from '../../../core/models/booking';
import { ResumenResenas, Review } from '../../../core/models/review';

interface DiaDeFunciones {
    etiqueta: string;
    funciones: FuncionDeCartelera[];
}

@Component({
    selector: 'app-movie-detail',
    imports: [RouterLink, FormsModule],
    templateUrl: './movie-detail.html',
    styleUrl: './movie-detail.scss'
})
export class MovieDetail implements OnInit {
    readonly id = input.required<string>();

    private readonly moviesService = inject(MoviesService);
    private readonly bookingService = inject(BookingService);
    private readonly reviewsService = inject(ReviewsService);
    protected readonly auth = inject(AuthService);

    protected readonly pelicula = signal<Movie | null>(null);
    protected readonly dias = signal<DiaDeFunciones[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);
    protected readonly resenas = signal<Review[]>([]);
    protected readonly resumen = signal<ResumenResenas>({ promedio: null, cantidad: 0 });
    protected readonly guardando = signal(false);
    protected readonly estrellas = [1, 2, 3, 4, 5];
    protected miPuntaje = 0;
    protected miComentario = '';

    ngOnInit(): void {
        this.cargar();
    }

    private async cargar(): Promise<void> {
        try {
            const [pelicula, funciones] = await Promise.all([
                this.moviesService.obtener(this.id()),
                this.bookingService.funcionesDePelicula(this.id())
            ]);

            this.pelicula.set(pelicula);
            this.dias.set(this.agrupar(funciones));
            await this.cargarResenas();
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    private agrupar(funciones: FuncionDeCartelera[]): DiaDeFunciones[] {
        const mapa = new Map<string, FuncionDeCartelera[]>();

        for (const f of funciones) {
            const clave = new Date(f.inicio).toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });

            const lista = mapa.get(clave) ?? [];
            lista.push(f);
            mapa.set(clave, lista);
        }

        return [...mapa.entries()].map(([etiqueta, funcs]) => ({
            etiqueta,
            funciones: funcs
        }));
    }

    protected hora(iso: string): string {
        return new Date(iso).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    protected etiquetaEdad(clasificacion: AgeRating): string {
        const etiquetas: Record<AgeRating, string> = {
            atp: 'ATP',
            plus13: '+13',
            plus18: '+18'
        };
        return etiquetas[clasificacion];
    }

    protected duracion(minutos: number): string {
        const horas = Math.floor(minutos / 60);
        const resto = minutos % 60;
        return horas > 0 ? `${horas} h ${resto} min` : `${resto} min`;
    }

    private async cargarResenas(): Promise<void> {
        const [lista, resumen] = await Promise.all([
            this.reviewsService.listar(this.id()),
            this.reviewsService.resumen(this.id())
        ]);

        this.resenas.set(lista);
        this.resumen.set(resumen);

        const mia = lista.find((r) => r.userId === this.auth.perfil()?.id);

        if (mia) {
            this.miPuntaje = mia.estrellas;
            this.miComentario = mia.comentario ?? '';
        }
    }

    protected miResena(): Review | undefined {
        return this.resenas().find((r) => r.userId === this.auth.perfil()?.id);
    }

    protected elegirPuntaje(valor: number): void {
        this.miPuntaje = valor;
    }

    protected fechaCorta(iso: string): string {
        return new Date(iso).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    protected async guardarResena(): Promise<void> {
        const userId = this.auth.perfil()?.id;

        if (!userId || this.miPuntaje === 0) {
            this.error.set('Eleg\u00ed una puntuaci\u00f3n antes de enviar.');
            return;
        }

        this.guardando.set(true);
        this.error.set(null);

        try {
            await this.reviewsService.guardar(
                this.id(),
                userId,
                this.miPuntaje,
                this.miComentario
            );
            await this.cargarResenas();
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.guardando.set(false);
        }
    }

    protected async borrarResena(): Promise<void> {
        const userId = this.auth.perfil()?.id;

        if (!userId) {
            return;
        }

        try {
            await this.reviewsService.borrar(this.id(), userId);
            this.miPuntaje = 0;
            this.miComentario = '';
            await this.cargarResenas();
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }
}
