import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SupabaseService } from './core/services/supabase';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('cine-app');
  private readonly supabase = inject(SupabaseService);

  constructor() {
    this.supabase.client.auth.getSession().then(({ data, error }) => {
      console.log('Supabase conectado', { data, error });
    });
  }
}