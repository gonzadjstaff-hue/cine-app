import { Component, OnInit, inject, signal } from '@angular/core';
import { Actividad, ActivityService } from '../../../core/services/activity';

const ETIQUETAS: Record<string, string> = {
    crear_funcion: 'Creó una función',
    cambio_precio: 'Modificó un precio',
    validar_entrada: 'Validó entradas',
    entregar_candy: 'Entregó candy'
};

@Component({
    selector: 'app-activity-log',
    imports: [],
    templateUrl: './activity-log.html',
    styleUrl: './activity-log.scss'
})
export class ActivityLog implements OnInit {
    private readonly activity = inject(ActivityService);

    protected readonly registros = signal<Actividad[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);

    async ngOnInit(): Promise<void> {
        try {
            this.registros.set(await this.activity.listar());
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    protected etiqueta(accion: string): string {
        return ETIQUETAS[accion] ?? accion;
    }

    protected fecha(iso: string): string {
        return new Date(iso).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    protected detalle(registro: Actividad): string {
        const d = registro.detalle;

        if (!d) {
            return '';
        }

        switch (registro.accion) {
            case 'validar_entrada':
                return `${d['entradas']} entrada(s) de la compra ${this.corto(registro.entidadId)}`;
            case 'entregar_candy':
                return `${d['items']} item(s) de la compra ${this.corto(registro.entidadId)}`;
            case 'cambio_precio':
                return `de $${d['anterior']} a $${d['nuevo']}`;
            case 'crear_funcion':
                return `inicio ${this.fecha(d['inicio'] as string)}`;
            default:
                return JSON.stringify(d);
        }
    }

    private corto(id: string | null): string {
        return id ? id.slice(0, 8) : '';
    }
}
