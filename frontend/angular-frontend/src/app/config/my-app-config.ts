import { environment } from '../../environments/environment';

export default {
  auth: {
    domain: environment['auth0Domain'] || "dev-mbfst8h6cbnd24n3.us.auth0.com",
    clientId: environment['auth0ClientId'] || "a2uVG2lteOOUiefIMqLsAZaeTeuEBLrP",
    authorizationParams: {
      redirect_uri: window.location.origin + "/login/callback",
      audience: environment['auth0Audience'] || "http://localhost:8080",
    },
  },
  httpInterceptor: {
    allowedList: [
      environment['premearAppApiUrl'] + '/admin', environment['premearAppApiUrl'] + '/admin/*',
      environment['premearAppApiUrl'] + '/me/orders', environment['premearAppApiUrl'] + '/me/orders/*',
      {uri: environment['premearAppApiUrl'] + '/checkout/review', allowAnonymous: true}
    ],
  },
}
