import { FormControl, ValidationErrors } from "@angular/forms";

export class FormValidators {

    // whitespace validation

    static notOnlyWhitetSpace(control: FormControl): ValidationErrors{
        // check if the string only has whitespace
        if ((control.value != null) && (control.value.trim().length === 0)){
            // invalid. return error object
            return { 'notOnlyWhiteSpace': true }
        } else {
            return null;
        }
    }
}
