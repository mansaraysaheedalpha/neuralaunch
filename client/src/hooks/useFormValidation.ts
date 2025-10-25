// src/hooks/useFormValidation.ts
/**
 * Form Validation Hook
 * 
 * Provides form validation with Zod schemas and user-friendly error messages
 */

import { useState, useCallback, FormEvent } from "react";
import { z } from "zod";

interface ValidationOptions<T> {
  schema: z.ZodObject<z.ZodRawShape>;
  onSubmit: (data: T) => Promise<void> | void;
}

interface ValidationResult<T> {
  values: Partial<T>;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isValid: boolean;
  handleChange: (name: keyof T, value: unknown) => void;
  handleBlur: (name: keyof T) => void;
  handleSubmit: (e: FormEvent) => Promise<void>;
  setError: (name: keyof T, message: string) => void;
  clearError: (name: keyof T) => void;
  reset: () => void;
}

export function useFormValidation<T extends Record<string, unknown>>({
  schema,
  onSubmit,
}: ValidationOptions<T>): ValidationResult<T> {
  const [values, setValues] = useState<Partial<T>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touchedFields, setTouchedFields] = useState<Set<keyof T>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (name: keyof T, value: unknown) => {
      try {
        // Only ZodObject schemas are supported for per-field validation; cast to access .pick
        const objSchema = schema as unknown as z.ZodObject<z.ZodRawShape>;

        if (typeof objSchema.pick === "function") {
          // use pick to build a partial schema for the single field
          const partialSchema = objSchema.pick({ [String(name)]: true } as Record<string, true>);
          partialSchema.parse({ [String(name)]: value } as z.infer<typeof partialSchema>);
        } else {
          // Fallback: try to validate using the field schema directly if accessible
          // Use a typed access to Zod internals to avoid `any`
          const defLike = objSchema as unknown as {
            _def?: { shape?: () => Record<string, z.ZodTypeAny> };
          };
          const shape = defLike._def?.shape?.();
          const fieldSchema = shape ? (shape[String(name)] as z.ZodTypeAny | undefined) : undefined;
          if (fieldSchema) {
            fieldSchema.parse(value);
          }
        }

        // Clear error if validation passes
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
        return true;
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          const firstIssue = err.issues && err.issues[0];
          if (firstIssue) {
            setErrors((prev) => ({
              ...prev,
              [name]: firstIssue.message,
            }));
          }
        }
        return false;
      }
    },
    [schema]
  );

  const handleChange = useCallback(
    (name: keyof T, value: unknown) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      
      // Validate on change if field has been touched
      if (touchedFields.has(name)) {
        validateField(name, value);
      }
    },
    [touchedFields, validateField]
  );

  const handleBlur = useCallback(
    (name: keyof T) => {
      setTouchedFields((prev) => {
        const next = new Set(prev);
        next.add(name);
        return next;
      });

      // Validate the single field on blur if a value exists
      const value = values[name];
      validateField(name, value);
    },
    [validateField, values]
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);

      try {
        // Validate all fields
        const validatedData = schema.parse(values) as T;

        // Clear all errors
        setErrors({});

        // Call onSubmit handler
        await onSubmit(validatedData);
      } catch (err: unknown) {
        if (err instanceof z.ZodError) {
          // Map Zod issues to field errors
          const fieldErrors: Partial<Record<keyof T, string>> = {};
          err.issues.forEach((zodIssue) => {
            const fieldName = zodIssue.path[0] as keyof T;
            if (fieldName && !fieldErrors[fieldName]) {
              fieldErrors[fieldName] = zodIssue.message;
            }
          });
          setErrors(fieldErrors);
        } else {
          // Re-throw non-validation errors
          throw err;
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [schema, values, onSubmit]
  );

  const setError = useCallback((name: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [name]: message }));
  }, []);

  const clearError = useCallback((name: keyof T) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  const reset = useCallback(() => {
    setValues({});
    setErrors({});
    setTouchedFields(new Set());
    setIsSubmitting(false);
  }, []);

  const isValid = Object.keys(errors).length === 0;

  return {
    values,
    errors,
    isSubmitting,
    isValid,
    handleChange,
    handleBlur,
    handleSubmit,
    setError,
    clearError,
    reset,
  };
}
