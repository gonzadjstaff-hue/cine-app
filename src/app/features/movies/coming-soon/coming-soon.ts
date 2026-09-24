import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoviesService } from '../../../core/services/movies';
import { AuthService } from '../../../core/services/auth';
import { AgeRating, Movie } from '../../../core/models/movie';

@Component({
    selector: 'app-coming-soon',
    imports: [RouterLink],
    templateUrl: './coming-soon.html',
    styleUrl: './coming-soon.scss'
})
export class ComingSoon implements OnInit {
    private readonly moviesService = inject(MoviesService);
    protected readonly auth = inject(AuthService);

    protected readonly peliculas = signal<Movie[]>([]);
    protected readonly alertas = signal<string[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);

    async ngOnInit(): Promise<void> {
        try {
            await this.auth.listo();
            this.peliculas.set(await this.moviesService.listarProximamente());

            const userId = this.auth.perfil()?.id;

            if (userId) {
                this.alertas.set(await this.moviesService.alertasDe(userId));
            }
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    protected tieneAlerta(movieId: string): boolean {
        return this.alertas().includes(movieId);
    }

    protected async alternar(movieId: string): Promise<void> {
        const userId = this.auth.perfil()?.id;

        if (!userId) {
            return;
        }

        const activar = !this.tieneAlerta(movieId);
        this.error.set(null);

        try {
            await this.moviesService.alternarAlerta(movieId, userId, activar);
            this.alertas.set(
                activar
                    ? [...this.alertas(), movieId]
                    : this.alertas().filter((id) => id !== movieId)
            );
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    protected estreno(fecha: string): string {
        return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
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
}
