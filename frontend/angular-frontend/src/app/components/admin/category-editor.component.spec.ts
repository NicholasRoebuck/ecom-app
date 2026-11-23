import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CategoryEditorComponent } from './category-editor.component';
import { AdminProductService } from '../../services/admin-product.service';
describe('Category editor', () => {
  let component: CategoryEditorComponent;
  let api: jasmine.SpyObj<AdminProductService>;
  const child={id:9,name:'Shooting Glasses',parentId:2};
  beforeEach(() => {
    api=jasmine.createSpyObj('AdminProductService',['saveCategory','deleteCategory']);
    api.saveCategory.and.returnValue(of(child));
    TestBed.configureTestingModule({imports:[CategoryEditorComponent],providers:[{provide:AdminProductService,useValue:api}]});
    component=TestBed.createComponent(CategoryEditorComponent).componentInstance;
    component.categories=[{id:2,name:'Vision',parentId:null},child];
  });
  it('renames while preserving the ID and parent and sends the original name', () => {
    const saved=spyOn(component.saved,'emit'); component.edit(child); component.form.patchValue({name:'Sport eyewear'}); component.save();
    expect(api.saveCategory).toHaveBeenCalledWith({id:9,name:'Sport eyewear',parentId:2,originalName:'Shooting Glasses'});
    expect(saved).toHaveBeenCalled(); expect(component.open).toBeFalse();
  });
  it('requires a department and rejects blank names before sending', () => {
    component.edit(null); component.form.patchValue({name:'New category'}); component.save(); expect(api.saveCategory).not.toHaveBeenCalled();
    component.form.patchValue({name:'   ',parentId:2}); component.save(); expect(api.saveCategory).not.toHaveBeenCalled();
  });
  it('adds a category and offers only root departments', () => {
    component.edit(null); component.form.patchValue({name:'  Accessories  ',parentId:2}); component.save();
    expect(api.saveCategory).toHaveBeenCalledWith({id:null,name:'Accessories',parentId:2,originalName:undefined});
    expect(component.departments.length).toBe(1);
  });
  it('shows categories only within the selected department and prefills new categories', () => {
    component.categories.push({id:1,name:'Hearing',parentId:null},{id:3,name:'Hearing aids',parentId:1},{id:10,name:'Lenses',parentId:9});
    component.selectedDepartmentId=2;
    expect(component.departmentCategories.map(c=>c.id)).toEqual([9,10]);
    component.edit(null); expect(component.form.getRawValue().parentId).toBe(2);
  });
  it('preserves unsaved changes when department switching is cancelled', () => {
    component.categories.push({id:1,name:'Hearing',parentId:null}); component.selectedDepartmentId=2;
    component.edit(child); component.form.controls.name.setValue('Draft'); component.form.markAsDirty();
    spyOn(window,'confirm').and.returnValue(false);
    const select=document.createElement('select'); select.innerHTML='<option value="1">Hearing</option><option value="2">Vision</option>'; select.value='1';
    component.selectDepartment({target:select} as unknown as Event);
    expect(component.selectedDepartmentId).toBe(2); expect(select.value).toBe('2'); expect(component.form.value.name).toBe('Draft');
  });
  it('clears the previous editor when switching departments', () => {
    component.categories.push({id:1,name:'Hearing',parentId:null}); component.selectedDepartmentId=2; component.edit(child);
    const select=document.createElement('select'); select.innerHTML='<option value="1">Hearing</option>'; select.value='1';
    component.selectDepartment({target:select} as unknown as Event);
    expect(component.selectedDepartment?.name).toBe('Hearing'); expect(component.open).toBeFalse();
  });
  it('keeps edits available when saving fails', () => {
    api.saveCategory.and.returnValue(throwError(() => ({error:{message:'Category changed. Reload first.'}})));
    component.edit(child); component.form.patchValue({name:'Updated'}); component.save();
    expect(component.open).toBeTrue(); expect(component.busy).toBeFalse(); expect(component.error).toContain('Reload');
  });
  it('creates a subcategory under the chosen category rather than the department', () => {
    component.selectedDepartmentId=2; component.edit(null,child); component.form.patchValue({name:'Replacement lenses'}); component.save();
    expect(api.saveCategory).toHaveBeenCalledWith({id:null,name:'Replacement lenses',parentId:9,originalName:undefined});
  });
  it('blocks deletion of departments and categories with products or children', () => {
    const confirm=spyOn(window,'confirm');
    for(const category of [{...child,productCount:1,childCount:0},{...child,productCount:0,childCount:1},{...child,parentId:null,productCount:0,childCount:0}]) component.deleteCategory(category);
    expect(confirm).not.toHaveBeenCalled(); expect(api.deleteCategory).not.toHaveBeenCalled();
  });
  it('confirms empty-category deletion and refreshes the category list', () => {
    api.deleteCategory.and.returnValue(of(undefined)); spyOn(window,'confirm').and.returnValue(true);
    const saved=spyOn(component.saved,'emit'), empty={...child,productCount:0,childCount:0};
    component.deleteCategory(empty); expect(api.deleteCategory).toHaveBeenCalledWith(empty); expect(saved).toHaveBeenCalled();
  });
  it('does not delete after cancellation and shows server conflicts', () => {
    const confirm=spyOn(window,'confirm').and.returnValue(false), empty={...child,productCount:0,childCount:0};
    component.deleteCategory(empty); expect(api.deleteCategory).not.toHaveBeenCalled();
    confirm.and.returnValue(true); api.deleteCategory.and.returnValue(throwError(()=>({error:{message:'Products were added. Move them first.'}})));
    component.deleteCategory(empty); expect(component.busy).toBeFalse(); expect(component.error).toContain('Move them');
  });
});
