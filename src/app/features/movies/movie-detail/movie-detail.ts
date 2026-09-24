import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoviesService } from '../../../core/services/movies';
import { BookingService } from '../../../core/services/booking';
import { AgeRating, Movie } from '../../../core/models/movie';
import { FuncionDeCartelera } from '../../../core/models/booking';

interface DiaDeFunciones {
    etiqueta: string;
    funciones: FuncionDeCartelera[];
}

@Component({
    selector: 'app-movie-detail',
    imports: [RouterLink],
    templateUrl: './movie-detail.html',
    styleUrl: './movie-detail.scss'
})
export class MovieDetail implements OnInit {
    readonly id = input.required<string>();

    private readonly moviesService = inject(MoviesService);
    private readonly bookingService = inject(BookingService);

    protected readonly pelicula = signal<Movie | null>(null);
    protected readonly dias = signal<DiaDeFunciones[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);

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
}
