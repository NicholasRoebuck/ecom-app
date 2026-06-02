import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { FormServiceService } from '../../services/form-service.service';
import { Country } from '../../common/country';
import { State } from '../../common/state';
import { FormValidators } from '../../validators/form-validators';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { Router } from '@angular/router';
import { Order } from '../../common/order';
import { OrderItem } from '../../common/order-item';
import { Purchase } from '../../common/purchase';
import { Customer } from '../../common/customer';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit {

  // FormGroup is a collection of form elements or other FormGorups
  checkoutFormGroup: FormGroup;

  totalPrice: number = 0;
  totalQuantity: number = 0;

  creditCardYears: number[] = [];
  creditCardMonths: number[] = [];

  countries: Country[] = [];

  shippingAddressStates: State[] = [];
  billingAddressStates: State[] = [];

  constructor(private formBuilder: FormBuilder,
    private formService: FormServiceService,
    private cartService: CartService,
    private checkoutService: CheckoutService,
    private router: Router
  ) { }


  ngOnInit(): void {

    this.reviewCartDetails();

    this.checkoutFormGroup = this.formBuilder.group({
      customer: this.formBuilder.group({
        firstName: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        lastName: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        email: new FormControl('', [Validators.required,
        Validators.pattern('^[a-z0-9._%+-]+@[a-z0-9._-]+\\.[a-z]{2,4}$')]),
      }),
      shippingAddress: this.formBuilder.group({
        street: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        city: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        state: new FormControl('', [Validators.required]),
        country: new FormControl('', [Validators.required]),
        zipCode: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace])
      }),
      billingAddress: this.formBuilder.group({
        street: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        city: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        state: new FormControl('', [Validators.required]),
        country: new FormControl('', [Validators.required]),
        zipCode: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace])
      }),
      creditCard: this.formBuilder.group({
        cardType: new FormControl('', [Validators.required]),
        cardOwner: new FormControl('', [Validators.required, Validators.minLength(2), FormValidators.notOnlyWhitetSpace]),
        cardNumber: new FormControl('', [Validators.pattern('[0-9]{16}'), Validators.required]),
        securityCode: new FormControl('', [Validators.pattern('[0-9]{3}'), Validators.required]), // bug here.when exceeding the pattern length, the error shows again. 
        expirationMonth: [''],
        expirationYear: [''],
      })
    });

    // populate the credit card year and month properties
    const startMonth: number = new Date().getMonth() + 1; // months are zero based
    console.log(`Start Month=${startMonth}`);
    this.retrieveCreditCardMonths(startMonth);

    this.formService.getCreditCardYears().subscribe(
      data => {
        console.log("Retieved the credit card years: " + JSON.stringify(data));
        this.creditCardYears = data;
      });

    // populate countries property
    this.formService.getCountries().subscribe(
      data => {
        console.log("retrieved countrie: " + JSON.stringify(data));
        this.countries = data;
      }
    );

    // populate states property
    // this.formService.getStates().subscribe
  }

  reviewCartDetails() {
    // subcribe to cartService.totalQuantity
    this.cartService.totalQuantity.subscribe(
      totalQuantity => this.totalQuantity = totalQuantity
    );

    // subcribe to cartService.totalPrice
    this.cartService.totalPrice.subscribe(
      totalPrice => this.totalPrice = totalPrice
    );
  }

  get firstName() { return this.checkoutFormGroup.get('customer.firstName'); }
  get lastName() { return this.checkoutFormGroup.get('customer.lastName'); }
  get email() { return this.checkoutFormGroup.get('customer.email'); }
  get shippingAddressStreet() { return this.checkoutFormGroup.get('shippingAddress.street'); }
  get shippingAddressCity() { return this.checkoutFormGroup.get('shippingAddress.city'); }
  get shippingAddressState() { return this.checkoutFormGroup.get('shippingAddress.state'); }
  get shippingAddressCountry() { return this.checkoutFormGroup.get('shippingAddress.country'); }
  get shippingAddressZipcode() { return this.checkoutFormGroup.get('shippingAddress.zipCode'); }
  get billingAddressStreet() { return this.checkoutFormGroup.get('billingAddress.street'); }
  get billingAddressCity() { return this.checkoutFormGroup.get('billingAddress.city'); }
  get billingAddressState() { return this.checkoutFormGroup.get('billingAddress.state'); }
  get billingAddressCountry() { return this.checkoutFormGroup.get('billingAddress.country'); }
  get billingAddressZipcode() { return this.checkoutFormGroup.get('billingAddress.zipCode'); }
  get creditCardType() { return this.checkoutFormGroup.get('creditCard.cardType'); }
  get creditCardOwner() { return this.checkoutFormGroup.get('creditCard.cardOwner'); }
  get creditCardNumber() { return this.checkoutFormGroup.get('creditCard.cardNumber'); }
  get creditCardSecurityCode() { return this.checkoutFormGroup.get('creditCard.securityCode'); }
  get creditCardExpirationMonth() { return this.checkoutFormGroup.get('creditCard.expirationMonth'); }// not using these yet but I might need them later
  get creditCardExpirationYear() { return this.checkoutFormGroup.get('creditCard.expirationYear'); }


  



  copyShippingAddressToBillingAddress(event) {
    if (event.target.checked) {
      this.checkoutFormGroup.controls['billingAddress'].setValue(this.checkoutFormGroup.controls['shippingAddress'].value);

      // this will assign state field to billingAddress
      this.billingAddressStates = this.shippingAddressStates;
    } else {
      this.checkoutFormGroup.controls['billingAddress'].reset();

      // clear billing address
      this.billingAddressStates = [];
    }

    // this will make sure that state field is copied to billingAddress
    this.billingAddressStates = this.shippingAddressStates;
  }

  onSubmit() {
    console.log("Hanlding the form submit button");

    if (this.checkoutFormGroup.invalid) {
      this.checkoutFormGroup.markAllAsTouched();
      return;
    }

    // set up the order
    let order = new Order();
    order.totalPrice = this.totalPrice;
    order.totalQuantity = this.totalQuantity;

    // get the cart items
    const cartItems = this.cartService.cartItems;

    // create orderItems from the cartItems
    // let orderItems: OrderItem[] = [];
    // for(let i=0; i < cartItems.length; i++){
    //   orderItems[i] = new OrderItem(cartItems[i]);
    // }

    // shorter way to fill array with orderItems
    let orderItems: OrderItem[] = cartItems.map(tempCartItem => new OrderItem(tempCartItem))

    // set up purchase
    let purchase = new Purchase();

    // purchase shipping address
    purchase.shippingAddress = this.checkoutFormGroup.controls['shippingAddress'].value;
    const shippingAddressState: State = JSON.parse(JSON.stringify(purchase.shippingAddress.state));
    const shippingAddressCountry: Country = JSON.parse(JSON.stringify(purchase.shippingAddress.country));
    purchase.shippingAddress.state = shippingAddressState.name;
    purchase.shippingAddress.country = shippingAddressCountry.name;

    // purchase customer
    purchase.customer = this.checkoutFormGroup.controls['customer'].value;

    // purchase billing address
    purchase.billingAddress = this.checkoutFormGroup.controls['billingAddress'].value;
    const billingAddressState: State = JSON.parse(JSON.stringify(purchase.billingAddress.state));
    const billingAddressCountry: Country = JSON.parse(JSON.stringify(purchase.billingAddress.country));
    purchase.billingAddress.state = billingAddressState.name;
    purchase.billingAddress.country = billingAddressCountry.name;
    
    // populate purchase 
    purchase.order = order;
    purchase.orderItems = orderItems;


    // call api via checkout service
    this.checkoutService.placeOrder(purchase).subscribe(
      {
        next: response => {
          alert(`Your order has been recieved.\nOrder tracking number: ${response.orderTrackingNumber}`)
          this.resetCart();
        },
        error: err => {
          alert(`There was an error: ${err.message} `)
        }
      }
    );

  }

  resetCart() {
    // reset cart data
    this.cartService.cartItems = [];
    this.cartService.totalPrice.next(0);
    this.cartService.totalQuantity.next(0);

    // reset form data
    this.checkoutFormGroup.reset();

    // navigate to main products page
    this.router.navigateByUrl("/prpducts");
  }

  handleMonthsAndYears() {
    const creditCardFormGroup = this.checkoutFormGroup.get('creditCard');

    const currectYear: number = new Date().getFullYear();

    const selectedYear: number = Number(creditCardFormGroup.value.expirationYear);

    // if the current year is the selected year, start with current month
    let startMonth: number;

    if (currectYear === selectedYear) {
      startMonth = new Date().getMonth() + 1;
    } else {
      startMonth = 1;
    }
    this.retrieveCreditCardMonths(startMonth);
  }

  retrieveCreditCardMonths(startMonth) {
    this.formService.getCreditCardMonths(startMonth).subscribe(
      data => {
        console.log("Retrieved the credit card months: " + JSON.stringify(data));
        this.creditCardMonths = data;
      });
  }

  getStates(formGroupName: string) {
    const formGroup = this.checkoutFormGroup.get(formGroupName);

    const countryCode = formGroup.value.country.code;
    const countryName = formGroup.value.country.name;

    console.log(`${formGroupName} country code: ${countryCode}`);
    console.log(`${formGroupName} country name: ${countryName}`);

    this.formService.getStates(countryCode).subscribe(
      data => {
        if (formGroupName === 'shippingAddress') {
          this.shippingAddressStates = data;
        } else {
          this.billingAddressStates = data;
        }

        // select first item by default
        formGroup.get('state').setValue(data[0])
      }
    );

  }
}
