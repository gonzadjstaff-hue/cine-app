import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CouponsService } from '../../../core/services/coupons';
import { Cupon, DatosCupon } from '../../../core/models/coupon';
import { DatePicker } from '../../../shared/date-picker/date-picker';

@Component({
    selector: 'app-coupon-admin',
    imports: [ReactiveFormsModule, DatePicker],
    templateUrl: './coupon-admin.html',
    styleUrl: './coupon-admin.scss'
})
export class CouponAdmin {
    private readonly fb = inject(FormBuilder);
    private readonly couponsService = inject(CouponsService);

    protected readonly cupones = signal<Cupon[]>([]);
    protected readonly editando = signal<string | null>(null);
    protected readonly error = signal<string | null>(null);
    protected readonly enviando = signal(false);

    protected readonly formulario = this.fb.group({
        codigo: this.fb.nonNullable.control('', [
            Validators.required,
            Validators.pattern(/^[A-Za-z0-9_-]+$/)
        ]),
        descripcion: this.fb.nonNullable.control(''),
        descuento_pct: this.fb.nonNullable.control(10, [
            Validators.required,
            Validators.min(1),
            Validators.max(100)
        ]),
        primera_compra: this.fb.nonNullable.control(false),
        edad_minima: this.fb.control<number | null>(null, Validators.min(0)),
        valido_desde: this.fb.nonNullable.control(''),
        valido_hasta: this.fb.nonNullable.control(''),
        usos_maximos: this.fb.control<number | null>(null, Validators.min(1)),
        activo: this.fb.nonNullable.control(true)
    });

    constructor() {
        this.refrescar().catch((e) => this.error.set((e as Error).message));
    }

    private async refrescar(): Promise<void> {
        this.cupones.set(await this.couponsService.listarTodos());
    }

    protected nuevo(): void {
        this.editando.set(null);
        this.formulario.reset({
            codigo: '',
            descripcion: '',
            descuento_pct: 10,
            primera_compra: false,
            edad_minima: null,
            valido_desde: '',
            valido_hasta: '',
            usos_maximos: null,
            activo: true
        });
    }

    protected editar(cupon: Cupon): void {
        this.editando.set(cupon.id);
        this.formulario.setValue({
            codigo: cupon.codigo,
            descripcion: cupon.descripcion ?? '',
            descuento_pct: Number(cupon.descuento_pct),
            primera_compra: cupon.primera_compra,
            edad_minima: cupon.edad_minima,
            valido_desde: this.aFecha(cupon.valido_desde),
            valido_hasta: this.aFecha(cupon.valido_hasta),
            usos_maximos: cupon.usos_maximos,
            activo: cupon.activo
        });
    }

    protected async guardar(): Promise<void> {
        if (this.formulario.invalid) {
            this.formulario.markAllAsTouched();
            return;
        }

        const v = this.formulario.getRawValue();

        if (v.valido_desde && v.valido_hasta && v.valido_hasta < v.valido_desde) {
            this.error.set('La fecha "hasta" no puede ser anterior a "desde".');
            return;
        }

        this.enviando.set(true);
        this.error.set(null);

        // La vigencia es por dia completo: desde las 00:00 del primer dia
        // hasta las 23:59 del ultimo, en hora local.
        const datos: DatosCupon = {
            codigo: v.codigo,
            descripcion: v.descripcion.trim() || null,
            descuento_pct: v.descuento_pct,
            primera_compra: v.primera_compra,
            edad_minima: v.edad_minima || null,
            valido_desde: v.valido_desde ? new Date(`${v.valido_desde}T00:00`).toISOString() : null,
            valido_hasta: v.valido_hasta
                ? new Date(`${v.valido_hasta}T23:59:59`).toISOString()
                : null,
            usos_maximos: v.usos_maximos || null,
            activo: v.activo
        };

        try {
            await this.couponsService.guardar(datos, this.editando() ?? undefined);
            await this.refrescar();
            this.nuevo();
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.enviando.set(false);
        }
    }

    protected async alternarActivo(cupon: Cupon): Promise<void> {
        this.error.set(null);

        try {
            await this.couponsService.cambiarActivo(cupon.id, !cupon.activo);
            await this.refrescar();

            if (this.editando() === cupon.id) {
                this.formulario.controls.activo.setValue(!cupon.activo);
            }
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    protected condiciones(cupon: Cupon): string {
        const partes: string[] = [];

        if (cupon.primera_compra) {
            partes.push('primera compra');
        }

        if (cupon.edad_minima) {
            partes.push(`+${cupon.edad_minima} años`);
        }

        if (cupon.valido_hasta) {
            partes.push(`hasta ${new Date(cupon.valido_hasta).toLocaleDateString('es-AR')}`);
        }

        partes.push(
            cupon.usos_maximos
                ? `${cupon.usos_realizados}/${cupon.usos_maximos} usos`
                : `${cupon.usos_realizados} usos`
        );

        return partes.join(' · ');
    }

    private aFecha(iso: string | null): string {
        if (!iso) {
            return '';
        }

        const d = new Date(iso);
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
}
