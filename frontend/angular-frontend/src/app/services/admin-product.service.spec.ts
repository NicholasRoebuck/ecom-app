import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminProduct, AdminProductService } from './admin-product.service';
import { environment } from '../../environments/environment';

describe('AdminProductService', () => {
  let service: AdminProductService;
  let http: HttpTestingController;
  const url = environment['premearAppApiUrl'] + '/admin/products';
  const product: AdminProduct = {id: null, name: 'Glasses', description: '', categoryId: 1, revision: null, variants: []};
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(AdminProductService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uses paged owner-only catalog paths with encoded search', () => {
    service.list('A & B', 2).subscribe();
    const req = http.expectOne(r => r.url === url);
    expect(req.request.params.get('search')).toBe('A & B');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({content: [], page: {number: 2, size: 20, totalPages: 0, totalElements: 0}});
  });
  it('creates with POST and updates with PUT without dropping variant data', () => {
    service.save(product).subscribe();
    const create = http.expectOne(url); expect(create.request.method).toBe('POST'); create.flush({...product, id: 3});
    const saved = {...product, id: 3, revision: 'latest'};
    service.save(saved).subscribe();
    const update = http.expectOne(url + '/3'); expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(saved); update.flush(saved);
  });
  it('includes the revision in deletion requests', () => {
    service.delete({...product, id: 3, revision: 'revision-one'}).subscribe();
    const req = http.expectOne(r => r.url === url + '/3');
    expect(req.request.method).toBe('DELETE'); expect(req.request.params.get('revision')).toBe('revision-one');
    req.flush(null);
  });
});
