import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { FormServiceService } from './form-service.service';

describe('FormServiceService', () => {
  let service: FormServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(FormServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
