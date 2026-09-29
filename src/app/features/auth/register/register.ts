import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { DatePicker } from '../../../shared/date-picker/date-picker';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, DatePicker],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  // null mientras se completa el formulario; después, si falta confirmar el mail.
  protected readonly creada = signal<{ confirmar: boolean; email: string } | null>(null);

  protected readonly formulario = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    fechaNacimiento: ['', Validators.required]
  });

  protected async enviar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.error.set(null);

    try {
      const datos = this.formulario.getRawValue();
      const confirmar = await this.auth.registrar(datos);

      // Sin confirmación por mail, signUp deja la sesión abierta: se cierra
      // para que el usuario ingrese desde el botón, como pidió el cliente.
      if (!confirmar) {
        await this.auth.salir();
      }

      this.creada.set({ confirmar, email: datos.email });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.enviando.set(false);
    }
  }
}