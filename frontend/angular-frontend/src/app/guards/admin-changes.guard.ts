import { CanDeactivateFn } from '@angular/router';

export const adminChangesGuard: CanDeactivateFn<{canLeave(): boolean}> = component => component.canLeave();
