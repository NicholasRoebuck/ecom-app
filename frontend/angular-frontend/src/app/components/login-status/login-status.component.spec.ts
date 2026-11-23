import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject } from 'rxjs';
import { CartService } from '../../services/cart.service';
import { OwnerAccessService } from '../../services/owner-access.service';
import { LoginStatusComponent } from './login-status.component';

describe('Owner navigation', () => {
  it('shows Admin only for a signed-in backend-approved owner', async () => {
    const authenticated = new BehaviorSubject(true);
    const owner = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      declarations: [LoginStatusComponent], imports: [CommonModule, RouterTestingModule],
      providers: [
        {provide: AuthService, useValue: {isAuthenticated$: authenticated, user$: new BehaviorSubject({email: 'test@example.test'})}},
        {provide: OwnerAccessService, useValue: {isOwner$: owner}},
        {provide: CartService, useValue: {clearCart: () => {}}}
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginStatusComponent);
    fixture.detectChanges();
    const hasAdmin = () => Array.from(fixture.nativeElement.querySelectorAll('button'))
      .some((button: any) => button.textContent.trim() === 'Admin');
    expect(hasAdmin()).toBeFalse();
    owner.next(true);
    fixture.detectChanges();
    expect(hasAdmin()).toBeTrue();
    authenticated.next(false);
    fixture.detectChanges();
    expect(hasAdmin()).toBeFalse();
    fixture.destroy();
    sessionStorage.removeItem('userEmail');
  });
});

describe('Responsive account controls', () => {
  async function setup(owner = false) {
    await TestBed.configureTestingModule({declarations:[LoginStatusComponent],imports:[CommonModule,RouterTestingModule],providers:[
      {provide:AuthService,useValue:{isAuthenticated$:new BehaviorSubject(true),user$:new BehaviorSubject({email:'a-very-long-owner-email-address@example.test'})}},
      {provide:OwnerAccessService,useValue:{isOwner$:new BehaviorSubject(owner)}},
      {provide:CartService,useValue:{clearCart:()=>{}}}
    ]}).compileComponents();
    const fixture=TestBed.createComponent(LoginStatusComponent); fixture.detectChanges(); return fixture;
  }
  afterEach(()=>sessionStorage.removeItem('userEmail'));
  it('opens account links and closes with Escape', async () => {
    const fixture=await setup(true), button=fixture.nativeElement.querySelector('.account-toggle');
    expect(button.querySelector('svg')).toBeTruthy(); expect(button.getAttribute('aria-label')).toBe('Account options');
    button.click(); fixture.detectChanges(); expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.account-links').classList.contains('is-open')).toBeTrue();
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false'); fixture.destroy();
  });
  it('closes when clicking outside and offers the regular member links without Admin', async () => {
    const fixture=await setup(); fixture.nativeElement.querySelector('.account-toggle').click(); fixture.detectChanges();
    const labels=Array.from(fixture.nativeElement.querySelectorAll('.account-links button')).map((b:any)=>b.textContent.trim());
    expect(labels).toEqual(['Member','Orders','Logout']);
    document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})); fixture.detectChanges();
    expect(fixture.componentInstance.accountOpen).toBeFalse(); fixture.destroy();
  });
});
