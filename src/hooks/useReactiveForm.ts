import { useState, useCallback } from "react";
import { isValidPhoneNumber } from "libphonenumber-js";

// ── Types ──────────────────────────────────────────────────────────────────────

type ValidatorFn<T> = (value: T) => Record<string, boolean> | null;

interface FormControlState<T> {
  value: T;
  errors: Record<string, boolean>;
  touched: boolean;
  dirty: boolean;
}

interface FormControlActions<T> {
  setValue: (val: T) => void;
  onBlur: () => void;
  setErrors: (errors: Record<string, boolean>) => void;
  clearValidators: () => void;
  setValidators: (validators: ValidatorFn<T>[]) => void;
}

interface FormFieldInit<TFieldValue> {
  value: TFieldValue;
  validators?: ValidatorFn<TFieldValue>[];
}

type FormConfig<T extends Record<string, unknown>> = {
  [K in keyof T]: FormFieldInit<T[K]>;
};

export interface UseReactiveFormReturn<T extends Record<string, unknown>> {
  controls: {
    [K in keyof T]: FormControlState<T[K]> & FormControlActions<T[K]>;
  };
  valid: boolean;
  value: T;
  errors: Record<string, Record<string, boolean>>;
  touched: boolean;
  dirty: boolean;
  setValue: (values: Partial<T>) => void;
  reset: (values?: T) => void;
  submit: (handler: (values: T) => void) => (e: React.FormEvent) => void;
  validate: () => boolean;
}

// ── Internal state ─────────────────────────────────────────────────────────────

interface FieldInternalState {
  value: unknown;
  errors: Record<string, boolean>;
  touched: boolean;
  dirty: boolean;
  validators: ValidatorFn<unknown>[];
  initialValue: unknown;
}

function buildInitialFields<T extends Record<string, unknown>>(
  config: FormConfig<T>,
): Record<string, FieldInternalState> {
  const initial: Record<string, FieldInternalState> = {};
  for (const key of Object.keys(config) as (keyof T & string)[]) {
    const field = config[key];
    initial[key] = {
      value: field.value,
      errors: {},
      touched: false,
      dirty: false,
      validators: (field.validators ?? []) as ValidatorFn<unknown>[],
      initialValue: field.value,
    };
  }
  return initial;
}

// ── Helper: run validators on a single field ───────────────────────────────────

function runValidators(
  validators: ValidatorFn<unknown>[],
  value: unknown,
): Record<string, boolean> {
  const errors: Record<string, boolean> = {};
  for (const validator of validators) {
    const result = validator(value);
    if (result) {
      Object.assign(errors, result);
    }
  }
  return errors;
}

// ── The hook ───────────────────────────────────────────────────────────────────

export function useReactiveForm<T extends Record<string, unknown>>(
  config: FormConfig<T>,
): UseReactiveFormReturn<T> {
  const keys = Object.keys(config) as (keyof T & string)[];

  const [fields, setFields] = useState<Record<string, FieldInternalState>>(() =>
    buildInitialFields(config),
  );

  // Per-field state & actions getter — recreates on every render (reactive)
  const controls = {} as UseReactiveFormReturn<T>["controls"];

  for (const key of keys) {
    const field = fields[key];
    if (!field) continue;

    const controlKey = key as keyof T;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    controls[controlKey] = {
      value: field.value as T[typeof controlKey],
      errors: field.errors,
      touched: field.touched,
      dirty: field.dirty,

      setValue: (val: T[typeof controlKey]) => {
        setFields((prev) => {
          const field = prev[key];
          const fieldErrors = field?.validators?.length
            ? runValidators(field.validators, val)
            : {};
          return {
            ...prev,
            [key]: { ...field, value: val, dirty: true, errors: fieldErrors } as FieldInternalState,
          };
        });
      },

      onBlur: () => {
        setFields((prev) => {
          const field = prev[key];
          const fieldErrors = field?.validators?.length
            ? runValidators(field.validators, field.value)
            : {};
          return {
            ...prev,
            [key]: { ...field, touched: true, errors: fieldErrors } as FieldInternalState,
          };
        });
      },

      setErrors: (errors: Record<string, boolean>) => {
        setFields((prev) => ({
          ...prev,
          [key]: { ...prev[key], errors } as FieldInternalState,
        }));
      },

      clearValidators: () => {
        setFields((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            validators: [] as ValidatorFn<unknown>[],
          } as FieldInternalState,
        }));
      },

      setValidators: (validators: ValidatorFn<T[typeof controlKey]>[]) => {
        setFields((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            validators: validators as ValidatorFn<unknown>[],
          } as FieldInternalState,
        }));
      },
    };
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const value = {} as T;
  const errors = {} as Record<string, Record<string, boolean>>;
  let formTouched = false;
  let formDirty = false;
  let formValid = true;

  for (const key of keys) {
    const field = fields[key];
    if (!field) continue;

    (value as Record<string, unknown>)[key] = field.value;
    errors[key] = field.errors;

    if (field.touched) formTouched = true;
    if (field.dirty) formDirty = true;
    if (Object.keys(field.errors).length > 0) formValid = false;
  }

  // ── Form-level actions ────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    let allValid = true;
    setFields((prev) => {
      const next: Record<string, FieldInternalState> = {};
      allValid = true;
      for (const k of keys) {
        const f = prev[k];
        if (!f) continue;
        const fieldErrors = runValidators(f.validators, f.value);
        next[k] = { ...f, errors: fieldErrors, touched: true };
        if (Object.keys(fieldErrors).length > 0) allValid = false;
      }
      return next;
    });
    return allValid;
  }, [keys]);

  const setFormValue = useCallback(
    (values: Partial<T>) => {
      setFields((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(values) as (keyof T & string)[]) {
          if (next[k]) {
            const fieldErrors = next[k].validators?.length
              ? runValidators(next[k].validators, values[k])
              : {};
            next[k] = {
              ...next[k],
              value: values[k],
              dirty: true,
              errors: fieldErrors,
            } as FieldInternalState;
          }
        }
        return next;
      });
    },
    [keys],
  );

  const reset = useCallback(
    (values?: T) => {
      if (values) {
        setFields((_prev) => buildInitialFields(config));
        // Override with provided values
        setFields((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(values) as (keyof T & string)[]) {
            if (next[k]) {
              next[k] = {
                ...next[k],
                value: values[k],
                initialValue: values[k],
              } as FieldInternalState;
            }
          }
          return next;
        });
      } else {
        setFields(buildInitialFields(config));
      }
    },
    [config],
  );

  const submit = useCallback(
    (handler: (values: T) => void) => {
      return (e: React.FormEvent) => {
        e.preventDefault();
        // Build current value snapshot + run validation
        let allValid = true;
        const currentValues = {} as Record<string, unknown>;
        const updated: Record<string, FieldInternalState> = {};

        setFields((prev) => {
          allValid = true;
          for (const k of keys) {
            const f = prev[k];
            if (!f) continue;
            const fieldErrors = runValidators(f.validators, f.value);
            updated[k] = { ...f, errors: fieldErrors, touched: true };
            currentValues[k] = f.value;
            if (Object.keys(fieldErrors).length > 0) allValid = false;
          }
          return { ...prev, ...updated };
        });

        if (allValid) {
          handler(currentValues as T);
        }
      };
    },
    [keys],
  );

  return {
    controls,
    valid: formValid,
    value,
    errors,
    touched: formTouched,
    dirty: formDirty,
    setValue: setFormValue,
    reset,
    submit,
    validate,
  };
}

// ── Validator functions ────────────────────────────────────────────────────────

export function required(
  value: unknown,
): Record<string, boolean> | null {
  if (value === null || value === undefined || value === "") {
    return { required: true };
  }
  return null;
}

export function email(
  value: unknown,
): Record<string, boolean> | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(value.trim())) {
    return { email: true };
  }
  return null;
}

export function minLength(
  min: number,
): (value: unknown) => Record<string, boolean> | null {
  return (value: unknown): Record<string, boolean> | null => {
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }
    if (value.trim().length < min) {
      return { minlength: true };
    }
    return null;
  };
}

export function maxLength(
  max: number,
): (value: unknown) => Record<string, boolean> | null {
  return (value: unknown): Record<string, boolean> | null => {
    if (typeof value !== "string") {
      return null;
    }
    if (value.length > max) {
      return { maxlength: true };
    }
    return null;
  };
}

export function pattern(
  regex: RegExp,
  errorKey?: string,
): (value: unknown) => Record<string, boolean> | null {
  return (value: unknown): Record<string, boolean> | null => {
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }
    if (!regex.test(value.trim())) {
      return { [errorKey ?? "pattern"]: true };
    }
    return null;
  };
}

export function phone(
  value: unknown,
): Record<string, boolean> | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  try {
    if (trimmed.startsWith("+")) {
      // International format — detect country from number
      if (!isValidPhoneNumber(trimmed)) {
        return { phone: true };
      }
    } else {
      // Local format — assume Malaysia as default
      if (!isValidPhoneNumber(trimmed, "MY")) {
        return { phone: true };
      }
    }
  } catch {
    return { phone: true };
  }
  return null;
}

export function requiredFile(
  value: unknown,
): Record<string, boolean> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return { requiredFile: true };
  }
  return null;
}
