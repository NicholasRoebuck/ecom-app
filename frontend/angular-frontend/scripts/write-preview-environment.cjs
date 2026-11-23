const fs=require('fs');
const key=process.env.PREVIEW_STRIPE_PUBLISHABLE_KEY || '';
if(key && !key.startsWith('pk_test_')) throw new Error('The preview accepts only a Stripe test publishable key.');
const environment={production:true,preview:true,premearAppApiUrl:'/api',stripePublishableKey:key,
  auth0Domain:process.env.PREVIEW_AUTH0_DOMAIN || 'dev-mbfst8h6cbnd24n3.us.auth0.com',
  auth0ClientId:process.env.PREVIEW_AUTH0_CLIENT_ID || 'a2uVG2lteOOUiefIMqLsAZaeTeuEBLrP',
  auth0Audience:process.env.AUTH0_AUDIENCE || 'http://localhost:8080'};
fs.writeFileSync('src/environments/environment.preview.ts','export const environment = '+JSON.stringify(environment,null,2)+';\n');
