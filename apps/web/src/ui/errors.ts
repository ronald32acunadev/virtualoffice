import { ApiError } from "../api/client";

export type FormError = { field?: string; message: string };

export function toFormError(error: unknown): FormError {
  if (error instanceof ApiError) {
    return error.field ? { field: error.field, message: error.message } : { message: error.message };
  }
  return { message: error instanceof Error ? error.message : "Something went wrong." };
}

export function decisionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return "This request was already handled.";
  return toFormError(error).message;
}
