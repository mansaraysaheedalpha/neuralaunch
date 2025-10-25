// src/hooks/useFormValidation.ts
/**
 * Form Validation Hook
 * 
 * Provides form validation with Zod schemas and user-friendly error messages
 */

import { useState, useCallback } from "react";
import { z } from "zod";

interface ValidationOptions<T> {
  schema: z.ZodSchema<T>;
  onSubmit: (data: T) => Promise<void> | void;
}

interface ValidationResult<T> {
  values: Partial<T>;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isValid: boolean;
  handleChange: (name: keyof T, value: unknown) => void;
  handleBlur: (name: keyof T) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
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
        // Validate single field - Using type assertion since we're constructing a valid schema
        const partialSchema = schema.pick({ [name]: true } as Record<keyof T, true>);
        partialSchema.parse({ [name]: value } as Partial<T>);
        
        // Clear error if validation passes
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
        return true;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const firstError = err.errors[0];
          if (firstError) {
            setErrors((prev) => ({
              ...prev,
              [name]: firstError.message,
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
      setTouchedFields((prev) => new Set(prev).add(name));
      validateField(name, values[name]);
    },
    [values, validateField]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);

      try {
        // Validate all fields
        const validatedData = schema.parse(values);
        
        // Clear all errors
        setErrors({});
        
        // Call onSubmit handler
        await onSubmit(validatedData);
      } catch (err) {
        if (err instanceof z.ZodError) {
          // Map Zod errors to field errors
          const fieldErrors: Partial<Record<keyof T, string>> = {};
          err.errors.forEach((zodErr) => {
            const fieldName = zodErr.path[0] as keyof T;
            if (!fieldErrors[fieldName]) {
              fieldErrors[fieldName] = zodErr.message;
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
