export default {
  auth: {
    domain: "dev-mbfst8h6cbnd24n3.us.auth0.com",
    clientId: "a2uVG2lteOOUiefIMqLsAZaeTeuEBLrP",
    authorizationParams: {
      redirect_uri: "http://localhost:4200/login/callback",
      audience: "http://localhost:8080",
    },
  },
  httpInterceptor: {
    allowedList: [
      'http://localhost:8080/api/orders/**',
      'http://localhost:8080/api/checkout/purchase'
    ],
  },
}
