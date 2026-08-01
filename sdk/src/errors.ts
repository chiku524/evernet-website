export class EvernetError extends Error {
  readonly status?: number
  readonly body?: unknown

  constructor(message: string, opts?: { status?: number; body?: unknown }) {
    super(message)
    this.name = 'EvernetError'
    this.status = opts?.status
    this.body = opts?.body
  }
}

export class EvernetUnreachableError extends EvernetError {
  constructor(baseUrl: string) {
    super(`Could not reach the Evernet storage API at ${baseUrl}`)
    this.name = 'EvernetUnreachableError'
  }
}
