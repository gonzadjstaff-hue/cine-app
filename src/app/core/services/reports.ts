import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { FilaFacturacion, FilaRanking } from '../models/report';

@Injectable({
    providedIn: 'root'
})
export class ReportsService {
    private readonly supabase = inject(SupabaseService);

    async facturacion(desde: string, hasta: string): Promise<FilaFacturacion[]> {
        const { data, error } = await this.supabase.client.rpc('reporte_facturacion', {
            p_desde: desde,
            p_hasta: hasta
        });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
            dia: f['dia'] as string,
            entradas: Number(f['entradas']),
            montoEntradas: Number(f['monto_entradas']),
            montoCandy: Number(f['monto_candy']),
            total: Number(f['total'])
        }));
    }

    async peliculas(desde: Date, limite = 8): Promise<FilaRanking[]> {
        const { data, error } = await this.supabase.client.rpc('ranking_peliculas', {
            p_desde: desde.toISOString(),
            p_limite: limite
        });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
            nombre: f['titulo'] as string,
            unidades: Number(f['entradas']),
            monto: Number(f['monto'])
        }));
    }

    async candy(limite = 8): Promise<FilaRanking[]> {
        const { data, error } = await this.supabase.client.rpc('ranking_candy', {
            p_limite: limite
        });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
            nombre: f['producto'] as string,
            unidades: Number(f['unidades']),
            monto: Number(f['monto'])
        }));
    }
}
