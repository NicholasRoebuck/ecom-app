import { Component, Input, Output, EventEmitter, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminCategory, AdminProductService } from '../../services/admin-product.service';
@Component({selector:'app-category-editor', standalone:true, imports:[CommonModule, ReactiveFormsModule],
  templateUrl:'./category-editor.component.html', styleUrls:['./admin.css','./category-editor.css']})
export class CategoryEditorComponent {
  @Input() categories: AdminCategory[] = [];
  @Output() saved = new EventEmitter<void>();
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(AdminProductService);
  readonly form = inject(FormBuilder).group({name:['',[Validators.required,Validators.maxLength(255)]],parentId:[null as number|null,Validators.required]});
  selectedDepartmentId: number | null = null;
  get selectedDepartment() { return this.departments.find(c => c.id === this.selectedDepartmentId); }
  get departmentCategories() {
    return this.categories.filter(category => {
      if (category.parentId == null || this.selectedDepartmentId == null) return false;
      const seen = new Set<number>();
      let parentId = category.parentId;
      while (parentId != null && !seen.has(parentId)) {
        if (parentId === this.selectedDepartmentId) return true;
        seen.add(parentId);
        parentId = this.categories.find(c => c.id === parentId)?.parentId ?? null;
      }
      return false;
    });
  }
  selectDepartment(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (!this.canLeave()) { select.value = String(this.selectedDepartmentId ?? ''); return; }
    const id = Number(select.value);
    this.selectedDepartmentId = this.departments.some(c => c.id === id) ? id : null;
    this.open = false; this.current = null; this.form.markAsPristine(); this.error = ''; this.notice = '';
  }
  current: AdminCategory | null = null;
  open = false; busy = false; error = ''; notice = '';
  get departments() { return this.categories.filter(c => c.parentId == null); }
  get unsaved() { return this.busy || (this.open && this.form.dirty); }
  createParent: AdminCategory | null = null;
  label(category: AdminCategory) {
    const parts: string[] = [], seen = new Set<number>();
    let current: AdminCategory | undefined = category;
    while (current && !seen.has(current.id)) {
      seen.add(current.id); parts.unshift(current.name);
      current = this.categories.find(c => c.id === current!.parentId);
    }
    return parts.join(' / ');
  }
  edit(category: AdminCategory | null, parent: AdminCategory | null = null) {
    if (!this.canLeave()) return;
    this.createParent = parent || this.selectedDepartment || null;
    this.current = category; this.open = true; this.error = ''; this.notice = '';
    this.form.reset({name:category?.name || '',parentId:category ? category.parentId : this.createParent?.id ?? null});
    if (category) this.form.controls.parentId.disable(); else this.form.controls.parentId.enable();
  }
  deletionReason(category: AdminCategory): string {
    if (category.parentId == null) return 'Departments cannot be deleted here.';
    if (category.productCount == null || category.childCount == null) return 'Reload categories to check whether this category is empty.';
    if (category.productCount > 0) return 'Move its ' + category.productCount + ' products before deleting.';
    if (category.childCount > 0) return 'Contains ' + category.childCount + ' subcategories. Handle those first.';
    return '';
  }
  deleteCategory(category: AdminCategory) {
    if (this.busy || this.open) return;
    this.error = ''; this.notice = '';
    const reason = this.deletionReason(category);
    if (reason) { this.error = reason; return; }
    if (!window.confirm('Delete the empty category "' + this.label(category) + '"? This cannot be undone.')) return;
    this.busy = true;
    this.api.deleteCategory(category).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy = false; this.notice = 'Category deleted.'; window.dispatchEvent(new Event('catalog-categories-changed')); this.saved.emit(); },
      error: e => { this.busy = false; this.error = e.error?.message || 'Category could not be deleted. Reload categories and try again.'; }
    });
  }
  canLeave() { return !this.busy && (!this.unsaved || window.confirm('Discard your unsaved category changes?')); }
  cancel() { if (this.canLeave()) { this.open=false; this.form.markAsPristine(); this.error=''; } }
  save() {
    if (this.busy) return;
    const value=this.form.getRawValue(), name=(value.name || '').trim();
    if (this.form.invalid || !name) { this.form.markAllAsTouched(); this.error='Enter a name and choose a department.'; return; }
    this.busy=true; this.error='';
    this.api.saveCategory({id:this.current?.id ?? null,name,parentId:value.parentId,originalName:this.current?.name})
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next: () => {
        this.busy=false; this.open=false; this.form.markAsPristine(); this.notice='Category saved.'; window.dispatchEvent(new Event('catalog-categories-changed')); this.saved.emit();
      },error: e => { this.busy=false; this.error=e.error?.message || 'Category could not be saved. Please try again.'; }});
  }
}
