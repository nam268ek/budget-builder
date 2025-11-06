import { Component } from '@angular/core';
import { BudgetBuilderComponent } from './budget-builder/budget-builder.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BudgetBuilderComponent],
  template: `<app-budget-builder />`,
})
export class AppComponent {}
