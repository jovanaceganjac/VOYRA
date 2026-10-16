import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { TPipe } from './core/i18n/t.pipe';
import { FooterComponent } from './layout/footer';
import { HeaderComponent } from './layout/header';
import { SpinnerComponent } from './shared/components/spinner';
import { ToastComponent } from './shared/components/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastComponent, SpinnerComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
