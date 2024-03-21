type StatusCode = number;
export type Detail = {
  loc: string[];
  msg: string;
  type: string;
};

export class APIError extends Error {
  statusCode: StatusCode;
  details: Detail[] | string | null;

  get isApiError(): true {
    return true;
  }

  constructor({
    message,
    status,
    details,
  }: {
    message: string;
    status: StatusCode;
    details?: Detail[];
  }) {
    super(message);

    this.statusCode = status;
    this.details = details || null;
  }
}

export function isApiError(error: unknown): error is APIError {
  return Boolean((error as APIError | undefined)?.isApiError);
}
