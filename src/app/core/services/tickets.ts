import { Injectable, inject } from '@angular/core';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { SupabaseService } from './supabase';
import { EntradaButaca, EntradaCompleta } from '../models/ticket';

const CAMPOS =
    'id, qr_codigo, total, created_at, email_contacto, estado, ' +
    'order_tickets(precio, canjeado_at, seats(fila, numero, tipo), ' +
    'showtimes(inicio, formato, idioma, rooms(nombre), movies(titulo, clasificacion)))';

function primero<T>(valor: T | T[] | null | undefined): T | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class TicketsService {
    private readonly supabase = inject(SupabaseService);

    async porId(orderId: string): Promise<EntradaCompleta> {
        const { data, error } = await this.supabase.client
            .from('orders')
            .select(CAMPOS)
            .eq('id', orderId)
            .single();

        if (error) {
            throw new Error(error.message);
        }

        return this.mapear(data as unknown as Record<string, unknown>);
    }

    async porCodigo(codigo: string): Promise<EntradaCompleta | null> {
        const { data, error } = await this.supabase.client
            .from('orders')
            .select(CAMPOS)
            .eq('qr_codigo', codigo.trim())
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        return data ? this.mapear(data as unknown as Record<string, unknown>) : null;
    }

    async misCompras(userId: string): Promise<EntradaCompleta[]> {
        const { data, error } = await this.supabase.client
            .from('orders')
            .select(CAMPOS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) =>
            this.mapear(fila as unknown as Record<string, unknown>)
        );
    }

    async canjearEntradas(orderId: string, empleadoId: string): Promise<void> {
        const { error } = await this.supabase.client
            .from('order_tickets')
            .update({ canjeado_at: new Date().toISOString(), canjeado_por: empleadoId })
            .eq('order_id', orderId)
            .is('canjeado_at', null);

        if (error) {
            throw new Error(error.message);
        }
    }

    private mapear(fila: Record<string, unknown>): EntradaCompleta {
        const tickets = (fila['order_tickets'] ?? []) as Record<string, unknown>[];
        const primerTicket = tickets[0];
        const funcion: Record<string, unknown> | null = primerTicket
            ? primero<Record<string, unknown>>(
                  primerTicket['showtimes'] as Record<string, unknown> | null
              )
            : null;
        const sala = funcion
            ? primero(funcion['rooms'] as { nombre: string } | null)
            : null;
        const peli = funcion
            ? primero(
                  funcion['movies'] as
                      | { titulo: string; clasificacion: EntradaCompleta['clasificacion'] }
                      | null
              )
            : null;

        const butacas: EntradaButaca[] = tickets.map((t) => {
            const butaca = primero(
                t['seats'] as { fila: string; numero: number; tipo: EntradaButaca['tipo'] } | null
            );

            return {
                fila: butaca?.fila ?? '',
                numero: butaca?.numero ?? 0,
                tipo: butaca?.tipo ?? 'normal',
                precio: t['precio'] as number,
                canjeada: t['canjeado_at'] !== null
            };
        });

        butacas.sort((a, b) =>
            a.fila === b.fila ? a.numero - b.numero : a.fila.localeCompare(b.fila)
        );

        return {
            orderId: fila['id'] as string,
            qr: fila['qr_codigo'] as string,
            total: fila['total'] as number,
            fechaCompra: fila['created_at'] as string,
            email: fila['email_contacto'] as string,
            estado: fila['estado'] as EntradaCompleta['estado'],
            pelicula: peli?.titulo ?? '',
            clasificacion: peli?.clasificacion ?? 'atp',
            inicio: (funcion?.['inicio'] as string) ?? '',
            sala: sala?.nombre ?? '',
            formato: (funcion?.['formato'] as string) ?? '',
            idioma: (funcion?.['idioma'] as string) ?? '',
            butacas
        };
    }

    async descargarPdf(entrada: EntradaCompleta): Promise<void> {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const qr = await QRCode.toDataURL(entrada.qr, { margin: 1, width: 400 });

        const fecha = new Date(entrada.inicio).toLocaleString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        doc.setFillColor(17, 24, 39);
        doc.rect(0, 0, 210, 26, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text('CineApp', 20, 17);
        doc.setFontSize(9);
        doc.text('Entrada electronica', 190, 17, { align: 'right' });

        doc.setTextColor(17, 24, 39);
        doc.setFontSize(20);
        doc.text(entrada.pelicula, 20, 45);

        doc.setFontSize(11);
        doc.setTextColor(75, 85, 99);
        doc.text(fecha, 20, 54);
        doc.text(
            `${entrada.sala}  |  ${entrada.formato}  |  ${entrada.idioma}`,
            20,
            61
        );

        doc.setDrawColor(229, 231, 235);
        doc.line(20, 68, 190, 68);

        doc.setTextColor(17, 24, 39);
        doc.setFontSize(12);
        doc.text('Butacas', 20, 78);

        doc.setFontSize(10);
        doc.setTextColor(75, 85, 99);

        let y = 86;

        for (const b of entrada.butacas) {
            const etiqueta = `${b.fila}${b.numero}`;
            const tipo =
                b.tipo === 'vip' ? 'VIP' : b.tipo === 'accesible' ? 'Accesible' : 'Normal';
            doc.text(`${etiqueta}   ${tipo}`, 20, y);
            doc.text(`$ ${b.precio.toLocaleString('es-AR')}`, 80, y, { align: 'right' });
            y += 6;
        }

        y += 4;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(12);
        doc.text('Total', 20, y);
        doc.text(`$ ${entrada.total.toLocaleString('es-AR')}`, 80, y, { align: 'right' });

        doc.addImage(qr, 'PNG', 130, 78, 55, 55);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text('Presentar en la puerta de la sala', 157, 138, { align: 'center' });
        doc.text(entrada.qr, 157, 143, { align: 'center' });

        if (entrada.clasificacion !== 'atp') {
            const minima = entrada.clasificacion === 'plus13' ? 13 : 18;
            doc.setFillColor(254, 243, 199);
            doc.rect(20, 160, 170, 16, 'F');
            doc.setTextColor(146, 64, 14);
            doc.setFontSize(9);
            doc.text(
                `Funcion para mayores de ${minima} anos. Los menores deben asistir`,
                25,
                167
            );
            doc.text('acompanados por un adulto responsable.', 25, 172);
        }

        doc.setTextColor(156, 163, 175);
        doc.setFontSize(8);
        doc.text(
            `Compra ${entrada.orderId}  |  ${new Date(entrada.fechaCompra).toLocaleString('es-AR')}`,
            20,
            285
        );

        doc.save(`entrada-${entrada.qr.slice(0, 8)}.pdf`);
    }
}
