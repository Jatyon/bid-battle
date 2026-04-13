import { Route } from '@angular/router';

export interface AppRouteData extends Record<string, unknown> {
  title?: string;
}

export declare interface AppRoute extends Route {
  data?: AppRouteData;
}
